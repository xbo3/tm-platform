-- 005_ai_usage.sql — AI 분류 (Haiku 4.5) 실측 토큰/비용 누적 기록
-- 슈퍼어드민 비용 모니터링용. 호출당 한 행. idempotent.

CREATE TABLE IF NOT EXISTS ai_usage (
  id              BIGSERIAL PRIMARY KEY,
  call_id         INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens    INTEGER NOT NULL DEFAULT 0,
  cache_create_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(12, 8) NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_call_id ON ai_usage (call_id);
