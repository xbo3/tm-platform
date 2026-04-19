import { useEffect, useRef, useState } from 'react';
import { get, post, put } from '../api.js';
import { Led, Bar, Stat, fmtTime } from '../components/widgets.jsx';

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

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function AgentView({ user }) {
  const [stats, setStats] = useState(null);
  const [team, setTeam] = useState([]);
  const [history, setHistory] = useState([]);
  const [callState, setCallState] = useState('idle'); // idle | ringing | connected
  const [cur, setCur] = useState(null);
  const [callId, setCallId] = useState(null);
  const [timer, setTimer] = useState(0);
  const [memo, setMemo] = useState('');
  const [recallTime, setRecallTime] = useState('');
  const tRef = useRef();

  const refresh = async () => {
    try {
      const [s, t, h] = await Promise.all([
        get('/agent/me'), get('/agent/team'), get('/agent/history'),
      ]);
      setStats(s); setTeam(t); setHistory(h);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (callState === 'connected') tRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    else clearInterval(tRef.current);
    return () => clearInterval(tRef.current);
  }, [callState]);

  const next = async () => {
    try {
      const c = await post('/calls/next', {});
      setCur(c);
      setCallState('ringing');
      setTimer(0); setMemo(''); setRecallTime('');
      const r = await post('/calls/start', { customer_id: c.id });
      setCallId(r.call_id);
      setTimeout(() => setCallState('connected'), 1200);
    } catch (e) {
      window.alert('대기 없음');
    }
  };

  const finish = async (result) => {
    if (!callId) return;
    try {
      await put(`/calls/${callId}/end`, { result, duration_sec: timer, memo });
      // mock 분류 호출 (실제 STT 연동 전)
      try { await post(`/classify/${callId}`, {}); } catch {}
      setCallState('idle');
      setCur(null);
      setCallId(null);
      refresh();
    } catch (e) { window.alert(e.message); }
  };

  const s = stats || { total_calls: 0, connected: 0, signup: 0, no_answer: 0, invalid: 0, rejected: 0, callback: 0, talk_time: 0, pending: 0 };
  const me = user.agent_name;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 320px', gap: 14, padding: 16, height: 'calc(100vh - 56px)' }}>

      {/* LEFT — 내 통계 + 팀 */}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          <Stat label="콜" value={s.total_calls} color="var(--info)" />
          <Stat label="연결" value={s.connected} color="var(--pos)" />
          <Stat label="긍정" value={s.signup} color="var(--accent)" />
        </div>

        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10 }}>분포</div>
          {[
            { l: '연결', v: s.connected, c: 'var(--pos)' },
            { l: '긍정', v: s.signup, c: 'var(--accent)' },
            { l: '재콜', v: s.callback, c: 'var(--purple)' },
            { l: '거절', v: s.rejected, c: 'var(--text-dim)' },
            { l: '부재', v: s.no_answer, c: 'var(--warn)' },
            { l: '결번', v: s.invalid, c: 'var(--neg)' },
          ].map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <Led color={x.c} size={5} />
              <span style={{ width: 28, fontSize: 11, color: 'var(--text-dim)' }}>{x.l}</span>
              <div style={{ flex: 1 }}>
                <Bar pct={s.total_calls > 0 ? (x.v / s.total_calls) * 100 : 0} color={x.c} h={4} />
              </div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: x.c, width: 24, textAlign: 'right' }}>{x.v}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10 }}>팀 랭킹</div>
          {team.map((t, i) => {
            const isMe = t.agent_name === me;
            return (
              <div key={t.agent_name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 4, background: isMe ? 'var(--info-soft)' : 'transparent', marginBottom: 2 }}>
                <span className="mono" style={{ width: 16, fontSize: 11, color: i === 0 ? 'var(--accent)' : 'var(--text-faint)' }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 12 }}>{t.name}</span>
                {isMe && <span className="tag info" style={{ fontSize: 9 }}>ME</span>}
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: isMe ? 'var(--info)' : 'var(--text-dim)' }}>{t.total_calls}</span>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-dim)' }}>잔여 큐</span>
          <span className="mono" style={{ color: s.pending < 30 ? 'var(--neg)' : 'var(--text)', fontWeight: 600 }}>{s.pending}건</span>
        </div>
      </div>

      {/* CENTER — Dialer */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>

        {callState === 'idle' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16, letterSpacing: '0.05em' }}>READY</div>
            <button onClick={next} style={{
              width: 160, height: 160, borderRadius: '50%',
              border: '2px solid var(--info)', background: 'var(--info-soft)',
              color: 'var(--info)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}>NEXT CALL</button>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14 }}>대기 {s.pending}건</div>
          </div>
        )}

        {(callState === 'ringing' || callState === 'connected') && cur && (
          <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <div style={{
              width: 140, height: 140, borderRadius: '50%', margin: '0 auto 18px',
              border: `2px solid ${callState === 'ringing' ? 'var(--info)' : 'var(--pos)'}`,
              background: callState === 'ringing' ? 'var(--info-soft)' : 'var(--pos-soft)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              animation: callState === 'ringing' ? 'pulse-ring 1.4s infinite' : 'none',
            }}>
              {callState === 'ringing'
                ? <span style={{ fontSize: 13, color: 'var(--info)', fontWeight: 600 }}>CALLING…</span>
                : (
                  <>
                    <span className="mono" style={{ fontSize: 28, fontWeight: 600, color: 'var(--pos)' }}>{fmtClock(timer)}</span>
                    <span style={{ fontSize: 10, color: 'var(--pos)', marginTop: 4 }}>CONNECTED</span>
                  </>
                )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>{cur.name || '이름 없음'}</div>
              <div className="mono" style={{ fontSize: 14, color: 'var(--text-dim)' }}>{cur.phone_number}</div>
              {cur.is_test && <span className="tag warn" style={{ marginTop: 6, display: 'inline-block' }}>SAMPLE</span>}
            </div>

            {callState === 'connected' && (
              <>
                <textarea
                  rows={2}
                  placeholder="메모…"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  style={{ width: '100%', resize: 'none', marginBottom: 10 }}
                />

                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {RESULT_OPTS.map(r => (
                    <button key={r.v}
                      onClick={() => finish(r.v)}
                      className="btn"
                      style={{ borderColor: r.color, color: r.color, padding: '7px 14px' }}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* RIGHT — Call Log */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>최근 통화 ({history.length})</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {history.map(h => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Led color={RESULT_COLOR[h.result] || 'var(--text-dim)'} size={5} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{h.name || '이름없음'}</span>
                </div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {h.time ? new Date(h.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="mono" style={{ color: 'var(--text-dim)' }}>{h.phone}</span>
                  <span className="tag" style={{ background: (RESULT_COLOR[h.result] || 'var(--text-dim)') + '22', color: RESULT_COLOR[h.result] || 'var(--text-dim)' }}>
                    {RESULT_LABEL[h.result] || h.result || '-'}
                  </span>
                </div>
                {h.duration > 0 && <span className="mono" style={{ color: 'var(--text-faint)' }}>{fmtClock(h.duration)}</span>}
              </div>
            </div>
          ))}
          {history.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>기록 없음</div>}
        </div>
        <div style={{ paddingTop: 10, borderTop: '1px solid var(--border-soft)', fontSize: 11, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
          <span>총 {history.length}건</span>
          <span>통화 {fmtTime(history.reduce((s, h) => s + (h.duration || 0), 0))}</span>
        </div>
      </div>
    </div>
  );
}
