import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import XLSX from 'xlsx';

import { query, initDB } from './server/db.js';
import { auth, requireRole, generateToken } from './server/auth.js';

// v8 routes
import distRouter from './server/routes/dist.js';
import sipRouter from './server/routes/sip.js';
import classifyRouter from './server/routes/classify.js';
import suppliersRouter from './server/routes/suppliers.js';
import adminRouter from './server/routes/admin.js';

import { startCron, stopCron } from './server/jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;

let bootError = null; // set if DB init / DATABASE_URL missing — degrades server to 503 mode

const app = express();
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

// ── Health (bootError-aware; rebound at end if needed) ──
app.get('/api/health', (req, res) => {
  if (bootError) return res.status(503).json({ ok: false, version: 'v8', error: bootError });
  res.json({ ok: true, version: 'v8', time: new Date().toISOString() });
});

// degraded-mode guard — every /api/* (except /api/health) returns 503 if boot failed
app.use('/api', (req, res, next) => {
  if (!bootError) return next();
  if (req.path === '/health' || req.path === '') return next();
  res.status(503).json({ ok: false, error: bootError });
});

// ── Auth ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await query('SELECT * FROM users WHERE email=$1', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        center_id: user.center_id, agent_name: user.agent_name,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, email, name, role, center_id, agent_name FROM users WHERE id=$1', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Centers ──
app.get('/api/centers', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*, u.name as owner_name,
        (SELECT COUNT(*) FROM phones WHERE center_id=c.id) as phone_count,
        (SELECT COUNT(*) FROM users WHERE center_id=c.id AND role='agent') as agent_count,
        (SELECT COUNT(*) FROM calls WHERE center_id=c.id) as today_calls,
        (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND result='connected') as today_connected
      FROM centers c LEFT JOIN users u ON c.owner_id=u.id ORDER BY c.id`);
    rows.forEach(r => {
      r.connect_rate = r.today_calls > 0 ? +((r.today_connected / r.today_calls) * 100).toFixed(1) : 0;
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/centers/:id', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const allowed = ['name', 'dist_mode', 'show_phone', 'auto_noans_exclude', 'auto_invalid_detect', 'plan', 'is_active'];
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
      if (k in req.body) { sets.push(`${k}=$${i++}`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.json({ ok: true });
    params.push(+req.params.id);
    await query(`UPDATE centers SET ${sets.join(',')} WHERE id=$${i}`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard (manager / super_admin) ──
app.get('/api/dashboard/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const cid = +req.params.cid;
    const today = new Date().toISOString().split('T')[0];

    const center = await query('SELECT * FROM centers WHERE id=$1', [cid]);

    const { rows: agents } = await query(`
      SELECT u.id, u.name, u.agent_name, u.phone_id,
        p.sip_account, p.status as phone_status,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1) as total_calls,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result IN ('connected','positive')) as connected,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result='positive') as positive,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result='no_answer') as no_answer,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result='invalid') as invalid_count,
        (SELECT COALESCE(SUM(duration_sec),0) FROM calls WHERE agent=u.agent_name AND center_id=$1) as talk_time,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=u.agent_name AND center_id=$1 AND status='pending') as pending,
        (SELECT COALESCE(AVG(duration_sec),0)::int FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result IN ('connected','positive')) as avg_conn_sec
      FROM users u LEFT JOIN phones p ON u.phone_id=p.id
      WHERE u.center_id=$1 AND u.role='agent' ORDER BY u.agent_name`, [cid]);

    // hourly per agent (today)
    const { rows: hourlyRows } = await query(`
      SELECT agent, EXTRACT(HOUR FROM started_at)::int AS hour, COUNT(*)::int AS calls
        FROM calls WHERE center_id=$1 AND started_at::date=$2
        GROUP BY agent, hour`, [cid, today]);
    const hourlyByAgent = {};
    for (const r of hourlyRows) {
      if (!hourlyByAgent[r.agent]) hourlyByAgent[r.agent] = Array(24).fill(0);
      hourlyByAgent[r.agent][r.hour] = r.calls;
    }
    agents.forEach(a => { a.hourly = hourlyByAgent[a.agent_name] || Array(24).fill(0); });

    const { rows: lists } = await query(`
      SELECT cl.*,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id) as total,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status NOT IN ('pending','retry')) as used,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('done','positive')) as done_count,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('invalid','invalid_pre')) as invalid_count,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='no_answer') as na_count,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='pending') as remaining
      FROM customer_lists cl WHERE cl.center_id=$1 ORDER BY cl.uploaded_at DESC`, [cid]);
    lists.forEach(l => {
      l.connect_rate = l.used > 0 ? +((l.done_count / l.used) * 100).toFixed(1) : 0;
      l.invalid_rate = l.used > 0 ? +((l.invalid_count / l.used) * 100).toFixed(1) : 0;
    });

    const { rows: activeTests } = await query(`
      SELECT cl.id as list_id, cl.title,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id) as total,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status NOT IN ('pending','calling')) as done,
        (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=cl.id AND c.result IN ('connected','positive')) as connected,
        (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=cl.id AND c.result='no_answer') as no_answer,
        (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=cl.id AND c.result='invalid') as invalid
      FROM customer_lists cl WHERE cl.center_id=$1 AND cl.is_test=true`, [cid]);

    res.json({ center: center.rows[0], agents, lists, active_tests: activeTests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lists ──
app.get('/api/lists/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const cid = +req.params.cid;
    const { rows: lists } = await query(`
      SELECT cl.*,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id) as total,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status NOT IN ('pending','retry')) as used,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('done','positive')) as connected,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('invalid','invalid_pre')) as invalid_count,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='pending') as remaining
      FROM customer_lists cl WHERE cl.center_id=$1 ORDER BY cl.uploaded_at DESC`, [cid]);

    for (const l of lists) {
      l.connect_rate = l.used > 0 ? +((l.connected / l.used) * 100).toFixed(1) : 0;
      l.invalid_rate = l.used > 0 ? +((l.invalid_count / l.used) * 100).toFixed(1) : 0;
      const { rows: ag } = await query(`
        SELECT assigned_agent as agent_name,
          COUNT(*) as distributed,
          COUNT(*) FILTER (WHERE status NOT IN ('pending','retry')) as used,
          COUNT(*) FILTER (WHERE status='pending') as remaining,
          COUNT(*) FILTER (WHERE status IN ('done','positive')) as connected,
          COUNT(*) FILTER (WHERE status='no_answer') as no_answer,
          COUNT(*) FILTER (WHERE status IN ('invalid','invalid_pre')) as invalid_count
        FROM customers WHERE list_id=$1 AND assigned_agent IS NOT NULL
        GROUP BY assigned_agent ORDER BY assigned_agent`, [l.id]);
      l.agents = ag;
    }
    res.json(lists);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Phone validation + duplicate check ──
function validatePhone(num) {
  if (!num) return { valid: false, reason: 'empty' };
  let cleaned = String(num).replace(/[^0-9]/g, '');
  if (!cleaned || cleaned.length < 8) return { valid: false, reason: 'length' };
  if (cleaned.startsWith('82') && cleaned.length >= 11) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('10') && (cleaned.length === 10 || cleaned.length === 9)) cleaned = '0' + cleaned;
  if (cleaned.length !== 11) return { valid: false, reason: 'length' };
  if (!cleaned.startsWith('010')) return { valid: false, reason: 'prefix' };
  const d4 = cleaned[3];
  if (d4 === '0' || d4 === '1') return { valid: false, reason: 'invalid_range' };
  return { valid: true, formatted: `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}` };
}

async function checkDuplicate(phone, cid) {
  const { rows } = await query(
    `SELECT c.id, c.list_id, c.status, c.no_answer_count, cl.title
       FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
      WHERE c.phone_number=$1 AND c.center_id=$2 LIMIT 1`,
    [phone, cid]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  const calls = await query(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE result='connected')::int AS connected
       FROM calls WHERE customer_id=$1`,
    [r.id]
  );
  return {
    list_title: r.title,
    status: r.status,
    no_answer_count: r.no_answer_count,
    call_count: calls.rows[0].n,
    connected: calls.rows[0].connected,
    invalid: r.status === 'invalid' || r.status === 'invalid_pre',
  };
}

