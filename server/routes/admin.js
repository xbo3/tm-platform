import { Router } from 'express';
import { query } from '../db.js';
import pool from '../db.js';
import { auth, requireRole } from '../auth.js';
import { isDeviceOnline } from '../ws.js';

const router = Router();

// POST /api/admin/connect-list  { list_id }
// 센터장이 DB 목록에서 '연결(실행)' → 그 DB만 단독 활성(배타). 기존 활성 DB는 진행된 번호/피드/
// 담당 상담원 기록을 그대로 보존한 채 비활성으로 멈춘다. 상담원은 교체를 모르고 다음 샌드부터 새 DB.
router.post('/connect-list', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  const { list_id } = req.body;
  if (!list_id) return res.status(400).json({ error: 'list_id required' });
  const cid = req.user.center_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tgt = await client.query(
      `SELECT id FROM customer_lists WHERE id=$1 AND center_id=$2 FOR UPDATE`,
      [list_id, cid]
    );
    if (tgt.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'List not found' });
    }
    // 배타: 이 센터의 다른 모든 DB 비활성 (is_active 플래그만 off, 기록 불변)
    await client.query(
      `UPDATE customer_lists SET is_active=false WHERE center_id=$1 AND id<>$2 AND is_active=true`,
      [cid, list_id]
    );
    // 선택 DB 단독 활성 (풀 분배라 사전 5분할 불필요 — is_distributed 만 표식)
    await client.query(
      `UPDATE customer_lists SET is_active=true, is_distributed=true WHERE id=$1`,
      [list_id]
    );
    await client.query(
      `INSERT INTO distribution_events (list_id, category, total_distributed, split_json, triggered_by)
       VALUES ($1, NULL, 0, '{}', 'connect')`,
      [list_id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, active_list_id: list_id });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET/POST /api/admin/noans-limit — 센터장이 부재 임계값(2 또는 3) 조회/설정.
