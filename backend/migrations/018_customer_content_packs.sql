-- Migration 018: Customer-provided licensed content packs
-- Enables tenant-specific licensed standards content without shipping proprietary text in baseline seed data.

CREATE TABLE IF NOT EXISTS organization_content_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_code VARCHAR(100) NOT NULL,
  pack_name VARCHAR(255) NOT NULL,
  pack_version VARCHAR(100),
  license_reference TEXT NOT NULL,
  content_hash_sha256 VARCHAR(64) NOT NULL,
  source_vendor VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by UUID REFERENCES users(id),
  imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_content_pack_unique_hash
ON organization_content_packs (organization_id, framework_code, content_hash_sha256);

CREATE INDEX IF NOT EXISTS idx_org_content_pack_lookup
ON organization_content_packs (organization_id, framework_code, imported_at DESC);

CREATE TABLE IF NOT EXISTS organization_control_content_overrides (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  source_pack_id UUID REFERENCES organization_content_packs(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, framework_control_id)
);

CREATE INDEX IF NOT EXISTS idx_org_control_content_pack
ON organization_control_content_overrides (organization_id, source_pack_id);

CREATE TABLE IF NOT EXISTS organization_assessment_procedure_overrides (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_procedure_id UUID NOT NULL REFERENCES assessment_procedures(id) ON DELETE CASCADE,
  source_pack_id UUID REFERENCES organization_content_packs(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  expected_evidence TEXT,
  assessor_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, assessment_procedure_id)
);

CREATE INDEX IF NOT EXISTS idx_org_procedure_content_pack
ON organization_assessment_procedure_overrides (organization_id, source_pack_id);

SELECT 'Migration 018 completed.' AS result;
