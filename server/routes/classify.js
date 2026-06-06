import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { auth } from '../auth.js';
import { broadcastToCenter } from '../ws.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors server.js — keep in sync. Env wins; fallback resolves relative to repo root.
const RECORDINGS_DIR =
  process.env.RECORDINGS_DIR ||
  path.resolve(__dirname, '..', '..', 'recordings');

const STT_SERVICE_URL = process.env.STT_SERVICE_URL || '';
const STT_TIMEOUT_MS = parseInt(process.env.STT_TIMEOUT_MS || '120000', 10);
const HAIKU_MODEL = process.env.HAIKU_MODEL || 'claude-haiku-4-5-20251001';
const HAIKU_TIMEOUT_MS = parseInt(process.env.HAIKU_TIMEOUT_MS || '20000', 10);

let _anthropic = null;
function getAnthropic() {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: HAIKU_TIMEOUT_MS,
    maxRetries: 1,
  });
  return _anthropic;
}

// 6단계 카테고리. customers.status 와 calls.result 양쪽 호환.
const VALID_CATEGORIES = new Set(['invalid', 'dormant', 'no_answer', 'reject', 'recall', 'positive']);

// Haiku 4.5 공식 단가 (per million tokens, USD). 단가 변경 시 여기 한 줄 갱신.
const HAIKU_PRICING = {
  input:        1.00,  // $1.00 / M input tokens
  output:       5.00,  // $5.00 / M output tokens
  cache_read:   0.10,  // $0.10 / M cache-read tokens
  cache_create: 1.25,  // $1.25 / M cache-create tokens (5m TTL)
};

function computeHaikuCost(usage) {
  const u = usage || {};
  const i  = (u.input_tokens || 0)             * HAIKU_PRICING.input        / 1_000_000;
  const o  = (u.output_tokens || 0)            * HAIKU_PRICING.output       / 1_000_000;
  const cr = (u.cache_read_input_tokens || 0)  * HAIKU_PRICING.cache_read   / 1_000_000;
  const cc = (u.cache_creation_input_tokens || 0) * HAIKU_PRICING.cache_create / 1_000_000;
  return +(i + o + cr + cc).toFixed(8);
}

const SYSTEM_PROMPT = `너는 한국어 텔레마케팅 통화 STT 텍스트를 분류하고 상담원에게 피드백을 주는 분석기다.

카테고리 6종:
  - invalid    : 결번/없는 번호 (안내멘트/연결음만)
  - dormant    : 휴면 사용자 (수신 거부/오랜 미사용 의사)
  - no_answer  : 부재중 (연결됐으나 응답 없음/짧은 미수신)
  - reject     : 거절 (관심 없음 명확히 표현)
  - recall     : 재콜 요청 (지금 안 됨/나중에 다시)
  - positive   : 긍정 (관심 있음, 주소/계좌/상담 요청 등)

출력은 JSON 한 줄. 반드시 다음 키:
  category: 위 6개 중 하나
  confidence: 0.0~1.0
  recall_at: ISO8601 또는 null (recall 일 때 통화에서 추론한 시간)
  positive_signals: 문자열 배열 또는 null (positive 추론 근거 키워드)
  summary: 한 문장 한국어 요약 (30자 이내)

  // === 통화 요약 (카톡/갤럭시식) — 상담원이 통화 안 듣고도 한눈에 ===
  summary_lines: 통화 흐름 요약 배열 2~4줄 (각 줄 60자 이내, 시간순 핵심 흐름).
                 예: ["상담원이 신규 이벤트 안내", "고객이 기존 A사 이용 중이라 답함", "오후 2시 재통화 희망"]
                 통화 내용이 거의 없으면(부재/결번) 빈 배열 [].
  key_points: 통화에서 뽑은 핵심 포인트 배열 0~5개 (각 40자 이내). 고객의 요청·상태·중요정보 위주.
              예: ["오후 2시 재콜 요청", "기존 A사 이용중", "가입의사 있음"]. 없으면 [].
  next_action: 상담원이 다음에 할 일 한 줄 (40자 이내) 또는 null.
               예: "5/22 14:00 재콜", "계좌번호 문자 발송", "관심없음 — 종결"

  // === 5/26 biplays spec 추가 ===
  rejection_reason: 거절/욕 시 사유 분류 (null 또는 다음 중 1개):
                    "관심없음" / "금액부담" / "시간없음" / "이미가입" / "욕설" / "기타"
  rejection_excerpt: 거절/욕 발화 직접 인용 (STT 의 해당 문장 그대로, 100자 이내) 또는 null
  rejection_trigger: 거절 직전 상담원 멘트 (STT 에서 추출, 100자 이내) 또는 null
                     — 어떤 구간/멘트가 거절을 유발했는지 추적용
  swear_detected: true/false — 욕설/막말 포함 여부
  suggested_replies: 거절 발생 시 상담원이 사용할 수 있는 대안 표현 1~3개 배열 또는 null
                     (한 줄당 25자 이내, 한국어, 텔레마케팅 톤. 예: "그러시군요, 그럼 5분만 들어보실래요?")

JSON 외 다른 글자 금지. 마크다운 금지.`;

