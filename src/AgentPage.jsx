import { useState, useEffect, useRef } from "react";

const T = {
  bg: "#0c0c10", card: "#111116", border: "#1c1c24",
  text: "#e8e8ee", dim: "#7a7a8a", muted: "#3a3a48",
  green: "#00ff88", red: "#ff2d55", blue: "#00aaff",
  cyan: "#00e5ff", yellow: "#ffd600", orange: "#ff9100",
  purple: "#b388ff", pink: "#ff4081",
};



const TEAM_DATA = [
  { id: "D", name: "최유나", calls: 82, connected: 22, signup: 3 },
  { id: "B", name: "이서연", calls: 71, connected: 18, signup: 2 },
  { id: "A", name: "김민수", calls: 42, connected: 12, signup: 1 },
  { id: "E", name: "정태우", calls: 38, connected: 9, signup: 1 },
  { id: "C", name: "박지훈", calls: 29, connected: 6, signup: 0 },
];

const INIT_HISTORY = [
  { id: 101, phone: "010-1111-2222", name: "김하늘", result: "관심", time: "09:42", duration: 85, memo: "자료 요청함" },
  { id: 102, phone: "010-3333-4444", name: null, result: "부재", time: "09:45", duration: 0, memo: "" },
  { id: 103, phone: "010-5555-6666", name: "정우성", result: "거절", time: "09:48", duration: 22, memo: "바쁘다고 함" },
  { id: 104, phone: "010-7777-8888", name: "송지효", result: "가입", time: "09:52", duration: 198, memo: "가입 완료" },
  { id: 105, phone: "010-2222-3333", name: null, result: "결번", time: "09:54", duration: 0, memo: "" },
  { id: 106, phone: "010-4444-5555", name: "한지민", result: "콜백", time: "09:57", duration: 15, memo: "오후 3시 콜백" },
  { id: 107, phone: "010-6666-7777", name: null, result: "부재", time: "10:01", duration: 0, memo: "" },
  { id: 108, phone: "010-8888-9999", name: "이병헌", result: "관심", time: "10:05", duration: 125, memo: "상세 안내 원함" },
];

const QUEUE = [
  { id: 201, phone: "010-2345-6789", name: "박서준", region: "서울 강남" },
  { id: 202, phone: "010-8765-4321", name: "이미영", region: "서울 송파" },
  { id: 203, phone: "010-5555-1234", name: null, region: "경기 성남" },
  { id: 204, phone: "010-3333-7777", name: "최동훈", region: "서울 마포" },
  { id: 205, phone: "010-9999-2222", name: null, region: "인천 남동" },
];

const INBOUND = { phone: "010-3333-4444", time: "09:45", name: null };

const fmt = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
const fmtM = (s) => { const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };

const RC = { 가입: T.purple, 관심: T.blue, 콜백: T.cyan, 거절: T.orange, 부재: T.yellow, 결번: T.red };
const RESULTS = ["가입","관심","콜백","거절","부재","결번"];
const GOAL = { calls: 200, connected: 50 };

function Led({ color, size=6, pulse }) {
  return <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", background:color, boxShadow:`0 0 4px ${color}66, 0 0 8px ${color}33`, animation:pulse?"lp 2s ease-in-out infinite":"none" }}/>;
}
function Bar({ pct, color, h=5 }) {
  return <div style={{ width:"100%", height:h, borderRadius:h, background:"#1a1a24", overflow:"hidden" }}>
    <div style={{ width:`${Math.max(pct,0.5)}%`, height:"100%", borderRadius:h, background:color, boxShadow:`0 0 6px ${color}22`, transition:"width 0.8s ease" }}/>
  </div>;
}
function Ring({ pct, color, size=54, stroke=3.5, children }) {
  const r=(size-stroke)/2, c=2*Math.PI*r;
  return <div style={{ position:"relative", width:size, height:size }}>
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a24" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c*(1-Math.min(pct,100)/100)} strokeLinecap="round"
        style={{ filter:`drop-shadow(0 0 3px ${color}55)`, transition:"stroke-dashoffset 0.8s ease" }}/>
    </svg>
    <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>{children}</div>
  </div>;
}

