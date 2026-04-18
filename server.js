import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tm-secret-2026';

// ── In-Memory DB ──
const hash = bcrypt.hashSync('1234', 10);
const DB = {
  users: [
    {id:1,email:'admin@tm.kr',password:hash,name:'슈퍼관리자',role:'super_admin',center_id:null,phone_id:null,agent_name:null,is_active:1},
    {id:2,email:'center@tm.kr',password:hash,name:'김센터장',role:'center_admin',center_id:1,phone_id:null,agent_name:null,is_active:1},
    {id:3,email:'agenta@tm.kr',password:hash,name:'상담원A',role:'agent',center_id:1,phone_id:1,agent_name:'A',is_active:1},
    {id:4,email:'agentb@tm.kr',password:hash,name:'상담원B',role:'agent',center_id:1,phone_id:2,agent_name:'B',is_active:1},
    {id:5,email:'agentc@tm.kr',password:hash,name:'상담원C',role:'agent',center_id:1,phone_id:3,agent_name:'C',is_active:1},
    {id:6,email:'agentd@tm.kr',password:hash,name:'상담원D',role:'agent',center_id:1,phone_id:4,agent_name:'D',is_active:1},
    {id:7,email:'agente@tm.kr',password:hash,name:'상담원E',role:'agent',center_id:1,phone_id:5,agent_name:'E',is_active:1},
  ],
  centers: [{id:1,name:'서울 강남센터',owner_id:2,dist_mode:'auto',show_phone:0,plan:'premium',auto_check_no_answer:1,auto_check_invalid:1,no_answer_limit:3,is_active:1}],
  phones: [
    {id:1,center_id:1,sip_account:'2001',status:'calling'},{id:2,center_id:1,sip_account:'2002',status:'idle'},
    {id:3,center_id:1,sip_account:'2003',status:'calling'},{id:4,center_id:1,sip_account:'2004',status:'idle'},
    {id:5,center_id:1,sip_account:'2005',status:'calling'},
  ],
  customer_lists: [{id:1,center_id:1,title:'김사장 DB 4월',source:'김사장',is_test:0,total_count:50,uploaded_at:'2026-04-15'}],
  customers: [],
  calls: [],
  recordings: [],
  _nextId: {users:8,centers:2,phones:6,customer_lists:2,customers:1,calls:1},
};

// Seed customers
const names=['홍길동','김철수','이영희','박민수','최지현','정수빈','강하늘','윤서연','조현우','한소희'];
const phs=['010-1234-5678','010-2345-6789','010-3456-7890','010-4567-8901','010-5678-9012','010-6789-0123','010-7890-1234','010-8901-2345','010-9012-3456','010-0123-4567'];
const agents=['A','B','C','D','E'];
names.forEach((n,i)=>{DB.customers.push({id:DB._nextId.customers++,list_id:1,center_id:1,phone_id:(i%5)+1,agent_name:agents[i%5],name:n,phone_number:phs[i],status:'pending',no_answer_count:0,memo:''});});
for(let i=0;i<40;i++){DB.customers.push({id:DB._nextId.customers++,list_id:1,center_id:1,phone_id:(i%5)+1,agent_name:agents[i%5],name:`고객${i+11}`,phone_number:`010-${String(1000+i).padStart(4,'0')}-${String(5000+i).padStart(4,'0')}`,status:'pending',no_answer_count:0,memo:''});}

// ── Express ──
const app = express();
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(cors({origin:true,credentials:true}));
app.use(cookieParser());
app.use(express.json({limit:'10mb'}));
app.use('/api/',rateLimit({windowMs:15*60*1000,max:500}));

