import { Router } from 'express';
import { query } from '../db.js';
import { auth, requireRole } from '../auth.js';
import { isDeviceOnline } from '../ws.js';

const router = Router();

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
             u.id   AS user_id,
             u.name AS user_name,
             u.agent_name,
             u.phone_id,
             u.is_active AS user_active
        FROM centers c
        LEFT JOIN users u ON u.center_id = c.id AND u.role = 'agent'
       ORDER BY c.id, COALESCE(u.agent_name, ''), u.id`);

    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.center_id)) {
        groups.set(r.center_id, {
          center_id: r.center_id,
          center_name: r.center_name,
          is_active: r.center_active,
          agents: [],
        });
      }
      if (r.user_id) {
        groups.get(r.center_id).agents.push({
          user_id: r.user_id,
          name: r.user_name,
          agent_name: r.agent_name,
          phone_id: r.phone_id,
          is_active: r.user_active,
          ws_online: isDeviceOnline(r.phone_id),
        });
      }
    }
    res.json([...groups.values()]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
