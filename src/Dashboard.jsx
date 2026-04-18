import { useState, useEffect, useRef } from "react";
import { get, post, uploadFile } from "./api.js";

const T = {
  bg: "#f4f5f7", card: "#ffffff", border: "#e2e4e8",
  text: "#1a1a2e", textSec: "#444466", dim: "#7a7a96", muted: "#b0b0c4",
  green: "#00c853", red: "#e53935", blue: "#1e88e5",
  cyan: "#00acc1", yellow: "#f9a825", orange: "#ef6c00",
  purple: "#7c4dff", pink: "#d81b60",
  cardAlt: "#f9fafb",
};

function Led({ color, size=7, pulse }) {
  return <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", background:color, boxShadow:`0 0 4px ${color}55`, animation:pulse?"lp 2s ease-in-out infinite":"none" }}/>;
}
function Bar({ pct, color, h=6 }) {
  return <div style={{ width:"100%", height:h, borderRadius:h, background:"#e8eaee", overflow:"hidden" }}>
    <div style={{ width:`${Math.max(pct,0.5)}%`, height:"100%", borderRadius:h, background:color, transition:"width 0.8s ease" }}/>
  </div>;
}
function Ring({ pct, color, size=50, stroke=4, children }) {
  const r=(size-stroke)/2, ci=2*Math.PI*r;
  return <div style={{ position:"relative", width:size, height:size }}>
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8eaee" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={ci} strokeDashoffset={ci*(1-Math.min(pct,100)/100)} strokeLinecap="round"
        style={{ transition:"stroke-dashoffset 0.8s ease" }}/>
    </svg>
    <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>{children}</div>
  </div>;
}

const fmt=(s)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;};
const ACOL=[T.blue,T.purple,T.cyan,T.green,T.orange];

