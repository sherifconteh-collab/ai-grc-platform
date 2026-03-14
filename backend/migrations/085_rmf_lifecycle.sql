-- Migration 085: RMF Lifecycle Tracking (NIST SP 800-37 Rev 2)
-- Adds per-system RMF lifecycle management:
--   1) rmf_packages         – one per system, tracks current step & overall status
--   2) rmf_step_history     – audit trail of step transitions
--   3) rmf_authorization_decisions – ATO / DATO / Denial records

-- ============================================================
-- 1) RMF Packages (one per organization_system)
-- ============================================================
CREATE TABLE IF NOT EXISTS rmf_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_id UUID REFERENCES organization_systems(id) ON DELETE SET NULL,

  -- System identification (denormalized for packages without a linked system)
  system_name VARCHAR(255) NOT NULL,
  system_description TEXT,

  -- Current lifecycle position
  current_step VARCHAR(20) NOT NULL DEFAULT 'prepare',
  overall_status VARCHAR(20) NOT NULL DEFAULT 'not_started',

  -- FIPS 199 Security Categorization (CIA triad)
  confidentiality_impact VARCHAR(20),
  integrity_impact VARCHAR(20),
  availability_impact VARCHAR(20),
  categorization_level VARCHAR(20),            -- overall impact: low / moderate / high
  categorization_rationale TEXT,

  -- Selected control baseline
  selected_baseline VARCHAR(50),               -- e.g. 'moderate', 'high', 'custom'
  tailoring_notes TEXT,

  -- Authorization metadata
  authorization_type VARCHAR(50),              -- 'initial', 'reauthorization', 'ongoing', 'type'
  authorization_boundary TEXT,

  -- Lifecycle flags
  continuous_monitoring_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_assessment_date TIMESTAMP,
  next_assessment_due DATE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Each linked system has at most one RMF package per org
  CONSTRAINT rmf_packages_system_unique UNIQUE (organization_id, system_id),

  CONSTRAINT rmf_packages_step_valid CHECK (
    current_step IN ('prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor')
  ),
  CONSTRAINT rmf_packages_status_valid CHECK (
    overall_status IN ('not_started', 'in_progress', 'assessment_complete', 'authorized', 'denied', 'revoked')
  ),
  CONSTRAINT rmf_packages_cat_level_valid CHECK (
    categorization_level IS NULL OR categorization_level IN ('low', 'moderate', 'high')
  ),
  CONSTRAINT rmf_packages_ci_valid CHECK (
    confidentiality_impact IS NULL OR confidentiality_impact IN ('low', 'moderate', 'high')
  ),
  CONSTRAINT rmf_packages_ii_valid CHECK (
    integrity_impact IS NULL OR integrity_impact IN ('low', 'moderate', 'high')
  ),
  CONSTRAINT rmf_packages_ai_valid CHECK (
    availability_impact IS NULL OR availability_impact IN ('low', 'moderate', 'high')
  )
);

CREATE INDEX IF NOT EXISTS idx_rmf_packages_org
ON rmf_packages (organization_id, current_step);

CREATE INDEX IF NOT EXISTS idx_rmf_packages_system
ON rmf_packages (system_id);

-- ============================================================
-- 2) RMF Step History (audit trail of transitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS rmf_step_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rmf_package_id UUID NOT NULL REFERENCES rmf_packages(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  from_step VARCHAR(20),
  to_step VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL DEFAULT 'advance',  -- 'advance', 'revert', 'reset', 'note'

  notes TEXT,
  artifacts JSONB DEFAULT '[]'::jsonb,            -- array of { name, url, type }

  performed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  performed_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT rmf_step_history_to_valid CHECK (
    to_step IN ('prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor')
  ),
  CONSTRAINT rmf_step_history_from_valid CHECK (
    from_step IS NULL OR from_step IN ('prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor')
  ),
  CONSTRAINT rmf_step_history_action_valid CHECK (
    action IN ('advance', 'revert', 'reset', 'note')
  )
);

CREATE INDEX IF NOT EXISTS idx_rmf_step_history_package
ON rmf_step_history (rmf_package_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_rmf_step_history_org
ON rmf_step_history (organization_id, performed_at DESC);

-- ============================================================
-- 3) RMF Authorization Decisions (ATO / DATO / Denial)
-- ============================================================
CREATE TABLE IF NOT EXISTS rmf_authorization_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rmf_package_id UUID NOT NULL REFERENCES rmf_packages(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  decision_type VARCHAR(30) NOT NULL,              -- 'ato', 'dato', 'iatt', 'denial'
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,
  conditions TEXT,                                  -- any conditions attached to the authorization

  risk_level VARCHAR(20),                           -- 'low', 'moderate', 'high', 'very_high'
  residual_risk_statement TEXT,

  authorizing_official VARCHAR(255),
  authorizing_official_title VARCHAR(255),

  assessment_plan_id UUID REFERENCES assessment_plans(id) ON DELETE SET NULL,
  audit_engagement_id UUID REFERENCES audit_engagements(id) ON DELETE SET NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMP,
  revocation_reason TEXT,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT rmf_auth_decision_type_valid CHECK (
    decision_type IN ('ato', 'dato', 'iatt', 'denial')
  ),
  CONSTRAINT rmf_auth_decision_risk_valid CHECK (
    risk_level IS NULL OR risk_level IN ('low', 'moderate', 'high', 'very_high')
  )
);

CREATE INDEX IF NOT EXISTS idx_rmf_auth_decisions_package
ON rmf_authorization_decisions (rmf_package_id, is_active, decision_date DESC);

CREATE INDEX IF NOT EXISTS idx_rmf_auth_decisions_org
ON rmf_authorization_decisions (organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_rmf_auth_decisions_expiry
ON rmf_authorization_decisions (expiration_date)
WHERE is_active = true AND expiration_date IS NOT NULL;

SELECT 'Migration 085: RMF Lifecycle tables created.' AS result;
