import cron from 'node-cron';
import { query } from './db.js';

const tasks = [];

// 매 5분: 오토연결 — 활성 DB 잔여 < threshold 이면 같은 카테고리 다음 DB 활성화
async function autoConnectCheck() {
  try {
    const { rows: actives } = await query(`
      SELECT id, center_id, category, auto_connect_threshold
        FROM customer_lists
       WHERE auto_connect=true AND is_active=true AND is_distributed=true`);

    for (const list of actives) {
      const { rows: rem } = await query(
        `SELECT COUNT(*)::int AS n FROM customers WHERE list_id=$1 AND status='pending'`,
        [list.id]
      );
      if (rem[0].n > (list.auto_connect_threshold || 30)) continue;

      // 같은 category, auto_connect ON, 미분배 중 가장 오래된 list 찾기
      const { rows: next } = await query(`
        SELECT id FROM customer_lists
         WHERE center_id=$1 AND category=$2
           AND auto_connect=true AND is_distributed=false
         ORDER BY uploaded_at ASC LIMIT 1`,
        [list.center_id, list.category]
      );
      if (!next.length) continue;

      // 다음 list 분배 (5명 균등)
      const nextId = next[0].id;
      const { rows: pending } = await query(
        `SELECT id FROM customers WHERE list_id=$1 AND assigned_agent IS NULL AND status='pending' ORDER BY id`,
        [nextId]
      );
      const { rows: agentRows } = await query(
        `SELECT agent_name FROM users WHERE center_id=$1 AND role='agent' AND agent_name IS NOT NULL ORDER BY agent_name`,
        [list.center_id]
      );
      const agents = agentRows.map(r => r.agent_name);
      if (!agents.length) continue;

      const split = {};
      const base = Math.floor(pending.length / agents.length);
      const extra = pending.length - base * agents.length;
      agents.forEach((a, i) => { split[a] = base + (i < extra ? 1 : 0); });

      let idx = 0;
      for (const a of agents) {
        for (let i = 0; i < split[a] && idx < pending.length; i++, idx++) {
          await query(`UPDATE customers SET assigned_agent=$1 WHERE id=$2`, [a, pending[idx].id]);
        }
      }

      // 이전 list 비활성, 새 list 활성
      await query(`UPDATE customer_lists SET is_active=false WHERE id=$1`, [list.id]);
      await query(`UPDATE customer_lists SET is_distributed=true, is_active=true WHERE id=$1`, [nextId]);
      await query(
        `INSERT INTO distribution_events (list_id, category, total_distributed, split_json, triggered_by)
          VALUES ($1, $2, $3, $4, 'auto_connect')`,
        [nextId, list.category, pending.length, JSON.stringify(split)]
      );
      console.log(`[cron auto-connect] center=${list.center_id} ${list.id} → ${nextId} (${pending.length} distributed)`);
    }
  } catch (e) {
    console.error('[cron auto-connect] error:', e.message);
  }
}

// 매 10분: 휴면 승격 — no_answer_count >= 3 인 customer 를 dormant 로
async function dormantPromotion() {
  try {
    const { rowCount } = await query(`
      UPDATE customers
         SET status='dormant', dormant_since=NOW(), updated_at=NOW()
       WHERE no_answer_count >= 3 AND status NOT IN ('dormant','done','positive','invalid','invalid_pre')`);
    if (rowCount > 0) console.log(`[cron dormant] promoted ${rowCount} customers`);
  } catch (e) {
    console.error('[cron dormant] error:', e.message);
  }
}

// 매 1시간: 녹음 만료 정리 — 7일 이전 파일 path 로그만, 실제 삭제는 TODO
async function recordingsCleanup() {
  try {
    const { rows } = await query(
      `SELECT id, file_path FROM recordings WHERE expires_at IS NOT NULL AND expires_at < NOW() LIMIT 200`
    );
    if (rows.length === 0) return;
    console.log(`[cron recordings] ${rows.length} expired files (path-only log; actual delete TODO)`);
    // TODO: fs.unlink(file_path) + DELETE FROM recordings
  } catch (e) {
    console.error('[cron recordings] error:', e.message);
  }
}

// 매일 08:00 KST: SIP precheck 자동 트리거 (스켈레톤)
async function dailySipPrecheck() {
  try {
    const { rows } = await query(`
      SELECT id FROM customer_lists
       WHERE is_sip_prechecked=false AND is_distributed=false
       LIMIT 50`);
    if (rows.length === 0) return;
    console.log(`[cron sip-precheck] ${rows.length} candidate lists (skeleton — manual trigger only for now)`);
    // 실제 자동 호출은 운영 안정화 후에. 지금은 큐 노출만.
  } catch (e) {
    console.error('[cron sip-precheck] error:', e.message);
  }
}

export function startCron() {
  if (tasks.length) return;
  tasks.push(cron.schedule('*/5 * * * *', autoConnectCheck));
  tasks.push(cron.schedule('*/10 * * * *', dormantPromotion));
  tasks.push(cron.schedule('0 * * * *', recordingsCleanup));
  // 매일 08:00 KST = 23:00 UTC 전날
  tasks.push(cron.schedule('0 23 * * *', dailySipPrecheck));
  console.log('[cron] 4 jobs scheduled');
}

export function stopCron() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}
