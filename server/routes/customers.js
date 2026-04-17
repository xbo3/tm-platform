import { Router } from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { auth, role } from '../auth.js';

const router = Router();
const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

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

// Upload excel (simplified - accepts JSON array for now)
router.post('/upload', auth, role('center_admin'), async (req, res) => {
  try {
    const { title, source, is_test, customers } = req.body;
    const cid = req.user.center_id;
    const list = await query(
      'INSERT INTO customer_lists (center_id,title,source,is_test,total_count) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [cid, title, source, is_test || false, customers.length]
    );
    const lid = list.rows[0].id;
    for (const c of customers) {
      await query('INSERT INTO customers (list_id,center_id,name,phone_number) VALUES ($1,$2,$3,$4)',
        [lid, cid, c.name, c.phone]);
    }
    res.json({ list: list.rows[0], count: customers.length });
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
router.get('/', auth, async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { status, agent, list_id, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT c.*, cl.title as list_title FROM customers c LEFT JOIN customer_lists cl ON c.list_id=cl.id WHERE c.center_id=$1';
    const params = [cid];
    let pi = 2;
    if (status) { sql += ` AND c.status=$${pi++}`; params.push(status); }
    if (agent) { sql += ` AND c.assigned_agent=$${pi++}`; params.push(agent); }
    if (list_id) { sql += ` AND c.list_id=$${pi++}`; params.push(list_id); }
    sql += ` ORDER BY c.id DESC LIMIT $${pi++} OFFSET $${pi}`;
    params.push(limit, offset);
    const { rows } = await query(sql, params);
    // Mask phone if center setting
    const center = await query('SELECT show_phone FROM centers WHERE id=$1', [cid]);
    if (!center.rows[0]?.show_phone) {
      rows.forEach(r => { r.phone_number = r.phone_number.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3'); });
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update customer status
router.put('/:id', auth, async (req, res) => {
  try {
    const { status, memo, no_answer_count } = req.body;
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
