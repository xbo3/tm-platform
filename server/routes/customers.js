import { Router } from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { auth, role } from '../auth.js';

const router = Router();
const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

// ── 전화번호 정규화/검증 + 중복 판정 헬퍼 ──────────────────────────
// 정규화: 부호 제거 → 숫자만 → '10'으로 시작(10자리)이면 '010' 보정
function normalizePhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('10')) d = '0' + d;   // 10xxxxxxxx → 010xxxxxxxx
  return d;
}
// 유효 = 010 + 8자리, 8자리 첫 숫자는 2~9 (0·1 불가)
function isValidKR(d) { return /^010[2-9]\d{7}$/.test(d); }
function last8(d) { return d.slice(-8); }

// "피드 있는(사용된) 번호" 상태 = 중복 판정의 기준이 되는 통화이력 보유 상태
const FEED_STATUSES = ['no_answer', 'invalid', 'positive', 'done', 'retry', 'recall', 'dormant'];
const FEED_LABEL = {
  no_answer: '부재', invalid: '결번', positive: '긍정', done: '통화완료',
  retry: '재시도', recall: '재통화', dormant: '휴면',
};

// List customer_lists for center
router.get('/lists', auth, role('center_admin'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { rows } = await query(`
      SELECT cl.*,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='done' AND
          id IN (SELECT customer_id FROM calls WHERE result='connected')) as connected,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status='invalid') as invalid_count,
        (SELECT COUNT(*) FROM customers WHERE list_id=cl.id AND status IN ('pending','retry')) as remaining
      FROM customer_lists cl WHERE cl.center_id=$1 ORDER BY cl.uploaded_at DESC
    `, [cid]);
    // Calc rates
    rows.forEach(r => {
      const used = r.total_count - (r.remaining || 0);
      r.connect_rate = used > 0 ? ((r.connected / used) * 100).toFixed(1) : 0;
      r.invalid_rate = used > 0 ? ((r.invalid_count / used) * 100).toFixed(1) : 0;
      r.used = used;
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload excel (JSON array) — 유효성 검사 + 중복 자동제외 + 출처 기록
// funnel: 총 N → 유효(형식통과) → 중복(피드보유 번호와 뒤8자리 일치) 제외 → 최종(분배대상 pending)
router.post('/upload', auth, role('center_admin'), async (req, res) => {
  try {
    const { title, source, is_test, customers } = req.body;
    const cid = req.user.center_id;
    if (!Array.isArray(customers)) return res.status(400).json({ error: 'customers array required' });

    const total = customers.length;
    const list = await query(
      'INSERT INTO customer_lists (center_id,title,source,is_test,total_count) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [cid, title, source, is_test || false, total]
    );
    const lid = list.rows[0].id;

    // 같은 센터의 "피드 있는 번호" 뒤8자리 → 출처 맵 (1회 조회, 메모리 대조)
    const feed = await query(
      `SELECT cl.title, cu.phone_number, cu.status,
              RIGHT(regexp_replace(cu.phone_number, '\\D', '', 'g'), 8) AS l8
         FROM customers cu JOIN customer_lists cl ON cu.list_id = cl.id
        WHERE cu.center_id = $1 AND cu.status = ANY($2)`,
      [cid, FEED_STATUSES]
    );
    const feedMap = new Map();
    for (const r of feed.rows) if (r.l8 && !feedMap.has(r.l8)) feedMap.set(r.l8, r);

    // 분류
    const rowsToInsert = [];   // [list_id, center_id, name, phone, status, dup_title, dup_phone, dup_feed]
    let invalidCount = 0, dupCount = 0, finalCount = 0;
    for (const c of customers) {
      const norm = normalizePhone(c && c.phone);
      const name = (c && c.name) || '';
      if (!isValidKR(norm)) {
        rowsToInsert.push([lid, cid, name, norm || String((c && c.phone) || ''), 'invalid_pre', null, null, null]);
        invalidCount++;
        continue;
      }
      const hit = feedMap.get(last8(norm));
      if (hit) {
        rowsToInsert.push([lid, cid, name, norm, 'duplicate', hit.title, hit.phone_number, FEED_LABEL[hit.status] || hit.status]);
        dupCount++;
      } else {
        rowsToInsert.push([lid, cid, name, norm, 'pending', null, null, null]);
        finalCount++;
      }
    }

    // 청크 배치 insert (8컬럼 × 800행 = 6400 파라미터 < 65535)
    const COLS = 8, CHUNK = 800;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
      const slice = rowsToInsert.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * COLS;
        values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`);
        params.push(...r);
      });
      await query(
        `INSERT INTO customers (list_id,center_id,name,phone_number,status,dup_title,dup_phone,dup_feed) VALUES ${values.join(',')}`,
        params
      );
    }

    const valid = dupCount + finalCount;   // 형식 통과한 번호 (중복 포함)
    res.json({
      list: list.rows[0],
      total, valid, invalid: invalidCount, duplicate: dupCount, final: finalCount,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Distribute DB to agents
router.post('/distribute', auth, role('center_admin'), async (req, res) => {
  try {
    const { list_id, distribution } = req.body; // distribution: {A:100, B:100, ...}
    const cid = req.user.center_id;
    // Get unassigned customers from this list
    const { rows: pending } = await query(
      'SELECT id FROM customers WHERE list_id=$1 AND assigned_agent IS NULL AND status=$2 ORDER BY id',
      [list_id, 'pending']
    );
    let idx = 0;
    for (const [agent, count] of Object.entries(distribution)) {
      for (let i = 0; i < count && idx < pending.length; i++, idx++) {
        await query('UPDATE customers SET assigned_agent=$1 WHERE id=$2', [agent, pending[idx].id]);
      }
    }
    res.json({ distributed: idx });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List customers for center (with filters)
// 보안: agent 역할은 본인 큐(assigned_agent==본인)만 조회 가능. 다른 실장 큐 누설 방지.
router.get('/', auth, async (req, res) => {
  try {
    const cid = req.user.center_id;
    const role = req.user.role;
    // limit clamp — 페이징 DoS 방어 (1000 행 상한)
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const { status, agent, list_id } = req.query;

    let sql = 'SELECT c.*, cl.title as list_title FROM customers c LEFT JOIN customer_lists cl ON c.list_id=cl.id WHERE c.center_id=$1';
    const params = [cid];
    let pi = 2;
    // ⭐ Agent isolation: agent 는 자기 assigned_agent 큐만 조회 가능
    if (role === 'agent') {
      sql += ` AND c.assigned_agent=$${pi++}`;
      params.push(req.user.agent_name);
    } else if (agent) {
      // 비-agent 역할만 agent 필터로 다른 사람 큐 조회 가능
      sql += ` AND c.assigned_agent=$${pi++}`;
      params.push(agent);
    }
    if (status) { sql += ` AND c.status=$${pi++}`; params.push(status); }
    if (list_id) { sql += ` AND c.list_id=$${pi++}`; params.push(list_id); }
    sql += ` ORDER BY c.id DESC LIMIT $${pi++} OFFSET $${pi}`;
    params.push(limit, offset);
    const { rows } = await query(sql, params);
    // Mask phone if center setting
    const center = await query('SELECT show_phone FROM centers WHERE id=$1', [cid]);
    if (!center.rows[0]?.show_phone) {
      rows.forEach(r => {
        if (r.phone_number) {
          r.phone_number = r.phone_number.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3');
        }
      });
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update customer status — center_id + agent ownership 검증 필수
router.put('/:id', auth, async (req, res) => {
  try {
    const { status, memo, no_answer_count } = req.body;
    const cid = req.user.center_id;
    const role = req.user.role;
    // 1) 대상 고객이 내 센터 소속인지 확인 (cross-center 차단)
    const target = await query('SELECT center_id, assigned_agent FROM customers WHERE id=$1', [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'customer not found' });
    }
    if (target.rows[0].center_id !== cid) {
      return res.status(403).json({ error: 'cross-center access denied' });
    }
    // 2) agent 는 자기 큐 고객만 수정 가능
    if (role === 'agent' && target.rows[0].assigned_agent !== req.user.agent_name) {
      return res.status(403).json({ error: 'not your customer' });
    }
    const { rows } = await query(
      `UPDATE customers SET status=COALESCE($1,status), memo=COALESCE($2,memo),
       no_answer_count=COALESCE($3,no_answer_count), updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status, memo, no_answer_count, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get per-list per-agent stats
router.get('/lists/:id/stats', auth, role('center_admin'), async (req, res) => {
  try {
    const lid = req.params.id;
    const { rows } = await query(`
      SELECT assigned_agent as agent,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status NOT IN ('pending','retry')) as used,
        COUNT(*) FILTER (WHERE status IN ('pending','retry')) as remaining,
        COUNT(*) FILTER (WHERE status='done' AND id IN (SELECT customer_id FROM calls WHERE result='connected')) as connected,
        COUNT(*) FILTER (WHERE status='no_answer') as no_answer,
        COUNT(*) FILTER (WHERE status='invalid') as invalid
      FROM customers WHERE list_id=$1 AND assigned_agent IS NOT NULL
      GROUP BY assigned_agent ORDER BY assigned_agent
    `, [lid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
