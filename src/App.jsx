import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar } from "recharts";

const T = {
  bg: "#05080f", surface: "#0c1220", card: "#111a2e", cardHover: "#152035",
  border: "#1a2744", borderLight: "#243356",
  cyan: "#06d6a0", cyanDim: "#06d6a020", cyanGlow: "#06d6a040",
  blue: "#4cc9f0", blueDim: "#4cc9f015",
  purple: "#7b61ff", purpleDim: "#7b61ff18", purpleGlow: "#7b61ff30",
  pink: "#f72585", pinkDim: "#f7258518",
  orange: "#fb8500", orangeDim: "#fb850018",
  yellow: "#ffbe0b", yellowDim: "#ffbe0b15",
  red: "#ff4d6d", redDim: "#ff4d6d15",
  green: "#06d6a0", greenDim: "#06d6a015",
  text: "#edf2f4", textSoft: "#8b9cc0", textDim: "#4a5f8a",
  gradient1: "linear-gradient(135deg, #7b61ff, #4cc9f0)",
  gradient2: "linear-gradient(135deg, #f72585, #fb8500)",
  gradient3: "linear-gradient(135deg, #06d6a0, #4cc9f0)",
};

const f = "'Poppins', sans-serif";

const MOCK_CENTERS = [
  { id:1, name:"서울 강남센터", owner:"김센터장", phones:5, plan:"premium", active:true, totalCalls:1240, connected:312, rate:25.2 },
  { id:2, name:"부산 해운대센터", owner:"박센터장", phones:5, plan:"basic", active:true, totalCalls:890, connected:178, rate:20.0 },
  { id:3, name:"대구 동성로센터", owner:"이센터장", phones:3, plan:"basic", active:false, totalCalls:0, connected:0, rate:0 },
];
const MOCK_PHONES = [
  { id:1, sip:"2001", status:"calling", agent:"상담원A", calls:80, connected:30, rate:37.5 },
  { id:2, sip:"2002", status:"idle", agent:"상담원B", calls:60, connected:10, rate:16.7 },
  { id:3, sip:"2003", status:"busy", agent:"상담원C", calls:100, connected:20, rate:20.0 },
  { id:4, sip:"2004", status:"idle", agent:"상담원D", calls:45, connected:15, rate:33.3 },
  { id:5, sip:"2005", status:"calling", agent:"상담원E", calls:35, connected:3, rate:8.6 },
];
const MOCK_CUSTOMERS = [
  { id:1, name:"홍길동", phone:"010-1234-5678", status:"done", assignedTo:"2001", memo:"관심있음" },
  { id:2, name:"김철수", phone:"010-2345-6789", status:"retry", assignedTo:"2001", memo:"부재중" },
  { id:3, name:"이영희", phone:"010-3456-7890", status:"pending", assignedTo:"2002", memo:"" },
  { id:4, name:"박민수", phone:"010-4567-8901", status:"calling", assignedTo:"2003", memo:"" },
  { id:5, name:"최지현", phone:"010-5678-9012", status:"done", assignedTo:"2002", memo:"계약완료" },
  { id:6, name:"정수빈", phone:"010-6789-0123", status:"pending", assignedTo:"2004", memo:"" },
  { id:7, name:"강하늘", phone:"010-7890-1234", status:"done", assignedTo:"2005", memo:"거절" },
  { id:8, name:"윤서연", phone:"010-8901-2345", status:"pending", assignedTo:"2003", memo:"" },
];
const MOCK_LISTS = [
  { id:1, name:"김사장 DB 4월", source:"김사장", isTest:false, count:500, connectRate:28.5, uploadedAt:"2026-04-15" },
  { id:2, name:"박사장 DB 테스트", source:"박사장", isTest:true, count:100, connectRate:8.2, uploadedAt:"2026-04-16" },
  { id:3, name:"이사장 DB 3월", source:"이사장", isTest:false, count:300, connectRate:41.0, uploadedAt:"2026-03-20" },
];
const MOCK_RECORDINGS = [
  { id:1, customer:"홍길동", phone:"2001", duration:185, time:"14:32", date:"2026-04-17" },
  { id:2, customer:"최지현", phone:"2002", duration:92, time:"15:10", date:"2026-04-17" },
  { id:3, customer:"강하늘", phone:"2005", duration:45, time:"11:20", date:"2026-04-17" },
  { id:4, customer:"김민호", phone:"2001", duration:210, time:"09:45", date:"2026-04-16" },
];
const HOURLY = Array.from({length:9},(_,i)=>({ hour:`${9+i}시`, calls:Math.floor(Math.random()*40)+10, connected:Math.floor(Math.random()*15)+2 }));
const PHONE_CHART = MOCK_PHONES.map(p=>({ name:p.sip, calls:p.calls, connected:p.connected }));
const maskPhone = ph => ph.replace(/(\d{3})-(\d{4})-(\d{4})/,"$1-****-$3");

// ─── Shared Components ───
const Glow = ({color,size=200,top,left,right,bottom}) => (
  <div style={{position:"absolute",width:size,height:size,borderRadius:"50%",background:color,filter:`blur(${size/2}px)`,opacity:.12,top,left,right,bottom,pointerEvents:"none"}} />
);

