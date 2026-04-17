import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ─── Mock Data ───
const MOCK_CENTERS = [
  { id: 1, name: "서울 강남센터", owner: "김센터장", phones: 5, plan: "premium", active: true, totalCalls: 1240, connected: 312, rate: 25.2 },
  { id: 2, name: "부산 해운대센터", owner: "박센터장", phones: 5, plan: "basic", active: true, totalCalls: 890, connected: 178, rate: 20.0 },
  { id: 3, name: "대구 동성로센터", owner: "이센터장", phones: 3, plan: "basic", active: false, totalCalls: 0, connected: 0, rate: 0 },
];

const MOCK_PHONES = [
  { id: 1, sip: "2001", status: "calling", agent: "상담원A", calls: 80, connected: 30, rate: 37.5 },
  { id: 2, sip: "2002", status: "idle", agent: "상담원B", calls: 60, connected: 10, rate: 16.7 },
  { id: 3, sip: "2003", status: "busy", agent: "상담원C", calls: 100, connected: 20, rate: 20.0 },
  { id: 4, sip: "2004", status: "idle", agent: "상담원D", calls: 45, connected: 15, rate: 33.3 },
  { id: 5, sip: "2005", status: "calling", agent: "상담원E", calls: 35, connected: 3, rate: 8.6 },
];

const MOCK_CUSTOMERS = [
  { id: 1, name: "홍길동", phone: "010-1234-5678", status: "done", assignedTo: "2001", memo: "관심있음" },
  { id: 2, name: "김철수", phone: "010-2345-6789", status: "retry", assignedTo: "2001", memo: "부재중" },
  { id: 3, name: "이영희", phone: "010-3456-7890", status: "pending", assignedTo: "2002", memo: "" },
  { id: 4, name: "박민수", phone: "010-4567-8901", status: "calling", assignedTo: "2003", memo: "" },
  { id: 5, name: "최지현", phone: "010-5678-9012", status: "done", assignedTo: "2002", memo: "계약완료" },
  { id: 6, name: "정수빈", phone: "010-6789-0123", status: "pending", assignedTo: "2004", memo: "" },
  { id: 7, name: "강하늘", phone: "010-7890-1234", status: "done", assignedTo: "2005", memo: "거절" },
  { id: 8, name: "윤서연", phone: "010-8901-2345", status: "pending", assignedTo: "2003", memo: "" },
];

const MOCK_LISTS = [
  { id: 1, name: "김사장 DB 4월", source: "김사장", isTest: false, count: 500, connectRate: 28.5, uploadedAt: "2026-04-15" },
  { id: 2, name: "박사장 DB 테스트", source: "박사장", isTest: true, count: 100, connectRate: 8.2, uploadedAt: "2026-04-16" },
  { id: 3, name: "이사장 DB 3월", source: "이사장", isTest: false, count: 300, connectRate: 41.0, uploadedAt: "2026-03-20" },
];

const MOCK_RECORDINGS = [
  { id: 1, customer: "홍길동", phone: "2001", duration: 185, time: "14:32", date: "2026-04-17", file: "2001_01012345678.wav" },
  { id: 2, customer: "최지현", phone: "2002", duration: 92, time: "15:10", date: "2026-04-17", file: "2002_01056789012.wav" },
  { id: 3, customer: "강하늘", phone: "2005", duration: 45, time: "11:20", date: "2026-04-17", file: "2005_01078901234.wav" },
  { id: 4, customer: "김민호", phone: "2001", duration: 210, time: "09:45", date: "2026-04-16", file: "2001_01098765432.wav" },
];

const HOURLY_DATA = Array.from({ length: 9 }, (_, i) => ({
  hour: `${9 + i}시`,
  calls: Math.floor(Math.random() * 40) + 10,
  connected: Math.floor(Math.random() * 15) + 2,
}));

const PHONE_CHART = MOCK_PHONES.map(p => ({ name: p.sip, calls: p.calls, connected: p.connected }));

