-- Migration 024: Organization onboarding profile (NIST 800-18 + 800-37 unified intake)
-- Captures company/system context, CIA impact baseline, environment posture, and RMF stage.

CREATE TABLE IF NOT EXISTS organization_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    -- Organization context
    company_legal_name VARCHAR(255),
    company_description TEXT,
    industry VARCHAR(120),
    website VARCHAR(255),
    headquarters_location VARCHAR(255),
    employee_count_range VARCHAR(50),

    -- System Security Plan context (NIST SP 800-18)
    system_name VARCHAR(255),
    system_description TEXT,
    authorization_boundary TEXT,
    operating_environment_summary TEXT,

    -- CIA baseline
    confidentiality_impact VARCHAR(20),
    integrity_impact VARCHAR(20),
    availability_impact VARCHAR(20),
    impact_rationale TEXT,

    -- Operating environment
    environment_types TEXT[] NOT NULL DEFAULT '{}'::text[],
    deployment_model VARCHAR(50),
    cloud_providers TEXT[] NOT NULL DEFAULT '{}'::text[],
    data_sensitivity_types TEXT[] NOT NULL DEFAULT '{}'::text[],

    -- RMF posture (NIST SP 800-37 Rev.2)
    rmf_stage VARCHAR(30),
    rmf_notes TEXT,

    -- Workflow state
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_completed_at TIMESTAMP,

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT organization_profiles_confidentiality_valid
      CHECK (confidentiality_impact IS NULL OR confidentiality_impact IN ('low', 'moderate', 'high')),
    CONSTRAINT organization_profiles_integrity_valid
      CHECK (integrity_impact IS NULL OR integrity_impact IN ('low', 'moderate', 'high')),
    CONSTRAINT organization_profiles_availability_valid
      CHECK (availability_impact IS NULL OR availability_impact IN ('low', 'moderate', 'high')),
    CONSTRAINT organization_profiles_rmf_stage_valid
      CHECK (
        rmf_stage IS NULL OR rmf_stage IN (
          'prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor'
        )
      )
);

CREATE INDEX IF NOT EXISTS idx_organization_profiles_org
ON organization_profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_profiles_onboarding
ON organization_profiles (onboarding_completed);

COMMENT ON TABLE organization_profiles IS 'Unified onboarding profile for NIST 800-18/800-37 aligned system context.';

