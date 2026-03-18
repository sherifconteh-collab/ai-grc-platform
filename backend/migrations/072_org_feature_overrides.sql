-- Migration 072: Organization feature overrides and platform feature flags
-- Adds per-org feature override column + seeds global feature_flags setting.
-- Also extends billing_status CHECK to include 'comped'.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;

INSERT INTO platform_settings (setting_key, setting_value, is_encrypted)
VALUES ('feature_flags', '{}', false)
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_overrides JSONB DEFAULT '{}'::jsonb;

-- Extend billing_status constraint to include 'comped'
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_billing_status_check
  CHECK (billing_status IN ('free', 'trial', 'active_paid', 'past_due', 'canceling', 'canceled', 'comped'));
