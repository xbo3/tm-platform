import { Router } from 'express';
import { query } from '../db.js';
import { auth, role } from '../auth.js';

const router = Router();

router.get('/', auth, role('center_admin'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { rows } = await query(`
      SELECT r.*, c.agent, c.duration_sec, c.started_at, c.result,
        cu.name as customer_name, cu.phone_number
      FROM recordings r
      JOIN calls c ON r.call_id=c.id
      LEFT JOIN customers cu ON c.customer_id=cu.id
      WHERE c.center_id=$1 ORDER BY r.created_at DESC LIMIT 100
    `, [cid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
