-- Migration 163: Risk-control matrix, control testing and NFR/CAP tracking
--
-- Why: SOX 404 and OMB A-123 assessments are organized around a risk-control
-- matrix (process, risk, key control, assertions, frequency, type) and
-- documented tests of design and operating effectiveness with defensible sample
-- sizes. Audit findings in federal financial audits are tracked as Notices of
-- Findings and Recommendations (NFRs) with a deficiency classification and a
-- corrective action plan (CAP). ControlWeave had engagements, workpapers and
-- findings but none of these structures. This migration adds:
--   1. rcm_entries: one row per key or non-key control in the matrix
--   2. control_tests / control_test_samples: design and operating
--      effectiveness tests with their sample items and exceptions
--   3. NFR/CAP columns on audit_findings, linking a finding to the test that
--      raised it and to the POA&M item that serves as its CAP
--   4. financial_audit.read / financial_audit.write permissions
-- Ships with the ERP audit readiness release.

CREATE TABLE IF NOT EXISTS rcm_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_ref          TEXT NOT NULL,
  process              TEXT NOT NULL CHECK (process IN ('procure_to_pay', 'order_to_cash', 'record_to_report', 'hire_to_retire', 'treasury', 'fixed_assets', 'inventory', 'budget_execution', 'it_general', 'entity_level', 'other')),
  sub_process          TEXT,
  assessable_unit      TEXT,
  risk_ref             TEXT,
  risk_statement       TEXT NOT NULL,
  control_description  TEXT NOT NULL,
  framework_control_id UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  assertions           TEXT[] NOT NULL DEFAULT '{}',
  frequency            TEXT NOT NULL CHECK (frequency IN ('annual', 'quarterly', 'monthly', 'weekly', 'daily', 'recurring', 'as_needed')),
  control_type         TEXT NOT NULL CHECK (control_type IN ('manual', 'automated', 'it_dependent_manual')),
  control_nature       TEXT NOT NULL DEFAULT 'preventive' CHECK (control_nature IN ('preventive', 'detective')),
  key_control          BOOLEAN NOT NULL DEFAULT TRUE,
  fraud_risk           BOOLEAN NOT NULL DEFAULT FALSE,
  risk_level           TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_level IN ('low', 'moderate', 'high')),
  system_name          TEXT,
  owner_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rcm_entries_assertions_valid CHECK (assertions <@ ARRAY['existence_occurrence', 'completeness', 'rights_obligations', 'valuation_allocation', 'presentation_disclosure', 'accuracy', 'cutoff']::TEXT[]),
  CONSTRAINT rcm_entries_org_ref_unique UNIQUE (organization_id, control_ref)
);

-- SECURITY: multi-tenant isolation -- every query filters organization_id.
CREATE INDEX IF NOT EXISTS idx_rcm_entries_org_process ON rcm_entries (organization_id, process);
CREATE INDEX IF NOT EXISTS idx_rcm_entries_framework_control ON rcm_entries (framework_control_id) WHERE framework_control_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS control_tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rcm_entry_id     UUID NOT NULL REFERENCES rcm_entries(id) ON DELETE CASCADE,
  engagement_id    UUID REFERENCES audit_engagements(id) ON DELETE SET NULL,
  test_type        TEXT NOT NULL CHECK (test_type IN ('design', 'operating_effectiveness')),
  fiscal_year      INTEGER CHECK (fiscal_year BETWEEN 2000 AND 2100),
  period_start     DATE,
  period_end       DATE,
  population_size  INTEGER CHECK (population_size IS NULL OR population_size >= 0),
  sample_size      INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  sample_method    TEXT NOT NULL DEFAULT 'frequency_table' CHECK (sample_method IN ('frequency_table', 'statistical', 'full_population', 'judgmental', 'walkthrough')),
  confidence_level NUMERIC(5,4),
  tolerable_rate   NUMERIC(5,4),
  expected_rate    NUMERIC(5,4),
  selection_seed   TEXT,
  status           TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  conclusion       TEXT CHECK (conclusion IS NULL OR conclusion IN ('effective', 'effective_with_exceptions', 'ineffective')),
  procedures       TEXT,
  notes            TEXT,
  tester_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  finding_id       UUID REFERENCES audit_findings(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT control_tests_period_valid CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_control_tests_org_year ON control_tests (organization_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_control_tests_rcm ON control_tests (rcm_entry_id);

CREATE TABLE IF NOT EXISTS control_test_samples (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  test_id               UUID NOT NULL REFERENCES control_tests(id) ON DELETE CASCADE,
  sample_number         INTEGER NOT NULL CHECK (sample_number > 0),
  item_reference        TEXT,
  result                TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'pass', 'exception', 'not_applicable')),
  exception_description TEXT,
  evidence_id           UUID REFERENCES evidence(id) ON DELETE SET NULL,
  tested_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  tested_at             TIMESTAMPTZ,
  CONSTRAINT control_test_samples_unique UNIQUE (test_id, sample_number)
);

CREATE INDEX IF NOT EXISTS idx_control_test_samples_org ON control_test_samples (organization_id);

ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS nfr_number TEXT;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS fiscal_year INTEGER;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS deficiency_level TEXT;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS auditor_organization TEXT;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS cap_poam_id UUID REFERENCES poam_items(id) ON DELETE SET NULL;
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS source_control_test_id UUID REFERENCES control_tests(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_findings_deficiency_level_valid') THEN
    ALTER TABLE audit_findings ADD CONSTRAINT audit_findings_deficiency_level_valid
      CHECK (deficiency_level IS NULL OR deficiency_level IN ('control_deficiency', 'significant_deficiency', 'material_weakness'));
  END IF;
END $$;

-- An NFR number identifies one finding per organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_findings_org_nfr
  ON audit_findings (organization_id, nfr_number) WHERE nfr_number IS NOT NULL;

INSERT INTO permissions (name, resource, action, description)
VALUES
  ('financial_audit.read', 'financial_audit', 'read', 'View the risk-control matrix, control tests and audit readiness'),
  ('financial_audit.write', 'financial_audit', 'write', 'Maintain the risk-control matrix, record control tests and raise findings')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('financial_audit.read', 'financial_audit.write')
 WHERE r.is_system_role = true AND r.name IN ('admin', 'user', 'auditor')
ON CONFLICT DO NOTHING;

SELECT 'Migration 163 completed.' AS result;