async function callSTT(absPath) {
  if (!STT_SERVICE_URL) throw new Error('STT_SERVICE_URL not set');
  const buf = await fs.promises.readFile(absPath);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), path.basename(absPath));
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), STT_TIMEOUT_MS);
  try {
    const r = await fetch(`${STT_SERVICE_URL.replace(/\/+$/, '')}/transcribe`, {
      method: 'POST',
      body: fd,
      signal: ac.signal,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`STT HTTP ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    if (!j.ok) throw new Error(`STT failed: ${j.error || 'unknown'}`);
    return j; // {ok, text, duration_sec, language, ...}
  } finally {
    clearTimeout(t);
  }
}

async function callHaiku(stt_text, callMeta) {
  const client = getAnthropic();
  if (!client) throw new Error('ANTHROPIC_API_KEY not set');
  const userMsg = [
    `통화 메타: 길이=${callMeta.duration_sec || 0}s, 시각=${callMeta.started_at || 'unknown'}`,
    `STT 텍스트:`,
    `"""`,
    stt_text || '(빈 텍스트)',
    `"""`,
  ].join('\n');

  const t0 = Date.now();
  const resp = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 800,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  const latency_ms = Date.now() - t0;
  const text = (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  // strip ``` fences just in case
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new Error(`Haiku returned non-JSON: ${text.slice(0, 200)}`);
  }
  return { parsed, usage: resp.usage || {}, latency_ms };
}

// ── 로컬 규칙 기반 텍스트 분류 및 요약 엔진 (비용 0) ──
function parseRecallTime(text) {
  const now = new Date();
  let base = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST 보정
  let hour = 14; // 기본값 오후 2시
  let addDays = 0;

  if (text.includes('내일')) {
    addDays = 1;
  } else if (text.includes('모레')) {
    addDays = 2;
  } else if (text.includes('월요일')) {
    const day = base.getDay();
    addDays = day === 0 ? 1 : 8 - day;
  } else if (text.includes('화요일')) {
    const day = base.getDay();
    addDays = day === 2 ? 7 : (2 - day + 7) % 7;
  } else if (text.includes('수요일')) {
    const day = base.getDay();
    addDays = day === 3 ? 7 : (3 - day + 7) % 7;
  } else if (text.includes('목요일')) {
    const day = base.getDay();
    addDays = day === 4 ? 7 : (4 - day + 7) % 7;
  } else if (text.includes('금요일')) {
    const day = base.getDay();
    addDays = day === 5 ? 7 : (5 - day + 7) % 7;
  }

  const pmMatch = /오후\s*(\d+)시/.exec(text);
  const amMatch = /오전\s*(\d+)시/.exec(text);
  const genericMatch = /(\d+)시/.exec(text);

  if (pmMatch) {
    hour = parseInt(pmMatch[1], 10);
    if (hour < 12) hour += 12;
  } else if (amMatch) {
    hour = parseInt(amMatch[1], 10);
  } else if (genericMatch) {
    const h = parseInt(genericMatch[1], 10);
    hour = (h >= 1 && h <= 8) ? h + 12 : h;
  }

  const targetDate = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);
  targetDate.setUTCHours(hour - 9, 0, 0, 0); // KST -> UTC
  return targetDate.toISOString();
}

