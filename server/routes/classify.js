import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { auth } from '../auth.js';
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

const SYSTEM_PROMPT = `너는 한국어 텔레마케팅 통화 STT 텍스트를 6단계로 분류하는 분류기다.
카테고리:
  - invalid    : 결번/없는 번호 (안내멘트/연결음만)
  - dormant    : 휴면 사용자 (수신 거부/오랜 미사용 의사)
  - no_answer  : 부재중 (연결됐으나 응답 없음/짧은 미수신)
  - reject     : 거절 (관심 없음 명확히 표현)
  - recall     : 재콜 요청 (지금 안 됨/나중에 다시)
  - positive   : 긍정 (관심 있음, 주소/계좌/상담 요청 등)

출력은 JSON 한 줄. 반드시 다음 키:
  category: 위 6개 중 하나
  confidence: 0.0~1.0 (네 확신도)
  recall_at: ISO8601 또는 null. recall 일 때 통화에서 추론한 시간 (예 "내일 오후 2시" → 다음날 14:00)
  positive_signals: 문자열 배열 또는 null. positive 일 때 추론 근거 키워드 ["주소문의","계좌질문" 등]
  summary: 한 문장 한국어 요약 (30자 이내)

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

  const resp = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 500,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
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
  return parsed;
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
router.post('/:call_id', auth, async (req, res) => {
  const call_id = +req.params.call_id;
  let fallback_reason = null;
  let stt_text = null;
  let stt_meta = null;

  try {
    const call = await query(
      `SELECT id, duration_sec, customer_id, started_at FROM calls WHERE id=$1`,
      [call_id]
    );
    if (call.rows.length === 0) return res.status(404).json({ error: 'Call not found' });
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

    // 3) Haiku
    let parsed = null;
    if (stt_text !== null) {
      try {
        parsed = await callHaiku(stt_text, { duration_sec: dur, started_at: c.started_at });
      } catch (e) {
        fallback_reason = (fallback_reason ? fallback_reason + '; ' : '') + `haiku_failed: ${e.message}`;
        console.error('[classify] Haiku failed:', e.message);
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

    const final_stt_text = stt_text !== null ? stt_text : `[mock STT] duration=${dur}s — ${fallback_reason || 'fallback'}`;

    // 5) Persist (upsert by call_id)
    await query(`DELETE FROM call_classifications WHERE call_id=$1`, [call_id]);
    await query(
      `INSERT INTO call_classifications
        (call_id, stt_text, ai_category, ai_confidence, recall_time)
        VALUES ($1, $2, $3, $4, $5)`,
      [call_id, final_stt_text, category, confidence, recall_at]
    );

    // 6) Customer status sync
    if (c.customer_id) {
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
    }

    res.json({
      ok: true,
      ai_category: category,
      ai_confidence: confidence,
      recall_time: recall_at,
      stt_text: final_stt_text,
      summary,
      positive_signals,
      fallback_reason,
      stt_meta: stt_meta
        ? {
            duration_sec: stt_meta.duration_sec,
            wall_sec: stt_meta.wall_sec,
            language: stt_meta.language,
            model: stt_meta.model,
          }
        : null,
    });
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
