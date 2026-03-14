-- Organization Invites
-- Allows admins to pre-configure role, permissions, and settings for invited users.
-- Invited users receive a link and only need to provide name + password.

CREATE TABLE IF NOT EXISTS organization_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invite_token VARCHAR(255) NOT NULL UNIQUE,
    primary_role VARCHAR(50) NOT NULL DEFAULT 'user',
    role_ids UUID[] DEFAULT '{}',
    invited_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_organization_invites_org ON organization_invites(organization_id);
