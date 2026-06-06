import express from 'express';
import { createServer } from 'http';
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
import pool from './server/db.js';
import { auth, requireRole, generateToken } from './server/auth.js';
import { attachWs, isDeviceOnline } from './server/ws.js';

// v8 routes
import distRouter from './server/routes/dist.js';
import sipRouter from './server/routes/sip.js';
import classifyRouter, { runClassificationInternal } from './server/routes/classify.js';
import suppliersRouter from './server/routes/suppliers.js';
import adminRouter from './server/routes/admin.js';
import centersRouter from './server/routes/centers.js';
import customersRouter from './server/routes/customers.js';
import messagesRouter from './server/routes/messages.js';

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
        -- 활성 DB 기준 누적 콜수
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true) as total_calls,
        -- 활성 DB 기준 누적 연결수
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result IN ('connected','positive')) as connected,
        -- 활성 DB 기준 누적 긍정수
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result = 'positive') as positive,
        -- 활성 DB 기준 누적 부재수
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result = 'no_answer') as no_answer,
        -- 활성 DB 기준 누적 결번수
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result = 'invalid') as invalid_count,
        -- 활성 DB 기준 누적 통화 시간
        (SELECT COALESCE(SUM(duration_sec),0) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true) as talk_time,
        -- 활성 DB 기준 상담원 큐 잔여
        (SELECT COUNT(*) FROM customers cu
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE cu.assigned_agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND cu.status = 'pending') as pending,
        -- 활성 DB 기준 평균 통화 시간
        (SELECT COALESCE(AVG(duration_sec),0)::int FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result IN ('connected','positive')) as avg_conn_sec,

        -- 당일(KST 업무일 기준 오늘) 활성 DB 실적
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)) as today_calls,
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result IN ('connected','positive')
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)) as today_connected,
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result = 'positive'
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)) as today_positive,
        (SELECT COALESCE(SUM(duration_sec),0) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)) as today_talk_time,

        -- 전일(KST 업무일 기준 어제) 활성 DB 실적
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '34 hours')::date)) as yesterday_calls,
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result IN ('connected','positive')
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '34 hours')::date)) as yesterday_connected,
        (SELECT COUNT(*) FROM calls c
           JOIN customers cu ON c.customer_id = cu.id
           JOIN customer_lists cl ON cu.list_id = cl.id
          WHERE c.agent = u.agent_name AND cl.center_id = $1 AND cl.is_active = true
            AND c.result = 'positive'
            AND ((c.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date 
                = (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '34 hours')::date)) as yesterday_positive
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
    agents.forEach(a => {
      a.online = isDeviceOnline(a.phone_id);
      a.hourly = hourlyByAgent[a.agent_name] || Array(24).fill(0);
    });

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
    // DB 체크 5종(연결/부재/거절/결번/소통) 정확 집계 (biplays 6/6). 소통 = 통화 duration 90초+ (객관).
    const { rows: lists } = await query(`
      SELECT cl.*,
        cl.is_active AS connected_db,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id) as total,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status<>'pending') as used,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='pending') as remaining,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='positive') as positive,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='reject') as reject,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('invalid','invalid_pre')) as invalid_count,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('no_answer','retry','dormant')) as no_answer,
        (SELECT COUNT(DISTINCT ca.customer_id) FROM calls ca JOIN customers c2 ON c2.id=ca.customer_id
           WHERE c2.list_id=cl.id AND ca.result='connected') as connected,
        (SELECT COUNT(DISTINCT ca.customer_id) FROM calls ca JOIN customers c2 ON c2.id=ca.customer_id
           WHERE c2.list_id=cl.id AND ca.result='connected' AND ca.duration_sec>=90) as sotong
      FROM customer_lists cl WHERE cl.center_id=$1 ORDER BY cl.uploaded_at DESC`, [cid]);

    for (const l of lists) {
      // DB퀄리티 3축: 도달률(데이터)·소통률(명단)·전환율(상담원)
      l.connect_rate = l.used > 0 ? +((l.connected / l.used) * 100).toFixed(1) : 0;
      l.invalid_rate = l.used > 0 ? +((l.invalid_count / l.used) * 100).toFixed(1) : 0;
      l.reach_rate   = l.used > 0 ? +((((l.used - l.invalid_count - l.no_answer)) / l.used) * 100).toFixed(1) : 0;
      l.sotong_rate  = l.connected > 0 ? +((l.sotong / l.connected) * 100).toFixed(1) : 0;
      l.convert_rate = l.sotong > 0 ? +((l.positive / l.sotong) * 100).toFixed(1) : 0;
      // 단일 DB 퀄리티 점수 (0~100): 도달률(데이터 퀄)×0.4 + 소통률(명단 퀄, 핵심)×0.6.
      // 전환율(상담원/스크립트 성과)은 DB 퀄리티 아니라 제외. 미측정(used=0)이면 null → UI "—".
      l.quality = +l.used > 0 ? Math.round(l.reach_rate * 0.4 + l.sotong_rate * 0.6) : null;
      const { rows: ag } = await query(`
        SELECT c.assigned_agent as agent_name,
          COUNT(DISTINCT c.id) as distributed,
          COUNT(DISTINCT c.id) FILTER (WHERE c.status NOT IN ('pending','calling')) as used,
          COUNT(DISTINCT c.id) FILTER (WHERE c.status='pending') as remaining,
          COUNT(DISTINCT c.id) FILTER (WHERE ca.result IN ('connected','positive')) as connected,
          COUNT(DISTINCT c.id) FILTER (WHERE c.status='no_answer') as no_answer,
          COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('invalid','invalid_pre')) as invalid_count
        FROM customers c
        LEFT JOIN calls ca ON ca.customer_id = c.id
        WHERE c.list_id=$1 AND c.assigned_agent IS NOT NULL
        GROUP BY c.assigned_agent ORDER BY c.assigned_agent`, [l.id]);
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

// "피드 있는(사용된) 번호" = 통화이력 보유 상태. 이게 있어야만 중복으로 인정.
const FEED_STATUSES = ['no_answer', 'invalid', 'positive', 'reject', 'done', 'recall', 'dormant', 'retry'];
const FEED_LABEL = { no_answer: '부재', invalid: '결번', positive: '긍정', reject: '거절', done: '통화완료', recall: '재통화', dormant: '휴면', retry: '재시도' };

// 중복 판정: 같은 센터에서 "뒤 8자리"가 같은 기존 번호 중, 피드(통화이력) 있는 것을 우선 반환.
// 피드 있는 매치가 없으면 (미사용끼리) null → 중복 아님 (biplays 규칙).
async function checkDuplicate(phone, cid) {
  const digits = String(phone).replace(/[^0-9]/g, '');
  const l8 = digits.slice(-8);
  if (l8.length < 8) return null;
  const { rows } = await query(
    `SELECT c.id, c.status, c.no_answer_count, cl.title,
            (SELECT COUNT(*)::int FROM calls WHERE customer_id=c.id) AS call_count,
            (SELECT COUNT(*)::int FROM calls WHERE customer_id=c.id AND result='connected') AS connected
       FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
      WHERE c.center_id=$2
        AND RIGHT(regexp_replace(c.phone_number, '\\D', '', 'g'), 8) = $1
      ORDER BY (CASE WHEN c.status = ANY($3) OR c.id IN (SELECT customer_id FROM calls) THEN 0 ELSE 1 END), c.id
      LIMIT 1`,
    [l8, cid, FEED_STATUSES]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  // 사용(피드) 여부: 통화이력 있거나 피드 상태일 때만 중복
  const used = r.call_count > 0 || FEED_STATUSES.includes(r.status);
  if (!used) return null;   // 미사용끼리의 중복은 중복 아님
  return {
    list_title: r.title,
    status: r.status,
    feed_label: FEED_LABEL[r.status] || r.status,
    no_answer_count: r.no_answer_count,
    call_count: r.call_count,
    connected: r.connected,
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
        prev_status: dup.status, feed: dup.feed_label, was_invalid: dup.invalid,
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
    // 배타적 활성화: 이 센터의 기존 활성 DB 는 먼저 끈다 (항상 1개만 active).
    await query(`UPDATE customer_lists SET is_active=false WHERE center_id=$1 AND id<>$2 AND is_active=true`, [cid, list_id]);
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
// 센터장 모델 A — FCFS 공유풀 (biplays 6/03). 연결된 단일 DB(is_active) 의 '안 친(pending)' 번호를
// 잔여부터 id 순으로 분배. 사전배정(분배) 없음 = 샌드 먼저 누른 상담원이 맨 앞 번호. 동시성=트랜잭션+SKIP LOCKED.
//  Tier1   : 내 귀속 이전-업무일 부재(retry/no_answer, 임계 미만) 우선 — 활성 DB 한정, 오전10시 경계.
//  Tier1.5 : 내 recall 예약 도래분 — 활성 DB 한정.
//  Tier2   : 연결된 단일 DB 의 pending FCFS (assigned_agent 무시).
// ※ 교체(connect-list)로 is_active 가 바뀌면 즉시 그 DB 잔여부터 분배되고, 비활성 DB의 이월/잔여는
//   배제됨(쓴 번호는 status≠pending 이라 자동 락/보존). 재교체 시 그 DB의 남은 pending 부터 이어서 분배.
app.post('/api/calls/next', auth, requireRole('agent'), async (req, res) => {
  const cid = req.user.center_id;
  const an = req.user.agent_name;
  // 슈퍼어드민 콜 STOP: 센터 발신 일시정지면 번호 안 내줌 (오토콜 자연 정지, 데이터/로그인 유지)
  const pz = await query(`SELECT calling_paused FROM centers WHERE id=$1`, [cid]);
  if (pz.rows[0]?.calling_paused) return res.status(404).json({ error: '발신 정지됨 (슈퍼어드민)', paused: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tier 1 — 이전 업무일에 내가 친 부재(나에게 귀속), 활성 DB 한정
    let pick = await client.query(
      `SELECT c.id, c.name, c.phone_number, c.memo, c.list_id
         FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
        WHERE c.assigned_agent=$1 AND cl.center_id=$2 AND cl.is_active=true
          AND c.status IN ('retry','no_answer')
          AND c.no_answer_count < COALESCE(cl.no_answer_limit, 3)
          AND (((c.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
              < (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
        ORDER BY c.id ASC LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
      [an, cid]
    );

    // Tier 1.5 — 내 recall 예약 도래분, 활성 DB 한정
    if (pick.rows.length === 0) {
      pick = await client.query(
        `SELECT c.id, c.name, c.phone_number, c.memo, c.list_id
           FROM customers c JOIN customer_lists cl ON cl.id=c.list_id
          WHERE c.center_id=$1 AND c.assigned_agent=$2 AND cl.is_active=true
            AND c.status='recall' AND c.recall_at <= NOW()
          ORDER BY c.recall_at ASC LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
        [cid, an]
      );
    }

    // Tier 2 — 연결된 단일 DB 의 pending FCFS (사전배정 무시, 잔여부터 순차)
    if (pick.rows.length === 0) {
      pick = await client.query(
        `SELECT c.id, c.name, c.phone_number, c.memo, c.list_id
           FROM customers c
          WHERE c.center_id=$1
            AND c.list_id = (SELECT id FROM customer_lists
                              WHERE center_id=$1 AND is_active=true
                              ORDER BY uploaded_at DESC, id DESC LIMIT 1)
            AND c.status='pending'
          ORDER BY c.id ASC LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
        [cid]
      );
    }

    if (pick.rows.length === 0) {
      await client.query('COMMIT');
      return res.status(404).json({ error: 'No more customers' });
    }

    const c = pick.rows[0];
    // 잠근 즉시 calling 마킹 + 내게 귀속(이후 부재 carryover/recall 추적용). 다른 상담원 풀에서 자동 제외.
    await client.query(
      `UPDATE customers SET status='calling', assigned_agent=$1, updated_at=NOW() WHERE id=$2`,
      [an, c.id]
    );
    await client.query('COMMIT');

    const center = await query(`SELECT show_phone FROM centers WHERE id=$1`, [cid]);
    if (!center.rows[0]?.show_phone && c.phone_number) {
      c.phone_number = c.phone_number.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3');
    }
    res.json(c);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
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
      else if (dbResult === 'reject') newStatus = 'reject';
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

// ── Recordings ──
// Files land on disk at RECORDINGS_DIR (default ./recordings). DB row holds
// the relative path + 7-day expires_at per 방침 §7 (음성 7일 후 자동 삭제).
// Cron job in server/jobs.js is responsible for actually removing expired files.
import fs from 'fs';
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || join(__dirname, 'recordings');
try { fs.mkdirSync(RECORDINGS_DIR, { recursive: true }); } catch {}

const recUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, RECORDINGS_DIR),
    filename: (req, file, cb) => {
      const callId = +req.params.call_id || 0;
      const ext = (file.originalname.match(/\.[a-z0-9]+$/i)?.[0] || '.m4a').toLowerCase();
      cb(null, `call_${callId}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per recording
});

// Device uploads its local recording once the call ends.
// Accepts agent role (device is an agent's phone). Center_admin/super_admin
// may also upload via admin tooling if needed.
app.post(
  '/api/recordings/:call_id',
  auth,
  requireRole('agent', 'center_admin', 'super_admin'),
  recUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file field required' });
      const callId = +req.params.call_id;
      const call = await query('SELECT id, center_id, agent FROM calls WHERE id=$1', [callId]);
      if (call.rows.length === 0) return res.status(404).json({ error: 'call not found' });

      // Scope check: agent may only upload recordings for their own calls.
      if (req.user.role === 'agent' && call.rows[0].agent !== req.user.agent_name) {
        // delete stray file to avoid orphan
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(403).json({ error: 'not your call' });
      }

      const rel = req.file.filename;  // store filename only; dir known by server
      const { rows } = await query(
        `INSERT INTO recordings (call_id, file_path, file_size, created_at, expires_at)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '7 days')
         RETURNING id, file_path, expires_at`,
        [callId, rel, req.file.size]
      );
      res.json({ ok: true, recording: rows[0] });

      // 녹음 파일 업로드 직후 백그라운드 자동 피드 기재(분류) 비동기 실행
      runClassificationInternal(callId).catch(err => {
        console.error(`[recordings] Auto classification failed for call ${callId}:`, err.message);
      });
    } catch (e) {
      console.error('[recordings] upload error', e);
      res.status(500).json({ error: e.message });
    }
  }
);

// Center-side listing (original placeholder; now backed by real rows).
app.get('/api/recordings/:cid', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const cid = +req.params.cid;
    const { rows } = await query(
      `SELECT r.id, r.call_id, r.file_path, r.file_size, r.created_at, r.expires_at,
              c.agent, c.duration_sec, c.started_at, c.result,
              cu.name AS customer_name, cu.phone_number
         FROM recordings r
         JOIN calls c ON c.id = r.call_id
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.center_id = $1
        ORDER BY r.created_at DESC
        LIMIT 200`,
      [cid]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stream an individual recording (center/super only). Returns 410 on expired.
app.get('/api/recordings/file/:id', auth, requireRole('center_admin', 'super_admin'), async (req, res) => {
  try {
    const id = +req.params.id;
    const { rows } = await query(
      `SELECT r.file_path, r.expires_at, c.center_id
         FROM recordings r JOIN calls c ON c.id = r.call_id
        WHERE r.id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    const row = rows[0];
    if (req.user.role === 'center_admin' && row.center_id !== req.user.center_id) {
      return res.status(403).json({ error: 'wrong center' });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'expired' });
    }
    const full = join(RECORDINGS_DIR, row.file_path);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'file missing' });
    res.sendFile(full);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
// 머지 과정에서 마운트 누락됐던 모듈 라우터 복구 (2026-06-06 서비스 냉정점검).
// 인라인 라우트가 먼저 등록돼 있어 겹치는 정확 경로(GET /api/centers, PUT /api/centers/:id,
// POST /api/customers/distribute)는 인라인이 우선, 라우터는 누락 엔드포인트만 보충한다.
app.use('/api/centers', centersRouter);      // 센터 생성/정지/삭제 + 상담원 추가/정지 (AdminView)
app.use('/api/customers', customersRouter);  // 상담원 할당번호 목록 GET /api/customers (AgentView)
app.use('/api', messagesRouter);             // 양방향 SMS + /api/messages/summary (Manager/AgentView)

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
  const httpServer = createServer(app);
  const ws = attachWs(httpServer);
  app.locals.ws = ws;

  httpServer.listen(PORT, '0.0.0.0', () =>
    console.log(`TM Platform v8 on port ${PORT}${bootError ? ' (DEGRADED)' : ''} · ws: /ws/device /ws/console`)
  );
}

start().catch(err => {
  console.error('Startup crashed:', err);
});

function shutdown() {
  stopCron();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
