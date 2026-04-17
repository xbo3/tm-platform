import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tm-platform-secret-2026';
const DB_FILE = join(__dirname, 'data.json');

// ── JSON DB ──
let DB = { users: [], centers: [], phones: [], customer_lists: [], customers: [], calls: [], recordings: [], _id: 100 };
const nextId = () => ++DB._id;
const save = () => { try { writeFileSync(DB_FILE, JSON.stringify(DB)); } catch(e) { console.error('Save error:', e); } };
const load = () => { try { if (existsSync(DB_FILE)) DB = JSON.parse(readFileSync(DB_FILE, 'utf8')); } catch(e) { console.error('Load error:', e); } };
load();

// ── Seed ──
if (DB.users.length === 0) {
  const hash = bcrypt.hashSync('1234', 10);
  const now = new Date().toISOString();

  DB.users.push({ id: nextId(), email: 'admin@tm.kr', password: hash, name: '슈퍼관리자', role: 'super_admin', center_id: null, phone_id: null, agent_name: null, is_active: 1, created_at: now });
  DB.centers.push({ id: nextId(), name: '서울 강남센터', owner_id: null, dist_mode: 'auto', show_phone: 0, plan: 'premium', auto_check_no_answer: 1, auto_check_invalid: 1, no_answer_limit: 3, is_active: 1, created_at: now });
  const centerId = DB.centers[0].id;
  DB.users.push({ id: nextId(), email: 'center@tm.kr', password: hash, name: '김센터장', role: 'center_admin', center_id: centerId, phone_id: null, agent_name: null, is_active: 1, created_at: now });
  DB.centers[0].owner_id = DB.users[1].id;

  ['A','B','C','D','E'].forEach((a, i) => {
    const phoneId = nextId();
    DB.phones.push({ id: phoneId, center_id: centerId, sip_account: `200${i+1}`, status: i%2===0?'calling':'idle', is_active: 1 });
    DB.users.push({ id: nextId(), email: `agent${a.toLowerCase()}@tm.kr`, password: hash, name: `상담원${a}`, role: 'agent', center_id: centerId, phone_id: phoneId, agent_name: a, is_active: 1, created_at: now });
  });

  const listId = nextId();
  DB.customer_lists.push({ id: listId, center_id: centerId, title: '김사장 DB 4월', source: '김사장', is_test: 0, total_count: 50, uploaded_at: now });

  const names=['홍길동','김철수','이영희','박민수','최지현','정수빈','강하늘','윤서연','조현우','한소희'];
  const phones=['010-1234-5678','010-2345-6789','010-3456-7890','010-4567-8901','010-5678-9012','010-6789-0123','010-7890-1234','010-8901-2345','010-9012-3456','010-0123-4567'];
  names.forEach((n, i) => {
    DB.customers.push({ id: nextId(), list_id: listId, center_id: centerId, phone_id: null, agent_name: ['A','B','C','D','E'][i%5], name: n, phone_number: phones[i], status: 'pending', no_answer_count: 0, memo: '', created_at: now, updated_at: now });
  });
  for (let i=0;i<40;i++) {
    DB.customers.push({ id: nextId(), list_id: listId, center_id: centerId, phone_id: null, agent_name: ['A','B','C','D','E'][i%5], name: `고객${i+11}`, phone_number: `010-${String(1000+i).padStart(4,'0')}-${String(5000+i).padStart(4,'0')}`, status: 'pending', no_answer_count: 0, memo: '', created_at: now, updated_at: now });
  }
  save();
}

// ── Express ──
const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500 }));

const auth = (roles=[]) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' }); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// ── Auth ──
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = DB.users.find(u => u.email === email && u.is_active);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, center_id: user.center_id, phone_id: user.phone_id, agent_name: user.agent_name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, center_id: user.center_id, agent_name: user.agent_name } });
});
app.post('/api/auth/logout', (_, res) => res.json({ ok: true }));
app.get('/api/auth/me', auth(), (req, res) => { const u = DB.users.find(x => x.id === req.user.id); res.json(u ? { id: u.id, email: u.email, name: u.name, role: u.role, center_id: u.center_id, agent_name: u.agent_name } : null); });

