-- Migration 119: Cyber Resilience (BC/DR plans, tabletop/DR testing, resilience score)
-- Why: compliance evidence and control status alone don't tell an org whether it can
-- actually recover from an incident. This gives every organization a BC/DR/incident-
-- response/ransomware-playbook program tracker, tabletop and DR exercise logging with
-- RTO/RPO attainment, and a computed Cyber Resilience Score that also folds in the
-- existing backup_logs success rate (migration 106) rather than duplicating it.
-- Ships in release 4.3.0.

-- ============================================================
-- 1) Resilience plans (BC/DR, incident response, ransomware playbooks)
-- ============================================================
CREATE TABLE IF NOT EXISTS resilience_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_id UUID REFERENCES organization_systems(id) ON DELETE SET NULL,  -- NULL = org-wide plan

  plan_type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',

  rto_target_hours NUMERIC(10,2),   -- Recovery Time Objective
  rpo_target_hours NUMERIC(10,2),   -- Recovery Point Objective

  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_tested_date DATE,
  next_test_due DATE,
  document_url TEXT,                -- link to the actual plan document/evidence

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT resilience_plans_type_valid CHECK (
    plan_type IN ('incident_response', 'business_continuity', 'disaster_recovery', 'ransomware_playbook')
  ),
  CONSTRAINT resilience_plans_status_valid CHECK (
    status IN ('draft', 'active', 'under_review', 'retired')
  )
);

CREATE INDEX IF NOT EXISTS idx_resilience_plans_org_status
ON resilience_plans (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_resilience_plans_org_next_test
ON resilience_plans (organization_id, next_test_due);

CREATE INDEX IF NOT EXISTS idx_resilience_plans_system
ON resilience_plans (system_id);

-- ============================================================
-- 2) Resilience tests (tabletop / functional / full-scale exercises)
-- ============================================================
CREATE TABLE IF NOT EXISTS resilience_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resilience_plan_id UUID NOT NULL REFERENCES resilience_plans(id) ON DELETE CASCADE,

  test_type VARCHAR(20) NOT NULL,
  scenario TEXT NOT NULL,
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of participant name/role strings

  outcome VARCHAR(20) NOT NULL,
  actual_rto_hours NUMERIC(10,2),
  actual_rpo_hours NUMERIC(10,2),
  findings TEXT,

  -- Links a failed/partial test's follow-up directly to the existing POA&M module.
  remediation_poam_id UUID REFERENCES poam_items(id) ON DELETE SET NULL,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT resilience_tests_type_valid CHECK (
    test_type IN ('tabletop', 'functional', 'full_scale')
  ),
  CONSTRAINT resilience_tests_outcome_valid CHECK (
    outcome IN ('passed', 'partial', 'failed')
  ),
  CONSTRAINT resilience_tests_participants_is_array CHECK (
    jsonb_typeof(participants) = 'array'
  )
);

-- SECURITY: resilience_tests has no organization scoping column beyond the redundant
-- organization_id copy; every read/write must additionally join through
-- resilience_plans.organization_id (never trust a bare resilience_plan_id param).
CREATE INDEX IF NOT EXISTS idx_resilience_tests_plan
ON resilience_tests (resilience_plan_id, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_resilience_tests_org
ON resilience_tests (organization_id, test_date DESC);

COMMENT ON TABLE resilience_plans IS 'BC/DR/incident-response/ransomware playbooks per organization (Cyber Resilience module).';
COMMENT ON TABLE resilience_tests IS 'Tabletop/functional/full-scale exercise results against a resilience plan, with RTO/RPO attainment.';

SELECT 'Migration 119: Cyber Resilience tables created.' AS result;
