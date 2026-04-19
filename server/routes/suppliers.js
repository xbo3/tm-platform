import { Router } from 'express';
import { query } from '../db.js';
import { auth, requireRole } from '../auth.js';

const router = Router();

// suppliers — super_admin 전용 CRUD

router.get('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM suppliers ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { tg_id, note } = req.body;
    if (!tg_id) return res.status(400).json({ error: 'tg_id required' });
    const { rows } = await query(
      `INSERT INTO suppliers (tg_id, note) VALUES ($1, $2)
        ON CONFLICT (tg_id) DO UPDATE SET note=EXCLUDED.note RETURNING *`,
      [tg_id, note || '']
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { tg_id, note } = req.body;
    const { rows } = await query(
      `UPDATE suppliers SET tg_id=COALESCE($1,tg_id), note=COALESCE($2,note)
        WHERE id=$3 RETURNING *`,
      [tg_id, note, +req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', auth, requireRole('super_admin'), async (req, res) => {
  try {
    await query(`DELETE FROM suppliers WHERE id=$1`, [+req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