function localClassify(text, duration) {
  const t = text || '';
  let category = 'no_answer';
  let confidence = 0.85;
  let recall_at = null;
  let positive_signals = [];
  let summary = '';
  let summary_lines = [];
  let key_points = [];
  let next_action = '';
  
  let rejection_reason = null;
  let rejection_excerpt = null;
  let rejection_trigger = null;
  let swear_detected = false;
  let suggested_replies = [];

  // 1. 비속어 검사
  const swearWords = ['시발', '개새끼', '꺼져', '지랄', '조까', '미친', '닥쳐', '쌍놈'];
  for (const sw of swearWords) {
    if (t.includes(sw)) {
      swear_detected = true;
      rejection_reason = '욕설';
      const sentences = t.split(/[.?!]/);
      rejection_excerpt = sentences.find(s => s.includes(sw))?.trim().slice(0, 100) || sw;
      break;
    }
  }

  // 2. 단어 패턴 세분화 매칭 및 스코어링
  const invalidKeywords = ['없는 번호', '결번', '수신이 불가능', '전화기가 꺼져', '연락이 되지 않아', '고객께서 전화를', '소리바리', '신호가 가지 않아', '수신 거부 등록'];
  const positiveKeywords = ['가입', '해보죠', '주소', '계좌', '알겠습니다', '이벤트 참여', '신청', '등록', '좋습니다', '괜찮네요', '동의', '사인', '안내장'];
  const rejectKeywords = ['관심없', '바쁩', '생각없', '안해', '안해요', '끊어', '필요없', '사절', '거부', '광고', '스팸', '다시는 전화', '삭제해'];
  const recallKeywords = ['나중에', '이따가', '내일', '오후', '다시 걸어', '다시 전화', '운전', '회의', '바빠서', '시간 될 때', '다시 연락', '다음에'];

  let invalidScore = 0;
  let positiveScore = 0;
  let rejectScore = 0;
  let recallScore = 0;

  invalidKeywords.forEach(k => { if (t.includes(k)) invalidScore += 3; });
  positiveKeywords.forEach(k => { if (t.includes(k)) positiveScore += 2; });
  rejectKeywords.forEach(k => { if (t.includes(k)) rejectScore += 2; });
  recallKeywords.forEach(k => { if (t.includes(k)) recallScore += 2; });

  if (duration < 5 && t.length < 5) {
    category = 'no_answer';
  } else if (invalidScore > 0) {
    category = 'invalid';
  } else if (recallScore > rejectScore && recallScore > positiveScore) {
    category = 'recall';
    recall_at = parseRecallTime(t);
  } else if (rejectScore > positiveScore) {
    category = 'reject';
    rejection_reason = swear_detected ? '욕설' : '관심없';
  } else if (positiveScore > 0) {
    category = 'positive';
  } else {
    if (duration >= 90) category = 'positive';
    else if (duration >= 30) {
      category = 'recall';
      recall_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    else category = 'reject';
  }

  // 3. 정밀 요약 및 피드백 템플릿 생성
  if (category === 'invalid') {
    summary = '결번 또는 기계음 안내멘트 수신';
    key_points = ['수신 불가능 안내멘트가 검출됨'];
    next_action = '결번 처리 — 데이터베이스 즉시 격리';
  } else if (category === 'no_answer') {
    summary = '고객 무응답 또는 부재';
    key_points = ['연결되었으나 유의미한 응답 음성이 없음'];
    next_action = '부재 처리 (다음 영업일 자동 배정)';
  } else if (category === 'reject') {
    summary = '고객이 가입 및 안내 권유 거부';
    if (!rejection_excerpt) {
      const match = rejectKeywords.find(k => t.includes(k));
      if (match) {
        const idx = t.indexOf(match);
        rejection_excerpt = t.slice(Math.max(0, idx - 10), Math.min(t.length, idx + 15)).trim();
      }
    }
    key_points = swear_detected ? ['고객의 거친 비속어 표출'] : ['안내 서비스 거부 및 관심 없음 표시'];
    next_action = swear_detected ? '수신 거부(DNC) 영구 등록' : '거절 처리 — 상담 종결';
    suggested_replies = swear_detected 
      ? ['불편을 드려 죄송합니다. 종료하겠습니다.'] 
      : ['아, 바쁘신 시간에 죄송합니다.', '단 1분만으로 혜택 안내가 완료됩니다.'];
  } else if (category === 'recall') {
    summary = '고객이 시간 부재로 재통화 요청';
    const match = recallKeywords.find(k => t.includes(k));
    let excerpt = match || '나중에 다시';
    key_points = [`고객 재통화 의사 표시 (${excerpt})`];
    next_action = '캘린더에 재콜 예약 등록';
    suggested_replies = ['어느 시간대가 통화하기 편하십니까?', '내일 오전 중에 다시 연락드리겠습니다.'];
  } else if (category === 'positive') {
    summary = '이벤트 가입 및 추가 상담 긍정 수락';
    const signals = positiveKeywords.filter(k => t.includes(k));
    positive_signals = signals.length > 0 ? signals : ['가입의사'];
    key_points = ['고객이 상세 가입 조건 동의함', ...signals.map(s => `핵심어휘: [${s}] 감지`)];
    next_action = '가입 확인용 SMS 가이드 즉시 전송';
  }

  // 4. 통화 흐름 요약 조립
  if (t.trim().length > 0) {
    const sentences = t.split(/[.?!]/).map(s => s.trim()).filter(Boolean);
    if (sentences.length > 0) {
      summary_lines.push(`상담원이 이벤트/서비스 가입 안내 시도`);
      const keySentences = sentences.filter(s => 
        positiveKeywords.some(k => s.includes(k)) || 
        rejectKeywords.some(k => s.includes(k)) || 
        recallKeywords.some(k => s.includes(k))
      );
      if (keySentences.length > 0) {
        summary_lines.push(`고객: "${keySentences[0].slice(0, 50)}"`);
      } else {
        summary_lines.push(`고객: "${sentences[sentences.length - 1].slice(0, 50)}"`);
      }
      summary_lines.push(`상담원 최종 진단 결과: [${category === 'positive' ? '긍정' : category === 'recall' ? '재콜' : '거절'}] 처리`);
    }
  } else {
    summary_lines = ['통화 녹음 음성 없음 또는 분석 텍스트 공백'];
  }

  return {
    category,
    confidence,
    recall_at,
    positive_signals,
    summary,
    summary_lines,
    key_points,
    next_action,
    rejection_reason,
    rejection_excerpt,
    rejection_trigger: null,
    swear_detected,
    suggested_replies
  };
}

// duration-only fallback (legacy mock) — kept so the endpoint never goes silent
// when STT or Haiku is unavailable. Logged and surfaced via fallback_reason.
function durationFallback(dur) {
  if (dur >= 90) return { category: 'positive', confidence: 0.55, recall_at: null };
  if (dur >= 30) {
    return {
      category: 'recall',
      confidence: 0.5,
      recall_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  return { category: 'reject', confidence: 0.5, recall_at: null };
}

// POST /api/classify/:call_id
// 풀 체인: 녹음 → tm-stt → Haiku → DB. 단계별 실패 시 fallback (mock duration).
export async function runClassificationInternal(call_id) {
  let fallback_reason = null;
  let stt_text = null;
  let stt_meta = null;

  const call = await query(
    `SELECT id, duration_sec, customer_id, started_at FROM calls WHERE id=$1`,
    [call_id]
  );
  if (call.rows.length === 0) throw new Error('Call not found');
  const c = call.rows[0];
  const dur = c.duration_sec || 0;

  // 1) 녹음 path 조회
  const rec = await query(
    `SELECT id, file_path FROM recordings WHERE call_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [call_id]
  );
  const recRow = rec.rows[0];

  // 2) STT
  if (recRow && recRow.file_path && STT_SERVICE_URL) {
    const abs = path.join(RECORDINGS_DIR, recRow.file_path);
    if (fs.existsSync(abs)) {
      try {
        stt_meta = await callSTT(abs);
        stt_text = stt_meta.text || '';
      } catch (e) {
        fallback_reason = `stt_failed: ${e.message}`;
        console.error('[classify] STT failed:', e.message);
      }
    } else {
      fallback_reason = 'recording_file_missing';
    }
  } else if (!recRow) {
    fallback_reason = 'no_recording_row';
  } else if (!STT_SERVICE_URL) {
    fallback_reason = 'stt_url_unset';
  }

  // 3) Classifier (Local or Haiku)
  let parsed = null;
  let haikuMeta = null; // { usage, latency_ms }
  const useLocal = process.env.USE_LOCAL_CLASSIFIER === 'true' || !process.env.ANTHROPIC_API_KEY;

  if (stt_text !== null) {
    if (useLocal) {
      try {
        const t0 = Date.now();
        parsed = localClassify(stt_text, dur);
        const latency_ms = Date.now() - t0;
        haikuMeta = { usage: { input_tokens: 0, output_tokens: 0 }, latency_ms };
      } catch (e) {
        fallback_reason = (fallback_reason ? fallback_reason + '; ' : '') + `local_classify_failed: ${e.message}`;
        console.error('[classify] Local classify failed:', e.message);
      }
    } else {
      try {
        const r = await callHaiku(stt_text, { duration_sec: dur, started_at: c.started_at });
        parsed = r.parsed;
        haikuMeta = { usage: r.usage, latency_ms: r.latency_ms };
      } catch (e) {
        fallback_reason = (fallback_reason ? fallback_reason + '; ' : '') + `haiku_failed: ${e.message}`;
        console.error('[classify] Haiku failed:', e.message);
      }
    }
  }

  // 3.5) AI usage 기록 (Haiku 호출 성공 시만)
  if (haikuMeta && !useLocal) {
    try {
      const u = haikuMeta.usage || {};
      const cost = computeHaikuCost(u);
      await query(
        `INSERT INTO ai_usage
          (call_id, model, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, cost_usd, latency_ms)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          call_id,
          HAIKU_MODEL,
          u.input_tokens || 0,
          u.output_tokens || 0,
          u.cache_read_input_tokens || 0,
          u.cache_creation_input_tokens || 0,
          cost,
          haikuMeta.latency_ms,
        ]
      );
    } catch (e) {
      console.error('[classify] ai_usage insert failed:', e.message);
    }
  }

  // 4) Fallback if any step missing
  if (!parsed) {
    const fb = durationFallback(dur);
    parsed = {
      category: fb.category,
      confidence: fb.confidence,
      recall_at: fb.recall_at,
      positive_signals: null,
      summary: `[fallback] duration=${dur}s`,
    };
  }

  // Defensive normalize
  let category = String(parsed.category || '').toLowerCase();
  if (!VALID_CATEGORIES.has(category)) category = 'no_answer';
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  const recall_at = parsed.recall_at || null;
  const positive_signals = Array.isArray(parsed.positive_signals)
    ? parsed.positive_signals.slice(0, 10)
    : null;
  const summary = (parsed.summary || '').slice(0, 200) || null;
  const summary_lines = Array.isArray(parsed.summary_lines)
    ? parsed.summary_lines.slice(0, 4).map((s) => String(s).slice(0, 80)).filter(Boolean)
    : [];
  const key_points = Array.isArray(parsed.key_points)
    ? parsed.key_points.slice(0, 5).map((s) => String(s).slice(0, 60)).filter(Boolean)
    : [];
  const next_action = (parsed.next_action || '').toString().slice(0, 80) || null;
  const rejection_reason = parsed.rejection_reason || null;
  const rejection_excerpt = (parsed.rejection_excerpt || '').slice(0, 200) || null;
  const rejection_trigger = (parsed.rejection_trigger || '').slice(0, 200) || null;
  const swear_detected = !!parsed.swear_detected;
  const suggested_replies = Array.isArray(parsed.suggested_replies)
    ? parsed.suggested_replies.slice(0, 3).map(s => String(s).slice(0, 60))
    : null;

  const final_stt_text = stt_text !== null ? stt_text : `[mock STT] duration=${dur}s — ${fallback_reason || 'fallback'}`;

  // 5) Persist (upsert by call_id)
  const analysis_meta = {
    rejection_reason,
    rejection_excerpt,
    rejection_trigger,
    swear_detected,
    suggested_replies,
    positive_signals,
    summary,
    summary_lines,
    key_points,
    next_action,
  };
  await query(`DELETE FROM call_classifications WHERE call_id=$1`, [call_id]);
  await query(
    `INSERT INTO call_classifications
      (call_id, stt_text, ai_category, ai_confidence, recall_time, analysis_meta)
      VALUES ($1, $2, $3, $4, $5, $6)`,
    [call_id, final_stt_text, category, confidence, recall_at, JSON.stringify(analysis_meta)]
  );

  // 6) Customer status sync (상담원 수동 피드 보호 및 교차 검증)
  if (c.customer_id) {
    const callResultCheck = await query(
      `SELECT result FROM calls WHERE id=$1`,
      [call_id]
    );
    const manualResult = callResultCheck.rows[0]?.result;
    const isManualFeedDefined = ['positive', 'reject', 'recall', 'invalid', 'done'].includes(manualResult);

    if (!isManualFeedDefined) {
      if (category === 'positive') {
        await query(`UPDATE customers SET status='positive', updated_at=NOW() WHERE id=$1`, [c.customer_id]);
      } else if (category === 'recall') {
        await query(
          `UPDATE customers SET status='recall', recall_at=$1, updated_at=NOW() WHERE id=$2`,
          [recall_at, c.customer_id]
        );
      } else if (category === 'invalid') {
        await query(`UPDATE customers SET status='invalid', updated_at=NOW() WHERE id=$1`, [c.customer_id]);
      } else if (category === 'dormant') {
        await query(
          `UPDATE customers SET status='dormant', dormant_since=NOW(), updated_at=NOW() WHERE id=$1`,
          [c.customer_id]
        );
      } else if (category === 'no_answer') {
        await query(
          `UPDATE customers SET no_answer_count = COALESCE(no_answer_count,0)+1, updated_at=NOW() WHERE id=$1`,
          [c.customer_id]
        );
      }
    } else {
      console.log(`[classify] Manual result '${manualResult}' wins. Automatic status skip for customer_id=${c.customer_id}`);
    }
  }

  // 웹 브라우저 콘솔(AgentView)에 실시간으로 자동 기재 완료 신호 전송
  broadcastToCenter(c.center_id, {
    type: 'classification_done',
    call_id: call_id,
    customer_id: c.customer_id,
    category: category,
    summary: summary,
    analysis_meta: analysis_meta
  });

  return {
    ok: true,
    ai_category: category,
    ai_confidence: confidence,
    recall_time: recall_at,
    stt_text: final_stt_text,
    summary,
    summary_lines,
    key_points,
    next_action,
    positive_signals,
    rejection_reason,
    rejection_excerpt,
    rejection_trigger,
    swear_detected,
    suggested_replies,
    fallback_reason,
    stt_meta: stt_meta
      ? {
          duration_sec: stt_meta.duration_sec,
          wall_sec: stt_meta.wall_sec,
          language: stt_meta.language,
          model: stt_meta.model,
        }
      : null,
  };
}

router.post('/:call_id', auth, async (req, res) => {
  try {
    const result = await runClassificationInternal(+req.params.call_id);
    res.json(result);
  } catch (e) {
    console.error('[classify] fatal:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/classify/:call_id — unchanged
router.get('/:call_id', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM call_classifications WHERE call_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [+req.params.call_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No classification' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
