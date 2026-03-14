-- Migration 090: Pending Approvals (High-Risk Action Approval Workflow)
-- High-risk platform admin actions (e.g., disabling feature flags, immediate subscription
-- cancellation) are staged here until a second platform owner approves or rejects them.
-- Unreviewed approvals expire after 24 hours.

CREATE TABLE IF NOT EXISTS pending_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type         VARCHAR(100) NOT NULL,       -- e.g. 'feature_flag.disable', 'subscription.cancel_immediately'
  resource_type       VARCHAR(100),
  resource_id         VARCHAR(255),
  requested_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_by_email  VARCHAR(255) NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_email   VARCHAR(255),
  review_note         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  reviewed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_status     ON pending_approvals(status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_created_at ON pending_approvals(created_at);
