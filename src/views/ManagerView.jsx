import { useEffect, useRef, useState } from 'react';
import { get, post, uploadFile } from '../api.js';
import { Led, Bar, Stat, fmtTime, gradeFromRate } from '../components/widgets.jsx';
import DistributeModal from '../components/DistributeModal.jsx';

const CATEGORY_OPTS = [
  { v: '', label: '미분류' },
  { v: 'casino', label: '🎰 카지노' },
  { v: 'tojino', label: '🎲 토지노' },
  { v: 'etc', label: '기타' },
];

export default function ManagerView({ user }) {
  const cid = user?.center_id || 1;
  const [data, setData] = useState(null);
  const [lists, setLists] = useState([]);
  const [queue, setQueue] = useState([]);
  const [distList, setDistList] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = useRef();

  const refresh = async () => {
    try {
      const [d, l, q] = await Promise.all([
        get(`/dashboard/${cid}`),
        get(`/lists/${cid}`),
        get(`/queue/status/${cid}`),
      ]);
      setData(d);
      setLists(l);
      setQueue(q);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const title = window.prompt('DB 이름', file.name.replace(/\.\w+$/, ''));
    if (!title) return;
    const source = window.prompt('출처(공급자 텔레그램 @id)', '') || '';
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await uploadFile('/lists/upload-file', file, { title, source });
      setUploadResult(res);
      refresh();
    } catch (err) {
      window.alert('Upload failed: ' + err.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const updateList = async (id, patch) => {
    try {
      await post(`/dist/preview`, { list_id: id }); // no-op preflight to ensure id valid; ignore
    } catch {}
    // category / supplier_tg / auto_connect 같은 메타는 dist/execute 시 같이 보내고,
    // 단독 변경은 customer_lists PUT 이 따로 없으므로 distribution 시점에 반영.
    // → UI 만 로컬로 업데이트
    setLists(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const totals = data?.agents
    ? data.agents.reduce(
      (acc, a) => ({
        calls: acc.calls + +a.total_calls,
        connected: acc.connected + +a.connected,
        positive: acc.positive + +a.positive,
        invalid: acc.invalid + +a.invalid_count,
        talk: acc.talk + +a.talk_time,
        pending: acc.pending + +a.pending,
      }),
      { calls: 0, connected: 0, positive: 0, invalid: 0, talk: 0, pending: 0 }
    )
    : { calls: 0, connected: 0, positive: 0, invalid: 0, talk: 0, pending: 0 };

  const overallRate = totals.calls > 0 ? +((totals.connected / totals.calls) * 100).toFixed(1) : 0;
  const totalRemaining = lists.reduce((s, l) => s + +l.remaining, 0);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* HERO 2분할 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* TM 실장 당일 성과 */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.18), rgba(96,165,250,0.04))', border: '1px solid var(--info-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Led color="var(--info)" pulse />
            <span style={{ fontSize: 11, color: 'var(--info)', fontWeight: 600, letterSpacing: '0.05em' }}>TM 실장 당일 성과</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 36, fontWeight: 700, color: 'var(--info)' }}>{totals.calls}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>총 콜 · 연결 {totals.connected} · 긍정 {totals.positive}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>통화시간 {fmtTime(totals.talk)} · 평균 연결률 {overallRate}%</div>
        </div>

        {/* 활성 DB 당일 성과 */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(212,165,116,0.16), rgba(212,165,116,0.03))', border: '1px solid var(--accent-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Led color="var(--accent)" pulse />
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.05em' }}>연결된 DB 당일 성과</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)' }}>
              {lists.filter(l => l.is_active).length}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>활성 DB · 잔여 {totalRemaining.toLocaleString()}건</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            결번 {totals.invalid} · 긍정률 {totals.calls > 0 ? +(totals.positive / totals.calls * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* MAIN: 좌 실장 / 우 DB */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* LEFT — 실장 성적 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>실장별 성적</span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>오늘 / 누적 / 등급</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th>실장</th>
                <th style={{ textAlign: 'right' }}>콜</th>
                <th style={{ textAlign: 'right' }}>연결</th>
                <th style={{ textAlign: 'right' }}>긍정</th>
                <th style={{ textAlign: 'right' }}>연결률</th>
                <th style={{ textAlign: 'right' }}>등급</th>
              </tr>
            </thead>
            <tbody>
              {(data?.agents || []).map((a, i) => {
                const rate = +a.total_calls > 0 ? +((+a.connected / +a.total_calls) * 100).toFixed(1) : 0;
                const g = gradeFromRate(rate);
                return (
                  <tr key={a.agent_name}>
                    <td className="mono dim">{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)' }} className="mono">{a.agent_name} · {a.sip_account || '-'}</div>
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{a.total_calls}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--pos)' }}>{a.connected}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)' }}>{a.positive}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{rate}%</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="tag" style={{ background: g.color + '22', color: g.color }}>{g.grade}</span>
                    </td>
                  </tr>
                );
              })}
              {(!data?.agents || data.agents.length === 0) && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>로딩중…</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>실장별 큐 잔여</div>
            {queue.map(q => (
              <div key={q.agent_name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="mono" style={{ width: 22, fontSize: 11 }}>{q.agent_name}</span>
                <div style={{ flex: 1 }}>
                  <Bar pct={Math.min(q.pending / 2, 100)} color={q.low ? 'var(--neg)' : 'var(--info)'} h={4} />
                </div>
                <span className="mono" style={{ fontSize: 12, width: 40, textAlign: 'right', color: q.low ? 'var(--neg)' : 'var(--text)' }}>{q.pending}</span>
                {q.low && <span className="tag neg" style={{ fontSize: 9 }}>LOW</span>}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — DB 목록 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>DB 목록 ({lists.length})</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} />
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? '업로드중…' : '+ DB 업로드'}
              </button>
            </div>
          </div>

          {uploadResult && (
            <div className="card elev" style={{ marginBottom: 10, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>업로드 결과</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span>전체 <strong className="mono">{uploadResult.total}</strong></span>
                <span style={{ color: 'var(--pos)' }}>유효 <strong className="mono">{uploadResult.valid}</strong></span>
                <span style={{ color: 'var(--neg)' }}>오류 <strong className="mono">{uploadResult.invalid_phone}</strong></span>
                <span style={{ color: 'var(--warn)' }}>중복 <strong className="mono">{uploadResult.duplicate}</strong></span>
                <span style={{ color: 'var(--info)' }}>품질 <strong className="mono">{uploadResult.quality}%</strong></span>
              </div>
            </div>
          )}

          {lists.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>DB 없음</div>}

          {lists.map(l => {
            const usedPct = l.total > 0 ? ((+l.total - +l.remaining) / +l.total) * 100 : 0;
            return (
              <div key={l.id} className="card elev" style={{ marginBottom: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{l.title}</span>
                    {l.is_test && <span className="tag warn">TEST</span>}
                    {l.is_active && <span className="tag pos">활성</span>}
                    {l.is_distributed && !l.is_active && <span className="tag info">분배완료</span>}
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {new Date(l.uploaded_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 6 }}>
                  <span>전체 <strong className="mono">{l.total}</strong></span>
                  <span style={{ color: 'var(--info)' }}>사용 <strong className="mono">{l.used}</strong></span>
                  <span style={{ color: +l.remaining < 30 ? 'var(--neg)' : 'var(--text)' }}>
                    잔여 <strong className="mono">{l.remaining}</strong>
                  </span>
                  <span style={{ color: 'var(--pos)' }}>연결률 <strong className="mono">{l.connect_rate}%</strong></span>
                </div>

                <Bar pct={usedPct} color="var(--accent)" h={4} />

                <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={l.category || ''} onChange={e => updateList(l.id, { category: e.target.value || null })}
                    style={{ fontSize: 11, padding: '5px 8px' }}>
                    {CATEGORY_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>

                  <input
                    placeholder="@공급자"
                    value={l.supplier_tg || ''}
                    onChange={e => updateList(l.id, { supplier_tg: e.target.value })}
                    className="mono"
                    style={{ fontSize: 11, padding: '5px 8px', width: 120, color: 'var(--info)' }}
                  />

                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!l.auto_connect} onChange={e => updateList(l.id, { auto_connect: e.target.checked })} />
                    오토연결
                  </label>

                  <button className="btn primary" onClick={() => setDistList(l)} style={{ marginLeft: 'auto' }}>
                    분배
                  </button>
                </div>

                {l.agents?.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
                    {l.agents.map(a => (
                      <div key={a.agent_name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: 10 }}>
                        <span className="mono" style={{ width: 18, color: 'var(--info)' }}>{a.agent_name}</span>
                        <div style={{ flex: 1 }}>
                          <Bar pct={a.distributed > 0 ? ((a.distributed - a.remaining) / a.distributed) * 100 : 0} color="var(--info)" h={3} />
                        </div>
                        <span className="mono" style={{ width: 60, textAlign: 'right', color: 'var(--text-dim)' }}>{a.remaining}/{a.distributed}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 잔여 + 소진 예상 */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <Stat label="총 잔여" value={totalRemaining.toLocaleString()} color="var(--accent)" />
        <Stat label="활성 DB" value={lists.filter(l => l.is_active).length} color="var(--pos)" />
        <Stat label="오늘 통화시간" value={fmtTime(totals.talk)} color="var(--info)" />
        <Stat label="긍정 누적" value={totals.positive} color="var(--accent)" />
      </div>

      <DistributeModal list={distList} onClose={() => setDistList(null)} onDone={refresh} />
    </div>
  );
}
