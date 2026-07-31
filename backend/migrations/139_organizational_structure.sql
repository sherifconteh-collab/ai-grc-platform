-- Migration 139: Departments and business objectives
--
-- Every GRC record in this platform has an owner (a user) but nothing has an
-- owning *part of the business*. That gap shows up the moment anyone asks a
-- normal governance question: which business unit carries the most unmitigated
-- risk, which department is behind on its obligations, whose objectives are
-- threatened. Those questions need an organizational spine, and the platform
-- has never had one -- `users.organization_id` is the tenant boundary, not an
-- internal structure.
--
-- Two tables provide it:
--
--   departments        A hierarchy of business units. Self-referencing so an
--                      org can model divisions -> departments -> teams at
--                      whatever depth it uses. Risks, incidents, obligations,
--                      objectives and indicators all hang off this.
--
--   business_objectives The "why" side of risk. ISO 31000 defines risk as the
--                      effect of uncertainty *on objectives*, and COSO ERM
--                      builds the same link. Without recorded objectives a
--                      risk register is a list of bad things with nothing to
--                      be bad for. Categories follow COSO's four:
--                      strategic / operational / reporting / compliance.
--
-- Ships in the risk and resilience release alongside migrations 140-143.

CREATE TABLE IF NOT EXISTS departments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name              text NOT NULL,
  code              text,
  description       text,
  -- Self-reference builds the hierarchy. ON DELETE SET NULL rather than CASCADE:
  -- deleting a division should orphan its children to the root, not silently
  -- delete an entire branch of the business along with every risk owned by it.
  parent_id         uuid REFERENCES departments (id) ON DELETE SET NULL,
  head_user_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  cost_center       text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: names are unique per organization, never globally. Including
  -- organization_id in the key keeps one tenant's department names from
  -- colliding with -- or being discoverable through -- another's.
  CONSTRAINT departments_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_org ON departments (organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments (parent_id);

CREATE TABLE IF NOT EXISTS business_objectives (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  reference         text,
  title             text NOT NULL,
  description       text,
  -- COSO ERM objective categories.
  category          text NOT NULL DEFAULT 'strategic',
  owner_user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  department_id     uuid REFERENCES departments (id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'active',
  target_date       date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT business_objectives_category_check
    CHECK (category IN ('strategic', 'operational', 'reporting', 'compliance')),
  CONSTRAINT business_objectives_status_check
    CHECK (status IN ('draft', 'active', 'achieved', 'missed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_business_objectives_org
  ON business_objectives (organization_id);
CREATE INDEX IF NOT EXISTS idx_business_objectives_department
  ON business_objectives (department_id);

-- SECURITY: reference codes (OBJ-001 and the like) are unique per organization.
-- A partial index rather than a table constraint so the column stays optional.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_objectives_org_reference
  ON business_objectives (organization_id, reference)
  WHERE reference IS NOT NULL;

-- Permission seeding. Every requirePermission() key must exist in the catalog
-- and be granted, or non-admin roles get a 403 they cannot explain.
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('departments.read', 'departments', 'read',
   'View the organizational structure of departments and business units'),
  ('departments.write', 'departments', 'write',
   'Create, update, and deactivate departments'),
  ('objectives.read', 'objectives', 'read',
   'View business objectives and the risks affecting them'),
  ('objectives.write', 'objectives', 'write',
   'Create, update, and close business objectives')
ON CONFLICT (name) DO NOTHING;

-- Read for admin, auditor and user: the org chart and the objectives it works
-- toward are context everyone needs to interpret a risk or an incident.
WITH read_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor', 'user')
), read_perms AS (
  SELECT id FROM permissions WHERE name IN ('departments.read', 'objectives.read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT read_roles.id, read_perms.id FROM read_roles, read_perms
ON CONFLICT DO NOTHING;

WITH write_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'admin'
), write_perms AS (
  SELECT id FROM permissions WHERE name IN ('departments.write', 'objectives.write')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT write_roles.id, write_perms.id FROM write_roles, write_perms
ON CONFLICT DO NOTHING;

COMMENT ON TABLE departments IS
  'Hierarchical business units. Owning structure for risks, incidents, obligations, objectives and indicators.';
COMMENT ON TABLE business_objectives IS
  'COSO-categorized business objectives. Risk is the effect of uncertainty on these (ISO 31000).';

SELECT 'Migration 139 completed.' AS result;
