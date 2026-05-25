import { Router } from 'express';
import { query } from '../db.js';
import { auth } from '../auth.js';

const router = Router();

// Get next customer for agent
// 활성(is_active=true) DB 만, 활성화 최신순(uploaded_at DESC) 우선.
// 5/26 biplays spec: 다음날 업무 스타트 시 어제 부재(no_answer) 부터 우선 배정.
// 우선순위: retry (재콜 약속) > 어제 부재 (no_answer + updated_at < TODAY) > pending (신규) > 오늘 부재 (no_answer, updated_at = TODAY)
router.post('/next', auth, async (req, res) => {
  try {
    const cid = req.user.center_id;
    const agent = req.user.name?.replace('Agent ', '') || 'A';
    const { rows } = await query(
      `SELECT c.id, c.name, c.phone_number, c.memo, c.status
         FROM customers c
         INNER JOIN customer_lists cl ON c.list_id = cl.id
        WHERE c.center_id=$1
          AND c.assigned_agent=$2
          AND c.status IN ('pending','retry','no_answer')
          AND cl.is_active = true
        ORDER BY CASE
                   WHEN c.status='retry' THEN 0
                   WHEN c.status='no_answer' AND c.updated_at::date < CURRENT_DATE THEN 1
                   WHEN c.status='pending' THEN 2
                   ELSE 3
                 END,
                 cl.uploaded_at DESC,
                 c.id ASC
        LIMIT 1`,
      [cid, agent]
    );
    if (rows.length === 0) return res.json({ customer: null, message: 'No more customers' });
    // Mask phone based on center setting
    const center = await query('SELECT show_phone FROM centers WHERE id=$1', [cid]);
    const c = rows[0];
    if (!center.rows[0]?.show_phone) {
      c.phone_display = c.phone_number.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3');
    } else {
      c.phone_display = c.phone_number;
    }
    // Mark as calling
    await query('UPDATE customers SET status=$1, updated_at=NOW() WHERE id=$2', ['calling', c.id]);
    res.json({ customer: c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Start call
router.post('/start', auth, async (req, res) => {
  try {
    const { customer_id } = req.body;
    const cid = req.user.center_id;
    const agent = req.user.name?.replace('Agent ', '') || 'A';
    const call = await query(
      'INSERT INTO calls (customer_id, center_id, agent, started_at) VALUES ($1,$2,$3,NOW()) RETURNING *',
      [customer_id, cid, agent]
    );
    // Update phone status
    if (req.user.phone_id) {
      await query('UPDATE phones SET status=$1 WHERE id=$2', ['calling', req.user.phone_id]);
    }
    res.json(call.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// End call
router.put('/:id/end', auth, async (req, res) => {
  try {
    const { result, duration_sec } = req.body;
    const call = await query(
      'UPDATE calls SET result=$1, duration_sec=$2, ended_at=NOW() WHERE id=$3 RETURNING *',
      [result, duration_sec, req.params.id]
    );
    const c = call.rows[0];

    // Update customer status based on result
    if (c.customer_id) {
      if (result === 'connected') {
        await query('UPDATE customers SET status=$1, updated_at=NOW() WHERE id=$2', ['done', c.customer_id]);
      } else if (result === 'no_answer') {
        // Increment no_answer_count
        const cust = await query('UPDATE customers SET no_answer_count=no_answer_count+1, updated_at=NOW() WHERE id=$1 RETURNING no_answer_count', [c.customer_id]);
        const count = cust.rows[0].no_answer_count;
        // Check center auto-exclude setting
        const center = await query('SELECT auto_noans_exclude FROM centers WHERE id=$1', [c.center_id]);
        if (center.rows[0]?.auto_noans_exclude && count >= 3) {
          await query('UPDATE customers SET status=$1 WHERE id=$2', ['no_answer', c.customer_id]);
        } else {
          await query('UPDATE customers SET status=$1 WHERE id=$2', ['retry', c.customer_id]);
        }
      } else if (result === 'invalid') {
        await query('UPDATE customers SET status=$1 WHERE id=$2', ['invalid', c.customer_id]);
      } else {
        await query('UPDATE customers SET status=$1 WHERE id=$2', ['retry', c.customer_id]);
      }
    }

    // Update phone status back to idle
    if (req.user.phone_id) {
      await query('UPDATE phones SET status=$1 WHERE id=$2', ['idle', req.user.phone_id]);
    }

    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save memo
router.post('/:id/memo', auth, async (req, res) => {
  try {
    const { memo, customer_id } = req.body;
    if (customer_id) {
      await query('UPDATE customers SET memo=$1, updated_at=NOW() WHERE id=$2', [memo, customer_id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
