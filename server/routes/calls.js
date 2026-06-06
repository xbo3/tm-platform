import { Router } from 'express';
import { query } from '../db.js';
import pool from '../db.js';
import { auth } from '../auth.js';

const router = Router();

// Get next customer for agent — "센터장 모델 A" 2-tier 분배 (biplays 6/03)
//  [Tier 1 — 업무 시작 우선처리] 내가 이전 업무일에 부재 처리한 번호(나에게 귀속)를 먼저 소진.
//    업무일 경계 = 매일 오전 10:00 KST. 업무일 = (KST시각 − 10h)의 날짜.
//    오늘 찍힌 부재는 오늘 다시 안 뜨고 내일 10시 지나야 뜬다.
//  [Tier 2 — 신규 분배] 어제 부재가 없으면, 센터의 '연결된(is_active=true)' 단일 DB 풀에서
//    '한 번도 안 친(pending)' 번호를 id(업로드)순으로 1개 꺼낸다. assigned_agent 사전배정 무시 =
//    공유 FCFS 큐(샌드 먼저 누른 상담원이 맨 앞 번호). 2명이든 5명이든 분배방식 동일.
//  동시성: 단일 트랜잭션 + FOR UPDATE SKIP LOCKED 로 중복 배정 방지.
router.post('/next', auth, async (req, res) => {
  const cid = req.user.center_id;
  const agent = req.user.agent_name || req.user.name?.replace('Agent ', '') || 'A';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tier 1: 내 귀속 부재(retry/no_answer, 임계 미만) 중 이전 업무일(KST 10시 경계)에 찍힌 것부터.
    // 비활성화된(is_active=false) DB의 이월 건은 분배 대상에서 제외되도록 cl.is_active = true 조건 추가.
    let pick = await client.query(
      `SELECT c.id, c.name, c.phone_number, c.memo, c.status
         FROM customers c
         JOIN customer_lists cl ON cl.id = c.list_id
        WHERE c.assigned_agent = $1
          AND cl.is_active = true
          AND c.status IN ('retry','no_answer')
          AND c.no_answer_count < COALESCE(cl.no_answer_limit, 3)
          AND (((c.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
              < (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
        ORDER BY c.id ASC
        LIMIT 1
        FOR UPDATE OF c SKIP LOCKED`,
      [agent]
    );

    // Tier 2: 어제 부재가 없으면 연결된 단일 DB 의 신규(pending) 번호 풀에서 순차 분배.
    // 단일 DB 고정: is_active=true 가 여러 개 남아있어도 섞이지 않게 최신 활성 1개만.
    if (pick.rows.length === 0) {
      pick = await client.query(
        `SELECT c.id, c.name, c.phone_number, c.memo, c.status
           FROM customers c
          WHERE c.center_id = $1
            AND c.list_id = (
              SELECT id FROM customer_lists
               WHERE center_id = $1 AND is_active = true
               ORDER BY uploaded_at DESC, id DESC
               LIMIT 1
            )
            AND c.status = 'pending'
          ORDER BY c.id ASC
          LIMIT 1
          FOR UPDATE OF c SKIP LOCKED`,
        [cid]
      );
    }

    if (pick.rows.length === 0) {
      await client.query('COMMIT');
      return res.json({ customer: null, message: 'No more customers' });
    }

    const c = pick.rows[0];
    // 잠근 즉시 calling 으로 마킹 → 다른 상담원 풀에서 자동 제외. 누가 받았는지 기록.
    await client.query(
      `UPDATE customers SET status='calling', assigned_agent=$1, updated_at=NOW() WHERE id=$2`,
      [agent, c.id]
    );
    await client.query('COMMIT');

    // Mask phone based on center setting (블라인드: 마스킹된 표시값만 내려보냄)
    const center = await query('SELECT show_phone FROM centers WHERE id=$1', [cid]);
    if (!center.rows[0]?.show_phone) {
      c.phone_display = c.phone_number.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3');
    } else {
      c.phone_display = c.phone_number;
    }
    res.json({ customer: c });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
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
      } else if (result === 'positive') {
        await query('UPDATE customers SET status=$1, updated_at=NOW() WHERE id=$2', ['positive', c.customer_id]);
      } else if (result === 'reject') {
        await query('UPDATE customers SET status=$1, updated_at=NOW() WHERE id=$2', ['reject', c.customer_id]);
      } else if (result === 'recall') {
        await query('UPDATE customers SET status=$1, updated_at=NOW() WHERE id=$2', ['recall', c.customer_id]);
      } else if (result === 'no_answer') {
        // 고유 부재일수(KST 업무일 기준 COUNT DISTINCT) 계산 및 업데이트 + updated_at=NOW()
        const cust = await query(
          `UPDATE customers cu
              SET no_answer_count = (
                SELECT COUNT(DISTINCT ((started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
                  FROM calls
                 WHERE customer_id = cu.id AND result = 'no_answer'
              ),
              updated_at = NOW()
            WHERE id = $1
            RETURNING no_answer_count`,
          [c.customer_id]
        );
        const count = cust.rows[0]?.no_answer_count || 0;
        // 임계값 = 이 번호가 속한 DB(리스트)의 스냅샷값(없으면 센터 현재값, 그것도 없으면 3).
        const lim = await query(
          `SELECT COALESCE(cl.no_answer_limit, ce.no_answer_limit, 3) AS n
             FROM customers cu
             JOIN customer_lists cl ON cl.id = cu.list_id
             JOIN centers ce ON ce.id = cu.center_id
            WHERE cu.id = $1`,
          [c.customer_id]
        );
        const limit = lim.rows[0]?.n || 3;
        if (count >= limit) {
          // 임계 도달 = 장기미연결번호. 분배/재시도에서 영구 제외 (dormant).
          await query("UPDATE customers SET status='dormant', dormant_since=NOW() WHERE id=$1", [c.customer_id]);
        } else {
          // 임계 미만 부재 = 그 상담원에게 귀속. 다음 업무일 Tier1 에서 우선 재콜. assigned_agent 유지.
          await query("UPDATE customers SET status='retry' WHERE id=$1", [c.customer_id]);
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

// GET /api/calls/my-carryover
// 상담원 대시보드 "할 일" 패널용. 부재 번호는 이미 콜 시점에 공개됐으므로 번호 그대로 노출.
//  - today_due:     이전 업무일에 찍힌 내 부재 → 오늘 Tier1 에서 그 번호부터 처리됨.
//  - tomorrow_todo: 오늘 업무일에 찍힌 내 부재 → "내일 할일", 내일 10시 이후 처리.
// 업무일 경계 = 오전 10:00 KST. 업무일 = (KST시각 − 10h)의 날짜.
router.get('/my-carryover', auth, async (req, res) => {
  try {
    const agent = req.user.agent_name || req.user.name?.replace('Agent ', '') || 'A';
    const { rows } = await query(
      `SELECT c.id, c.name, c.phone_number, c.no_answer_count, c.updated_at,
              (((c.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
                < (((NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date) AS due_now
         FROM customers c
         JOIN customer_lists cl ON cl.id = c.list_id
        WHERE c.assigned_agent=$1 AND c.status IN ('retry','no_answer')
          AND cl.is_active = true
          AND c.no_answer_count < COALESCE(cl.no_answer_limit, 3)
         ORDER BY c.id ASC`,
      [agent]
    );
    const today_due = rows.filter(r => r.due_now);
    const tomorrow_todo = rows.filter(r => !r.due_now);
    res.json({
      today_due_count: today_due.length,
      tomorrow_todo_count: tomorrow_todo.length,
      today_due,
      tomorrow_todo,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
