import { useState, useEffect, useRef } from "react";

const T = {
  bg: "#f4f5f7", card: "#ffffff", border: "#e2e4e8",
  text: "#1a1a2e", textSec: "#444466", dim: "#7a7a96", muted: "#b0b0c4",
  green: "#00c853", red: "#e53935", blue: "#1e88e5",
  cyan: "#00acc1", yellow: "#f9a825", orange: "#ef6c00",
  purple: "#7c4dff", pink: "#d81b60",
  cardAlt: "#f9fafb", hover: "#eef0f4",
};

const ICONS = {
  D: (c) => <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="2"/><circle cx="8" cy="8" r="2.5" fill={c}/></svg>,
  B: (c) => <svg width="18" height="18" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke={c} strokeWidth="2"/><rect x="6" y="6" width="4" height="4" rx="1" fill={c}/></svg>,
  A: (c) => <svg width="18" height="18" viewBox="0 0 16 16"><polygon points="8,2 14,14 2,14" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"/></svg>,
  E: (c) => <svg width="18" height="18" viewBox="0 0 16 16"><polygon points="8,1 10.5,6 16,6.5 12,10.5 13,16 8,13 3,16 4,10.5 0,6.5 5.5,6" fill="none" stroke={c} strokeWidth="1.5"/></svg>,
  C: (c) => <svg width="18" height="18" viewBox="0 0 16 16"><path d="M8,2 L14,8 L8,14 L2,8 Z" fill="none" stroke={c} strokeWidth="2"/></svg>,
};

const AGENTS = [
  { id: "D", name: "최유나", calls: 221, connected: 61, absent: 98, invalid: 24, rejected: 38, talkSec: 7080, idleSec: 2340, queue: 24, avgInterval: 18, signup: 8, interest: 15, callback: 6, connCallback: 4, avgConnSec: 55, shortCalls: 3, longCalls: 18, hourly: [0,0,22,28,30,26,24,20,18,25,16,12] },
  { id: "B", name: "이서연", calls: 203, connected: 58, absent: 89, invalid: 20, rejected: 36, talkSec: 6120, idleSec: 3180, queue: 89, avgInterval: 22, signup: 6, interest: 12, callback: 5, connCallback: 3, avgConnSec: 48, shortCalls: 5, longCalls: 14, hourly: [0,0,18,25,28,24,22,18,16,22,18,12] },
  { id: "A", name: "김민수", calls: 187, connected: 42, absent: 85, invalid: 22, rejected: 38, talkSec: 4560, idleSec: 4020, queue: 312, avgInterval: 31, signup: 4, interest: 8, callback: 4, connCallback: 2, avgConnSec: 32, shortCalls: 12, longCalls: 6, hourly: [0,26,24,20,18,14,16,18,20,17,14,0] },
  { id: "E", name: "정태우", calls: 172, connected: 39, absent: 78, invalid: 21, rejected: 34, talkSec: 4020, idleSec: 4560, queue: 198, avgInterval: 35, signup: 3, interest: 6, callback: 3, connCallback: 1, avgConnSec: 28, shortCalls: 14, longCalls: 4, hourly: [0,0,14,20,22,20,16,14,18,20,16,12] },
  { id: "C", name: "박지훈", calls: 156, connected: 31, absent: 72, invalid: 25, rejected: 28, talkSec: 2580, idleSec: 5820, queue: 401, avgInterval: 48, signup: 2, interest: 4, callback: 2, connCallback: 0, avgConnSec: 19, shortCalls: 18, longCalls: 2, hourly: [0,0,12,18,22,16,10,12,16,20,18,12] },
];

const DB_LIST = [
  { id: 1, name: "김사장 DB 4월", total: 10000, valid: 9120, dup: 230, invalid: 650, date: "04/15", source: "김사장", quality: 88 },
  { id: 2, name: "손사장 DB 4월", total: 5000, valid: 4210, dup: 180, invalid: 610, date: "04/12", source: "손사장", quality: 76 },
];

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
const bestAgent = AGENTS[0];

const fmt = (s) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };
const fmtM = (s) => `${Math.floor(s/60)}m`;
const hourlyTotals = activeHours.map(h => AGENTS.reduce((s, a) => s + a.hourly[h], 0));
const allActiveVals = AGENTS.flatMap(a => activeHours.map(h => a.hourly[h])).filter(v => v > 0);
const avgHourly = Math.round(allActiveVals.reduce((s, v) => s + v, 0) / (allActiveVals.length || 1));