// ── Centers ──
app.get('/api/centers', auth(['super_admin']), (_, res) => {
  res.json(DB.centers.map(c => {
    const owner = DB.users.find(u => u.id === c.owner_id);
    const todayCalls = DB.calls.filter(x => x.center_id === c.id).length;
    const todayConn = DB.calls.filter(x => x.center_id === c.id && x.result === 'connected').length;
    return { ...c, owner_name: owner?.name || '-', phone_count: DB.phones.filter(p => p.center_id === c.id).length, today_calls: todayCalls, today_connected: todayConn, connect_rate: todayCalls > 0 ? ((todayConn/todayCalls)*100).toFixed(1) : '0.0' };
  }));
});
app.post('/api/centers', auth(['super_admin']), (req, res) => {
  const { name, admin_email, admin_name, phone_count=5, plan='basic' } = req.body;
  const hash = bcrypt.hashSync('1234', 10); const now = new Date().toISOString();
  const center = { id: nextId(), name, owner_id: null, dist_mode: 'auto', show_phone: 0, plan, auto_check_no_answer: 1, auto_check_invalid: 1, no_answer_limit: 3, is_active: 1, created_at: now };
  DB.centers.push(center);
  const admin = { id: nextId(), email: admin_email, password: hash, name: admin_name, role: 'center_admin', center_id: center.id, phone_id: null, agent_name: null, is_active: 1, created_at: now };
  DB.users.push(admin); center.owner_id = admin.id;
  for (let i=0; i<phone_count; i++) {
    const ph = { id: nextId(), center_id: center.id, sip_account: `${2000+center.id*10+i+1}`, status: 'idle', is_active: 1 };
    DB.phones.push(ph);
    const ag = String.fromCharCode(65+i);
    DB.users.push({ id: nextId(), email: `agent${ag.toLowerCase()}_c${center.id}@tm.kr`, password: hash, name: `상담원${ag}`, role: 'agent', center_id: center.id, phone_id: ph.id, agent_name: ag, is_active: 1, created_at: now });
  }
  save(); res.json({ id: center.id });
});
app.put('/api/centers/:id', auth(['super_admin','center_admin']), (req, res) => {
  const c = DB.centers.find(x => x.id === parseInt(req.params.id)); if (!c) return res.status(404).json({ error: 'Not found' });
  Object.keys(req.body).forEach(k => { if (k in c) c[k] = req.body[k]; }); save(); res.json({ ok: true });
});

// ── Dashboard ──
app.get('/api/dashboard/:cid', auth(['center_admin','super_admin']), (req, res) => {
  const cid = parseInt(req.params.cid);
  const center = DB.centers.find(c => c.id === cid) || {};
  const agentUsers = DB.users.filter(u => u.role === 'agent' && u.center_id === cid && u.is_active);
  const agents = agentUsers.map(u => {
    const phone = DB.phones.find(p => p.id === u.phone_id) || {};
    const myCalls = DB.calls.filter(c => c.agent_name === u.agent_name && c.center_id === cid);
    const myCusts = DB.customers.filter(c => c.agent_name === u.agent_name && c.center_id === cid);
    return {
      agent_name: u.agent_name, phone_id: u.phone_id, sip_account: phone.sip_account, status: phone.status || 'idle',
      total_calls: myCalls.length, connected: myCalls.filter(c => c.result === 'connected').length,
      no_answer: myCalls.filter(c => c.result === 'no_answer').length, invalid_count: myCalls.filter(c => c.result === 'invalid').length,
      talk_time: myCalls.reduce((a, c) => a + (c.duration_sec || 0), 0), pending: myCusts.filter(c => c.status === 'pending').length,
      na1: myCusts.filter(c => c.no_answer_count === 1).length, na2: myCusts.filter(c => c.no_answer_count === 2).length, na3: myCusts.filter(c => c.no_answer_count >= 3).length,
    };
  });
  const lists = DB.customer_lists.filter(l => l.center_id === cid).map(l => {
    const custs = DB.customers.filter(c => c.list_id === l.id);
    const used = custs.filter(c => c.status !== 'pending').length;
    const done = custs.filter(c => c.status === 'done').length;
    const inv = custs.filter(c => c.status === 'invalid').length;
    return { ...l, total: custs.length, used, done_count: done, invalid_count: inv, na_count: custs.filter(c => c.status === 'no_answer').length, remaining: custs.filter(c => c.status === 'pending').length, connect_rate: used > 0 ? ((done/used)*100).toFixed(1) : '0.0', invalid_rate: used > 0 ? ((inv/used)*100).toFixed(1) : '0.0' };
  });
  res.json({ center, agents, lists });
});

