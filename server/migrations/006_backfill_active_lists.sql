-- 006_backfill_active_lists.sql
-- 5/21 calls.js NEXT CALL 에 is_active=true 필터 추가됨.
-- pre-fix 시점에는 is_active 무시하고 서빙됐으므로, 진행 중 DB(pending/retry 남은 list)는 is_active=true 로 백필.
-- idempotent: 이미 true 인 행은 그대로.

UPDATE customer_lists SET is_active = true
 WHERE is_active = false
   AND id IN (
     SELECT DISTINCT list_id FROM customers
      WHERE status IN ('pending','retry')
   );
