-- Migration 038: Expand ai_usage_log for accountability + BYOK tracking

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS success       BOOLEAN  DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS tokens_input  INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_output INTEGER,
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50),  -- 'control', 'asset', 'vendor', etc.
  ADD COLUMN IF NOT EXISTS resource_id   UUID,
  ADD COLUMN IF NOT EXISTS ip_address    INET,
  ADD COLUMN IF NOT EXISTS duration_ms   INTEGER,
  ADD COLUMN IF NOT EXISTS byok_used     BOOLEAN  DEFAULT FALSE;

-- Index for admin usage reports filtered by user
CREATE INDEX IF NOT EXISTS idx_ai_usage_user
  ON ai_usage_log(organization_id, user_id, created_at DESC);

-- Index for BYOK vs platform-key breakdown
CREATE INDEX IF NOT EXISTS idx_ai_usage_byok
  ON ai_usage_log(organization_id, byok_used, created_at DESC);