// ── Lists ──
app.get('/api/lists/:cid', auth(['center_admin']), (req, res) => {
  const cid = parseInt(req.params.cid);
  res.json(DB.customer_lists.filter(l => l.center_id === cid).map(l => {
    const custs = DB.customers.filter(c => c.list_id === l.id);
    const used = custs.filter(c => c.status !== 'pending').length;
    const done = custs.filter(c => c.status === 'done').length;
    const inv = custs.filter(c => c.status === 'invalid').length;
    const agentNames = [...new Set(custs.map(c => c.agent_name).filter(Boolean))];
    return { ...l, total: custs.length, used, connected: done, invalid_count: inv, remaining: custs.filter(c => c.status === 'pending').length,
      connect_rate: used > 0 ? ((done/used)*100).toFixed(1) : '0.0', invalid_rate: used > 0 ? ((inv/used)*100).toFixed(1) : '0.0',
      agents: agentNames.map(n => { const ac = custs.filter(c => c.agent_name === n); return { agent_name: n, distributed: ac.length, used: ac.filter(c => c.status !== 'pending').length, remaining: ac.filter(c => c.status === 'pending').length, connected: ac.filter(c => c.status === 'done').length, no_answer: ac.filter(c => c.status === 'no_answer').length, invalid_count: ac.filter(c => c.status === 'invalid').length }; })
    };
  }));
});

