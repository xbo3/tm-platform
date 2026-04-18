import { useState, useEffect, useRef } from "react";

const T = {
  bg: "#000000", card: "#0a0a0a", border: "#141414",
  text: "#e8e8e8", dim: "#666666", muted: "#333333",
  green: "#00ff88", red: "#ff2d55", blue: "#00aaff",
  cyan: "#00e5ff", yellow: "#ffd600", orange: "#ff9100",
  purple: "#b388ff", pink: "#ff4081",
};

const ICONS = {
  D: (c) => <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.5"/><circle cx="8" cy="8" r="2.5" fill={c}/></svg>,
  B: (c) => <svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke={c} strokeWidth="1.5"/><rect x="6" y="6" width="4" height="4" rx="1" fill={c}/></svg>,
  A: (c) => <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,2 14,14 2,14" fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><circle cx="8" cy="10" r="2" fill={c}/></svg>,
  E: (c) => <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 10.5,6 16,6.5 12,10.5 13,16 8,13 3,16 4,10.5 0,6.5 5.5,6" fill="none" stroke={c} strokeWidth="1.2"/></svg>,
  C: (c) => <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8,2 L14,8 L8,14 L2,8 Z" fill="none" stroke={c} strokeWidth="1.5"/><circle cx="8" cy="8" r="2" fill={c}/></svg>,
};

const AGENTS = [
  { id: "D", name: "최유나", calls: 221, connected: 61, absent: 98, invalid: 24, rejected: 38, talkSec: 7080, idleSec: 2340, queue: 24, avgInterval: 18, signup: 8,
    hourly: [0, 0, 22, 28, 30, 26, 24, 20, 18, 25, 16, 12] },
  { id: "B", name: "이서연", calls: 203, connected: 58, absent: 89, invalid: 20, rejected: 36, talkSec: 6120, idleSec: 3180, queue: 89, avgInterval: 22, signup: 6,
    hourly: [0, 0, 18, 25, 28, 24, 22, 18, 16, 22, 18, 12] },
  { id: "A", name: "김민수", calls: 187, connected: 42, absent: 85, invalid: 22, rejected: 38, talkSec: 4560, idleSec: 4020, queue: 312, avgInterval: 31, signup: 4,
    hourly: [0, 26, 24, 20, 18, 14, 16, 18, 20, 17, 14, 0] },
  { id: "E", name: "정태우", calls: 172, connected: 39, absent: 78, invalid: 21, rejected: 34, talkSec: 4020, idleSec: 4560, queue: 198, avgInterval: 35, signup: 3,
    hourly: [0, 0, 14, 20, 22, 20, 16, 14, 18, 20, 16, 12] },
  { id: "C", name: "박지훈", calls: 156, connected: 31, absent: 72, invalid: 25, rejected: 28, talkSec: 2580, idleSec: 5820, queue: 401, avgInterval: 48, signup: 2,
    hourly: [0, 0, 12, 18, 22, 16, 10, 12, 16, 20, 18, 12] },
];

// DB info
const DB = { name: "서울 30대 DB", total: 10000, used: 6000, invalid: 300, validTotal: 9700 };
const dbProgress = ((DB.used / DB.total) * 100).toFixed(1);

const ALL_HOURS = Array.from({ length: 12 }, (_, i) => i);
const startHourIdx = ALL_HOURS.find(h => AGENTS.filter(a => a.hourly[h] > 0).length >= 3) ?? 0;
const activeHours = ALL_HOURS.filter(h => h >= startHourIdx);

const totalCalls = AGENTS.reduce((s, a) => s + a.calls, 0);
const totalConn = AGENTS.reduce((s, a) => s + a.connected, 0);
const totalAbsent = AGENTS.reduce((s, a) => s + a.absent, 0);
const totalInvalid = AGENTS.reduce((s, a) => s + a.invalid, 0);
const totalRejected = AGENTS.reduce((s, a) => s + a.rejected, 0);
const totalSignup = AGENTS.reduce((s, a) => s + a.signup, 0);
const totalTalk = AGENTS.reduce((s, a) => s + a.talkSec, 0);
const totalIdle = AGENTS.reduce((s, a) => s + a.idleSec, 0);
const maxCalls = Math.max(...AGENTS.map(a => a.calls));
const bestAgent = AGENTS[0];