// ── Health ──
app.get('/api/health',(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

// ── Auth ──
const auth=(roles=[])=>(req,res,next)=>{
  const token=req.headers.authorization?.split(' ')[1]||req.cookies?.token;
  if(!token)return res.status(401).json({error:'Unauthorized'});
  try{const d=jwt.verify(token,JWT_SECRET);req.user=d;if(roles.length&&!roles.includes(d.role))return res.status(403).json({error:'Forbidden'});next();}
  catch{return res.status(401).json({error:'Invalid token'});}
};

app.post('/api/auth/login',(req,res)=>{
  const{email,password}=req.body;
  if(!email||!password)return res.status(400).json({error:'Email and password required'});
  const user=DB.users.find(u=>u.email===email&&u.is_active);
  if(!user||!bcrypt.compareSync(password,user.password))return res.status(401).json({error:'Invalid credentials'});
  const token=jwt.sign({id:user.id,email:user.email,name:user.name,role:user.role,center_id:user.center_id,phone_id:user.phone_id,agent_name:user.agent_name},JWT_SECRET,{expiresIn:'24h'});
  res.json({token,user:{id:user.id,email:user.email,name:user.name,role:user.role,center_id:user.center_id,agent_name:user.agent_name}});
});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('token');res.json({ok:true});});
app.get('/api/auth/me',auth(),(req,res)=>{const u=DB.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'Not found'});res.json({id:u.id,email:u.email,name:u.name,role:u.role,center_id:u.center_id,agent_name:u.agent_name});});

// ── Centers ──
app.get('/api/centers',auth(['super_admin']),(req,res)=>{
  res.json(DB.centers.map(c=>{
    const owner=DB.users.find(u=>u.id===c.owner_id);
    const calls=DB.calls.filter(x=>x.center_id===c.id);
    const connected=calls.filter(x=>x.result==='connected');
    return{...c,owner_name:owner?.name,phone_count:DB.phones.filter(p=>p.center_id===c.id).length,today_calls:calls.length,today_connected:connected.length,connect_rate:calls.length>0?((connected.length/calls.length)*100).toFixed(1):'0.0'};
  }));
});
app.post('/api/centers',auth(['super_admin']),(req,res)=>{
  const{name,admin_email,admin_name,phone_count=5,plan='basic'}=req.body;
  const cid=DB._nextId.centers++;
  DB.centers.push({id:cid,name,owner_id:null,dist_mode:'auto',show_phone:0,plan,auto_check_no_answer:1,auto_check_invalid:1,no_answer_limit:3,is_active:1});
  const uid=DB._nextId.users++;
  DB.users.push({id:uid,email:admin_email,password:hash,name:admin_name,role:'center_admin',center_id:cid,phone_id:null,agent_name:null,is_active:1});
  DB.centers.find(c=>c.id===cid).owner_id=uid;
  for(let i=0;i<phone_count;i++){
    const pid=DB._nextId.phones++;
    DB.phones.push({id:pid,center_id:cid,sip_account:`${2000+cid*10+i+1}`,status:'idle'});
    const an=String.fromCharCode(65+i);
    DB.users.push({id:DB._nextId.users++,email:`agent${an.toLowerCase()}_c${cid}@tm.kr`,password:hash,name:`상담원${an}`,role:'agent',center_id:cid,phone_id:pid,agent_name:an,is_active:1});
  }
  res.json({id:cid});
});
app.put('/api/centers/:id',auth(['super_admin','center_admin']),(req,res)=>{
  const c=DB.centers.find(x=>x.id===+req.params.id);if(!c)return res.status(404).json({error:'Not found'});
  Object.keys(req.body).forEach(k=>{if(k in c)c[k]=req.body[k];});
  res.json({ok:true});
});

