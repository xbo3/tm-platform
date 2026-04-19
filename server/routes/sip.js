import { Router } from 'express';
import { query } from '../db.js';
import { auth, requireRole } from '../auth.js';

const router = Router();

// POST /api/sip/precheck/:list_id
// SIP 결번 사전 거르기 — 현재는 mock (10% 결번 처리). 실제 VMGate 연동 TODO.
router.post('/precheck/:list_id', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const list_id = +req.params.list_id;
    const cid = req.user.center_id;

    const list = await query(
      `SELECT id FROM customer_lists WHERE id=$1 AND center_id=$2`,
      [list_id, cid]
    );
    if (list.rows.length === 0) return res.status(404).json({ error: 'List not found' });

    const { rows: pendings } = await query(
      `SELECT id FROM customers WHERE list_id=$1 AND status='pending'`,
      [list_id]
    );
    const total = pendings.length;

    // run 시작
    const run = await query(
      `INSERT INTO sip_precheck_runs (list_id, total, status) VALUES ($1, $2, 'running') RETURNING id`,
      [list_id, total]
    );
    const run_id = run.rows[0].id;

    // TODO: VMGate + SIP 서버 호출로 진짜 결번 판별. 현재는 10% mock.
    const sample = pendings.filter(() => Math.random() < 0.1);
    for (const c of sample) {
      await query(
        `UPDATE customers SET status='invalid_pre', updated_at=NOW() WHERE id=$1`,
        [c.id]
      );
    }

    await query(
      `UPDATE sip_precheck_runs
         SET finished_at=NOW(), invalid_count=$1, status='done'
       WHERE id=$2`,
      [sample.length, run_id]
    );
    await query(
      `UPDATE customer_lists SET is_sip_prechecked=true WHERE id=$1`,
      [list_id]
    );

    res.json({ ok: true, run_id, total, invalid_count: sample.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sip/precheck/:run_id
router.get('/precheck/:run_id', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM sip_precheck_runs WHERE id=$1`,
      [+req.params.run_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Run not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sip/runs?list_id=...
router.get('/runs', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { list_id } = req.query;
    const params = [];
    let sql = `SELECT * FROM sip_precheck_runs`;
    if (list_id) {
      sql += ` WHERE list_id=$1`;
      params.push(list_id);
    }
    sql += ` ORDER BY started_at DESC LIMIT 50`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
