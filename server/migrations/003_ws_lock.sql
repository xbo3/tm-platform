-- 003 ws_lock migration
-- Adds mask-release + global phone lock machinery for commit (2) of the WS
-- real-time channel. Safe to re-run; all statements idempotent.
-- Related: TM_보강_분배최종확정_20260422.md §3, TM_운영로직_DB생명주기_20260422.md §5.

-- ============ customers: mask-release trigger columns ============

-- When an agent hits "다음번호" the customer row is stamped with unmasked_at/by.
-- This becomes the single source of truth for the "number has been claimed"
-- predicate used by the distribution SQL (commit 1 groundwork, fully enforced here).
DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN unmasked_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN unmasked_by VARCHAR(10);  -- stores agent_name ('A'..'E')
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============ customers.status CHECK constraint ============
-- Drop+readd to guarantee the full v8 vocabulary. Keep legacy values
-- ('connected','done','retry') in the allowed set so v7 rows don't break.
DO $$ BEGIN
  ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
  ALTER TABLE customers ADD CONSTRAINT customers_status_check CHECK (status IN (
    'pending',
    'reserved',
    'reserved_blocked',
    'calling',
    'positive',
    'reject',
    'no_answer',
    'recall',
    'subscribed',
    'invalid',
    'invalid_pre',
    'dormant',
    -- legacy v7 values tolerated
    'connected',
    'done',
    'retry'
  ));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'customers_status_check: %', SQLERRM;
END $$;

-- ============ indexes for lock lookups ============

-- Global-lock UPDATE filters by phone_number. Without this index a locked dial
-- would full-scan customers every call on a growing table.
CREATE INDEX IF NOT EXISTS idx_customers_phone_number ON customers (phone_number);

-- Agent-scoped reads (own-call history masking) filter by calls.agent.
CREATE INDEX IF NOT EXISTS idx_calls_agent_customer ON calls (agent, customer_id);
