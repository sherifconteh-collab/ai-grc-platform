-- Migration 121: Seed the audit.write permission
--
-- Several routes (audit.js POA&M review, auditorWorkspace.js share-link
-- create/toggle) already gate on requirePermission('audit.write'), but the
-- permission was never seeded into the permissions table alongside
-- audit.read in migration 013 (RBAC bootstrap). Without a seeded row, only
-- admins (who bypass permission checks) can reach those endpoints. This
-- seeds the permission and grants it to the admin and auditor system roles
-- so the auditor-workspace share-link authz fix (audit.read -> audit.write)
-- doesn't lock auditors out of link management.
-- Ships in the feature-audit-fixes batch.

INSERT INTO permissions (name, resource, action, description)
VALUES
  ('audit.write', 'audit', 'write', 'Manage audit-log-adjacent actions: POA&M review closure, auditor workspace share-link management')
ON CONFLICT (name) DO NOTHING;

WITH target_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor')
), perm AS (
  SELECT id FROM permissions WHERE name = 'audit.write'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT target_roles.id, perm.id
FROM target_roles, perm
ON CONFLICT DO NOTHING;

SELECT 'Migration 121 completed.' AS result;
