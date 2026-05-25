-- MSP/parent-child org hierarchy and delegated admin
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations (parent_org_id);

CREATE TABLE org_delegated_admins (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    child_org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by     UUID REFERENCES users(id),
    granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ,
    UNIQUE (parent_org_id, child_org_id, user_id)
);

CREATE INDEX idx_delegated_admins_parent ON org_delegated_admins (parent_org_id);
CREATE INDEX idx_delegated_admins_child  ON org_delegated_admins (child_org_id);
CREATE INDEX idx_delegated_admins_user   ON org_delegated_admins (user_id);