// 설정은 이후 업로드되는 DB 부터 스냅샷으로 적용("결정 이후 자료부터"). 기존 DB 불변.
router.get('/noans-limit', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const { rows } = await query('SELECT COALESCE(no_answer_limit, 3) AS n FROM centers WHERE id=$1', [req.user.center_id]);
    res.json({ no_answer_limit: rows[0]?.n || 3 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/noans-limit', auth, requireRole('super_admin', 'center_admin'), async (req, res) => {
  try {
    const limit = parseInt(req.body.limit, 10);
    if (![2, 3].includes(limit)) return res.status(400).json({ error: 'limit must be 2 or 3' });
    await query('UPDATE centers SET no_answer_limit=$1 WHERE id=$2', [limit, req.user.center_id]);
    res.json({ ok: true, no_answer_limit: limit, note: '이후 업로드되는 DB 부터 적용 (기존 DB 불변)' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 품질 점수 가중치 — env 로 조정 가능. 슈퍼어드민 비공개 정책.
function loadFormula() {
  return {
    A: parseFloat(process.env.QUALITY_FORMULA_A || '0.4'), // connect_rate weight
    B: parseFloat(process.env.QUALITY_FORMULA_B || '0.4'), // positive_rate weight
    C: parseFloat(process.env.QUALITY_FORMULA_C || '0.2'), // invalid_rate penalty weight
  };
}

// GET /api/admin/db-quality?center_id=...
// 모든 센터 (또는 특정 센터)의 customer_lists 별 품질 점수
router.get('/db-quality', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { center_id } = req.query;
    const params = [];
    let where = '';
    if (center_id) {
      where = ` WHERE cl.center_id=$1`;
      params.push(+center_id);
    }
    const { rows } = await query(
      `SELECT cl.id, cl.center_id, cl.title, cl.source, cl.supplier_tg, cl.category,
              cl.total_count, cl.is_distributed, cl.is_active, cl.uploaded_at,
              COUNT(c.id) FILTER (WHERE c.status NOT IN ('pending','retry')) AS used,
              COUNT(c.id) FILTER (WHERE c.status='done') AS done,
              COUNT(c.id) FILTER (WHERE c.status='positive') AS positive,
              COUNT(c.id) FILTER (WHERE c.status IN ('invalid','invalid_pre')) AS invalid
         FROM customer_lists cl
         LEFT JOIN customers c ON c.list_id=cl.id
        ${where}
        GROUP BY cl.id
        ORDER BY cl.uploaded_at DESC`,
      params
    );

    const f = loadFormula();
    rows.forEach(r => {
      const used = +r.used || 0;
      const done = +r.done || 0;
      const positive = +r.positive || 0;
      const invalid = +r.invalid || 0;
      const total = +r.total_count || 0;
      const connect_rate = used > 0 ? done / used : 0;
      const positive_rate = used > 0 ? positive / used : 0;
      const invalid_rate = total > 0 ? invalid / total : 0;
      const score = connect_rate * f.A + positive_rate * f.B - invalid_rate * f.C;
      r.connect_rate = +(connect_rate * 100).toFixed(1);
      r.positive_rate = +(positive_rate * 100).toFixed(1);
      r.invalid_rate = +(invalid_rate * 100).toFixed(1);
      r.score = +score.toFixed(3);
    });

    rows.sort((a, b) => b.score - a.score);
    res.json({ formula: f, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/supplier-rank
// 공급자(@tg_id)별 평균 점수 — 슈퍼어드민의 협상 무기
router.get('/supplier-rank', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cl.supplier_tg AS supplier,
             COUNT(DISTINCT cl.id) AS db_count,
             SUM(cl.total_count) AS total_leads,
             COUNT(c.id) FILTER (WHERE c.status NOT IN ('pending','retry')) AS used,
             COUNT(c.id) FILTER (WHERE c.status='done') AS done,
             COUNT(c.id) FILTER (WHERE c.status='positive') AS positive,
             COUNT(c.id) FILTER (WHERE c.status IN ('invalid','invalid_pre')) AS invalid
        FROM customer_lists cl
        LEFT JOIN customers c ON c.list_id=cl.id
       WHERE cl.supplier_tg IS NOT NULL
       GROUP BY cl.supplier_tg
       ORDER BY supplier`);

    const f = loadFormula();
    rows.forEach(r => {
      const used = +r.used || 0;
      const done = +r.done || 0;
      const positive = +r.positive || 0;
      const invalid = +r.invalid || 0;
      const total = +r.total_leads || 0;
      const connect_rate = used > 0 ? done / used : 0;
      const positive_rate = used > 0 ? positive / used : 0;
      const invalid_rate = total > 0 ? invalid / total : 0;
      r.connect_rate = +(connect_rate * 100).toFixed(1);
      r.positive_rate = +(positive_rate * 100).toFixed(1);
      r.invalid_rate = +(invalid_rate * 100).toFixed(1);
      r.score = +(connect_rate * f.A + positive_rate * f.B - invalid_rate * f.C).toFixed(3);
    });
    rows.sort((a, b) => b.score - a.score);
    res.json({ formula: f, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/overview
// 전체 센터 overview
router.get('/overview', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { rows: centers } = await query(`
      SELECT c.id, c.name, c.plan, c.is_active,
             (SELECT COUNT(*) FROM phones WHERE center_id=c.id) AS phones,
             (SELECT COUNT(*) FROM users WHERE center_id=c.id AND role='agent') AS agents,
             (SELECT COUNT(*) FROM calls WHERE center_id=c.id) AS total_calls,
             (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND result='connected') AS connected,
             (SELECT COUNT(*) FROM calls WHERE center_id=c.id AND result='positive') AS positive
        FROM centers c ORDER BY c.id`);
    centers.forEach(r => {
      r.connect_rate = r.total_calls > 0 ? +(((+r.connected) / r.total_calls) * 100).toFixed(1) : 0;
    });
    res.json(centers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/recent-positives?limit=20
router.get('/recent-positives', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const limit = Math.min(+req.query.limit || 20, 200);
    const { rows } = await query(
      `SELECT cu.id, cu.name, cu.phone_number, cu.center_id, cu.assigned_agent,
              cu.updated_at, cl.title AS list_title
         FROM customers cu
         LEFT JOIN customer_lists cl ON cl.id=cu.list_id
        WHERE cu.status='positive'
        ORDER BY cu.updated_at DESC
        LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/center-phones
// 센터별 agent 폰 라이브 상태 매트릭스 (super_admin 전용).
// 응답: [ { center_id, center_name, is_active, agents: [{ user_id, name,
//   agent_name, phone_id, ws_online, is_active }] } ]
router.get('/center-phones', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.id   AS center_id,
             c.name AS center_name,
             c.is_active AS center_active,
             c.calling_paused,
             c.daily_call_limit,
             u.id   AS user_id,
             u.name AS user_name,
             u.agent_name,
             u.phone_id,
             u.is_active AS user_active,
             p.status AS phone_status,
             (SELECT COUNT(*) FROM calls ca
                WHERE ca.agent = u.agent_name AND ca.center_id = c.id
                  AND (ca.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
                      = (NOW() AT TIME ZONE 'Asia/Seoul')::date)::int AS today_calls
        FROM centers c
        LEFT JOIN users u ON u.center_id = c.id AND u.role = 'agent'
        LEFT JOIN phones p ON p.id = u.phone_id
       ORDER BY c.id, COALESCE(u.agent_name, ''), u.id`);

    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.center_id)) {
        groups.set(r.center_id, {
          center_id: r.center_id,
          center_name: r.center_name,
          is_active: r.center_active,
          calling_paused: r.calling_paused,
          daily_call_limit: r.daily_call_limit || 0,
          today_calls: 0,
          agents: [],
        });
      }
      if (r.user_id) {
        const online = isDeviceOnline(r.phone_id);
        const g = groups.get(r.center_id);
        g.today_calls += (r.today_calls || 0);
        g.agents.push({
          user_id: r.user_id,
          name: r.user_name,
          agent_name: r.agent_name,
          phone_id: r.phone_id,
          is_active: r.user_active,
          ws_online: online,
          // 엔진/전화 상태: 오프라인 / 통화중(calling) / 대기(idle)
          phone_state: !online ? 'offline' : (r.phone_status === 'calling' ? 'calling' : 'idle'),
          today_calls: r.today_calls || 0,
        });
      }
    }
    res.json([...groups.values()]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/center/:id/pause  { paused }  — 콜 발신 STOP/재개 (super_admin)
// calling_paused=true 면 /calls/next 가 그 센터에 번호 안 내줌. 로그인/데이터는 유지.
router.post('/center/:id/pause', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const paused = !!req.body.paused;
    const { rowCount } = await query(
      `UPDATE centers SET calling_paused=$1 WHERE id=$2`, [paused, +req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Center not found' });
    res.json({ ok: true, calling_paused: paused });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/center/:id/call-limit  { limit }  — 일일 콜 임계값 (0=무제한)
router.post('/center/:id/call-limit', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const limit = Math.max(0, parseInt(req.body.limit, 10) || 0);
    const { rowCount } = await query(
      `UPDATE centers SET daily_call_limit=$1 WHERE id=$2`, [limit, +req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Center not found' });
    res.json({ ok: true, daily_call_limit: limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/ai-cost
// 슈퍼어드민 — AI 분류 (Haiku) 실측 토큰/비용 집계.
// 응답: today / month / total + recent N. 비용은 USD, 토큰은 정수.
router.get('/ai-cost', auth, requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await query(`
      WITH agg AS (
        SELECT
          COALESCE(SUM(input_tokens),0)        AS input_tokens,
          COALESCE(SUM(output_tokens),0)       AS output_tokens,
          COALESCE(SUM(cache_read_tokens),0)   AS cache_read_tokens,
          COALESCE(SUM(cache_create_tokens),0) AS cache_create_tokens,
          COALESCE(SUM(cost_usd),0)            AS cost_usd,
          COUNT(*)                              AS calls
        FROM ai_usage
      )
      SELECT
        (SELECT row_to_json(agg) FROM agg)                                                                         AS total,
        (SELECT row_to_json(t) FROM (
           SELECT
             COALESCE(SUM(input_tokens),0)::int        AS input_tokens,
             COALESCE(SUM(output_tokens),0)::int       AS output_tokens,
             COALESCE(SUM(cache_read_tokens),0)::int   AS cache_read_tokens,
             COALESCE(SUM(cache_create_tokens),0)::int AS cache_create_tokens,
             COALESCE(SUM(cost_usd),0)                  AS cost_usd,
             COUNT(*)::int                              AS calls
           FROM ai_usage
           WHERE created_at >= date_trunc('day', NOW())
         ) t)                                                                                                       AS today,
        (SELECT row_to_json(t) FROM (
           SELECT
             COALESCE(SUM(input_tokens),0)::int        AS input_tokens,
             COALESCE(SUM(output_tokens),0)::int       AS output_tokens,
             COALESCE(SUM(cache_read_tokens),0)::int   AS cache_read_tokens,
             COALESCE(SUM(cache_create_tokens),0)::int AS cache_create_tokens,
             COALESCE(SUM(cost_usd),0)                  AS cost_usd,
             COUNT(*)::int                              AS calls
           FROM ai_usage
           WHERE created_at >= date_trunc('month', NOW())
         ) t)                                                                                                       AS month
    `);

    const r = rows[0] || {};
    const recent = await query(
      `SELECT id, call_id, model, input_tokens, output_tokens,
              cache_read_tokens, cache_create_tokens, cost_usd, latency_ms, created_at
         FROM ai_usage
         ORDER BY created_at DESC
         LIMIT 20`
    );

    res.json({
      pricing_per_million_usd: {
        input: 1.00,
        output: 5.00,
        cache_read: 0.10,
        cache_create: 1.25,
      },
      today: r.today || { input_tokens:0, output_tokens:0, cache_read_tokens:0, cache_create_tokens:0, cost_usd:0, calls:0 },
      month: r.month || { input_tokens:0, output_tokens:0, cache_read_tokens:0, cache_create_tokens:0, cost_usd:0, calls:0 },
      total: r.total || { input_tokens:0, output_tokens:0, cache_read_tokens:0, cache_create_tokens:0, cost_usd:0, calls:0 },
      recent: recent.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