const StatCard = ({label,value,sub,color=T.cyan,icon}) => (
  <div style={{
    background:T.card, border:`1px solid ${T.border}`, borderRadius:16,
    padding:"22px 24px", flex:1, minWidth:150, position:"relative", overflow:"hidden",
    backdropFilter:"blur(10px)",
  }}>
    <Glow color={color} size={100} top={-40} right={-40} />
    <div style={{fontSize:11,color:T.textDim,fontFamily:f,fontWeight:300,textTransform:"uppercase",letterSpacing:2,marginBottom:10}}>{label}</div>
    <div style={{fontSize:30,fontWeight:200,color:T.text,fontFamily:f,lineHeight:1}}>{value}</div>
    {sub && <div style={{fontSize:12,color:T.textSoft,marginTop:8,fontFamily:f,fontWeight:300}}>{sub}</div>}
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg, transparent, ${color}, transparent)`}} />
  </div>
);

const Badge = ({children,color=T.cyan}) => (
  <span style={{
    display:"inline-block",padding:"4px 12px",borderRadius:20,
    background:`${color}18`,color,border:`1px solid ${color}30`,
    fontSize:11,fontFamily:f,fontWeight:400,letterSpacing:.5,
  }}>{children}</span>
);

const StatusDot = ({status}) => {
  const c = {calling:T.cyan,idle:T.textDim,busy:T.orange};
  const l = {calling:"통화중",idle:"대기",busy:"연결중"};
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:11}}>
      <span style={{
        width:7,height:7,borderRadius:"50%",background:c[status],
        boxShadow:status==="calling"?`0 0 10px ${T.cyan}`:status==="busy"?`0 0 10px ${T.orange}`:"none",
        animation:status==="calling"?"pulse 2s infinite":"none",
      }} />
      <span style={{color:c[status],fontFamily:f,fontWeight:300,fontSize:11,letterSpacing:.5}}>{l[status]}</span>
    </span>
  );
};

const Btn = ({children,onClick,variant="primary",size="md",style:sx,disabled}) => {
  const base = {
    border:"none",borderRadius:12,cursor:disabled?"not-allowed":"pointer",
    fontFamily:f,fontWeight:400,transition:"all .2s",letterSpacing:.3,
    opacity:disabled?.5:1,
    ...(size==="sm"?{padding:"8px 18px",fontSize:12}:{padding:"12px 24px",fontSize:13}),
  };
  const v = {
    primary:{background:T.gradient1,color:"#fff",boxShadow:`0 4px 20px ${T.purpleGlow}`},
    danger:{background:T.gradient2,color:"#fff",boxShadow:`0 4px 20px ${T.pinkDim}`},
    ghost:{background:"transparent",color:T.textSoft,border:`1px solid ${T.border}`},
    success:{background:T.gradient3,color:"#fff",boxShadow:`0 4px 20px ${T.cyanGlow}`},
  };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...sx}}>{children}</button>;
};

const Toggle = ({checked,onChange,label}) => (
  <label style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",fontSize:13,color:T.text,fontFamily:f,fontWeight:300}}>
    <div onClick={()=>onChange(!checked)} style={{
      width:44,height:24,borderRadius:12,padding:2,
      background:checked?T.gradient1:T.border,transition:"background .3s",cursor:"pointer",
      boxShadow:checked?`0 0 15px ${T.purpleGlow}`:"none",
    }}>
      <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",
        transform:checked?"translateX(20px)":"translateX(0)",transition:"transform .2s",
      }} />
    </div>
    {label}
  </label>
);

const Table = ({columns,data,onRow}) => (
  <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:f}}>
      <thead><tr>{columns.map((c,i)=>(
        <th key={i} style={{
          textAlign:c.align||"left",padding:"12px 16px",color:T.textDim,fontSize:10,
          textTransform:"uppercase",letterSpacing:2,borderBottom:`1px solid ${T.border}`,fontWeight:400,
        }}>{c.title}</th>
      ))}</tr></thead>
      <tbody>{data.map((row,ri)=>(
        <tr key={ri} onClick={()=>onRow?.(row)} style={{
          cursor:onRow?"pointer":"default",borderBottom:`1px solid ${T.border}08`,transition:"background .15s",
        }}
          onMouseEnter={e=>e.currentTarget.style.background=T.cardHover}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}
        >{columns.map((c,ci)=>(
          <td key={ci} style={{padding:"14px 16px",color:T.text,textAlign:c.align||"left",fontWeight:300}}>
            {c.render?c.render(row):row[c.key]}
          </td>
        ))}</tr>
      ))}</tbody>
    </table>
  </div>
);

const SideNav = ({items,active,onSelect,title,subtitle}) => (
  <div style={{
    width:230,background:T.surface,borderRight:`1px solid ${T.border}`,
    display:"flex",flexDirection:"column",flexShrink:0,height:"100%",position:"relative",overflow:"hidden",
  }}>
    <Glow color={T.purple} size={180} top={-60} left={-60} />
    <div style={{padding:"24px 22px 18px",borderBottom:`1px solid ${T.border}`,position:"relative",zIndex:1}}>
      <div style={{fontSize:16,fontWeight:300,color:T.text,fontFamily:f,letterSpacing:1}}>{title}</div>
      {subtitle && <div style={{fontSize:10,color:T.textDim,fontFamily:f,marginTop:5,textTransform:"uppercase",letterSpacing:3,fontWeight:300}}>{subtitle}</div>}
    </div>
    <nav style={{padding:"12px 0",flex:1,position:"relative",zIndex:1}}>
      {items.map(item=>(
        <div key={item.key} onClick={()=>onSelect(item.key)} style={{
          padding:"11px 22px",cursor:"pointer",fontSize:13,fontFamily:f,fontWeight:active===item.key?400:300,
          color:active===item.key?T.text:T.textSoft,
          background:active===item.key?`${T.purple}12`:"transparent",
          borderLeft:active===item.key?`2px solid ${T.purple}`:"2px solid transparent",
          transition:"all .2s",letterSpacing:.3,
        }}>{item.icon} {item.label}</div>
      ))}
    </nav>
  </div>
);

const Modal = ({open,onClose,title,children,width=500}) => {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.surface,border:`1px solid ${T.border}`,borderRadius:20,width,maxWidth:"90vw",maxHeight:"80vh",overflow:"auto",position:"relative",
      }}>
        <Glow color={T.purple} size={150} top={-50} right={-50} />
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
          <span style={{fontSize:15,fontWeight:300,color:T.text,fontFamily:f,letterSpacing:.5}}>{title}</span>
          <span onClick={onClose} style={{cursor:"pointer",color:T.textDim,fontSize:20,fontWeight:200}}>×</span>
        </div>
        <div style={{padding:24,position:"relative",zIndex:1}}>{children}</div>
      </div>
    </div>
  );
};

const InputField = ({label,value,onChange,type="text",placeholder}) => (
  <div style={{marginBottom:16}}>
    <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontWeight:300}}>{label}</div>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{
      width:"100%",padding:"11px 16px",background:T.bg,border:`1px solid ${T.border}`,
      borderRadius:12,color:T.text,fontSize:13,fontFamily:f,fontWeight:300,outline:"none",boxSizing:"border-box",
      transition:"border .2s",
    }} onFocus={e=>e.target.style.borderColor=T.purple} onBlur={e=>e.target.style.borderColor=T.border} />
  </div>
);

const chartStyle = {background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 20px 16px",position:"relative",overflow:"hidden"};
const chartLabel = {fontSize:10,color:T.textDim,fontFamily:f,marginBottom:18,textTransform:"uppercase",letterSpacing:2,fontWeight:300};
const tipStyle = {background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12,fontFamily:f};

// ─── PAGES ───
const LoginPage = ({onLogin}) => {
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,position:"relative",overflow:"hidden"}}>
      <Glow color={T.purple} size={400} top="10%" left="20%" />
      <Glow color={T.cyan} size={300} bottom="10%" right="15%" />
      <Glow color={T.pink} size={250} top="60%" left="60%" />
      <div style={{width:400,background:`${T.surface}cc`,backdropFilter:"blur(40px)",border:`1px solid ${T.border}`,borderRadius:24,padding:40,position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:10,fontFamily:f,fontWeight:300,color:T.purple,textTransform:"uppercase",letterSpacing:6,marginBottom:10}}>Telemarketing</div>
          <div style={{fontSize:28,fontWeight:200,color:T.text,letterSpacing:2}}>TM Platform</div>
          <div style={{width:40,height:2,background:T.gradient1,margin:"14px auto 0",borderRadius:1}} />
        </div>
        <InputField label="Email" value={email} onChange={setEmail} placeholder="admin@tm.co.kr" />
        <InputField label="Password" value={pass} onChange={setPass} type="password" placeholder="••••••••" />
        <div style={{display:"flex",gap:10,marginTop:24}}>
          <Btn onClick={()=>onLogin("super")} style={{flex:1}}>Super Admin</Btn>
          <Btn onClick={()=>onLogin("center")} variant="ghost" style={{flex:1}}>센터장</Btn>
          <Btn onClick={()=>onLogin("agent")} variant="ghost" style={{flex:1}}>상담원</Btn>
        </div>
      </div>
    </div>
  );
};

const SuperAdmin = ({onLogout,onGoCenter}) => {
  const [tab,setTab]=useState("centers");
  const [modal,setModal]=useState(false);
  const nav=[{key:"centers",label:"센터 관리",icon:"◆"},{key:"stats",label:"전체 통계",icon:"◈"},{key:"billing",label:"수익 관리",icon:"◇"}];
  const pieData=[{name:"Premium",value:2,color:T.purple},{name:"Basic",value:1,color:T.textDim}];
  return (
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="TM Platform" subtitle="super admin" />
      <div style={{flex:1,overflow:"auto",padding:32,position:"relative"}}>
        <Glow color={T.blue} size={300} top={-100} right={-100} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28,position:"relative",zIndex:1}}>
          <div>
            <div style={{fontSize:22,fontWeight:200,fontFamily:f,letterSpacing:.5}}>{nav.find(n=>n.key===tab)?.label}</div>
            <div style={{fontSize:11,color:T.textDim,fontFamily:f,marginTop:5,fontWeight:300}}>2026.04.17 Friday</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {tab==="centers"&&<Btn onClick={()=>setModal(true)} size="sm">+ 센터 생성</Btn>}
            <Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn>
          </div>
        </div>

        {tab==="centers"&&<>
          <div style={{display:"flex",gap:16,marginBottom:28,flexWrap:"wrap"}}>
            <StatCard label="Total Centers" value={MOCK_CENTERS.length} color={T.purple} />
            <StatCard label="Total Calls" value="2,130" sub="today" color={T.blue} />
            <StatCard label="Avg Connect" value="22.6%" color={T.cyan} />
            <StatCard label="Active Phones" value="13" color={T.orange} />
          </div>
          <div style={{...chartStyle,padding:0,overflow:"hidden"}}>
            <Table columns={[
              {title:"센터명",render:r=><span style={{cursor:"pointer",color:T.blue,fontWeight:400}} onClick={onGoCenter}>{r.name}</span>},
              {title:"센터장",key:"owner"},{title:"전화기",key:"phones",align:"center"},
              {title:"총 콜",align:"right",render:r=>r.totalCalls.toLocaleString()},
              {title:"연결",key:"connected",align:"right"},
              {title:"연결률",align:"right",render:r=><span style={{color:r.rate>20?T.cyan:T.red,fontWeight:400}}>{r.rate}%</span>},
              {title:"요금제",render:r=><Badge color={r.plan==="premium"?T.purple:T.textDim}>{r.plan}</Badge>},
              {title:"상태",render:r=><Badge color={r.active?T.cyan:T.red}>{r.active?"Active":"Inactive"}</Badge>},
            ]} data={MOCK_CENTERS} />
          </div>
        </>}

        {tab==="stats"&&<>
          <div style={{display:"flex",gap:16,marginBottom:28,flexWrap:"wrap"}}>
            <StatCard label="Today Calls" value="2,130" color={T.blue} />
            <StatCard label="Connected" value="490" color={T.cyan} />
            <StatCard label="Connect Rate" value="23.0%" color={T.orange} />
          </div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <div style={{...chartStyle,flex:1,minWidth:300}}>
              <div style={chartLabel}>센터별 연결률</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={MOCK_CENTERS.map(c=>({name:c.name.slice(0,4),rate:c.rate}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="name" stroke={T.textDim} fontSize={11} fontFamily={f} />
                  <YAxis stroke={T.textDim} fontSize={11} />
                  <Tooltip contentStyle={tipStyle} />
                  <defs><linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.purple} /><stop offset="100%" stopColor={T.blue} /></linearGradient></defs>
                  <Bar dataKey="rate" fill="url(#gBar)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{...chartStyle,flex:1,minWidth:300}}>
              <div style={chartLabel}>요금제 분포</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                  {pieData.map((e,i)=><Cell key={i} fill={e.color} />)}
                </Pie><Tooltip contentStyle={tipStyle} /></PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>}

        {tab==="billing"&&<div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {MOCK_CENTERS.map(c=>(
            <div key={c.id} style={{...chartStyle,flex:1,minWidth:200}}>
              <Glow color={c.plan==="premium"?T.purple:T.textDim} size={80} top={-30} right={-30} />
              <div style={{fontSize:14,fontWeight:300,color:T.text,marginBottom:6,fontFamily:f,position:"relative",zIndex:1}}>{c.name}</div>
              <Badge color={c.plan==="premium"?T.purple:T.textDim}>{c.plan}</Badge>
              <div style={{marginTop:20,fontSize:28,fontWeight:200,fontFamily:f,color:T.text,position:"relative",zIndex:1}}>
                {c.plan==="premium"?"₩890,000":"₩490,000"}
              </div>
              <div style={{fontSize:11,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:4}}>/ month</div>
            </div>
          ))}
        </div>}

        <Modal open={modal} onClose={()=>setModal(false)} title="새 센터 생성">
          <InputField label="센터명" value="" onChange={()=>{}} placeholder="서울 강남센터" />
          <InputField label="센터장 이메일" value="" onChange={()=>{}} placeholder="admin@center.kr" />
          <InputField label="전화기 수" value="5" onChange={()=>{}} type="number" />
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontWeight:300}}>Plan</div>
            <div style={{display:"flex",gap:8}}>
              <Btn size="sm">Basic</Btn><Btn size="sm" variant="ghost">Premium</Btn>
            </div>
          </div>
          <Btn onClick={()=>setModal(false)} style={{width:"100%",marginTop:8}}>Create</Btn>
        </Modal>
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

  const nav=[
    {key:"dashboard",label:"대시보드",icon:"◆"},{key:"db",label:"DB 관리",icon:"◈"},
    {key:"phones",label:"전화기 관리",icon:"◇"},{key:"recordings",label:"녹음 관리",icon:"♪"},
    {key:"performance",label:"상담원 성과",icon:"★"},{key:"settings",label:"설정",icon:"⚙"},
  ];

  const startTest=()=>{
    setTestRunning(true);
    setTestProgress({tm1:{tried:0,connected:0},tm2:{tried:0,connected:0},tm3:{tried:0,connected:0},tm4:{tried:0,connected:0},tm5:{tried:0,connected:0}});
    const iv=setInterval(()=>{
      setTestProgress(prev=>{
        if(!prev)return prev;
        const next={...prev};
        Object.keys(next).forEach(k=>{if(next[k].tried<20) next[k]={...next[k],tried:next[k].tried+1,connected:next[k].connected+(Math.random()>.7?1:0)};});
        if(Object.values(next).every(v=>v.tried>=20))clearInterval(iv);
        return{...next};
      });
    },250);
  };
  const stopTest=()=>{setTestRunning(false);setTestProgress(null);};

  const phoneColors = [T.purple, T.blue, T.cyan, T.orange, T.pink];

  return (
    <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text}}>
      <SideNav items={nav} active={tab} onSelect={setTab} title="서울 강남센터" subtitle="center admin" />
      <div style={{flex:1,overflow:"auto",padding:32,position:"relative"}}>
        <Glow color={T.cyan} size={250} top={-80} right={-80} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28,position:"relative",zIndex:1}}>
          <div>
            <div style={{fontSize:22,fontWeight:200,fontFamily:f,letterSpacing:.5}}>{nav.find(n=>n.key===tab)?.label}</div>
            <div style={{fontSize:11,color:T.textDim,fontFamily:f,marginTop:5,fontWeight:300}}>Real-time updates</div>
          </div>
          <Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn>
        </div>

        {tab==="dashboard"&&<>
          <div style={{display:"flex",gap:16,marginBottom:24,flexWrap:"wrap"}}>
            <StatCard label="Total Calls" value="320" color={T.blue} />
            <StatCard label="Connected" value="78" color={T.cyan} />
            <StatCard label="Connect Rate" value="24.4%" color={T.orange} />
            <StatCard label="Active Phones" value="3 / 5" color={T.purple} />
          </div>
          <div style={{...chartLabel,marginBottom:14}}>전화기 실시간 상태</div>
          <div style={{display:"flex",gap:12,marginBottom:28,flexWrap:"wrap"}}>
            {MOCK_PHONES.map((p,i)=>(
              <div key={p.id} style={{
                flex:1,minWidth:115,background:T.card,border:`1px solid ${T.border}`,
                borderRadius:16,padding:"18px 16px",textAlign:"center",position:"relative",overflow:"hidden",
              }}>
                <Glow color={phoneColors[i]} size={60} top={-20} right={-20} />
                <div style={{fontSize:18,fontWeight:300,fontFamily:f,color:T.text,marginBottom:8,position:"relative",zIndex:1}}>{p.sip}</div>
                <StatusDot status={p.status} />
                <div style={{fontSize:11,color:T.textDim,marginTop:10,fontFamily:f,fontWeight:300}}>{p.agent}</div>
                <div style={{fontSize:22,fontWeight:200,fontFamily:f,color:T.text,marginTop:8}}>{p.calls}<span style={{fontSize:10,color:T.textDim,marginLeft:2}}>calls</span></div>
                <div style={{fontSize:13,color:p.rate>25?T.cyan:T.textSoft,fontFamily:f,fontWeight:400,marginTop:4}}>{p.rate}%</div>
                <div style={{height:3,background:T.border,borderRadius:2,marginTop:10}}>
                  <div style={{height:3,borderRadius:2,width:`${Math.min(p.rate*2.5,100)}%`,background:`linear-gradient(90deg, ${phoneColors[i]}, ${phoneColors[(i+1)%5]})`}} />
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <div style={{...chartStyle,flex:1,minWidth:280}}>
              <div style={chartLabel}>시간별 콜 추이</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={HOURLY}>
                  <defs>
                    <linearGradient id="gArea1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.blue} stopOpacity={.3}/><stop offset="100%" stopColor={T.blue} stopOpacity={0}/></linearGradient>
                    <linearGradient id="gArea2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.cyan} stopOpacity={.3}/><stop offset="100%" stopColor={T.cyan} stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="hour" stroke={T.textDim} fontSize={11} fontFamily={f} />
                  <YAxis stroke={T.textDim} fontSize={11} />
                  <Tooltip contentStyle={tipStyle} />
                  <Area type="monotone" dataKey="calls" stroke={T.blue} strokeWidth={2} fill="url(#gArea1)" />
                  <Area type="monotone" dataKey="connected" stroke={T.cyan} strokeWidth={2} fill="url(#gArea2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{...chartStyle,flex:1,minWidth:280}}>
              <div style={chartLabel}>전화기별 성과</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={PHONE_CHART}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="name" stroke={T.textDim} fontSize={11} fontFamily={f} />
                  <YAxis stroke={T.textDim} fontSize={11} />
                  <Tooltip contentStyle={tipStyle} />
                  <defs><linearGradient id="gBar2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.purple}/><stop offset="100%" stopColor={T.blue}/></linearGradient></defs>
                  <Bar dataKey="calls" fill="url(#gBar2)" radius={[6,6,0,0]} />
                  <Bar dataKey="connected" fill={T.cyan} radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>}

        {tab==="db"&&<>
          <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
            <Btn onClick={()=>setUploadModal(true)} size="sm">Upload Excel</Btn>
            {!testRunning?<Btn onClick={startTest} size="sm" variant="ghost">100건 테스트</Btn>:<Btn onClick={stopTest} size="sm" variant="danger">STOP</Btn>}
            <Btn size="sm" variant="ghost">자동 분배</Btn>
          </div>

          {testRunning&&testProgress&&(
            <div style={{background:`${T.orange}08`,border:`1px solid ${T.orange}25`,borderRadius:16,padding:24,marginBottom:24,position:"relative",overflow:"hidden"}}>
              <Glow color={T.orange} size={120} top={-40} right={-40} />
              <div style={{fontSize:13,fontWeight:400,color:T.orange,fontFamily:f,marginBottom:14,position:"relative",zIndex:1}}>
                Test in progress...
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",position:"relative",zIndex:1}}>
                {Object.entries(testProgress).map(([k,v],i)=>{
                  const rate=v.tried>0?((v.connected/v.tried)*100).toFixed(1):"0.0";
                  return (
                    <div key={k} style={{flex:1,minWidth:90,background:T.card,borderRadius:12,padding:"12px 14px",textAlign:"center"}}>
                      <div style={{fontSize:11,fontFamily:f,color:phoneColors[i],fontWeight:400}}>{k.toUpperCase()}</div>
                      <div style={{fontSize:20,fontWeight:200,fontFamily:f,color:T.text,marginTop:4}}>{v.tried}/20</div>
                      <div style={{fontSize:11,color:parseFloat(rate)>25?T.cyan:T.textSoft,fontFamily:f,fontWeight:300}}>{rate}%</div>
                      <div style={{height:3,background:T.border,borderRadius:2,marginTop:8}}>
                        <div style={{height:3,background:phoneColors[i],borderRadius:2,width:`${(v.tried/20)*100}%`,transition:"width .2s"}} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.values(testProgress).every(v=>v.tried>=20)&&(()=>{
                const total=Object.values(testProgress).reduce((a,v)=>a+v.connected,0);
                return (
                  <div style={{marginTop:16,padding:"12px 16px",background:T.card,borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
                    <span style={{fontSize:13,color:T.text,fontFamily:f,fontWeight:300}}>Result: {total}/100 connected ({((total/100)*100).toFixed(1)}%)</span>
                    <div style={{display:"flex",gap:8}}>
                      <Btn size="sm" variant="success">채택</Btn>
                      <Btn size="sm" variant="danger">폐기</Btn>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div style={chartLabel}>업로드된 리스트</div>
          <div style={{...chartStyle,padding:0,overflow:"hidden",marginBottom:24}}>
            <Table columns={[
              {title:"리스트명",key:"name"},
              {title:"출처",render:r=><Badge color={T.purple}>{r.source}</Badge>},
              {title:"건수",key:"count",align:"right"},
              {title:"연결률",align:"right",render:r=><span style={{color:r.connectRate>25?T.cyan:r.connectRate>15?T.orange:T.red,fontWeight:400,fontFamily:f}}>{r.connectRate}%</span>},
              {title:"구분",render:r=><Badge color={r.isTest?T.orange:T.cyan}>{r.isTest?"Test":"Production"}</Badge>},
              {title:"업로드일",key:"uploadedAt"},
            ]} data={MOCK_LISTS} />
          </div>

          <div style={chartLabel}>고객 목록</div>
          <div style={{...chartStyle,padding:0,overflow:"hidden"}}>
            <Table columns={[
              {title:"이름",key:"name"},
              {title:"전화번호",render:r=><span style={{fontFamily:f,fontSize:12,fontWeight:300}}>{showPhone?r.phone:maskPhone(r.phone)}</span>},
              {title:"상태",render:r=>{
                const c={pending:T.textDim,calling:T.orange,done:T.cyan,retry:T.red};
                const l={pending:"대기",calling:"통화중",done:"완료",retry:"재시도"};
                return <Badge color={c[r.status]}>{l[r.status]}</Badge>;
              }},
              {title:"배정",render:r=><span style={{fontFamily:f,fontSize:12,fontWeight:300,color:T.blue}}>{r.assignedTo}</span>},
              {title:"메모",render:r=><span style={{color:T.textSoft,fontWeight:300}}>{r.memo||"—"}</span>},
            ]} data={MOCK_CUSTOMERS} />
          </div>

          <Modal open={uploadModal} onClose={()=>setUploadModal(false)} title="Excel Upload">
            <InputField label="리스트명" value="" onChange={()=>{}} placeholder="김사장 DB 4월" />
            <InputField label="출처" value="" onChange={()=>{}} placeholder="김사장" />
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontWeight:300}}>File</div>
              <div style={{border:`2px dashed ${T.border}`,borderRadius:14,padding:"34px 20px",textAlign:"center",color:T.textDim,fontSize:13,fontFamily:f,fontWeight:300}}>
                Drop .xlsx / .csv here
              </div>
            </div>
            <Toggle checked={false} onChange={()=>{}} label="Test mode upload" />
            <Btn onClick={()=>setUploadModal(false)} style={{width:"100%",marginTop:20}}>Upload</Btn>
          </Modal>
        </>}

        {tab==="phones"&&<>
          <div style={{display:"flex",gap:16,marginBottom:24,flexWrap:"wrap"}}>
            <StatCard label="Total Phones" value="5" color={T.purple} />
            <StatCard label="Calling" value="2" color={T.cyan} />
            <StatCard label="Idle" value="2" color={T.textDim} />
            <StatCard label="Busy" value="1" color={T.orange} />
          </div>
          <div style={{...chartStyle,padding:0,overflow:"hidden"}}>
            <Table columns={[
              {title:"SIP",render:r=><span style={{fontFamily:f,fontWeight:400,color:T.blue}}>{r.sip}</span>},
              {title:"상태",render:r=><StatusDot status={r.status} />},
              {title:"상담원",key:"agent"},{title:"총 콜",key:"calls",align:"right"},
              {title:"연결",key:"connected",align:"right"},
              {title:"연결률",align:"right",render:r=><span style={{color:r.rate>25?T.cyan:T.red,fontWeight:400}}>{r.rate}%</span>},
            ]} data={MOCK_PHONES} />
          </div>
        </>}

        {tab==="recordings"&&<div style={{...chartStyle,padding:0,overflow:"hidden"}}>
          <Table columns={[
            {title:"날짜",key:"date"},{title:"시간",key:"time"},
            {title:"고객",key:"customer"},
            {title:"전화기",render:r=><span style={{fontFamily:f,color:T.blue,fontWeight:300}}>{r.phone}</span>},
            {title:"길이",render:r=>{const m=Math.floor(r.duration/60),s=r.duration%60;return <span style={{fontFamily:f,fontWeight:300}}>{m}:{String(s).padStart(2,"0")}</span>}},
            {title:"",render:()=><Btn size="sm" variant="ghost">▶ Play</Btn>},
          ]} data={MOCK_RECORDINGS} />
        </div>}

        {tab==="performance"&&<>
          <div style={{display:"flex",gap:14,marginBottom:28,flexWrap:"wrap"}}>
            {MOCK_PHONES.map((p,i)=>(
              <div key={p.id} style={{flex:1,minWidth:115,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 16px",textAlign:"center",position:"relative",overflow:"hidden"}}>
                <Glow color={phoneColors[i]} size={60} top={-20} right={-20} />
                <div style={{fontSize:10,color:T.textDim,fontFamily:f,textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontWeight:300}}>{p.sip}</div>
                <div style={{fontSize:13,fontFamily:f,color:T.textSoft,marginBottom:6,fontWeight:300}}>{p.agent}</div>
                <div style={{fontSize:32,fontWeight:200,fontFamily:f,color:p.rate>25?T.cyan:p.rate>15?T.orange:T.red}}>{p.rate}%</div>
                <div style={{fontSize:11,color:T.textDim,fontFamily:f,fontWeight:300,marginTop:4}}>{p.connected}/{p.calls} calls</div>
                <div style={{height:4,background:T.border,borderRadius:2,marginTop:12}}>
                  <div style={{height:4,borderRadius:2,width:`${Math.min(p.rate*2.5,100)}%`,background:`linear-gradient(90deg, ${phoneColors[i]}, ${phoneColors[(i+1)%5]})`}} />
                </div>
              </div>
            ))}
          </div>
          <div style={chartStyle}>
            <div style={chartLabel}>상담원별 비교</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={PHONE_CHART} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis type="number" stroke={T.textDim} fontSize={11} />
                <YAxis type="category" dataKey="name" stroke={T.textDim} fontSize={11} width={50} fontFamily={f} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="calls" fill={T.purple} radius={[0,6,6,0]} />
                <Bar dataKey="connected" fill={T.cyan} radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>}

        {tab==="settings"&&<div style={{maxWidth:500}}>
          <div style={{...chartStyle,marginBottom:16,padding:28}}>
            <div style={{fontSize:14,fontWeight:300,color:T.text,fontFamily:f,marginBottom:18}}>DB 분배 방식</div>
            <div style={{display:"flex",gap:10}}>
              <Btn size="sm" variant={distMode==="auto"?"primary":"ghost"} onClick={()=>setDistMode("auto")}>Auto (균등 분배)</Btn>
              <Btn size="sm" variant={distMode==="manual"?"primary":"ghost"} onClick={()=>setDistMode("manual")}>Manual (직접 배정)</Btn>
            </div>
          </div>
          <div style={{...chartStyle,marginBottom:16,padding:28}}>
            <div style={{fontSize:14,fontWeight:300,color:T.text,fontFamily:f,marginBottom:18}}>전화번호 노출</div>
            <Toggle checked={showPhone} onChange={setShowPhone} label={showPhone?"전체 표시 (010-1234-5678)":"마스킹 (010-****-5678)"} />
          </div>
          <div style={{...chartStyle,padding:28}}>
            <div style={{fontSize:14,fontWeight:300,color:T.text,fontFamily:f,marginBottom:12}}>요금제</div>
            <Badge color={T.purple}>Premium</Badge>
            <div style={{fontSize:12,color:T.textSoft,marginTop:10,fontFamily:f,fontWeight:300}}>녹음 · 통계 · 데이터 분석 포함</div>
          </div>
        </div>}
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
    setState("calling");
    timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);
    setTimeout(()=>{
      clearInterval(timerRef.current);
      const ok=Math.random()>.4;
      setState(ok?"connected":"failed");
      if(ok)timerRef.current=setInterval(()=>setCallTime(t=>t+1),1000);
      setStats(s=>({calls:s.calls+1,connected:s.connected+(ok?1:0)}));
    },2000+Math.random()*2000);
  };
  const endCall=()=>{clearInterval(timerRef.current);setState("ended");};
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const sc={idle:T.textDim,ready:T.purple,calling:T.orange,connected:T.cyan,failed:T.red,ended:T.textDim};
  const sl={idle:"Standby",ready:"Ready",calling:"Dialing...",connected:"On Call",failed:"Failed",ended:"Call Ended"};

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:f,padding:20,position:"relative",overflow:"hidden"}}>
      <Glow color={T.purple} size={350} top="-10%" left="-10%" />
      <Glow color={T.cyan} size={300} bottom="-5%" right="-10%" />
      <Glow color={T.pink} size={200} top="50%" left="70%" />
      <div style={{width:"100%",maxWidth:420,background:`${T.surface}dd`,backdropFilter:"blur(30px)",border:`1px solid ${T.border}`,borderRadius:28,overflow:"hidden",position:"relative",zIndex:1}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:300,color:T.text}}>Agent 2001</div>
            <div style={{fontSize:10,color:T.textDim,fontFamily:f,fontWeight:300,letterSpacing:1}}>서울 강남센터</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,fontFamily:f,color:T.textDim,fontWeight:300}}>{stats.calls} calls / {stats.connected} connected</div>
            <div style={{fontSize:13,fontFamily:f,color:stats.calls>0?T.cyan:T.textDim,fontWeight:400}}>
              {stats.calls>0?((stats.connected/stats.calls)*100).toFixed(1):"0.0"}%
            </div>
          </div>
        </div>

        <div style={{padding:"36px 24px",textAlign:"center"}}>
          <div style={{
            width:140,height:140,borderRadius:"50%",margin:"0 auto 24px",
            border:`2px solid ${sc[state]}`,background:`${sc[state]}10`,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            boxShadow:state==="connected"?`0 0 50px ${T.cyan}25`:state==="calling"?`0 0 50px ${T.orange}25`:`0 0 30px ${sc[state]}15`,
            transition:"all .4s",
          }}>
            <div style={{fontSize:11,color:sc[state],fontFamily:f,fontWeight:300,textTransform:"uppercase",letterSpacing:2}}>{sl[state]}</div>
            {(state==="calling"||state==="connected")&&(
              <div style={{fontSize:26,fontWeight:200,fontFamily:f,color:T.text,marginTop:6}}>{fmt(callTime)}</div>
            )}
          </div>

          {customer&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:20,fontWeight:300,color:T.text}}>{customer.name}</div>
              <div style={{fontSize:13,color:T.textDim,fontFamily:f,marginTop:6,fontWeight:300,letterSpacing:1}}>{maskPhone(customer.phone)}</div>
            </div>
          )}

          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            {state==="idle"&&<Btn onClick={nextCustomer} style={{width:"100%",padding:"16px 0",fontSize:15,fontWeight:300}}>Next Customer</Btn>}
            {state==="ready"&&<Btn onClick={startCall} variant="success" style={{width:"100%",padding:"16px 0",fontSize:15,fontWeight:300}}>Call</Btn>}
            {state==="calling"&&<Btn variant="ghost" disabled style={{width:"100%",padding:"16px 0",fontWeight:300}}>Dialing...</Btn>}
            {state==="connected"&&<Btn onClick={endCall} variant="danger" style={{width:"100%",padding:"16px 0",fontSize:15,fontWeight:300}}>End Call</Btn>}
            {(state==="failed"||state==="ended")&&<Btn onClick={nextCustomer} style={{width:"100%",padding:"16px 0",fontSize:15,fontWeight:300}}>Next Customer</Btn>}
          </div>
        </div>

        {customer&&(
          <div style={{padding:"0 24px 24px"}}>
            <textarea value={memo} onChange={e=>setMemo(e.target.value)} placeholder="Memo..."
              style={{width:"100%",height:70,padding:"12px 16px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,color:T.text,fontSize:13,fontFamily:f,fontWeight:300,resize:"none",outline:"none",boxSizing:"border-box"}}
            />
          </div>
        )}

        <div style={{padding:"14px 24px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"center"}}>
          <Btn onClick={onLogout} variant="ghost" size="sm">Logout</Btn>
        </div>
      </div>
    </div>
  );
};

export default function App(){
  const [role,setRole]=useState(null);
  if(!role) return <LoginPage onLogin={setRole} />;
  if(role==="super") return <SuperAdmin onLogout={()=>setRole(null)} onGoCenter={()=>setRole("center")} />;
  if(role==="center") return <CenterAdmin onLogout={()=>setRole(null)} />;
  if(role==="agent") return <AgentPage onLogout={()=>setRole(null)} />;
}
