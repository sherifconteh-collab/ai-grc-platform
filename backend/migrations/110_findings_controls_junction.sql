-- Migration 103: Many-to-Many Findings ↔ Controls (Phase 6)
-- Decouples audit findings from a single control: a finding may reference
-- multiple controls across multiple frameworks; a control may appear in many findings.

-- ============================================================
-- 1. Finding-to-control junction table
-- ============================================================
CREATE TABLE IF NOT EXISTS finding_control_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL
    REFERENCES audit_findings(id) ON DELETE CASCADE,
  control_id UUID NOT NULL
    REFERENCES framework_controls(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (link_type IN ('primary','related','crosswalk')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (finding_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_fcl_finding
  ON finding_control_links(finding_id);

CREATE INDEX IF NOT EXISTS idx_fcl_control
  ON finding_control_links(control_id);

CREATE INDEX IF NOT EXISTS idx_fcl_org
  ON finding_control_links(organization_id);

-- ============================================================
-- 2. Backfill existing findings that already have a control_id
-- Uses a DO block so the migration is idempotent on new installs.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_findings'
      AND column_name = 'control_id'
  ) THEN
    INSERT INTO finding_control_links (finding_id, control_id, organization_id, link_type)
    SELECT f.id, f.control_id, f.organization_id, 'primary'
    FROM audit_findings f
    WHERE f.control_id IS NOT NULL
    ON CONFLICT (finding_id, control_id) DO NOTHING;
  END IF;
END $$;
