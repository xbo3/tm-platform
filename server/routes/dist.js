import { Router } from 'express';
import { query } from '../db.js';
import { auth, requireRole } from '../auth.js';

const router = Router();

// 5명 균등 분배 (나머지는 1건씩 추가)
function splitEqual(total, agents) {
  const n = agents.length;
  const base = Math.floor(total / n);
  const extra = total - base * n;
  const out = {};
  agents.forEach((a, i) => {
    out[a] = base + (i < extra ? 1 : 0);
  });
  return out;
}

async function listAgents(cid) {
  const { rows } = await query(
    `SELECT agent_name FROM users
      WHERE center_id=$1 AND role='agent' AND agent_name IS NOT NULL
      ORDER BY agent_name`,
    [cid]
  );
  return rows.map(r => r.agent_name);
}

// POST /api/dist/preview { list_id }
// 분배 모달 띄우기 직전 호출 → 5분할 미리 보여주기
router.post('/preview', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { list_id } = req.body;
    if (!list_id) return res.status(400).json({ error: 'list_id required' });

    const cid = req.user.center_id;
    const list = await query(
      `SELECT id, title, supplier_tg, category FROM customer_lists
        WHERE id=$1 AND center_id=$2`,
      [list_id, cid]
    );
    if (list.rows.length === 0) return res.status(404).json({ error: 'List not found' });

    // 미사용(pending + assigned_agent IS NULL) + invalid_pre 제외
    const { rows: pendingRows } = await query(
      `SELECT id FROM customers
        WHERE list_id=$1 AND assigned_agent IS NULL
          AND status='pending'`,
      [list_id]
    );
    const total = pendingRows.length;

    const agents = await listAgents(cid);
    if (agents.length === 0)
      return res.status(400).json({ error: 'No agents available' });

    const split = splitEqual(total, agents);
    res.json({
      list: list.rows[0],
      total,
      agents,
      split,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dist/execute { list_id, category?, supplier_tg? }
// 분배 확정: pending 고객 5명에게 분배, customer_lists 메타 업데이트, 이벤트 기록
router.post('/execute', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { list_id, category, supplier_tg, triggered_by = 'manual' } = req.body;
    if (!list_id) return res.status(400).json({ error: 'list_id required' });

    const cid = req.user.center_id;
    const list = await query(
      `SELECT id FROM customer_lists WHERE id=$1 AND center_id=$2`,
      [list_id, cid]
    );
    if (list.rows.length === 0) return res.status(404).json({ error: 'List not found' });

    const { rows: pending } = await query(
      `SELECT id FROM customers
        WHERE list_id=$1 AND assigned_agent IS NULL AND status='pending'
        ORDER BY id`,
      [list_id]
    );
    const total = pending.length;

    const agents = await listAgents(cid);
    if (agents.length === 0)
      return res.status(400).json({ error: 'No agents available' });

    const split = splitEqual(total, agents);

    // 5분할 대로 assigned_agent 채우기
    let idx = 0;
    for (const agent of agents) {
      const cnt = split[agent] || 0;
      for (let i = 0; i < cnt && idx < pending.length; i++, idx++) {
        await query(
          `UPDATE customers SET assigned_agent=$1, updated_at=NOW() WHERE id=$2`,
          [agent, pending[idx].id]
        );
      }
    }

    // customer_lists 메타 갱신
    await query(
      `UPDATE customer_lists
          SET is_distributed=true,
              is_active=true,
              category=COALESCE($1, category),
              supplier_tg=COALESCE($2, supplier_tg)
        WHERE id=$3`,
      [category || null, supplier_tg || null, list_id]
    );

    // 이벤트 기록
    await query(
      `INSERT INTO distribution_events
        (list_id, category, total_distributed, split_json, triggered_by)
        VALUES ($1, $2, $3, $4, $5)`,
      [list_id, category || null, total, JSON.stringify(split), triggered_by]
    );

    res.json({ ok: true, distributed: total, split });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dist/events?list_id=...
router.get('/events', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { list_id } = req.query;
    const params = [];
    let sql = `SELECT * FROM distribution_events`;
    if (list_id) {
      sql += ` WHERE list_id=$1`;
      params.push(list_id);
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
