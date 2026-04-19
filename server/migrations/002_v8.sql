-- v8 migration: extend customer_lists / customers / calls schemas + 4 new tables
-- Idempotent. Safe to re-run. Does not destroy v7 data.

-- ============ users: add agent_name column ============
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN agent_name VARCHAR(10);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- backfill agent_name from name "Agent A" → "A"
UPDATE users SET agent_name = REPLACE(name, 'Agent ', '')
 WHERE role = 'agent' AND agent_name IS NULL AND name LIKE 'Agent %';

-- ============ customer_lists: add v8 columns ============
DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN category VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD CONSTRAINT customer_lists_category_check
    CHECK (category IS NULL OR category IN ('casino','tojino','etc'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN supplier_tg VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN auto_connect BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN auto_connect_threshold INTEGER DEFAULT 30;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN is_distributed BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN is_active BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customer_lists ADD COLUMN is_sip_prechecked BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============ customers: extend status CHECK + add v8 columns ============
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check
  CHECK (status IN ('pending','calling','done','no_answer','invalid','retry','invalid_pre','dormant','recall','positive'));

DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN recall_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN recall_agent VARCHAR(10);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN dormant_since TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============ calls: extend result CHECK ============
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_result_check;
ALTER TABLE calls ADD CONSTRAINT calls_result_check
  CHECK (result IS NULL OR result IN ('connected','no_answer','busy','failed','invalid','positive','reject','recall'));

-- ============ sip_precheck_runs ============
CREATE TABLE IF NOT EXISTS sip_precheck_runs (
  id SERIAL PRIMARY KEY,
  list_id INTEGER REFERENCES customer_lists(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  total INTEGER,
  invalid_count INTEGER,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','done','failed'))
);

-- ============ distribution_events ============
CREATE TABLE IF NOT EXISTS distribution_events (
  id SERIAL PRIMARY KEY,
  list_id INTEGER REFERENCES customer_lists(id) ON DELETE CASCADE,
  category VARCHAR(20),
  total_distributed INTEGER,
  split_json TEXT,
  triggered_by VARCHAR(20) CHECK (triggered_by IN ('manual','auto_connect')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ call_classifications ============
CREATE TABLE IF NOT EXISTS call_classifications (
  id SERIAL PRIMARY KEY,
  call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
  stt_text TEXT,
  ai_category VARCHAR(20),
  ai_confidence NUMERIC(3,2),
  recall_time TIMESTAMP,
  quality_flag VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ suppliers ============
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  tg_id VARCHAR(100) UNIQUE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ helpful indexes ============
CREATE INDEX IF NOT EXISTS idx_customers_assigned_status ON customers (assigned_agent, status);
CREATE INDEX IF NOT EXISTS idx_customers_list_status ON customers (list_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_lists_active ON customer_lists (center_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_calls_started ON calls (center_id, started_at);
