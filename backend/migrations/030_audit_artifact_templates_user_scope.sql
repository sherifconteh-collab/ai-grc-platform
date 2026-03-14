-- Migration 030: Scope auditor templates to user profile
-- Ensures uploaded templates are isolated to the uploading auditor profile.

ALTER TABLE audit_artifact_templates
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

UPDATE audit_artifact_templates
SET owner_user_id = created_by
WHERE owner_user_id IS NULL
  AND created_by IS NOT NULL;

UPDATE audit_artifact_templates t
SET owner_user_id = (
  SELECT u.id
  FROM users u
  WHERE u.organization_id = t.organization_id
    AND u.is_active = true
  ORDER BY u.created_at ASC
  LIMIT 1
)
WHERE t.owner_user_id IS NULL;

DELETE FROM audit_artifact_templates
WHERE owner_user_id IS NULL;

ALTER TABLE audit_artifact_templates
  ALTER COLUMN owner_user_id SET NOT NULL;

DROP INDEX IF EXISTS uniq_audit_artifact_templates_default_per_type;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_audit_artifact_templates_default_per_user_type
  ON audit_artifact_templates (organization_id, owner_user_id, artifact_type)
  WHERE is_default = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_audit_artifact_templates_owner_scope
  ON audit_artifact_templates (organization_id, owner_user_id, artifact_type, is_active, updated_at DESC);

SELECT 'Migration 030 completed.' AS result;
