-- Migration 013: Core Organization Profile & Framework Adoption
-- Adds missing columns to existing tables and creates the high-traffic
-- tables that many routes depend on (organization_profiles, organization_frameworks,
-- organization_settings, platform_settings).

-- ============================================================
-- PART 1: ALTER TABLE – fill in columns missing from existing tables
-- ============================================================

-- frameworks: add code / metadata columns used across all routes and seed scripts
ALTER TABLE frameworks
  ADD COLUMN IF NOT EXISTS code           VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS full_name      TEXT,
  ADD COLUMN IF NOT EXISTS issuing_body   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS official_url   TEXT,
  ADD COLUMN IF NOT EXISTS last_updated   DATE,
  ADD COLUMN IF NOT EXISTS framework_group VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tier_required  VARCHAR(50) NOT NULL DEFAULT 'free';

-- users: TOTP / platform-admin columns used in auth.js and totp.js
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_secret        TEXT,
  ADD COLUMN IF NOT EXISTS totp_backup_codes  JSONB;

-- assessment_results: extra columns used in riskScoringService
-- (control_id = denormalised FK; outcome = alias for status; assessment_date = alias for assessed_at)
ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS control_id       UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assessment_date  TIMESTAMP;

-- control_implementations: extra columns used in controls.js / implementations.js
ALTER TABLE control_implementations
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS test_result       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS test_notes        TEXT,
  ADD COLUMN IF NOT EXISTS implementation_date DATE;

-- framework_controls: sort_order and family columns used in queries
ALTER TABLE framework_controls
  ADD COLUMN IF NOT EXISTS sort_order     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS family         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT NOW();

-- ============================================================
-- PART 2: organization_profiles
-- One-row-per-Organization profile table for onboarding + CIA data
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_profiles (
  id                              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 UUID      NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Company basics
  company_legal_name              TEXT,
  company_description             TEXT,
  industry                        VARCHAR(100),
  website                         TEXT,
  headquarters_location           VARCHAR(255),
  employee_count_range            VARCHAR(50),

  -- System / boundary info
  system_name                     TEXT,
  system_description              TEXT,
  authorization_boundary          TEXT,
  operating_environment_summary   TEXT,
  authorization_boundary_override TEXT,
  operating_environment_summary_override TEXT,

  -- CIA impact classification
  confidentiality_impact          VARCHAR(20), -- low / moderate / high
  integrity_impact                VARCHAR(20),
  availability_impact             VARCHAR(20),
  impact_rationale                TEXT,

  -- Environment characteristics
  environment_types               TEXT[],      -- on_prem, cloud, hybrid, saas, ot, …
  deployment_model                VARCHAR(50), -- on_prem, single_cloud, multi_cloud, hybrid, saas_only
  cloud_providers                 TEXT[],
  data_sensitivity_types          TEXT[],      -- pii, phi, pci, cui, …

  -- Risk Management Framework stage
  rmf_stage                       VARCHAR(50),
  rmf_notes                       TEXT,

  -- Compliance profile
  compliance_profile              VARCHAR(100),
  nist_adoption_mode              VARCHAR(50),
  nist_notes                      TEXT,

  -- Onboarding state
  onboarding_completed            BOOLEAN     NOT NULL DEFAULT FALSE,
  onboarding_completed_at         TIMESTAMP,

  -- Audit
  created_by                      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by                      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_profiles_org
  ON organization_profiles(organization_id);

-- ============================================================
-- PART 3: organization_frameworks
-- Which frameworks an Organization has adopted
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_frameworks (
  id                      UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id            UUID      NOT NULL REFERENCES frameworks(id)    ON DELETE CASCADE,
  status                  VARCHAR(50) NOT NULL DEFAULT 'planning',
  target_completion_date  DATE,
  adopted_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, framework_id)
);

CREATE INDEX IF NOT EXISTS idx_org_frameworks_org
  ON organization_frameworks(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_frameworks_fw
  ON organization_frameworks(framework_id);

-- ============================================================
-- PART 4: organization_settings
-- Key-value settings store per Organization
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_settings (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  setting_key     VARCHAR(100) NOT NULL,
  setting_value   TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_org_settings_org
  ON organization_settings(organization_id);

-- ============================================================
-- PART 5: platform_settings
-- Server-wide key-value settings (SMTP, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  description   TEXT,
  is_sensitive  BOOLEAN   NOT NULL DEFAULT FALSE,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

SELECT 'Migration 013 completed.' AS result;
