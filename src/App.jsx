import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const T = {
  bg: "#000000",
  surface: "linear-gradient(145deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)",
  surfaceFlat: "#0a0a0a",
  card: "linear-gradient(165deg, #141414 0%, #0c0c0c 40%, #111111 100%)",
  cardFlat: "#0f0f0f",
  cardHover: "#161616",
  gloss: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 50%)",
  border: "rgba(255,255,255,0.06)",
  borderLight: "rgba(255,255,255,0.1)",
  borderGloss: "rgba(255,255,255,0.12)",
  cyan: "#00f0ff", cyanDim: "rgba(0,240,255,0.08)", cyanGlow: "rgba(0,240,255,0.25)",
  blue: "#4facfe", blueDim: "rgba(79,172,254,0.08)",
  purple: "#a855f7", purpleDim: "rgba(168,85,247,0.08)", purpleGlow: "rgba(168,85,247,0.2)",
  pink: "#f43f5e", pinkDim: "rgba(244,63,94,0.08)",
  orange: "#fb923c", orangeDim: "rgba(251,146,60,0.08)",
  yellow: "#fbbf24", yellowDim: "rgba(251,191,36,0.08)",
  red: "#ef4444", redDim: "rgba(239,68,68,0.08)",
  green: "#34d399", greenDim: "rgba(52,211,153,0.08)",
  text: "#f0f0f0", textSoft: "#888888", textDim: "#444444",
};

const f = "'Poppins', sans-serif";
const agentColors = [T.cyan, T.purple, T.pink, T.orange, T.blue];
const agentNames = ["Agent A", "Agent B", "Agent C", "Agent D", "Agent E"];

// Mock data
const genAgentData = () => [
  { id:1, sip:"2001", name:"Agent A", status:"calling", totalCalls:80, connected:30, noAnswer:18, invalid:5, pending:27, rate:37.5, todayTarget:100, color:T.cyan },
  { id:2, sip:"2002", name:"Agent B", status:"idle", totalCalls:22, connected:4, noAnswer:8, invalid:3, pending:7, rate:18.2, todayTarget:100, color:T.purple },
  { id:3, sip:"2003", name:"Agent C", status:"calling", totalCalls:95, connected:28, noAnswer:30, invalid:12, pending:25, rate:29.5, todayTarget:100, color:T.pink },
  { id:4, sip:"2004", name:"Agent D", status:"idle", totalCalls:15, connected:2, noAnswer:6, invalid:2, pending:5, rate:13.3, todayTarget:100, color:T.orange },
  { id:5, sip:"2005", name:"Agent E", status:"calling", totalCalls:68, connected:22, noAnswer:20, invalid:8, pending:18, rate:32.4, todayTarget:100, color:T.blue },
];

const AGENTS = genAgentData();
const HOURLY = Array.from({length:9},(_,i)=>({
  hour:`${9+i}시`,
  calls: [12,18,25,32,28,35,22,30,15][i],
  connected: [3,5,8,10,7,12,6,9,4][i],
  A: Math.floor(Math.random()*8)+2,
  B: Math.floor(Math.random()*5)+1,
  C: Math.floor(Math.random()*9)+3,
  D: Math.floor(Math.random()*3)+1,
  E: Math.floor(Math.random()*7)+2,
}));

const MOCK_CUSTOMERS = [
  { id:1, name:"홍길동", phone:"010-1234-5678", status:"done", assignedTo:"A", memo:"관심있음", autoStatus:"" },
  { id:2, name:"김철수", phone:"010-2345-6789", status:"no_answer", assignedTo:"A", memo:"", autoStatus:"부재 3회" },
  { id:3, name:"이영희", phone:"010-3456-7890", status:"pending", assignedTo:"B", memo:"", autoStatus:"" },
  { id:4, name:"박민수", phone:"010-0000-0000", status:"invalid", assignedTo:"C", memo:"", autoStatus:"결번 자동감지" },
  { id:5, name:"최지현", phone:"010-5678-9012", status:"done", assignedTo:"B", memo:"계약완료", autoStatus:"" },
  { id:6, name:"정수빈", phone:"010-6789-0123", status:"pending", assignedTo:"D", memo:"", autoStatus:"" },
  { id:7, name:"강하늘", phone:"010-7890-1234", status:"calling", assignedTo:"E", memo:"", autoStatus:"" },
  { id:8, name:"윤서연", phone:"010-1111-1111", status:"invalid", assignedTo:"C", memo:"", autoStatus:"결번 자동감지" },
  { id:9, name:"조현우", phone:"010-8901-2345", status:"no_answer", assignedTo:"A", memo:"", autoStatus:"부재 2회" },
  { id:10, name:"한소희", phone:"010-9012-3456", status:"pending", assignedTo:"E", memo:"", autoStatus:"" },
];

const MOCK_LISTS = [
  { id:1, name:"김사장 DB 4월", source:"김사장", isTest:false, count:500, connectRate:28.5, uploadedAt:"2026-04-15", distributed:true, dist:{A:100,B:100,C:100,D:100,E:100} },
  { id:2, name:"박사장 DB 테스트", source:"박사장", isTest:true, count:100, connectRate:8.2, uploadedAt:"2026-04-16", distributed:false, dist:{} },
  { id:3, name:"이사장 DB 3월", source:"이사장", isTest:false, count:300, connectRate:41.0, uploadedAt:"2026-03-20", distributed:true, dist:{A:60,B:60,C:60,D:60,E:60} },
];

const MOCK_RECORDINGS = [
  { id:1, customer:"홍길동", phone:"2001", agent:"A", duration:185, time:"14:32", date:"2026-04-17" },
  { id:2, customer:"최지현", phone:"2002", agent:"B", duration:92, time:"15:10", date:"2026-04-17" },
  { id:3, customer:"강하늘", phone:"2005", agent:"E", duration:45, time:"11:20", date:"2026-04-17" },
];