// ── Upload ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });
app.post('/api/customers/upload', auth(['center_admin']), upload.single('file'), async (req, res) => {
  try {
    const { title, source, is_test } = req.body; const cid = req.user.center_id;
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const XLSX = await import('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const listId = nextId(); const now = new Date().toISOString();
    DB.customer_lists.push({ id: listId, center_id: cid, title: title || 'Untitled', source: source || '', is_test: is_test === '1' ? 1 : 0, total_count: data.length, uploaded_at: now });
    const agents = DB.users.filter(u => u.center_id === cid && u.role === 'agent' && u.is_active).map(u => u.agent_name);
    data.forEach((row, i) => {
      const phone = String(row['전화번호'] || row['phone'] || Object.values(row)[1] || '').trim();
      const name = String(row['이름'] || row['name'] || Object.values(row)[0] || '').trim();
      if (!phone) return;
      DB.customers.push({ id: nextId(), list_id: listId, center_id: cid, phone_id: null, agent_name: agents.length ? agents[i % agents.length] : null, name, phone_number: phone, status: 'pending', no_answer_count: 0, memo: '', created_at: now, updated_at: now });
    });
    save(); res.json({ id: listId, count: data.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Distribute ──
app.post('/api/customers/distribute', auth(['center_admin']), (req, res) => {
  const { list_id, distribution } = req.body;
  Object.entries(distribution).forEach(([agent, count]) => {
    let assigned = 0;
    DB.customers.forEach(c => { if (c.list_id === list_id && !c.agent_name && c.status === 'pending' && assigned < count) { c.agent_name = agent; assigned++; } });
  });
  save(); res.json({ ok: true });
});

// ── Customers ──
app.get('/api/customers', auth(['center_admin']), (req, res) => {
  let custs = DB.customers.filter(c => c.center_id === req.user.center_id);
  if (req.query.list_id) custs = custs.filter(c => c.list_id === parseInt(req.query.list_id));
  if (req.query.status) custs = custs.filter(c => c.status === req.query.status);
  res.json(custs.slice(-200).reverse());
});

// ── Calls ──
app.post('/api/calls/next', auth(['agent']), (req, res) => {
  const c = DB.customers.find(x => x.center_id === req.user.center_id && x.agent_name === req.user.agent_name && x.status === 'pending');
  if (!c) return res.status(404).json({ error: 'No more customers' });
  const center = DB.centers.find(x => x.id === req.user.center_id);
  c.status = 'calling'; c.updated_at = new Date().toISOString();
  const phone = DB.phones.find(p => p.id === req.user.phone_id); if (phone) phone.status = 'calling';
  save();
  const result = { ...c };
  if (center && !center.show_phone) result.phone_number = result.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3');
  res.json(result);
});
app.post('/api/calls/start', auth(['agent']), (req, res) => {
  const call = { id: nextId(), customer_id: req.body.customer_id, center_id: req.user.center_id, phone_id: req.user.phone_id, agent_name: req.user.agent_name, result: null, duration_sec: 0, started_at: new Date().toISOString(), ended_at: null };
  DB.calls.push(call); save(); res.json({ call_id: call.id });
});
app.put('/api/calls/:id/end', auth(['agent']), (req, res) => {
  const call = DB.calls.find(c => c.id === parseInt(req.params.id)); if (!call) return res.status(404).json({ error: 'Not found' });
  const { result, duration_sec, memo } = req.body;
  call.result = result; call.duration_sec = duration_sec || 0; call.ended_at = new Date().toISOString();
  const cust = DB.customers.find(c => c.id === call.customer_id);
  if (cust) {
    if (result === 'connected') { cust.status = 'done'; if (memo) cust.memo = memo; }
    else if (result === 'no_answer') { cust.no_answer_count = (cust.no_answer_count || 0) + 1; const center = DB.centers.find(x => x.id === req.user.center_id); cust.status = (center?.auto_check_no_answer && cust.no_answer_count >= (center?.no_answer_limit || 3)) ? 'no_answer' : 'retry'; }
    else if (result === 'invalid') { cust.status = 'invalid'; }
    else { cust.status = 'retry'; }
    cust.updated_at = new Date().toISOString();
  }
  const phone = DB.phones.find(p => p.id === req.user.phone_id); if (phone) phone.status = 'idle';
  save(); res.json({ ok: true });
});

// ── Stats ──
app.get('/api/stats/:cid', auth(['center_admin','super_admin']), (req, res) => {
  const cid = parseInt(req.params.cid);
  const calls = DB.calls.filter(c => c.center_id === cid);
  res.json({ total_calls: calls.length, connected: calls.filter(c => c.result === 'connected').length, no_answer: calls.filter(c => c.result === 'no_answer').length, invalid: calls.filter(c => c.result === 'invalid').length, total_duration: calls.reduce((a, c) => a + (c.duration_sec || 0), 0) });
});

// ── Recordings ──
app.get('/api/recordings/:cid', auth(['center_admin']), (req, res) => { res.json(DB.recordings.filter(r => r.center_id === parseInt(req.params.cid))); });

// ── Test ──
app.post('/api/test/start', auth(['center_admin']), (req, res) => {
  const cid = req.user.center_id; const now = new Date().toISOString(); const listId = nextId();
  DB.customer_lists.push({ id: listId, center_id: cid, title: 'Test 100건', source: 'Test', is_test: 1, total_count: 100, uploaded_at: now });
  const agents = DB.users.filter(u => u.center_id === cid && u.role === 'agent' && u.is_active).map(u => u.agent_name);
  for (let i=0; i<100; i++) DB.customers.push({ id: nextId(), list_id: listId, center_id: cid, phone_id: null, agent_name: agents[i%agents.length] || null, name: `테스트${i+1}`, phone_number: `010-0000-${String(i).padStart(4,'0')}`, status: 'pending', no_answer_count: 0, memo: '', created_at: now, updated_at: now });
  save(); res.json({ list_id: listId });
});
app.post('/api/test/stop', auth(['center_admin']), (req, res) => {
  const cid = req.user.center_id;
  const testLists = DB.customer_lists.filter(l => l.center_id === cid && l.is_test);
  testLists.forEach(l => { DB.customers = DB.customers.filter(c => c.list_id !== l.id); DB.calls = DB.calls.filter(c => !DB.customers.find(x => x.id === c.customer_id && x.list_id === l.id)); });
  DB.customer_lists = DB.customer_lists.filter(l => !(l.center_id === cid && l.is_test));
  save(); res.json({ ok: true });
});

// ── Static ──
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (_, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`TM Platform on port ${PORT}`));
