import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { auth, role } from '../auth.js';

const router = Router();

// List all centers (super_admin)
router.get('/', auth, role('super_admin'), async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*, u.name as owner_name, u.email as owner_email,
        (SELECT COUNT(*) FROM phones WHERE center_id=c.id) as phone_count,
        (SELECT COUNT(*) FROM calls WHERE center_id=c.id) as total_calls,
        (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND result='connected') as connected_calls
      FROM centers c LEFT JOIN users u ON c.owner_id=u.id ORDER BY c.id
    `);
    rows.forEach(r => { r.rate = r.total_calls > 0 ? ((r.connected_calls / r.total_calls) * 100).toFixed(1) : 0; });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create center (super_admin)
router.post('/', auth, role('super_admin'), async (req, res) => {
  try {
    const { name, owner_email, owner_name, phone_count = 5, plan = 'basic' } = req.body;
    // Create center
    const center = await query('INSERT INTO centers (name, plan) VALUES ($1,$2) RETURNING *', [name, plan]);
    const cid = center.rows[0].id;
    // Create center admin
    const hash = await bcrypt.hash('center123', 10);
    const admin = await query('INSERT INTO users (email,password,role,name,center_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [owner_email, hash, 'center_admin', owner_name, cid]);
    await query('UPDATE centers SET owner_id=$1 WHERE id=$2', [admin.rows[0].id, cid]);
    // Create phones + agents
    const agentHash = await bcrypt.hash('agent123', 10);
    for (let i = 0; i < phone_count; i++) {
      const sip = `${2000 + (cid - 1) * 10 + i + 1}`;
      const phone = await query('INSERT INTO phones (center_id, sip_account) VALUES ($1,$2) RETURNING id', [cid, sip]);
      const letter = String.fromCharCode(65 + i);
      await query('INSERT INTO users (email,password,role,name,center_id,phone_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [`agent${letter.toLowerCase()}_c${cid}@tm.co.kr`, agentHash, 'agent', `Agent ${letter}`, cid, phone.rows[0].id]);
    }
    res.json({ ...center.rows[0], phone_count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get center detail
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM centers WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update center settings
router.put('/:id', auth, role('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { dist_mode, show_phone, auto_noans_exclude, auto_invalid_detect, plan } = req.body;
    const { rows } = await query(
      `UPDATE centers SET
        dist_mode=COALESCE($1,dist_mode), show_phone=COALESCE($2,show_phone),
        auto_noans_exclude=COALESCE($3,auto_noans_exclude), auto_invalid_detect=COALESCE($4,auto_invalid_detect),
        plan=COALESCE($5,plan) WHERE id=$6 RETURNING *`,
      [dist_mode, show_phone, auto_noans_exclude, auto_invalid_detect, plan, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
