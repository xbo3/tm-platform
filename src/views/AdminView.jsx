import { useEffect, useState } from 'react';
import { get, post, del } from '../api.js';
import { Led, Bar, Stat } from '../components/widgets.jsx';

export default function AdminView() {
  const [overview, setOverview] = useState([]);
  const [quality, setQuality] = useState({ formula: { A: 0.4, B: 0.4, C: 0.2 }, rows: [] });
  const [supplierRank, setSupplierRank] = useState({ formula: { A: 0.4, B: 0.4, C: 0.2 }, rows: [] });
  const [recent, setRecent] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [newSupplier, setNewSupplier] = useState('');

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

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
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