// ─── Styles ───
const theme = {
  bg: "#0a0e17",
  surface: "#111827",
  surfaceHover: "#1a2234",
  card: "#151d2e",
  border: "#1e293b",
  borderLight: "#2a3a52",
  accent: "#3b82f6",
  accentGlow: "rgba(59,130,246,0.15)",
  green: "#10b981",
  greenBg: "rgba(16,185,129,0.12)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.12)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.12)",
  purple: "#8b5cf6",
  purpleBg: "rgba(139,92,246,0.12)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#64748b",
};

const font = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";
const fontSans = "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif";

// ─── Components ───
const StatusDot = ({ status }) => {
  const colors = { calling: theme.green, idle: theme.textDim, busy: theme.amber };
  const labels = { calling: "통화중", idle: "대기", busy: "연결중" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: colors[status] || theme.textDim,
        boxShadow: status === "calling" ? `0 0 8px ${theme.green}` : "none",
        animation: status === "calling" ? "pulse 2s infinite" : "none",
      }} />
      <span style={{ color: colors[status], fontFamily: font, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
        {labels[status] || status}
      </span>
    </span>
  );
};

const Badge = ({ children, color = theme.accent, bg }) => (
  <span style={{
    display: "inline-block", padding: "3px 10px", borderRadius: 4,
    background: bg || `${color}20`, color,
    fontSize: 11, fontFamily: font, fontWeight: 500, letterSpacing: 0.5,
  }}>{children}</span>
);

const StatCard = ({ label, value, sub, color = theme.accent, icon }) => (
  <div style={{
    background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 8,
    padding: "18px 20px", flex: 1, minWidth: 140, position: "relative", overflow: "hidden",
  }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color }} />
    <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 600, color: theme.text, fontFamily: font, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6, fontFamily: fontSans }}>{sub}</div>}
  </div>
);

const Table = ({ columns, data, onRow }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: fontSans }}>
      <thead>
        <tr>{columns.map((c, i) => (
          <th key={i} style={{
            textAlign: c.align || "left", padding: "10px 14px",
            color: theme.textDim, fontSize: 11, fontFamily: font,
            textTransform: "uppercase", letterSpacing: 1.2,
            borderBottom: `1px solid ${theme.border}`, fontWeight: 500,
          }}>{c.title}</th>
        ))}</tr>
      </thead>
      <tbody>{data.map((row, ri) => (
        <tr key={ri} onClick={() => onRow?.(row)} style={{
          cursor: onRow ? "pointer" : "default",
          borderBottom: `1px solid ${theme.border}`,
          transition: "background .15s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = theme.surfaceHover}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          {columns.map((c, ci) => (
            <td key={ci} style={{ padding: "12px 14px", color: theme.text, textAlign: c.align || "left" }}>
              {c.render ? c.render(row) : row[c.key]}
            </td>
          ))}
        </tr>
      ))}</tbody>
    </table>
  </div>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", style: sx, disabled }) => {
  const base = {
    border: "none", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: fontSans, fontWeight: 500, transition: "all .15s",
    opacity: disabled ? 0.5 : 1,
    ...(size === "sm" ? { padding: "6px 14px", fontSize: 12 } : { padding: "10px 20px", fontSize: 13 }),
  };
  const variants = {
    primary: { background: theme.accent, color: "#fff" },
    danger: { background: theme.red, color: "#fff" },
    ghost: { background: "transparent", color: theme.textMuted, border: `1px solid ${theme.border}` },
    success: { background: theme.green, color: "#fff" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...sx }}>{children}</button>;
};

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: fontSans }}>
    <div onClick={() => onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11, padding: 2,
      background: checked ? theme.accent : theme.border, transition: "background .2s", cursor: "pointer",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transform: checked ? "translateX(18px)" : "translateX(0)", transition: "transform .2s",
      }} />
    </div>
    {label}
  </label>
);

const SideNav = ({ items, active, onSelect, title, subtitle }) => (
  <div style={{
    width: 220, background: theme.surface, borderRight: `1px solid ${theme.border}`,
    display: "flex", flexDirection: "column", flexShrink: 0, height: "100%",
  }}>
    <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, fontFamily: fontSans }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{subtitle}</div>}
    </div>
    <nav style={{ padding: "8px 0", flex: 1 }}>
      {items.map(item => (
        <div key={item.key} onClick={() => onSelect(item.key)} style={{
          padding: "10px 18px", cursor: "pointer", fontSize: 13, fontFamily: fontSans,
          color: active === item.key ? theme.accent : theme.textMuted,
          background: active === item.key ? theme.accentGlow : "transparent",
          borderLeft: active === item.key ? `2px solid ${theme.accent}` : "2px solid transparent",
          transition: "all .15s",
        }}>{item.icon} {item.label}</div>
      ))}
    </nav>
  </div>
);