const maskPhone = ph => ph.replace(/(\d{3})-(\d{4})-(\d{4})/,"$1-****-$3");

// ─── Components ───
const Glow = ({color,size=200,top,left,right,bottom,opacity=.1}) => (
  <div style={{position:"absolute",width:size,height:size,borderRadius:"50%",background:color,filter:`blur(${size*.6}px)`,opacity,top,left,right,bottom,pointerEvents:"none"}} />
);

const GlossCard = ({children,style:sx,glow,glowColor}) => (
  <div style={{
    background:T.card,border:`1px solid ${T.border}`,borderRadius:16,
    position:"relative",overflow:"hidden",...sx,
  }}>
    <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:16}} />
    {glow && <Glow color={glowColor||T.cyan} size={80} top={-30} right={-30} opacity={.08} />}
    <div style={{position:"relative",zIndex:1}}>{children}</div>
  </div>
);

const StatCard = ({label,value,sub,color=T.cyan}) => (
  <GlossCard glow glowColor={color} style={{padding:"20px 22px",flex:1,minWidth:145}}>
    <div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,textTransform:"uppercase",letterSpacing:2.5,marginBottom:10}}>{label}</div>
    <div style={{fontSize:28,fontWeight:200,color:T.text,fontFamily:f,lineHeight:1}}>{value}</div>
    {sub && <div style={{fontSize:11,color:T.textSoft,marginTop:8,fontFamily:f,fontWeight:300}}>{sub}</div>}
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:`linear-gradient(90deg, transparent, ${color}60, transparent)`}} />
  </GlossCard>
);

const Badge = ({children,color=T.cyan,glow}) => (
  <span style={{
    display:"inline-block",padding:"3px 11px",borderRadius:20,
    background:`${color}12`,color,border:`1px solid ${color}20`,
    fontSize:10,fontFamily:f,fontWeight:400,letterSpacing:.5,
    boxShadow:glow?`0 0 12px ${color}20`:"none",
  }}>{children}</span>
);

const StatusDot = ({status,size=7}) => {
  const c = {calling:T.cyan,idle:T.textDim,busy:T.orange};
  return <span style={{width:size,height:size,borderRadius:"50%",background:c[status]||T.textDim,display:"inline-block",boxShadow:status==="calling"?`0 0 8px ${T.cyan}`:"none",animation:status==="calling"?"pulse 1.5s infinite":"none"}} />;
};

const Btn = ({children,onClick,variant="primary",size="md",style:sx,disabled}) => {
  const base = {border:"none",borderRadius:12,cursor:disabled?"not-allowed":"pointer",fontFamily:f,fontWeight:300,transition:"all .2s",letterSpacing:.3,opacity:disabled?.4:1,...(size==="sm"?{padding:"7px 16px",fontSize:11}:{padding:"12px 24px",fontSize:13})};
  const v = {
    primary:{background:"linear-gradient(135deg, #00f0ff, #a855f7)",color:"#000",fontWeight:400},
    danger:{background:"linear-gradient(135deg, #f43f5e, #fb923c)",color:"#fff"},
    ghost:{background:"transparent",color:T.textSoft,border:`1px solid ${T.border}`},
    success:{background:"linear-gradient(135deg, #34d399, #4facfe)",color:"#000",fontWeight:400},
  };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...sx}}>{children}</button>;
};

const Toggle = ({checked,onChange,label}) => (
  <label style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",fontSize:13,color:T.text,fontFamily:f,fontWeight:300}}>
    <div onClick={()=>onChange(!checked)} style={{width:44,height:24,borderRadius:12,padding:2,background:checked?"linear-gradient(135deg, #00f0ff, #a855f7)":`rgba(255,255,255,0.1)`,transition:"background .3s",cursor:"pointer"}}>
      <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",transform:checked?"translateX(20px)":"translateX(0)",transition:"transform .2s"}} />
    </div>
    {label}
  </label>
);

const Table = ({columns,data,compact}) => (
  <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:compact?12:13,fontFamily:f}}>
      <thead><tr>{columns.map((c,i)=>(
        <th key={i} style={{textAlign:c.align||"left",padding:compact?"8px 12px":"12px 16px",color:T.textDim,fontSize:10,textTransform:"uppercase",letterSpacing:2,borderBottom:`1px solid ${T.border}`,fontWeight:300}}>{c.title}</th>
      ))}</tr></thead>
      <tbody>{data.map((row,ri)=>(
        <tr key={ri} style={{borderBottom:`1px solid rgba(255,255,255,0.02)`,transition:"background .15s"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          {columns.map((c,ci)=>(
            <td key={ci} style={{padding:compact?"8px 12px":"12px 16px",color:T.text,textAlign:c.align||"left",fontWeight:300}}>{c.render?c.render(row):row[c.key]}</td>
          ))}
        </tr>
      ))}</tbody>
    </table>
  </div>
);

const SideNav = ({items,active,onSelect,title,subtitle}) => (
  <div style={{width:220,background:T.surface,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,height:"100%",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none"}} />
    <div style={{padding:"22px 20px 16px",borderBottom:`1px solid ${T.border}`,position:"relative",zIndex:1}}>
      <div style={{fontSize:15,fontWeight:300,color:T.text,fontFamily:f,letterSpacing:.5}}>{title}</div>
      {subtitle && <div style={{fontSize:9,color:T.textDim,fontFamily:f,marginTop:5,textTransform:"uppercase",letterSpacing:3,fontWeight:300}}>{subtitle}</div>}
    </div>
    <nav style={{padding:"10px 0",flex:1,position:"relative",zIndex:1}}>
      {items.map(item=>(
        <div key={item.key} onClick={()=>onSelect(item.key)} style={{
          padding:"10px 20px",cursor:"pointer",fontSize:12,fontFamily:f,fontWeight:active===item.key?400:300,
          color:active===item.key?T.cyan:T.textSoft,
          background:active===item.key?"rgba(0,240,255,0.04)":"transparent",
          borderLeft:active===item.key?`2px solid ${T.cyan}`:"2px solid transparent",
          transition:"all .2s",letterSpacing:.3,
        }}>{item.label}</div>
      ))}
    </nav>
  </div>
);

const Modal = ({open,onClose,title,children,width=520}) => {
  if(!open)return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:20,width,maxWidth:"92vw",maxHeight:"85vh",overflow:"auto",position:"relative"}}>
        <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:20}} />
        <div style={{padding:"16px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
          <span style={{fontSize:14,fontWeight:300,color:T.text,fontFamily:f}}>{title}</span>
          <span onClick={onClose} style={{cursor:"pointer",color:T.textDim,fontSize:18,fontWeight:200}}>×</span>
        </div>
        <div style={{padding:22,position:"relative",zIndex:1}}>{children}</div>
      </div>
    </div>
  );
};

