-- Migration 053: External AI logging API keys + decision log attribution

CREATE TABLE IF NOT EXISTS external_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(64) NOT NULL CHECK (key_prefix ~ '^cw_live_[A-Za-z0-9]+$'),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_api_keys_org_active
  ON external_api_keys(organization_id, active);

CREATE INDEX IF NOT EXISTS idx_external_api_keys_prefix
  ON external_api_keys(key_prefix);

ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS decision_source VARCHAR(20) NOT NULL DEFAULT 'platform'
    CHECK (decision_source IN ('platform', 'byok', 'external')),
  ADD COLUMN IF NOT EXISTS external_provider VARCHAR(100),
  ADD COLUMN IF NOT EXISTS external_model VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_decision_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_api_key_id UUID REFERENCES external_api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_decision_log_decision_source
  ON ai_decision_log(decision_source, processing_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_ai_decision_log_external_api_key_id
  ON ai_decision_log(external_api_key_id)
  WHERE external_api_key_id IS NOT NULL;
