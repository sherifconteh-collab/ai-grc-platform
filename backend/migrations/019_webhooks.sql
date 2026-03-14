-- Migration 019: Webhooks
-- Adds the webhook subscription registry and delivery log.

-- ============================================================
-- PART 1: webhook_subscriptions
-- Organization-registered webhook endpoints
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  target_url         TEXT         NOT NULL,
  signing_secret     TEXT,
  subscribed_events  TEXT[]      NOT NULL DEFAULT '{}',
  active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ws_org
  ON webhook_subscriptions(organization_id);

CREATE INDEX IF NOT EXISTS idx_ws_active
  ON webhook_subscriptions(organization_id, active);

-- ============================================================
-- PART 2: webhook_deliveries
-- Outbound delivery attempts and their outcomes
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id  UUID        NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type       VARCHAR(100) NOT NULL,
  payload          JSONB,
  delivery_status  VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / delivered / failed
  attempt_count    INTEGER     NOT NULL DEFAULT 0,
  http_status      INTEGER,
  response_body    VARCHAR(4000),
  next_attempt_at  TIMESTAMP,
  delivered_at     TIMESTAMP,
  created_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wd_subscription
  ON webhook_deliveries(subscription_id);

CREATE INDEX IF NOT EXISTS idx_wd_org_status
  ON webhook_deliveries(organization_id, delivery_status);

CREATE INDEX IF NOT EXISTS idx_wd_next_attempt
  ON webhook_deliveries(next_attempt_at)
  WHERE delivery_status = 'pending';

SELECT 'Migration 019 completed.' AS result;