const InputField = ({label,value,onChange,type="text",placeholder}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:6,fontWeight:300}}>{label}</div>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{
      width:"100%",padding:"10px 14px",background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,
      borderRadius:10,color:T.text,fontSize:13,fontFamily:f,fontWeight:300,outline:"none",boxSizing:"border-box",
    }} onFocus={e=>e.target.style.borderColor="rgba(0,240,255,0.3)"} onBlur={e=>e.target.style.borderColor=T.border} />
  </div>
);

const tipStyle = {background:"#111",border:`1px solid rgba(255,255,255,0.1)`,borderRadius:10,fontSize:11,fontFamily:f};

// ─── Agent Performance Ring ───
const AgentRing = ({agent,rank}) => {
  const pct = (agent.totalCalls / agent.todayTarget) * 100;
  const r = 38, circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(pct,100)) / 100;
  const isSlacking = agent.totalCalls < 30 && agent.status === "idle";
  return (
    <GlossCard glow glowColor={agent.color} style={{padding:"16px 14px",flex:1,minWidth:115,textAlign:"center",border:isSlacking?`1px solid ${T.red}30`:`1px solid ${T.border}`}}>
      {isSlacking && <div style={{position:"absolute",top:8,right:10,fontSize:9,color:T.red,fontFamily:f,fontWeight:400,letterSpacing:.5,animation:"pulse 1.5s infinite"}}>IDLE</div>}
      <div style={{position:"relative",width:84,height:84,margin:"0 auto 10px"}}>
        <svg width="84" height="84" viewBox="0 0 84 84">
          <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
          <circle cx="42" cy="42" r={r} fill="none" stroke={agent.color} strokeWidth="4"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 42 42)"
            style={{transition:"stroke-dashoffset .8s ease",filter:`drop-shadow(0 0 6px ${agent.color}40)`}} />
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontSize:18,fontWeight:200,color:T.text,fontFamily:f,lineHeight:1}}>{agent.totalCalls}</div>
          <div style={{fontSize:8,color:T.textDim,fontFamily:f,fontWeight:300,letterSpacing:1}}>/ {agent.todayTarget}</div>
        </div>
      </div>
      <div style={{fontSize:12,fontWeight:400,color:agent.color,fontFamily:f,marginBottom:2}}>{agent.name}</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:8}}>
        <StatusDot status={agent.status} size={6} />
        <span style={{fontSize:10,color:T.textSoft,fontFamily:f,fontWeight:300}}>{agent.sip}</span>
      </div>
      <div style={{fontSize:22,fontWeight:200,color:agent.rate>25?T.green:agent.rate>15?T.orange:T.red,fontFamily:f}}>{agent.rate}%</div>
      <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:8,fontSize:10,fontFamily:f,fontWeight:300}}>
        <span style={{color:T.green}}>{agent.connected}<span style={{color:T.textDim,marginLeft:2}}>연결</span></span>
        <span style={{color:T.textSoft}}>{agent.noAnswer}<span style={{color:T.textDim,marginLeft:2}}>부재</span></span>
        <span style={{color:T.red}}>{agent.invalid}<span style={{color:T.textDim,marginLeft:2}}>결번</span></span>
      </div>
      <div style={{height:3,background:"rgba(255,255,255,0.04)",borderRadius:2,marginTop:10}}>
        <div style={{height:3,borderRadius:2,width:`${Math.min(pct,100)}%`,background:`linear-gradient(90deg, ${agent.color}, ${agent.color}80)`,transition:"width .5s"}} />
      </div>
    </GlossCard>
  );
};

// ─── PAGES ───
const LoginPage = ({onLogin}) => {
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,position:"relative",overflow:"hidden"}}>
      <Glow color={T.cyan} size={400} top="5%" left="15%" opacity={.06} />
      <Glow color={T.purple} size={350} bottom="10%" right="10%" opacity={.05} />
      <div style={{width:400,background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:24,padding:40,position:"relative",zIndex:1,overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:24}} />
        <div style={{textAlign:"center",marginBottom:36,position:"relative",zIndex:1}}>
          <div style={{fontSize:9,fontFamily:f,fontWeight:300,color:T.cyan,textTransform:"uppercase",letterSpacing:8,marginBottom:10}}>Telemarketing</div>
          <div style={{fontSize:26,fontWeight:200,color:T.text,letterSpacing:3}}>TM Platform</div>
          <div style={{width:40,height:1,background:`linear-gradient(90deg, ${T.cyan}, ${T.purple})`,margin:"14px auto 0"}} />
        </div>
        <div style={{position:"relative",zIndex:1}}>
          <InputField label="Email" value={email} onChange={setEmail} placeholder="admin@tm.co.kr" />
          <InputField label="Password" value={pass} onChange={setPass} type="password" placeholder="••••••••" />
          <div style={{display:"flex",gap:8,marginTop:24}}>
            <Btn onClick={()=>onLogin("super")} style={{flex:1}}>Super Admin</Btn>
            <Btn onClick={()=>onLogin("center")} variant="ghost" style={{flex:1}}>센터장</Btn>
            <Btn onClick={()=>onLogin("agent")} variant="ghost" style={{flex:1}}>상담원</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

