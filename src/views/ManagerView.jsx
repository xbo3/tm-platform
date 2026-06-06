import { useEffect, useRef, useState } from 'react';
import { get, post, patch, uploadFile } from '../api.js';
import { Led, Bar, Stat, fmtTime, gradeFromRate } from '../components/widgets.jsx';

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
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [smsUnread, setSmsUnread] = useState(0);
  // I-1: DB "1선택 → 2연결" 2단계. 선택된 DB id 보관 (한 번 누르면 선택, 그 DB 다시 누르면 연결)
  const [selectedListId, setSelectedListId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  // I-3: DB 목록 검색 + 전 컬럼 오름/내림 정렬
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('uploaded_at');
  const [sortDir, setSortDir] = useState('desc');
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

  // SMS 미읽음 카운트 — 30초 폴링
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const j = await get('/messages/summary');
        if (alive) setSmsUnread(j.total_unread || 0);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
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

  const updateList = async (id, patchBody) => {
    // 낙관적 UI 갱신
    setLists(prev => prev.map(l => l.id === id ? { ...l, ...patchBody } : l));
    try {
      await patch(`/lists/${id}`, patchBody);
    } catch (e) {
      window.alert('갱신 실패: ' + e.message);
      refresh(); // 서버 상태 재동기화
    }
  };

  const toggleActive = (l) => updateList(l.id, { is_active: !l.is_active });

  // I-1: "1선택 → 2연결". 선택된 DB 를 한 번 더 누르면 배타적 연결(POST /admin/connect-list).
  // 그 DB 만 is_active=true, 센터의 나머지는 모두 비활성(기록 보존). 분배 개념 폐기.
  const handleDbAction = async (l) => {
    if (l.is_active) return;                       // 이미 연결중이면 무시(정지는 별도 버튼)
    if (selectedListId !== l.id) {                 // 1단계: 선택
      setSelectedListId(l.id);
      return;
    }
    // 2단계: 연결
    setConnecting(true);
    try {
      await post('/admin/connect-list', { list_id: l.id });
      setSelectedListId(null);
      await refresh();
    } catch (e) {
      window.alert('연결 실패: ' + e.message);
    }
    setConnecting(false);
  };

  const recallList = async (l) => {
    // 콜 친 번호는 회수 대상 아님 (status≠pending), 안 친 번호만 풀로 복귀
    const ok = window.confirm(
      `[${l.title}] 의 콜 안 친 번호를 회수하시겠습니까?\n` +
      `(콜 친 번호는 그대로 보존됩니다)`
    );
    if (!ok) return;
    try {
      const r = await post('/dist/recall', { list_id: l.id });
      window.alert(`${r.recalled}건 회수 완료`);
      refresh();
    } catch (e) {
      window.alert('회수 실패: ' + e.message);
    }
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
        today_calls: acc.today_calls + (+a.today_calls || 0),
        today_connected: acc.today_connected + (+a.today_connected || 0),
        today_positive: acc.today_positive + (+a.today_positive || 0),
        today_talk: acc.today_talk + (+a.today_talk_time || 0),
        y_calls: acc.y_calls + (+a.yesterday_calls || 0),
        y_connected: acc.y_connected + (+a.yesterday_connected || 0),
        y_positive: acc.y_positive + (+a.yesterday_positive || 0),
      }),
      { calls: 0, connected: 0, positive: 0, invalid: 0, talk: 0, pending: 0,
        today_calls: 0, today_connected: 0, today_positive: 0, today_talk: 0,
        y_calls: 0, y_connected: 0, y_positive: 0 }
    )
    : { calls: 0, connected: 0, positive: 0, invalid: 0, talk: 0, pending: 0,
        today_calls: 0, today_connected: 0, today_positive: 0, today_talk: 0,
        y_calls: 0, y_connected: 0, y_positive: 0 };

  const overallRate = totals.calls > 0 ? +((totals.connected / totals.calls) * 100).toFixed(1) : 0;
  const todayRate = totals.today_calls > 0 ? +((totals.today_connected / totals.today_calls) * 100).toFixed(1) : 0;
  const totalRemaining = lists.reduce((s, l) => s + +l.remaining, 0);

  // I-2: 현재 연결중(배타적 활성)인 DB — 대시보드 상단 배너2 에 표시
  const activeList = lists.find(l => l.is_active) || null;

  // I-3: DB 목록 필드 정의 + 검색/정렬. SORT_FIELDS = 정렬 가능한 모든 컬럼.
  const SORT_FIELDS = [
    { k: 'uploaded_at', label: '업로드일', num: false },
    { k: 'title', label: '타이틀', num: false },
    { k: 'total', label: '전체', num: true },
    { k: 'used', label: '사용', num: true },
    { k: 'remaining', label: '잔여', num: true },
    { k: 'connected', label: '연결', num: true },
    { k: 'sotong', label: '소통', num: true },
    { k: 'positive', label: '긍정', num: true },
    { k: 'reject', label: '거절', num: true },
    { k: 'no_answer', label: '부재', num: true },
    { k: 'invalid_count', label: '결번', num: true },
    { k: 'reach_rate', label: '도달률', num: true },
    { k: 'sotong_rate', label: '소통률', num: true },
    { k: 'convert_rate', label: '전환율', num: true },
  ];
  const sortedLists = (() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? lists.filter(l =>
          (l.title || '').toLowerCase().includes(q) ||
          (l.supplier_tg || '').toLowerCase().includes(q))
      : lists;
    const field = SORT_FIELDS.find(f => f.k === sortKey) || SORT_FIELDS[0];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av = a[field.k], bv = b[field.k];
      if (field.num) { av = +av || 0; bv = +bv || 0; return (av - bv) * dir; }
      if (field.k === 'uploaded_at') { av = new Date(av).getTime() || 0; bv = new Date(bv).getTime() || 0; return (av - bv) * dir; }
      return String(av || '').localeCompare(String(bv || ''), 'ko') * dir;
    });
  })();

  const delta = (today, y) => {
    if (!y) return null;
    const d = today - y;
    if (d === 0) return null;
    return { sign: d > 0 ? '+' : '', val: d, pct: y > 0 ? Math.round((d / y) * 100) : null };
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* HERO 2분할 — 좌 상담원 성과 / 우 DB 품질. 5/26 biplays "어렵고 복잡하지 않게" — gradient/pulse 톤다운, 핵심 수치만. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18 }}>

        {/* 좌 — 당일 성과 (상담원 성적 합계) */}
        <div className="card" style={{
          padding: '18px 22px',
          minHeight: 180,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
                당일 성과
                {smsUnread > 0 && (
                  <span style={{
                    marginLeft: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'var(--neg)', color: '#fff', fontSize: 10, fontWeight: 600,
                  }}>
                    📩 미읽음 SMS {smsUnread}
                  </span>
                )}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 38, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{totals.today_calls}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>총 콜</span>
              {(() => {
                const d = delta(totals.today_calls, totals.y_calls);
                if (!d) return null;
                return <span style={{ fontSize: 11, color: d.val > 0 ? 'var(--pos)' : 'var(--neg)', marginLeft: 'auto' }}>
                  {d.sign}{d.val} vs 전일
                </span>;
              })()}
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
            paddingTop: 10, borderTop: '1px solid var(--border-soft)',
            fontSize: 12, color: 'var(--text-dim)',
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>연결</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--pos)' }}>{totals.today_connected}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>긍정</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent)' }}>{totals.today_positive}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>연결률</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: todayRate > 30 ? 'var(--pos)' : 'var(--text)' }}>{todayRate}%</div>
            </div>
          </div>
        </div>

        {/* 우 — DB 품질 실시간 소화 */}
        <div className="card" style={{
          padding: '18px 22px',
          minHeight: 180,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>DB 품질 실시간 소화</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                총 {lists.reduce((s, l) => s + +l.total, 0).toLocaleString()}건 · 잔여 {totalRemaining.toLocaleString()}건
              </span>
            </div>

            {/* I-2: 현재 연결중인 DB 배너 (배너2) — 타이틀 + 판매상 + 실시간 기록 강조 (biplays 6/6) */}
            <div style={{
              marginBottom: 12, padding: '12px 14px', borderRadius: 8,
              background: activeList ? 'rgba(34,197,94,.08)' : 'var(--bg-soft, rgba(255,255,255,.03))',
              border: `1px solid ${activeList ? 'var(--pos)' : 'var(--border-soft)'}`,
            }}>
              {activeList ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                    <Led color="var(--pos)" size={10} pulse />
                    <span style={{ fontSize: 11, color: 'var(--pos)', fontWeight: 700 }}>연결 중</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{activeList.title}</span>
                    {activeList.supplier_tg && (
                      <span className="mono" style={{ fontSize: 11, color: 'var(--info)' }}>판매상 {activeList.supplier_tg}</span>
                    )}
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
                      잔여 <strong style={{ color: 'var(--accent)', fontSize: 16 }}>{activeList.remaining}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      ['연결', activeList.connected ?? 0, 'var(--pos)'],
                      ['소통', activeList.sotong ?? 0, 'var(--accent)'],
                      ['긍정', activeList.positive ?? 0, 'var(--accent-strong)'],
                      ['거절', activeList.reject ?? 0, 'var(--text-dim)'],
                    ].map(([lab, val, col]) => (
                      <div key={lab} style={{ textAlign: 'center', padding: '5px 0', background: 'rgba(255,255,255,.03)', borderRadius: 5 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-faint)', marginBottom: 1 }}>{lab}</div>
                        <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Led color="var(--text-faint)" size={9} />
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>연결된 DB 없음 — 아래 목록에서 <strong>선택 → 연결</strong></span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>활성 DB</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{lists.filter(l => l.is_active).length}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>연결</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--pos)', lineHeight: 1 }}>{totals.connected}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>긍정</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>{totals.positive}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>결번</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--neg)', lineHeight: 1 }}>{totals.invalid}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>긍정률</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent-strong)', lineHeight: 1 }}>
                  {totals.calls > 0 ? +(totals.positive / totals.calls * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>
          <div style={{
            paddingTop: 14, borderTop: '1px solid var(--border-soft)',
            fontSize: 11, color: 'var(--text-dim)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>📌 새 DB 업로드 시 사용한 번호 자동 중복 체크 — 중복 상세 표시</span>
            <span className="mono">{lists.length} DB 보유</span>
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
                <th colSpan={3} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-faint)', borderRight: '1px solid var(--border-soft)' }}>오늘</th>
                <th colSpan={2} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-faint)' }}>누적</th>
                <th style={{ textAlign: 'right' }}>등급</th>
              </tr>
              <tr style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                <th></th>
                <th></th>
                <th style={{ textAlign: 'right' }}>콜</th>
                <th style={{ textAlign: 'right' }}>연결률</th>
                <th style={{ textAlign: 'right', borderRight: '1px solid var(--border-soft)' }}>긍정률</th>
                <th style={{ textAlign: 'right' }}>콜</th>
                <th style={{ textAlign: 'right' }}>가동</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.agents || []).map((a, i) => {
                const todayCalls = +a.today_calls || 0;
                const todayConn  = +a.today_connected || 0;
                const todayPos   = +a.today_positive || 0;
                const todayRate  = todayCalls > 0 ? +((todayConn / todayCalls) * 100).toFixed(1) : 0;
                const todayPosRate = todayCalls > 0 ? +((todayPos / todayCalls) * 100).toFixed(1) : 0;
                const cumRate    = +a.total_calls > 0 ? +((+a.connected / +a.total_calls) * 100).toFixed(1) : 0;
                const g = gradeFromRate(cumRate);
                return (
                  <tr key={a.agent_name}>
                    <td className="mono dim">{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{a.name}</span>
                        {a.online ? (
                          a.phone_status === 'calling' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--neg)', fontWeight: 600 }}>
                              <Led color="var(--neg)" size={8} pulse /> 통화 중
                            </span>
                          ) : (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--pos)', fontWeight: 600 }}>
                              <Led color="var(--pos)" size={8} /> 대기 중
                            </span>
                          )
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-faint)' }}>
                            <Led color="var(--text-faint)" size={8} /> 오프라인
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)' }} className="mono">{a.agent_name} · {a.sip_account || '-'}</div>
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{todayCalls}</td>
                    <td className="mono" style={{ textAlign: 'right', color: todayRate > 30 ? 'var(--pos)' : 'var(--text)' }}>{todayRate}%</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)', borderRight: '1px solid var(--border-soft)' }}>{todayPosRate}%</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{a.total_calls}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{fmtTime(+a.talk_time || 0)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="tag" style={{ background: g.color + '22', color: g.color }}>{g.grade}</span>
                    </td>
                  </tr>
                );
              })}
              {(!data?.agents || data.agents.length === 0) && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>로딩중…</td></tr>
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
            <span style={{ fontSize: 13, fontWeight: 600 }}>DB 목록 ({sortedLists.length}{search ? `/${lists.length}` : ''})</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} />
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? '업로드중…' : '+ DB 업로드'}
              </button>
            </div>
          </div>

          {/* I-3: 검색 + 전 컬럼 오름/내림 정렬 — biplays 6/6 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              placeholder="🔍 타이틀·공급자 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 140, fontSize: 11, padding: '6px 10px' }}
            />
            <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ fontSize: 11, padding: '6px 8px' }}>
              {SORT_FIELDS.map(f => <option key={f.k} value={f.k}>{f.label}</option>)}
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? '오름차순 (작은→큰)' : '내림차순 (큰→작은)'}
              style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-dim)',
              }}>
              {sortDir === 'asc' ? '오름 ↑' : '내림 ↓'}
            </button>
          </div>

          {uploadResult && (
            <div className="card elev" style={{ marginBottom: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>업로드 결과</span>
                <button onClick={() => setUploadResult(null)} style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:11 }}>닫기</button>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 6 }}>
                <span>전체 <strong className="mono">{uploadResult.total}</strong></span>
                <span style={{ color: 'var(--pos)' }}>유효 <strong className="mono">{uploadResult.valid}</strong></span>
                <span style={{ color: 'var(--neg)' }}>오류 <strong className="mono">{uploadResult.invalid_phone}</strong></span>
                <span style={{ color: 'var(--warn)' }}>중복 <strong className="mono">{uploadResult.duplicate}</strong></span>
                <span style={{ color: 'var(--info)' }}>품질 <strong className="mono">{uploadResult.quality}%</strong></span>
              </div>

              {/* 5/26 biplays spec — 어느 DB 에 몇 건 중복인지 집계 + 상세 detail */}
              {uploadResult.duplicate > 0 && uploadResult.dup_by_list?.length > 0 && (
                <div style={{ marginTop: 6, padding: 8, background: 'rgba(251,191,36,.06)', borderRadius: 6, borderLeft: '3px solid var(--warn)' }}>
                  <div style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 700, marginBottom: 4 }}>중복 발견 — 어느 DB 에 몇 건</div>
                  {uploadResult.dup_by_list.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>
                      <span style={{ color: 'var(--text-dim)' }}>·</span> {d.list} <strong className="mono">{d.count}건</strong>
                      {d.connected > 0 && <span style={{ color: 'var(--pos)', marginLeft: 6 }}>연결 {d.connected}</span>}
                      {d.no_answer > 0 && <span style={{ color: 'var(--warn)', marginLeft: 6 }}>부재 {d.no_answer}</span>}
                      {d.invalid > 0 && <span style={{ color: 'var(--neg)', marginLeft: 6 }}>오류 {d.invalid}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 상세 — 처음 20건 phone/name/prev_list */}
              {uploadResult.duplicate > 0 && uploadResult.dup_details?.length > 0 && (
                <details style={{ marginTop: 6, fontSize: 11 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>중복 상세 ({Math.min(uploadResult.dup_details.length, 20)}건 보기)</summary>
                  <div style={{ marginTop: 4, maxHeight: 180, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 10 }}>
                    {uploadResult.dup_details.slice(0, 20).map((d, i) => (
                      <div key={i} style={{ padding: '3px 0', borderBottom: '1px dashed var(--border-soft)' }}>
                        <span style={{ color: 'var(--info)' }}>{d.phone}</span>
                        {d.name && <span style={{ color: 'var(--text)' }}> {d.name}</span>}
                        <span style={{ color: 'var(--text-dim)' }}> · {d.prev_list}</span>
                        {(d.feed || d.prev_status) && <span style={{ color: 'var(--warn)' }}> [{d.feed || d.prev_status}]</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {lists.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>DB 없음</div>}
          {lists.length > 0 && sortedLists.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>검색 결과 없음</div>}

          {sortedLists.map(l => {
            const usedPct = l.total > 0 ? ((+l.total - +l.remaining) / +l.total) * 100 : 0;
            return (
              <div key={l.id} className="card elev" style={{ marginBottom: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{l.title}</span>
                    {l.supplier_tg && <span className="mono" style={{ fontSize: 10, color: 'var(--info)' }}>판매상 {l.supplier_tg}</span>}
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
                </div>

                {/* DB 체크 5종(연결·부재·거절·결번·소통) + 긍정 — 정확 집계 (biplays 6/6) */}
                <div style={{ display: 'flex', gap: 10, fontSize: 11, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--pos)' }}>연결 <strong className="mono">{l.connected ?? 0}</strong></span>
                  <span style={{ color: 'var(--accent)' }}>소통 <strong className="mono">{l.sotong ?? 0}</strong></span>
                  <span style={{ color: 'var(--accent)' }}>긍정 <strong className="mono">{l.positive ?? 0}</strong></span>
                  <span style={{ color: 'var(--text-dim)' }}>거절 <strong className="mono">{l.reject ?? 0}</strong></span>
                  <span style={{ color: 'var(--text-dim)' }}>부재 <strong className="mono">{l.no_answer ?? 0}</strong></span>
                  <span style={{ color: 'var(--neg)' }}>결번 <strong className="mono">{l.invalid_count ?? 0}</strong></span>
                </div>
                {/* DB퀄리티 3축: 도달률(데이터)·소통률(명단)·전환율(상담원) */}
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span>도달률 <strong>{l.reach_rate ?? 0}%</strong></span>
                  <span>소통률 <strong>{l.sotong_rate ?? 0}%</strong></span>
                  <span>전환율 <strong>{l.convert_rate ?? 0}%</strong></span>
                  <span>연결률 {l.connect_rate ?? 0}%</span>
                </div>

                <Bar pct={usedPct} color="var(--accent)" h={4} />

                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={l.category || ''} onChange={e => updateList(l.id, { category: e.target.value || null })}
                    style={{ fontSize: 11, padding: '5px 8px' }}>
                    {CATEGORY_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>

                  <input
                    placeholder="@공급자"
                    value={l.supplier_tg || ''}
                    onChange={e => updateList(l.id, { supplier_tg: e.target.value })}
                    onBlur={e => updateList(l.id, { supplier_tg: e.target.value })}
                    className="mono"
                    style={{ fontSize: 11, padding: '5px 8px', width: 120, color: 'var(--info)' }}
                  />

                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!l.auto_connect} onChange={e => updateList(l.id, { auto_connect: e.target.checked })} />
                    오토연결
                  </label>

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* [회수] — 안 친 번호 풀로 복귀 (콜 친 번호 보존) */}
                    <button
                      onClick={() => recallList(l)}
                      title="안 친 번호 회수 (재분배 풀로 복귀, 콜 친 번호는 보존)"
                      style={{
                        padding: '6px 10px', fontSize: 11, fontWeight: 500,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 5,
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                      }}>
                      회수
                    </button>

                    {/* I-1: "1선택 → 2연결" 2단계 (분배 폐기, biplays 6/6). 연결중이면 정지. */}
                    {l.is_active ? (
                      <>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--pos)' }}>
                          <Led color="var(--pos)" size={8} pulse /> 연결 중
                        </span>
                        <button
                          onClick={() => toggleActive(l)}
                          title="연결 정지 (is_active off, 진행 기록은 보존)"
                          style={{
                            padding: '6px 10px', fontSize: 11, fontWeight: 500,
                            background: 'transparent', border: '1px solid var(--border)', borderRadius: 5,
                            color: 'var(--text-dim)', cursor: 'pointer',
                          }}>
                          정지
                        </button>
                      </>
                    ) : selectedListId === l.id ? (
                      <>
                        <button
                          onClick={() => handleDbAction(l)}
                          disabled={connecting}
                          title="이 DB 를 연결 — 그 DB만 배타적 활성, 나머지는 자동 정지"
                          style={{
                            padding: '6px 16px', fontSize: 11, fontWeight: 700,
                            background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 5,
                            color: '#fff', cursor: 'pointer',
                          }}>
                          {connecting ? '연결중…' : '② 연결 ▶'}
                        </button>
                        <button
                          onClick={() => setSelectedListId(null)}
                          title="선택 취소"
                          style={{
                            padding: '6px 8px', fontSize: 11,
                            background: 'transparent', border: '1px solid var(--border)', borderRadius: 5,
                            color: 'var(--text-faint)', cursor: 'pointer',
                          }}>
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDbAction(l)}
                        title="① 이 DB 선택 (한 번 더 누르면 연결)"
                        style={{
                          padding: '6px 14px', fontSize: 11, fontWeight: 600,
                          background: 'transparent', border: '1px solid var(--accent)', borderRadius: 5,
                          color: 'var(--accent)', cursor: 'pointer',
                        }}>
                        ① 선택
                      </button>
                    )}
                  </div>
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
    </div>
  );
}
