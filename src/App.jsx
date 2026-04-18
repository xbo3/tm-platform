import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import * as API from "./api.js";

const T={bg:"#000",surface:"linear-gradient(145deg,#0a0a0a,#111,#0a0a0a)",card:"linear-gradient(165deg,#141414,#0c0c0c,#111)",gloss:"linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 50%)",border:"rgba(255,255,255,.06)",borderLight:"rgba(255,255,255,.1)",cyan:"#00f0ff",purple:"#a855f7",pink:"#f43f5e",orange:"#fb923c",blue:"#4facfe",green:"#34d399",red:"#ef4444",yellow:"#fbbf24",text:"#f0f0f0",textSoft:"#888",textDim:"#444"};
const f="'Poppins',sans-serif";
const AC=[T.cyan,T.purple,T.pink,T.orange,T.blue];
const maskPhone=ph=>ph?.replace(/(\d{3})-(\d{4})-(\d{4})/,"$1-****-$3")||"";
const fmtTime=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`};

// ── Shared UI Components ──
const Glow=({color,size=200,top,left,right,bottom,opacity=.08})=><div style={{position:"absolute",width:size,height:size,borderRadius:"50%",background:color,filter:`blur(${size*.6}px)`,opacity,top,left,right,bottom,pointerEvents:"none"}}/>;
const GlossCard=({children,style:sx,glow,glowColor})=><div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,position:"relative",overflow:"hidden",...sx}}><div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:14}}/>{glow&&<Glow color={glowColor||T.cyan} size={80} top={-30} right={-30} opacity={.06}/>}<div style={{position:"relative",zIndex:1}}>{children}</div></div>;
const Badge=({children,color=T.cyan,glow,pulse})=><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,background:`${color}12`,color,border:`1px solid ${color}20`,fontSize:10,fontFamily:f,fontWeight:400,letterSpacing:.5,boxShadow:glow?`0 0 10px ${color}18`:"none",animation:pulse?"pulse 1.5s infinite":"none"}}>{children}</span>;
const StatusDot=({status,size=7})=>{const c={calling:T.cyan,idle:T.textDim,busy:T.orange};return<span style={{width:size,height:size,borderRadius:"50%",background:c[status]||T.textDim,display:"inline-block",boxShadow:status==="calling"?`0 0 8px ${T.cyan}`:"none"}}/>};
const Btn=({children,onClick,variant="primary",size="md",style:sx,disabled})=>{const base={border:"none",borderRadius:10,cursor:disabled?"not-allowed":"pointer",fontFamily:f,fontWeight:300,transition:"all .2s",letterSpacing:.3,opacity:disabled?0.4:1,...(size==="sm"?{padding:"6px 14px",fontSize:11}:size==="xs"?{padding:"4px 10px",fontSize:10}:{padding:"11px 22px",fontSize:13})};const v={primary:{background:"linear-gradient(135deg,#00f0ff,#a855f7)",color:"#000",fontWeight:400},danger:{background:"linear-gradient(135deg,#f43f5e,#fb923c)",color:"#fff"},ghost:{background:"transparent",color:T.textSoft,border:`1px solid ${T.border}`},success:{background:"linear-gradient(135deg,#34d399,#4facfe)",color:"#000",fontWeight:400}};return<button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...sx}}>{children}</button>};
const Toggle=({checked,onChange,label})=><label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:12,color:T.text,fontFamily:f,fontWeight:300}}><div onClick={()=>onChange(!checked)} style={{width:40,height:22,borderRadius:11,padding:2,background:checked?"linear-gradient(135deg,#00f0ff,#a855f7)":"rgba(255,255,255,.08)",transition:"background .3s",cursor:"pointer"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",transform:checked?"translateX(18px)":"translateX(0)",transition:"transform .2s"}}/></div>{label}</label>;
const MiniBar=({value,max,color,h=5})=><div style={{height:h,background:"rgba(255,255,255,.04)",borderRadius:h/2,overflow:"hidden"}}><div style={{height:h,borderRadius:h/2,width:`${Math.min((value/(max||1))*100,100)}%`,background:color,transition:"width .5s"}}/></div>;
const SideNav=({items,active,onSelect,title,subtitle})=><div style={{width:210,background:T.surface,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,height:"100%",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none"}}/><div style={{padding:"20px 18px 14px",borderBottom:`1px solid ${T.border}`,position:"relative",zIndex:1}}><div style={{fontSize:14,fontWeight:300,color:T.text,fontFamily:f,letterSpacing:.5}}>{title}</div>{subtitle&&<div style={{fontSize:9,color:T.textDim,fontFamily:f,marginTop:4,textTransform:"uppercase",letterSpacing:3,fontWeight:300}}>{subtitle}</div>}</div><nav style={{padding:"8px 0",flex:1,position:"relative",zIndex:1}}>{items.map(item=><div key={item.key} onClick={()=>onSelect(item.key)} style={{padding:"9px 18px",cursor:"pointer",fontSize:12,fontFamily:f,fontWeight:active===item.key?400:300,color:active===item.key?T.cyan:T.textSoft,background:active===item.key?"rgba(0,240,255,.04)":"transparent",borderLeft:active===item.key?`2px solid ${T.cyan}`:"2px solid transparent",transition:"all .2s"}}>{item.label}</div>)}</nav></div>;
const Modal=({open,onClose,title,children,width=520})=>{if(!open)return null;return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:18,width,maxWidth:"92vw",maxHeight:"85vh",overflow:"auto",position:"relative"}}><div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:18}}/><div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}><span style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f}}>{title}</span><span onClick={onClose} style={{cursor:"pointer",color:T.textDim,fontSize:18,fontWeight:200}}>×</span></div><div style={{padding:20,position:"relative",zIndex:1}}>{children}</div></div></div>};
const InputField=({label,value,onChange,type="text",placeholder})=><div style={{marginBottom:12}}><div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:5,fontWeight:300}}>{label}</div><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"9px 12px",background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,fontFamily:f,fontWeight:300,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="rgba(0,240,255,.3)"} onBlur={e=>e.target.style.borderColor=T.border}/></div>;
const tipStyle={background:"#111",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontSize:10,fontFamily:f};
const lbl={fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2.5,fontWeight:300};

// ═══════════════════════════════════════
// LOGIN — Real API
// ═══════════════════════════════════════
const LoginPage=({onLogin})=>{
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const doLogin=async()=>{
    if(!email||!pass)return setErr("이메일과 비밀번호를 입력하세요");
    setLoading(true);setErr("");
    const data=await API.login(email,pass);
    setLoading(false);
    if(data?.error)return setErr(data.error);
    if(data?.user)onLogin(data.user);
  };
  const quickLogin=async(e)=>{setEmail(e);setPass("1234");setLoading(true);setErr("");const data=await API.login(e,"1234");setLoading(false);if(data?.user)onLogin(data.user);else setErr(data?.error||"Login failed");};
  return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,position:"relative",overflow:"hidden"}}>
      <Glow color={T.cyan} size={400} top="5%" left="15%" opacity={.06}/><Glow color={T.purple} size={350} bottom="10%" right="10%" opacity={.05}/>
      <div style={{width:420,background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:24,padding:40,position:"relative",zIndex:1,overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:24}}/>
        <div style={{textAlign:"center",marginBottom:32,position:"relative",zIndex:1}}>
          <div style={{fontSize:9,fontFamily:f,fontWeight:300,color:T.cyan,textTransform:"uppercase",letterSpacing:8,marginBottom:10}}>Telemarketing</div>
          <div style={{fontSize:26,fontWeight:200,color:T.text,letterSpacing:3}}>TM Platform</div>
          <div style={{width:40,height:1,background:`linear-gradient(90deg, ${T.cyan}, ${T.purple})`,margin:"14px auto 0"}}/>
        </div>
        <div style={{position:"relative",zIndex:1}}>
          <InputField label="Email" value={email} onChange={setEmail} placeholder="admin@tm.kr"/>
          <InputField label="Password" value={pass} onChange={setPass} type="password" placeholder="••••••••"/>
          {err&&<div style={{color:T.red,fontSize:11,fontFamily:f,fontWeight:300,marginBottom:10}}>{err}</div>}
          <Btn onClick={doLogin} disabled={loading} style={{width:"100%",marginBottom:16}}>{loading?"Loading...":"Login"}</Btn>
          <div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,textAlign:"center",marginBottom:10}}>Quick Login</div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>quickLogin("admin@tm.kr")} variant="ghost" size="sm" style={{flex:1}}>Super Admin</Btn>
            <Btn onClick={()=>quickLogin("center@tm.kr")} variant="ghost" size="sm" style={{flex:1}}>센터장</Btn>
            <Btn onClick={()=>quickLogin("agenta@tm.kr")} variant="ghost" size="sm" style={{flex:1}}>상담원</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
// SUPER ADMIN — Real API
// ═══════════════════════════════════════
const SuperAdmin=({user,onLogout})=>{
  const [tab,setTab]=useState("centers");
  const [centers,setCenters]=useState([]);
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({name:"",admin_email:"",admin_name:"",phone_count:5,plan:"basic"});
  const nav=[{key:"centers",label:"센터 관리"},{key:"billing",label:"수익"}];

  useEffect(()=>{API.getCenters().then(d=>d&&!d.error&&setCenters(d));},[]);

  const doCreate=async()=>{
    await API.createCenter(form);
    const d=await API.getCenters();if(d&&!d.error)setCenters(d);
    setModal(false);setForm({name:"",admin_email:"",admin_name:"",phone_count:5,plan:"basic"});
  };

  return(
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="TM Platform" subtitle="super admin"/>
      <div style={{flex:1,overflow:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><div style={{fontSize:18,fontWeight:200,fontFamily:f}}>{nav.find(n=>n.key===tab)?.label}</div><div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:3}}>{user.name} ({user.email})</div></div>
          <div style={{display:"flex",gap:6}}>{tab==="centers"&&<Btn onClick={()=>setModal(true)} size="sm">+ 센터</Btn>}<Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn></div>
        </div>

        {tab==="centers"&&<>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <GlossCard glow glowColor={T.purple} style={{flex:1,minWidth:120,padding:"14px 16px"}}><div style={{...lbl,marginBottom:6}}>Centers</div><div style={{fontSize:22,fontWeight:200,color:T.text,fontFamily:f}}>{centers.length}</div></GlossCard>
            <GlossCard glow glowColor={T.cyan} style={{flex:1,minWidth:120,padding:"14px 16px"}}><div style={{...lbl,marginBottom:6}}>Total Calls</div><div style={{fontSize:22,fontWeight:200,color:T.text,fontFamily:f}}>{centers.reduce((a,c)=>a+(c.today_calls||0),0)}</div></GlossCard>
          </div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:f}}>
              <thead><tr>{["센터명","센터장","전화기","콜","연결률","요금제","상태"].map((h,i)=><th key={i} style={{padding:"10px 14px",color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,borderBottom:`1px solid ${T.border}`,fontWeight:300,textAlign:i>2?"center":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{centers.map(r=><tr key={r.id} style={{borderBottom:`1px solid rgba(255,255,255,.02)`}}>
                <td style={{padding:"10px 14px",color:T.cyan,fontWeight:400}}>{r.name}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.owner_name||"-"}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.phone_count}</td>
                <td style={{padding:"10px 14px",textAlign:"center",fontWeight:300}}>{r.today_calls}</td>
                <td style={{padding:"10px 14px",textAlign:"center",color:parseFloat(r.connect_rate)>20?T.green:T.red,fontWeight:400}}>{r.connect_rate}%</td>
                <td style={{padding:"10px 14px",textAlign:"center"}}><Badge color={r.plan==="premium"?T.purple:T.textDim}>{r.plan}</Badge></td>
                <td style={{padding:"10px 14px",textAlign:"center"}}><Badge color={r.is_active?T.green:T.red}>{r.is_active?"ON":"OFF"}</Badge></td>
              </tr>)}</tbody>
            </table>
          </GlossCard>
        </>}

        {tab==="billing"&&<div style={{display:"flex",gap:14,flexWrap:"wrap"}}>{centers.map(c=><GlossCard key={c.id} glow glowColor={c.plan==="premium"?T.purple:T.textDim} style={{flex:1,minWidth:180,padding:18}}>
          <div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:4}}>{c.name}</div>
          <Badge color={c.plan==="premium"?T.purple:T.textDim}>{c.plan}</Badge>
          <div style={{marginTop:14,fontSize:24,fontWeight:200,fontFamily:f,color:T.text}}>{c.plan==="premium"?"₩890,000":"₩490,000"}</div>
        </GlossCard>)}</div>}

        <Modal open={modal} onClose={()=>setModal(false)} title="새 센터 생성">
          <InputField label="센터명" value={form.name} onChange={v=>setForm({...form,name:v})} placeholder="서울 강남센터"/>
          <InputField label="센터장 이메일" value={form.admin_email} onChange={v=>setForm({...form,admin_email:v})} placeholder="admin@center.kr"/>
          <InputField label="센터장 이름" value={form.admin_name} onChange={v=>setForm({...form,admin_name:v})} placeholder="김센터장"/>
          <InputField label="전화기 수" value={String(form.phone_count)} onChange={v=>setForm({...form,phone_count:parseInt(v)||5})} type="number"/>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <Btn size="sm" variant={form.plan==="basic"?"primary":"ghost"} onClick={()=>setForm({...form,plan:"basic"})}>Basic</Btn>
            <Btn size="sm" variant={form.plan==="premium"?"primary":"ghost"} onClick={()=>setForm({...form,plan:"premium"})}>Premium</Btn>
          </div>
          <Btn onClick={doCreate} style={{width:"100%"}}>Create</Btn>
        </Modal>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
// CENTER ADMIN — Real API
// ═══════════════════════════════════════
const CenterAdmin=({user,onLogout})=>{
  const [tab,setTab]=useState("dashboard");
  const [dash,setDash]=useState(null);
  const [lists,setLists]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [recordings,setRecordings]=useState([]);
  const [uploadModal,setUploadModal]=useState(false);
  const [distModal,setDistModal]=useState(null);
  const [distValues,setDistValues]=useState({});
  const [uploadForm,setUploadForm]=useState({title:"",source:"",isTest:false,file:null});
  const cid=user.center_id;

  const loadDash=useCallback(()=>{API.getDashboard(cid).then(d=>{if(d&&!d.error)setDash(d)});},[cid]);
  const loadLists=useCallback(()=>{API.getLists(cid).then(d=>{if(d&&!d.error)setLists(d)});},[cid]);
  const loadCustomers=useCallback(()=>{API.getCustomers({}).then(d=>{if(d&&!d.error)setCustomers(d)});},[]);
  const loadRecordings=useCallback(()=>{API.getRecordings(cid).then(d=>{if(d&&!d.error)setRecordings(d)});},[cid]);

  useEffect(()=>{loadDash();const iv=setInterval(loadDash,10000);return()=>clearInterval(iv);},[loadDash]);
  useEffect(()=>{if(tab==="db"){loadLists();loadCustomers();}if(tab==="recordings")loadRecordings();},[tab,loadLists,loadCustomers,loadRecordings]);

  const nav=[{key:"dashboard",label:"대시보드"},{key:"db",label:"DB 관리"},{key:"recordings",label:"녹음"},{key:"settings",label:"설정"}];
  const agents=dash?.agents||[];
  const dbLists=dash?.lists||[];
  const center=dash?.center||{};

  const doUpload=async()=>{
    if(!uploadForm.file)return;
    await API.uploadExcel(uploadForm.file,uploadForm.title,uploadForm.source,uploadForm.isTest);
    setUploadModal(false);loadLists();loadDash();
  };

  const openDist=(list)=>{
    const agentNames=agents.map(a=>a.agent_name);
    const vals={};agentNames.forEach(n=>vals[n]=Math.floor((list.remaining||0)/agentNames.length));
    setDistValues(vals);setDistModal(list);
  };

  const doDist=async()=>{
    if(!distModal)return;
    await API.distribute({list_id:distModal.id,distribution:distValues});
    setDistModal(null);loadLists();loadDash();
  };

  const doUpdateCenter=async(field,val)=>{
    await API.updateCenter(cid,{[field]:val});loadDash();
  };

  return(
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title={center.name||"센터"} subtitle="center admin"/>
      <div style={{flex:1,overflow:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div><div style={{fontSize:18,fontWeight:200,fontFamily:f}}>{nav.find(n=>n.key===tab)?.label}</div><div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:3}}>{user.name}</div></div>
          <Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn>
        </div>

        {/* DASHBOARD */}
        {tab==="dashboard"&&dash&&<>
          <div style={{...lbl,marginBottom:10}}>Agent 실시간 현황</div>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {agents.map((a,i)=>{
              const rate=a.total_calls>0?((a.connected/a.total_calls)*100).toFixed(1):"0.0";
              const isIdle=a.status==="idle";
              return(
                <GlossCard key={a.agent_name} glow glowColor={AC[i%5]} style={{flex:1,minWidth:118,padding:"14px 12px",border:isIdle?`1px solid ${T.red}30`:`1px solid ${T.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}><StatusDot status={a.status} size={8}/><span style={{fontSize:14,fontWeight:400,color:AC[i%5],fontFamily:f}}>TM {a.agent_name}</span></div>
                    {isIdle?<Badge color={T.red} pulse>IDLE</Badge>:<Badge color={T.cyan}>WORK</Badge>}
                  </div>
                  <div style={{textAlign:"center",margin:"6px 0 10px"}}><div style={{fontSize:28,fontWeight:200,color:parseFloat(rate)>25?T.green:parseFloat(rate)>15?T.orange:T.red,fontFamily:f,lineHeight:1}}>{rate}%</div><div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:3}}>연결률</div></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 10px",fontSize:11,fontFamily:f,fontWeight:300}}>
                    <div style={{color:T.textSoft}}>총콜 <span style={{float:"right",color:T.text,fontWeight:400}}>{a.total_calls}</span></div>
                    <div style={{color:T.textSoft}}>연결 <span style={{float:"right",color:T.green,fontWeight:400}}>{a.connected}</span></div>
                    <div style={{color:T.textSoft}}>부재 <span style={{float:"right",color:T.orange,fontWeight:400}}>{a.no_answer}</span></div>
                    <div style={{color:T.textSoft}}>결번 <span style={{float:"right",color:T.red,fontWeight:400}}>{a.invalid_count}</span></div>
                    <div style={{color:T.textSoft}}>대기 <span style={{float:"right",color:T.text}}>{a.pending}</span></div>
                    <div style={{color:T.textSoft}}>통화 <span style={{float:"right",color:T.cyan,fontWeight:400}}>{fmtTime(a.talk_time)}</span></div>
                  </div>
                  <div style={{marginTop:8,padding:"6px 0",borderTop:`1px solid ${T.border}`}}>
                    <div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,letterSpacing:1,marginBottom:4}}>부재 상세</div>
                    <div style={{display:"flex",gap:4,fontSize:10,fontFamily:f,fontWeight:300}}>
                      <span style={{flex:1,textAlign:"center",color:T.yellow,background:"rgba(251,191,36,.06)",borderRadius:4,padding:"2px 0"}}>1회 {a.na1||0}</span>
                      <span style={{flex:1,textAlign:"center",color:T.orange,background:"rgba(251,146,60,.06)",borderRadius:4,padding:"2px 0"}}>2회 {a.na2||0}</span>
                      <span style={{flex:1,textAlign:"center",color:T.red,background:"rgba(239,68,68,.06)",borderRadius:4,padding:"2px 0"}}>3회 {a.na3||0}</span>
                    </div>
                  </div>
                  <MiniBar value={a.total_calls} max={100} color={AC[i%5]} h={4}/>
                </GlossCard>
              );
            })}
          </div>

          <div style={{...lbl,marginBottom:10}}>DB 퀄리티 현황</div>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {dbLists.map(d=>{
              const qColor=parseFloat(d.connect_rate)>25?T.green:parseFloat(d.connect_rate)>15?T.orange:T.red;
              return(<GlossCard key={d.id} glow glowColor={qColor} style={{flex:1,minWidth:180,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:400,color:T.text,fontFamily:f}}>{d.title}</span>
                  <Badge color={qColor}>{d.connect_rate}%</Badge>
                </div>
                <div style={{display:"flex",gap:12,fontSize:10,fontFamily:f,fontWeight:300,marginBottom:6}}>
                  <span style={{color:T.textSoft}}>총 {d.total}</span>
                  <span style={{color:T.green}}>연결 {d.done_count||0}</span>
                  <span style={{color:T.red}}>결번 {d.invalid_count||0}</span>
                  <span style={{color:d.remaining>20?T.textSoft:T.red}}>잔여 {d.remaining}</span>
                </div>
                <MiniBar value={d.used} max={d.total||1} color={qColor} h={4}/>
              </GlossCard>);
            })}
          </div>

          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <GlossCard style={{flex:1,minWidth:280,padding:16}}>
              <div style={{...lbl,marginBottom:14}}>Agent별 연결률</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={agents.map((a,i)=>({name:`TM ${a.agent_name}`,rate:a.total_calls>0?parseFloat(((a.connected/a.total_calls)*100).toFixed(1)):0}))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)"/>
                  <XAxis type="number" stroke={T.textDim} fontSize={10}/><YAxis type="category" dataKey="name" stroke={T.textDim} fontSize={10} width={45} fontFamily={f}/>
                  <Tooltip contentStyle={tipStyle}/><Bar dataKey="rate" radius={[0,4,4,0]}>{agents.map((_,i)=><Cell key={i} fill={AC[i%5]}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlossCard>
          </div>
        </>}

        {/* DB MANAGEMENT */}
        {tab==="db"&&<>
          <div style={{display:"flex",gap:8,marginBottom:18}}>
            <Btn onClick={()=>setUploadModal(true)} size="sm">Upload Excel</Btn>
            <Btn onClick={async()=>{await API.startTest();loadLists();loadDash();}} size="sm" variant="ghost">100건 테스트</Btn>
            <Btn onClick={async()=>{await API.stopTest();loadLists();loadDash();}} size="sm" variant="danger">테스트 삭제</Btn>
          </div>
          <div style={{...lbl,marginBottom:8}}>DB 리스트</div>
          {lists.map(d=><GlossCard key={d.id} style={{marginBottom:10,padding:"12px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:400,color:T.text,fontFamily:f}}>{d.title}</span>
                <Badge color={T.purple}>{d.source}</Badge>
                <Badge color={d.is_test?T.orange:T.green}>{d.is_test?"Test":"Prod"}</Badge>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Badge color={parseFloat(d.connect_rate)>25?T.green:T.orange}>연결 {d.connect_rate}%</Badge>
                {d.remaining>0&&<Btn size="xs" variant="ghost" onClick={()=>openDist(d)}>분배</Btn>}
              </div>
            </div>
            {d.agents?.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {d.agents.map((a,i)=><div key={a.agent_name} style={{flex:1,minWidth:70,background:"rgba(255,255,255,.02)",borderRadius:6,padding:"4px 6px",textAlign:"center"}}>
                <div style={{fontSize:9,color:AC[i%5],fontWeight:400,fontFamily:f}}>TM {a.agent_name}</div>
                <div style={{fontSize:9,fontFamily:f,fontWeight:300,color:T.textSoft}}>{a.used}/{a.distributed} 잔여{a.remaining}</div>
              </div>)}
            </div>}
          </GlossCard>)}

          <div style={{...lbl,marginBottom:8,marginTop:20}}>고객 목록 (최근 200건)</div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:f}}>
              <thead><tr>{["이름","전화번호","상태","부재","배정","메모"].map((h,i)=><th key={i} style={{padding:"8px 12px",color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,borderBottom:`1px solid ${T.border}`,fontWeight:300,textAlign:"left"}}>{h}</th>)}</tr></thead>
              <tbody>{customers.slice(0,50).map(c=>{
                const sc={pending:T.textDim,calling:T.orange,done:T.green,no_answer:T.orange,invalid:T.red,retry:T.yellow};
                return<tr key={c.id} style={{borderBottom:`1px solid rgba(255,255,255,.02)`}}>
                  <td style={{padding:"8px 12px",fontWeight:300}}>{c.name}</td>
                  <td style={{padding:"8px 12px",fontWeight:300}}>{center.show_phone?c.phone_number:maskPhone(c.phone_number)}</td>
                  <td style={{padding:"8px 12px"}}><Badge color={sc[c.status]||T.textDim}>{c.status}</Badge></td>
                  <td style={{padding:"8px 12px",color:T.orange,fontWeight:300}}>{c.no_answer_count||0}</td>
                  <td style={{padding:"8px 12px",fontWeight:300,color:T.cyan}}>TM {c.agent_name||"-"}</td>
                  <td style={{padding:"8px 12px",fontWeight:300,color:T.textSoft}}>{c.memo||"-"}</td>
                </tr>;
              })}</tbody>
            </table>
          </GlossCard>

          <Modal open={uploadModal} onClose={()=>setUploadModal(false)} title="Excel Upload">
            <InputField label="DB 타이틀" value={uploadForm.title} onChange={v=>setUploadForm({...uploadForm,title:v})} placeholder="김사장 DB 4월"/>
            <InputField label="출처" value={uploadForm.source} onChange={v=>setUploadForm({...uploadForm,source:v})} placeholder="김사장"/>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:5,fontWeight:300}}>File</div>
              <input type="file" accept=".xlsx,.csv" onChange={e=>setUploadForm({...uploadForm,file:e.target.files[0]})} style={{color:T.textSoft,fontSize:12,fontFamily:f}}/>
            </div>
            <Toggle checked={uploadForm.isTest} onChange={v=>setUploadForm({...uploadForm,isTest:v})} label="Test mode"/>
            <Btn onClick={doUpload} style={{width:"100%",marginTop:14}} size="sm">Upload</Btn>
          </Modal>

          <Modal open={!!distModal} onClose={()=>setDistModal(null)} title={`분배 — ${distModal?.title||""}`}>
            <div style={{fontSize:11,color:T.textSoft,fontFamily:f,fontWeight:300,marginBottom:14}}>잔여 {distModal?.remaining||0}건</div>
            {Object.entries(distValues).map(([n,v],i)=><div key={n} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:11,color:AC[i%5],fontFamily:f,fontWeight:400,width:50}}>TM {n}</span>
              <input type="number" value={v} onChange={e=>setDistValues({...distValues,[n]:parseInt(e.target.value)||0})} style={{flex:1,padding:"7px 10px",background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,fontFamily:f,fontWeight:300,outline:"none"}}/>
            </div>)}
            <Btn onClick={doDist} style={{width:"100%",marginTop:10}} size="sm">분배 확정</Btn>
          </Modal>
        </>}

        {/* RECORDINGS */}
        {tab==="recordings"&&<GlossCard style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:f}}>
            <thead><tr>{["날짜","Agent","고객","길이"].map((h,i)=><th key={i} style={{padding:"10px 14px",color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,borderBottom:`1px solid ${T.border}`,fontWeight:300,textAlign:"left"}}>{h}</th>)}</tr></thead>
            <tbody>{recordings.length===0?<tr><td colSpan={4} style={{padding:20,textAlign:"center",color:T.textDim}}>녹음 없음</td></tr>:recordings.map(r=><tr key={r.id} style={{borderBottom:`1px solid rgba(255,255,255,.02)`}}>
              <td style={{padding:"10px 14px",fontWeight:300}}>{r.created_at}</td>
              <td style={{padding:"10px 14px",fontWeight:300,color:T.cyan}}>TM {r.agent_name}</td>
              <td style={{padding:"10px 14px",fontWeight:300}}>{r.customer_name}</td>
              <td style={{padding:"10px 14px",fontWeight:300}}>{Math.floor((r.duration||0)/60)}:{String((r.duration||0)%60).padStart(2,"0")}</td>
            </tr>)}</tbody>
          </table>
        </GlossCard>}

        {/* SETTINGS */}
        {tab==="settings"&&<div style={{maxWidth:460,display:"flex",flexDirection:"column",gap:12}}>
          <GlossCard style={{padding:20}}>
            <div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:14}}>전화번호 노출</div>
            <Toggle checked={!!center.show_phone} onChange={v=>doUpdateCenter("show_phone",v)} label={center.show_phone?"전체 표시":"마스킹"}/>
          </GlossCard>
          <GlossCard style={{padding:20}}>
            <div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:14}}>부재 · 결번 자동감지</div>
            <Toggle checked={!!center.auto_check_no_answer} onChange={v=>doUpdateCenter("auto_check_no_answer",v)} label="부재 3회 이상 자동 제외"/>
            <div style={{height:8}}/>
            <Toggle checked={!!center.auto_check_invalid} onChange={v=>doUpdateCenter("auto_check_invalid",v)} label="결번 자동 감지"/>
          </GlossCard>
          <GlossCard style={{padding:20}}>
            <div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:10}}>분배 방식</div>
            <div style={{display:"flex",gap:8}}>
              <Btn size="sm" variant={center.dist_mode==="auto"?"primary":"ghost"} onClick={()=>doUpdateCenter("dist_mode","auto")}>Auto</Btn>
              <Btn size="sm" variant={center.dist_mode==="manual"?"primary":"ghost"} onClick={()=>doUpdateCenter("dist_mode","manual")}>Manual</Btn>
            </div>
          </GlossCard>
          <GlossCard style={{padding:20}}>
            <div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:10}}>요금제</div>
            <Badge color={T.purple} glow>{center.plan||"basic"}</Badge>
          </GlossCard>
        </div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
