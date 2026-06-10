import { useEffect, useRef, useState } from 'react';
import { get, post, patch, uploadFile } from '../api.js';
import { Led, fmtTime, gradeFromRate } from '../components/widgets.jsx';

// ManagerDashboard (센터장) — 바탕화면 "TM Platform" 디자인 이식 (biplays 6/9)
//  좌: 상담원 일과·업무수행 (행별 라이브 성과 — 연결률 게이지 + 등급)
//  우: DB 관리 — 연결DB 실시간 배너 + 배타적 활성화 알림 + 발급대기 + 검색 + 목록
//  목록 버튼 = [선택]↔[연결] 한 개 (선택 누르면 연결로 바뀜, biplays 6/9)

const rate = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const rateColor = (r) => (r >= 30 ? 'var(--pos)' : r >= 18 ? 'var(--text)' : 'var(--neg)');
const agentCode = (a, i) =>
  ((a.agent_name || '').replace(/^agent/i, '').slice(0, 2).toUpperCase()) ||
  (a.name || '?').slice(0, 1).toUpperCase() ||
  String(i + 1);

// 연결률 게이지 (좌측 상담원 행)
function Gauge({ r }) {
  const col = rateColor(r);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>연결률</span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: col }}>{r}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-elev-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(r * 2, 100)}%`, height: '100%', borderRadius: 4, background: col, transition: 'width .5s ease' }} />
      </div>
    </div>
  );
}

// 연결DB 배너의 라이브 수치 한 칸
function LiveMetric({ label, value, color = 'var(--text)', hero }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: hero ? 5 : 4 }}>
      <span style={{ fontSize: hero ? 10 : 9.5, color: 'var(--text-faint)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="mono" style={{ fontSize: hero ? 30 : 16, fontWeight: hero ? 800 : 700, color, lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// 발급 대기 티어 미니 라벨
function TierMini({ color, label, value }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{label}</span>
      <b className="mono">{value}</b>
    </span>
  );
}

export default function ManagerView({ user }) {
  const cid = user?.center_id || 1;
  const [data, setData] = useState(null);
  const [lists, setLists] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);   // 선택(arm)된 DB — 한 번 더 누르면 연결
  const [connecting, setConnecting] = useState(false);
  const [activation, setActivation] = useState(null);    // 배타적 활성화 알림 {title, ts}
  const [search, setSearch] = useState('');
  const fileRef = useRef();

  const refresh = async () => {
    try {
      const [d, l] = await Promise.all([
        get(`/dashboard/${cid}`),
        get(`/lists/${cid}`),
      ]);
      setData(d);
      setLists(l);
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

  const updateList = async (id, patchBody) => {
    setLists(prev => prev.map(l => l.id === id ? { ...l, ...patchBody } : l));
    try {
      await patch(`/lists/${id}`, patchBody);
    } catch (e) {
      window.alert('갱신 실패: ' + e.message);
      refresh();
    }
  };

  const stop = (l) => updateList(l.id, { is_active: false });

  // 한 개 버튼: 선택(arm) ↔ 연결(commit). 같은 행 선택 다시 누르면 해제.
  const select = (id) => setSelectedId(prev => (prev === id ? null : id));
  const connect = async (l) => {
    setConnecting(true);
    try {
      await post('/admin/connect-list', { list_id: l.id });   // 배타적 활성: 그 DB만 is_active, 나머지 off (기록 보존)
      setActivation({ title: l.title, ts: Date.now() });
      setSelectedId(null);
      await refresh();
    } catch (e) {
      window.alert('연결 실패: ' + e.message);
    }
    setConnecting(false);
  };

  const agents = data?.agents || [];
  const onlineCount = agents.filter(a => a.online).length;

  // 팀 요약 (오늘 기준)
  const team = agents.reduce(
    (a, s) => ({
      calls: a.calls + (+s.today_calls || 0),
      connected: a.connected + (+s.today_connected || 0),
      positive: a.positive + (+s.today_positive || 0),
      talk: a.talk + (+s.today_talk_time || 0),
    }),
    { calls: 0, connected: 0, positive: 0, talk: 0 }
  );
  const teamRate = rate(team.connected, team.calls);

  const activeList = lists.find(l => l.is_active) || null;

  // 검색 (디비명 · 입수날짜 · 판매상)
  const ql = search.trim().toLowerCase();
  const visible = ql
    ? lists.filter(l =>
        (l.title || '').toLowerCase().includes(ql) ||
        String(l.uploaded_at || '').includes(ql) ||
        (l.supplier_tg || '').toLowerCase().includes(ql))
    : lists;

  return (
    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', maxWidth: 1320, margin: '0 auto' }}>
      <style>{`
        @keyframes tmSpin { to { transform: rotate(360deg); } }
        @keyframes tmIn { from { opacity:0; transform:translateY(-6px);} to {opacity:1; transform:none;} }
        .tm-spin{ display:inline-block; animation:tmSpin 1.1s linear infinite;}
        .tm-in{ animation:tmIn .35s ease both;}
      `}</style>

      {/* LEFT — 상담원 일과 · 업무수행 */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>상담원 일과 · 업무수행</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{onlineCount}/{agents.length} 온라인</div>
          </div>
        </div>

        {/* 팀 가동 실시간 히어로 배너 — 우측 연결DB 배너와 대칭 (biplays 6/10 "좌측 상담원 히어로 영역에도") */}
        <div style={{ margin: '14px 16px', padding: '15px 18px', borderRadius: 10, background: 'var(--info-soft)', border: '1px solid rgba(37,99,235,0.28)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, flexWrap: 'wrap' }}>
            <Led color="var(--info)" size={9} pulse={onlineCount > 0} />
            <span style={{ fontSize: 11, color: 'var(--info)', fontWeight: 700, letterSpacing: '0.02em' }}>팀 가동 · 실시간</span>
            <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' }}>{onlineCount}대 가동중</span>
            <span className="mono" style={{ fontSize: 11.5, color: rateColor(teamRate) }}>연결률 {teamRate}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flexWrap: 'wrap' }}>
            <LiveMetric label="당일 총 콜수" value={team.calls.toLocaleString()} color="var(--info)" hero />
            <LiveMetric label="통화시간" value={fmtTime(team.talk)} color="var(--text-dim)" />
            <LiveMetric label="연결" value={team.connected} color="var(--pos)" />
            <LiveMetric label="긍정" value={team.positive} color="var(--accent)" />
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>
            온라인 {onlineCount}명 / 총 {agents.length}명 · 팀 연결률 {teamRate}%
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {agents.map((a, i) => {
            const tr = rate(+a.today_connected || 0, +a.today_calls || 0);
            const cumRate = rate(+a.connected || 0, +a.total_calls || 0);
            const isCalling = a.online && a.phone_status === 'calling';
            const statusCol = !a.online ? 'var(--text-faint)' : isCalling ? 'var(--info)' : 'var(--pos)';
            const g = gradeFromRate(cumRate);
            const col = rateColor(tr);
            return (
              <div key={a.agent_name || i} style={{ display: 'grid', gridTemplateColumns: '34px 1fr 132px 60px', gap: 12, alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid var(--border-soft)', opacity: a.online ? 1 : 0.5 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: a.online ? col + '1c' : 'var(--bg-elev-2)', color: a.online ? col : 'var(--text-faint)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{agentCode(a, i)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>{a.name}</span>
                    <Led color={statusCol} size={8} pulse={isCalling} />
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>
                    {isCalling ? <span style={{ color: 'var(--pos)', fontWeight: 600 }}>통화중</span> : !a.online ? '오프라인' : '대기중'}
                    <span className="mono"> · 콜 {+a.today_calls || 0} · 긍정 <span style={{ color: 'var(--accent)' }}>{+a.today_positive || 0}</span></span>
                  </div>
                </div>
                <Gauge r={tr} />
                <div style={{ textAlign: 'right' }}>
                  <span className="tag" style={{ background: g.color + '22', color: g.color, borderColor: g.color + '33' }}>{g.grade}</span>
                </div>
              </div>
            );
          })}
          {agents.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 12 }}>상담원 로딩중…</div>
          )}
        </div>
      </div>

      {/* RIGHT — DB 관리 */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>DB 관리</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '업로드중…' : '+ DB 업로드'}
          </button>
        </div>

        {/* 연결DB 실시간 소켓 */}
        {activeList ? (
          <div style={{ padding: '15px 18px', borderRadius: 10, background: 'var(--pos-soft)', border: '1px solid rgba(22,163,74,0.3)', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, flexWrap: 'wrap' }}>
              <Led color="var(--pos)" size={9} pulse />
              <span style={{ fontSize: 11, color: 'var(--pos)', fontWeight: 700, letterSpacing: '0.02em' }}>연결 중 · 실시간</span>
              <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' }}>{activeList.title}</span>
              <span className="mono" style={{ fontSize: 11.5, color: +activeList.remaining < 300 ? 'var(--neg)' : 'var(--text-dim)' }}>잔여 {(+activeList.remaining || 0).toLocaleString()}건</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flexWrap: 'wrap' }}>
              <LiveMetric label="당일 총 콜수" value={team.calls.toLocaleString()} hero />
              <LiveMetric label="통화시간" value={fmtTime(team.talk)} color="var(--text-dim)" />
              <LiveMetric label="연결" value={activeList.connected ?? 0} color="var(--pos)" />
              <LiveMetric label="부재" value={activeList.no_answer ?? 0} color="var(--warn)" />
              <LiveMetric label="긍정" value={activeList.positive ?? 0} color="var(--accent)" />
              <LiveMetric label="거절" value={activeList.reject ?? 0} color="var(--text-dim)" />
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>
              {activeList.supplier_tg || '판매상 미지정'} · 입수 {new Date(activeList.uploaded_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })} · 전화기 {onlineCount}대 가동
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 10, background: 'var(--bg-elev-2)', border: '1px solid var(--border-soft)', marginBottom: 14 }}>
            <Led color="var(--text-faint)" size={9} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>연결된 DB 없음 — 아래에서 <strong>선택 → 연결</strong></span>
          </div>
        )}

        {/* 배타적 활성화 알림 */}
        {activation && (
          <div key={activation.ts} className="tm-in" style={{ padding: '11px 14px', borderRadius: 10, marginBottom: 14, background: 'var(--info-soft)', border: '1px solid rgba(37,99,235,0.28)', display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span className="tm-spin" style={{ fontSize: 13, marginTop: 1 }}>🔄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--info)', marginBottom: 3 }}>배타적 활성화 — {activation.title} 전환됨</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>이제 모든 상담원의 <b>다음 통화</b>는 이 DB에서만 발급됩니다. 기존 DB는 발급 중단·잠금(보존).</div>
            </div>
            <button onClick={() => setActivation(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
          </div>
        )}

        {/* 발급 대기 strip */}
        {activeList && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', borderRadius: 9, background: 'var(--bg-elev-2)', border: '1px solid var(--border-soft)', marginBottom: 14, fontSize: 11, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-faint)' }}>발급 대기</span>
            <TierMini color="var(--warn)" label="이월" value={activeList.no_answer ?? 0} />
            <TierMini color="var(--purple)" label="재콜" value={activeList.recall ?? 0} />
            <TierMini color="var(--info)" label="선착순" value={activeList.remaining ?? 0} />
            <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>부재 우선 → 재콜 → 선착순</span>
          </div>
        )}

        {/* 업로드 결과 (있을 때만) */}
        {uploadResult && (
          <div className="card elev" style={{ marginBottom: 12, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>업로드 결과</span>
              <button onClick={() => setUploadResult(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11 }}>닫기</button>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
              <span>전체 <strong className="mono">{uploadResult.total}</strong></span>
              <span style={{ color: 'var(--pos)' }}>유효 <strong className="mono">{uploadResult.valid}</strong></span>
              <span style={{ color: 'var(--neg)' }}>오류 <strong className="mono">{uploadResult.invalid_phone}</strong></span>
              <span style={{ color: 'var(--warn)' }}>중복 <strong className="mono">{uploadResult.duplicate}</strong></span>
              <span style={{ color: 'var(--info)' }}>품질 <strong className="mono">{uploadResult.quality}%</strong></span>
            </div>

            {/* 감지된 열 매핑 (몇 번째 열을 무엇으로 읽었는지) */}
            {uploadResult.detected_columns && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-soft)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                <div>
                  감지된 열 — <b style={{ color: 'var(--info)' }}>전화</b>「{uploadResult.detected_columns.phone}」
                  {uploadResult.detected_columns.name && <> · <b>이름</b>「{uploadResult.detected_columns.name}」</>}
                  {uploadResult.detected_columns.region && <> · <b>지역</b>「{uploadResult.detected_columns.region}」</>}
                </div>
                <div className="mono" style={{ color: 'var(--text-faint)', marginTop: 2, wordBreak: 'break-all' }}>
                  열 순서: {(uploadResult.detected_columns.all || []).map((c, i) => `${i + 1}.${c}`).join(' · ')}
                </div>
              </div>
            )}

            {/* 중복 출처 분석 (어느 이전 DB와 겹쳤는지) */}
            {uploadResult.dup_by_list?.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-soft)', fontSize: 11, color: 'var(--text-dim)' }}>
                <span style={{ color: 'var(--warn)', fontWeight: 700 }}>중복 출처</span>{' '}
                {uploadResult.dup_by_list.map(d => `${d.list}(${d.count})`).join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* 검색 */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 디비명 · 입수날짜 · 판매상 검색"
          style={{ width: '100%', fontSize: 12, padding: '8px 12px', marginBottom: 10 }} />

        {/* 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lists.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-faint)', fontSize: 12 }}>DB 없음 — 업로드하세요</div>
          )}
          {lists.length > 0 && visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-faint)', fontSize: 12 }}>검색 결과 없음</div>
          )}
          {visible.map(l => {
            const isSel = selectedId === l.id;
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderBottom: '1px solid var(--border-soft)', background: l.is_active ? 'var(--pos-soft)' : isSel ? 'var(--accent-soft)' : 'transparent', borderRadius: l.is_active || isSel ? 8 : 0 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</span>
                    {l.is_test && <span className="tag warn">TEST</span>}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{l.supplier_tg || '—'}</div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>입수</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>
                    {new Date(l.uploaded_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {l.is_active ? (
                    <>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--pos)', whiteSpace: 'nowrap' }}>
                        <Led color="var(--pos)" size={7} pulse /> 연결 중
                      </span>
                      <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => stop(l)}>정지</button>
                    </>
                  ) : isSel ? (
                    <button className="btn primary" style={{ padding: '6px 14px', fontSize: 12 }} disabled={connecting} onClick={() => connect(l)}>
                      {connecting ? '연결중…' : '연결'}
                    </button>
                  ) : (
                    <button className="btn" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => select(l.id)}>선택</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {activeList && selectedId && selectedId !== activeList.id && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
            연결 시 <strong style={{ color: 'var(--text)' }}>{activeList.title}</strong> 발급 중단 · 새 DB로 배타적 전환됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