// ── Dashboard ──
app.get('/api/dashboard/:cid',auth(['center_admin','super_admin']),(req,res)=>{
  const cid=+req.params.cid;
  const center=DB.centers.find(c=>c.id===cid);
  const agentUsers=DB.users.filter(u=>u.role==='agent'&&u.center_id===cid&&u.is_active);
  const agentData=agentUsers.map(u=>{
    const phone=DB.phones.find(p=>p.id===u.phone_id);
    const calls=DB.calls.filter(c=>c.agent_name===u.agent_name&&c.center_id===cid);
    const custs=DB.customers.filter(c=>c.agent_name===u.agent_name&&c.center_id===cid);
    return{
      agent_name:u.agent_name,phone_id:u.phone_id,sip_account:phone?.sip_account,status:phone?.status||'idle',
      total_calls:calls.length,connected:calls.filter(c=>c.result==='connected').length,
      no_answer:calls.filter(c=>c.result==='no_answer').length,invalid_count:calls.filter(c=>c.result==='invalid').length,
      talk_time:calls.reduce((a,c)=>a+(c.duration_sec||0),0),
      pending:custs.filter(c=>c.status==='pending').length,
      na1:custs.filter(c=>c.no_answer_count===1).length,na2:custs.filter(c=>c.no_answer_count===2).length,na3:custs.filter(c=>c.no_answer_count>=3).length,
    };
  });
  const lists=DB.customer_lists.filter(l=>l.center_id===cid).map(l=>{
    const custs=DB.customers.filter(c=>c.list_id===l.id);
    const used=custs.filter(c=>c.status!=='pending').length;
    const done=custs.filter(c=>c.status==='done').length;
    const inv=custs.filter(c=>c.status==='invalid').length;
    return{...l,total:custs.length,used,done_count:done,invalid_count:inv,na_count:custs.filter(c=>c.status==='no_answer').length,remaining:custs.filter(c=>c.status==='pending').length,connect_rate:used>0?((done/used)*100).toFixed(1):'0.0',invalid_rate:used>0?((inv/used)*100).toFixed(1):'0.0'};
  });
  res.json({center,agents:agentData,lists,hourly:[]});
});

// ── Lists ──
app.get('/api/lists/:cid',auth(['center_admin']),(req,res)=>{
  const cid=+req.params.cid;
  res.json(DB.customer_lists.filter(l=>l.center_id===cid).map(l=>{
    const custs=DB.customers.filter(c=>c.list_id===l.id);
    const used=custs.filter(c=>c.status!=='pending').length;
    const done=custs.filter(c=>c.status==='done').length;
    const inv=custs.filter(c=>c.status==='invalid').length;
    const agentBreakdown=[...new Set(custs.map(c=>c.agent_name).filter(Boolean))].map(an=>{
      const ac=custs.filter(c=>c.agent_name===an);
      return{agent_name:an,distributed:ac.length,used:ac.filter(c=>c.status!=='pending').length,remaining:ac.filter(c=>c.status==='pending').length,connected:ac.filter(c=>c.status==='done').length,no_answer:ac.filter(c=>c.status==='no_answer').length,invalid_count:ac.filter(c=>c.status==='invalid').length};
    });
    return{...l,total:custs.length,used,connected:done,invalid_count:inv,remaining:custs.filter(c=>c.status==='pending').length,connect_rate:used>0?((done/used)*100).toFixed(1):'0.0',invalid_rate:used>0?((inv/used)*100).toFixed(1):'0.0',agents:agentBreakdown};
  }));
});

// ── Customers ──
app.get('/api/customers',auth(['center_admin']),(req,res)=>{
  const custs=DB.customers.filter(c=>c.center_id===req.user.center_id).slice(-200);
  res.json(custs);
});

// ── Phone Validation ──
function validatePhone(num){
  if(!num)return{valid:false,reason:'empty'};
  let cleaned=String(num).replace(/[^0-9]/g,'');
  if(!cleaned||cleaned.length<8)return{valid:false,reason:'length'};
  if(cleaned.startsWith('82')&&cleaned.length>=11)cleaned=cleaned.slice(2);
  if(cleaned.startsWith('10')&&(cleaned.length===10||cleaned.length===9))cleaned='0'+cleaned;
  if(cleaned.length!==11)return{valid:false,reason:'length'};
  if(!cleaned.startsWith('010'))return{valid:false,reason:'prefix'};
  const d4=cleaned[3];
  if(d4==='0'||d4==='1')return{valid:false,reason:'invalid_range'};
  const f=`${cleaned.slice(0,3)}-${cleaned.slice(3,7)}-${cleaned.slice(7)}`;
  return{valid:true,formatted:f};
}
function checkDuplicate(phone,cid){
  const ex=DB.customers.find(c=>c.phone_number===phone&&c.center_id===cid);
  if(!ex)return null;
  const calls=DB.calls.filter(c=>c.customer_id===ex.id);
  const list=DB.customer_lists.find(l=>l.id===ex.list_id);
  return{list_title:list?.title||'',status:ex.status,no_answer_count:ex.no_answer_count,call_count:calls.length,connected:calls.filter(c=>c.result==='connected').length,invalid:ex.status==='invalid'};
}

