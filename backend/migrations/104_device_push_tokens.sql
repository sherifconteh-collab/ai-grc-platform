-- Migration 104: Device push tokens (mobile companion apps)
--
-- v3.1.0 ships POST /api/v1/push-tokens and DELETE /api/v1/push-tokens/:token
-- for iOS (APNs) and Android (FCM) push notification delivery.
--
-- SECURITY: uniqueness is on (token) — NOT (user_id, token) — so that when a
-- token is re-registered under a different account (shared device, account
-- swap), ownership is reassigned via UPSERT. Without this, a device could end
-- up with multiple user_id rows mapped to the same physical token, allowing
-- cross-account push delivery.

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  platform        VARCHAR(16) NOT NULL CHECK (platform IN ('ios', 'android')),
  token           TEXT NOT NULL,
  app_version     VARCHAR(64),
  device_model    VARCHAR(128),
  locale          VARCHAR(16),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'device_push_tokens_token_unique'
      AND conrelid = 'device_push_tokens'::regclass
  ) THEN
    ALTER TABLE device_push_tokens
      ADD CONSTRAINT device_push_tokens_token_unique UNIQUE (token);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user
  ON device_push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_org
  ON device_push_tokens (organization_id);