function Led({ color, size = 7, pulse }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}55`, animation: pulse ? "lp 2s ease-in-out infinite" : "none" }} />;
}
function Bar({ pct, color, h = 6 }) {
  return <div style={{ width: "100%", height: h, borderRadius: h, background: "#e8eaee", overflow: "hidden" }}>
    <div style={{ width: `${Math.max(pct, 0.5)}%`, height: "100%", borderRadius: h, background: color, transition: "width 0.8s ease" }} />
  </div>;
}
function Ring({ pct, color, size = 54, stroke = 4, children }) {
  const r = (size - stroke) / 2, ci = 2 * Math.PI * r;
  return <div style={{ position: "relative", width: size, height: size }}>
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8eaee" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={ci} strokeDashoffset={ci * (1 - Math.min(pct, 100) / 100)} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
  </div>;
}

function heatColor(val) {
  if (val === 0) return { bg: "#f0f0f4", text: "#ccc" };
  const ratio = Math.max(0, Math.min(1, (val - 8) / (30 - 8)));
  if (ratio >= 0.6) return { bg: `rgba(30,136,229,${0.08 + ratio * 0.15})`, text: "#1565c0" };
  if (ratio >= 0.3) return { bg: "#f5f5fa", text: "#555" };
  return { bg: `rgba(229,57,53,${0.06 + (1 - ratio) * 0.1})`, text: "#c62828" };
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

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#ccc;border-radius:5px}
        @keyframes lp{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", background: "#fff", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.blue }}>TM</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>COMMAND CENTER</span>
        </div>
        <div style={{ display: "flex", gap: 3, background: T.cardAlt, borderRadius: 8, padding: 3, border: `1px solid ${T.border}` }}>
          {[{id:"dashboard",label:"DASHBOARD"},{id:"settings",label:"SETTINGS"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer",
              fontSize:11, fontWeight:600, fontFamily:"'Poppins',sans-serif",
              background:tab===t.id?"#fff":"transparent", color:tab===t.id?T.text:T.dim,
              boxShadow:tab===t.id?"0 1px 3px rgba(0,0,0,0.08)":"none",
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Led color={T.green} pulse />
          <span style={{ fontSize: 12, color: T.dim }}>{now.toLocaleTimeString("ko-KR", { hour12: false })}</span>
          <button onClick={onLogout} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${T.border}`, background:"#fff", color:T.dim, fontSize:11, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>LOGOUT</button>
        </div>
      </div>

      {/* SETTINGS */}
      {tab === "settings" && (
        <div style={{ padding: "20px", maxWidth: 600 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: T.text }}>SETTINGS</div>
          {[
            { label: "팀 랭킹 표시", desc: "실장 화면에 5명 순위 공개", key: "showRanking" },
            { label: "인센티브 표시", desc: "1st, 2nd 인센티브 안내 공개", key: "showIncentive" },
          ].map(s => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderRadius: 10, background: "#fff", border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div><div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{s.label}</div><div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>{s.desc}</div></div>
              <button onClick={() => setSettings(p => ({ ...p, [s.key]: !p[s.key] }))} style={{ padding: "6px 18px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: settings[s.key] ? T.green : "#ddd", color: settings[s.key] ? "#fff" : "#888" }}>{settings[s.key] ? "ON" : "OFF"}</button>
            </div>
          ))}
          <div style={{ padding: "16px 18px", borderRadius: 10, background: "#fff", border: `1px solid ${T.border}`, marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: T.text }}>자동콜 간격 (초)</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[10,15,20,30].map(v => (
                <button key={v} onClick={() => setSettings(p => ({ ...p, autoCallInterval: v }))} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${settings.autoCallInterval === v ? T.blue : T.border}`, background: settings.autoCallInterval === v ? `${T.blue}11` : "#fff", color: settings.autoCallInterval === v ? T.blue : T.dim, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>{v}s</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD - 50/50 split */}
      {tab === "dashboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "calc(100vh - 49px)" }}>

          {/* ═══ LEFT: Performance ═══ */}
          <div style={{ overflowY: "auto", padding: "16px", borderRight: `1px solid ${T.border}` }}>

            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
              {[
                { label: "총 콜", val: totalCalls, color: T.blue },
                { label: "연결", val: totalConn, color: T.green, sub: `${((totalConn/totalCalls)*100).toFixed(1)}%` },
                { label: "부재", val: totalAbsent, color: T.yellow },
                { label: "결번", val: totalInvalid, color: T.red },
                { label: "통화시간", val: null, color: T.blue, display: fmt(totalTalk) },
                { label: "IDLE", val: null, color: T.orange, display: fmt(totalIdle) },
              ].map((k, i) => (
                <div key={i} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px" }}>
                  <div style={{ fontSize: 10, color: T.dim, fontWeight: 500, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: k.color }}>{k.val !== null ? k.val : k.display}</div>
                  {k.sub && <div style={{ fontSize: 11, color: T.dim }}>{k.sub}</div>}
                </div>
              ))}
            </div>

            {/* AGENT TABLE */}
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>AGENT PERFORMANCE</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Led color={T.green} pulse /><span style={{ fontSize: 10, color: T.dim }}>REAL-TIME</span></div>
              </div>

              {/* Header */}
              <div style={{ display: "flex", padding: "0 0 6px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 600, color: T.dim }}>
                <div style={{ width: 100 }}>AGENT</div>
                <div style={{ flex: 1, marginRight: 8 }}>통화 / 콜 수</div>
                <div style={{ width: 60, textAlign: "center" }}>CALLS</div>
                <div style={{ width: 50, textAlign: "center" }}>CONN</div>
                <div style={{ width: 55, textAlign: "center" }}>RATE</div>
                <div style={{ width: 45, textAlign: "center" }}>INTV</div>
              </div>

              {AGENTS.map((ag, i) => {
                const connRate = ((ag.connected / ag.calls) * 100).toFixed(1);
                const total = ag.talkSec + ag.idleSec;
                const talkP = Math.round((ag.talkSec / total) * 100);
                const connP = Math.round((ag.connected / ag.calls) * talkP);
                const isBest = i === 0;

                return (
                  <div key={ag.id}>
                    <div onClick={() => setExpanded(expanded === ag.id ? null : ag.id)} style={{ display: "flex", alignItems: "center", padding: "10px 0", cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ width: 100, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: isBest ? T.yellow : T.muted, width: 18 }}>{i + 1}</span>
                        {ICONS[ag.id](T.blue)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{ag.name}</span>
                      </div>
                      <div style={{ flex: 1, marginRight: 8 }}>
                        <div style={{ display: "flex", height: 24, borderRadius: 4, overflow: "hidden", background: "#f0f1f4" }}>
                          <div style={{ width: `${connP}%`, background: T.green, display: "flex", alignItems: "center", paddingLeft: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>연결 {ag.connected}</span>
                          </div>
                          <div style={{ width: `${talkP - connP}%`, background: T.blue + "44", display: "flex", alignItems: "center", paddingLeft: 4 }}>
                            <span style={{ fontSize: 8, color: T.blue, whiteSpace: "nowrap" }}>{fmtM(ag.talkSec)}</span>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
                            <span style={{ fontSize: 10, color: T.dim }}>{ag.calls}콜</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                          <div style={{ width: `${(ag.connected/ag.calls)*100}%`, background: T.green }} />
                          <div style={{ width: `${(ag.absent/ag.calls)*100}%`, background: T.yellow }} />
                          <div style={{ width: `${(ag.invalid/ag.calls)*100}%`, background: T.red }} />
                        </div>
                      </div>
                      <div style={{ width: 60, textAlign: "center", fontSize: 15, fontWeight: 600, color: T.blue }}>{ag.calls}</div>
                      <div style={{ width: 50, textAlign: "center", fontSize: 15, fontWeight: 600, color: T.green }}>{ag.connected}</div>
                      <div style={{ width: 55, textAlign: "center", fontSize: 14, fontWeight: 600, color: parseFloat(connRate) > 25 ? T.green : T.red }}>{connRate}%</div>
                      <div style={{ width: 45, textAlign: "center", fontSize: 14, fontWeight: 500, color: ag.avgInterval > 30 ? T.red : T.dim }}>{ag.avgInterval}s</div>
                    </div>

                    {/* Expanded */}
                    {expanded === ag.id && (
                      <div style={{ padding: "12px", background: T.cardAlt, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                          {/* Work Pattern */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.dim, marginBottom: 8 }}>WORK PATTERN</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                              <Ring pct={talkP} color={T.blue} size={44} stroke={3.5}><span style={{ fontSize: 12, fontWeight: 600, color: T.blue }}>{talkP}%</span></Ring>
                              <div>
                                <div style={{ fontSize: 12, color: T.text }}><span style={{ color: T.blue, fontWeight: 600 }}>{fmtM(ag.talkSec)}</span> TALK</div>
                                <div style={{ fontSize: 12, color: ag.idleSec > ag.talkSec ? T.red : T.dim }}><span style={{ fontWeight: 600 }}>{fmtM(ag.idleSec)}</span> IDLE</div>
                              </div>
                            </div>
                            {!isBest && <div style={{ fontSize: 11, color: T.dim, padding: "6px 8px", background: "#fff", borderRadius: 6, border: `1px solid ${T.border}` }}>
                              VS 1위: 콜 <span style={{ color: T.red, fontWeight: 600 }}>-{bestAgent.calls - ag.calls}</span> 간격 <span style={{ color: T.red, fontWeight: 600 }}>+{ag.avgInterval - bestAgent.avgInterval}s</span>
                            </div>}
                          </div>
                          {/* Connected Analysis */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.green, marginBottom: 8 }}>CONNECTED ANALYSIS</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 6 }}>
                              {[
                                { label: "평균통화", val: ag.avgConnSec + "s", color: ag.avgConnSec > 40 ? T.green : T.red },
                                { label: "전환율", val: ((ag.signup/(ag.connected||1))*100).toFixed(0) + "%", color: T.purple },
                                { label: "관심률", val: (((ag.interest+ag.signup)/(ag.connected||1))*100).toFixed(0) + "%", color: T.blue },
                              ].map((s, j) => (
                                <div key={j} style={{ textAlign: "center", padding: "6px", background: "#fff", borderRadius: 6, border: `1px solid ${T.border}` }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.val}</div>
                                  <div style={{ fontSize: 8, color: T.dim }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <div style={{ flex: 1, textAlign: "center", padding: "4px", background: "#fff", borderRadius: 4, border: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: ag.shortCalls > 10 ? T.red : T.dim }}>{ag.shortCalls}</div>
                                <div style={{ fontSize: 7, color: T.dim }}>SHORT</div>
                              </div>
                              <div style={{ flex: 1, textAlign: "center", padding: "4px", background: "#fff", borderRadius: 4, border: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.green }}>{ag.longCalls}</div>
                                <div style={{ fontSize: 7, color: T.dim }}>LONG</div>
                              </div>
                              <div style={{ flex: 1, textAlign: "center", padding: "4px", background: "#fff", borderRadius: 4, border: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.cyan }}>{ag.connCallback}/{ag.callback}</div>
                                <div style={{ fontSize: 7, color: T.dim }}>CALLBACK</div>
                              </div>
                            </div>
                          </div>
                          {/* AI Coach */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.purple, marginBottom: 8 }}>AI COACHING</div>
                            {ag.avgConnSec < 30 && <div style={{ padding: "6px 8px", borderRadius: 6, background: `${T.red}08`, border: `1px solid ${T.red}22`, fontSize: 11, color: T.red, marginBottom: 4 }}>통화 {ag.avgConnSec}초 — 스크립트 전달 부족</div>}
                            {ag.avgInterval > 30 && <div style={{ padding: "6px 8px", borderRadius: 6, background: `${T.yellow}08`, border: `1px solid ${T.yellow}22`, fontSize: 11, color: T.orange, marginBottom: 4 }}>콜 간격 {ag.avgInterval}초 — 자동콜 권장</div>}
                            {ag.idleSec > ag.talkSec * 1.5 && <div style={{ padding: "6px 8px", borderRadius: 6, background: `${T.red}08`, border: `1px solid ${T.red}22`, fontSize: 11, color: T.red, marginBottom: 4 }}>IDLE가 통화보다 많음</div>}
                            {isBest && <div style={{ padding: "6px 8px", borderRadius: 6, background: `${T.green}08`, border: `1px solid ${T.green}22`, fontSize: 11, color: T.green }}>전 지표 1위. 페이스 유지.</div>}
                            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                              {[
                                { label: "SPEED", val: ag.avgInterval <= 20 ? "A" : ag.avgInterval <= 30 ? "B" : "C", color: ag.avgInterval <= 20 ? T.green : ag.avgInterval <= 30 ? T.yellow : T.red },
                                { label: "QUALITY", val: parseFloat(connRate) > 28 ? "A" : parseFloat(connRate) > 22 ? "B" : "C", color: parseFloat(connRate) > 28 ? T.green : parseFloat(connRate) > 22 ? T.yellow : T.red },
                                { label: "CONVERT", val: (ag.signup/(ag.connected||1)) > 0.1 ? "A" : (ag.signup/(ag.connected||1)) > 0.05 ? "B" : "C", color: (ag.signup/(ag.connected||1)) > 0.1 ? T.green : (ag.signup/(ag.connected||1)) > 0.05 ? T.yellow : T.red },
                              ].map((g, j) => (
                                <div key={j} style={{ flex: 1, textAlign: "center", padding: "5px", background: "#fff", borderRadius: 6, border: `1px solid ${T.border}` }}>
                                  <div style={{ fontSize: 16, fontWeight: 600, color: g.color }}>{g.val}</div>
                                  <div style={{ fontSize: 7, color: T.dim }}>{g.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Team avg */}
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: T.cardAlt, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.dim, fontWeight: 500 }}>TEAM AVG</span>
                <div style={{ display: "flex", gap: 14, color: T.textSec }}>
                  <span>Calls <strong style={{ color: T.blue }}>{Math.round(totalCalls/5)}</strong></span>
                  <span>Talk <strong style={{ color: T.blue }}>{fmt(Math.round(totalTalk/5))}</strong></span>
                  <span>Idle <strong style={{ color: T.orange }}>{fmt(Math.round(totalIdle/5))}</strong></span>
                </div>
              </div>
            </div>

            {/* HOURLY HEATMAP */}
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>HOURLY BREAKDOWN</div>
                <span style={{ fontSize: 11, color: T.dim }}>{today}</span>
              </div>
              <div style={{ display: "flex", marginBottom: 3, paddingLeft: 50 }}>
                {activeHours.map(h => <div key={h} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 500, color: T.dim }}>{8+h}</div>)}
                <div style={{ width: 44, textAlign: "center", fontSize: 9, color: T.dim }}>SUM</div>
              </div>
              {AGENTS.map(ag => (
                <div key={ag.id} style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                  <div style={{ width: 50, display: "flex", alignItems: "center", gap: 4 }}>
                    {ICONS[ag.id](T.blue)}
                    <span style={{ fontSize: 10, color: T.textSec, fontWeight: 500 }}>{ag.name.slice(0,2)}</span>
                  </div>
                  {activeHours.map(hi => {
                    const val = ag.hourly[hi]; const hc = heatColor(val);
                    return (
                      <div key={hi} onMouseEnter={() => setHoverCell({ a: ag.id, h: hi })} onMouseLeave={() => setHoverCell(null)}
                        style={{ flex: 1, height: 30, margin: "0 1px", borderRadius: 4, background: hc.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "default" }}>
                        <span style={{ fontSize: val === 0 ? 9 : 12, fontWeight: val > 0 ? 600 : 400, color: hc.text }}>{val === 0 ? "-" : val}</span>
                        {hoverCell && hoverCell.a === ag.id && hoverCell.h === hi && val > 0 && (
                          <div style={{ position: "absolute", bottom: "calc(100%+4px)", left: "50%", transform: "translateX(-50%)", padding: "4px 8px", borderRadius: 6, background: "#fff", border: `1px solid ${T.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", whiteSpace: "nowrap", zIndex: 10, fontSize: 11 }}>
                            <strong>{ag.name}</strong> {8+hi}시 — {val}콜 {val >= avgHourly ? <span style={{ color: T.blue }}>+{val-avgHourly}</span> : <span style={{ color: T.red }}>-{avgHourly-val}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ width: 44, textAlign: "center", fontSize: 13, fontWeight: 600, color: T.blue }}>{activeHours.reduce((s,h)=>s+ag.hourly[h],0)}</div>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
                <div style={{ width: 50, fontSize: 10, color: T.dim, fontWeight: 600 }}>TEAM</div>
                {hourlyTotals.map((val, idx) => {
                  const peak = val === Math.max(...hourlyTotals);
                  return <div key={idx} style={{ flex: 1, height: 26, margin: "0 1px", borderRadius: 4, background: peak ? `${T.blue}15` : "#f0f1f4", display: "flex", alignItems: "center", justifyContent: "center", border: peak ? `1px solid ${T.blue}33` : "none" }}>
                    <span style={{ fontSize: 12, fontWeight: peak ? 700 : 500, color: peak ? T.blue : T.dim }}>{val}</span>
                  </div>;
                })}
                <div style={{ width: 44, textAlign: "center", fontSize: 14, fontWeight: 700, color: T.blue }}>{totalCalls}</div>
              </div>
            </div>
          </div>

          {/* ═══ RIGHT: DB Management ═══ */}
          <div style={{ overflowY: "auto", padding: "16px", background: "#fafbfc" }}>

            {/* DB Upload */}
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>DB UPLOAD</div>
              <div style={{ padding: 28, borderRadius: 8, border: `2px dashed ${T.border}`, textAlign: "center", background: T.cardAlt, marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: T.dim, fontWeight: 500 }}>엑셀 파일 드래그 또는 클릭</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>.xlsx .xls .csv (최대 20MB)</div>
                <button style={{ marginTop: 12, padding: "8px 24px", borderRadius: 8, border: `1px solid ${T.blue}`, background: `${T.blue}11`, color: T.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>파일 선택</button>
              </div>
              {/* Sample result */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {[
                  { label: "전체", val: "10,000", color: T.text },
                  { label: "유효", val: "9,120", color: T.green },
                  { label: "결번", val: "650", color: T.red },
                  { label: "중복", val: "230", color: T.orange },
                  { label: "유효율", val: "91.2%", color: T.blue },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 8, background: T.cardAlt, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 9, color: T.dim, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* DB List */}
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>DB LIST</div>
              {DB_LIST.map(db => (
                <div key={db.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: 8, background: T.cardAlt, border: `1px solid ${T.border}`, marginBottom: 6 }}>
                  <Ring pct={db.quality} color={db.quality > 85 ? T.green : T.yellow} size={44} stroke={3.5}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: db.quality > 85 ? T.green : T.yellow }}>{db.quality}</span>
                  </Ring>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{db.name}</span>
                      <span style={{ fontSize: 11, color: T.dim }}>{db.date}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12 }}>
                      <span style={{ color: T.dim }}>전체 <strong style={{ color: T.text }}>{db.total.toLocaleString()}</strong></span>
                      <span style={{ color: T.dim }}>유효 <strong style={{ color: T.green }}>{db.valid.toLocaleString()}</strong></span>
                      <span style={{ color: T.dim }}>중복 <strong style={{ color: T.orange }}>{db.dup}</strong></span>
                    </div>
                    <div style={{ marginTop: 4 }}><Bar pct={(db.valid/db.total)*100} color={db.quality > 85 ? T.green : T.yellow} h={4} /></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Distribution */}
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>DISTRIBUTION</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${T.blue}`, background: `${T.blue}11`, color: T.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>랜덤 분배</button>
                <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#fff", color: T.dim, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}>수동 분배</button>
              </div>
              {AGENTS.map(ag => {
                const low = ag.queue < 50;
                return (
                  <div key={ag.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: 60 }}>
                      {ICONS[ag.id](T.blue)}
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{ag.id}</span>
                    </div>
                    <div style={{ flex: 1 }}><Bar pct={Math.min(ag.queue/5, 100)} color={low ? T.red : T.blue} h={5} /></div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: low ? T.red : T.textSec, width: 40, textAlign: "right" }}>{ag.queue}</span>
                  </div>
                );
              })}
            </div>

            {/* Call Result Summary */}
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>CALL RESULT</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 10, justifyContent: "center" }}>
                {[
                  { pct: Math.round(totalConn/totalCalls*100), color: T.green, label: "연결" },
                  { pct: Math.round(totalAbsent/totalCalls*100), color: T.yellow, label: "부재" },
                  { pct: Math.round(totalInvalid/totalCalls*100), color: T.red, label: "결번" },
                ].map((r, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <Ring pct={r.pct} color={r.color} size={52} stroke={3.5}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.pct}%</span>
                    </Ring>
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 4, fontWeight: 500 }}>{r.label}</div>
                  </div>
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
                  <Led color={item.color} size={6} />
                  <span style={{ fontSize: 12, color: T.textSec, width: 30, fontWeight: 500 }}>{item.label}</span>
                  <div style={{ flex: 1 }}><Bar pct={(item.val/totalCalls)*100} color={item.color} h={5} /></div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: item.color, width: 34, textAlign: "right" }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
