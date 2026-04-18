import { useState, useEffect, useRef } from "react";
import { get, post, put } from "./api.js";

const T = {
  bg: "#f4f5f7", card: "#ffffff", border: "#e2e4e8",
  text: "#1a1a2e", textSec: "#444466", dim: "#7a7a96", muted: "#b0b0c4",
  green: "#00c853", red: "#e53935", blue: "#1e88e5",
  cyan: "#00acc1", yellow: "#f9a825", orange: "#ef6c00",
  purple: "#7c4dff", pink: "#d81b60", cardAlt: "#f9fafb",
};

const RC = { connected:T.green, signup:T.purple, interest:T.blue, callback:T.cyan, rejected:T.orange, no_answer:T.yellow, invalid:T.red };
const RL = { connected:"연결", signup:"가입", interest:"관심", callback:"콜백", rejected:"거절", no_answer:"부재", invalid:"결번" };
const RESULTS = ["signup","interest","callback","rejected","no_answer","invalid"];

function Led({ color, size=7, pulse }) {
  return <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", background:color, boxShadow:`0 0 4px ${color}55`, animation:pulse?"lp 2s ease-in-out infinite":"none" }}/>;
}
function Bar({ pct, color, h=5 }) {
  return <div style={{ width:"100%", height:h, borderRadius:h, background:"#e8eaee", overflow:"hidden" }}>
    <div style={{ width:`${Math.max(pct,0.5)}%`, height:"100%", borderRadius:h, background:color, transition:"width 0.6s ease" }}/>
  </div>;
}
function Ring({ pct, color, size=50, stroke=4, children }) {
  const r=(size-stroke)/2, ci=2*Math.PI*r;
  return <div style={{ position:"relative", width:size, height:size }}>
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8eaee" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={ci} strokeDashoffset={ci*(1-Math.min(pct,100)/100)} strokeLinecap="round" style={{ transition:"stroke-dashoffset 0.8s ease" }}/>
    </svg>
    <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>{children}</div>
  </div>;
}

