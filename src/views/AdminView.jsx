import { useEffect, useState } from 'react';
import { get, post, put, del } from '../api.js';
import { Led, Bar, Stat } from '../components/widgets.jsx';

export default function AdminView() {
  const [overview, setOverview] = useState([]);
  const [quality, setQuality] = useState({ formula: { A: 0.4, B: 0.4, C: 0.2 }, rows: [] });
  const [supplierRank, setSupplierRank] = useState({ formula: { A: 0.4, B: 0.4, C: 0.2 }, rows: [] });
  const [recent, setRecent] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [newSupplier, setNewSupplier] = useState('');
  const [centerPhones, setCenterPhones] = useState([]);
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterPhones, setNewCenterPhones] = useState(5);
  const [creatingCenter, setCreatingCenter] = useState(false);
  const [newAgentInputs, setNewAgentInputs] = useState({}); // {center_id: "name"}
  const [aiCost, setAiCost] = useState(null);

  // localStorage UI 가중치 (백엔드 env 가 진실; UI 는 비공개 슬라이더 의도)
  const [weights, setWeights] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tm_quality_weights')) || { A: 0.4, B: 0.4, C: 0.2 }; }
    catch { return { A: 0.4, B: 0.4, C: 0.2 }; }
  });

  const refresh = async () => {
    try {
      const [ov, q, sr, rp, sup] = await Promise.all([
        get('/admin/overview'),
        get('/admin/db-quality'),
        get('/admin/supplier-rank'),
        get('/admin/recent-positives?limit=15'),
        get('/suppliers'),
      ]);
      setOverview(ov);
      setQuality(q);
      setSupplierRank(sr);
      setRecent(rp);
      setSuppliers(sup);
    } catch (e) { console.error(e); }
  };

  // Phone presence ticks every 5s (faster than the 15s heavy refresh) so the
  // green/red LED on each agent reflects reality without spamming heavy queries.
  const refreshPhones = async () => {
    try {
      const cp = await get('/admin/center-phones');
      setCenterPhones(cp);
    } catch (e) { console.error('center-phones', e); }
  };

  const refreshAiCost = async () => {
    try {
      const c = await get('/admin/ai-cost');
      setAiCost(c);
    } catch (e) { console.error('ai-cost', e); }
  };

  useEffect(() => {
    refresh();
    refreshPhones();
    refreshAiCost();
    const t = setInterval(refresh, 15000);
    const t2 = setInterval(refreshPhones, 5000);
    const t3 = setInterval(refreshAiCost, 60000);
    return () => { clearInterval(t); clearInterval(t2); clearInterval(t3); };
  }, []);

  const addSupplier = async () => {
    if (!newSupplier.trim()) return;
    try {
      await post('/suppliers', { tg_id: newSupplier.trim() });
      setNewSupplier('');
      refresh();
    } catch (e) { window.alert(e.message); }
  };

  const removeSupplier = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      await del(`/suppliers/${id}`);
      refresh();
    } catch (e) { window.alert(e.message); }
  };

  const saveWeights = (next) => {
    setWeights(next);
    localStorage.setItem('tm_quality_weights', JSON.stringify(next));
  };

  const createCenter = async () => {
    const name = newCenterName.trim();
    if (!name) return;
    if (creatingCenter) return;
    const phoneCount = Math.max(1, Math.min(50, +newCenterPhones || 5));
    setCreatingCenter(true);
    try {
      const ts = Date.now();
      await post('/centers', {
        name,
        owner_email: `center${ts}@tm.co.kr`,
        owner_name: `${name} 센터장`,
        phone_count: phoneCount,
        plan: 'basic',
      });
      setNewCenterName('');
      setNewCenterPhones(5);
      refresh();
      refreshPhones();
    } catch (e) {
      window.alert('센터 생성 실패: ' + e.message);
    } finally {
      setCreatingCenter(false);
    }
  };

  const toggleCenterActive = async (center) => {
    const action = center.is_active ? '정지' : '재개';
    if (!window.confirm(`${center.center_name} 을(를) ${action}하시겠습니까?`)) return;
    try {
      await put(`/centers/${center.center_id}/active`, { is_active: !center.is_active });
      refresh();
      refreshPhones();
    } catch (e) {
      window.alert('실패: ' + e.message);
    }
  };

  const deleteCenter = async (center) => {
    if (!window.confirm(`${center.center_name} 을(를) 영구 삭제하시겠습니까? 모든 phones/agents/customers/calls 가 함께 삭제됩니다.`)) return;
    if (!window.confirm('정말 삭제? 되돌릴 수 없습니다.')) return;
    try {
      await del(`/centers/${center.center_id}`);
      refresh();
      refreshPhones();
    } catch (e) {
      window.alert('삭제 실패: ' + e.message);
    }
  };

  const toggleAgentActive = async (agent) => {
    try {
      await put(`/centers/users/${agent.user_id}/active`, { is_active: !agent.is_active });
      refreshPhones();
    } catch (e) {
      window.alert('실패: ' + e.message);
    }
  };

  const addAgent = async (centerId) => {
    const name = (newAgentInputs[centerId] || '').trim();
    if (!name) return;
    try {
      await post(`/centers/${centerId}/agents`, { name });
      setNewAgentInputs(prev => ({ ...prev, [centerId]: '' }));
      refreshPhones();
    } catch (e) {
      window.alert('실장 추가 실패: ' + e.message);
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 슈퍼어드민 헤더 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(212,165,116,0.12), transparent)', border: '1px solid var(--accent-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Led color="var(--accent)" pulse />
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.05em' }}>★ 슈퍼어드민 전용</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>전체 DB 품질 점수 · 공급자 랭킹 · 점수 공식 (비공개)</div>
      </div>

      {/* 센터 KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="센터" value={overview.length} color="var(--info)" />
        <Stat label="총 콜" value={overview.reduce((s, c) => s + +c.total_calls, 0).toLocaleString()} color="var(--text)" />
        <Stat label="연결" value={overview.reduce((s, c) => s + +c.connected, 0).toLocaleString()} color="var(--pos)" />
        <Stat label="긍정" value={overview.reduce((s, c) => s + +c.positive, 0).toLocaleString()} color="var(--accent)" />
      </div>

      {/* AI 분류 비용 (Haiku 4.5 실측) */}
      <AiCostCard data={aiCost} />

      {/* 전체 센터 · 폰 라이브 상태 + 센터/실장 관리 */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>전체 센터 · 폰 라이브 상태</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            {centerPhones.length} 센터 · {centerPhones.reduce((s, c) => s + c.agents.length, 0)} 실장 ·
            {' '}{centerPhones.reduce((s, c) => s + c.agents.filter(a => a.ws_online).length, 0)} online
            <span className="mono" style={{ marginLeft: 6 }}>· 5s</span>
          </span>
        </div>
        {centerPhones.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: '12px 0' }}>센터 데이터 없음</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {centerPhones.map(c => {
            const onlineCount = c.agents.filter(a => a.ws_online).length;
            return (
              <div key={c.center_id} style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{c.center_name}</span>
                  {!c.is_active && <span className="tag" style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}>정지</span>}
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {onlineCount}/{c.agents.length} online
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => toggleCenterActive(c)}
                    className="btn ghost"
                    style={{ fontSize: 10, padding: '3px 8px' }}
                  >{c.is_active ? '정지' : '재개'}</button>
                  <button
                    onClick={() => deleteCenter(c)}
                    className="btn ghost danger"
                    style={{ fontSize: 10, padding: '3px 8px' }}
                  >삭제</button>
                </div>
                {c.agents.length === 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 12 }}>등록된 실장 없음</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {c.agents.map(a => {
                    const color = !a.is_active
                      ? 'var(--text-faint)'
                      : a.ws_online ? 'var(--pos)' : 'var(--neg)';
                    return (
                      <div key={a.user_id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 6,
                      }}>
                        <Led color={color} size={7} pulse={a.is_active && a.ws_online} />
                        <span className="mono" style={{ fontSize: 11, fontWeight: 600, width: 36 }}>{a.agent_name || '?'}</span>
                        <span style={{ flex: 1, fontSize: 11, color: a.is_active ? 'var(--text)' : 'var(--text-faint)' }}>
                          {a.name || '(이름 없음)'}
                        </span>
                        <button
                          onClick={() => toggleAgentActive(a)}
                          className="btn ghost"
                          style={{ fontSize: 9, padding: '2px 6px' }}
                          title={a.is_active ? '실장 정지' : '실장 재개'}
                        >{a.is_active ? '정지' : '재개'}</button>
                      </div>
                    );
                  })}
                </div>

                {/* 실장 추가 form */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingLeft: 4 }}>
                  <input
                    placeholder="실장 이름 (예: 김상민)"
                    value={newAgentInputs[c.center_id] || ''}
                    onChange={e => setNewAgentInputs(prev => ({ ...prev, [c.center_id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addAgent(c.center_id)}
                    style={{ flex: 1, fontSize: 11 }}
                  />
                  <button
                    onClick={() => addAgent(c.center_id)}
                    className="btn"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    disabled={!(newAgentInputs[c.center_id] || '').trim()}
                  >실장 추가</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 센터 생성 form */}
        <div style={{
          borderTop: '1px solid var(--border-soft)',
          marginTop: 16, paddingTop: 14,
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>새 센터:</span>
          <input
            placeholder="센터명 (예: 부산센터)"
            value={newCenterName}
            onChange={e => setNewCenterName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createCenter()}
            style={{ flex: 1, minWidth: 160, fontSize: 12 }}
          />
          <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
            폰 수
            <input
              type="number"
              min={1}
              max={50}
              value={newCenterPhones}
              onChange={e => setNewCenterPhones(+e.target.value || 5)}
              className="mono"
              style={{ width: 56, fontSize: 11, textAlign: 'center' }}
            />
          </label>
          <button
            onClick={createCenter}
            className="btn primary"
            style={{ fontSize: 11, padding: '5px 12px' }}
            disabled={creatingCenter || !newCenterName.trim()}
          >{creatingCenter ? '생성 중...' : '센터 생성'}</button>
        </div>
      </div>

      {/* 점수 공식 (비공개 슬라이더) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>품질 점수 공식 <span className="tag" style={{ marginLeft: 6 }}>비공개</span></span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            score = connect×{weights.A} + positive×{weights.B} − invalid×{weights.C}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['A', 'B', 'C'].map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ width: 80, color: 'var(--text-dim)' }}>{k === 'A' ? '연결률' : k === 'B' ? '긍정률' : '결번 패널티'}</span>
              <input type="range" min="0" max="1" step="0.05" value={weights[k]}
                onChange={e => saveWeights({ ...weights, [k]: +e.target.value })}
                style={{ flex: 1 }} />
              <span className="mono" style={{ width: 32, textAlign: 'right', color: 'var(--accent)' }}>{weights[k].toFixed(2)}</span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8 }}>
          * 슬라이더는 미리보기용 (localStorage). 실제 점수는 환경변수로 결정 — backend formula = A {quality.formula.A} · B {quality.formula.B} · C {quality.formula.C}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>

        {/* DB 품질 랭킹 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>DB 품질 랭킹</span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{quality.rows.length} DB</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>DB</th>
                <th>공급자</th>
                <th style={{ textAlign: 'right' }}>연결률</th>
                <th style={{ textAlign: 'right' }}>긍정률</th>
                <th style={{ textAlign: 'right' }}>결번</th>
                <th style={{ textAlign: 'right' }}>점수</th>
              </tr>
            </thead>
            <tbody>
              {quality.rows.slice(0, 20).map((r, i) => (
                <tr key={r.id}>
                  <td className="mono dim">{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{r.category || '미분류'} · {r.total_count}건</div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--info)' }}>{r.supplier_tg || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--pos)' }}>{r.connect_rate}%</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)' }}>{r.positive_rate}%</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--neg)' }}>{r.invalid_rate}%</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{r.score.toFixed(3)}</td>
                </tr>
              ))}
              {quality.rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>데이터 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 공급자 관리 + 랭킹 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>공급자 ({suppliers.length})</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                placeholder="@telegram_id"
                value={newSupplier}
                onChange={e => setNewSupplier(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSupplier()}
                className="mono"
                style={{ flex: 1, fontSize: 11 }}
              />
              <button className="btn primary" onClick={addSupplier} style={{ fontSize: 11 }}>추가</button>
            </div>
            {suppliers.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <span className="mono" style={{ flex: 1, fontSize: 11, color: 'var(--info)' }}>{s.tg_id}</span>
                <button onClick={() => removeSupplier(s.id)} className="btn ghost danger" style={{ fontSize: 10, padding: '2px 8px' }}>삭제</button>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>공급자 점수</div>
            {supplierRank.rows.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>데이터 없음</div>}
            {supplierRank.rows.map((r, i) => (
              <div key={r.supplier} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span className="mono dim" style={{ width: 16, fontSize: 10 }}>{i + 1}</span>
                <span className="mono" style={{ flex: 1, fontSize: 11, color: 'var(--info)' }}>{r.supplier}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{r.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 최근 긍정 */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>최근 긍정 ({recent.length})</div>
        {recent.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>아직 긍정 기록 없음</div>}
        {recent.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 11 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{r.name || '이름없음'}</span>
              <span className="mono dim" style={{ marginLeft: 8 }}>{r.phone_number}</span>
            </div>
            <div className="dim">
              <span>{r.list_title}</span>
              <span className="mono" style={{ marginLeft: 8 }}>실장 {r.assigned_agent}</span>
              <span className="mono" style={{ marginLeft: 8 }}>{new Date(r.updated_at).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 센터 overview */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>센터 overview</div>
        <table>
          <thead>
            <tr>
              <th>센터</th>
              <th style={{ textAlign: 'right' }}>전화기</th>
              <th style={{ textAlign: 'right' }}>실장</th>
              <th style={{ textAlign: 'right' }}>총 콜</th>
              <th style={{ textAlign: 'right' }}>연결</th>
              <th style={{ textAlign: 'right' }}>긍정</th>
              <th style={{ textAlign: 'right' }}>연결률</th>
            </tr>
          </thead>
          <tbody>
            {overview.map(c => (
              <tr key={c.id}>
                <td>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span className="tag" style={{ marginLeft: 6 }}>{c.plan}</span>
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{c.phones}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{c.agents}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{c.total_calls}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--pos)' }}>{c.connected}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)' }}>{c.positive}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{c.connect_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiCostCard({ data }) {
  const fmtUsd = (n) => '$' + (Number(n) || 0).toFixed(4);
  const fmtUsdShort = (n) => '$' + (Number(n) || 0).toFixed(2);
  const fmtTokens = (n) => (Number(n) || 0).toLocaleString();

  const today  = data?.today  || { calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
  const month  = data?.month  || { calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
  const total  = data?.total  || { calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
  const recent = data?.recent || [];

  const avgPerCall = today.calls > 0 ? today.cost_usd / today.calls : 0;
  const monthAvg   = month.calls > 0 ? month.cost_usd / month.calls : 0;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>AI 분류 비용 (Haiku 4.5 실측)</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 8 }}>
            classify.js → ai_usage 누적. 60s polling.
          </span>
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          단가: in $1 / out $5 / cache-read $0.10 / M
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>오늘</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmtUsd(today.cost_usd)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            {today.calls} 콜 · 평균 {fmtUsd(avgPerCall)}/콜
          </div>
        </div>
        <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>이번달</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fmtUsdShort(month.cost_usd)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            {month.calls} 콜 · 평균 {fmtUsd(monthAvg)}/콜
          </div>
        </div>
        <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>누적</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-dim)' }}>{fmtUsdShort(total.cost_usd)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            in {fmtTokens(total.input_tokens)} / out {fmtTokens(total.output_tokens)} tok
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
            최근 {recent.length} 호출 ▾
          </summary>
          <div style={{ marginTop: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 10 }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)' }}>
                  <th style={{ textAlign: 'left' }}>시각</th>
                  <th style={{ textAlign: 'right' }}>call_id</th>
                  <th style={{ textAlign: 'right' }}>in</th>
                  <th style={{ textAlign: 'right' }}>out</th>
                  <th style={{ textAlign: 'right' }}>cost</th>
                  <th style={{ textAlign: 'right' }}>latency</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.call_id ?? '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{fmtTokens(r.input_tokens)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{fmtTokens(r.output_tokens)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtUsd(r.cost_usd)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r.latency_ms ?? '—'}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {recent.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)' }}>
          아직 분류 호출 없음. 첫 통화 분류 후 데이터 누적 시작.
        </div>
      )}
    </div>
  );
}
