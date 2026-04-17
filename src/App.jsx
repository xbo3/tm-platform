import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const T = {
  bg:"#000",surface:"linear-gradient(145deg,#0a0a0a,#111,#0a0a0a)",surfaceFlat:"#0a0a0a",
  card:"linear-gradient(165deg,#141414,#0c0c0c,#111)",cardFlat:"#0f0f0f",
  gloss:"linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 50%)",
  border:"rgba(255,255,255,.06)",borderLight:"rgba(255,255,255,.1)",
  cyan:"#00f0ff",purple:"#a855f7",pink:"#f43f5e",orange:"#fb923c",blue:"#4facfe",
  green:"#34d399",red:"#ef4444",yellow:"#fbbf24",
  text:"#f0f0f0",textSoft:"#888",textDim:"#444",
};
const f="'Poppins',sans-serif";
const AC=[T.cyan,T.purple,T.pink,T.orange,T.blue];
const AN=["A","B","C","D","E"];

const AGENTS=[
  {id:1,sip:"2001",name:"A",status:"calling",calls:80,connected:30,noAnswer1:8,noAnswer2:5,noAnswer3:5,invalid:5,pending:27,talkTime:4520,color:T.cyan},
  {id:2,sip:"2002",name:"B",status:"idle",calls:22,connected:4,noAnswer1:5,noAnswer2:2,noAnswer3:1,invalid:3,pending:7,talkTime:680,color:T.purple},
  {id:3,sip:"2003",name:"C",status:"calling",calls:95,connected:28,noAnswer1:12,noAnswer2:10,noAnswer3:8,invalid:12,pending:25,talkTime:5100,color:T.pink},
  {id:4,sip:"2004",name:"D",status:"idle",calls:15,connected:2,noAnswer1:4,noAnswer2:1,noAnswer3:1,invalid:2,pending:5,talkTime:210,color:T.orange},
  {id:5,sip:"2005",name:"E",status:"calling",calls:68,connected:22,noAnswer1:10,noAnswer2:6,noAnswer3:4,invalid:8,pending:18,talkTime:3800,color:T.blue},
];

const DB_LISTS=[
  {id:1,title:"김사장 DB 4월",source:"김사장",total:500,distributed:{A:100,B:100,C:100,D:100,E:100},used:{A:80,B:22,C:95,D:15,E:68},connected:{A:30,B:4,C:28,D:2,E:22},noAnswer:{A:18,B:8,C:30,D:6,E:20},invalid:{A:5,B:3,C:12,D:2,E:8},connectRate:0,invalidRate:0,uploadedAt:"2026-04-15"},
  {id:2,title:"박사장 DB 테스트",source:"박사장",total:100,distributed:{A:20,B:20,C:20,D:20,E:20},used:{A:20,B:18,C:20,D:15,E:19},connected:{A:2,B:1,C:3,D:0,E:2},noAnswer:{A:10,B:12,C:11,D:10,E:12},invalid:{A:5,B:4,C:4,D:3,E:4},connectRate:0,invalidRate:0,uploadedAt:"2026-04-16"},
  {id:3,title:"이사장 DB 3월",source:"이사장",total:300,distributed:{A:60,B:60,C:60,D:60,E:60},used:{A:55,B:40,C:58,D:30,E:50},connected:{A:22,B:15,C:25,D:12,E:20},noAnswer:{A:15,B:12,C:16,D:8,E:14},invalid:{A:2,B:1,C:3,D:1,E:2},connectRate:0,invalidRate:0,uploadedAt:"2026-03-20"},
];
DB_LISTS.forEach(d=>{
  const totalUsed=Object.values(d.used).reduce((a,b)=>a+b,0);
  const totalConn=Object.values(d.connected).reduce((a,b)=>a+b,0);
  const totalInv=Object.values(d.invalid).reduce((a,b)=>a+b,0);
  d.connectRate=totalUsed>0?((totalConn/totalUsed)*100).toFixed(1):0;
  d.invalidRate=totalUsed>0?((totalInv/totalUsed)*100).toFixed(1):0;
  d.totalUsed=totalUsed;d.totalConnected=totalConn;d.totalInvalid=totalInv;
  d.totalNoAnswer=Object.values(d.noAnswer).reduce((a,b)=>a+b,0);
  d.remaining=d.total-totalUsed;
});

const HOURLY=Array.from({length:9},(_,i)=>({hour:`${9+i}시`,A:[5,8,10,12,10,14,8,11,2][i],B:[2,3,2,4,2,3,2,3,1][i],C:[6,9,11,14,12,15,9,12,7][i],D:[1,2,2,3,1,2,1,2,1][i],E:[4,6,8,10,7,11,6,9,7][i]}));

const MOCK_RECORDINGS=[
  {id:1,customer:"홍길동",phone:"2001",agent:"A",duration:185,time:"14:32",date:"2026-04-17"},
  {id:2,customer:"최지현",phone:"2002",agent:"B",duration:92,time:"15:10",date:"2026-04-17"},
  {id:3,customer:"강하늘",phone:"2005",agent:"E",duration:45,time:"11:20",date:"2026-04-17"},
];