const fmt=(s)=>`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
const fmtM=(s)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;};
const timeStr=(iso)=>{try{const d=new Date(iso);return d.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false});}catch{return"";}};

export default function AgentPage({ user, onLogout }) {
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState(null);
  const [team, setTeam] = useState([]);
  const [history, setHistory] = useState([]);
  const [callState, setCallState] = useState("idle"); // idle | ringing | connected | done
  const [cur, setCur] = useState(null);
  const [callId, setCallId] = useState(null);
  const [timer, setTimer] = useState(0);
  const [autoCall, setAutoCall] = useState(false);
  const [autoTimer, setAutoTimer] = useState(0);
  const [memo, setMemo] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailMemo, setDetailMemo] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [showRank, setShowRank] = useState(true);
  const tRef = useRef(); const aRef = useRef();

  const ME = user?.agent_name || "A";
  const GOAL = { calls: 200, connected: 50 };

  const refresh = async () => {
    try {
      const [s, t, h] = await Promise.all([get("/agent/me"), get("/agent/team"), get("/agent/history")]);
      setStats(s); setTeam(t); setHistory(h);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); const c = setInterval(() => setNow(new Date()), 1000); return () => { clearInterval(t); clearInterval(c); }; }, []);

  useEffect(() => {
    if (callState === "connected") tRef.current = setInterval(() => setTimer(p => p + 1), 1000);
    else clearInterval(tRef.current);
    return () => clearInterval(tRef.current);
  }, [callState]);

  useEffect(() => {
    if (callState === "done" && autoCall && autoTimer > 0) {
      aRef.current = setInterval(() => {
        setAutoTimer(p => { if (p <= 1) { clearInterval(aRef.current); nextCall(); return 0; } return p - 1; });
      }, 1000);
    }
    return () => clearInterval(aRef.current);
  }, [callState, autoCall, autoTimer]);

  const nextCall = async () => {
    try {
      const c = await post("/calls/next", {});
      setCur(c); setCallState("ringing"); setTimer(0); setMemo(""); setSelected(null);
      const call = await post("/calls/start", { customer_id: c.id });
      setCallId(call.call_id);
      setTimeout(() => setCallState("connected"), 1500);
    } catch (e) {
      alert("대기 없음");
      setCallState("idle");
    }
  };

  const doResult = async (result) => {
    if (!callId) return;
    try {
      await put(`/calls/${callId}/end`, { result, duration_sec: timer, memo });
      setCur(null); setCallId(null); setCallState("idle");
      if (autoCall) { setCallState("done"); setAutoTimer(20); }
      refresh();
    } catch (e) { alert(e.message); }
  };

  const s = stats || { total_calls:0, connected:0, no_answer:0, invalid:0, rejected:0, signup:0, callback:0, interest:0, talk_time:0, pending:0 };
  const callPct = Math.round((s.total_calls / GOAL.calls) * 100);
  const connPct = Math.round((s.connected / GOAL.connected) * 100);
  const myRank = team.findIndex(t => t.agent_name === ME) + 1;
  const maxTC = Math.max(...team.map(t => t.total_calls), 1);
  const filtered = logFilter === "all" ? history : history.filter(h => h.result === logFilter);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Poppins', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:4px}@keyframes lp{0%,100%{opacity:1}50%{opacity:.3}}@keyframes rp{0%{box-shadow:0 0 0 0 rgba(30,136,229,0.3)}70%{box-shadow:0 0 0 20px rgba(30,136,229,0)}100%{box-shadow:0 0 0 0 rgba(30,136,229,0)}}textarea{font-family:'Poppins',sans-serif}`}</style>

      {/* HEADER */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", background:"#fff", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16, fontWeight:700, color:T.blue }}>TM</span>
          <span style={{ fontSize:14, fontWeight:500 }}>{user?.name}</span>
          <span style={{ fontSize:12, color:T.dim }}>Agent {ME}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:11, color:T.dim }}>AUTO</span>
          <button onClick={() => setAutoCall(!autoCall)} style={{ padding:"5px 14px", borderRadius:14, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:autoCall?T.green:"#ddd", color:autoCall?"#fff":"#888" }}>{autoCall?"ON":"OFF"}</button>
          <Led color={T.green} pulse/>
          <span style={{ fontSize:12, color:T.dim }}>{now.toLocaleTimeString("ko-KR",{hour12:false})}</span>
          <button onClick={onLogout} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${T.border}`, background:"#fff", color:T.dim, fontSize:11, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>LOGOUT</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"320px 1fr 300px", height:"calc(100vh - 49px)" }}>

        {/* LEFT */}
        <div style={{ borderRight:`1px solid ${T.border}`, overflowY:"auto", padding:14 }}>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:12 }}>
            {[{l:"CALLS",v:s.total_calls,c:T.blue},{l:"CONN",v:s.connected,c:T.green},{l:"RATE",v:s.total_calls>0?((s.connected/s.total_calls)*100).toFixed(0)+"%":"0%",c:T.green}].map((x,i)=>(
              <div key={i} style={{ textAlign:"center", padding:"10px 4px", borderRadius:10, background:"#fff", border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:22, fontWeight:600, color:x.c }}>{x.v}</div>
                <div style={{ fontSize:9, color:T.dim }}>{x.l}</div>
              </div>
            ))}
          </div>

          {/* Result bars */}
          {[{l:"연결",v:s.connected,c:T.green},{l:"부재",v:s.no_answer,c:T.yellow},{l:"거절",v:s.rejected,c:T.orange},{l:"결번",v:s.invalid,c:T.red},{l:"가입",v:s.signup,c:T.purple},{l:"콜백",v:s.callback,c:T.cyan}].map((x,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
              <Led color={x.c} size={5}/><span style={{ fontSize:11, color:T.dim, width:28 }}>{x.l}</span>
              <div style={{ flex:1 }}><Bar pct={s.total_calls>0?(x.v/s.total_calls)*100:0} color={x.c}/></div>
              <span style={{ fontSize:13, fontWeight:600, color:x.c, width:24, textAlign:"right" }}>{x.v}</span>
            </div>
          ))}

          {/* Goal */}
          <div style={{ display:"flex", gap:8, margin:"12px 0", justifyContent:"center" }}>
            <Ring pct={callPct} color={T.blue} size={48} stroke={3.5}><span style={{ fontSize:12, fontWeight:600, color:T.blue }}>{callPct}%</span></Ring>
            <Ring pct={connPct} color={T.green} size={48} stroke={3.5}><span style={{ fontSize:12, fontWeight:600, color:T.green }}>{connPct}%</span></Ring>
            <div style={{ display:"flex", flexDirection:"column", justifyContent:"center" }}>
              <div style={{ fontSize:11, color:T.dim }}>통화 <strong style={{ color:T.blue }}>{fmtM(s.talk_time)}</strong></div>
              <div style={{ fontSize:11, color:T.dim }}>잔여 <strong style={{ color:s.pending<30?T.red:T.text }}>{s.pending}건</strong></div>
            </div>
          </div>

          {/* Team Ranking */}
          {team.length > 0 && (
            <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:600, color:T.dim }}>TEAM RANKING</span>
              </div>
              {team.map((t, i) => {
                const isMe = t.agent_name === ME;
                return (
                  <div key={t.agent_name} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px", borderRadius:6, marginBottom:3, background:isMe?`${T.blue}08`:"transparent", border:`1px solid ${isMe?T.blue+"22":"transparent"}` }}>
                    <span style={{ fontSize:14, fontWeight:600, color:i===0?T.yellow:T.muted, width:16 }}>{i+1}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:12, fontWeight:isMe?600:400 }}>{t.name}</span>
                        {isMe && <span style={{ fontSize:8, padding:"1px 5px", borderRadius:6, background:`${T.blue}15`, color:T.blue, fontWeight:600 }}>ME</span>}
                        {i<2 && <span style={{ fontSize:8, padding:"1px 5px", borderRadius:6, background:`${T.yellow}15`, color:T.yellow, fontWeight:600 }}>{i===0?"1st":"2nd"}</span>}
                      </div>
                      <div style={{ height:4, borderRadius:2, background:"#eee", marginTop:3 }}>
                        <div style={{ width:`${(t.total_calls/maxTC)*100}%`, height:"100%", borderRadius:2, background:isMe?T.blue:"#ccc" }}/>
                      </div>
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color:isMe?T.blue:T.dim, width:28, textAlign:"right" }}>{t.total_calls}</span>
                  </div>
                );
              })}
              <div style={{ fontSize:10, color:T.dim, textAlign:"center", marginTop:6 }}>1st, 2nd 일일 인센티브</div>
            </div>
          )}
        </div>

        {/* CENTER */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative" }}>

          {/* IDLE */}
          {callState === "idle" && !selected && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:14, color:T.muted, marginBottom:20 }}>READY</div>
              <button onClick={nextCall} style={{ width:130, height:130, borderRadius:"50%", border:`2px solid ${T.blue}33`, background:`${T.blue}06`, color:T.blue, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>NEXT CALL</button>
              <div style={{ fontSize:12, color:T.dim, marginTop:16 }}>대기 {s.pending}건</div>
            </div>
          )}

          {/* AUTO COUNTDOWN */}
          {callState === "done" && autoCall && autoTimer > 0 && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:60, fontWeight:300, color:T.blue }}>{autoTimer}</div>
              <div style={{ fontSize:12, color:T.dim, marginTop:8 }}>NEXT CALL IN</div>
              <button onClick={() => { setAutoTimer(0); clearInterval(aRef.current); setCallState("idle"); }} style={{ marginTop:16, padding:"8px 24px", borderRadius:8, border:`1px solid ${T.border}`, background:"#fff", color:T.dim, fontSize:12, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>STOP</button>
            </div>
          )}

          {/* DETAIL VIEW */}
          {callState === "idle" && selected && (
            <div style={{ width:"100%", maxWidth:420, textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>{selected.name || "이름없음"}</div>
              <div style={{ fontSize:16, color:T.dim, marginBottom:8 }}>{selected.phone}</div>
              <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:16 }}>
                <span style={{ fontSize:11, fontWeight:600, color:RC[selected.result], padding:"3px 12px", borderRadius:10, background:`${RC[selected.result]}12` }}>{RL[selected.result]||selected.result}</span>
                {selected.duration>0 && <span style={{ fontSize:11, color:T.dim, padding:"3px 12px", borderRadius:10, background:T.cardAlt, border:`1px solid ${T.border}` }}>{fmt(selected.duration)}</span>}
              </div>
              <textarea value={detailMemo} onChange={e=>setDetailMemo(e.target.value)} placeholder="메모..." rows={3} style={{ width:"100%", padding:"12px", borderRadius:10, background:"#fff", border:`1px solid ${T.border}`, color:T.text, fontSize:13, resize:"none", outline:"none" }}/>
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:12 }}>
                <button onClick={() => setSelected(null)} style={{ padding:"10px 24px", borderRadius:8, border:`1px solid ${T.border}`, background:"#fff", color:T.dim, fontSize:13, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>닫기</button>
              </div>
            </div>
          )}

          {/* CALLING */}
          {(callState === "ringing" || callState === "connected") && cur && (
            <div style={{ textAlign:"center", width:"100%", maxWidth:420 }}>
              <div style={{ width:150, height:150, borderRadius:"50%", margin:"0 auto 20px", border:`2px solid ${callState==="ringing"?T.blue+"33":T.green+"33"}`, background:callState==="ringing"?`${T.blue}04`:`${T.green}04`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", animation:callState==="ringing"?"rp 1.5s infinite":"none" }}>
                {callState === "ringing" ? (
                  <><div style={{ fontSize:14, color:T.blue }}>CALLING...</div></>
                ) : (
                  <><div style={{ fontSize:32, fontWeight:300, color:T.green }}>{fmt(timer)}</div><div style={{ fontSize:10, color:T.green, marginTop:4 }}>CONNECTED</div></>
                )}
              </div>
              <div style={{ marginBottom:20 }}>
                {cur.name ? <div style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>{cur.name}</div> : <div style={{ fontSize:16, color:T.muted, marginBottom:4 }}>이름 없음</div>}
                <div style={{ fontSize:16, color:T.dim }}>{cur.phone_number}</div>
                {cur.is_test === 1 && <span style={{ fontSize:9, padding:"2px 8px", borderRadius:8, background:`${T.pink}12`, color:T.pink, fontWeight:600, marginTop:4, display:"inline-block" }}>SAMPLE</span>}
              </div>
              {callState === "connected" && (
                <>
                  <button onClick={() => doResult("connected")} style={{ width:60, height:60, borderRadius:"50%", border:`2px solid ${T.red}33`, background:`${T.red}08`, color:T.red, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"'Poppins',sans-serif", margin:"0 auto 20px", display:"block" }}>END</button>
                  <div style={{ fontSize:11, color:T.dim, marginBottom:8 }}>RESULT</div>
                  <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap" }}>
                    {RESULTS.map(r => (
                      <button key={r} onClick={() => doResult(r)} style={{ padding:"10px 18px", borderRadius:10, border:`1px solid ${RC[r]}22`, background:`${RC[r]}06`, color:RC[r], fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>{RL[r]}</button>
                    ))}
                  </div>
                  <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="메모..." rows={2} style={{ width:"100%", marginTop:14, padding:"12px", borderRadius:10, background:"#fff", border:`1px solid ${T.border}`, color:T.text, fontSize:13, resize:"none", outline:"none" }} />
                </>
              )}
            </div>
          )}

          {/* AI Coach */}
          {callState === "idle" && !selected && (
            <div style={{ position:"absolute", bottom:16, left:20, right:20, padding:"10px 14px", borderRadius:10, background:"#fff", border:`1px solid ${T.purple}22`, fontSize:12, color:T.dim }}>
              <span style={{ color:T.purple, fontWeight:600 }}>AI </span>
              {myRank <= 2
                ? <>{myRank}위 유지 중. 목표까지 <strong style={{ color:T.blue }}>{GOAL.calls - s.total_calls}콜</strong>.</>
                : <>현재 {myRank}위. 1위와 <strong style={{ color:T.red }}>{(team[0]?.total_calls||0) - s.total_calls}콜</strong> 차이. 2위 안에 들면 인센티브!</>
              }
            </div>
          )}
        </div>

        {/* RIGHT: Log */}
        <div style={{ borderLeft:`1px solid ${T.border}`, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"12px 14px", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ fontSize:11, fontWeight:600, color:T.dim, marginBottom:8 }}>CALL LOG</div>
            <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
              {[{key:"all",label:"전체"},...RESULTS.map(r=>({key:r,label:RL[r]}))].map(tab=>(
                <button key={tab.key} onClick={()=>setLogFilter(tab.key)} style={{ padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:10, fontWeight:500, fontFamily:"'Poppins',sans-serif", background:logFilter===tab.key?"#fff":"transparent", color:logFilter===tab.key?(RC[tab.key]||T.text):T.muted, boxShadow:logFilter===tab.key?"0 1px 2px rgba(0,0,0,0.06)":"none" }}>{tab.label}</button>
              ))}
            </div>
          </div>
          <div style={{ flex:1, overflowY:"auto" }}>
            {filtered.map(h => (
              <div key={h.id} onClick={() => { if(callState==="idle"){setSelected(h);setDetailMemo("");} }} style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, cursor:callState==="idle"?"pointer":"default", background:selected?.id===h.id?`${T.blue}06`:"transparent" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <Led color={RC[h.result]||T.dim} size={5}/>
                    <span style={{ fontSize:12, fontWeight:500 }}>{h.name || "이름없음"}</span>
                  </div>
                  <span style={{ fontSize:10, color:T.muted }}>{timeStr(h.time)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:T.dim }}>{h.phone}</span>
                    <span style={{ fontSize:9, fontWeight:600, color:RC[h.result], padding:"1px 8px", borderRadius:8, background:`${RC[h.result]}10` }}>{RL[h.result]||h.result}</span>
                  </div>
                  {h.duration > 0 && <span style={{ fontSize:10, color:T.muted }}>{fmt(h.duration)}</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ textAlign:"center", padding:20, color:T.muted }}>기록 없음</div>}
          </div>
          <div style={{ padding:"10px 14px", borderTop:`1px solid ${T.border}`, fontSize:11, color:T.dim, display:"flex", justifyContent:"space-between" }}>
            <span>총 {history.length}건</span>
            <span>통화 {fmtM(history.reduce((s,h) => s + (h.duration||0), 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