// ── Upload DB with validation ──
app.post('/api/lists/upload',auth(['center_admin']),(req,res)=>{
  const{title,source,customers,is_test=0}=req.body;
  if(!title||!customers||!Array.isArray(customers))return res.status(400).json({error:'title and customers array required'});
  const cid=req.user.center_id;
  const results={total:customers.length,valid:0,invalid_phone:0,duplicate:0,dup_details:[],inv_details:[]};
  const valid=[];
  for(const cu of customers){
    const chk=validatePhone(cu.phone||cu.phone_number);
    if(!chk.valid){results.invalid_phone++;results.inv_details.push({phone:cu.phone||cu.phone_number,reason:chk.reason});continue;}
    const dup=checkDuplicate(chk.formatted,cid);
    if(dup){results.duplicate++;results.dup_details.push({phone:chk.formatted,name:cu.name,prev_list:dup.list_title,prev_status:dup.status,was_invalid:dup.invalid,no_answer:dup.no_answer_count,calls:dup.call_count,connected:dup.connected});continue;}
    results.valid++;
    valid.push({name:cu.name||null,phone:chk.formatted,region:cu.region||null});
  }
  const lid=DB._nextId.customer_lists++;
  DB.customer_lists.push({id:lid,center_id:cid,title,source:source||'',is_test,total_count:results.valid,uploaded_at:new Date().toISOString().split('T')[0]});
  for(const v of valid){DB.customers.push({id:DB._nextId.customers++,list_id:lid,center_id:cid,phone_id:null,agent_name:null,name:v.name,phone_number:v.phone,region:v.region,status:'pending',no_answer_count:0,memo:''});}
  const quality=results.total>0?Math.round((results.valid/results.total)*100):0;
  const dupAnalysis={};
  for(const d of results.dup_details){if(!dupAnalysis[d.prev_list])dupAnalysis[d.prev_list]={count:0,invalid:0,no_answer:0,connected:0};dupAnalysis[d.prev_list].count++;if(d.was_invalid)dupAnalysis[d.prev_list].invalid++;if(d.no_answer>0)dupAnalysis[d.prev_list].no_answer++;if(d.connected>0)dupAnalysis[d.prev_list].connected++;}
  res.json({list_id:lid,...results,quality,dup_by_list:Object.entries(dupAnalysis).map(([list,data])=>({list,...data}))});
});

// ── Excel/CSV Upload ──
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024},fileFilter:(req,file,cb)=>{
  const ext=file.originalname.toLowerCase();
  if(ext.endsWith('.xlsx')||ext.endsWith('.xls')||ext.endsWith('.csv'))cb(null,true);
  else cb(new Error('xlsx, xls, csv only'));
}});

