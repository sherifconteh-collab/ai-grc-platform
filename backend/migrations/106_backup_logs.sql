-- Migration 106: backup_logs table
-- Persists a record of every scheduled and manual database backup run
-- so platform admins can audit history and detect failures.
-- Activated when BACKUP_ENABLED=true; ships in v3.4.0.

CREATE TABLE IF NOT EXISTS backup_logs (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz  NOT NULL DEFAULT NOW(),
  completed_at    timestamptz,
  status          text         NOT NULL DEFAULT 'running'
                               CHECK (status IN ('running', 'success', 'failed')),
  trigger         text         NOT NULL DEFAULT 'scheduled'
                               CHECK (trigger IN ('scheduled', 'manual')),
  triggered_by    uuid         REFERENCES users(id) ON DELETE SET NULL,
  backup_file     text,
  file_size_bytes bigint,
  s3_key          text,
  error_message   text,
  exit_code       integer,
  output_log      text,
  created_at      timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_started_at ON backup_logs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status     ON backup_logs (status);