// AGENT — Real API
// ═══════════════════════════════════════
const AgentPage=({user,onLogout})=>{
  const [state,setState]=useState("idle");
  const [customer,setCustomer]=useState(null);
  const [callId,setCallId]=useState(null);
  const [memo,setMemo]=useState("");
  const [callTime,setCallTime]=useState(0);
  const [stats,setStats]=useState({calls:0,connected:0,talkTime:0});
  const timerRef=useRef(null);

  const next=async()=>{
    const c=await API.callNext();
    if(c?.error){setState("idle");setCustomer(null);return alert(c.error);}
    setCustomer(c);setState("ready");setMemo("");setCallTime(0);
  };
  const doCall=async()=>{
    if(!customer)return;
    const res=await API.callStart(customer.id);
    if(res?.call_id){setCallId(res.call_id);setState("calling");timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);}
  };
  const endCall=async(result)=>{
    clearInterval(timerRef.current);
    if(callId)await API.callEnd(callId,{result,duration_sec:callTime,memo});
    setStats(s=>({calls:s.calls+1,connected:s.connected+(result==="connected"?1:0),talkTime:s.talkTime+callTime}));
    setState("ended");
  };
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const sc={idle:T.textDim,ready:T.purple,calling:T.orange,connected:T.cyan,failed:T.red,ended:T.textDim};
  const sl={idle:"Standby",ready:"Ready",calling:"Dialing...",connected:"On Call",failed:"Failed",ended:"Ended"};

  // Simulate connection after dialing
  useEffect(()=>{
    if(state==="calling"){
      const to=setTimeout(()=>{clearInterval(timerRef.current);setState("connected");timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);},2000+Math.random()*2000);
      return()=>clearTimeout(to);
    }
  },[state]);

  return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,position:"relative",overflow:"hidden"}}>
      <Glow color={T.cyan} size={300} top="5%" left="10%" opacity={.04}/><Glow color={T.purple} size={250} bottom="5%" right="5%" opacity={.03}/>
      <div style={{width:"100%",maxWidth:380,background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:22,overflow:"hidden",position:"relative",zIndex:1}}>
        <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:22}}/>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
          <div><div style={{fontSize:13,fontWeight:300,color:T.text}}>TM {user.agent_name} — {user.name}</div><div style={{fontSize:9,color:T.textDim,letterSpacing:1}}>{user.email}</div></div>
          <div style={{textAlign:"right",fontSize:10,fontFamily:f,fontWeight:300}}>
            <div style={{color:T.textDim}}>{stats.calls}콜 / {stats.connected}연결 / {fmtTime(stats.talkTime)}</div>
            <div style={{color:stats.calls>0?T.cyan:T.textDim,fontWeight:400}}>{stats.calls>0?((stats.connected/stats.calls)*100).toFixed(1):"0.0"}%</div>
          </div>
        </div>
        <div style={{padding:"28px 20px",textAlign:"center",position:"relative",zIndex:1}}>
          <div style={{width:120,height:120,borderRadius:"50%",margin:"0 auto 20px",border:`2px solid ${sc[state]}`,background:`${sc[state]}08`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:`0 0 40px ${sc[state]}12`,transition:"all .4s"}}>
            <div style={{fontSize:9,color:sc[state],fontWeight:300,textTransform:"uppercase",letterSpacing:2}}>{sl[state]}</div>
            {(state==="calling"||state==="connected")&&<div style={{fontSize:22,fontWeight:200,color:T.text,marginTop:4}}>{fmt(callTime)}</div>}
          </div>
          {customer&&<div style={{marginBottom:18}}><div style={{fontSize:16,fontWeight:300,color:T.text}}>{customer.name}</div><div style={{fontSize:11,color:T.textDim,marginTop:4,fontWeight:300,letterSpacing:1}}>{customer.phone_number}</div></div>}
          {state==="idle"&&<Btn onClick={next} style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>Next Customer</Btn>}
          {state==="ready"&&<Btn onClick={doCall} variant="success" style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>Call</Btn>}
          {state==="calling"&&<Btn variant="ghost" disabled style={{width:"100%",padding:"13px 0"}}>Dialing...</Btn>}
          {state==="connected"&&<div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>endCall("connected")} variant="success" style={{flex:1,padding:"13px 0"}}>연결 완료</Btn>
            <Btn onClick={()=>endCall("no_answer")} variant="ghost" style={{flex:1,padding:"13px 0"}}>부재</Btn>
            <Btn onClick={()=>endCall("invalid")} variant="danger" style={{flex:1,padding:"13px 0"}}>결번</Btn>
          </div>}
          {state==="ended"&&<Btn onClick={next} style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>Next</Btn>}
        </div>
        {customer&&<div style={{padding:"0 20px 18px",position:"relative",zIndex:1}}><textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Memo..." style={{width:"100%",height:55,padding:"9px 12px",background:"rgba(255,255,255,.02)",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:11,fontFamily:f,fontWeight:300,resize:"none",outline:"none",boxSizing:"border-box"}}/></div>}
        <div style={{padding:"10px 20px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"center",position:"relative",zIndex:1}}><Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn></div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
// APP — Auth Router
// ═══════════════════════════════════════
export default function App(){
  const [user,setUser]=useState(API.getUser());
  const handleLogin=(u)=>setUser(u);
  const handleLogout=async()=>{await API.logout();setUser(null);};

  if(!user)return<LoginPage onLogin={handleLogin}/>;
  if(user.role==="super_admin")return<SuperAdmin user={user} onLogout={handleLogout}/>;
  if(user.role==="center_admin")return<CenterAdmin user={user} onLogout={handleLogout}/>;
  if(user.role==="agent")return<AgentPage user={user} onLogout={handleLogout}/>;
  return<LoginPage onLogin={handleLogin}/>;
}
