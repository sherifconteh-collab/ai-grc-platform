-- Migration 132: Access governance (SoD rules, access review campaigns, entitlement snapshots)
--
-- Why: the platform had no in-app access governance -- no toxic-combination
-- separation-of-duties rules (middleware/sod.js only covers workflow-step SoD,
-- e.g. preparer != reviewer), no periodic user access reviews, and no way to
-- test what a role can or cannot do before assigning it. These are the
-- capabilities auditors expect for AC-2 / AC-5 / AC-6 (NIST 800-53),
-- SOC 2 CC6.x, and ISO 27001 A.9. This migration adds:
--   1. sod_rules -- permission combinations that are toxic when held together.
--      organization_id NULL = system rule visible to every org; org rows are
--      tenant-specific custom rules.
--   2. access_review_campaigns / access_review_items -- periodic certification
--      campaigns: each item snapshots a user's entitlements at campaign
--      creation and records a reviewer's certify/revoke decision. A completed
--      campaign generates an evidence record as audit evidence.
--   3. Seeds the access_governance.read / access_governance.manage permissions
--      (every requirePermission() key must be seeded or non-admins get a
--      blanket 403 -- see the compliance.read/compliance.manage seed in
--      migration 122 for the same pattern).
-- Ported from the sibling ControlWeaver-Pro repo's access governance module.

-- 1. Separation-of-duties rules
CREATE TABLE IF NOT EXISTS sod_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- JSONB array of permission names; a user holding ALL of them violates the rule
  conflicting_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULLS NOT DISTINCT so system rules (organization_id NULL) also dedupe by name
  CONSTRAINT sod_rules_org_name_unique UNIQUE NULLS NOT DISTINCT (organization_id, name)
);

-- SECURITY: org-scoped listing must return rows WHERE organization_id = $org
-- OR organization_id IS NULL (system rules); mutations only on own-org rows.
CREATE INDEX IF NOT EXISTS idx_sod_rules_org ON sod_rules (organization_id);

-- 2. Access review campaigns
CREATE TABLE IF NOT EXISTS access_review_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  due_date TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SECURITY: multi-tenant isolation -- every campaign query filters organization_id.
CREATE INDEX IF NOT EXISTS idx_access_review_campaigns_org_status
  ON access_review_campaigns (organization_id, status);

-- 3. Per-user review items with entitlement snapshot
CREATE TABLE IF NOT EXISTS access_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES access_review_campaigns(id) ON DELETE CASCADE,
  -- SECURITY: denormalized org id (matches the campaign's) so item queries can
  -- enforce tenant isolation directly instead of relying on the join alone.
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- { roles: [...], permissions: [...], sod_violations: [...] } captured at campaign creation
  entitlement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'certified', 'revoked')),
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT access_review_items_campaign_subject_unique UNIQUE (campaign_id, subject_user_id)
);

CREATE INDEX IF NOT EXISTS idx_access_review_items_campaign ON access_review_items (campaign_id);
CREATE INDEX IF NOT EXISTS idx_access_review_items_org ON access_review_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_access_review_items_subject ON access_review_items (subject_user_id);

-- 4. Seed system SoD rules (organization_id NULL = visible to all orgs).
-- Wildcard ('*') admins are intentionally excluded from per-rule matching by
-- the evaluation service and surfaced separately as over-privileged accounts.
INSERT INTO sod_rules (organization_id, name, description, conflicting_permissions, severity)
VALUES
  (NULL, 'User provisioning combined with role administration',
   'A single account that can both create users and grant roles can provision fully privileged accounts on its own (AC-5).',
   '["users.manage", "roles.manage"]'::jsonb, 'high'),
  (NULL, 'Role administration combined with audit record creation',
   'An account that can change role grants and also write audit records could alter access and shape the audit trail that would reveal it (AU-9).',
   '["roles.manage", "audit.write"]'::jsonb, 'critical'),
  (NULL, 'System configuration combined with audit record creation',
   'An account that can change organization settings and also write audit records can obscure configuration changes (AU-9).',
   '["settings.manage", "audit.write"]'::jsonb, 'high'),
  (NULL, 'Control implementation combined with assessment execution',
   'An account that both implements controls and executes assessments can attest to its own work (AC-5, self-review threat).',
   '["controls.write", "assessments.write"]'::jsonb, 'medium'),
  (NULL, 'Evidence authoring combined with assessment execution',
   'An account that both uploads evidence and executes assessments can certify compliance with evidence it authored (AC-5, self-review threat).',
   '["evidence.write", "assessments.write"]'::jsonb, 'medium')
ON CONFLICT ON CONSTRAINT sod_rules_org_name_unique DO NOTHING;

-- 5. Seed access_governance permissions and grants
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('access_governance.read', 'access_governance', 'read',
   'View entitlement reports, SoD rules and violations, access review campaigns, and run access simulations'),
  ('access_governance.manage', 'access_governance', 'manage',
   'Manage SoD rules and create, activate, decide, and complete access review campaigns')
ON CONFLICT (name) DO NOTHING;

WITH ag_read_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor')
), ag_read_perm AS (
  SELECT id FROM permissions WHERE name = 'access_governance.read'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT ag_read_roles.id, ag_read_perm.id
FROM ag_read_roles, ag_read_perm
ON CONFLICT DO NOTHING;

WITH ag_manage_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'admin'
), ag_manage_perm AS (
  SELECT id FROM permissions WHERE name = 'access_governance.manage'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT ag_manage_roles.id, ag_manage_perm.id
FROM ag_manage_roles, ag_manage_perm
ON CONFLICT DO NOTHING;

SELECT 'Migration 132 completed.' AS result;