const fmt = (sec) => { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };
const fmtM = (sec) => `${Math.floor(sec / 60)}m`;

const hourlyTotals = activeHours.map(h => AGENTS.reduce((s, a) => s + a.hourly[h], 0));
const allActiveVals = AGENTS.flatMap(a => activeHours.map(h => a.hourly[h])).filter(v => v > 0);
const avgHourly = Math.round(allActiveVals.reduce((s, v) => s + v, 0) / (allActiveVals.length || 1));

function heatColor(val) {
  if (val === 0) return { bg: "#0a0a0a", text: T.muted };
  const ratio = Math.max(0, Math.min(1, (val - 8) / (30 - 8)));
  if (ratio >= 0.6) {
    const t = (ratio - 0.6) / 0.4;
    return { bg: `rgba(0,${Math.round(100 + t * 80)},${Math.round(180 + t * 75)},0.25)`, text: `rgb(0,${Math.min(255, Math.round(180 + t * 80))},${Math.min(255, Math.round(220 + t * 35))})` };
  } else if (ratio >= 0.3) {
    return { bg: "rgba(60,60,80,0.15)", text: T.dim };
  } else {
    const t = 1 - ratio / 0.3;
    return { bg: `rgba(${Math.round(180 + t * 75)},${Math.round(40 - t * 20)},${Math.round(60 - t * 20)},0.2)`, text: `rgb(${Math.min(255, Math.round(220 + t * 35))},${Math.round(70 - t * 20)},${Math.round(80 - t * 20)})` };
  }
}

function AnimNum({ value }) {
  const [cur, setCur] = useState(0);
  const raf = useRef();
  useEffect(() => {
    let s; const run = (ts) => { if (!s) s = ts; const p = Math.min((ts - s) / 700, 1); setCur(Math.floor((1 - Math.pow(1 - p, 3)) * value)); if (p < 1) raf.current = requestAnimationFrame(run); };
    raf.current = requestAnimationFrame(run); return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{cur.toLocaleString()}</>;
}

function Led({ color, size = 5, pulse }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}66, 0 0 8px ${color}33`, animation: pulse ? "lp 2s ease-in-out infinite" : "none" }} />;
}

function Bar({ pct, color, h = 4 }) {
  return <div style={{ width: "100%", height: h, borderRadius: h, background: "#111", overflow: "hidden" }}>
    <div style={{ width: `${Math.max(pct, 0.5)}%`, height: "100%", borderRadius: h, background: color, boxShadow: `0 0 6px ${color}22`, transition: "width 1s ease" }} />
  </div>;
}

function Ring({ pct, color, size = 52, stroke = 3, children }) {
  const r = (size - stroke) / 2, ci = 2 * Math.PI * r;
  return <div style={{ position: "relative", width: size, height: size }}>
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#111" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={ci} strokeDashoffset={ci * (1 - pct / 100)} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}55)`, transition: "stroke-dashoffset 1s ease" }} />
    </svg>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
  </div>;
}

function MiniBar({ data, color, w = 100, h = 24 }) {
  const mx = Math.max(...data);
  return <svg width={w} height={h}>{data.map((v, i) => { const bw = (w / data.length) - 1; const bh = (v / mx) * (h - 2); return <rect key={i} x={i * (bw + 1)} y={h - bh} width={bw} height={bh} rx={1} fill={color} fillOpacity={v === mx ? 1 : 0.35} />; })}</svg>;
}

