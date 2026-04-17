import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tm-platform-secret-2026-change-in-production';

// ── DB Setup ──
const db = new Database(process.env.DB_PATH || join(__dirname, 'tm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT CHECK(role IN ('super_admin','center_admin','agent')) NOT NULL,
    center_id INTEGER REFERENCES centers(id),
    phone_id INTEGER REFERENCES phones(id),
    agent_name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS centers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id),
    dist_mode TEXT DEFAULT 'auto' CHECK(dist_mode IN ('auto','manual')),
    show_phone INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'basic' CHECK(plan IN ('basic','premium')),
    auto_check_no_answer INTEGER DEFAULT 1,
    auto_check_invalid INTEGER DEFAULT 1,
    no_answer_limit INTEGER DEFAULT 3,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    center_id INTEGER REFERENCES centers(id) NOT NULL,
    sip_account TEXT NOT NULL,
    status TEXT DEFAULT 'idle' CHECK(status IN ('idle','calling','busy')),
    is_active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS customer_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    center_id INTEGER REFERENCES centers(id) NOT NULL,
    title TEXT NOT NULL,
    source TEXT,
    is_test INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER REFERENCES customer_lists(id) NOT NULL,
    center_id INTEGER REFERENCES centers(id) NOT NULL,
    phone_id INTEGER REFERENCES phones(id),
    agent_name TEXT,
    name TEXT,
    phone_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','calling','done','no_answer','invalid','retry')),
    no_answer_count INTEGER DEFAULT 0,
    memo TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    center_id INTEGER REFERENCES centers(id),
    phone_id INTEGER REFERENCES phones(id),
    agent_name TEXT,
    result TEXT CHECK(result IN ('connected','no_answer','busy','failed','invalid')),
    duration_sec INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER REFERENCES calls(id),
    center_id INTEGER REFERENCES centers(id),
    file_path TEXT,
    file_size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_customers_center ON customers(center_id);
  CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
  CREATE INDEX IF NOT EXISTS idx_customers_agent ON customers(agent_name);
  CREATE INDEX IF NOT EXISTS idx_calls_center ON calls(center_id);
  CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_name);
