-- Migration 013: RBAC bootstrap (permissions + system roles)

-- 1. Seed permissions
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('dashboard.read', 'dashboard', 'read', 'View dashboard metrics and summaries'),
  ('frameworks.read', 'frameworks', 'read', 'View available compliance frameworks'),
  ('frameworks.manage', 'frameworks', 'manage', 'Add or remove organization framework selections'),
  ('organizations.read', 'organizations', 'read', 'View organization compliance data'),
  ('controls.read', 'controls', 'read', 'View controls and control metadata'),
  ('controls.write', 'controls', 'write', 'Update control implementation status/details'),
  ('implementations.read', 'implementations', 'read', 'View implementation records'),
  ('implementations.write', 'implementations', 'write', 'Modify implementation assignments and status'),
  ('evidence.read', 'evidence', 'read', 'View and download evidence records'),
  ('evidence.write', 'evidence', 'write', 'Upload, edit, and delete evidence records'),
  ('audit.read', 'audit', 'read', 'View audit logs and audit statistics'),
  ('roles.manage', 'roles', 'manage', 'Create, edit, delete, and assign roles'),
  ('users.read', 'users', 'read', 'View users in the organization'),
  ('users.manage', 'users', 'manage', 'Manage users in the organization'),
  ('assets.read', 'assets', 'read', 'View CMDB asset inventory'),
  ('assets.write', 'assets', 'write', 'Create/update/delete CMDB assets'),
  ('environments.read', 'environments', 'read', 'View environment records'),
  ('environments.write', 'environments', 'write', 'Create/update/delete environments'),
  ('service_accounts.read', 'service_accounts', 'read', 'View service account inventory'),
  ('service_accounts.write', 'service_accounts', 'write', 'Create/update/delete service accounts'),
  ('settings.manage', 'settings', 'manage', 'Update organization/system settings'),
  ('assessments.read', 'assessments', 'read', 'View assessment procedures/results/plans'),
  ('assessments.write', 'assessments', 'write', 'Record assessment outcomes and manage plans'),
  ('reports.read', 'reports', 'read', 'Generate and download reports'),
  ('notifications.read', 'notifications', 'read', 'View notifications'),
  ('notifications.write', 'notifications', 'write', 'Create/update notifications'),
  ('ai.use', 'ai', 'use', 'Use AI analysis features')
ON CONFLICT (name) DO NOTHING;

-- 2. Seed system roles
INSERT INTO roles (organization_id, name, description, is_system_role)
VALUES
  (NULL, 'admin', 'System administrator with full access', true),
  (NULL, 'user', 'Operational user with standard compliance access', true),
  (NULL, 'auditor', 'Auditor role with assessment execution and evidence review access', true)
ON CONFLICT DO NOTHING;

-- 3. Map permissions to system roles
WITH role_admin AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'admin' LIMIT 1
), role_user AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'user' LIMIT 1
), role_auditor AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'auditor' LIMIT 1
), perms AS (
  SELECT id, name FROM permissions
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT role_admin.id, perms.id
FROM role_admin, perms
ON CONFLICT DO NOTHING;

WITH role_user AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'user' LIMIT 1
), perms AS (
  SELECT id, name FROM permissions
  WHERE name IN (
    'dashboard.read',
    'frameworks.read',
    'organizations.read',
    'users.read',
    'controls.read', 'controls.write',
    'implementations.read', 'implementations.write',
    'evidence.read', 'evidence.write',
    'assets.read', 'assets.write',
    'environments.read', 'environments.write',
    'service_accounts.read', 'service_accounts.write',
    'assessments.read', 'assessments.write',
    'notifications.read', 'notifications.write',
    'ai.use',
    'reports.read'
  )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT role_user.id, perms.id
FROM role_user, perms
ON CONFLICT DO NOTHING;

WITH role_auditor AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'auditor' LIMIT 1
), perms AS (
  SELECT id, name FROM permissions
  WHERE name IN (
    'dashboard.read',
    'frameworks.read',
    'organizations.read',
    'users.read',
    'controls.read',
    'implementations.read',
    'evidence.read',
    'assets.read',
    'environments.read',
    'service_accounts.read',
    'audit.read',
    'assessments.read',
    'assessments.write',
    'reports.read',
    'notifications.read',
    'ai.use'
  )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT role_auditor.id, perms.id
FROM role_auditor, perms
ON CONFLICT DO NOTHING;

-- 4. Ensure every existing user has at least one matching system role assignment
WITH role_map AS (
  SELECT u.id AS user_id,
         CASE
           WHEN u.role = 'admin' THEN 'admin'
           WHEN u.role = 'auditor' THEN 'auditor'
           ELSE 'user'
         END AS role_name
  FROM users u
), target_roles AS (
  SELECT rm.user_id, r.id AS role_id
  FROM role_map rm
  JOIN roles r ON r.name = rm.role_name AND r.is_system_role = true
)
INSERT INTO user_roles (user_id, role_id)
SELECT tr.user_id, tr.role_id
FROM target_roles tr
ON CONFLICT DO NOTHING;

SELECT 'Migration 013 completed.' AS result;
