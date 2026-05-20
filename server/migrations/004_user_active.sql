-- 004_user_active.sql — per-user active flag for SuperAdmin per-agent 정지/재개.
-- Idempotent: safe to re-run.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='users' AND column_name='is_active'
  ) THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
