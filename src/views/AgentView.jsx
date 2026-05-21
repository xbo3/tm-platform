import { useEffect, useRef, useState, useCallback } from 'react';
import { get, post, put } from '../api.js';
import { Led, fmtTime } from '../components/widgets.jsx';
import { useConsoleWs } from '../hooks/useConsoleWs.js';

const RESULT_OPTS = [
  { v: 'connected', label: '연결', color: 'var(--info)' },
  { v: 'signup', label: '긍정', color: 'var(--accent)' },
  { v: 'callback', label: '재콜', color: 'var(--purple)' },
  { v: 'rejected', label: '거절', color: 'var(--text-dim)' },
  { v: 'no_answer', label: '부재', color: 'var(--warn)' },
  { v: 'invalid', label: '결번', color: 'var(--neg)' },
];
const RESULT_LABEL = Object.fromEntries(RESULT_OPTS.map(r => [r.v, r.label]));
const RESULT_COLOR = Object.fromEntries(RESULT_OPTS.map(r => [r.v, r.color]));

const STATUS_LABEL = {
  pending: '대기', retry: '재시도', calling: '통화중', done: '완료',
  positive: '긍정', recall: '재콜', reject: '거절', rejected: '거절',
  invalid: '결번', no_answer: '부재', dormant: '휴면', signup: '가입',
};
const STATUS_COLOR = {
  pending: 'var(--text-dim)', retry: 'var(--info)', calling: 'var(--pos)',
  done: 'var(--text-faint)', positive: 'var(--accent)', signup: 'var(--accent)',
  recall: 'var(--purple)', reject: 'var(--text-dim)', rejected: 'var(--text-dim)',
  invalid: 'var(--neg)', no_answer: 'var(--warn)', dormant: 'var(--text-faint)',
};

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const maskPhone = (p) => p ? p.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3') : '';

