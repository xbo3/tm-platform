import { Router } from 'express';
import { query } from '../db.js';
import { auth, role } from '../auth.js';

const router = Router();

// Start 100-test
router.post('/start', auth, role('center_admin'), async (req, res) => {
  try {
    const { title, source } = req.body;
    const cid = req.user.center_id;

    // Create test list
    const list = await query(
      'INSERT INTO customer_lists (center_id,title,source,is_test,total_count) VALUES ($1,$2,$3,true,100) RETURNING *',
      [cid, title || 'Test DB', source || 'Test']
    );
    const lid = list.rows[0].id;

    // Generate 100 fake customers
    const agents = ['A','B','C','D','E'];
    for (let i = 0; i < 100; i++) {
      const agent = agents[i % 5];
      const phone = `010-${String(Math.floor(Math.random()*9000)+1000)}-${String(Math.floor(Math.random()*9000)+1000)}`;
      await query('INSERT INTO customers (list_id,center_id,name,phone_number,assigned_agent) VALUES ($1,$2,$3,$4,$5)',
        [lid, cid, `Test${i+1}`, phone, agent]);
    }

    res.json({ list_id: lid, count: 100 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stop test - delete test data
router.post('/stop', auth, role('center_admin'), async (req, res) => {
  try {
    const { list_id } = req.body;
    // Delete customers → calls → list
    await query('DELETE FROM calls WHERE customer_id IN (SELECT id FROM customers WHERE list_id=$1)', [list_id]);
    await query('DELETE FROM customers WHERE list_id=$1', [list_id]);
    await query('DELETE FROM customer_lists WHERE id=$1 AND is_test=true', [list_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Adopt test → production
router.post('/adopt', auth, role('center_admin'), async (req, res) => {
  try {
    const { list_id } = req.body;
    await query('UPDATE customer_lists SET is_test=false WHERE id=$1', [list_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
