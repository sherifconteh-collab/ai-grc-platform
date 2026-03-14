-- Migration 029: Auditor artifact templates
-- Org-level templates for PBC, workpapers, findings, sign-offs, and validation reports.

CREATE TABLE IF NOT EXISTS audit_artifact_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  artifact_type VARCHAR(50) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  template_content TEXT NOT NULL,
  template_format VARCHAR(30) NOT NULL DEFAULT 'text',
  source_filename VARCHAR(255),
  source_mime_type VARCHAR(255),
  extraction_parser VARCHAR(50),
  extraction_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_artifact_templates_type_valid CHECK (
    artifact_type IN ('pbc', 'workpaper', 'finding', 'signoff', 'engagement_report')
  )
);

CREATE INDEX IF NOT EXISTS idx_audit_artifact_templates_org_type
  ON audit_artifact_templates (organization_id, artifact_type, is_active, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_audit_artifact_templates_default_per_type
  ON audit_artifact_templates (organization_id, artifact_type)
  WHERE is_default = true AND is_active = true;

SELECT 'Migration 029 completed.' AS result;