function CoachCard({ agent, expanded, onToggle }) {
  const connRate = ((agent.connected / agent.calls) * 100).toFixed(1);
  const total = agent.talkSec + agent.idleSec;
  const talkP = Math.round((agent.talkSec / total) * 100);
  const isBest = agent.id === bestAgent.id;
  const gapCalls = bestAgent.calls - agent.calls;
  const gapInterval = agent.avgInterval - bestAgent.avgInterval;
  const gapRate = (parseFloat(connRate) - (bestAgent.connected / bestAgent.calls * 100)).toFixed(1);

  const issues = [];
  if (agent.avgInterval > 30) issues.push({ type: "critical", text: `콜 간격 ${agent.avgInterval}초 — 1위 대비 +${gapInterval}초.`, fix: `목표: ${bestAgent.avgInterval + 5}초. 자동콜 사용.` });
  else if (agent.avgInterval > 25) issues.push({ type: "warn", text: `콜 간격 ${agent.avgInterval}초 — 개선 여지.`, fix: `5초 줄이면 하루 +${Math.round(gapInterval * agent.calls / 60)}콜.` });
  if (agent.avgInterval > 20) { const low = agent.hourly.filter(v => v > 0 && v < avgHourly).length; if (low > 3) issues.push({ type: "warn", text: `${low}개 시간대 평균 이하. 편차 큼.`, fix: `시간당 ${Math.round(agent.calls / activeHours.filter(h => agent.hourly[h] > 0).length)}콜 유지.` }); }
  if (agent.avgInterval >= 35) issues.push({ type: "warn", text: "시작 느림.", fix: "출근 10분 내 첫 콜." });
  if (parseFloat(connRate) < 22) issues.push({ type: "critical", text: `연결률 ${connRate}% — 최저.`, fix: "10-11시, 14-15시 집중." });
  if (agent.idleSec > agent.talkSec * 1.5) issues.push({ type: "critical", text: `IDLE > TALK`, fix: "자동콜 ON + 간격 20초." });
  if (isBest && issues.length === 0) issues.push({ type: "good", text: "전 지표 1위. 페이스 유지.", fix: "" });
  const tc = { critical: T.red, warn: T.yellow, info: T.blue, good: T.green };
  const tl = { critical: "CRITICAL", warn: "WARNING", info: "TIP", good: "EXCELLENT" };

  return (
    <div>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", padding: "10px 0", cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ width: 110, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 200, color: isBest ? T.yellow : T.muted, width: 16, textAlign: "right" }}>{AGENTS.indexOf(agent) + 1}</span>
          <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS[agent.id](T.cyan)}</div>
          <span style={{ fontSize: 11, fontWeight: 400 }}>{agent.name}</span>
        </div>
        <div style={{ flex: 1, marginLeft: 4, marginRight: 12 }}>
          {/* Main bar: connected (green) + rest (gray) proportional to calls */}
          <div style={{ display: "flex", height: 22, borderRadius: 3, overflow: "hidden", background: "#0e0e0e" }}>
            <div style={{ width: `${(agent.connected / agent.calls) * talkP}%`, height: "100%", background: `linear-gradient(90deg, ${T.green}88, ${T.green})`, display: "flex", alignItems: "center", paddingLeft: 8, minWidth: 0 }}>
              <span style={{ fontSize: 8, fontWeight: 500, color: "#000", whiteSpace: "nowrap", overflow: "hidden" }}>연결 {agent.connected}</span>
            </div>
            <div style={{ width: `${((agent.calls - agent.connected) / agent.calls) * talkP}%`, height: "100%", background: `linear-gradient(90deg, ${T.cyan}44, ${T.cyan}66)`, display: "flex", alignItems: "center", paddingLeft: 4 }}>
              <span style={{ fontSize: 7, fontWeight: 400, color: T.cyan, whiteSpace: "nowrap", overflow: "hidden" }}>통화 {fmtM(agent.talkSec)}</span>
            </div>
            <div style={{ flex: 1, height: "100%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 400, color: T.dim }}>{agent.calls}콜</span>
            </div>
          </div>
          <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
            <div style={{ width: `${(agent.connected / agent.calls) * 100}%`, background: T.green + "55" }} />
            <div style={{ width: `${(agent.absent / agent.calls) * 100}%`, background: T.yellow + "55" }} />
            <div style={{ width: `${(agent.invalid / agent.calls) * 100}%`, background: T.red + "55" }} />
          </div>
        </div>
        <div style={{ width: 280, flexShrink: 0, display: "flex", alignItems: "center", gap: 2 }}>
          {[
            { val: agent.calls, label: "CALLS", color: T.cyan },
            { val: agent.connected, label: "CONN", color: T.green },
            { val: connRate + "%", label: "RATE", color: parseFloat(connRate) > 25 ? T.green : T.red },
            { val: agent.avgInterval + "s", label: "INTV", color: agent.avgInterval > 30 ? T.red : agent.avgInterval > 25 ? T.yellow : T.dim },
          ].map((s, j) => (
            <div key={j} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 200, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 6, color: T.muted, letterSpacing: "0.06em" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ width: 18, textAlign: "center", color: T.muted, fontSize: 9, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>v</div>
      </div>
      {expanded && (
        <div style={{ padding: "14px 16px", background: "#060606", borderBottom: `1px solid ${T.border}`, animation: "su 0.25s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.08em", marginBottom: 10 }}>WORK PATTERN</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <Ring pct={talkP} color={T.cyan} size={50} stroke={3}><span style={{ fontSize: 12, fontWeight: 200, color: T.cyan }}>{talkP}%</span></Ring>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 300 }}><span style={{ color: T.blue }}>{fmtM(agent.talkSec)}</span> <span style={{ color: T.muted, fontSize: 8 }}>TALK</span></div>
                  <div style={{ fontSize: 10, fontWeight: 300 }}><span style={{ color: agent.idleSec > agent.talkSec ? T.red : T.dim }}>{fmtM(agent.idleSec)}</span> <span style={{ color: T.muted, fontSize: 8 }}>IDLE</span></div>
                </div>
              </div>
              <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.08em", marginBottom: 6 }}>HOURLY</div>
              <MiniBar data={activeHours.map(h => agent.hourly[h])} color={T.cyan} w={180} h={28} />
              {!isBest && (
                <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 6, background: "#0a0a0a", border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 7, color: T.muted, letterSpacing: "0.08em", marginBottom: 4 }}>VS 1위</div>
                  <div style={{ fontSize: 10, fontWeight: 300 }}>
                    <span style={{ color: T.dim }}>콜 </span><span style={{ color: T.red }}>-{gapCalls}</span>
                    <span style={{ color: T.dim, marginLeft: 8 }}>간격 </span><span style={{ color: T.red }}>+{gapInterval}초</span>
                    <span style={{ color: T.dim, marginLeft: 8 }}>연결률 </span><span style={{ color: parseFloat(gapRate) < 0 ? T.red : T.green }}>{gapRate}%p</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 8, color: T.purple, letterSpacing: "0.08em", marginBottom: 10, fontWeight: 500 }}>AI COACHING</div>
              {issues.map((issue, j) => (
                <div key={j} style={{ padding: "8px 10px", borderRadius: 6, background: `${tc[issue.type]}04`, border: `1px solid ${tc[issue.type]}12`, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: issue.fix ? 4 : 0 }}><Led color={tc[issue.type]} size={4} /><span style={{ fontSize: 7, fontWeight: 600, color: tc[issue.type], letterSpacing: "0.08em" }}>{tl[issue.type]}</span></div>
                  <div style={{ fontSize: 10, color: T.dim, fontWeight: 300, lineHeight: 1.5 }}>{issue.text}</div>
                  {issue.fix && <div style={{ marginTop: 4, padding: "5px 7px", borderRadius: 4, background: "#0a0a0a", fontSize: 10, color: T.text, fontWeight: 300 }}>{issue.fix}</div>}
                </div>
              ))}
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                {[
                  { label: "SPEED", val: agent.avgInterval <= 20 ? "A" : agent.avgInterval <= 30 ? "B" : "C", color: agent.avgInterval <= 20 ? T.green : agent.avgInterval <= 30 ? T.yellow : T.red },
                  { label: "QUALITY", val: parseFloat(connRate) > 28 ? "A" : parseFloat(connRate) > 22 ? "B" : "C", color: parseFloat(connRate) > 28 ? T.green : parseFloat(connRate) > 22 ? T.yellow : T.red },
                  { label: "EFFORT", val: talkP > 70 ? "A" : talkP > 55 ? "B" : "C", color: talkP > 70 ? T.green : talkP > 55 ? T.yellow : T.red },
                ].map((g, j) => (
                  <div key={j} style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 6, background: "#0a0a0a", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 15, fontWeight: 200, color: g.color }}>{g.val}</div>
                    <div style={{ fontSize: 6, color: T.muted, letterSpacing: "0.08em", marginTop: 2 }}>{g.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ user, onLogout }) {
  const [now, setNow] = useState(new Date());
  const [expanded, setExpanded] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [settings, setSettings] = useState({ showRanking: true, showIncentive: true, autoCallInterval: 20, distMode: "random" });
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const workSec = 8 * 3600;
  const talkPct = ((totalTalk / (workSec * 5)) * 100).toFixed(1);
  const idlePct = ((totalIdle / (workSec * 5)) * 100).toFixed(1);
  const today = now.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });

  const connPct = ((totalConn / totalCalls) * 100).toFixed(1);
  const absentPct = ((totalAbsent / totalCalls) * 100).toFixed(1);
  const invalidPct = ((totalInvalid / totalCalls) * 100).toFixed(1);
  const rejectedPct = ((totalRejected / totalCalls) * 100).toFixed(1);
  const signupPct = ((totalSignup / totalConn) * 100).toFixed(1);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }
        @keyframes lp { 0%,100%{opacity:1}50%{opacity:.3} }
        @keyframes su { from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.cyan, letterSpacing: "0.06em" }}>TM</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: T.dim, letterSpacing: "0.04em" }}>COMMAND CENTER</span>
        </div>
        <div style={{ display: "flex", gap: 3, background: "#050508", borderRadius: 10, padding: 3, border: `1px solid ${T.border}` }}>
          {[{id:"dashboard",label:"DASHBOARD"},{id:"settings",label:"SETTINGS"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"6px 16px", borderRadius:7, border:"none", cursor:"pointer",
              fontSize:10, fontWeight:500, letterSpacing:"0.06em", fontFamily:"'Poppins',sans-serif",
              background:tab===t.id?"#151518":"transparent", color:tab===t.id?T.text:T.muted,
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Led color={T.green} pulse />
          <span style={{ fontSize: 11, color: T.dim, fontWeight: 300, letterSpacing: "0.04em" }}>{now.toLocaleTimeString("ko-KR", { hour12: false })}</span>
          <button onClick={onLogout} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:10, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>LOGOUT</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ═══ SETTINGS TAB ═══ */}
        {tab === "settings" && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 20 }}>SETTINGS</div>
            {[
              { label: "팀 랭킹 표시", desc: "실장 화면에 5명 순위 공개", key: "showRanking" },
              { label: "인센티브 표시", desc: "1st, 2nd 인센티브 안내 공개", key: "showIncentive" },
            ].map(s => (
              <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 400 }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>{s.desc}</div>
                </div>
                <button onClick={() => setSettings(p => ({ ...p, [s.key]: !p[s.key] }))} style={{
                  padding: "6px 18px", borderRadius: 14, border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "'Poppins',sans-serif",
                  background: settings[s.key] ? T.green : "#1c1c24",
                  color: settings[s.key] ? "#000" : T.muted,
                  boxShadow: settings[s.key] ? `0 0 8px ${T.green}44` : "none",
                }}>{settings[s.key] ? "ON" : "OFF"}</button>
              </div>
            ))}
            <div style={{ padding: "16px 18px", borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 400, marginBottom: 8 }}>자동콜 간격 (초)</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[10, 15, 20, 30].map(v => (
                  <button key={v} onClick={() => setSettings(p => ({ ...p, autoCallInterval: v }))} style={{
                    padding: "8px 18px", borderRadius: 8, border: `1px solid ${settings.autoCallInterval === v ? T.cyan + "44" : T.border}`,
                    background: settings.autoCallInterval === v ? `${T.cyan}10` : "transparent",
                    color: settings.autoCallInterval === v ? T.cyan : T.muted,
                    fontSize: 13, cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                  }}>{v}s</button>
                ))}
              </div>
            </div>
            <div style={{ padding: "16px 18px", borderRadius: 10, background: T.card, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 400, marginBottom: 8 }}>DB 분배 방식</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ id: "random", label: "랜덤" }, { id: "manual", label: "수동" }].map(m => (
                  <button key={m.id} onClick={() => setSettings(p => ({ ...p, distMode: m.id }))} style={{
                    padding: "8px 22px", borderRadius: 8, border: `1px solid ${settings.distMode === m.id ? T.cyan + "44" : T.border}`,
                    background: settings.distMode === m.id ? `${T.cyan}10` : "transparent",
                    color: settings.distMode === m.id ? T.cyan : T.muted,
                    fontSize: 13, cursor: "pointer", fontFamily: "'Poppins',sans-serif",
                  }}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "dashboard" && <>
        {/* ═══ DB QUALITY BANNER ═══ */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {/* Left: DB Info + Progress */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Ring pct={parseFloat(dbProgress)} color={T.cyan} size={62} stroke={4}>
                <span style={{ fontSize: 15, fontWeight: 200, color: T.cyan }}>{Math.round(parseFloat(dbProgress))}</span>
                <span style={{ fontSize: 6, color: T.muted }}>%</span>
              </Ring>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{DB.name}</span>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${T.cyan}10`, border: `1px solid ${T.cyan}20`, color: T.cyan, fontWeight: 400 }}>진행중</span>
                </div>
                <div style={{ fontSize: 10, color: T.dim, fontWeight: 300 }}>
                  총 <span style={{ color: T.text, fontWeight: 400 }}>{DB.total.toLocaleString()}</span>건
                  <span style={{ color: T.muted, margin: "0 6px" }}>/</span>
                  소진 <span style={{ color: T.cyan, fontWeight: 400 }}>{DB.used.toLocaleString()}</span>건
                  <span style={{ color: T.muted, margin: "0 6px" }}>/</span>
                  잔여 <span style={{ color: T.text, fontWeight: 400 }}>{(DB.total - DB.used).toLocaleString()}</span>건
                </div>
                {/* Progress bar */}
                <div style={{ width: 240, marginTop: 6 }}>
                  <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", background: "#111" }}>
                    <div style={{ width: `${dbProgress}%`, background: `linear-gradient(90deg, ${T.cyan}88, ${T.cyan})`, borderRadius: 3, boxShadow: `0 0 6px ${T.cyan}22` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: DB Quality Stats */}
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { label: "결번", val: `${DB.invalid}`, pct: `${((DB.invalid / DB.total) * 100).toFixed(1)}%`, color: T.red },
                { label: "연결", val: totalConn, pct: connPct + "%", color: T.green },
                { label: "거절", val: totalRejected, pct: rejectedPct + "%", color: T.orange },
                { label: "부재", val: totalAbsent, pct: absentPct + "%", color: T.yellow },
                { label: "가입", val: totalSignup, pct: signupPct + "%", color: T.purple },
              ].map((s, i) => (
                <div key={i} style={{ width: 72, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "#060606", border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 200, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 9, fontWeight: 300, color: s.color, marginTop: 3, opacity: 0.7 }}>{s.pct}</div>
                  <div style={{ fontSize: 7, color: T.muted, marginTop: 3, letterSpacing: "0.06em" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { label: "TOTAL CALLS", val: totalCalls, color: T.cyan },
            { label: "CONNECTED", val: totalConn, color: T.green, sub: connPct + "%" },
            { label: "NO ANSWER", val: totalAbsent, color: T.yellow, sub: absentPct + "%" },
            { label: "INVALID", val: totalInvalid, color: T.red, sub: invalidPct + "%" },
            { label: "TALK TIME", val: null, color: T.blue, display: fmt(totalTalk), sub: talkPct + "%" },
            { label: "IDLE TIME", val: null, color: T.orange, display: fmt(totalIdle), sub: idlePct + "%" },
          ].map((k, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.1em", fontWeight: 500, marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 200, color: k.color, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {k.val !== null ? <AnimNum value={k.val} /> : k.display}
              </div>
              {k.sub && <div style={{ fontSize: 10, color: T.dim, marginTop: 5, fontWeight: 300 }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* AGENT PERFORMANCE */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.04em" }}>AGENT PERFORMANCE</div>
              <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.08em", marginTop: 2 }}>CLICK ROW FOR WORK STYLE ANALYSIS</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Led color={T.green} pulse /><span style={{ fontSize: 8, color: T.dim }}>REAL-TIME</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "0 0 6px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: 110, fontSize: 7, color: T.muted, letterSpacing: "0.08em" }}>AGENT</div>
            <div style={{ flex: 1, marginLeft: 4, marginRight: 12, fontSize: 7, color: T.muted, letterSpacing: "0.08em" }}>TALK TIME / TOTAL CALLS</div>
            <div style={{ width: 280, display: "flex" }}>
              {["CALLS", "CONN", "RATE", "INTV"].map(h => <div key={h} style={{ flex: 1, textAlign: "center", fontSize: 7, color: T.muted, letterSpacing: "0.08em" }}>{h}</div>)}
            </div>
            <div style={{ width: 18 }} />
          </div>
          {AGENTS.map(ag => <CoachCard key={ag.id} agent={ag} expanded={expanded === ag.id} onToggle={() => setExpanded(expanded === ag.id ? null : ag.id)} />)}
          <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 6, background: "#060606", border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 300 }}>
            <span style={{ color: T.muted, fontSize: 8, letterSpacing: "0.06em" }}>TEAM AVG</span>
            <div style={{ display: "flex", gap: 14 }}>
              <span><span style={{ color: T.dim }}>Calls </span><span style={{ color: T.cyan }}>{Math.round(totalCalls / 5)}</span></span>
              <span><span style={{ color: T.dim }}>Talk </span><span style={{ color: T.blue }}>{fmt(Math.round(totalTalk / 5))}</span></span>
              <span><span style={{ color: T.dim }}>Idle </span><span style={{ color: T.orange }}>{fmt(Math.round(totalIdle / 5))}</span></span>
              <span><span style={{ color: T.dim }}>Intv </span><span style={{ color: T.text }}>{Math.round(AGENTS.reduce((s, a) => s + a.avgInterval, 0) / 5)}s</span></span>
            </div>
          </div>
        </div>

        {/* CALL RESULT + HOURLY */}
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.1em", fontWeight: 500, marginBottom: 12 }}>CALL RESULT</div>
            <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
              {[
                { pct: Math.round(totalConn / totalCalls * 100), color: T.green },
                { pct: Math.round(totalAbsent / totalCalls * 100), color: T.yellow },
                { pct: Math.round(totalInvalid / totalCalls * 100), color: T.red },
              ].map((r, i) => (
                <Ring key={i} pct={r.pct} color={r.color} size={56} stroke={3}>
                  <span style={{ fontSize: 13, fontWeight: 200, color: r.color }}>{r.pct}</span>
                </Ring>
              ))}
            </div>
            {[
              { label: "연결", val: totalConn, color: T.green },
              { label: "부재", val: totalAbsent, color: T.yellow },
              { label: "결번", val: totalInvalid, color: T.red },
              { label: "거절", val: totalRejected, color: T.orange },
              { label: "가입", val: totalSignup, color: T.purple },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Led color={item.color} size={4} />
                <span style={{ fontSize: 9, color: T.dim, width: 26 }}>{item.label}</span>
                <div style={{ flex: 1 }}><Bar pct={(item.val / totalCalls) * 100} color={item.color} h={3} /></div>
                <span style={{ fontSize: 11, fontWeight: 200, color: item.color, width: 30, textAlign: "right" }}>{item.val}</span>
              </div>
            ))}
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.1em", fontWeight: 500 }}>HOURLY BREAKDOWN</div>
                <div style={{ fontSize: 9, color: T.dim, fontWeight: 300, marginTop: 2 }}>{today}</div>
              </div>
              <div style={{ fontSize: 8, color: T.muted, fontWeight: 300 }}>START <span style={{ color: T.cyan }}>{8 + startHourIdx}시</span></div>
            </div>
            <div style={{ display: "flex", marginBottom: 3, paddingLeft: 44 }}>
              {activeHours.map(h => <div key={h} style={{ flex: 1, textAlign: "center", fontSize: 8, color: T.muted, fontWeight: 300 }}>{8 + h}</div>)}
              <div style={{ width: 40, textAlign: "center", fontSize: 7, color: T.muted }}>SUM</div>
            </div>
            {AGENTS.map(ag => (
              <div key={ag.id} style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                <div style={{ width: 44, display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{ICONS[ag.id](T.cyan)}</div>
                  <span style={{ fontSize: 8, color: T.dim }}>{ag.name.slice(0, 2)}</span>
                </div>
                {activeHours.map(hi => {
                  const val = ag.hourly[hi]; const hc = heatColor(val);
                  const isH = hoverCell && hoverCell.a === ag.id && hoverCell.h === hi;
                  return (
                    <div key={hi} onMouseEnter={() => setHoverCell({ a: ag.id, h: hi, v: val })} onMouseLeave={() => setHoverCell(null)}
                      style={{ flex: 1, height: 28, margin: "0 1px", borderRadius: 3, background: isH ? `${T.cyan}22` : hc.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "default", transition: "background 0.15s" }}>
                      <span style={{ fontSize: val === 0 ? 8 : 10, fontWeight: 200, color: hc.text }}>{val === 0 ? "-" : val}</span>
                      {isH && val > 0 && (
                        <div style={{ position: "absolute", bottom: "calc(100% + 5px)", left: "50%", transform: "translateX(-50%)", padding: "5px 8px", borderRadius: 5, background: "#1a1a1a", border: `1px solid ${T.border}`, whiteSpace: "nowrap", zIndex: 10, fontSize: 9, fontWeight: 300, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
                          <span style={{ color: T.cyan }}>{ag.name}</span> <span style={{ color: T.dim }}>{8 + hi}시</span>
                          <div>{val}콜 {val >= avgHourly ? <span style={{ color: T.blue }}>+{val - avgHourly}</span> : <span style={{ color: T.red }}>-{avgHourly - val}</span>}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ width: 40, textAlign: "center", fontSize: 12, fontWeight: 200, color: T.cyan }}>{activeHours.reduce((s, h) => s + ag.hourly[h], 0)}</div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
              <div style={{ width: 44, fontSize: 7, color: T.muted, letterSpacing: "0.06em" }}>TEAM</div>
              {hourlyTotals.map((val, idx) => {
                const peak = val === Math.max(...hourlyTotals);
                return <div key={idx} style={{ flex: 1, height: 24, margin: "0 1px", borderRadius: 3, background: peak ? `${T.cyan}18` : "#0e0e0e", display: "flex", alignItems: "center", justifyContent: "center", border: peak ? `1px solid ${T.cyan}22` : "1px solid transparent" }}>
                  <span style={{ fontSize: 10, fontWeight: peak ? 400 : 200, color: peak ? T.cyan : T.dim }}>{val}</span>
                </div>;
              })}
              <div style={{ width: 40, textAlign: "center", fontSize: 12, fontWeight: 300, color: T.cyan }}>{totalCalls}</div>
            </div>
          </div>
        </div>

        {/* DB QUEUE */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 8, color: T.muted, letterSpacing: "0.1em", fontWeight: 500, marginBottom: 10 }}>DB QUEUE</div>
          <div style={{ display: "flex", gap: 8 }}>
            {AGENTS.map(ag => {
              const low = ag.queue < 50;
              return <div key={ag.id} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: "#060606", border: `1px solid ${low ? T.red + "22" : T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{ICONS[ag.id](T.cyan)}<span style={{ fontSize: 9, color: T.cyan, fontWeight: 500 }}>{ag.id}</span></div>
                  <span style={{ fontSize: 13, fontWeight: 200, color: low ? T.red : T.dim }}>{ag.queue}</span>
                </div>
                <Bar pct={Math.min(ag.queue / 5, 100)} color={low ? T.red : T.cyan} h={3} />
              </div>;
            })}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}