async function ingestCustomers({ cid, title, source, customers, is_test }) {
  const results = { total: customers.length, valid: 0, invalid_phone: 0, duplicate: 0, dup_details: [], inv_details: [] };
  const valid = [];
  for (const cu of customers) {
    const chk = validatePhone(cu.phone || cu.phone_number);
    if (!chk.valid) {
      results.invalid_phone++;
      results.inv_details.push({ phone: cu.phone || cu.phone_number, reason: chk.reason });
      continue;
    }
    const dup = await checkDuplicate(chk.formatted, cid);
    if (dup) {
      results.duplicate++;
      results.dup_details.push({
        phone: chk.formatted, name: cu.name, prev_list: dup.list_title,
        prev_status: dup.status, was_invalid: dup.invalid,
        no_answer: dup.no_answer_count, calls: dup.call_count, connected: dup.connected,
      });
      continue;
    }
    results.valid++;
    valid.push({ name: cu.name || null, phone: chk.formatted, region: cu.region || null });
  }

  const list = await query(
    `INSERT INTO customer_lists (center_id, title, source, is_test, total_count)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [cid, title, source || '', !!is_test, results.valid]
  );
  const lid = list.rows[0].id;
  for (const v of valid) {
    await query(
      `INSERT INTO customers (list_id, center_id, name, phone_number, region) VALUES ($1, $2, $3, $4, $5)`,
      [lid, cid, v.name, v.phone, v.region]
    );
  }
  results.list_id = lid;
  results.quality = results.total > 0 ? Math.round((results.valid / results.total) * 100) : 0;

  const dupAnalysis = {};
  for (const d of results.dup_details) {
    if (!dupAnalysis[d.prev_list]) dupAnalysis[d.prev_list] = { count: 0, invalid: 0, no_answer: 0, connected: 0 };
    dupAnalysis[d.prev_list].count++;
    if (d.was_invalid) dupAnalysis[d.prev_list].invalid++;
    if (d.no_answer > 0) dupAnalysis[d.prev_list].no_answer++;
    if (d.connected > 0) dupAnalysis[d.prev_list].connected++;
  }
  results.dup_by_list = Object.entries(dupAnalysis).map(([list, data]) => ({ list, ...data }));
  return results;
}

app.post('/api/lists/upload', auth, requireRole('center_admin'), async (req, res) => {
  try {
    const { title, source, customers, is_test = false } = req.body;
    if (!title || !Array.isArray(customers))
      return res.status(400).json({ error: 'title and customers array required' });
    const out = await ingestCustomers({ cid: req.user.center_id, title, source, customers, is_test });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) cb(null, true);
    else cb(new Error('xlsx, xls, csv only'));
  },
});

app.post('/api/lists/upload-file', auth, requireRole('center_admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title, source, is_test = false } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    let rows = [];
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', codepage: 65001, raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    } catch (e) { return res.status(400).json({ error: 'Failed to parse: ' + e.message }); }
    if (!rows.length) return res.status(400).json({ error: 'Empty file' });

    const cols = Object.keys(rows[0]);
    const phoneCol =
      cols.find(c => /phone|전화|번호|핸드폰|mobile|tel|연락처|hp|휴대/i.test(c)) ||
      cols.find(c => { const v = String(rows[0][c]).replace(/[^0-9]/g, ''); return v.length >= 10 && v.startsWith('01'); }) ||
      cols[0];
    const nameCol = cols.find(c => /name|이름|성명|고객명|고객/i.test(c)) || null;
    const regionCol = cols.find(c => /region|지역|주소|address|시도|거주/i.test(c)) || null;

    const customers = rows.map(r => ({
      phone: String(r[phoneCol] || '').trim(),
      name: nameCol ? String(r[nameCol] || '').trim() : null,
      region: regionCol ? String(r[regionCol] || '').trim() : null,
    }));

    const out = await ingestCustomers({ cid: req.user.center_id, title, source, customers, is_test: is_test === 'true' || is_test === true });
    out.detected_columns = { phone: phoneCol, name: nameCol, region: regionCol, all: cols };
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Customers / distribute (legacy alias kept; new code uses /api/dist/execute) ──
app.post('/api/customers/distribute', auth, requireRole('center_admin'), async (req, res) => {
  try {
    const { list_id, percentage = 100 } = req.body;
    const cid = req.user.center_id;
    const { rows: pending } = await query(
      `SELECT id FROM customers WHERE list_id=$1 AND assigned_agent IS NULL AND status='pending' ORDER BY id`,
      [list_id]
    );
    if (!pending.length) return res.json({ ok: true, distributed: 0, message: 'No pending customers' });

    const totalToDist = Math.ceil(pending.length * (percentage / 100));
    const pool = pending.slice(0, totalToDist);

    const { rows: agentsRows } = await query(
      `SELECT agent_name FROM users WHERE center_id=$1 AND role='agent' AND agent_name IS NOT NULL ORDER BY agent_name`,
      [cid]
    );
    const agents = agentsRows.map(r => r.agent_name);
    if (!agents.length) return res.status(400).json({ error: 'No agents' });

    const result = {};
    agents.forEach(a => { result[a] = 0; });
    pool.forEach((c, i) => {
      const a = agents[i % agents.length];
      result[a]++;
    });

    let idx = 0;
    for (const a of agents) {
      const n = result[a];
      for (let i = 0; i < n && idx < pool.length; i++, idx++) {
        await query(`UPDATE customers SET assigned_agent=$1, updated_at=NOW() WHERE id=$2`, [a, pool[idx].id]);
      }
    }
    await query(`UPDATE customer_lists SET is_distributed=true, is_active=true WHERE id=$1`, [list_id]);
    await query(
      `INSERT INTO distribution_events (list_id, total_distributed, split_json, triggered_by) VALUES ($1, $2, $3, 'manual')`,
      [list_id, pool.length, JSON.stringify(result)]
    );

    res.json({ ok: true, distributed: pool.length, per_agent: result, remaining: pending.length - totalToDist });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Queue status ──
app.get('/api/queue/status/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const cid = +req.params.cid;
    const { rows } = await query(
      `SELECT u.agent_name,
        COUNT(c.id) FILTER (WHERE c.status='pending') AS pending
        FROM users u
        LEFT JOIN customers c ON c.assigned_agent=u.agent_name AND c.center_id=$1
       WHERE u.center_id=$1 AND u.role='agent' AND u.agent_name IS NOT NULL
       GROUP BY u.agent_name ORDER BY u.agent_name`,
      [cid]
    );
    res.json(rows.map(r => ({ agent_name: r.agent_name, pending: +r.pending, low: +r.pending < 30 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Agent-side ──
app.get('/api/agent/me', auth, requireRole('agent'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const an = req.user.agent_name;
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1)::int AS total_calls,
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1 AND result IN ('connected','positive'))::int AS connected,
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1 AND result='positive')::int AS signup,
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1 AND result='no_answer')::int AS no_answer,
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1 AND result='invalid')::int AS invalid,
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1 AND result='reject')::int AS rejected,
        (SELECT COUNT(*) FROM calls WHERE agent=$2 AND center_id=$1 AND result='recall')::int AS callback,
        (SELECT COALESCE(SUM(duration_sec),0)::int FROM calls WHERE agent=$2 AND center_id=$1) AS talk_time,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=$2 AND center_id=$1 AND status='pending')::int AS pending`,
      [cid, an]
    );
    res.json({ agent_name: an, name: req.user.name, ...rows[0], interest: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agent/team', auth, requireRole('agent'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { rows } = await query(`
      SELECT u.agent_name, u.name,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1)::int AS total_calls,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result IN ('connected','positive'))::int AS connected,
        (SELECT COUNT(*) FROM calls WHERE agent=u.agent_name AND center_id=$1 AND result='positive')::int AS signup
       FROM users u
      WHERE u.center_id=$1 AND u.role='agent' AND u.agent_name IS NOT NULL
      ORDER BY total_calls DESC`, [cid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agent/history', auth, requireRole('agent'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const an = req.user.agent_name;
    const { rows } = await query(`
      SELECT c.id, c.result, c.duration_sec AS duration, c.started_at AS time, c.is_inbound,
             cu.name, cu.phone_number AS phone
        FROM calls c LEFT JOIN customers cu ON cu.id=c.customer_id
       WHERE c.agent=$2 AND c.center_id=$1
       ORDER BY c.started_at DESC LIMIT 50`, [cid, an]);
    const center = await query(`SELECT show_phone FROM centers WHERE id=$1`, [cid]);
    const showPhone = center.rows[0]?.show_phone;
    res.json(rows.map(r => ({
      ...r,
      phone: !showPhone && r.phone ? r.phone.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3') : r.phone,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Calls ──
app.post('/api/calls/next', auth, requireRole('agent'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const an = req.user.agent_name;
    // priority: test list first, then recall (recall_at <= now), then pending
    let { rows } = await query(`
      SELECT c.id, c.name, c.phone_number, c.memo, c.list_id, cl.is_test
        FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
       WHERE c.center_id=$1 AND c.assigned_agent=$2 AND c.status='pending' AND cl.is_test=true
       ORDER BY c.id LIMIT 1`, [cid, an]);
    if (!rows.length) {
      ({ rows } = await query(`
        SELECT c.id, c.name, c.phone_number, c.memo, c.list_id, cl.is_test
          FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
         WHERE c.center_id=$1 AND c.assigned_agent=$2 AND c.status='recall' AND c.recall_at <= NOW()
         ORDER BY c.recall_at LIMIT 1`, [cid, an]));
    }
    if (!rows.length) {
      ({ rows } = await query(`
        SELECT c.id, c.name, c.phone_number, c.memo, c.list_id, cl.is_test
          FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
         WHERE c.center_id=$1 AND c.assigned_agent=$2 AND c.status='pending'
         ORDER BY c.id LIMIT 1`, [cid, an]));
    }
    if (!rows.length) return res.status(404).json({ error: 'No more customers' });

    const c = rows[0];
    await query(`UPDATE customers SET status='calling', updated_at=NOW() WHERE id=$1`, [c.id]);

    const center = await query(`SELECT show_phone FROM centers WHERE id=$1`, [cid]);
    const showPhone = center.rows[0]?.show_phone;
    if (!showPhone && c.phone_number) {
      c.phone_number = c.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3');
    }
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/calls/start', auth, requireRole('agent'), async (req, res) => {
  try {
    const { customer_id } = req.body;
    const call = await query(
      `INSERT INTO calls (customer_id, center_id, agent, phone_id, started_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [customer_id, req.user.center_id, req.user.agent_name, req.user.phone_id]
    );
    if (req.user.phone_id) await query(`UPDATE phones SET status='calling' WHERE id=$1`, [req.user.phone_id]);
    res.json({ call_id: call.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/calls/:id/end', auth, requireRole('agent'), async (req, res) => {
  try {
    const { result, duration_sec, memo } = req.body;
    // map UI result keywords → DB result vocab
    const map = { signup: 'positive', interest: 'connected', rejected: 'reject', callback: 'recall' };
    const dbResult = map[result] || result;

    const call = await query(
      `UPDATE calls SET result=$1, duration_sec=$2, ended_at=NOW() WHERE id=$3 RETURNING customer_id, center_id`,
      [dbResult, duration_sec || 0, +req.params.id]
    );
    if (call.rows.length === 0) return res.status(404).json({ error: 'Call not found' });
    const c = call.rows[0];

    if (c.customer_id) {
      const cust = await query(`SELECT no_answer_count FROM customers WHERE id=$1`, [c.customer_id]);
      const nac = cust.rows[0]?.no_answer_count || 0;
      const center = await query(`SELECT auto_noans_exclude FROM centers WHERE id=$1`, [c.center_id]);
      const autoExclude = center.rows[0]?.auto_noans_exclude;
      let newStatus = 'pending';
      const params = [];

      if (dbResult === 'connected') newStatus = 'done';
      else if (dbResult === 'positive') newStatus = 'positive';
      else if (dbResult === 'reject') newStatus = 'done';
      else if (dbResult === 'invalid') newStatus = 'invalid';
      else if (dbResult === 'recall') newStatus = 'recall';
      else if (dbResult === 'no_answer') {
        const newCount = nac + 1;
        await query(`UPDATE customers SET no_answer_count=$1 WHERE id=$2`, [newCount, c.customer_id]);
        if (autoExclude && newCount >= 3) newStatus = 'dormant';
        else newStatus = 'pending';
      }

      const memoUpdate = memo ? `, memo=$3` : '';
      const memoParams = memo ? [memo] : [];
      await query(
        `UPDATE customers SET status=$1, updated_at=NOW()${memoUpdate} WHERE id=$2`,
        [newStatus, c.customer_id, ...memoParams]
      );
    }

    if (req.user.phone_id) await query(`UPDATE phones SET status='idle' WHERE id=$1`, [req.user.phone_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Inbound matching ──
app.post('/api/calls/inbound', auth, requireRole('agent'), async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });
    const cleaned = String(phone_number).replace(/[^0-9]/g, '');
    const formatted = cleaned.length === 11
      ? `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
      : `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;

    const cid = req.user.center_id;
    const { rows } = await query(
      `SELECT c.*, cl.title AS list_title FROM customers c
        LEFT JOIN customer_lists cl ON cl.id=c.list_id
        WHERE c.phone_number=$1 AND c.center_id=$2 LIMIT 1`,
      [formatted, cid]
    );
    if (!rows.length) return res.json({ matched: false, phone: formatted });

    const cust = rows[0];
    const calls = await query(
      `SELECT * FROM calls WHERE customer_id=$1 ORDER BY started_at DESC LIMIT 5`,
      [cust.id]
    );
    const center = await query(`SELECT show_phone FROM centers WHERE id=$1`, [cid]);
    const showPhone = center.rows[0]?.show_phone;
    const masked = !showPhone && cust.phone_number
      ? cust.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3')
      : cust.phone_number;

    res.json({
      matched: true,
      customer: { ...cust, phone: masked, phone_raw: cust.phone_number },
      last_call: calls.rows[0] || null,
      call_count: calls.rows.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Stats ──
app.get('/api/stats/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const cid = +req.params.cid;
    const { rows } = await query(`
      SELECT COUNT(*)::int AS total_calls,
             COUNT(*) FILTER (WHERE result IN ('connected','positive'))::int AS connected,
             COUNT(*) FILTER (WHERE result='no_answer')::int AS no_answer,
             COUNT(*) FILTER (WHERE result='invalid')::int AS invalid,
             COALESCE(SUM(duration_sec),0)::int AS total_duration
        FROM calls WHERE center_id=$1`, [cid]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Recordings (placeholder) ──
app.get('/api/recordings/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  res.json([]);
});

// ── Sample test ──
app.post('/api/test/start', auth, requireRole('center_admin'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { title, customers } = req.body;
    const t = title || '샘플테스트';

    const { rows: agentRows } = await query(
      `SELECT agent_name FROM users WHERE center_id=$1 AND role='agent' AND agent_name IS NOT NULL ORDER BY agent_name`,
      [cid]
    );
    const ags = agentRows.map(r => r.agent_name);

    let valid = [];
    if (customers && Array.isArray(customers)) {
      for (const cu of customers) {
        const chk = validatePhone(cu.phone || cu.phone_number);
        if (chk.valid) valid.push({ name: cu.name || null, phone: chk.formatted });
      }
    } else {
      for (let i = 0; i < 100; i++) {
        valid.push({
          name: 'Test' + (i + 1),
          phone: `010-${String(2000 + Math.floor(i / 100)).padStart(4, '0')}-${String(i).padStart(4, '0')}`,
        });
      }
    }

    const list = await query(
      `INSERT INTO customer_lists (center_id, title, source, is_test, total_count) VALUES ($1, $2, 'Sample', true, $3) RETURNING id`,
      [cid, t, valid.length]
    );
    const lid = list.rows[0].id;
    for (let i = 0; i < valid.length; i++) {
      const v = valid[i];
      const ag = ags[i % ags.length];
      await query(
        `INSERT INTO customers (list_id, center_id, name, phone_number, assigned_agent) VALUES ($1, $2, $3, $4, $5)`,
        [lid, cid, v.name, v.phone, ag]
      );
    }
    res.json({ list_id: lid, total: valid.length, per_agent: Math.ceil(valid.length / ags.length), agents: ags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/test/stop', auth, requireRole('center_admin'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { rows: tests } = await query(`SELECT id, title FROM customer_lists WHERE center_id=$1 AND is_test=true`, [cid]);
    const results = [];
    for (const t of tests) {
      const { rows } = await query(`
        SELECT
          (SELECT COUNT(*) FROM customers WHERE list_id=$1)::int AS total,
          (SELECT COUNT(*) FROM customers WHERE list_id=$1 AND status NOT IN ('pending','calling'))::int AS called,
          (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=$1 AND c.result IN ('connected','positive'))::int AS connected,
          (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=$1 AND c.result='no_answer')::int AS no_answer,
          (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=$1 AND c.result='invalid')::int AS invalid,
          (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=$1 AND c.result='positive')::int AS signup
      `, [t.id]);
      results.push({ list_id: t.id, title: t.title, ...rows[0] });
    }
    await query(`UPDATE customer_lists SET is_test=false WHERE center_id=$1 AND is_test=true`, [cid]);
    res.json({ ok: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/test/status/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const cid = +req.params.cid;
    const { rows } = await query(`
      SELECT cl.id AS list_id, cl.title,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id)::int AS total,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status NOT IN ('pending','calling'))::int AS done,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='pending')::int AS remaining,
        (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=cl.id AND c.result IN ('connected','positive'))::int AS connected,
        (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=cl.id AND c.result='no_answer')::int AS no_answer,
        (SELECT COUNT(*) FROM calls c JOIN customers cu ON cu.id=c.customer_id WHERE cu.list_id=cl.id AND c.result='invalid')::int AS invalid
      FROM customer_lists cl WHERE cl.center_id=$1 AND cl.is_test=true`, [cid]);
    rows.forEach(r => { r.progress = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0; });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── v8 routes ──
app.use('/api/dist', distRouter);
app.use('/api/sip', sipRouter);
app.use('/api/classify', classifyRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/admin', adminRouter);

// ── Static (SPA) ──
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

// ── Bootstrap ──
async function start() {
  if (!process.env.DATABASE_URL) {
    bootError = 'DATABASE_URL not set — provision a Postgres service on Railway and link it to this app';
    console.error('[boot] ' + bootError);
  } else {
    try {
      await initDB();
      startCron();
      console.log('[boot] DB + cron OK');
    } catch (e) {
      const detail = e.message || e.code || String(e);
      bootError = `DB init failed: ${detail}`;
      console.error('[boot] ' + bootError);
      console.error('[boot] error object:', e);
      if (e.stack) console.error('[boot] stack:', e.stack);
    }
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`TM Platform v8 on port ${PORT}${bootError ? ' (DEGRADED)' : ''}`));
}

start().catch(err => {
  console.error('Startup crashed:', err);
});

process.on('SIGTERM', () => { stopCron(); process.exit(0); });
process.on('SIGINT', () => { stopCron(); process.exit(0); });
