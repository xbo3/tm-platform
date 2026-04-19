import { Router } from 'express';
import { query } from '../db.js';
import { auth, requireRole } from '../auth.js';

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

export default router;