const Modal = ({ open, onClose, title, children, width = 480 }) => {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 12, width, maxWidth: "90vw", maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${theme.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: theme.text, fontFamily: fontSans }}>{title}</span>
          <span onClick={onClose} style={{ cursor: "pointer", color: theme.textDim, fontSize: 18 }}>×</span>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
};

const InputField = ({ label, value, onChange, type = "text", placeholder }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
      width: "100%", padding: "9px 12px", background: theme.bg, border: `1px solid ${theme.border}`,
      borderRadius: 6, color: theme.text, fontSize: 13, fontFamily: fontSans, outline: "none", boxSizing: "border-box",
    }} />
  </div>
);

const maskPhone = (phone) => phone.replace(/(\d{3})-(\d{4})-(\d{4})/, "$1-****-$3");

// ─── Pages ───

// === LOGIN ===
const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: theme.bg, fontFamily: fontSans,
    }}>
      <div style={{
        width: 380, background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 16, padding: 36,
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontFamily: font, color: theme.accent, textTransform: "uppercase", letterSpacing: 3, marginBottom: 8 }}>TM Platform</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: theme.text }}>로그인</div>
        </div>
        <InputField label="이메일" value={email} onChange={setEmail} placeholder="admin@tm.co.kr" />
        <InputField label="비밀번호" value={pass} onChange={setPass} type="password" placeholder="••••••••" />
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <Btn onClick={() => onLogin("super")} style={{ flex: 1 }}>슈퍼어드민</Btn>
          <Btn onClick={() => onLogin("center")} variant="ghost" style={{ flex: 1 }}>센터장</Btn>
          <Btn onClick={() => onLogin("agent")} variant="ghost" style={{ flex: 1 }}>상담원</Btn>
        </div>
      </div>
    </div>
  );
};

