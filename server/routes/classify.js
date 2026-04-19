import { Router } from 'express';
import { query } from '../db.js';
import { auth } from '../auth.js';

const router = Router();

// POST /api/classify/:call_id
// 통화 끝난 후 분류. 현재 mock — duration 기반. 추후 Claude Haiku + STT 연동.
// TODO: Claude Haiku 연동 (긍정/거절/재콜 + 시간 추출 + quality_flag)
router.post('/:call_id', auth, async (req, res) => {
  try {
    const call_id = +req.params.call_id;
    const call = await query(
      `SELECT id, duration_sec, customer_id FROM calls WHERE id=$1`,
      [call_id]
    );
    if (call.rows.length === 0) return res.status(404).json({ error: 'Call not found' });

    const c = call.rows[0];
    const dur = c.duration_sec || 0;

    // mock 분류 — duration 기반:
    //   30초 미만: reject (빠른 거절)
    //   30-90초: recall (다시 걸어달라)
    //   90초 이상: positive (긍정 의사)
    let ai_category = 'reject';
    let ai_confidence = 0.6;
    let recall_time = null;
    if (dur >= 90) {
      ai_category = 'positive';
      ai_confidence = 0.78;
    } else if (dur >= 30) {
      ai_category = 'recall';
      ai_confidence = 0.65;
      recall_time = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    }

    const stt_text = `[mock STT] duration=${dur}s — full STT once Whisper hooked up`;

    // upsert (한 통화당 1개 분류)
    await query(`DELETE FROM call_classifications WHERE call_id=$1`, [call_id]);
    await query(
      `INSERT INTO call_classifications
        (call_id, stt_text, ai_category, ai_confidence, recall_time)
        VALUES ($1, $2, $3, $4, $5)`,
      [call_id, stt_text, ai_category, ai_confidence, recall_time]
    );

    // customer status 동기화
    if (c.customer_id) {
      if (ai_category === 'positive') {
        await query(`UPDATE customers SET status='positive', updated_at=NOW() WHERE id=$1`, [c.customer_id]);
      } else if (ai_category === 'recall') {
        await query(
          `UPDATE customers SET status='recall', recall_at=$1, updated_at=NOW() WHERE id=$2`,
          [recall_time, c.customer_id]
        );
      }
    }

    res.json({ ok: true, ai_category, ai_confidence, recall_time, stt_text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/classify/:call_id
router.get('/:call_id', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM call_classifications WHERE call_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [+req.params.call_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No classification' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
