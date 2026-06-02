-- 004_dedup.sql — 업로드 중복 자동제외 + 출처 기록 (idempotent)
-- 중복으로 잡힌 신규 번호에 "어느 타이틀 DB / 어떤 번호 / 어떤 피드" 기록용 컬럼.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dup_title VARCHAR(200);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dup_phone VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dup_feed  VARCHAR(20);

-- 뒤 8자리 대조 가속용 함수 인덱스 (숫자만 추출 후 우측 8자리)
CREATE INDEX IF NOT EXISTS idx_customers_last8
  ON customers (center_id, (RIGHT(regexp_replace(phone_number, '\D', '', 'g'), 8)));
