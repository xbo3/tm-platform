import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || path.join(__dirname, '..', 'recordings');

const tasks = [];

// 매 10분: 휴면 승격 — 부재 횟수가 리스트별 임계값(no_answer_limit, 기본 3) 이상이면 dormant(장기미연결)
async function dormantPromotion() {
  try {
    // 1) 먼저, 현재 진행 중인 고객 중 부재 기록이 있는 모든 고객의 no_answer_count를
    // calls 테이블의 고유 부재 업무일수 기준으로 최신 동기화한다.
    await query(`
      UPDATE customers cu
         SET no_answer_count = (
           SELECT COUNT(DISTINCT ((started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') - INTERVAL '10 hours')::date)
             FROM calls
            WHERE customer_id = cu.id AND result = 'no_answer'
         )
       WHERE cu.status NOT IN ('dormant','done','positive','invalid','invalid_pre')
         AND EXISTS (SELECT 1 FROM calls WHERE customer_id = cu.id AND result = 'no_answer')`);

    // 2) 동기화된 카운트가 임계값 이상인 대상을 dormant(휴면) 처리
    const { rowCount } = await query(`
      UPDATE customers cu
         SET status='dormant', dormant_since=NOW(), updated_at=NOW()
        FROM customer_lists cl
       WHERE cu.list_id = cl.id
         AND cu.no_answer_count >= COALESCE(cl.no_answer_limit, 3)
         AND cu.status NOT IN ('dormant','done','positive','invalid','invalid_pre')`);
    if (rowCount > 0) console.log(`[cron dormant] promoted ${rowCount} customers`);
  } catch (e) {
    console.error('[cron dormant] error:', e.message);
  }
}

// 매 1시간: 녹음 만료 정리 — 7일 이전 파일 실제 삭제 + DB row 제거
// 방침 §7: 음성 파일 7일 보관 후 자동 삭제, STT 텍스트는 call_classifications 에 영구.
async function recordingsCleanup() {
  try {
    const { rows } = await query(
      `SELECT id, file_path FROM recordings WHERE expires_at IS NOT NULL AND expires_at < NOW() LIMIT 500`
    );
    if (rows.length === 0) return;
    let removed = 0, missing = 0;
    for (const r of rows) {
      const full = path.join(RECORDINGS_DIR, r.file_path || '');
      try {
        if (r.file_path && fs.existsSync(full)) {
          fs.unlinkSync(full);
          removed++;
        } else {
          missing++;
        }
      } catch (e) {
        console.error(`[cron recordings] unlink ${full} failed:`, e.message);
      }
      // Delete DB row either way — expired rows shouldn't keep referencing
      // files that may have been hand-deleted.
      try {
        await query(`DELETE FROM recordings WHERE id=$1`, [r.id]);
      } catch (e) {
        console.error(`[cron recordings] delete row ${r.id} failed:`, e.message);
      }
    }
    console.log(`[cron recordings] expired=${rows.length} removed=${removed} missing=${missing}`);
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
  tasks.push(cron.schedule('*/10 * * * *', dormantPromotion));
  tasks.push(cron.schedule('0 * * * *', recordingsCleanup));
  // 매일 08:00 KST = 23:00 UTC 전날
  tasks.push(cron.schedule('0 23 * * *', dailySipPrecheck));
  console.log('[cron] 3 jobs scheduled');
}

export function stopCron() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}
