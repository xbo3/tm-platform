-- 009_noans_limit.sql
-- 부재 임계값(센터장 결정: 2 또는 3)을 센터 설정으로 두고, "결정 이후 자료부터" 적용되도록
-- 리스트(DB)별로 업로드 시점의 센터값을 스냅샷한다.

-- 센터장이 설정하는 현재 임계값. 기본 3.
ALTER TABLE centers ADD COLUMN IF NOT EXISTS no_answer_limit INTEGER DEFAULT 3;

-- 리스트별 스냅샷. 업로드 시점 센터값이 박힌다. NULL 이면 센터 현재값(없으면 3) 폴백.
ALTER TABLE customer_lists ADD COLUMN IF NOT EXISTS no_answer_limit INTEGER;

-- 기존 리스트는 현재 센터값으로 1회 백필 → 이후 임계값을 바꿔도 과거 자료는 영향 없음.
UPDATE customer_lists cl
   SET no_answer_limit = COALESCE(
         (SELECT c.no_answer_limit FROM centers c WHERE c.id = cl.center_id),
         3)
 WHERE cl.no_answer_limit IS NULL;