`);

// ── Seed Data ──
const seedIfEmpty = () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  const hash = bcrypt.hashSync('1234', 10);

  // Super admin
  db.prepare('INSERT INTO users (email,password,name,role) VALUES (?,?,?,?)').run('admin@tm.kr', hash, '슈퍼관리자', 'super_admin');

  // Center
  db.prepare('INSERT INTO centers (name,plan) VALUES (?,?)').run('서울 강남센터', 'premium');
  db.prepare('UPDATE centers SET owner_id=2 WHERE id=1');

  // Center admin
  db.prepare('INSERT INTO users (email,password,name,role,center_id) VALUES (?,?,?,?,?)').run('center@tm.kr', hash, '김센터장', 'center_admin', 1);
  db.prepare('UPDATE centers SET owner_id=2 WHERE id=1').run();

  // Phones + Agents
  const agents = ['A','B','C','D','E'];
  agents.forEach((a, i) => {
    db.prepare('INSERT INTO phones (center_id,sip_account) VALUES (?,?)').run(1, `200${i+1}`);
    db.prepare('INSERT INTO users (email,password,name,role,center_id,phone_id,agent_name) VALUES (?,?,?,?,?,?,?)').run(
      `agent${a.toLowerCase()}@tm.kr`, hash, `상담원${a}`, 'agent', 1, i+1, a
    );
  });

  // Sample customer list
  db.prepare('INSERT INTO customer_lists (center_id,title,source,total_count) VALUES (?,?,?,?)').run(1, '김사장 DB 4월', '김사장', 50);

  // Sample customers
  const names = ['홍길동','김철수','이영희','박민수','최지현','정수빈','강하늘','윤서연','조현우','한소희'];
  const phones = ['010-1234-5678','010-2345-6789','010-3456-7890','010-4567-8901','010-5678-9012','010-6789-0123','010-7890-1234','010-8901-2345','010-9012-3456','010-0123-4567'];
  names.forEach((n, i) => {
    const agent = agents[i % 5];
    db.prepare('INSERT INTO customers (list_id,center_id,phone_id,agent_name,name,phone_number,status) VALUES (?,?,?,?,?,?,?)').run(
      1, 1, (i%5)+1, agent, n, phones[i], 'pending'
    );
  });

  // More customers for bulk
  for (let i = 0; i < 40; i++) {
    const agent = agents[i % 5];
    db.prepare('INSERT INTO customers (list_id,center_id,phone_id,agent_name,name,phone_number) VALUES (?,?,?,?,?,?)').run(
      1, 1, (i%5)+1, agent, `고객${i+11}`, `010-${String(1000+i).padStart(4,'0')}-${String(5000+i).padStart(4,'0')}`
    );
  }
};
seedIfEmpty();

// ── Express App ──
const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15*60*1000, max: 500, message: { error: 'Too many requests' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Too many login attempts' } });

// ── Auth Middleware ──
const auth = (roles = []) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    if (roles.length && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// ── Auth Routes ──
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, center_id: user.center_id, phone_id: user.phone_id, agent_name: user.agent_name }, JWT_SECRET, { expiresIn: '24h' });

  res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 86400000 });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, center_id: user.center_id, agent_name: user.agent_name } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', auth(), (req, res) => {
  const user = db.prepare('SELECT id,email,name,role,center_id,phone_id,agent_name FROM users WHERE id=?').get(req.user.id);
  res.json(user);
});

// ── Centers ──
app.get('/api/centers', auth(['super_admin']), (req, res) => {
  const centers = db.prepare(`
    SELECT c.*, u.name as owner_name,
      (SELECT COUNT(*) FROM phones WHERE center_id=c.id) as phone_count,
      (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND date(started_at)=date('now')) as today_calls,
      (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND date(started_at)=date('now') AND result='connected') as today_connected
    FROM centers c LEFT JOIN users u ON c.owner_id=u.id
  `).all();
  centers.forEach(c => { c.connect_rate = c.today_calls > 0 ? ((c.today_connected/c.today_calls)*100).toFixed(1) : '0.0'; });
  res.json(centers);
});

app.post('/api/centers', auth(['super_admin']), (req, res) => {
  const { name, admin_email, admin_name, phone_count = 5, plan = 'basic' } = req.body;
  if (!name || !admin_email || !admin_name) return res.status(400).json({ error: 'Missing fields' });

  const hash = bcrypt.hashSync('1234', 10);
  const tx = db.transaction(() => {
    const center = db.prepare('INSERT INTO centers (name,plan) VALUES (?,?)').run(name, plan);
    const admin = db.prepare('INSERT INTO users (email,password,name,role,center_id) VALUES (?,?,?,?,?)').run(admin_email, hash, admin_name, 'center_admin', center.lastInsertRowid);
    db.prepare('UPDATE centers SET owner_id=? WHERE id=?').run(admin.lastInsertRowid, center.lastInsertRowid);

    for (let i = 0; i < phone_count; i++) {
      const phoneRow = db.prepare('INSERT INTO phones (center_id,sip_account) VALUES (?,?)').run(center.lastInsertRowid, `${2000 + center.lastInsertRowid * 10 + i + 1}`);
      const agentName = String.fromCharCode(65 + i);
      db.prepare('INSERT INTO users (email,password,name,role,center_id,phone_id,agent_name) VALUES (?,?,?,?,?,?,?)').run(
        `agent${agentName.toLowerCase()}_c${center.lastInsertRowid}@tm.kr`, hash, `상담원${agentName}`, 'agent', center.lastInsertRowid, phoneRow.lastInsertRowid, agentName
      );
    }
    return center.lastInsertRowid;
  });
  const centerId = tx();
  res.json({ id: centerId, message: 'Center created' });
});

app.put('/api/centers/:id', auth(['super_admin', 'center_admin']), (req, res) => {
  const { dist_mode, show_phone, plan, auto_check_no_answer, auto_check_invalid, no_answer_limit } = req.body;
  const fields = []; const vals = [];
  if (dist_mode !== undefined) { fields.push('dist_mode=?'); vals.push(dist_mode); }
  if (show_phone !== undefined) { fields.push('show_phone=?'); vals.push(show_phone ? 1 : 0); }
  if (plan !== undefined) { fields.push('plan=?'); vals.push(plan); }
  if (auto_check_no_answer !== undefined) { fields.push('auto_check_no_answer=?'); vals.push(auto_check_no_answer ? 1 : 0); }
  if (auto_check_invalid !== undefined) { fields.push('auto_check_invalid=?'); vals.push(auto_check_invalid ? 1 : 0); }
  if (no_answer_limit !== undefined) { fields.push('no_answer_limit=?'); vals.push(no_answer_limit); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE centers SET ${fields.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

// ── Dashboard Stats ──
app.get('/api/dashboard/:centerId', auth(['center_admin', 'super_admin']), (req, res) => {
  const cid = req.params.centerId;
  const center = db.prepare('SELECT * FROM centers WHERE id=?').get(cid);

  // Agent stats
  const agents = db.prepare(`
    SELECT u.agent_name, u.phone_id, p.sip_account, p.status,
      (SELECT COUNT(*) FROM calls WHERE agent_name=u.agent_name AND center_id=? AND date(started_at)=date('now')) as total_calls,
      (SELECT COUNT(*) FROM calls WHERE agent_name=u.agent_name AND center_id=? AND result='connected' AND date(started_at)=date('now')) as connected,
      (SELECT COUNT(*) FROM calls WHERE agent_name=u.agent_name AND center_id=? AND result='no_answer' AND date(started_at)=date('now')) as no_answer,
      (SELECT COUNT(*) FROM calls WHERE agent_name=u.agent_name AND center_id=? AND result='invalid' AND date(started_at)=date('now')) as invalid_count,
      (SELECT COALESCE(SUM(duration_sec),0) FROM calls WHERE agent_name=u.agent_name AND center_id=? AND date(started_at)=date('now')) as talk_time,
      (SELECT COUNT(*) FROM customers WHERE agent_name=u.agent_name AND center_id=? AND status='pending') as pending,
      (SELECT COUNT(*) FROM customers WHERE agent_name=u.agent_name AND center_id=? AND status='no_answer' AND no_answer_count=1) as na1,
      (SELECT COUNT(*) FROM customers WHERE agent_name=u.agent_name AND center_id=? AND status='no_answer' AND no_answer_count=2) as na2,
      (SELECT COUNT(*) FROM customers WHERE agent_name=u.agent_name AND center_id=? AND status='no_answer' AND no_answer_count>=3) as na3
    FROM users u JOIN phones p ON u.phone_id=p.id
    WHERE u.role='agent' AND u.center_id=? AND u.is_active=1
  `).all(cid, cid, cid, cid, cid, cid, cid, cid, cid, cid);

  // DB quality
  const lists = db.prepare(`
    SELECT cl.*,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id) as total,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status!='pending') as used,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='done') as done_count,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='invalid') as invalid_count,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='no_answer') as na_count,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='pending') as remaining
    FROM customer_lists cl WHERE cl.center_id=?
  `).all(cid);
  lists.forEach(l => {
    l.connect_rate = l.used > 0 ? ((l.done_count / l.used) * 100).toFixed(1) : '0.0';
    l.invalid_rate = l.used > 0 ? ((l.invalid_count / l.used) * 100).toFixed(1) : '0.0';
  });

  // Hourly stats
  const hourly = db.prepare(`
    SELECT strftime('%H', started_at) as hour, agent_name,
      COUNT(*) as calls, SUM(CASE WHEN result='connected' THEN 1 ELSE 0 END) as connected
    FROM calls WHERE center_id=? AND date(started_at)=date('now')
    GROUP BY hour, agent_name ORDER BY hour
  `).all(cid);

  res.json({ center, agents, lists, hourly });
});

// ── Customer Lists ──
app.get('/api/lists/:centerId', auth(['center_admin']), (req, res) => {
  const lists = db.prepare(`
    SELECT cl.*,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id) as total,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status!='pending') as used,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='done') as connected,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='invalid') as invalid_count,
      (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='pending') as remaining
    FROM customer_lists cl WHERE cl.center_id=? ORDER BY cl.uploaded_at DESC
  `).all(req.params.centerId);
  lists.forEach(l => {
    l.connect_rate = l.used > 0 ? ((l.connected / l.used) * 100).toFixed(1) : '0.0';
    l.invalid_rate = l.used > 0 ? ((l.invalid_count / l.used) * 100).toFixed(1) : '0.0';
    // Per agent breakdown
    l.agents = db.prepare(`
      SELECT agent_name,
        COUNT(*) as distributed,
        SUM(CASE WHEN status!='pending' THEN 1 ELSE 0 END) as used,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as remaining,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as connected,
        SUM(CASE WHEN status='no_answer' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN status='invalid' THEN 1 ELSE 0 END) as invalid_count
      FROM customers WHERE list_id=? AND agent_name IS NOT NULL GROUP BY agent_name
    `).all(l.id);
  });
  res.json(lists);
});

// ── Upload Excel ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/customers/upload', auth(['center_admin']), upload.single('file'), async (req, res) => {
  try {
    const { title, source, is_test } = req.body;
    const centerId = req.user.center_id;
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const XLSX = await import('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    if (!data.length) return res.status(400).json({ error: 'Empty file' });

    const tx = db.transaction(() => {
      const list = db.prepare('INSERT INTO customer_lists (center_id,title,source,is_test,total_count) VALUES (?,?,?,?,?)').run(centerId, title || 'Untitled', source || '', is_test ? 1 : 0, data.length);

      const agents = db.prepare("SELECT agent_name FROM users WHERE center_id=? AND role='agent' AND is_active=1 ORDER BY agent_name").all(centerId);
      const insert = db.prepare('INSERT INTO customers (list_id,center_id,agent_name,name,phone_number) VALUES (?,?,?,?,?)');

      data.forEach((row, i) => {
        const phone = String(row['전화번호'] || row['phone'] || row['Phone'] || Object.values(row)[1] || '').trim();
        const name = String(row['이름'] || row['name'] || row['Name'] || Object.values(row)[0] || '').trim();
        if (!phone) return;
        const agent = agents.length ? agents[i % agents.length].agent_name : null;
        insert.run(list.lastInsertRowid, centerId, agent, name, phone);
      });
      return { id: list.lastInsertRowid, count: data.length };
    });
    const result = tx();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Distribute ──
app.post('/api/customers/distribute', auth(['center_admin']), (req, res) => {
  const { list_id, distribution } = req.body; // distribution: { A: 20, B: 20, ... }
  if (!list_id || !distribution) return res.status(400).json({ error: 'Missing data' });

  const tx = db.transaction(() => {
    Object.entries(distribution).forEach(([agent, count]) => {
      const pending = db.prepare('SELECT id FROM customers WHERE list_id=? AND agent_name IS NULL AND status=? LIMIT ?').all(list_id, 'pending', count);
      pending.forEach(c => {
        db.prepare('UPDATE customers SET agent_name=? WHERE id=?').run(agent, c.id);
      });
    });
  });
  tx();
  res.json({ ok: true });
});

// ── Customers ──
app.get('/api/customers', auth(['center_admin']), (req, res) => {
  const { list_id, status, agent } = req.query;
  let sql = 'SELECT * FROM customers WHERE center_id=?';
  const params = [req.user.center_id];
  if (list_id) { sql += ' AND list_id=?'; params.push(list_id); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (agent) { sql += ' AND agent_name=?'; params.push(agent); }
  sql += ' ORDER BY id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

// ── Calls ──
app.post('/api/calls/next', auth(['agent']), (req, res) => {
  const centerId = req.user.center_id;
  const agent = req.user.agent_name;
  const customer = db.prepare('SELECT * FROM customers WHERE center_id=? AND agent_name=? AND status=? LIMIT 1').get(centerId, agent, 'pending');
  if (!customer) return res.status(404).json({ error: 'No more customers' });

  // Check center settings for phone masking
  const center = db.prepare('SELECT show_phone FROM centers WHERE id=?').get(centerId);
  if (!center.show_phone) {
    customer.phone_number = customer.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3');
  }

  db.prepare('UPDATE customers SET status=? WHERE id=?').run('calling', customer.id);
  db.prepare("UPDATE phones SET status='calling' WHERE id=?").run(req.user.phone_id);
  res.json(customer);
});

app.post('/api/calls/start', auth(['agent']), (req, res) => {
  const { customer_id } = req.body;
  const call = db.prepare('INSERT INTO calls (customer_id,center_id,phone_id,agent_name) VALUES (?,?,?,?)').run(
    customer_id, req.user.center_id, req.user.phone_id, req.user.agent_name
  );
  res.json({ call_id: call.lastInsertRowid });
});

app.put('/api/calls/:id/end', auth(['agent']), (req, res) => {
  const { result, duration_sec, memo } = req.body;
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  db.prepare('UPDATE calls SET result=?, duration_sec=?, ended_at=CURRENT_TIMESTAMP WHERE id=?').run(result, duration_sec || 0, req.params.id);

  // Update customer status
  if (result === 'connected') {
    db.prepare('UPDATE customers SET status=?, memo=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run('done', memo || '', call.customer_id);
  } else if (result === 'no_answer') {
    const cust = db.prepare('SELECT no_answer_count FROM customers WHERE id=?').get(call.customer_id);
    const newCount = (cust?.no_answer_count || 0) + 1;
    const center = db.prepare('SELECT no_answer_limit, auto_check_no_answer FROM centers WHERE id=?').get(req.user.center_id);
    const newStatus = (center.auto_check_no_answer && newCount >= center.no_answer_limit) ? 'no_answer' : 'retry';
    db.prepare('UPDATE customers SET status=?, no_answer_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newStatus, newCount, call.customer_id);
  } else if (result === 'invalid') {
    db.prepare("UPDATE customers SET status='invalid', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(call.customer_id);
  } else {
    db.prepare("UPDATE customers SET status='retry', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(call.customer_id);
  }

  db.prepare("UPDATE phones SET status='idle' WHERE id=?").run(req.user.phone_id);
  if (memo) db.prepare('UPDATE customers SET memo=? WHERE id=?').run(memo, call.customer_id);
  res.json({ ok: true });
});

// ── Stats ──
app.get('/api/stats/:centerId', auth(['center_admin', 'super_admin']), (req, res) => {
  const cid = req.params.centerId;
  const stats = {
    total_calls: db.prepare("SELECT COUNT(*) as c FROM calls WHERE center_id=? AND date(started_at)=date('now')").get(cid).c,
    connected: db.prepare("SELECT COUNT(*) as c FROM calls WHERE center_id=? AND result='connected' AND date(started_at)=date('now')").get(cid).c,
    no_answer: db.prepare("SELECT COUNT(*) as c FROM calls WHERE center_id=? AND result='no_answer' AND date(started_at)=date('now')").get(cid).c,
    invalid: db.prepare("SELECT COUNT(*) as c FROM calls WHERE center_id=? AND result='invalid' AND date(started_at)=date('now')").get(cid).c,
    total_duration: db.prepare("SELECT COALESCE(SUM(duration_sec),0) as s FROM calls WHERE center_id=? AND date(started_at)=date('now')").get(cid).s,
  };
  stats.connect_rate = stats.total_calls > 0 ? ((stats.connected / stats.total_calls) * 100).toFixed(1) : '0.0';
  res.json(stats);
});

// ── Recordings ──
app.get('/api/recordings/:centerId', auth(['center_admin']), (req, res) => {
  const recs = db.prepare(`
    SELECT r.*, c.agent_name, cu.name as customer_name, cu.phone_number
    FROM recordings r
    JOIN calls c ON r.call_id=c.id
    JOIN customers cu ON c.customer_id=cu.id
    WHERE r.center_id=? ORDER BY r.created_at DESC LIMIT 100
  `).all(req.params.centerId);
  res.json(recs);
});

// ── Test Mode ──
app.post('/api/test/start', auth(['center_admin']), (req, res) => {
  const centerId = req.user.center_id;
  const tx = db.transaction(() => {
    const list = db.prepare('INSERT INTO customer_lists (center_id,title,source,is_test,total_count) VALUES (?,?,?,?,?)').run(centerId, 'Test 100건', 'Test', 1, 100);
    const agents = db.prepare("SELECT agent_name FROM users WHERE center_id=? AND role='agent' AND is_active=1 ORDER BY agent_name").all(centerId);
    const insert = db.prepare('INSERT INTO customers (list_id,center_id,agent_name,name,phone_number,status) VALUES (?,?,?,?,?,?)');
    for (let i = 0; i < 100; i++) {
      const agent = agents.length ? agents[i % agents.length].agent_name : null;
      insert.run(list.lastInsertRowid, centerId, agent, `테스트${i+1}`, `010-0000-${String(i).padStart(4,'0')}`, 'pending');
    }
    return list.lastInsertRowid;
  });
  const listId = tx();
  res.json({ list_id: listId });
});

app.post('/api/test/stop', auth(['center_admin']), (req, res) => {
  const centerId = req.user.center_id;
  const lists = db.prepare('SELECT id FROM customer_lists WHERE center_id=? AND is_test=1').all(centerId);
  lists.forEach(l => {
    db.prepare('DELETE FROM calls WHERE customer_id IN (SELECT id FROM customers WHERE list_id=?)').run(l.id);
    db.prepare('DELETE FROM customers WHERE list_id=?').run(l.id);
    db.prepare('DELETE FROM customer_lists WHERE id=?').run(l.id);
  });
  res.json({ ok: true });
});

// ── Serve Frontend ──
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => { res.sendFile(join(__dirname, 'dist', 'index.html')); });

app.listen(PORT, '0.0.0.0', () => { console.log(`TM Platform running on port ${PORT}`); });