const MOCK_CENTERS=[
  {id:1,name:"서울 강남센터",owner:"김센터장",phones:5,plan:"premium",active:true,totalCalls:1240,connected:312,rate:25.2},
  {id:2,name:"부산 해운대센터",owner:"박센터장",phones:5,plan:"basic",active:true,totalCalls:890,connected:178,rate:20.0},
  {id:3,name:"대구 동성로센터",owner:"이센터장",phones:3,plan:"basic",active:false,totalCalls:0,connected:0,rate:0},
];

const maskPhone=ph=>ph.replace(/(\d{3})-(\d{4})-(\d{4})/,"$1-****-$3");
const fmtTime=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`};

// ── Components ──
const Glow=({color,size=200,top,left,right,bottom,opacity=.08})=>(<div style={{position:"absolute",width:size,height:size,borderRadius:"50%",background:color,filter:`blur(${size*.6}px)`,opacity,top,left,right,bottom,pointerEvents:"none"}}/>);

const GlossCard=({children,style:sx,glow,glowColor})=>(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,position:"relative",overflow:"hidden",...sx}}><div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:14}}/>{glow&&<Glow color={glowColor||T.cyan} size={80} top={-30} right={-30} opacity={.06}/>}<div style={{position:"relative",zIndex:1}}>{children}</div></div>);

const Badge=({children,color=T.cyan,glow,pulse})=>(<span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,background:`${color}12`,color,border:`1px solid ${color}20`,fontSize:10,fontFamily:f,fontWeight:400,letterSpacing:.5,boxShadow:glow?`0 0 10px ${color}18`:"none",animation:pulse?"pulse 1.5s infinite":"none"}}>{children}</span>);

const StatusDot=({status,size=7})=>{const c={calling:T.cyan,idle:T.textDim,busy:T.orange};return<span style={{width:size,height:size,borderRadius:"50%",background:c[status]||T.textDim,display:"inline-block",boxShadow:status==="calling"?`0 0 8px ${T.cyan}`:"none",animation:status==="calling"?"pulse 1.5s infinite":"none"}}/>};

const Btn=({children,onClick,variant="primary",size="md",style:sx,disabled})=>{const base={border:"none",borderRadius:10,cursor:disabled?"not-allowed":"pointer",fontFamily:f,fontWeight:300,transition:"all .2s",letterSpacing:.3,opacity:disabled?.4:1,...(size==="sm"?{padding:"6px 14px",fontSize:11}:size==="xs"?{padding:"4px 10px",fontSize:10}:{padding:"11px 22px",fontSize:13})};const v={primary:{background:"linear-gradient(135deg,#00f0ff,#a855f7)",color:"#000",fontWeight:400},danger:{background:"linear-gradient(135deg,#f43f5e,#fb923c)",color:"#fff"},ghost:{background:"transparent",color:T.textSoft,border:`1px solid ${T.border}`},success:{background:"linear-gradient(135deg,#34d399,#4facfe)",color:"#000",fontWeight:400}};return<button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...sx}}>{children}</button>};

const Toggle=({checked,onChange,label})=>(<label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:12,color:T.text,fontFamily:f,fontWeight:300}}><div onClick={()=>onChange(!checked)} style={{width:40,height:22,borderRadius:11,padding:2,background:checked?"linear-gradient(135deg,#00f0ff,#a855f7)":"rgba(255,255,255,.08)",transition:"background .3s",cursor:"pointer"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",transform:checked?"translateX(18px)":"translateX(0)",transition:"transform .2s"}}/></div>{label}</label>);

const SideNav=({items,active,onSelect,title,subtitle})=>(<div style={{width:210,background:T.surface,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,height:"100%",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none"}}/><div style={{padding:"20px 18px 14px",borderBottom:`1px solid ${T.border}`,position:"relative",zIndex:1}}><div style={{fontSize:14,fontWeight:300,color:T.text,fontFamily:f,letterSpacing:.5}}>{title}</div>{subtitle&&<div style={{fontSize:9,color:T.textDim,fontFamily:f,marginTop:4,textTransform:"uppercase",letterSpacing:3,fontWeight:300}}>{subtitle}</div>}</div><nav style={{padding:"8px 0",flex:1,position:"relative",zIndex:1}}>{items.map(item=>(<div key={item.key} onClick={()=>onSelect(item.key)} style={{padding:"9px 18px",cursor:"pointer",fontSize:12,fontFamily:f,fontWeight:active===item.key?400:300,color:active===item.key?T.cyan:T.textSoft,background:active===item.key?"rgba(0,240,255,.04)":"transparent",borderLeft:active===item.key?`2px solid ${T.cyan}`:"2px solid transparent",transition:"all .2s"}}>{item.label}</div>))}</nav></div>);

const Modal=({open,onClose,title,children,width=520})=>{if(!open)return null;return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:18,width,maxWidth:"92vw",maxHeight:"85vh",overflow:"auto",position:"relative"}}><div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:18}}/><div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}><span style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f}}>{title}</span><span onClick={onClose} style={{cursor:"pointer",color:T.textDim,fontSize:18,fontWeight:200}}>×</span></div><div style={{padding:20,position:"relative",zIndex:1}}>{children}</div></div></div>)};

const InputField=({label,value,onChange,type="text",placeholder})=>(<div style={{marginBottom:12}}><div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:5,fontWeight:300}}>{label}</div><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"9px 12px",background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,fontFamily:f,fontWeight:300,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="rgba(0,240,255,.3)"} onBlur={e=>e.target.style.borderColor=T.border}/></div>);

const tipStyle={background:"#111",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontSize:10,fontFamily:f};
const lbl={fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2.5,fontWeight:300};

// ── MiniBar ──
const MiniBar=({value,max,color,h=5})=>(<div style={{height:h,background:"rgba(255,255,255,.04)",borderRadius:h/2,overflow:"hidden"}}><div style={{height:h,borderRadius:h/2,width:`${Math.min((value/max)*100,100)}%`,background:color,transition:"width .5s"}}/></div>);

// ══════════════════════════════════════════
// CENTER ADMIN
// ══════════════════════════════════════════
const CenterAdmin=({onLogout})=>{
  const [tab,setTab]=useState("dashboard");
  const [showPhone,setShowPhone]=useState(false);
  const [distModal,setDistModal]=useState(null);
  const [distValues,setDistValues]=useState({A:0,B:0,C:0,D:0,E:0});
  const [dbDetail,setDbDetail]=useState(null);
  const [testRunning,setTestRunning]=useState(false);
  const [testProgress,setTestProgress]=useState(null);
  const [uploadModal,setUploadModal]=useState(false);

  const nav=[{key:"dashboard",label:"대시보드"},{key:"db",label:"DB 관리"},{key:"recordings",label:"녹음"},{key:"settings",label:"설정"}];

  const totalCalls=AGENTS.reduce((a,b)=>a+b.calls,0);
  const totalConn=AGENTS.reduce((a,b)=>a+b.connected,0);
  const totalTalk=AGENTS.reduce((a,b)=>a+b.talkTime,0);
  const totalNA=AGENTS.reduce((a,b)=>a+b.noAnswer1+b.noAnswer2+b.noAnswer3,0);
  const totalInv=AGENTS.reduce((a,b)=>a+b.invalid,0);

  const startTest=()=>{
    setTestRunning(true);
    const init={};AN.forEach(n=>init[n]={tried:0,connected:0,noAnswer:0,invalid:0});
    setTestProgress(init);
    const iv=setInterval(()=>{setTestProgress(prev=>{if(!prev)return prev;const next={...prev};Object.keys(next).forEach(k=>{if(next[k].tried<20){const r=Math.random();next[k]={...next[k],tried:next[k].tried+1,connected:next[k].connected+(r>.65?1:0),noAnswer:next[k].noAnswer+(r>.35&&r<=.65?1:0),invalid:next[k].invalid+(r<=.08?1:0)};}});if(Object.values(next).every(v=>v.tried>=20))clearInterval(iv);return{...next};});},200);
  };

  const openDist=list=>{const rem=list.remaining;const each=Math.floor(rem/5);setDistValues({A:each,B:each,C:each,D:each,E:each});setDistModal(list);};

  return (
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="서울 강남센터" subtitle="center admin" />
      <div style={{flex:1,overflow:"auto",padding:24,position:"relative"}}>

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div><div style={{fontSize:18,fontWeight:200,fontFamily:f}}>실시간 대시보드</div><div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:3}}>2026.04.17 — Live</div></div>
            <div style={{display:"flex",gap:6}}><Badge color={T.green} glow>Auto-Check ON</Badge><Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn></div>
          </div>

          {/* ── 5 Agent Strip ── */}
          <div style={{...lbl,marginBottom:10}}>Agent 실시간 현황</div>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {AGENTS.sort((a,b)=>b.calls-a.calls).map((a,i)=>{
              const isIdle=a.status==="idle";
              const rate=a.calls>0?((a.connected/a.calls)*100).toFixed(1):0;
              const noAnswerTotal=a.noAnswer1+a.noAnswer2+a.noAnswer3;
              return(
                <GlossCard key={a.id} glow glowColor={a.color} style={{flex:1,minWidth:118,padding:"14px 12px",border:isIdle?`1px solid ${T.red}30`:`1px solid ${T.border}`}}>
                  {/* Header */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <StatusDot status={a.status} size={8}/>
                      <span style={{fontSize:14,fontWeight:400,color:a.color,fontFamily:f}}>TM {a.name}</span>
                    </div>
                    {isIdle&&<Badge color={T.red} pulse>IDLE</Badge>}
                    {!isIdle&&<Badge color={T.cyan}>WORK</Badge>}
                  </div>

                  {/* Big Rate */}
                  <div style={{textAlign:"center",margin:"6px 0 10px"}}>
                    <div style={{fontSize:28,fontWeight:200,color:parseFloat(rate)>25?T.green:parseFloat(rate)>15?T.orange:T.red,fontFamily:f,lineHeight:1}}>{rate}%</div>
                    <div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:3,letterSpacing:1}}>연결률</div>
                  </div>

                  {/* Stats Grid */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 10px",fontSize:11,fontFamily:f,fontWeight:300}}>
                    <div style={{color:T.textSoft}}>총콜 <span style={{float:"right",color:T.text,fontWeight:400}}>{a.calls}</span></div>
                    <div style={{color:T.textSoft}}>연결 <span style={{float:"right",color:T.green,fontWeight:400}}>{a.connected}</span></div>
                    <div style={{color:T.textSoft}}>부재 <span style={{float:"right",color:T.orange,fontWeight:400}}>{noAnswerTotal}</span></div>
                    <div style={{color:T.textSoft}}>결번 <span style={{float:"right",color:T.red,fontWeight:400}}>{a.invalid}</span></div>
                    <div style={{color:T.textSoft}}>대기 <span style={{float:"right",color:T.text}}>{a.pending}</span></div>
                    <div style={{color:T.textSoft}}>통화 <span style={{float:"right",color:T.cyan,fontWeight:400}}>{fmtTime(a.talkTime)}</span></div>
                  </div>

                  {/* No-answer breakdown */}
                  <div style={{marginTop:8,padding:"6px 0",borderTop:`1px solid ${T.border}`}}>
                    <div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,letterSpacing:1,marginBottom:4}}>부재 상세</div>
                    <div style={{display:"flex",gap:4,fontSize:10,fontFamily:f,fontWeight:300}}>
                      <span style={{flex:1,textAlign:"center",color:T.yellow,background:"rgba(251,191,36,.06)",borderRadius:4,padding:"2px 0"}}>1회 {a.noAnswer1}</span>
                      <span style={{flex:1,textAlign:"center",color:T.orange,background:"rgba(251,146,60,.06)",borderRadius:4,padding:"2px 0"}}>2회 {a.noAnswer2}</span>
                      <span style={{flex:1,textAlign:"center",color:T.red,background:"rgba(239,68,68,.06)",borderRadius:4,padding:"2px 0"}}>3회 {a.noAnswer3}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{marginTop:8}}>
                    <MiniBar value={a.calls} max={100} color={a.color} h={4}/>
                    <div style={{fontSize:9,color:T.textDim,textAlign:"right",fontFamily:f,fontWeight:300,marginTop:2}}>{a.calls}/100 목표</div>
                  </div>
                </GlossCard>
              );
            })}
          </div>

          {/* ── Summary Stats ── */}
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {[
              {l:"총 콜",v:totalCalls,c:T.cyan},{l:"연결",v:totalConn,c:T.green},{l:"연결률",v:`${(totalConn/totalCalls*100).toFixed(1)}%`,c:T.purple},
              {l:"총 통화시간",v:fmtTime(totalTalk),c:T.blue},{l:"부재",v:totalNA,c:T.orange},{l:"결번",v:totalInv,c:T.red},
            ].map((s,i)=>(
              <GlossCard key={i} glow glowColor={s.c} style={{flex:1,minWidth:100,padding:"14px 16px"}}>
                <div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>{s.l}</div>
                <div style={{fontSize:22,fontWeight:200,color:T.text,fontFamily:f}}>{s.v}</div>
              </GlossCard>
            ))}
          </div>

          {/* ── DB Quality on Dashboard ── */}
          <div style={{...lbl,marginBottom:10}}>DB 퀄리티 현황</div>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {DB_LISTS.map(d=>{
              const quality=parseFloat(d.connectRate)>25?"good":parseFloat(d.connectRate)>15?"mid":"bad";
              const qColor={good:T.green,mid:T.orange,bad:T.red}[quality];
              return(
                <GlossCard key={d.id} glow glowColor={qColor} style={{flex:1,minWidth:180,padding:"14px 16px",cursor:"pointer"}} onClick={()=>setDbDetail(d)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:12,fontWeight:400,color:T.text,fontFamily:f}}>{d.title}</span>
                    <Badge color={qColor}>{d.connectRate}%</Badge>
                  </div>
                  <div style={{display:"flex",gap:12,fontSize:10,fontFamily:f,fontWeight:300,marginBottom:8}}>
                    <span style={{color:T.textSoft}}>총 {d.total}</span>
                    <span style={{color:T.green}}>연결 {d.totalConnected}</span>
                    <span style={{color:T.red}}>결번 {d.totalInvalid}</span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <MiniBar value={d.totalUsed} max={d.total} color={qColor} h={4}/>
                    </div>
                    <span style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300}}>{d.totalUsed}/{d.total} 사용</span>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:6,fontSize:9,fontFamily:f,fontWeight:300}}>
                    <span style={{color:T.green}}>연결률 {d.connectRate}%</span>
                    <span style={{color:T.red}}>결번률 {d.invalidRate}%</span>
                    <span style={{color:d.remaining>50?T.textSoft:T.red}}>잔여 {d.remaining}건</span>
                  </div>
                </GlossCard>
              );
            })}
          </div>

          {/* ── Charts ── */}
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <GlossCard style={{flex:1,minWidth:280,padding:16}}>
              <div style={{...lbl,marginBottom:14}}>시간별 콜 수 (Agent별)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={HOURLY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)"/>
                  <XAxis dataKey="hour" stroke={T.textDim} fontSize={10} fontFamily={f}/>
                  <YAxis stroke={T.textDim} fontSize={10}/>
                  <Tooltip contentStyle={tipStyle}/>
                  {AN.map((n,i)=><Bar key={n} dataKey={n} fill={AC[i]} radius={[2,2,0,0]} stackId="a" name={`TM ${n}`}/>)}
                </BarChart>
              </ResponsiveContainer>
            </GlossCard>
            <GlossCard style={{flex:1,minWidth:280,padding:16}}>
              <div style={{...lbl,marginBottom:14}}>Agent별 연결률 비교</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={AGENTS.map(a=>({name:`TM ${a.name}`,rate:a.calls>0?parseFloat(((a.connected/a.calls)*100).toFixed(1)):0,calls:a.calls}))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)"/>
                  <XAxis type="number" stroke={T.textDim} fontSize={10}/>
                  <YAxis type="category" dataKey="name" stroke={T.textDim} fontSize={10} width={45} fontFamily={f}/>
                  <Tooltip contentStyle={tipStyle}/>
                  <Bar dataKey="rate" radius={[0,4,4,0]}>{AGENTS.map((a,i)=><Cell key={i} fill={a.color}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlossCard>
          </div>

          {/* DB Detail Modal */}
          <Modal open={!!dbDetail} onClose={()=>setDbDetail(null)} title={`DB 상세 — ${dbDetail?.title||""}`} width={600}>
            {dbDetail&&<>
              <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                {[{l:"연결률",v:`${dbDetail.connectRate}%`,c:T.green},{l:"결번률",v:`${dbDetail.invalidRate}%`,c:T.red},{l:"잔여",v:`${dbDetail.remaining}건`,c:dbDetail.remaining>50?T.cyan:T.red},{l:"총사용",v:`${dbDetail.totalUsed}/${dbDetail.total}`,c:T.purple}].map((s,i)=>(
                  <div key={i} style={{flex:1,minWidth:80,background:"rgba(255,255,255,.02)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,letterSpacing:1,marginBottom:4}}>{s.l}</div>
                    <div style={{fontSize:18,fontWeight:200,color:s.c,fontFamily:f}}>{s.v}</div>
                  </div>
                ))}
              </div>
              <div style={{...lbl,marginBottom:8}}>Agent별 사용 현황</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:f}}>
                  <thead><tr>{["Agent","배정","사용","잔여","연결","부재","결번","연결률"].map((h,i)=><th key={i} style={{padding:"8px 10px",color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,borderBottom:`1px solid ${T.border}`,fontWeight:300,textAlign:i>0?"center":"left"}}>{h}</th>)}</tr></thead>
                  <tbody>{AN.map((n,i)=>{
                    const dist=dbDetail.distributed[n]||0,used=dbDetail.used[n]||0,conn=dbDetail.connected[n]||0,na=dbDetail.noAnswer[n]||0,inv=dbDetail.invalid[n]||0;
                    const rem=dist-used;const r=used>0?((conn/used)*100).toFixed(1):0;
                    return<tr key={n} style={{borderBottom:`1px solid rgba(255,255,255,.02)`}}>
                      <td style={{padding:"8px 10px",color:AC[i],fontWeight:400}}>TM {n}</td>
                      <td style={{textAlign:"center",color:T.textSoft,fontWeight:300}}>{dist}</td>
                      <td style={{textAlign:"center",color:T.text,fontWeight:300}}>{used}</td>
                      <td style={{textAlign:"center",color:rem<10?T.red:T.textSoft,fontWeight:rem<10?400:300}}>{rem}</td>
                      <td style={{textAlign:"center",color:T.green,fontWeight:400}}>{conn}</td>
                      <td style={{textAlign:"center",color:T.orange}}>{na}</td>
                      <td style={{textAlign:"center",color:T.red}}>{inv}</td>
                      <td style={{textAlign:"center",color:parseFloat(r)>25?T.green:T.red,fontWeight:400}}>{r}%</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              {dbDetail.remaining>0&&<div style={{marginTop:14,display:"flex",gap:8}}>
                <Btn size="sm" variant="ghost" onClick={()=>{setDbDetail(null);openDist(dbDetail)}}>추가 분배</Btn>
              </div>}
            </>}
          </Modal>
        </>}

        {/* ══ DB MANAGEMENT ══ */}
        {tab==="db"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <div style={{fontSize:18,fontWeight:200,fontFamily:f}}>DB 관리</div>
            <div style={{display:"flex",gap:6}}>
              <Btn onClick={()=>setUploadModal(true)} size="sm">Upload</Btn>
              {!testRunning?<Btn onClick={startTest} size="sm" variant="ghost">100건 테스트</Btn>:<Btn onClick={()=>{setTestRunning(false);setTestProgress(null)}} size="sm" variant="danger">STOP</Btn>}
            </div>
          </div>

          {testRunning&&testProgress&&(
            <GlossCard style={{padding:18,marginBottom:16,border:`1px solid rgba(251,146,60,.12)`}}>
              <div style={{fontSize:11,fontWeight:400,color:T.orange,fontFamily:f,marginBottom:12}}>Test running...</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {Object.entries(testProgress).map(([k,v],i)=>{
                  const r=v.tried>0?((v.connected/v.tried)*100).toFixed(1):"0";
                  return<div key={k} style={{flex:1,minWidth:80,background:"rgba(255,255,255,.02)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:AC[i],fontWeight:400,fontFamily:f}}>TM {AN[i]}</div>
                    <div style={{fontSize:16,fontWeight:200,color:T.text,fontFamily:f,marginTop:3}}>{v.tried}/20</div>
                    <div style={{fontSize:9,color:T.textSoft,fontFamily:f}}>{r}% | <span style={{color:T.red}}>{v.invalid}결번</span></div>
                    <MiniBar value={v.tried} max={20} color={AC[i]} h={3}/>
                  </div>;
                })}
              </div>
              {Object.values(testProgress).every(v=>v.tried>=20)&&(()=>{
                const tc=Object.values(testProgress).reduce((a,v)=>a+v.connected,0);
                const ti=Object.values(testProgress).reduce((a,v)=>a+v.invalid,0);
                return<div style={{marginTop:12,padding:"10px 12px",background:"rgba(255,255,255,.02)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:T.text,fontFamily:f,fontWeight:300}}>연결 {tc}/100 ({((tc/100)*100).toFixed(1)}%) · 결번 {ti}건 ({ti}%)</span>
                  <div style={{display:"flex",gap:6}}><Btn size="xs" variant="success">채택</Btn><Btn size="xs" variant="danger">폐기</Btn></div>
                </div>;
              })()}
            </GlossCard>
          )}

          {/* DB List with quality */}
          <div style={{...lbl,marginBottom:8}}>DB 리스트 — 성과 · 퀄리티</div>
          {DB_LISTS.map(d=>{
            const quality=parseFloat(d.connectRate)>25?"good":parseFloat(d.connectRate)>15?"mid":"bad";
            const qColor={good:T.green,mid:T.orange,bad:T.red}[quality];
            return(
              <GlossCard key={d.id} style={{marginBottom:10,padding:0,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:13,fontWeight:400,color:T.text,fontFamily:f}}>{d.title}</span>
                    <Badge color={T.purple}>{d.source}</Badge>
                    <span style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300}}>{d.uploadedAt}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Badge color={qColor} glow>연결 {d.connectRate}%</Badge>
                    <Badge color={T.red}>결번 {d.invalidRate}%</Badge>
                    {d.remaining>0?<Btn size="xs" variant="ghost" onClick={()=>openDist(d)}>분배</Btn>:<Badge color={T.textDim}>완료</Badge>}
                  </div>
                </div>
                {/* Agent breakdown */}
                <div style={{padding:"10px 16px",display:"flex",gap:6,flexWrap:"wrap"}}>
                  {AN.map((n,i)=>{
                    const dist=d.distributed[n]||0,used=d.used[n]||0,rem=dist-used;
                    return<div key={n} style={{flex:1,minWidth:80,background:"rgba(255,255,255,.02)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:10,color:AC[i],fontWeight:400,fontFamily:f}}>TM {n}</div>
                      <div style={{fontSize:10,fontFamily:f,fontWeight:300,color:T.textSoft,marginTop:2}}>{used}/{dist} <span style={{color:rem<5?T.red:T.textDim}}>잔여{rem}</span></div>
                      <MiniBar value={used} max={dist||1} color={AC[i]} h={3}/>
                    </div>;
                  })}
                </div>
              </GlossCard>
            );
          })}

          <Modal open={!!distModal} onClose={()=>setDistModal(null)} title={`분배 — ${distModal?.title||""}`}>
            {distModal&&<>
              <div style={{fontSize:11,color:T.textSoft,fontFamily:f,fontWeight:300,marginBottom:14}}>잔여 {distModal.remaining}건 분배</div>
              {AN.map((n,i)=><div key={n} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:11,color:AC[i],fontFamily:f,fontWeight:400,width:50}}>TM {n}</span>
                <input type="number" value={distValues[n]} onChange={e=>setDistValues({...distValues,[n]:parseInt(e.target.value)||0})} style={{flex:1,padding:"7px 10px",background:"rgba(255,255,255,.03)",border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,fontFamily:f,fontWeight:300,outline:"none"}}/>
                <span style={{fontSize:10,color:T.textDim,fontFamily:f}}>건</span>
              </div>)}
              <div style={{fontSize:10,color:T.textSoft,fontFamily:f,fontWeight:300,marginTop:4}}>합계: {Object.values(distValues).reduce((a,b)=>a+b,0)} / {distModal.remaining}</div>
              <div style={{display:"flex",gap:6,marginTop:14}}>
                <Btn size="sm" variant="ghost" onClick={()=>{const e=Math.floor(distModal.remaining/5);setDistValues({A:e,B:e,C:e,D:e,E:e})}}>균등</Btn>
                <Btn onClick={()=>setDistModal(null)} style={{flex:1}} size="sm">분배 확정</Btn>
              </div>
            </>}
          </Modal>
          <Modal open={uploadModal} onClose={()=>setUploadModal(false)} title="Excel Upload">
            <InputField label="DB 타이틀" value="" onChange={()=>{}} placeholder="김사장 DB 4월"/>
            <InputField label="출처" value="" onChange={()=>{}} placeholder="김사장"/>
            <div style={{marginBottom:12}}><div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:5,fontWeight:300}}>File</div><div style={{border:`1px dashed rgba(255,255,255,.08)`,borderRadius:10,padding:"28px 16px",textAlign:"center",color:T.textDim,fontSize:11,fontFamily:f,fontWeight:300}}>Drop .xlsx / .csv</div></div>
            <Toggle checked={false} onChange={()=>{}} label="Test mode"/>
            <Btn onClick={()=>setUploadModal(false)} style={{width:"100%",marginTop:14}} size="sm">Upload</Btn>
          </Modal>
        </>}

        {/* ══ RECORDINGS ══ */}
        {tab==="recordings"&&<>
          <div style={{fontSize:18,fontWeight:200,fontFamily:f,marginBottom:18}}>녹음 관리</div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:f}}>
              <thead><tr>{["날짜","시간","고객","Agent","길이",""].map((h,i)=><th key={i} style={{padding:"10px 14px",color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:2,borderBottom:`1px solid ${T.border}`,fontWeight:300,textAlign:"left"}}>{h}</th>)}</tr></thead>
              <tbody>{MOCK_RECORDINGS.map(r=><tr key={r.id} style={{borderBottom:`1px solid rgba(255,255,255,.02)`}}>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.date}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.time}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.customer}</td>
                <td style={{padding:"10px 14px",color:AC[AN.indexOf(r.agent)],fontWeight:400}}>TM {r.agent}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{Math.floor(r.duration/60)}:{String(r.duration%60).padStart(2,"0")}</td>
                <td style={{padding:"10px 14px"}}><Btn size="xs" variant="ghost">▶</Btn></td>
              </tr>)}</tbody>
            </table>
          </GlossCard>
        </>}

        {/* ══ SETTINGS ══ */}
        {tab==="settings"&&<>
          <div style={{fontSize:18,fontWeight:200,fontFamily:f,marginBottom:18}}>설정</div>
          <div style={{maxWidth:460,display:"flex",flexDirection:"column",gap:12}}>
            <GlossCard style={{padding:20}}><div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:14}}>전화번호 노출</div><Toggle checked={showPhone} onChange={setShowPhone} label={showPhone?"전체 표시":"마스킹"}/></GlossCard>
            <GlossCard style={{padding:20}}><div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:14}}>부재 · 결번 자동감지</div><Toggle checked={true} onChange={()=>{}} label="부재 3회 이상 자동 제외"/><div style={{height:8}}/><Toggle checked={true} onChange={()=>{}} label="결번 자동 감지"/></GlossCard>
            <GlossCard style={{padding:20}}><div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:10}}>요금제</div><Badge color={T.purple} glow>Premium</Badge></GlossCard>
          </div>
        </>}
      </div>
    </div>
  );
};

// ── AGENT PAGE ──
const AgentPage=({onLogout})=>{
  const [state,setState]=useState("idle");const [customer,setCustomer]=useState(null);const [memo,setMemo]=useState("");const [callTime,setCallTime]=useState(0);const [stats,setStats]=useState({calls:0,connected:0,talkTime:0});const timerRef=useRef(null);
  const cust=[{name:"홍길동",phone:"010-1234-5678"},{name:"이영희",phone:"010-3456-7890"},{name:"정수빈",phone:"010-6789-0123"},{name:"한소희",phone:"010-9012-3456"}];
  const next=()=>{const c=cust[Math.floor(Math.random()*cust.length)];setCustomer(c);setState("ready");setMemo("");setCallTime(0);};
  const call=()=>{setState("calling");timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);setTimeout(()=>{clearInterval(timerRef.current);const ok=Math.random()>.4;setState(ok?"connected":"failed");if(ok)timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);setStats(s=>({calls:s.calls+1,connected:s.connected+(ok?1:0),talkTime:s.talkTime}));},2000+Math.random()*2000);};
  const end=()=>{clearInterval(timerRef.current);setState("ended");setStats(s=>({...s,talkTime:s.talkTime+callTime}));};
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const sc={idle:T.textDim,ready:T.purple,calling:T.orange,connected:T.cyan,failed:T.red,ended:T.textDim};
  const sl={idle:"Standby",ready:"Ready",calling:"Dialing...",connected:"On Call",failed:"Failed",ended:"Ended"};
  return(
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,position:"relative",overflow:"hidden"}}>
      <Glow color={T.cyan} size={300} top="5%" left="10%" opacity={.04}/><Glow color={T.purple} size={250} bottom="5%" right="5%" opacity={.03}/>
      <div style={{width:"100%",maxWidth:380,background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:22,overflow:"hidden",position:"relative",zIndex:1}}>
        <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:22}}/>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
          <div><div style={{fontSize:13,fontWeight:300,color:T.text}}>TM A — 2001</div><div style={{fontSize:9,color:T.textDim,letterSpacing:1}}>서울 강남센터</div></div>
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
          {customer&&<div style={{marginBottom:18}}><div style={{fontSize:16,fontWeight:300,color:T.text}}>{customer.name}</div><div style={{fontSize:11,color:T.textDim,marginTop:4,fontWeight:300,letterSpacing:1}}>{maskPhone(customer.phone)}</div></div>}
          {state==="idle"&&<Btn onClick={next} style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>Next Customer</Btn>}
          {state==="ready"&&<Btn onClick={call} variant="success" style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>Call</Btn>}
          {state==="calling"&&<Btn variant="ghost" disabled style={{width:"100%",padding:"13px 0"}}>Dialing...</Btn>}
          {state==="connected"&&<Btn onClick={end} variant="danger" style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>End Call</Btn>}
          {(state==="failed"||state==="ended")&&<Btn onClick={next} style={{width:"100%",padding:"13px 0",fontSize:13,fontWeight:300}}>Next</Btn>}
        </div>
        {customer&&<div style={{padding:"0 20px 18px",position:"relative",zIndex:1}}><textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Memo..." style={{width:"100%",height:55,padding:"9px 12px",background:"rgba(255,255,255,.02)",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:11,fontFamily:f,fontWeight:300,resize:"none",outline:"none",boxSizing:"border-box"}}/></div>}
        <div style={{padding:"10px 20px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"center",position:"relative",zIndex:1}}><Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn></div>
      </div>
    </div>
  );
};

// ── SUPER ADMIN ──
const SuperAdmin=({onLogout,onGoCenter})=>{
  const [tab,setTab]=useState("centers");const [modal,setModal]=useState(false);
  const nav=[{key:"centers",label:"센터 관리"},{key:"stats",label:"전체 통계"},{key:"billing",label:"수익"}];
  return(
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="TM Platform" subtitle="super admin"/>
      <div style={{flex:1,overflow:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:18,fontWeight:200,fontFamily:f}}>{nav.find(n=>n.key===tab)?.label}</div>
          <div style={{display:"flex",gap:6}}>{tab==="centers"&&<Btn onClick={()=>setModal(true)} size="sm">+ 센터</Btn>}<Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn></div>
        </div>
        {tab==="centers"&&<>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            {[{l:"Centers",v:"3",c:T.purple},{l:"Total Calls",v:"2,130",c:T.cyan},{l:"Avg Rate",v:"22.6%",c:T.green}].map((s,i)=>(<GlossCard key={i} glow glowColor={s.c} style={{flex:1,minWidth:120,padding:"14px 16px"}}><div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>{s.l}</div><div style={{fontSize:22,fontWeight:200,color:T.text,fontFamily:f}}>{s.v}</div></GlossCard>))}
          </div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:f}}>
              <thead><tr>{["센터명","센터장","전화기","콜","연결률","요금제","상태"].map((h,i)=><th key={i} style={{padding:"10px 14px",color:T.textDim,fontSize:9,textTransform:"uppercase",letterSpacing:1.5,borderBottom:`1px solid ${T.border}`,fontWeight:300,textAlign:i>2?"center":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{MOCK_CENTERS.map(r=><tr key={r.id} style={{borderBottom:`1px solid rgba(255,255,255,.02)`}}>
                <td style={{padding:"10px 14px",color:T.cyan,fontWeight:400,cursor:"pointer"}} onClick={onGoCenter}>{r.name}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.owner}</td>
                <td style={{padding:"10px 14px",fontWeight:300}}>{r.phones}</td>
                <td style={{padding:"10px 14px",textAlign:"center",fontWeight:300}}>{r.totalCalls.toLocaleString()}</td>
                <td style={{padding:"10px 14px",textAlign:"center",color:r.rate>20?T.green:T.red,fontWeight:400}}>{r.rate}%</td>
                <td style={{padding:"10px 14px",textAlign:"center"}}><Badge color={r.plan==="premium"?T.purple:T.textDim}>{r.plan}</Badge></td>
                <td style={{padding:"10px 14px",textAlign:"center"}}><Badge color={r.active?T.green:T.red}>{r.active?"ON":"OFF"}</Badge></td>
              </tr>)}</tbody>
            </table>
          </GlossCard>
        </>}
        {tab==="stats"&&<GlossCard style={{padding:18}}>
          <div style={{...lbl,marginBottom:14}}>센터별 비교</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MOCK_CENTERS.map(c=>({name:c.name.slice(0,4),rate:c.rate}))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)"/><XAxis dataKey="name" stroke={T.textDim} fontSize={10} fontFamily={f}/><YAxis stroke={T.textDim} fontSize={10}/>
              <Tooltip contentStyle={tipStyle}/><Bar dataKey="rate" fill={T.cyan} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </GlossCard>}
        {tab==="billing"&&<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{MOCK_CENTERS.map(c=><GlossCard key={c.id} glow glowColor={c.plan==="premium"?T.purple:T.textDim} style={{flex:1,minWidth:180,padding:18}}>
          <div style={{fontSize:12,fontWeight:300,color:T.text,fontFamily:f,marginBottom:4}}>{c.name}</div>
          <Badge color={c.plan==="premium"?T.purple:T.textDim}>{c.plan}</Badge>
          <div style={{marginTop:14,fontSize:24,fontWeight:200,fontFamily:f,color:T.text}}>{c.plan==="premium"?"₩890,000":"₩490,000"}</div>
          <div style={{fontSize:9,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:3}}>/ month</div>
        </GlossCard>)}</div>}
        <Modal open={modal} onClose={()=>setModal(false)} title="새 센터">
          <InputField label="센터명" value="" onChange={()=>{}} placeholder="서울 강남센터"/>
          <InputField label="이메일" value="" onChange={()=>{}} placeholder="admin@center.kr"/>
          <InputField label="전화기 수" value="5" onChange={()=>{}} type="number"/>
          <Btn onClick={()=>setModal(false)} style={{width:"100%",marginTop:10}} size="sm">Create</Btn>
        </Modal>
      </div>
    </div>
  );
};

export default function App(){
  const [role,setRole]=useState(null);
  if(!role)return<LoginPage onLogin={setRole}/>;
  if(role==="super")return<SuperAdmin onLogout={()=>setRole(null)} onGoCenter={()=>setRole("center")}/>;
  if(role==="center")return<CenterAdmin onLogout={()=>setRole(null)}/>;
  if(role==="agent")return<AgentPage onLogout={()=>setRole(null)}/>;
}