// 카드 (상단 KPI 6칸)
function KpiCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: '10px 12px', minHeight: 64 }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AgentView({ user }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [assigned, setAssigned] = useState([]);   // 내 할당 번호 (pending/retry 위주)
  const [recalls, setRecalls] = useState([]);     // 내 재콜 예약
  const [callState, setCallState] = useState('idle'); // idle | ringing | connected
  const [cur, setCur] = useState(null);
  const [callId, setCallId] = useState(null);
  const [timer, setTimer] = useState(0);
  const [memo, setMemo] = useState('');
  const [wsErr, setWsErr] = useState(null);

  // 다이얼패드 (모달)
  const [dialOpen, setDialOpen] = useState(false);
  const [dialInput, setDialInput] = useState('');

  // 오토콜 — 통화 종료 후 10~30초 랜덤 자동 NEXT
  const [autoCallOn, setAutoCallOn] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(0); // 남은 초
  const autoTimerRef = useRef(null);
  const autoIntervalRef = useRef(null);

  // STT/분류 (마지막 종료된 통화의 결과)
  const [lastClassify, setLastClassify] = useState(null);
  const [classifying, setClassifying] = useState(false);

  const tRef = useRef();
  const curRef = useRef(null);
  useEffect(() => { curRef.current = cur; }, [cur]);

  const refresh = async () => {
    try {
      const [s, h, all] = await Promise.all([
        get('/agent/me'),
        get('/agent/history'),
        get('/customers?limit=300'),
      ]);
      setStats(s);
      setHistory(h);
      // 할당 번호: 상태가 pending/retry 우선, 그 외 진행기록도 같이 노출
      const sortKey = (c) => (c.status === 'retry' ? 0 : c.status === 'pending' ? 1 : 2);
      const sorted = [...all].sort((a, b) => sortKey(a) - sortKey(b) || a.id - b.id);
      setAssigned(sorted);
      // 재콜 예약: recall_at 있는 것 시간순
      const r = all
        .filter(c => c.recall_at)
        .sort((a, b) => new Date(a.recall_at) - new Date(b.recall_at))
        .slice(0, 5);
      setRecalls(r);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);

  // 통화 타이머
  useEffect(() => {
    if (callState === 'connected') tRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    else clearInterval(tRef.current);
    return () => clearInterval(tRef.current);
  }, [callState]);

  // 오토콜 카운트다운 해제 (수동 next/idle 진입 시)
  const cancelAutoCall = useCallback(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    autoTimerRef.current = null;
    autoIntervalRef.current = null;
    setAutoCountdown(0);
  }, []);

  const onWsEvent = useCallback((msg) => {
    switch (msg.type) {
      case 'dial_started':
        setCallId(msg.callId);
        if (msg.manual) {
          setCur({ id: null, name: '수동 발신', phone_number: msg.phone, manual: true });
        } else if (msg.phone && curRef.current) {
          setCur({ ...curRef.current, phone_number: msg.phone });
        }
        setCallState('ringing');
        break;
      case 'call_state':
        if (msg.state === 'ringing') setCallState('ringing');
        else if (msg.state === 'offhook') setCallState('connected');
        else if (msg.state === 'idle') {
          if (typeof msg.duration === 'number') setTimer(msg.duration);
        }
        break;
      case 'dial_ack':
        if (msg.ok === false) {
          setWsErr(msg.error || 'dial_failed');
          setCallState('idle');
          setCur(null);
          setCallId(null);
        }
        break;
      case 'error':
        setWsErr(msg.error || 'ws_error');
        if (msg.error === 'already_locked' || msg.error === 'device offline' || msg.error === 'customer_id required') {
          setCallState('idle');
          setCur(null);
          setCallId(null);
        }
        break;
      default: break;
    }
  }, []);
  const { connected: wsConnected, deviceOnline, sendDial, sendManualDial } = useConsoleWs({ onEvent: onWsEvent });

  const dialManual = () => {
    setWsErr(null);
    if (!wsConnected) { window.alert('서버 연결 끊김 — 재연결 시도 중'); return; }
    if (!deviceOnline) { window.alert('폰이 오프라인 상태입니다'); return; }
    const digits = dialInput.replace(/[^0-9*#]/g, '');
    if (digits.length < 3) { window.alert('번호를 3자리 이상 입력하세요'); return; }
    cancelAutoCall();
    setCallState('ringing');
    const ok = sendManualDial(digits);
    if (!ok) {
      setWsErr('ws_send_failed');
      setCallState('idle');
    } else {
      setTimer(0); setMemo('');
      setDialInput('');
      setDialOpen(false);
    }
  };

  const dialKey = (k) => setDialInput(p => (p + k).slice(0, 20));
  const dialBack = () => setDialInput(p => p.slice(0, -1));
  const dialClear = () => setDialInput('');

  const next = useCallback(async () => {
    setWsErr(null);
    cancelAutoCall();
    if (!wsConnected) { window.alert('서버 연결 끊김 — 재연결 시도 중'); return; }
    if (!deviceOnline) { window.alert('폰이 오프라인 상태입니다'); return; }
    try {
      const c = await post('/calls/next', {});
      if (!c || !c.id) { window.alert('대기 없음'); return; }
      setCur(c);
      setTimer(0); setMemo('');
      setCallState('ringing');
      const ok = sendDial(c.id);
      if (!ok) {
        setWsErr('ws_send_failed');
        setCallState('idle');
        setCur(null);
      }
    } catch (e) {
      window.alert('대기 없음');
    }
  }, [wsConnected, deviceOnline, sendDial, cancelAutoCall]);

  // 오토콜 트리거 — 통화 idle 진입 + autoCallOn 일 때
  const scheduleAutoCall = useCallback(() => {
    if (!autoCallOn) return;
    cancelAutoCall();
    const wait = 10 + Math.floor(Math.random() * 21); // 10~30초
    setAutoCountdown(wait);
    autoIntervalRef.current = setInterval(() => {
      setAutoCountdown(p => Math.max(0, p - 1));
    }, 1000);
    autoTimerRef.current = setTimeout(() => {
      cancelAutoCall();
      next();
    }, wait * 1000);
  }, [autoCallOn, cancelAutoCall, next]);

  const finish = async (result) => {
    if (!callId) {
      // 종료 only — 콜 상태 리셋
      setCallState('idle'); setCur(null); setCallId(null);
      return;
    }
    setClassifying(true);
    try {
      await put(`/calls/${callId}/end`, { result, duration_sec: timer, memo });
      // 분류 호출 — STT/Haiku 결과 표시
      try {
        const cls = await post(`/classify/${callId}`, {});
        setLastClassify(cls);
      } catch { setLastClassify(null); }
      setCallState('idle');
      setCur(null);
      setCallId(null);
      refresh();
      // 오토콜
      scheduleAutoCall();
    } catch (e) { window.alert(e.message); }
    finally { setClassifying(false); }
  };

  const endCallOnly = () => {
    // 종료 버튼 — 결과 미지정. no_answer 로 기본 처리
    finish('no_answer');
  };

  // autoCallOn off 시 즉시 취소
  useEffect(() => { if (!autoCallOn) cancelAutoCall(); }, [autoCallOn, cancelAutoCall]);
  useEffect(() => () => cancelAutoCall(), [cancelAutoCall]);

  const s = stats || { total_calls: 0, connected: 0, signup: 0, no_answer: 0, invalid: 0, rejected: 0, callback: 0, talk_time: 0, pending: 0 };

  const remainCount = assigned.filter(c => c.status === 'pending' || c.status === 'retry').length;

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      gap: 10,
      padding: 12,
      height: 'calc(100vh - 56px)',
      boxSizing: 'border-box',
    }}>
      {/* ─── 상단 KPI 6칸 ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <KpiCard label="긍정" value={s.signup} color="var(--accent)" sub={`전체 ${s.total_calls}건 중`} />
        <KpiCard label="가입" value={s.signup} color="var(--pos)" sub="확정 완료" />
        <KpiCard label="재콜" value={s.callback} color="var(--purple)" sub={`예약 ${recalls.length}건`} />
        <KpiCard label="당일 콜수" value={s.total_calls} color="var(--info)" />
        <KpiCard label="당일 연결" value={s.connected} color="var(--pos)" sub={s.total_calls > 0 ? `${((s.connected / s.total_calls) * 100).toFixed(1)}%` : '0%'} />
        <KpiCard label="통화시간" value={fmtTime(s.talk_time || 0)} color="var(--text)" />
      </div>

      {/* ─── 하단 2단 ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gap: 10,
        minHeight: 0,
      }}>
        {/* ── 좌: 내 할당 번호 + 재콜 예약 ── */}
        <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 10, minHeight: 0 }}>
          {/* 내 할당 번호 */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid var(--border-soft)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>내 할당 번호</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                  {remainCount} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-dim)' }}>남음</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setDialOpen(true)}
                  style={{
                    padding: '6px 10px', fontSize: 11, fontWeight: 500,
                    background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 5, color: 'var(--text-dim)', cursor: 'pointer',
                  }}>다이얼</button>
                <button
                  onClick={next}
                  disabled={callState !== 'idle'}
                  style={{
                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                    background: callState === 'idle' ? 'var(--info)' : 'var(--info-soft)',
                    border: '1px solid var(--info)', borderRadius: 5,
                    color: callState === 'idle' ? '#fff' : 'var(--info)',
                    cursor: callState === 'idle' ? 'pointer' : 'not-allowed',
                  }}>NEXT</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {assigned.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)', fontSize: 12 }}>
                  할당된 번호가 없습니다
                </div>
              )}
              {assigned.map(c => (
                <div key={c.id} style={{
                  padding: '7px 12px',
                  borderBottom: '1px solid var(--border-soft)',
                  fontSize: 12,
                  background: cur && cur.id === c.id ? 'var(--info-soft)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{c.phone_number}</span>
                    <span className="tag" style={{
                      fontSize: 9, padding: '1px 5px',
                      background: (STATUS_COLOR[c.status] || 'var(--text-dim)') + '22',
                      color: STATUS_COLOR[c.status] || 'var(--text-dim)',
                    }}>{STATUS_LABEL[c.status] || c.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                    <span>{c.name || '이름없음'}{c.list_title ? ` · ${c.list_title}` : ''}</span>
                    {c.memo && <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.memo}>📝 {c.memo}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 내 재콜 예약 */}
          <div className="card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>내 재콜 예약</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--purple)' }}>{recalls.length}건</span>
            </div>
            {recalls.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0' }}>예약 없음</div>
            )}
            {recalls.slice(0, 3).map(c => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, padding: '4px 0',
                borderBottom: '1px solid var(--border-soft)',
              }}>
                <span className="mono" style={{ color: 'var(--text)' }}>{c.phone_number}</span>
                <span className="mono" style={{ color: 'var(--purple)' }}>
                  {c.recall_at ? new Date(c.recall_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 우: 통화 화면 + STT + 오토콜 ── */}
        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 10, minHeight: 0 }}>
          {/* 우 상단 — 통화 화면 */}
          <div className="card" style={{
            padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 11 }}>
              <Led color={wsConnected ? 'var(--pos)' : 'var(--neg)'} size={6} />
              <span style={{ color: 'var(--text-dim)' }}>서버</span>
              <span style={{ fontWeight: 600, color: wsConnected ? 'var(--pos)' : 'var(--neg)' }}>{wsConnected ? 'connected' : 'offline'}</span>
              <span style={{ color: 'var(--text-faint)' }}>·</span>
              <Led color={deviceOnline ? 'var(--pos)' : 'var(--warn)'} size={6} />
              <span style={{ color: 'var(--text-dim)' }}>폰</span>
              <span style={{ fontWeight: 600, color: deviceOnline ? 'var(--pos)' : 'var(--warn)' }}>{deviceOnline ? 'online' : 'waiting'}</span>
              {wsErr && <span style={{ color: 'var(--neg)', marginLeft: 8 }}>⚠ {wsErr}</span>}
            </div>

            {callState === 'idle' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 8 }}>READY</div>
                <div className="mono" style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                  {autoCallOn && autoCountdown > 0
                    ? <>오토콜 — <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{autoCountdown}초</span> 후 자동 발신</>
                    : '좌측 NEXT 또는 다이얼 버튼'}
                </div>
              </div>
            )}

            {(callState === 'ringing' || callState === 'connected') && cur && (
              <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  {cur.phone_number}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
                  {cur.name || '이름없음'}{cur.is_test && <span className="tag warn" style={{ marginLeft: 6 }}>SAMPLE</span>}
                </div>

                <div className="mono" style={{
                  fontSize: 36, fontWeight: 600,
                  color: callState === 'ringing' ? 'var(--info)' : 'var(--pos)',
                  marginBottom: 14,
                  animation: callState === 'ringing' ? 'pulse-ring 1.4s infinite' : 'none',
                }}>
                  {callState === 'ringing' ? 'CALLING…' : fmtClock(timer)}
                </div>

                <textarea
                  rows={2}
                  placeholder="메모…"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  style={{ width: '100%', resize: 'none', marginBottom: 10, fontSize: 12 }}
                />

                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => finish('signup')} className="btn"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)', padding: '7px 16px', fontWeight: 600 }}>긍정</button>
                  <button onClick={() => finish('callback')} className="btn"
                    style={{ borderColor: 'var(--purple)', color: 'var(--purple)', padding: '7px 16px', fontWeight: 600 }}>재콜</button>
                  <button onClick={endCallOnly} className="btn"
                    style={{ borderColor: 'var(--text-dim)', color: 'var(--text-dim)', padding: '7px 16px', fontWeight: 600 }}>종료</button>
                  <button onClick={() => finish('rejected')} className="btn"
                    style={{ borderColor: 'var(--text-dim)', color: 'var(--text-dim)', padding: '7px 12px' }}>거절</button>
                  <button onClick={() => finish('invalid')} className="btn"
                    style={{ borderColor: 'var(--neg)', color: 'var(--neg)', padding: '7px 12px' }}>결번</button>
                </div>
              </div>
            )}
          </div>

          {/* 우 중단 — STT / 분류 */}
          <div className="card" style={{ padding: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>
                STT / 자동 분류 (Haiku 4.5)
              </span>
              {classifying && <span style={{ fontSize: 10, color: 'var(--info)' }}>분석 중…</span>}
              {lastClassify && lastClassify.ai_category && (
                <span className="tag" style={{
                  fontSize: 10, padding: '2px 8px',
                  background: (STATUS_COLOR[lastClassify.ai_category] || 'var(--text-dim)') + '22',
                  color: STATUS_COLOR[lastClassify.ai_category] || 'var(--text-dim)',
                }}>
                  {STATUS_LABEL[lastClassify.ai_category] || lastClassify.ai_category}
                  {lastClassify.ai_confidence ? ` · ${Math.round(lastClassify.ai_confidence * 100)}%` : ''}
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', fontSize: 12, lineHeight: 1.5 }}>
              {callState !== 'idle' && (
                <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', padding: '12px 0' }}>
                  통화 중… 종료 후 녹음 → STT (faster-whisper) → Haiku 4.5 분류
                </div>
              )}
              {callState === 'idle' && !lastClassify && (
                <div style={{ color: 'var(--text-faint)', padding: '12px 0' }}>
                  최근 분석 결과 없음. 통화 종료 시 자동으로 표시됩니다.
                </div>
              )}
              {callState === 'idle' && lastClassify && (
                <>
                  {lastClassify.summary && (
                    <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 5, color: 'var(--text)' }}>
                      📌 {lastClassify.summary}
                    </div>
                  )}
                  {lastClassify.stt_text && (
                    <div style={{ color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>
                      {lastClassify.stt_text}
                    </div>
                  )}
                  {lastClassify.positive_signals && lastClassify.positive_signals.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {lastClassify.positive_signals.map((sg, i) => (
                        <span key={i} className="tag" style={{
                          fontSize: 10, padding: '2px 6px',
                          background: 'var(--accent-soft)', color: 'var(--accent)',
                        }}>{sg}</span>
                      ))}
                    </div>
                  )}
                  {lastClassify.recall_time && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--purple)' }}>
                      🔁 재콜 예약: {new Date(lastClassify.recall_time).toLocaleString('ko-KR')}
                    </div>
                  )}
                  {lastClassify.fallback_reason && (
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--warn)' }}>
                      fallback: {lastClassify.fallback_reason}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 우 하단 — 오토콜 토글 */}
          <div className="card" style={{
            padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 2 }}>오토콜</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                통화 종료 후 10~30초 랜덤 자동 다음 콜
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {autoCallOn && autoCountdown > 0 && (
                <span className="mono" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                  {autoCountdown}s
                </span>
              )}
              <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 22 }}>
                <input
                  type="checkbox"
                  checked={autoCallOn}
                  onChange={e => setAutoCallOn(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: autoCallOn ? 'var(--pos)' : 'var(--border)',
                  borderRadius: 22, transition: '0.2s',
                }} />
                <span style={{
                  position: 'absolute',
                  height: 16, width: 16, left: autoCallOn ? 24 : 4, top: 3,
                  background: '#fff', borderRadius: '50%', transition: '0.2s',
                }} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 다이얼패드 모달 */}
      {dialOpen && (
        <div onClick={() => setDialOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{
            padding: 20, minWidth: 280, maxWidth: 320,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12, letterSpacing: '0.06em' }}>
              수동 발신 (큐 우회)
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 6, marginBottom: 10,
            }}>
              <input
                value={dialInput}
                onChange={e => setDialInput(e.target.value.replace(/[^0-9*#]/g, '').slice(0, 20))}
                placeholder="010-XXXX-XXXX"
                className="mono"
                style={{
                  flex: 1, fontSize: 16, letterSpacing: '0.05em',
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text)', textAlign: 'center',
                }}
                autoFocus
              />
              <button type="button" onClick={dialBack} style={{
                width: 28, height: 28, padding: 0,
                border: '1px solid var(--border)', background: 'transparent',
                borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer',
              }}>⌫</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
                <button key={k} type="button" onClick={() => dialKey(k)} className="mono"
                  style={{
                    padding: '10px 0', fontSize: 18, fontWeight: 600,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
                  }}>{k}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={dialClear} style={{
                width: 64, padding: '9px 0', fontSize: 12,
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-dim)', cursor: 'pointer',
              }}>지움</button>
              <button type="button" onClick={() => setDialOpen(false)} style={{
                padding: '9px 12px', fontSize: 12,
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-dim)', cursor: 'pointer',
              }}>닫기</button>
              <button type="button" onClick={dialManual}
                disabled={dialInput.replace(/[^0-9*#]/g, '').length < 3}
                style={{
                  flex: 1, padding: '9px 0', fontSize: 14, fontWeight: 600,
                  background: dialInput.replace(/[^0-9*#]/g, '').length >= 3 ? 'var(--pos)' : 'var(--pos-soft)',
                  border: '1px solid var(--pos)', borderRadius: 6,
                  color: dialInput.replace(/[^0-9*#]/g, '').length >= 3 ? '#fff' : 'var(--pos)',
                  cursor: dialInput.replace(/[^0-9*#]/g, '').length >= 3 ? 'pointer' : 'not-allowed',
                }}>발신</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