export default function Dashboard({ user, onLogout }) {
  const [now, setNow] = useState(new Date());
  const [data, setData] = useState(null);
  const [lists, setLists] = useState([]);
  const [queue, setQueue] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [expanded, setExpanded] = useState(null);
  const [settings, setSettings] = useState({ showRanking:true, showIncentive:true, autoCallInterval:20, distMode:"random" });
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [distListId, setDistListId] = useState(null);
  const [distPct, setDistPct] = useState(100);
  const [testStatus, setTestStatus] = useState([]);
  const fileRef = useRef();

  const cid = user?.center_id || 1;

  const refresh = async () => {
    try {
      const [d, l, q, ts] = await Promise.all([
        get(`/dashboard/${cid}`),
        get(`/lists/${cid}`),
        get(`/queue/status/${cid}`),
        get(`/test/status/${cid}`),
      ]);
      setData(d); setLists(l); setQueue(q); setTestStatus(ts);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); const c = setInterval(() => setNow(new Date()), 1000); return () => { clearInterval(t); clearInterval(c); }; }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true); setUploadResult(null);
    try {
      const title = prompt("DB 이름을 입력하세요", file.name.replace(/\.\w+$/, ""));
      if (!title) { setUploading(false); return; }
      const source = prompt("출처 (업자명)", "") || "";
      const res = await uploadFile("/lists/upload-file", file, { title, source });
      setUploadResult(res);
      refresh();
    } catch (e) { alert("Upload failed: " + e.message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDistribute = async (listId) => {
    const mode = settings.distMode === "manual" ? "manual" : "random";
    try {
      const res = await post("/customers/distribute", { list_id: listId, mode, percentage: distPct });
      alert(`분배 완료: ${res.distributed}건\n${Object.entries(res.per_agent).map(([a,c])=>`${a}: ${c}건`).join(", ")}`);
      refresh();
    } catch (e) { alert(e.message); }
  };

  const handleTestStart = async () => {
    try {
      const res = await post("/test/start", { title: "샘플테스트" });
      alert(`테스트 시작: ${res.total}건, 에이전트당 ${res.per_agent}건`);
      refresh();
    } catch (e) { alert(e.message); }
  };

  const handleTestStop = async () => {
    try {
      const res = await post("/test/stop", {});
      if (res.results) res.results.forEach(r => alert(`${r.title}: 연결 ${r.connected}, 부재 ${r.no_answer}, 결번 ${r.invalid}`));
      refresh();
    } catch (e) { alert(e.message); }
  };

  const agents = data?.agents || [];
  const totalCalls = agents.reduce((s,a) => s + a.total_calls, 0);
  const totalConn = agents.reduce((s,a) => s + a.connected, 0);
  const totalNA = agents.reduce((s,a) => s + a.no_answer, 0);
  const totalInv = agents.reduce((s,a) => s + a.invalid_count, 0);
  const totalTalk = agents.reduce((s,a) => s + a.talk_time, 0);
  const sorted = [...agents].sort((a,b) => b.total_calls - a.total_calls);

  const today = now.toLocaleDateString("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit", weekday:"short" });

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'Poppins',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:5px}@keyframes lp{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* HEADER */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", background:"#fff", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16, fontWeight:700, color:T.blue }}>TM</span>
          <span style={{ fontSize:14, fontWeight:500, color:T.text }}>COMMAND CENTER</span>
          <span style={{ fontSize:12, color:T.dim }}>({user?.name})</span>
        </div>
        <div style={{ display:"flex", gap:3, background:T.cardAlt, borderRadius:8, padding:3, border:`1px solid ${T.border}` }}>
          {["dashboard","settings"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"'Poppins',sans-serif", background:tab===t?"#fff":"transparent", color:tab===t?T.text:T.dim, boxShadow:tab===t?"0 1px 3px rgba(0,0,0,0.08)":"none" }}>{t.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Led color={T.green} pulse/><span style={{ fontSize:12, color:T.dim }}>{now.toLocaleTimeString("ko-KR",{hour12:false})}</span>
          <button onClick={onLogout} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${T.border}`, background:"#fff", color:T.dim, fontSize:11, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>LOGOUT</button>
        </div>
      </div>

      {/* SETTINGS */}
      {tab==="settings" && (
        <div style={{ padding:20, maxWidth:600 }}>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>SETTINGS</div>
          {[{label:"팀 랭킹 표시",key:"showRanking"},{label:"인센티브 표시",key:"showIncentive"}].map(s=>(
            <div key={s.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px", borderRadius:10, background:"#fff", border:`1px solid ${T.border}`, marginBottom:8 }}>
              <span style={{ fontSize:14, fontWeight:500 }}>{s.label}</span>
              <button onClick={()=>setSettings(p=>({...p,[s.key]:!p[s.key]}))} style={{ padding:"6px 18px", borderRadius:14, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:settings[s.key]?T.green:"#ddd", color:settings[s.key]?"#fff":"#888" }}>{settings[s.key]?"ON":"OFF"}</button>
            </div>
          ))}
          <div style={{ padding:"16px 18px", borderRadius:10, background:"#fff", border:`1px solid ${T.border}`, marginBottom:8 }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>분배 방식</div>
            <div style={{ display:"flex", gap:6 }}>
              {["random","manual"].map(m=>(
                <button key={m} onClick={()=>setSettings(p=>({...p,distMode:m}))} style={{ padding:"8px 22px", borderRadius:8, border:`1px solid ${settings.distMode===m?T.blue:T.border}`, background:settings.distMode===m?`${T.blue}11`:"#fff", color:settings.distMode===m?T.blue:T.dim, fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>{m==="random"?"랜덤":"수동"}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD */}
      {tab==="dashboard" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", height:"calc(100vh - 49px)" }}>

          {/* LEFT: Performance */}
          <div style={{ overflowY:"auto", padding:16, borderRight:`1px solid ${T.border}` }}>
            {/* KPI */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12 }}>
              {[
                {label:"총 콜",val:totalCalls,color:T.blue},
                {label:"연결",val:totalConn,color:T.green},
                {label:"부재",val:totalNA,color:T.yellow},
                {label:"결번",val:totalInv,color:T.red},
                {label:"통화시간",val:fmt(totalTalk),color:T.blue},
              ].map((k,i)=>(
                <div key={i} style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:12 }}>
                  <div style={{ fontSize:10, color:T.dim, fontWeight:500, marginBottom:4 }}>{k.label}</div>
                  <div style={{ fontSize:22, fontWeight:600, color:k.color }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* AGENTS */}
            <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:14, fontWeight:600 }}>AGENT PERFORMANCE</span>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}><Led color={T.green} pulse/><span style={{ fontSize:10, color:T.dim }}>LIVE</span></div>
              </div>

              {sorted.map((ag,i)=>{
                const rate=ag.total_calls>0?((ag.connected/ag.total_calls)*100).toFixed(1):"0";
                const talkP=ag.talk_time>0?Math.round((ag.talk_time/(ag.talk_time+3600))*100):0;
                const connP=ag.total_calls>0?Math.round((ag.connected/ag.total_calls)*talkP):0;
                const c=ACOL[i%5];
                return(
                  <div key={ag.agent_name} onClick={()=>setExpanded(expanded===ag.agent_name?null:ag.agent_name)} style={{ cursor:"pointer", borderBottom:`1px solid ${T.border}`, padding:"10px 0" }}>
                    <div style={{ display:"flex", alignItems:"center" }}>
                      <div style={{ width:90, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:16, fontWeight:600, color:i===0?T.yellow:T.muted, width:18 }}>{i+1}</span>
                        <span style={{ fontSize:13, fontWeight:500 }}>{ag.name||ag.agent_name}</span>
                      </div>
                      <div style={{ flex:1, marginRight:8 }}>
                        <div style={{ display:"flex", height:22, borderRadius:4, overflow:"hidden", background:"#f0f1f4" }}>
                          <div style={{ width:`${connP}%`, background:T.green, display:"flex", alignItems:"center", paddingLeft:4 }}>
                            <span style={{ fontSize:8, fontWeight:600, color:"#fff", whiteSpace:"nowrap" }}>{ag.connected}</span>
                          </div>
                          <div style={{ width:`${Math.max(talkP-connP,0)}%`, background:`${c}44` }}/>
                          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:6 }}>
                            <span style={{ fontSize:10, color:T.dim }}>{ag.total_calls}콜</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width:55, textAlign:"center", fontSize:15, fontWeight:600, color:c }}>{ag.total_calls}</div>
                      <div style={{ width:45, textAlign:"center", fontSize:15, fontWeight:600, color:T.green }}>{ag.connected}</div>
                      <div style={{ width:50, textAlign:"center", fontSize:13, fontWeight:600, color:parseFloat(rate)>25?T.green:T.red }}>{rate}%</div>
                    </div>

                    {expanded===ag.agent_name && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginTop:10, padding:10, background:T.cardAlt, borderRadius:8 }}>
                        <div>
                          <div style={{ fontSize:10, fontWeight:600, color:T.dim, marginBottom:6 }}>STATS</div>
                          {[{l:"연결",v:ag.connected,c:T.green},{l:"부재",v:ag.no_answer,c:T.yellow},{l:"결번",v:ag.invalid_count,c:T.red},{l:"가입",v:ag.signup||0,c:T.purple},{l:"관심",v:ag.interest||0,c:T.blue},{l:"콜백",v:ag.callback||0,c:T.cyan}].map((s,j)=>(
                            <div key={j} style={{ display:"flex", alignItems:"center", gap:4, marginBottom:3 }}>
                              <Led color={s.c} size={5}/><span style={{ fontSize:11, color:T.dim, width:28 }}>{s.l}</span>
                              <div style={{ flex:1 }}><Bar pct={ag.total_calls>0?(s.v/ag.total_calls)*100:0} color={s.c} h={4}/></div>
                              <span style={{ fontSize:12, fontWeight:600, color:s.c, width:24, textAlign:"right" }}>{s.v}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontSize:10, fontWeight:600, color:T.green, marginBottom:6 }}>CONNECTED</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
                            {[{l:"평균통화",v:(ag.avg_conn_sec||0)+"s",c:ag.avg_conn_sec>40?T.green:T.red},{l:"전환율",v:ag.connected>0?((ag.signup||0)/ag.connected*100).toFixed(0)+"%":"0%",c:T.purple},{l:"통화시간",v:fmt(ag.talk_time),c:T.blue},{l:"잔여DB",v:ag.pending,c:ag.pending<50?T.red:T.dim}].map((s,j)=>(
                              <div key={j} style={{ textAlign:"center", padding:"6px 4px", background:"#fff", borderRadius:6, border:`1px solid ${T.border}` }}>
                                <div style={{ fontSize:14, fontWeight:600, color:s.c }}>{s.v}</div>
                                <div style={{ fontSize:8, color:T.dim }}>{s.l}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, fontWeight:600, color:T.purple, marginBottom:6 }}>HOURLY</div>
                          <div style={{ display:"flex", alignItems:"flex-end", gap:1, height:50 }}>
                            {(ag.hourly||[]).slice(8,19).map((v,hi)=>{
                              const mx=Math.max(...(ag.hourly||[]).slice(8,19),1);
                              return <div key={hi} style={{ flex:1, height:Math.max((v/mx)*45,1), borderRadius:2, background:v===mx&&v>0?c:"#e0e0e8" }} title={`${8+hi}시: ${v}콜`}/>;
                            })}
                          </div>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:T.muted, marginTop:2 }}>
                            <span>8</span><span>13</span><span>18</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {agents.length===0 && <div style={{ textAlign:"center", padding:20, color:T.dim }}>Loading...</div>}
            </div>

            {/* Active Tests */}
            {testStatus.length>0 && (
              <div style={{ background:"#fff", border:`1px solid ${T.pink}33`, borderRadius:10, padding:14, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:14, fontWeight:600, color:T.pink }}>SAMPLE TEST ACTIVE</span>
                  <button onClick={handleTestStop} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${T.red}`, background:"#fff", color:T.red, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>STOP TEST</button>
                </div>
                {testStatus.map(t=>(
                  <div key={t.list_id} style={{ padding:10, background:T.cardAlt, borderRadius:8, marginBottom:4 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:500 }}>{t.title}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:T.pink }}>{t.progress}%</span>
                    </div>
                    <Bar pct={t.progress} color={T.pink} h={5}/>
                    <div style={{ display:"flex", gap:12, marginTop:6, fontSize:12 }}>
                      <span style={{ color:T.dim }}>총 <strong>{t.total}</strong></span>
                      <span style={{ color:T.green }}>연결 <strong>{t.connected}</strong></span>
                      <span style={{ color:T.yellow }}>부재 <strong>{t.no_answer}</strong></span>
                      <span style={{ color:T.red }}>결번 <strong>{t.invalid}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: DB Management */}
          <div style={{ overflowY:"auto", padding:16, background:"#fafbfc" }}>
            {/* Upload */}
            <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>DB UPLOAD</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display:"none" }}/>
              <div onClick={()=>fileRef.current?.click()} style={{ padding:24, borderRadius:8, border:`2px dashed ${T.border}`, textAlign:"center", background:T.cardAlt, cursor:"pointer" }}>
                <div style={{ fontSize:13, color:T.dim, fontWeight:500 }}>{uploading?"업로드 중...":"엑셀 파일 클릭하여 업로드"}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>.xlsx .xls .csv</div>
              </div>
              {uploadResult && (
                <div style={{ marginTop:10 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
                    {[
                      {l:"전체",v:uploadResult.total,c:T.text},
                      {l:"유효",v:uploadResult.valid,c:T.green},
                      {l:"형식오류",v:uploadResult.invalid_phone,c:T.red},
                      {l:"중복",v:uploadResult.duplicate,c:T.orange},
                      {l:"품질",v:uploadResult.quality+"%",c:T.blue},
                    ].map((s,i)=>(
                      <div key={i} style={{ textAlign:"center", padding:"8px 4px", borderRadius:8, background:T.cardAlt, border:`1px solid ${T.border}` }}>
                        <div style={{ fontSize:18, fontWeight:600, color:s.c }}>{s.v}</div>
                        <div style={{ fontSize:9, color:T.dim }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                  {uploadResult.dup_by_list?.length>0 && (
                    <div style={{ marginTop:6, padding:"8px 10px", borderRadius:6, background:`${T.orange}08`, border:`1px solid ${T.orange}22`, fontSize:11, color:T.orange }}>
                      중복: {uploadResult.dup_by_list.map(d=>`${d.list} ${d.count}건`).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DB List */}
            <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:14, fontWeight:600 }}>DB LIST ({lists.length})</span>
                <button onClick={handleTestStart} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${T.pink}`, background:"#fff", color:T.pink, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>SAMPLE TEST</button>
              </div>
              {lists.map(l=>(
                <div key={l.id} style={{ padding:12, borderRadius:8, background:T.cardAlt, border:`1px solid ${T.border}`, marginBottom:6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <div>
                      <span style={{ fontSize:13, fontWeight:600 }}>{l.title}</span>
                      {l.is_test===1 && <span style={{ marginLeft:6, fontSize:9, padding:"2px 6px", borderRadius:8, background:`${T.pink}15`, color:T.pink, fontWeight:600 }}>TEST</span>}
                    </div>
                    <span style={{ fontSize:11, color:T.dim }}>{l.uploaded_at}</span>
                  </div>
                  <div style={{ display:"flex", gap:10, fontSize:12, marginBottom:6 }}>
                    <span style={{ color:T.dim }}>전체 <strong style={{ color:T.text }}>{l.total}</strong></span>
                    <span style={{ color:T.dim }}>사용 <strong style={{ color:T.blue }}>{l.used}</strong></span>
                    <span style={{ color:T.dim }}>잔여 <strong style={{ color:l.remaining<20?T.red:T.text }}>{l.remaining}</strong></span>
                    <span style={{ color:T.dim }}>연결률 <strong style={{ color:T.green }}>{l.connect_rate}%</strong></span>
                  </div>
                  <Bar pct={l.total>0?((l.total-l.remaining)/l.total)*100:0} color={T.blue} h={4}/>
                  <div style={{ display:"flex", gap:6, marginTop:8 }}>
                    <button onClick={()=>handleDistribute(l.id)} style={{ padding:"6px 16px", borderRadius:6, border:`1px solid ${T.blue}`, background:`${T.blue}08`, color:T.blue, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"'Poppins',sans-serif" }}>분배</button>
                    <select value={distPct} onChange={e=>setDistPct(+e.target.value)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${T.border}`, fontSize:11, color:T.textSec, fontFamily:"'Poppins',sans-serif" }}>
                      {[10,20,30,50,100].map(v=><option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                  {/* Agent breakdown */}
                  {l.agents?.length>0 && (
                    <div style={{ marginTop:8 }}>
                      {l.agents.map(a=>(
                        <div key={a.agent_name} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, fontSize:11 }}>
                          <span style={{ fontWeight:600, color:T.blue, width:16 }}>{a.agent_name}</span>
                          <div style={{ flex:1 }}><Bar pct={a.distributed>0?((a.distributed-a.remaining)/a.distributed)*100:0} color={T.blue} h={3}/></div>
                          <span style={{ color:T.dim, width:50, textAlign:"right" }}>{a.remaining}/{a.distributed}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {lists.length===0 && <div style={{ textAlign:"center", padding:16, color:T.dim, fontSize:12 }}>DB 없음</div>}
            </div>

            {/* Queue Status */}
            <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>AGENT QUEUE</div>
              {queue.map((q,i)=>(
                <div key={q.agent_name} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:ACOL[i%5], width:20 }}>{q.agent_name}</span>
                  <div style={{ flex:1 }}><Bar pct={Math.min(q.pending/5,100)} color={q.low?T.red:ACOL[i%5]} h={6}/></div>
                  <span style={{ fontSize:14, fontWeight:600, color:q.low?T.red:T.textSec, width:40, textAlign:"right" }}>{q.pending}</span>
                  {q.low && <span style={{ fontSize:9, color:T.red, fontWeight:600 }}>LOW</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