export default function AgentPage({ user, onLogout }) {
  const ME = { id: user?.agent_name || "A", name: user?.name || "Agent" };
  const TEAM = TEAM_DATA;
  const [now, setNow] = useState(new Date());
  const [callState, setCallState] = useState("idle"); // idle | ringing | connected | done
  const [cur, setCur] = useState(null); // current calling customer
  const [selected, setSelected] = useState(null); // selected from log to view
  const [timer, setTimer] = useState(0);
  const [autoCall, setAutoCall] = useState(false);
  const [autoTimer, setAutoTimer] = useState(0);
  const [memo, setMemo] = useState("");
  const [detailMemo, setDetailMemo] = useState("");
  const [history, setHistory] = useState(INIT_HISTORY);
  const [queue, setQueue] = useState(QUEUE);
  const [showRanking, setShowRanking] = useState(true);
  const [showInbound, setShowInbound] = useState(true);
  const [logFilter, setLogFilter] = useState("all");
  const [stats, setStats] = useState({ calls:42, connected:12, absent:18, invalid:5, rejected:4, signup:1, callback:3, talkSec:1380 });
  const tRef = useRef(); const aRef = useRef();

  useEffect(() => { const t=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(t); },[]);
  useEffect(() => {
    if(callState==="connected"){tRef.current=setInterval(()=>setTimer(p=>p+1),1000);}
    else clearInterval(tRef.current);
    return()=>clearInterval(tRef.current);
  },[callState]);
  useEffect(() => {
    if(callState==="done"&&autoCall&&autoTimer>0){
      aRef.current=setInterval(()=>{ setAutoTimer(p=>{ if(p<=1){clearInterval(aRef.current);nextCall();return 0;} return p-1; }); },1000);
    }
    return()=>clearInterval(aRef.current);
  },[callState,autoCall,autoTimer]);

  const nextCall = () => {
    if(queue.length===0) return;
    const n=queue[0]; setCur(n); setQueue(q=>q.slice(1));
    setCallState("ringing"); setTimer(0); setMemo(""); setSelected(null);
    setTimeout(()=>setCallState("connected"),2000);
  };
  const callFromLog = (entry) => {
    setCur({ id:entry.id, phone:entry.phone, name:entry.name, region:"" });
    setCallState("ringing"); setTimer(0); setMemo(""); setSelected(null);
    setTimeout(()=>setCallState("connected"),2000);
  };
  const hangup = () => { setCallState("done"); if(autoCall) setAutoTimer(20); };
  const doResult = (r) => {
    if(!cur) return;
    const entry = { id:Date.now(), phone:cur.phone, name:cur.name, result:r,
      time:now.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false}), duration:timer, memo };
    setHistory(h=>[entry,...h]); setStats(s=>({...s, calls:s.calls+1}));
    setCur(null); setCallState("idle"); setAutoTimer(0);
    if(autoCall){setCallState("done");setAutoTimer(20);}
  };

  const callPct = Math.round((stats.calls/GOAL.calls)*100);
  const connPct = Math.round(((stats.connected+stats.signup)/GOAL.connected)*100);
  const filtered = logFilter==="all" ? history : history.filter(h=>h.result===logFilter);
  const myRank = TEAM.findIndex(t=>t.id===ME.id)+1;
  const maxTC = Math.max(...TEAM.map(t=>t.calls));

  // Center view mode
  const centerMode = callState!=="idle" ? "call" : selected ? "detail" : "ready";

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a38;border-radius:3px}
        @keyframes lp{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes rp{0%{box-shadow:0 0 0 0 rgba(0,229,255,0.3)}70%{box-shadow:0 0 0 24px rgba(0,229,255,0)}100%{box-shadow:0 0 0 0 rgba(0,229,255,0)}}
        @keyframes ifl{0%,100%{border-color:#00ff8844}50%{border-color:#00ff88}}
        textarea{font-family:'Poppins',sans-serif}
      `}</style>

      {/* HEADER */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 24px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:14, fontWeight:600, color:T.cyan, letterSpacing:"0.06em" }}>TM</span>
          <span style={{ fontSize:14, fontWeight:500 }}>{ME.name}</span>
          <span style={{ fontSize:11, color:T.dim }}>Agent {ME.id}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:T.dim }}>AUTO CALL</span>
            <button onClick={()=>setAutoCall(!autoCall)} style={{
              padding:"5px 14px", borderRadius:14, border:"none", cursor:"pointer",
              fontSize:11, fontWeight:600, fontFamily:"'Poppins',sans-serif",
              background:autoCall?T.green:"#1c1c24", color:autoCall?"#000":T.muted,
              boxShadow:autoCall?`0 0 10px ${T.green}44`:"none", transition:"all 0.3s",
            }}>{autoCall?"ON":"OFF"}</button>
          </div>
          <Led color={T.green} pulse/>
          <span style={{ fontSize:12, color:T.dim, fontWeight:300 }}>{now.toLocaleTimeString("ko-KR",{hour12:false})}</span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"340px 1fr 320px", height:"calc(100vh - 49px)" }}>

        {/* ═══ LEFT: Stats + Log ═══ */}
        <div style={{ borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>

          {/* Stats */}
          <div style={{ padding:"16px 18px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
              {[
                { label:"CALLS", val:stats.calls, color:T.cyan },
                { label:"CONN", val:stats.connected+stats.signup, color:T.green },
                { label:"RATE", val:((stats.connected+stats.signup)/(stats.calls||1)*100).toFixed(0)+"%", color:T.green },
              ].map((s,i)=>(
                <div key={i} style={{ textAlign:"center", padding:"10px 6px", borderRadius:10, background:T.card, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:22, fontWeight:200, color:s.color }}>{s.val}</div>
                  <div style={{ fontSize:8, color:T.muted, letterSpacing:"0.06em", marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Goal rings + talk time */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:10 }}>
                <Ring pct={callPct} color={T.cyan} size={44} stroke={3}>
                  <span style={{ fontSize:11, fontWeight:200, color:T.cyan }}>{callPct}%</span>
                </Ring>
                <Ring pct={connPct} color={T.green} size={44} stroke={3}>
                  <span style={{ fontSize:11, fontWeight:200, color:T.green }}>{connPct}%</span>
                </Ring>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:14, fontWeight:200, color:T.blue }}>{fmtM(stats.talkSec)}</div>
                <div style={{ fontSize:8, color:T.muted }}>TALK TIME</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:14, fontWeight:200, color:queue.length<30?T.red:T.dim }}>{queue.length}</div>
                <div style={{ fontSize:8, color:T.muted }}>QUEUE</div>
              </div>
            </div>
          </div>

          {/* Ranking toggle */}
          <div style={{ padding:"10px 18px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:10, color:T.muted, letterSpacing:"0.08em", fontWeight:500 }}>TEAM RANKING</span>
              <button onClick={()=>setShowRanking(!showRanking)} style={{
                padding:"3px 10px", borderRadius:10, border:"none", cursor:"pointer",
                fontSize:9, fontWeight:500, fontFamily:"'Poppins',sans-serif",
                background:showRanking?"#1c1c24":"#1c1c24", color:showRanking?T.text:T.muted,
              }}>{showRanking?"ON":"OFF"}</button>
            </div>
            {showRanking && (
              <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3 }}>
                {TEAM.map((t,i)=>{
                  const isMe=t.id===ME.id;
                  const rate=((t.connected/(t.calls||1))*100).toFixed(0);
                  const medal = i===0?"1st":i===1?"2nd":null;
                  return (
                    <div key={t.id} style={{
                      display:"flex", alignItems:"center", gap:6,
                      padding:"8px 10px", borderRadius:8,
                      background:isMe?`${T.cyan}08`:i<2?`${T.yellow}04`:"transparent",
                      border:`1px solid ${isMe?T.cyan+"33":i<2?T.yellow+"15":T.border}`,
                    }}>
                      <span style={{ fontSize:14, fontWeight:200, color:i===0?T.yellow:i===1?"#ccaa44":T.muted, width:16, textAlign:"center" }}>{i+1}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <span style={{ fontSize:11, fontWeight:isMe?500:400, color:isMe?T.cyan:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</span>
                          {isMe && <span style={{ fontSize:7, padding:"1px 5px", borderRadius:6, background:`${T.cyan}15`, color:T.cyan, fontWeight:600 }}>ME</span>}
                          {medal && <span style={{ fontSize:7, padding:"1px 5px", borderRadius:6, background:`${T.yellow}12`, color:T.yellow, fontWeight:600 }}>{medal}</span>}
                        </div>
                        <div style={{ height:4, borderRadius:2, background:"#1a1a24", marginTop:3, overflow:"hidden" }}>
                          <div style={{ width:`${(t.calls/maxTC)*100}%`, height:"100%", borderRadius:2, background:isMe?T.cyan:`${T.text}18` }}/>
                        </div>
                      </div>
                      <span style={{ fontSize:13, fontWeight:200, color:isMe?T.cyan:T.dim, width:30, textAlign:"right" }}>{t.calls}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize:9, color:T.dim, fontWeight:300, marginTop:4, textAlign:"center" }}>
                  1st, 2nd 일일 인센티브 지급
                </div>
              </div>
            )}
          </div>

          {/* Call Log - clickable */}
          <div style={{ padding:"10px 18px 6px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.muted, letterSpacing:"0.08em", fontWeight:500, marginBottom:8 }}>CALL LOG</div>
            <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
              {[{key:"all",label:"전체"},...RESULTS.map(r=>({key:r,label:r}))].map(tab=>(
                <button key={tab.key} onClick={()=>setLogFilter(tab.key)} style={{
                  padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer",
                  fontSize:10, fontWeight:400, fontFamily:"'Poppins',sans-serif",
                  background:logFilter===tab.key?"#1c1c24":"transparent",
                  color:logFilter===tab.key?(RC[tab.key]||T.text):T.muted,
                }}>{tab.label}</button>
              ))}
            </div>
          </div>

          {/* Log entries */}
          <div style={{ flex:1, overflowY:"auto" }}>
            {filtered.map(h=>{
              const isSel = selected && selected.id===h.id;
              return (
                <div key={h.id} onClick={()=>{ if(callState==="idle"){ setSelected(h); setDetailMemo(h.memo||""); }}}
                  style={{
                    padding:"10px 18px", borderBottom:`1px solid ${T.border}`, cursor:callState==="idle"?"pointer":"default",
                    background:isSel?`${T.cyan}06`:"transparent", transition:"background 0.15s",
                    borderLeft:isSel?`2px solid ${T.cyan}`:"2px solid transparent",
                  }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Led color={RC[h.result]} size={5}/>
                      <span style={{ fontSize:12, fontWeight:400, color:T.text }}>{h.name||"이름없음"}</span>
                    </div>
                    <span style={{ fontSize:10, fontWeight:200, color:T.muted }}>{h.time}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:T.dim, fontWeight:300 }}>{h.phone}</span>
                      <span style={{ fontSize:9, fontWeight:500, color:RC[h.result], padding:"1px 8px", borderRadius:8, background:`${RC[h.result]}10` }}>{h.result}</span>
                    </div>
                    {h.duration>0 && <span style={{ fontSize:10, fontWeight:200, color:T.muted }}>{fmt(h.duration)}</span>}
                  </div>
                  {h.memo && <div style={{ fontSize:10, color:T.muted, fontWeight:300, marginTop:3 }}>{h.memo}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ CENTER ═══ */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px", position:"relative" }}>

          {/* Inbound */}
          {showInbound && callState==="idle" && !cur && (
            <div style={{
              position:"absolute", top:16, left:24, right:24,
              padding:"14px 18px", borderRadius:12,
              background:`${T.green}06`, border:`1px solid ${T.green}33`,
              animation:"ifl 2s ease infinite",
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <div>
                <div style={{ fontSize:12, color:T.green, fontWeight:500 }}>INBOUND</div>
                <div style={{ fontSize:14, color:T.text, fontWeight:300, marginTop:3 }}>{INBOUND.phone}</div>
                <div style={{ fontSize:11, color:T.dim, marginTop:2 }}>오늘 {INBOUND.time}에 콜 했던 번호 (부재)</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setShowInbound(false)} style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${T.border}`, background:T.card, color:T.muted, fontSize:12, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>닫기</button>
                <button onClick={()=>{ setShowInbound(false); setCur({id:999,phone:INBOUND.phone,name:INBOUND.name}); setCallState("connected"); setTimer(0); setMemo(""); setSelected(null); }}
                  style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${T.green}33`, background:`${T.green}12`, color:T.green, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>받기</button>
              </div>
            </div>
          )}

          {/* READY */}
          {centerMode==="ready" && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:14, color:T.muted, fontWeight:300, marginBottom:24, letterSpacing:"0.06em" }}>READY</div>
              <button onClick={nextCall} disabled={queue.length===0} style={{
                width:140, height:140, borderRadius:"50%",
                border:`2px solid ${queue.length>0?T.cyan+"44":T.muted}`,
                background:queue.length>0?`${T.cyan}06`:T.card,
                color:queue.length>0?T.cyan:T.muted,
                fontSize:14, fontWeight:500, cursor:queue.length>0?"pointer":"default",
                fontFamily:"'Poppins',sans-serif", letterSpacing:"0.06em",
              }}>NEXT CALL</button>
              <div style={{ fontSize:12, color:T.dim, marginTop:20 }}>대기 {queue.length}건</div>
            </div>
          )}

          {/* DETAIL VIEW (selected from log) */}
          {centerMode==="detail" && selected && (
            <div style={{ width:"100%", maxWidth:440 }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ fontSize:22, fontWeight:400, color:T.text, marginBottom:4 }}>{selected.name||"이름없음"}</div>
                <div style={{ fontSize:18, fontWeight:200, color:T.dim }}>{selected.phone}</div>
                <div style={{ marginTop:8, display:"flex", justifyContent:"center", gap:6 }}>
                  <span style={{ fontSize:11, fontWeight:500, color:RC[selected.result], padding:"3px 12px", borderRadius:10, background:`${RC[selected.result]}10`, border:`1px solid ${RC[selected.result]}18` }}>{selected.result}</span>
                  {selected.duration>0 && <span style={{ fontSize:11, color:T.dim, padding:"3px 12px", borderRadius:10, background:T.card, border:`1px solid ${T.border}` }}>{fmt(selected.duration)}</span>}
                  <span style={{ fontSize:11, color:T.muted, padding:"3px 12px", borderRadius:10, background:T.card, border:`1px solid ${T.border}` }}>{selected.time}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:20 }}>
                <button onClick={()=>callFromLog(selected)} style={{
                  padding:"12px 28px", borderRadius:10,
                  border:`1px solid ${T.cyan}33`, background:`${T.cyan}08`,
                  color:T.cyan, fontSize:14, fontWeight:500, cursor:"pointer",
                  fontFamily:"'Poppins',sans-serif",
                }}>전화걸기</button>
                <button onClick={()=>{setSelected(null)}} style={{
                  padding:"12px 28px", borderRadius:10,
                  border:`1px solid ${T.border}`, background:T.card,
                  color:T.dim, fontSize:14, fontWeight:400, cursor:"pointer",
                  fontFamily:"'Poppins',sans-serif",
                }}>닫기</button>
              </div>

              {/* Memo edit */}
              <div style={{ fontSize:10, color:T.muted, letterSpacing:"0.08em", marginBottom:8 }}>MEMO</div>
              <textarea value={detailMemo} onChange={e=>setDetailMemo(e.target.value)} placeholder="메모 입력..."
                rows={4} style={{
                  width:"100%", padding:"14px 16px", borderRadius:10,
                  background:T.card, border:`1px solid ${T.border}`,
                  color:T.text, fontSize:13, fontWeight:300, resize:"none", outline:"none", lineHeight:1.6,
                }}/>
              <button onClick={()=>{
                setHistory(h=>h.map(x=>x.id===selected.id?{...x,memo:detailMemo}:x));
                setSelected({...selected, memo:detailMemo});
              }} style={{
                marginTop:8, padding:"8px 20px", borderRadius:8,
                border:`1px solid ${T.border}`, background:T.card,
                color:T.dim, fontSize:11, cursor:"pointer", fontFamily:"'Poppins',sans-serif",
              }}>저장</button>
            </div>
          )}

          {/* AUTO COUNTDOWN */}
          {callState==="done" && autoCall && autoTimer>0 && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:64, fontWeight:200, color:T.cyan }}>{autoTimer}</div>
              <div style={{ fontSize:12, color:T.dim, marginTop:10 }}>NEXT CALL IN</div>
              <button onClick={()=>{setAutoTimer(0);clearInterval(aRef.current);setCallState("idle");}} style={{ marginTop:20, padding:"10px 28px", borderRadius:8, border:`1px solid ${T.border}`, background:T.card, color:T.muted, fontSize:12, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>STOP</button>
            </div>
          )}

          {/* CALLING */}
          {(callState==="ringing"||callState==="connected") && cur && (
            <div style={{ textAlign:"center", width:"100%", maxWidth:440 }}>
              <div style={{
                width:160, height:160, borderRadius:"50%", margin:"0 auto 24px",
                border:`2px solid ${callState==="ringing"?T.cyan+"44":T.green+"44"}`,
                background:callState==="ringing"?`${T.cyan}04`:`${T.green}04`,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                animation:callState==="ringing"?"rp 1.5s infinite":"none",
              }}>
                {callState==="ringing" ? (
                  <><div style={{ fontSize:13, color:T.cyan, letterSpacing:"0.08em" }}>CALLING</div><div style={{ fontSize:11, color:T.muted, marginTop:4 }}>...</div></>
                ) : (
                  <><div style={{ fontSize:34, fontWeight:200, color:T.green }}>{fmt(timer)}</div><div style={{ fontSize:10, color:T.green, letterSpacing:"0.08em", marginTop:4 }}>CONNECTED</div></>
                )}
              </div>

              <div style={{ marginBottom:24 }}>
                {cur.name ? <div style={{ fontSize:22, fontWeight:400, marginBottom:4 }}>{cur.name}</div> : <div style={{ fontSize:16, fontWeight:300, color:T.muted, marginBottom:4 }}>이름 없음</div>}
                <div style={{ fontSize:18, fontWeight:200, color:T.dim }}>{cur.phone}</div>
                {cur.region && <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>{cur.region}</div>}
              </div>

              {callState==="connected" && (
                <>
                  <button onClick={hangup} style={{
                    width:64, height:64, borderRadius:"50%",
                    border:`2px solid ${T.red}44`, background:`${T.red}10`,
                    color:T.red, fontSize:12, fontWeight:500, cursor:"pointer",
                    fontFamily:"'Poppins',sans-serif", margin:"0 auto 24px", display:"block",
                  }}>END</button>

                  <div style={{ fontSize:10, color:T.muted, letterSpacing:"0.08em", marginBottom:10 }}>RESULT</div>
                  <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
                    {RESULTS.map(r=>(
                      <button key={r} onClick={()=>doResult(r)} style={{
                        padding:"12px 22px", borderRadius:10,
                        border:`1px solid ${RC[r]}22`, background:`${RC[r]}06`,
                        color:RC[r], fontSize:13, fontWeight:500, cursor:"pointer",
                        fontFamily:"'Poppins',sans-serif",
                      }}>{r}</button>
                    ))}
                  </div>
                  <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="메모 입력..."
                    rows={2} style={{
                      width:"100%", marginTop:16, padding:"12px 14px", borderRadius:10,
                      background:T.card, border:`1px solid ${T.border}`,
                      color:T.text, fontSize:13, fontWeight:300, resize:"none", outline:"none",
                    }}/>
                </>
              )}
            </div>
          )}

          {/* AI Coach - bottom */}
          {callState==="idle" && !selected && (
            <div style={{ position:"absolute", bottom:20, left:24, right:24, padding:"12px 16px", borderRadius:10, background:T.card, border:`1px solid ${T.purple}12`, fontSize:12, color:T.dim, fontWeight:300, lineHeight:1.6 }}>
              <span style={{ color:T.purple, fontWeight:500, fontSize:10 }}>AI COACH </span>
              {myRank<=2
                ? <>{myRank}위 유지 중. 목표까지 <span style={{color:T.cyan}}>{GOAL.calls-stats.calls}콜</span>.</>
                : <>현재 {myRank}위. 1위 {TEAM[0].name}과 <span style={{color:T.red}}>{TEAM[0].calls-stats.calls}콜</span> 차이. 2위 안에 들면 인센티브!</>
              }
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Result Summary ═══ */}
        <div style={{ borderLeft:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"16px 18px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.muted, letterSpacing:"0.1em", fontWeight:500, marginBottom:12 }}>RESULT SUMMARY</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
              {[
                { label:"연결", val:stats.connected, color:T.green },
                { label:"부재", val:stats.absent, color:T.yellow },
                { label:"거절", val:stats.rejected, color:T.orange },
                { label:"결번", val:stats.invalid, color:T.red },
                { label:"가입", val:stats.signup, color:T.purple },
                { label:"콜백", val:stats.callback, color:T.cyan },
              ].map((s,i)=>(
                <div key={i} style={{ textAlign:"center", padding:"10px 4px", borderRadius:8, background:T.card, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:18, fontWeight:200, color:s.color }}>{s.val}</div>
                  <div style={{ fontSize:8, color:T.muted, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming queue */}
          <div style={{ padding:"14px 18px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.muted, letterSpacing:"0.1em", fontWeight:500, marginBottom:10 }}>NEXT UP</div>
            {queue.slice(0,5).map((q,i)=>(
              <div key={q.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:i<Math.min(queue.length,5)-1?`1px solid ${T.border}`:"none" }}>
                <span style={{ fontSize:12, fontWeight:200, color:T.muted, width:16 }}>{i+1}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:400, color:T.text }}>{q.name||"---"}</div>
                  <div style={{ fontSize:10, color:T.muted, fontWeight:300 }}>{q.region}</div>
                </div>
              </div>
            ))}
            {queue.length===0 && <div style={{ fontSize:11, color:T.muted, textAlign:"center", padding:10 }}>대기 없음</div>}
          </div>

          {/* Today timeline */}
          <div style={{ flex:1, padding:"14px 18px", overflowY:"auto" }}>
            <div style={{ fontSize:10, color:T.muted, letterSpacing:"0.1em", fontWeight:500, marginBottom:10 }}>TIMELINE</div>
            {history.slice(0,15).map(h=>(
              <div key={h.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0" }}>
                <span style={{ fontSize:10, color:T.muted, fontWeight:200, width:36 }}>{h.time}</span>
                <Led color={RC[h.result]} size={4}/>
                <span style={{ fontSize:10, color:T.dim, fontWeight:300, flex:1 }}>{h.name||h.phone.slice(-4)}</span>
                <span style={{ fontSize:9, color:RC[h.result], fontWeight:400 }}>{h.result}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
