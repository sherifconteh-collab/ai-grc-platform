-- Migration 122: Seed the compliance.read / compliance.manage permissions
--
-- routes/phase6.js (predictive risk scoring, regulatory impact analysis,
-- smart remediation plans) gates its GET endpoints on requirePermission
-- ('compliance.read') and its review/status-update endpoints on
-- requirePermission('compliance.manage'), but neither permission was ever
-- seeded into the permissions table. Since hasPermission() only matches an
-- exact permission name (or the admin '*' wildcard), every non-admin user
-- got a 403 on every phase6 endpoint regardless of role. Seed both
-- permissions and grant them to the user and auditor system roles,
-- mirroring the assessments.read/assessments.write grant pattern.
-- Ships in the feature-audit-fixes batch.

INSERT INTO permissions (name, resource, action, description)
VALUES
  ('compliance.read', 'compliance', 'read', 'View AI risk scores, regulatory impact assessments, and remediation plans'),
  ('compliance.manage', 'compliance', 'manage', 'Review regulatory impact assessments and update remediation plan status')
ON CONFLICT (name) DO NOTHING;

WITH target_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'user', 'auditor')
), perms AS (
  SELECT id FROM permissions WHERE name IN ('compliance.read', 'compliance.manage')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT target_roles.id, perms.id
FROM target_roles, perms
ON CONFLICT DO NOTHING;

SELECT 'Migration 122 completed.' AS result;
