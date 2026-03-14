-- Migration 016: Grant assessment write capability to system auditor role
-- Enables auditor-led testing workflows (recording procedure outcomes and plans).

WITH auditor_role AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'auditor' LIMIT 1
), write_perm AS (
  SELECT id FROM permissions WHERE name = 'assessments.write' LIMIT 1
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT auditor_role.id, write_perm.id
FROM auditor_role, write_perm
ON CONFLICT DO NOTHING;

SELECT 'Migration 016 completed.' AS result;
