import { useEffect, useState } from 'react';
import { get } from '../api.js';
import { Led, Stat } from '../components/widgets.jsx';

export default function LeadMonitorView({ user }) {
  const cid = user?.center_id || 1;
  const [data, setData] = useState(null);
  const [queue, setQueue] = useState([]);

  const refresh = async () => {
    try {
      const [d, q] = await Promise.all([
        get(`/dashboard/${cid}`),
        get(`/queue/status/${cid}`),
      ]);
      setData(d);
      setQueue(q);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const agents = data?.agents || [];
  const onCallCount = agents.filter(a => a.phone_status === 'calling').length;
  const totalPending = queue.reduce((s, q) => s + +q.pending, 0);
  const totalNoAnswer = agents.reduce((s, a) => s + +a.no_answer, 0);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="통화중" value={onCallCount} color="var(--info)" sub={`/ ${agents.length} 실장`} />
        <Stat label="부재 대기" value={totalNoAnswer} color="var(--warn)" />
        <Stat label="잔여 큐" value={totalPending.toLocaleString()} color="var(--text)" />
        <Stat label="활성 DB" value={(data?.lists || []).filter(l => l.is_active).length} color="var(--accent)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* 실장 라이브 카드 */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>실장 라이브</div>
          {agents.map(a => {
            const isCalling = a.phone_status === 'calling';
            return (
              <div key={a.agent_name} className="card elev" style={{ marginBottom: 8, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Led color={isCalling ? 'var(--info)' : 'var(--text-faint)'} pulse={isCalling} size={9} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }} className="mono">
                      {a.agent_name} · SIP {a.sip_account || '-'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: isCalling ? 'var(--info)' : 'var(--text-dim)' }}>
                    {a.total_calls}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    연결 {a.connected} · 긍정 {a.positive}
                  </div>
                </div>
              </div>
            );
          })}
          {agents.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>로딩…</div>}
        </div>

        {/* 부재콜 큐 + 잔여 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>실장별 큐 잔여</div>
            <table>
              <thead>
                <tr>
                  <th>실장</th>
                  <th style={{ textAlign: 'right' }}>잔여</th>
                  <th style={{ textAlign: 'right' }}>부재</th>
                  <th style={{ textAlign: 'right' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(a => {
                  const q = queue.find(x => x.agent_name === a.agent_name) || { pending: 0, low: false };
                  return (
                    <tr key={a.agent_name}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{a.name}</span>
                        <span className="mono dim" style={{ marginLeft: 6, fontSize: 10 }}>{a.agent_name}</span>
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: q.low ? 'var(--neg)' : 'var(--text)' }}>
                        {q.pending}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--warn)' }}>{a.no_answer}</td>
                      <td style={{ textAlign: 'right' }}>
                        {q.low
                          ? <span className="tag neg">LOW</span>
                          : a.phone_status === 'calling'
                            ? <span className="tag info">CALL</span>
                            : <span className="tag">IDLE</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>활성 DB 잔여</div>
            {(data?.lists || []).filter(l => l.is_active).map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 11 }}>
                <span style={{ fontWeight: 600 }}>{l.title}</span>
                <span className="mono" style={{ color: +l.remaining < 30 ? 'var(--neg)' : 'var(--text)' }}>{l.remaining}</span>
              </div>
            ))}
            {(data?.lists || []).filter(l => l.is_active).length === 0 && (
              <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>활성 DB 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