app.post('/api/lists/upload-file',auth(['center_admin']),upload.single('file'),(req,res)=>{
  if(!req.file)return res.status(400).json({error:'No file uploaded'});
  const{title,source,is_test=0}=req.body;
  if(!title)return res.status(400).json({error:'title required'});

  // Parse Excel
  let rows=[];
  try{
    const wb=XLSX.read(req.file.buffer,{type:'buffer',codepage:65001,raw:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
  }catch(e){return res.status(400).json({error:'Failed to parse file: '+e.message});}

  if(!rows.length)return res.status(400).json({error:'Empty file'});

  // Auto-detect columns (handles Korean + English)
  const cols=Object.keys(rows[0]);
  const phoneCol=cols.find(c=>{try{return/phone|전화|번호|핸드폰|mobile|tel|연락처|hp|휴대/i.test(c)}catch{return false}})||cols.find(c=>{
    const v=String(rows[0][c]).replace(/[^0-9]/g,'');return v.length>=10&&v.startsWith('01');
  })||cols.find(c=>{const v=String(rows[0][c]).replace(/[^0-9]/g,'');return v.length>=9;})||cols[0];
  const nameCol=cols.find(c=>{try{return/name|이름|성명|고객명|고객/i.test(c)}catch{return false}})||null;
  const regionCol=cols.find(c=>{try{return/region|지역|주소|address|시도|거주/i.test(c)}catch{return false}})||null;

  // Convert to customers array
  const customers=rows.map(r=>({
    phone:String(r[phoneCol]||'').trim(),
    name:nameCol?String(r[nameCol]||'').trim():null,
    region:regionCol?String(r[regionCol]||'').trim():null,
  }));

  // Run through same validation
  const cid=req.user.center_id;
  const results={total:customers.length,valid:0,invalid_phone:0,duplicate:0,dup_details:[],inv_details:[]};
  const valid=[];
  for(const cu of customers){
    const chk=validatePhone(cu.phone);
    if(!chk.valid){results.invalid_phone++;results.inv_details.push({phone:cu.phone,reason:chk.reason});continue;}
    const dup=checkDuplicate(chk.formatted,cid);
    if(dup){results.duplicate++;results.dup_details.push({phone:chk.formatted,name:cu.name,prev_list:dup.list_title,prev_status:dup.status,was_invalid:dup.invalid,no_answer:dup.no_answer_count,calls:dup.call_count,connected:dup.connected});continue;}
    results.valid++;
    valid.push({name:cu.name,phone:chk.formatted,region:cu.region});
  }
  const lid=DB._nextId.customer_lists++;
  DB.customer_lists.push({id:lid,center_id:cid,title,source:source||'',is_test:+is_test,total_count:results.valid,uploaded_at:new Date().toISOString().split('T')[0]});
  for(const v of valid){DB.customers.push({id:DB._nextId.customers++,list_id:lid,center_id:cid,phone_id:null,agent_name:null,name:v.name,phone_number:v.phone,region:v.region,status:'pending',no_answer_count:0,memo:''});}
  const quality=results.total>0?Math.round((results.valid/results.total)*100):0;
  const dupAnalysis={};
  for(const d of results.dup_details){if(!dupAnalysis[d.prev_list])dupAnalysis[d.prev_list]={count:0,invalid:0,no_answer:0,connected:0};dupAnalysis[d.prev_list].count++;if(d.was_invalid)dupAnalysis[d.prev_list].invalid++;if(d.no_answer>0)dupAnalysis[d.prev_list].no_answer++;if(d.connected>0)dupAnalysis[d.prev_list].connected++;}
  res.json({list_id:lid,...results,quality,detected_columns:{phone:phoneCol,name:nameCol,region:regionCol,all:cols},dup_by_list:Object.entries(dupAnalysis).map(([list,data])=>({list,...data}))});
});

// ── Distribute (enhanced) ──
app.post('/api/customers/distribute',auth(['center_admin']),(req,res)=>{
  const{list_id,mode,agents,percentage=100,specific=null}=req.body;
  const cid=req.user.center_id;
  const center=DB.centers.find(c=>c.id===cid);
  const distMode=mode||center?.dist_mode||'auto';
  const pending=DB.customers.filter(c=>c.list_id===list_id&&!c.agent_name&&c.status==='pending');
  if(!pending.length)return res.json({ok:true,distributed:0,message:'No pending customers'});
  const totalToDist=Math.ceil(pending.length*(percentage/100));
  const pool=pending.slice(0,totalToDist);
  const agentList=agents||DB.users.filter(u=>u.role==='agent'&&u.center_id===cid&&u.is_active).map(u=>u.agent_name);
  if(!agentList.length)return res.status(400).json({error:'No agents'});
  const result={};agentList.forEach(a=>{result[a]=0;});
  if(distMode==='manual'&&specific){
    let idx=0;
    for(const[agent,count]of Object.entries(specific)){if(!agentList.includes(agent))continue;for(let i=0;i<count&&idx<pool.length;i++,idx++){pool[idx].agent_name=agent;result[agent]++;}}
  }else{
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    pool.forEach((c,i)=>{const a=agentList[i%agentList.length];c.agent_name=a;result[a]++;});
  }
  res.json({ok:true,distributed:pool.filter(c=>c.agent_name).length,per_agent:result,remaining:pending.length-totalToDist});
});

// ── Auto Refill ──
app.post('/api/customers/refill',auth(['center_admin']),(req,res)=>{
  const{agent,list_id,amount}=req.body;
  const pool=DB.customers.filter(c=>c.list_id===list_id&&!c.agent_name&&c.status==='pending');
  const toAssign=pool.slice(0,amount);
  toAssign.forEach(c=>{c.agent_name=agent;});
  res.json({ok:true,refilled:toAssign.length,remaining_pool:pool.length-toAssign.length});
});

// ── Queue Status ──
app.get('/api/queue/status/:cid',auth(['center_admin']),(req,res)=>{
  const cid=+req.params.cid;
  const agents=DB.users.filter(u=>u.role==='agent'&&u.center_id===cid&&u.is_active);
  res.json(agents.map(a=>{const p=DB.customers.filter(c=>c.center_id===cid&&c.agent_name===a.agent_name&&c.status==='pending').length;return{agent_name:a.agent_name,pending:p,low:p<50};}));
});

// ── Calls ──
app.post('/api/calls/next',auth(['agent']),(req,res)=>{
  const c=DB.customers.find(x=>x.center_id===req.user.center_id&&x.agent_name===req.user.agent_name&&x.status==='pending');
  if(!c)return res.status(404).json({error:'No more customers'});
  c.status='calling';
  const center=DB.centers.find(x=>x.id===req.user.center_id);
  const masked={...c};
  if(center&&!center.show_phone)masked.phone_number=c.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/,'$1-****-$3');
  res.json(masked);
});
app.post('/api/calls/start',auth(['agent']),(req,res)=>{
  const id=DB._nextId.calls++;
  DB.calls.push({id,customer_id:req.body.customer_id,center_id:req.user.center_id,phone_id:req.user.phone_id,agent_name:req.user.agent_name,result:null,duration_sec:0,started_at:new Date().toISOString()});
  res.json({call_id:id});
});
app.put('/api/calls/:id/end',auth(['agent']),(req,res)=>{
  const call=DB.calls.find(c=>c.id===+req.params.id);if(!call)return res.status(404).json({error:'Not found'});
  const{result,duration_sec,memo}=req.body;
  call.result=result;call.duration_sec=duration_sec||0;call.ended_at=new Date().toISOString();
  const cust=DB.customers.find(c=>c.id===call.customer_id);
  if(cust){
    if(result==='connected'){cust.status='done';if(memo)cust.memo=memo;}
    else if(result==='no_answer'){cust.no_answer_count=(cust.no_answer_count||0)+1;const center=DB.centers.find(c=>c.id===req.user.center_id);cust.status=(center?.auto_check_no_answer&&cust.no_answer_count>=center.no_answer_limit)?'no_answer':'pending';}
    else if(result==='invalid'){cust.status='invalid';}
    else if(result==='signup'){cust.status='done';cust.result_detail='signup';if(memo)cust.memo=memo;}
    else if(result==='interest'){cust.status='done';cust.result_detail='interest';if(memo)cust.memo=memo;}
    else if(result==='callback'){cust.status='pending';cust.result_detail='callback';if(memo)cust.memo=memo;}
    else if(result==='rejected'){cust.status='done';cust.result_detail='rejected';if(memo)cust.memo=memo;}
    else{cust.status='pending';}
  }
  const phone=DB.phones.find(p=>p.id===req.user.phone_id);if(phone)phone.status='idle';
  res.json({ok:true});
});

// ── Inbound Call Matching ──
app.post('/api/calls/inbound',auth(['agent']),(req,res)=>{
  const{phone_number}=req.body;
  if(!phone_number)return res.status(400).json({error:'phone_number required'});
  const cleaned=String(phone_number).replace(/[^0-9]/g,'');
  const formatted=cleaned.length===11?`${cleaned.slice(0,3)}-${cleaned.slice(3,7)}-${cleaned.slice(7)}`:`${cleaned.slice(0,3)}-${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  const cid=req.user.center_id;
  // Find customer in any list for this center
  const cust=DB.customers.find(c=>c.phone_number===formatted&&c.center_id===cid);
  if(!cust)return res.json({matched:false,phone:formatted});
  // Get call history for this customer
  const calls=DB.calls.filter(c=>c.customer_id===cust.id).sort((a,b)=>new Date(b.started_at)-new Date(a.started_at));
  const lastCall=calls[0];
  const list=DB.customer_lists.find(l=>l.id===cust.list_id);
  const center=DB.centers.find(c=>c.id===cid);
  const maskedPhone=center&&!center.show_phone?cust.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/,'$1-****-$3'):cust.phone_number;
  res.json({
    matched:true,
    customer:{id:cust.id,name:cust.name,phone:maskedPhone,phone_raw:cust.phone_number,region:cust.region||null,status:cust.status,no_answer_count:cust.no_answer_count,memo:cust.memo,agent_name:cust.agent_name,list_title:list?.title||''},
    last_call:lastCall?{time:lastCall.started_at,result:lastCall.result,duration:lastCall.duration_sec,agent:lastCall.agent_name}:null,
    call_count:calls.length,
    days_since_last:lastCall?Math.floor((Date.now()-new Date(lastCall.started_at).getTime())/(1000*60*60*24)):null,
  });
});

// ── Inbound Call End (update status from no_answer/pending to new result) ──
app.put('/api/calls/inbound/:custId/end',auth(['agent']),(req,res)=>{
  const cust=DB.customers.find(c=>c.id===+req.params.custId);
  if(!cust)return res.status(404).json({error:'Customer not found'});
  const{result,duration_sec,memo}=req.body;
  // Record the call
  const callId=DB._nextId.calls++;
  DB.calls.push({id:callId,customer_id:cust.id,center_id:req.user.center_id,phone_id:req.user.phone_id,agent_name:req.user.agent_name,result,duration_sec:duration_sec||0,started_at:new Date().toISOString(),ended_at:new Date().toISOString(),is_inbound:true});
  // Update customer status
  const prev=cust.status;
  if(result==='connected'||result==='signup'||result==='interest'){cust.status='done';cust.result_detail=result;}
  else if(result==='callback'){cust.result_detail='callback';}
  else if(result==='rejected'){cust.status='done';cust.result_detail='rejected';}
  if(memo)cust.memo=memo;
  res.json({ok:true,call_id:callId,prev_status:prev,new_status:cust.status});
});

// ── Stats ──
app.get('/api/stats/:cid',auth(['center_admin','super_admin']),(req,res)=>{
  const calls=DB.calls.filter(c=>c.center_id===+req.params.cid);
  res.json({total_calls:calls.length,connected:calls.filter(c=>c.result==='connected').length,no_answer:calls.filter(c=>c.result==='no_answer').length,invalid:calls.filter(c=>c.result==='invalid').length,total_duration:calls.reduce((a,c)=>a+(c.duration_sec||0),0)});
});

// ── Recordings ──
app.get('/api/recordings/:cid',auth(['center_admin']),(req,res)=>{res.json([]);});

// ── Test ──
app.post('/api/test/start',auth(['center_admin']),(req,res)=>{
  const cid=req.user.center_id;const lid=DB._nextId.customer_lists++;
  DB.customer_lists.push({id:lid,center_id:cid,title:'Test 100건',source:'Test',is_test:1,total_count:100,uploaded_at:new Date().toISOString().split('T')[0]});
  const ags=DB.users.filter(u=>u.role==='agent'&&u.center_id===cid).map(u=>u.agent_name);
  for(let i=0;i<100;i++){DB.customers.push({id:DB._nextId.customers++,list_id:lid,center_id:cid,phone_id:null,agent_name:ags[i%ags.length],name:`테스트${i+1}`,phone_number:`010-0000-${String(i).padStart(4,'0')}`,status:'pending',no_answer_count:0,memo:''});}
  res.json({list_id:lid});
});
app.post('/api/test/stop',auth(['center_admin']),(req,res)=>{
  const testLists=DB.customer_lists.filter(l=>l.center_id===req.user.center_id&&l.is_test);
  testLists.forEach(l=>{DB.customers=DB.customers.filter(c=>c.list_id!==l.id);DB.calls=DB.calls.filter(c=>!DB.customers.find(x=>x.id===c.customer_id&&x.list_id===l.id));});
  DB.customer_lists=DB.customer_lists.filter(l=>!(l.center_id===req.user.center_id&&l.is_test));
  res.json({ok:true});
});

// ── Static ──
app.use(express.static(join(__dirname,'dist')));
app.get('*',(req,res)=>res.sendFile(join(__dirname,'dist','index.html')));

app.listen(PORT,'0.0.0.0',()=>console.log(`TM Platform on port ${PORT}`));
