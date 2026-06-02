-- 004_dedup.sql — 중복 판정(뒤 8자리) 조회 가속용 함수 인덱스 (idempotent)
-- checkDuplicate() 가 center_id + RIGHT(digits,8) 로 매칭하므로 이 인덱스가 받쳐줌.
CREATE INDEX IF NOT EXISTS idx_customers_last8
  ON customers (center_id, (RIGHT(regexp_replace(phone_number, '\D', '', 'g'), 8)));
