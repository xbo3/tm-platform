import { Router } from 'express';
import { query } from '../db.js';
import { auth, role } from '../auth.js';

const router = Router();

// Center dashboard stats
router.get('/dashboard', auth, role('center_admin'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const today = new Date().toISOString().split('T')[0];

    // Agent stats
    const { rows: agents } = await query(`
      SELECT u.name, u.phone_id,
        p.sip_account, p.status as phone_status,
        (SELECT COUNT(*) FROM calls WHERE agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND started_at::date=$2) as calls,
        (SELECT COUNT(*) FROM calls WHERE agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND started_at::date=$2 AND result='connected') as connected,
        (SELECT COALESCE(SUM(duration_sec),0) FROM calls WHERE agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND started_at::date=$2 AND result='connected') as talk_time,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND status='no_answer') as no_answer,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND no_answer_count=1) as no_answer_1,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND no_answer_count=2) as no_answer_2,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND no_answer_count>=3) as no_answer_3,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND status='invalid') as invalid,
        (SELECT COUNT(*) FROM customers WHERE assigned_agent=REPLACE(u.name,'Agent ','') AND center_id=$1 AND status IN ('pending','retry')) as pending
      FROM users u LEFT JOIN phones p ON u.phone_id=p.id
      WHERE u.center_id=$1 AND u.role='agent' ORDER BY u.name
    `, [cid, today]);

    // Hourly data
    const { rows: hourly } = await query(`
      SELECT EXTRACT(HOUR FROM started_at)::int as hour, agent,
        COUNT(*) as calls,
        COUNT(*) FILTER (WHERE result='connected') as connected
      FROM calls WHERE center_id=$1 AND started_at::date=$2
      GROUP BY hour, agent ORDER BY hour
    `, [cid, today]);

    // Totals
    const totalCalls = agents.reduce((a, b) => a + parseInt(b.calls), 0);
    const totalConn = agents.reduce((a, b) => a + parseInt(b.connected), 0);
    const totalTalk = agents.reduce((a, b) => a + parseInt(b.talk_time), 0);
    const totalNA = agents.reduce((a, b) => a + parseInt(b.no_answer), 0);
    const totalInv = agents.reduce((a, b) => a + parseInt(b.invalid), 0);

    res.json({
      agents: agents.map(a => ({
        ...a,
        rate: a.calls > 0 ? ((a.connected / a.calls) * 100).toFixed(1) : 0,
      })),
      hourly,
      totals: { calls: totalCalls, connected: totalConn, talk_time: totalTalk, no_answer: totalNA, invalid: totalInv,
        rate: totalCalls > 0 ? ((totalConn / totalCalls) * 100).toFixed(1) : 0 },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DB quality stats
router.get('/db-quality', auth, role('center_admin'), async (req, res) => {
  try {
    const cid = req.user.center_id;
    const { rows } = await query(`
      SELECT cl.id, cl.title, cl.source, cl.total_count, cl.is_test, cl.uploaded_at,
        COUNT(c.id) FILTER (WHERE c.status NOT IN ('pending','retry')) as used,
        COUNT(c.id) FILTER (WHERE c.status IN ('pending','retry')) as remaining,
        COUNT(c.id) FILTER (WHERE c.status='done') as done,
        COUNT(c.id) FILTER (WHERE c.status='invalid') as invalid,
        COUNT(c.id) FILTER (WHERE c.status='no_answer') as no_answer
      FROM customer_lists cl LEFT JOIN customers c ON cl.id=c.list_id
      WHERE cl.center_id=$1 GROUP BY cl.id ORDER BY cl.uploaded_at DESC
    `, [cid]);
    rows.forEach(r => {
      r.connect_rate = r.used > 0 ? ((r.done / r.used) * 100).toFixed(1) : 0;
      r.invalid_rate = r.used > 0 ? ((r.invalid / r.used) * 100).toFixed(1) : 0;
    });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Super admin stats
router.get('/overview', auth, role('super_admin'), async (req, res) => {
  try {
    const { rows: centers } = await query(`
      SELECT c.id, c.name, c.plan, c.is_active,
        (SELECT COUNT(*) FROM phones WHERE center_id=c.id) as phones,
        (SELECT COUNT(*) FROM calls WHERE center_id=c.id) as total_calls,
        (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND result='connected') as connected
      FROM centers c ORDER BY c.id
    `);
    centers.forEach(r => { r.rate = r.total_calls > 0 ? ((r.connected / r.total_calls) * 100).toFixed(1) : 0; });
    res.json(centers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
