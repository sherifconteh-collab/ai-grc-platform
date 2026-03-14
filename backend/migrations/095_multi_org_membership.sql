-- Migration 095: Multi-organization membership
-- Allows a single user to be a member of multiple organizations and switch
-- between them, enabling use-cases like consultants managing several clients.
--
-- Strategy:
--   • New junction table `user_organizations` records every (user, org) pair.
--   • `users.organization_id` stays as the *currently active* org context.
--   • Switching orgs updates `users.organization_id` and issues new tokens.
--
-- This migration is idempotent — safe to re-run.

BEGIN;

-- ─── Junction table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_organizations (
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL DEFAULT 'admin',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_organizations_user
  ON user_organizations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_organizations_org
  ON user_organizations(organization_id);

-- ─── Backfill existing users ──────────────────────────────────────────────────
-- Every current user already belongs to their assigned organization.
INSERT INTO user_organizations (user_id, organization_id, role, joined_at)
SELECT u.id, u.organization_id, u.role, COALESCE(u.created_at, NOW())
FROM   users u
WHERE  u.organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

COMMIT;
