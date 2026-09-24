-- Migration 118: Dedicated TPRM permissions
--
-- routes/tprm.js gated every endpoint -- including vendor/questionnaire/
-- document create, update and delete, and the endpoints that email external
-- vendors -- on requirePermission('organizations.read'). Any read-only role
-- (auditor, or a custom viewer role) could therefore change vendor records
-- and send email on the organization's behalf.
--
-- Seed tprm.read / tprm.write and grant them so nobody loses access they
-- legitimately had:
--   - tprm.read  -> every role that holds organizations.read (the permission
--                   that gated TPRM reads until now), system or custom.
--   - tprm.write -> system admin and user roles (the roles that do write work
--                   elsewhere), plus any custom role holding organizations.write.
-- Auditors keep read access and lose write access, which is the intended fix.
--
-- Ships in the production-readiness Phase 1B integrity batch.

INSERT INTO permissions (name, resource, action, description)
VALUES
  ('tprm.read', 'tprm', 'read', 'View third-party vendors, questionnaires, documents, and vendor evidence'),
  ('tprm.write', 'tprm', 'write', 'Manage third-party vendors, questionnaires, and documents, and send questionnaires to vendors')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, tprm_read.id
FROM role_permissions rp
JOIN permissions org_read ON org_read.id = rp.permission_id AND org_read.name = 'organizations.read'
CROSS JOIN (SELECT id FROM permissions WHERE name = 'tprm.read') tprm_read
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, tprm_write.id
FROM roles r
CROSS JOIN (SELECT id FROM permissions WHERE name = 'tprm.write') tprm_write
WHERE (r.is_system_role = true AND r.name IN ('admin', 'user'))
   OR EXISTS (
     SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = r.id AND p.name = 'organizations.write'
   )
ON CONFLICT DO NOTHING;

SELECT 'Migration 118 completed.' AS result;