const CenterAdmin = ({onLogout}) => {
  const [tab,setTab]=useState("dashboard");
  const [showPhone,setShowPhone]=useState(false);
  const [distMode,setDistMode]=useState("auto");
  const [testRunning,setTestRunning]=useState(false);
  const [testProgress,setTestProgress]=useState(null);
  const [uploadModal,setUploadModal]=useState(false);
  const [distModal,setDistModal]=useState(null);
  const [distValues,setDistValues]=useState({A:0,B:0,C:0,D:0,E:0});

  const nav=[
    {key:"dashboard",label:"대시보드"},{key:"db",label:"DB 관리"},
    {key:"phones",label:"전화기 관리"},{key:"recordings",label:"녹음 관리"},
    {key:"settings",label:"설정"},
  ];

  const startTest=()=>{
    setTestRunning(true);
    const init={};agentNames.forEach((_,i)=>init[`tm${i+1}`]={tried:0,connected:0,noAnswer:0,invalid:0});
    setTestProgress(init);
    const iv=setInterval(()=>{
      setTestProgress(prev=>{
        if(!prev)return prev;
        const next={...prev};
        Object.keys(next).forEach(k=>{
          if(next[k].tried<20){
            const r=Math.random();
            next[k]={...next[k],tried:next[k].tried+1,
              connected:next[k].connected+(r>.65?1:0),
              noAnswer:next[k].noAnswer+(r>.35&&r<=.65?1:0),
              invalid:next[k].invalid+(r<=.1?1:0),
            };
          }
        });
        if(Object.values(next).every(v=>v.tried>=20))clearInterval(iv);
        return{...next};
      });
    },200);
  };

  const openDist=(list)=>{
    const each=Math.floor(list.count/5);
    setDistValues({A:each,B:each,C:each,D:each,E:each});
    setDistModal(list);
  };

  const autoStatusCounts = { noAnswer: MOCK_CUSTOMERS.filter(c=>c.status==="no_answer").length, invalid: MOCK_CUSTOMERS.filter(c=>c.status==="invalid").length };

  return (
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="서울 강남센터" subtitle="center admin" />
      <div style={{flex:1,overflow:"auto",padding:28,position:"relative"}}>

        {/* ═══ DASHBOARD ═══ */}
        {tab==="dashboard"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
            <div>
              <div style={{fontSize:20,fontWeight:200,fontFamily:f,letterSpacing:.5}}>실시간 대시보드</div>
              <div style={{fontSize:10,color:T.textDim,fontFamily:f,marginTop:4,fontWeight:300,letterSpacing:1}}>2026.04.17 — Live</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Badge color={T.green} glow>Auto-check ON</Badge>
              <Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn>
            </div>
          </div>

          {/* Stats row */}
          <div style={{display:"flex",gap:12,marginBottom:22,flexWrap:"wrap"}}>
            <StatCard label="Total Calls" value="280" sub="today" color={T.cyan} />
            <StatCard label="Connected" value="84" color={T.green} />
            <StatCard label="No Answer" value={String(autoStatusCounts.noAnswer)} sub="auto-detected" color={T.orange} />
            <StatCard label="Invalid #" value={String(autoStatusCounts.invalid)} sub="auto-detected" color={T.red} />
            <StatCard label="Connect Rate" value="30.0%" color={T.purple} />
          </div>

          {/* 5 Agent Performance Cards */}
          <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2.5,marginBottom:12,fontWeight:300}}>
            Agent Performance — Real-time
          </div>
          <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
            {AGENTS.sort((a,b)=>b.totalCalls-a.totalCalls).map((a,i)=><AgentRing key={a.id} agent={a} rank={i+1} />)}
          </div>

          {/* Charts Row */}
          <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
            {/* 시간별 콜 vs 연결 */}
            <GlossCard style={{flex:1,minWidth:300,padding:20}}>
              <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:16,fontWeight:300}}>시간별 콜 수 vs 연결</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={HOURLY}>
                  <defs>
                    <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.cyan} stopOpacity={.2}/><stop offset="100%" stopColor={T.cyan} stopOpacity={0}/></linearGradient>
                    <linearGradient id="gConn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={.2}/><stop offset="100%" stopColor={T.green} stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="hour" stroke={T.textDim} fontSize={10} fontFamily={f} />
                  <YAxis stroke={T.textDim} fontSize={10} />
                  <Tooltip contentStyle={tipStyle} />
                  <Area type="monotone" dataKey="calls" stroke={T.cyan} strokeWidth={2} fill="url(#gCalls)" name="콜 수" />
                  <Area type="monotone" dataKey="connected" stroke={T.green} strokeWidth={2} fill="url(#gConn)" name="연결" />
                </AreaChart>
              </ResponsiveContainer>
            </GlossCard>

            {/* Agent별 시간대 콜 */}
            <GlossCard style={{flex:1,minWidth:300,padding:20}}>
              <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:16,fontWeight:300}}>Agent별 시간대 콜</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={HOURLY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="hour" stroke={T.textDim} fontSize={10} fontFamily={f} />
                  <YAxis stroke={T.textDim} fontSize={10} />
                  <Tooltip contentStyle={tipStyle} />
                  {["A","B","C","D","E"].map((n,i)=><Bar key={n} dataKey={n} fill={agentColors[i]} radius={[3,3,0,0]} stackId="a" name={`Agent ${n}`} />)}
                </BarChart>
              </ResponsiveContainer>
            </GlossCard>
          </div>

          {/* Live scoreboard table */}
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,fontWeight:300}}>실시간 성과표</span>
            </div>
            <Table compact columns={[
              {title:"Rank",render:(_,i)=><span style={{fontFamily:f,fontWeight:400,color:T.textSoft}}>{AGENTS.sort((a,b)=>b.rate-a.rate).indexOf(_)+1}</span>},
              {title:"Agent",render:r=><span style={{color:r.color,fontWeight:400}}><StatusDot status={r.status} size={6} /> <span style={{marginLeft:6}}>{r.name}</span></span>},
              {title:"콜 수",key:"totalCalls",align:"center"},
              {title:"연결",render:r=><span style={{color:T.green}}>{r.connected}</span>,align:"center"},
              {title:"부재",render:r=><span style={{color:T.orange}}>{r.noAnswer}</span>,align:"center"},
              {title:"결번",render:r=><span style={{color:T.red}}>{r.invalid}</span>,align:"center"},
              {title:"대기",render:r=><span style={{color:T.textSoft}}>{r.pending}</span>,align:"center"},
              {title:"연결률",render:r=><span style={{color:r.rate>25?T.green:r.rate>15?T.orange:T.red,fontWeight:400}}>{r.rate}%</span>,align:"center"},
              {title:"진행률",render:r=>{
                const pct=Math.round((r.totalCalls/r.todayTarget)*100);
                return <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:4,background:"rgba(255,255,255,0.04)",borderRadius:2,minWidth:60}}>
                    <div style={{height:4,borderRadius:2,width:`${Math.min(pct,100)}%`,background:r.color,transition:"width .5s"}} />
                  </div>
                  <span style={{fontSize:10,color:T.textSoft,minWidth:30}}>{pct}%</span>
                </div>;
              }},
            ]} data={AGENTS} />
          </GlossCard>
        </>}

        {/* ═══ DB MANAGEMENT ═══ */}
        {tab==="db"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
            <div style={{fontSize:20,fontWeight:200,fontFamily:f}}>DB 관리</div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>setUploadModal(true)} size="sm">Upload Excel</Btn>
              {!testRunning?<Btn onClick={startTest} size="sm" variant="ghost">100건 테스트</Btn>:<Btn onClick={()=>{setTestRunning(false);setTestProgress(null)}} size="sm" variant="danger">STOP</Btn>}
            </div>
          </div>

          {/* Auto-check banner */}
          <GlossCard style={{padding:"14px 18px",marginBottom:18,border:`1px solid rgba(0,240,255,0.1)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,fontFamily:f,fontWeight:300,color:T.text}}>
                <span style={{color:T.cyan,fontWeight:400}}>Auto-Check</span> — 부재(3회 이상) · 결번 자동 감지 활성화됨
              </div>
              <div style={{display:"flex",gap:12,fontSize:11,fontFamily:f,fontWeight:300}}>
                <span style={{color:T.orange}}>부재 {autoStatusCounts.noAnswer}건</span>
                <span style={{color:T.red}}>결번 {autoStatusCounts.invalid}건</span>
              </div>
            </div>
          </GlossCard>

          {testRunning&&testProgress&&(
            <GlossCard style={{padding:22,marginBottom:20,border:`1px solid rgba(251,146,60,0.15)`}}>
              <div style={{fontSize:12,fontWeight:400,color:T.orange,fontFamily:f,marginBottom:14}}>Test in progress...</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {Object.entries(testProgress).map(([k,v],i)=>{
                  const rate=v.tried>0?((v.connected/v.tried)*100).toFixed(1):"0.0";
                  return (
                    <div key={k} style={{flex:1,minWidth:85,background:"rgba(255,255,255,0.02)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:10,fontFamily:f,color:agentColors[i],fontWeight:400}}>{agentNames[i]}</div>
                      <div style={{fontSize:18,fontWeight:200,fontFamily:f,color:T.text,marginTop:4}}>{v.tried}/20</div>
                      <div style={{fontSize:10,color:T.textSoft,fontFamily:f,fontWeight:300}}>{rate}%</div>
                      <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:4,fontSize:9,fontFamily:f}}>
                        <span style={{color:T.green}}>{v.connected}</span>
                        <span style={{color:T.orange}}>{v.noAnswer}</span>
                        <span style={{color:T.red}}>{v.invalid}</span>
                      </div>
                      <div style={{height:2,background:"rgba(255,255,255,0.04)",borderRadius:2,marginTop:6}}>
                        <div style={{height:2,background:agentColors[i],borderRadius:2,width:`${(v.tried/20)*100}%`,transition:"width .15s"}} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.values(testProgress).every(v=>v.tried>=20)&&(()=>{
                const t=Object.values(testProgress).reduce((a,v)=>a+v.connected,0);
                return <div style={{marginTop:14,padding:"10px 14px",background:"rgba(255,255,255,0.02)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:T.text,fontFamily:f,fontWeight:300}}>Result: {t}/100 ({((t/100)*100).toFixed(1)}%)</span>
                  <div style={{display:"flex",gap:6}}><Btn size="sm" variant="success">채택</Btn><Btn size="sm" variant="danger">폐기</Btn></div>
                </div>;
              })()}
            </GlossCard>
          )}

          <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2.5,marginBottom:10,fontWeight:300}}>리스트 관리 — 분배</div>
          <GlossCard style={{padding:0,overflow:"hidden",marginBottom:22}}>
            <Table columns={[
              {title:"리스트명",key:"name"},
              {title:"출처",render:r=><Badge color={T.purple}>{r.source}</Badge>},
              {title:"건수",key:"count",align:"center"},
              {title:"연결률",align:"center",render:r=><span style={{color:r.connectRate>25?T.green:r.connectRate>15?T.orange:T.red,fontWeight:400}}>{r.connectRate}%</span>},
              {title:"구분",render:r=><Badge color={r.isTest?T.orange:T.green}>{r.isTest?"Test":"Prod"}</Badge>},
              {title:"분배",render:r=>r.distributed?<Badge color={T.cyan}>분배완료</Badge>:<Btn size="sm" variant="ghost" onClick={()=>openDist(r)}>분배하기</Btn>},
            ]} data={MOCK_LISTS} />
          </GlossCard>

          <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2.5,marginBottom:10,fontWeight:300}}>고객 목록</div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <Table compact columns={[
              {title:"이름",key:"name"},
              {title:"전화번호",render:r=><span style={{fontFamily:f,fontSize:11,fontWeight:300}}>{showPhone?r.phone:maskPhone(r.phone)}</span>},
              {title:"상태",render:r=>{
                const c={pending:T.textDim,calling:T.orange,done:T.green,no_answer:T.orange,invalid:T.red,retry:T.yellow};
                const l={pending:"대기",calling:"통화중",done:"완료",no_answer:"부재",invalid:"결번",retry:"재시도"};
                return <Badge color={c[r.status]} glow={r.status==="invalid"||r.status==="no_answer"}>{l[r.status]}</Badge>;
              }},
              {title:"자동감지",render:r=>r.autoStatus?<span style={{fontSize:10,color:r.status==="invalid"?T.red:T.orange,fontFamily:f,fontWeight:300}}>{r.autoStatus}</span>:<span style={{color:T.textDim}}>—</span>},
              {title:"배정",render:r=><span style={{color:agentColors["ABCDE".indexOf(r.assignedTo)],fontWeight:400,fontSize:11}}>Agent {r.assignedTo}</span>},
              {title:"메모",render:r=><span style={{color:T.textSoft,fontWeight:300}}>{r.memo||"—"}</span>},
            ]} data={MOCK_CUSTOMERS} />
          </GlossCard>

          {/* Distribution Modal */}
          <Modal open={!!distModal} onClose={()=>setDistModal(null)} title={`DB 분배 — ${distModal?.name||""}`}>
            <div style={{fontSize:12,color:T.textSoft,fontFamily:f,fontWeight:300,marginBottom:18}}>총 {distModal?.count||0}건을 Agent에게 분배합니다</div>
            {["A","B","C","D","E"].map((n,i)=>(
              <div key={n} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <span style={{fontSize:12,color:agentColors[i],fontFamily:f,fontWeight:400,width:70}}>Agent {n}</span>
                <input type="number" value={distValues[n]} onChange={e=>setDistValues({...distValues,[n]:parseInt(e.target.value)||0})}
                  style={{flex:1,padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:f,fontWeight:300,outline:"none"}} />
                <span style={{fontSize:11,color:T.textDim,fontFamily:f}}>건</span>
              </div>
            ))}
            <div style={{fontSize:11,color:T.textSoft,fontFamily:f,fontWeight:300,marginTop:4}}>
              합계: {Object.values(distValues).reduce((a,b)=>a+b,0)} / {distModal?.count||0}
            </div>
            <div style={{display:"flex",gap:8,marginTop:18}}>
              <Btn onClick={()=>{const each=Math.floor((distModal?.count||0)/5);setDistValues({A:each,B:each,C:each,D:each,E:each})}} variant="ghost" size="sm">균등 분배</Btn>
              <Btn onClick={()=>setDistModal(null)} style={{flex:1}}>분배 확정</Btn>
            </div>
          </Modal>
          <Modal open={uploadModal} onClose={()=>setUploadModal(false)} title="Excel Upload">
            <InputField label="리스트명" value="" onChange={()=>{}} placeholder="김사장 DB 4월" />
            <InputField label="출처" value="" onChange={()=>{}} placeholder="김사장" />
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:6,fontWeight:300}}>File</div>
              <div style={{border:`1px dashed rgba(255,255,255,0.08)`,borderRadius:12,padding:"30px 20px",textAlign:"center",color:T.textDim,fontSize:12,fontFamily:f,fontWeight:300}}>Drop .xlsx / .csv</div>
            </div>
            <Toggle checked={false} onChange={()=>{}} label="Test mode" />
            <Btn onClick={()=>setUploadModal(false)} style={{width:"100%",marginTop:18}}>Upload</Btn>
          </Modal>
        </>}

        {/* ═══ PHONES ═══ */}
        {tab==="phones"&&<>
          <div style={{fontSize:20,fontWeight:200,fontFamily:f,marginBottom:22}}>전화기 관리</div>
          <div style={{display:"flex",gap:12,marginBottom:22,flexWrap:"wrap"}}>
            <StatCard label="Total" value="5" color={T.purple} />
            <StatCard label="Calling" value="3" color={T.cyan} />
            <StatCard label="Idle" value="2" sub="주의" color={T.red} />
          </div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <Table columns={[
              {title:"SIP",render:r=><span style={{color:T.cyan,fontWeight:400}}>{r.sip}</span>},
              {title:"상태",render:r=><StatusDot status={r.status} />},
              {title:"Agent",render:r=><span style={{color:r.color}}>{r.name}</span>},
              {title:"총 콜",key:"totalCalls",align:"center"},
              {title:"연결",render:r=><span style={{color:T.green}}>{r.connected}</span>,align:"center"},
              {title:"부재",render:r=><span style={{color:T.orange}}>{r.noAnswer}</span>,align:"center"},
              {title:"결번",render:r=><span style={{color:T.red}}>{r.invalid}</span>,align:"center"},
              {title:"연결률",align:"center",render:r=><span style={{color:r.rate>25?T.green:T.red,fontWeight:400}}>{r.rate}%</span>},
            ]} data={AGENTS} />
          </GlossCard>
        </>}

        {/* ═══ RECORDINGS ═══ */}
        {tab==="recordings"&&<>
          <div style={{fontSize:20,fontWeight:200,fontFamily:f,marginBottom:22}}>녹음 관리</div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <Table columns={[
              {title:"날짜",key:"date"},{title:"시간",key:"time"},
              {title:"고객",key:"customer"},
              {title:"Agent",render:r=><span style={{color:agentColors["ABCDE".indexOf(r.agent)],fontWeight:400}}>Agent {r.agent}</span>},
              {title:"길이",render:r=>{const m=Math.floor(r.duration/60),s=r.duration%60;return<span style={{fontFamily:f,fontWeight:300}}>{m}:{String(s).padStart(2,"0")}</span>}},
              {title:"",render:()=><Btn size="sm" variant="ghost">▶</Btn>},
            ]} data={MOCK_RECORDINGS} />
          </GlossCard>
        </>}

        {/* ═══ SETTINGS ═══ */}
        {tab==="settings"&&<>
          <div style={{fontSize:20,fontWeight:200,fontFamily:f,marginBottom:22}}>설정</div>
          <div style={{maxWidth:480,display:"flex",flexDirection:"column",gap:14}}>
            <GlossCard style={{padding:24}}>
              <div style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f,marginBottom:16}}>DB 분배 방식</div>
              <div style={{display:"flex",gap:8}}>
                <Btn size="sm" variant={distMode==="auto"?"primary":"ghost"} onClick={()=>setDistMode("auto")}>Auto</Btn>
                <Btn size="sm" variant={distMode==="manual"?"primary":"ghost"} onClick={()=>setDistMode("manual")}>Manual</Btn>
              </div>
            </GlossCard>
            <GlossCard style={{padding:24}}>
              <div style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f,marginBottom:16}}>전화번호 노출</div>
              <Toggle checked={showPhone} onChange={setShowPhone} label={showPhone?"전체 표시":"마스킹"} />
            </GlossCard>
            <GlossCard style={{padding:24}}>
              <div style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f,marginBottom:16}}>부재 · 결번 자동감지</div>
              <Toggle checked={true} onChange={()=>{}} label="부재 3회 이상 자동 제외" />
              <div style={{height:10}} />
              <Toggle checked={true} onChange={()=>{}} label="결번 자동 감지 및 제외" />
            </GlossCard>
            <GlossCard style={{padding:24}}>
              <div style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f,marginBottom:12}}>요금제</div>
              <Badge color={T.purple} glow>Premium</Badge>
              <div style={{fontSize:11,color:T.textSoft,marginTop:10,fontFamily:f,fontWeight:300}}>녹음 · 통계 · 자동감지 포함</div>
            </GlossCard>
          </div>
        </>}
      </div>
    </div>
  );
};

const AgentPage = ({onLogout}) => {
  const [state,setState]=useState("idle");
  const [customer,setCustomer]=useState(null);
  const [memo,setMemo]=useState("");
  const [callTime,setCallTime]=useState(0);
  const [stats,setStats]=useState({calls:0,connected:0});
  const timerRef=useRef(null);

  const nextCustomer=()=>{
    const pool=MOCK_CUSTOMERS.filter(c=>c.status==="pending");
    const c=pool[Math.floor(Math.random()*pool.length)]||MOCK_CUSTOMERS[0];
    setCustomer(c);setState("ready");setMemo("");setCallTime(0);
  };
  const startCall=()=>{
    setState("calling");timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);
    setTimeout(()=>{clearInterval(timerRef.current);const ok=Math.random()>.4;setState(ok?"connected":"failed");
      if(ok)timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);
      setStats(s=>({calls:s.calls+1,connected:s.connected+(ok?1:0)}));
    },2000+Math.random()*2000);
  };
  const endCall=()=>{clearInterval(timerRef.current);setState("ended");};
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const sc={idle:T.textDim,ready:T.purple,calling:T.orange,connected:T.cyan,failed:T.red,ended:T.textDim};
  const sl={idle:"Standby",ready:"Ready",calling:"Dialing...",connected:"On Call",failed:"Failed",ended:"Ended"};

  return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,position:"relative",overflow:"hidden"}}>
      <Glow color={T.cyan} size={350} top="5%" left="10%" opacity={.05} />
      <Glow color={T.purple} size={300} bottom="5%" right="5%" opacity={.04} />
      <div style={{width:"100%",maxWidth:400,background:T.surface,border:`1px solid ${T.borderLight}`,borderRadius:24,overflow:"hidden",position:"relative",zIndex:1}}>
        <div style={{position:"absolute",inset:0,background:T.gloss,pointerEvents:"none",borderRadius:24}} />
        <div style={{padding:"16px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
          <div><div style={{fontSize:14,fontWeight:300,color:T.text}}>Agent A — 2001</div><div style={{fontSize:9,color:T.textDim,letterSpacing:1}}>서울 강남센터</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:10,color:T.textDim,fontWeight:300}}>{stats.calls} / {stats.connected}</div>
            <div style={{fontSize:12,color:stats.calls>0?T.cyan:T.textDim,fontWeight:400}}>{stats.calls>0?((stats.connected/stats.calls)*100).toFixed(1):"0.0"}%</div></div>
        </div>
        <div style={{padding:"32px 22px",textAlign:"center",position:"relative",zIndex:1}}>
          <div style={{width:130,height:130,borderRadius:"50%",margin:"0 auto 22px",border:`2px solid ${sc[state]}`,background:`${sc[state]}08`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxShadow:`0 0 40px ${sc[state]}15`,transition:"all .4s"}}>
            <div style={{fontSize:10,color:sc[state],fontWeight:300,textTransform:"uppercase",letterSpacing:2}}>{sl[state]}</div>
            {(state==="calling"||state==="connected")&&<div style={{fontSize:24,fontWeight:200,color:T.text,marginTop:5}}>{fmt(callTime)}</div>}
          </div>
          {customer&&<div style={{marginBottom:22}}><div style={{fontSize:18,fontWeight:300,color:T.text}}>{customer.name}</div><div style={{fontSize:12,color:T.textDim,marginTop:5,fontWeight:300,letterSpacing:1}}>{maskPhone(customer.phone)}</div></div>}
          {state==="idle"&&<Btn onClick={nextCustomer} style={{width:"100%",padding:"14px 0",fontSize:14,fontWeight:300}}>Next Customer</Btn>}
          {state==="ready"&&<Btn onClick={startCall} variant="success" style={{width:"100%",padding:"14px 0",fontSize:14,fontWeight:300}}>Call</Btn>}
          {state==="calling"&&<Btn variant="ghost" disabled style={{width:"100%",padding:"14px 0"}}>Dialing...</Btn>}
          {state==="connected"&&<Btn onClick={endCall} variant="danger" style={{width:"100%",padding:"14px 0",fontSize:14,fontWeight:300}}>End Call</Btn>}
          {(state==="failed"||state==="ended")&&<Btn onClick={nextCustomer} style={{width:"100%",padding:"14px 0",fontSize:14,fontWeight:300}}>Next</Btn>}
        </div>
        {customer&&<div style={{padding:"0 22px 22px",position:"relative",zIndex:1}}>
          <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Memo..."
            style={{width:"100%",height:60,padding:"10px 14px",background:"rgba(255,255,255,0.02)",border:`1px solid ${T.border}`,borderRadius:12,color:T.text,fontSize:12,fontFamily:f,fontWeight:300,resize:"none",outline:"none",boxSizing:"border-box"}} />
        </div>}
        <div style={{padding:"12px 22px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"center",position:"relative",zIndex:1}}>
          <Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn>
        </div>
      </div>
    </div>
  );
};

const SuperAdmin = ({onLogout,onGoCenter}) => {
  const [tab,setTab]=useState("centers");const [modal,setModal]=useState(false);
  const nav=[{key:"centers",label:"센터 관리"},{key:"stats",label:"전체 통계"},{key:"billing",label:"수익 관리"}];
  return (
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="TM Platform" subtitle="super admin" />
      <div style={{flex:1,overflow:"auto",padding:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:20,fontWeight:200,fontFamily:f}}>{nav.find(n=>n.key===tab)?.label}</div>
          <div style={{display:"flex",gap:8}}>{tab==="centers"&&<Btn onClick={()=>setModal(true)} size="sm">+ 센터 생성</Btn>}<Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn></div>
        </div>
        {tab==="centers"&&<>
          <div style={{display:"flex",gap:12,marginBottom:22,flexWrap:"wrap"}}>
            <StatCard label="Centers" value="3" color={T.purple} /><StatCard label="Total Calls" value="2,130" color={T.cyan} /><StatCard label="Avg Rate" value="22.6%" color={T.green} />
          </div>
          <GlossCard style={{padding:0,overflow:"hidden"}}>
            <Table columns={[
              {title:"센터명",render:r=><span style={{color:T.cyan,fontWeight:400,cursor:"pointer"}} onClick={onGoCenter}>{r.name}</span>},
              {title:"센터장",key:"owner"},{title:"전화기",key:"phones",align:"center"},
              {title:"콜",align:"right",render:r=>r.totalCalls.toLocaleString()},
              {title:"연결률",align:"right",render:r=><span style={{color:r.rate>20?T.green:T.red,fontWeight:400}}>{r.rate}%</span>},
              {title:"요금제",render:r=><Badge color={r.plan==="premium"?T.purple:T.textDim}>{r.plan}</Badge>},
              {title:"상태",render:r=><Badge color={r.active?T.green:T.red}>{r.active?"ON":"OFF"}</Badge>},
            ]} data={MOCK_CENTERS} />
          </GlossCard>
        </>}
        {tab==="stats"&&<>
          <div style={{display:"flex",gap:12,marginBottom:22,flexWrap:"wrap"}}>
            <StatCard label="Today" value="2,130" color={T.cyan} /><StatCard label="Connected" value="490" color={T.green} /><StatCard label="Rate" value="23.0%" color={T.orange} />
          </div>
          <GlossCard style={{padding:20}}>
            <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:16,fontWeight:300}}>센터별 비교</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={MOCK_CENTERS.map(c=>({name:c.name.slice(0,4),rate:c.rate,calls:c.totalCalls}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" /><XAxis dataKey="name" stroke={T.textDim} fontSize={10} fontFamily={f} /><YAxis stroke={T.textDim} fontSize={10} />
                <Tooltip contentStyle={tipStyle} /><Bar dataKey="rate" fill={T.cyan} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlossCard>
        </>}
        {tab==="billing"&&<div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
          {MOCK_CENTERS.map(c=><GlossCard key={c.id} glow glowColor={c.plan==="premium"?T.purple:T.textDim} style={{flex:1,minWidth:200,padding:22}}>
            <div style={{fontSize:13,fontWeight:300,color:T.text,fontFamily:f,marginBottom:6}}>{c.name}</div>
            <Badge color={c.plan==="premium"?T.purple:T.textDim}>{c.plan}</Badge>
            <div style={{marginTop:18,fontSize:26,fontWeight:200,fontFamily:f,color:T.text}}>{c.plan==="premium"?"₩890,000":"₩490,000"}</div>
            <div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:4}}>/ month</div>
          </GlossCard>)}
        </div>}
        <Modal open={modal} onClose={()=>setModal(false)} title="새 센터 생성">
          <InputField label="센터명" value="" onChange={()=>{}} placeholder="서울 강남센터" />
          <InputField label="센터장 이메일" value="" onChange={()=>{}} placeholder="admin@center.kr" />
          <InputField label="전화기 수" value="5" onChange={()=>{}} type="number" />
          <Btn onClick={()=>setModal(false)} style={{width:"100%",marginTop:12}}>Create</Btn>
        </Modal>
      </div>
    </div>
  );
};

export default function App(){
  const [role,setRole]=useState(null);
  if(!role)return <LoginPage onLogin={setRole}/>;
  if(role==="super")return <SuperAdmin onLogout={()=>setRole(null)} onGoCenter={()=>setRole("center")}/>;
  if(role==="center")return <CenterAdmin onLogout={()=>setRole(null)}/>;
  if(role==="agent")return <AgentPage onLogout={()=>setRole(null)}/>;
}