// === SUPER ADMIN ===
const SuperAdmin = ({ onLogout, onGoCenter }) => {
  const [tab, setTab] = useState("centers");
  const [modal, setModal] = useState(false);
  const navItems = [
    { key: "centers", label: "센터 관리", icon: "◆" },
    { key: "stats", label: "전체 통계", icon: "◈" },
    { key: "billing", label: "수익 관리", icon: "◇" },
  ];
  return (
    <div style={{ display: "flex", height: "100vh", background: theme.bg, color: theme.text }}>
      <SideNav items={navItems} active={tab} onSelect={setTab} title="TM Platform" subtitle="super admin" />
      <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: fontSans }}>
              {tab === "centers" && "센터 관리"}
              {tab === "stats" && "전체 통계"}
              {tab === "billing" && "수익 관리"}
            </div>
            <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginTop: 4 }}>2026.04.17</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {tab === "centers" && <Btn onClick={() => setModal(true)} size="sm">+ 센터 생성</Btn>}
            <Btn onClick={onLogout} variant="ghost" size="sm">로그아웃</Btn>
          </div>
        </div>

        {tab === "centers" && (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
              <StatCard label="총 센터" value={MOCK_CENTERS.length} color={theme.accent} />
              <StatCard label="총 콜" value="2,130" sub="오늘 기준" color={theme.purple} />
              <StatCard label="평균 연결률" value="22.6%" color={theme.green} />
              <StatCard label="활성 전화기" value="13대" color={theme.amber} />
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Table columns={[
                { title: "센터명", key: "name", render: r => (
                  <span style={{ cursor: "pointer", color: theme.accent }} onClick={() => onGoCenter()}>{r.name}</span>
                )},
                { title: "센터장", key: "owner" },
                { title: "전화기", key: "phones", align: "center" },
                { title: "총 콜", key: "totalCalls", align: "right", render: r => r.totalCalls.toLocaleString() },
                { title: "연결", key: "connected", align: "right" },
                { title: "연결률", align: "right", render: r => <span style={{ color: r.rate > 20 ? theme.green : theme.red }}>{r.rate}%</span> },
                { title: "요금제", render: r => <Badge color={r.plan === "premium" ? theme.purple : theme.textDim}>{r.plan}</Badge> },
                { title: "상태", render: r => <Badge color={r.active ? theme.green : theme.red}>{r.active ? "활성" : "비활성"}</Badge> },
              ]} data={MOCK_CENTERS} />
            </div>
          </>
        )}

        {tab === "stats" && (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
              <StatCard label="금일 총 콜" value="2,130" color={theme.accent} />
              <StatCard label="금일 연결" value="490" color={theme.green} />
              <StatCard label="금일 연결률" value="23.0%" color={theme.amber} />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 300, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>센터별 연결률</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={MOCK_CENTERS.map(c => ({ name: c.name.slice(0, 4), rate: c.rate }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="name" stroke={theme.textDim} fontSize={11} />
                    <YAxis stroke={theme.textDim} fontSize={11} />
                    <Bar dataKey="rate" fill={theme.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 300, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>센터별 콜 수</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={MOCK_CENTERS.map(c => ({ name: c.name.slice(0, 4), calls: c.totalCalls, connected: c.connected }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="name" stroke={theme.textDim} fontSize={11} />
                    <YAxis stroke={theme.textDim} fontSize={11} />
                    <Bar dataKey="calls" fill={theme.purple} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="connected" fill={theme.green} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {tab === "billing" && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {MOCK_CENTERS.map(c => (
              <div key={c.id} style={{
                flex: 1, minWidth: 200, background: theme.card, border: `1px solid ${theme.border}`,
                borderRadius: 10, padding: 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, marginBottom: 4, fontFamily: fontSans }}>{c.name}</div>
                <Badge color={c.plan === "premium" ? theme.purple : theme.textDim}>{c.plan}</Badge>
                <div style={{ marginTop: 16, fontSize: 24, fontWeight: 600, fontFamily: font, color: theme.text }}>
                  {c.plan === "premium" ? "₩890,000" : "₩490,000"}
                </div>
                <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, marginTop: 4 }}>/ 월</div>
              </div>
            ))}
          </div>
        )}

        <Modal open={modal} onClose={() => setModal(false)} title="새 센터 생성">
          <InputField label="센터명" value="" onChange={() => {}} placeholder="예: 서울 강남센터" />
          <InputField label="센터장 이메일" value="" onChange={() => {}} placeholder="admin@center.kr" />
          <InputField label="전화기 수" value="5" onChange={() => {}} type="number" />
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>요금제</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn size="sm">Basic</Btn>
              <Btn size="sm" variant="ghost">Premium</Btn>
            </div>
          </div>
          <Btn onClick={() => setModal(false)} style={{ width: "100%", marginTop: 20 }}>생성하기</Btn>
        </Modal>
      </div>
    </div>
  );
};

// === CENTER ADMIN ===
const CenterAdmin = ({ onLogout }) => {
  const [tab, setTab] = useState("dashboard");
  const [showPhone, setShowPhone] = useState(false);
  const [distMode, setDistMode] = useState("auto");
  const [testRunning, setTestRunning] = useState(false);
  const [testProgress, setTestProgress] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);

  const navItems = [
    { key: "dashboard", label: "대시보드", icon: "◆" },
    { key: "db", label: "DB 관리", icon: "◈" },
    { key: "phones", label: "전화기 관리", icon: "◇" },
    { key: "recordings", label: "녹음 관리", icon: "♪" },
    { key: "performance", label: "상담원 성과", icon: "★" },
    { key: "settings", label: "설정", icon: "⚙" },
  ];

  const startTest = () => {
    setTestRunning(true);
    setTestProgress({ tm1: { tried: 0, connected: 0 }, tm2: { tried: 0, connected: 0 }, tm3: { tried: 0, connected: 0 }, tm4: { tried: 0, connected: 0 }, tm5: { tried: 0, connected: 0 } });
    const iv = setInterval(() => {
      setTestProgress(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k].tried < 20) {
            next[k] = { ...next[k], tried: next[k].tried + 1, connected: next[k].connected + (Math.random() > 0.7 ? 1 : 0) };
          }
        });
        const allDone = Object.values(next).every(v => v.tried >= 20);
        if (allDone) clearInterval(iv);
        return { ...next };
      });
    }, 300);
  };

  const stopTest = () => { setTestRunning(false); setTestProgress(null); };

  return (
    <div style={{ display: "flex", height: "100vh", background: theme.bg, color: theme.text }}>
      <SideNav items={navItems} active={tab} onSelect={setTab} title="서울 강남센터" subtitle="center admin" />
      <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: fontSans }}>
              {navItems.find(n => n.key === tab)?.label}
            </div>
            <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginTop: 4 }}>실시간 업데이트</div>
          </div>
          <Btn onClick={onLogout} variant="ghost" size="sm">로그아웃</Btn>
        </div>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard label="총 콜" value="320" color={theme.accent} />
              <StatCard label="연결" value="78" color={theme.green} />
              <StatCard label="연결률" value="24.4%" color={theme.amber} />
              <StatCard label="활성 전화기" value="3 / 5" color={theme.purple} />
            </div>

            <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>전화기 실시간 상태</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              {MOCK_PHONES.map(p => (
                <div key={p.id} style={{
                  flex: 1, minWidth: 110, background: theme.card, border: `1px solid ${theme.border}`,
                  borderRadius: 8, padding: "14px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: font, color: theme.text, marginBottom: 6 }}>{p.sip}</div>
                  <StatusDot status={p.status} />
                  <div style={{ fontSize: 11, color: theme.textDim, marginTop: 8, fontFamily: fontSans }}>{p.agent}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: font, color: theme.text, marginTop: 6 }}>{p.calls}<span style={{ fontSize: 11, color: theme.textDim }}>콜</span></div>
                  <div style={{ fontSize: 12, color: p.rate > 25 ? theme.green : theme.textMuted, fontFamily: font }}>{p.rate}%</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 280, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>시간별 콜 추이</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={HOURLY_DATA}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="hour" stroke={theme.textDim} fontSize={11} />
                    <YAxis stroke={theme.textDim} fontSize={11} />
                    <Line type="monotone" dataKey="calls" stroke={theme.accent} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="connected" stroke={theme.green} strokeWidth={2} dot={false} />
                    <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 280, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>전화기별 성과</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={PHONE_CHART}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="name" stroke={theme.textDim} fontSize={11} />
                    <YAxis stroke={theme.textDim} fontSize={11} />
                    <Bar dataKey="calls" fill={theme.accent} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="connected" fill={theme.green} radius={[3, 3, 0, 0]} />
                    <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* DB MANAGEMENT */}
        {tab === "db" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <Btn onClick={() => setUploadModal(true)} size="sm">엑셀 업로드</Btn>
              {!testRunning ? (
                <Btn onClick={startTest} size="sm" variant="ghost">100건 테스트</Btn>
              ) : (
                <Btn onClick={stopTest} size="sm" variant="danger">STOP</Btn>
              )}
              <Btn size="sm" variant="ghost">자동 분배</Btn>
            </div>

            {testRunning && testProgress && (
              <div style={{
                background: theme.amberBg, border: `1px solid ${theme.amber}40`, borderRadius: 10,
                padding: 20, marginBottom: 20,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.amber, fontFamily: fontSans, marginBottom: 12 }}>
                  테스트 진행중...
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {Object.entries(testProgress).map(([k, v]) => {
                    const rate = v.tried > 0 ? ((v.connected / v.tried) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={k} style={{
                        flex: 1, minWidth: 90, background: theme.card, borderRadius: 6, padding: "10px 12px", textAlign: "center",
                      }}>
                        <div style={{ fontSize: 12, fontFamily: font, color: theme.text, fontWeight: 500 }}>{k.toUpperCase()}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, fontFamily: font, color: theme.text, marginTop: 4 }}>{v.tried}/20</div>
                        <div style={{ fontSize: 11, color: parseFloat(rate) > 25 ? theme.green : theme.textMuted, fontFamily: font }}>{rate}%</div>
                        <div style={{ height: 3, background: theme.border, borderRadius: 2, marginTop: 6 }}>
                          <div style={{ height: 3, background: theme.amber, borderRadius: 2, width: `${(v.tried / 20) * 100}%`, transition: "width .3s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {Object.values(testProgress).every(v => v.tried >= 20) && (() => {
                  const total = Object.values(testProgress).reduce((a, v) => a + v.connected, 0);
                  return (
                    <div style={{ marginTop: 14, padding: "10px 14px", background: theme.card, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: theme.text, fontFamily: fontSans }}>전체 결과: 100건 중 {total}건 연결 ({((total / 100) * 100).toFixed(1)}%)</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn size="sm" variant="success">채택</Btn>
                        <Btn size="sm" variant="danger">폐기</Btn>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>업로드된 리스트</div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
              <Table columns={[
                { title: "리스트명", key: "name" },
                { title: "출처", key: "source", render: r => <Badge color={theme.purple}>{r.source}</Badge> },
                { title: "건수", key: "count", align: "right" },
                { title: "연결률", align: "right", render: r => (
                  <span style={{ color: r.connectRate > 25 ? theme.green : r.connectRate > 15 ? theme.amber : theme.red, fontFamily: font, fontWeight: 500 }}>
                    {r.connectRate}%
                  </span>
                )},
                { title: "구분", render: r => <Badge color={r.isTest ? theme.amber : theme.green}>{r.isTest ? "테스트" : "본DB"}</Badge> },
                { title: "업로드일", key: "uploadedAt" },
              ]} data={MOCK_LISTS} />
            </div>

            <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>고객 목록</div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Table columns={[
                { title: "이름", key: "name" },
                { title: "전화번호", render: r => (
                  <span style={{ fontFamily: font, fontSize: 12 }}>{showPhone ? r.phone : maskPhone(r.phone)}</span>
                )},
                { title: "상태", render: r => {
                  const c = { pending: theme.textDim, calling: theme.amber, done: theme.green, retry: theme.red };
                  const l = { pending: "대기", calling: "통화중", done: "완료", retry: "재시도" };
                  return <Badge color={c[r.status]}>{l[r.status]}</Badge>;
                }},
                { title: "배정", key: "assignedTo", render: r => <span style={{ fontFamily: font, fontSize: 12 }}>{r.assignedTo}</span> },
                { title: "메모", key: "memo", render: r => <span style={{ color: theme.textMuted }}>{r.memo || "—"}</span> },
              ]} data={MOCK_CUSTOMERS} />
            </div>

            <Modal open={uploadModal} onClose={() => setUploadModal(false)} title="엑셀 업로드">
              <InputField label="리스트명" value="" onChange={() => {}} placeholder="예: 김사장 DB 4월" />
              <InputField label="출처 (DB 업자)" value="" onChange={() => {}} placeholder="예: 김사장" />
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>파일 선택</div>
                <div style={{
                  border: `2px dashed ${theme.border}`, borderRadius: 8, padding: "30px 20px",
                  textAlign: "center", color: theme.textDim, fontSize: 13, fontFamily: fontSans,
                }}>
                  .xlsx / .csv 파일을 드래그하거나 클릭
                </div>
              </div>
              <Toggle checked={false} onChange={() => {}} label="테스트 모드로 업로드" />
              <Btn onClick={() => setUploadModal(false)} style={{ width: "100%", marginTop: 20 }}>업로드</Btn>
            </Modal>
          </>
        )}

        {/* PHONE MANAGEMENT */}
        {tab === "phones" && (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard label="총 전화기" value="5대" color={theme.accent} />
              <StatCard label="통화중" value="2대" color={theme.green} />
              <StatCard label="대기" value="2대" color={theme.textDim} />
              <StatCard label="연결중" value="1대" color={theme.amber} />
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden" }}>
              <Table columns={[
                { title: "SIP", key: "sip", render: r => <span style={{ fontFamily: font, fontWeight: 500 }}>{r.sip}</span> },
                { title: "상태", render: r => <StatusDot status={r.status} /> },
                { title: "상담원", key: "agent" },
                { title: "총 콜", key: "calls", align: "right" },
                { title: "연결", key: "connected", align: "right" },
                { title: "연결률", align: "right", render: r => (
                  <span style={{ color: r.rate > 25 ? theme.green : theme.red, fontFamily: font }}>{r.rate}%</span>
                )},
              ]} data={MOCK_PHONES} />
            </div>
          </>
        )}

        {/* RECORDINGS */}
        {tab === "recordings" && (
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden" }}>
            <Table columns={[
              { title: "날짜", key: "date" },
              { title: "시간", key: "time" },
              { title: "고객", key: "customer" },
              { title: "전화기", key: "phone", render: r => <span style={{ fontFamily: font }}>{r.phone}</span> },
              { title: "길이", render: r => {
                const m = Math.floor(r.duration / 60);
                const s = r.duration % 60;
                return <span style={{ fontFamily: font }}>{m}:{s.toString().padStart(2, "0")}</span>;
              }},
              { title: "재생", render: r => <Btn size="sm" variant="ghost">▶</Btn> },
            ]} data={MOCK_RECORDINGS} />
          </div>
        )}

        {/* PERFORMANCE */}
        {tab === "performance" && (
          <>
            <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
              {MOCK_PHONES.map(p => (
                <div key={p.id} style={{
                  flex: 1, minWidth: 110, background: theme.card, border: `1px solid ${theme.border}`,
                  borderRadius: 10, padding: "18px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{p.sip}</div>
                  <div style={{ fontSize: 13, fontFamily: fontSans, color: theme.textMuted, marginBottom: 4 }}>{p.agent}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: font, color: p.rate > 25 ? theme.green : p.rate > 15 ? theme.amber : theme.red }}>{p.rate}%</div>
                  <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font, marginTop: 4 }}>{p.connected}/{p.calls}콜</div>
                  <div style={{ height: 4, background: theme.border, borderRadius: 2, marginTop: 10 }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${p.rate}%`, background: p.rate > 25 ? theme.green : p.rate > 15 ? theme.amber : theme.red }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 12, color: theme.textDim, fontFamily: font, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>상담원별 비교</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={PHONE_CHART} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis type="number" stroke={theme.textDim} fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke={theme.textDim} fontSize={11} width={50} />
                  <Bar dataKey="calls" fill={theme.accent} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="connected" fill={theme.green} radius={[0, 3, 3, 0]} />
                  <Tooltip contentStyle={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, fontFamily: fontSans, marginBottom: 16 }}>DB 분배 방식</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn size="sm" variant={distMode === "auto" ? "primary" : "ghost"} onClick={() => setDistMode("auto")}>자동 (균등 분배)</Btn>
                <Btn size="sm" variant={distMode === "manual" ? "primary" : "ghost"} onClick={() => setDistMode("manual")}>수동 (직접 배정)</Btn>
              </div>
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, fontFamily: fontSans, marginBottom: 16 }}>전화번호 노출</div>
              <Toggle checked={showPhone} onChange={setShowPhone} label={showPhone ? "전체 표시 (010-1234-5678)" : "가림 처리 (010-****-5678)"} />
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, fontFamily: fontSans, marginBottom: 16 }}>요금제</div>
              <Badge color={theme.purple}>Premium</Badge>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, fontFamily: fontSans }}>녹음 · 통계 · 데이터 분석 포함</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// === AGENT ===
const AgentPage = ({ onLogout }) => {
  const [state, setState] = useState("idle");
  const [customer, setCustomer] = useState(null);
  const [memo, setMemo] = useState("");
  const [callTime, setCallTime] = useState(0);
  const [stats, setStats] = useState({ calls: 0, connected: 0 });
  const timerRef = useRef(null);

  const nextCustomer = () => {
    const pool = MOCK_CUSTOMERS.filter(c => c.status === "pending");
    const c = pool[Math.floor(Math.random() * pool.length)] || MOCK_CUSTOMERS[0];
    setCustomer(c);
    setState("ready");
    setMemo("");
    setCallTime(0);
  };

  const startCall = () => {
    setState("calling");
    timerRef.current = setInterval(() => setCallTime(t => t + 1), 1000);
    setTimeout(() => {
      clearInterval(timerRef.current);
      const connected = Math.random() > 0.4;
      setState(connected ? "connected" : "failed");
      if (connected) {
        timerRef.current = setInterval(() => setCallTime(t => t + 1), 1000);
      }
      setStats(s => ({ calls: s.calls + 1, connected: s.connected + (connected ? 1 : 0) }));
    }, 2000 + Math.random() * 2000);
  };

  const endCall = () => {
    clearInterval(timerRef.current);
    setState("ended");
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const stateColors = { idle: theme.textDim, ready: theme.accent, calling: theme.amber, connected: theme.green, failed: theme.red, ended: theme.textDim };
  const stateLabels = { idle: "대기", ready: "준비", calling: "발신중...", connected: "통화중", failed: "연결실패", ended: "통화종료" };

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", background: theme.bg, fontFamily: fontSans, padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 20, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${theme.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>상담원 2001</div>
            <div style={{ fontSize: 11, color: theme.textDim, fontFamily: font }}>서울 강남센터</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontFamily: font, color: theme.textDim }}>
              {stats.calls}콜 / {stats.connected}연결
            </div>
            <div style={{ fontSize: 12, fontFamily: font, color: stats.calls > 0 ? theme.green : theme.textDim, fontWeight: 500 }}>
              {stats.calls > 0 ? ((stats.connected / stats.calls) * 100).toFixed(1) : "0.0"}%
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <div style={{
            width: 120, height: 120, borderRadius: "50%", margin: "0 auto 20px",
            border: `3px solid ${stateColors[state]}`,
            background: `${stateColors[state]}15`,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            boxShadow: state === "connected" ? `0 0 30px ${theme.green}30` : state === "calling" ? `0 0 30px ${theme.amber}30` : "none",
            transition: "all .3s",
          }}>
            <div style={{ fontSize: 12, color: stateColors[state], fontFamily: font, textTransform: "uppercase", letterSpacing: 1 }}>
              {stateLabels[state]}
            </div>
            {(state === "calling" || state === "connected") && (
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: font, color: theme.text, marginTop: 4 }}>
                {formatTime(callTime)}
              </div>
            )}
          </div>

          {customer && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: theme.text }}>{customer.name}</div>
              <div style={{ fontSize: 13, color: theme.textDim, fontFamily: font, marginTop: 4 }}>
                {maskPhone(customer.phone)}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {state === "idle" && <Btn onClick={nextCustomer} style={{ width: "100%", padding: "14px 0", fontSize: 15 }}>다음 고객</Btn>}
            {state === "ready" && <Btn onClick={startCall} variant="success" style={{ width: "100%", padding: "14px 0", fontSize: 15 }}>전화 걸기</Btn>}
            {state === "calling" && <Btn variant="ghost" disabled style={{ width: "100%", padding: "14px 0" }}>발신중...</Btn>}
            {state === "connected" && <Btn onClick={endCall} variant="danger" style={{ width: "100%", padding: "14px 0", fontSize: 15 }}>통화 종료</Btn>}
            {(state === "failed" || state === "ended") && (
              <Btn onClick={nextCustomer} style={{ width: "100%", padding: "14px 0", fontSize: 15 }}>다음 고객</Btn>
            )}
          </div>
        </div>

        {/* Memo */}
        {customer && (
          <div style={{ padding: "0 20px 20px" }}>
            <textarea
              value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="메모 입력..."
              style={{
                width: "100%", height: 70, padding: "10px 12px", background: theme.bg,
                border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text,
                fontSize: 13, fontFamily: fontSans, resize: "none", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${theme.border}`,
          display: "flex", justifyContent: "center",
        }}>
          <Btn onClick={onLogout} variant="ghost" size="sm">로그아웃</Btn>
        </div>
      </div>
    </div>
  );
};

// ─── App ───
export default function App() {
  const [role, setRole] = useState(null);
  const login = (r) => setRole(r);
  const logout = () => setRole(null);

  if (!role) return <LoginPage onLogin={login} />;
  if (role === "super") return <SuperAdmin onLogout={logout} onGoCenter={() => setRole("center")} />;
  if (role === "center") return <CenterAdmin onLogout={logout} />;
  if (role === "agent") return <AgentPage onLogout={logout} />;
}
