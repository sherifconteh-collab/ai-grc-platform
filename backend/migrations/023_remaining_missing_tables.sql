-- Migration 023: Remaining Missing Tables
-- Covers tables referenced in routes and services that were not yet created:
--   organization_invites, policy_references, asset_categories,
--   remediation_plans, regulatory_impact_assessments,
--   tprm_vendors, tprm_questionnaires, tprm_evidence

-- ============================================================
-- PART 1: organization_invites
-- Token-based invitation flow for adding users to an organization
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  invite_token    VARCHAR(128) NOT NULL UNIQUE,
  primary_role    VARCHAR(100),
  role_ids        JSONB,                   -- array of role UUIDs to assign on acceptance
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending / accepted / revoked / expired
  invited_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMP,
  expires_at      TIMESTAMP    NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oi_org
  ON organization_invites(organization_id);

CREATE INDEX IF NOT EXISTS idx_oi_token
  ON organization_invites(invite_token)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_oi_email_org
  ON organization_invites(organization_id, email, status);

-- ============================================================
-- PART 2: policy_references
-- External regulatory / standards references linked to policies
-- for automated monitoring and compliance tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_references (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id               UUID        NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  policy_section_id       UUID REFERENCES policy_sections(id) ON DELETE SET NULL,
  reference_type          VARCHAR(100) NOT NULL, -- regulation / standard / guidance / executive_order / etc.
  reference_name          VARCHAR(500) NOT NULL,
  reference_identifier    VARCHAR(200),           -- e.g. "45 CFR Part 164", "ISO 27001:2022"
  monitoring_enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
  monitoring_frequency_days INTEGER    NOT NULL DEFAULT 90,
  next_monitoring_date    DATE,
  monitoring_status       VARCHAR(30)  NOT NULL DEFAULT 'needs_review',
    -- needs_review / compliant / non_compliant / not_applicable
  last_checked_at         TIMESTAMP,
  created_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_policy
  ON policy_references(policy_id);

CREATE INDEX IF NOT EXISTS idx_pr_org_monitoring
  ON policy_references(organization_id, monitoring_enabled, next_monitoring_date)
  WHERE monitoring_enabled = TRUE;

-- ============================================================
-- PART 3: asset_categories
-- Categorization taxonomy for CMDB assets
-- ============================================================

CREATE TABLE IF NOT EXISTS asset_categories (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = global/shared
  code            VARCHAR(50)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  parent_id       UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Partial unique indexes: one for org-specific codes, one for global codes.
-- A composite UNIQUE on (organization_id, code) would allow duplicate global
-- categories because PostgreSQL treats NULL as distinct in unique constraints.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_org_code
  ON asset_categories(organization_id, code)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_global_code
  ON asset_categories(code)
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ac_org
  ON asset_categories(organization_id);

-- Seed global categories so JOINs don't fail on a fresh database.
INSERT INTO asset_categories (organization_id, code, name, description)
SELECT *
FROM (
  VALUES
    (NULL::UUID, 'server',          'Servers',           'Physical and virtual servers'),
    (NULL::UUID, 'workstation',     'Workstations',      'Employee workstations and laptops'),
    (NULL::UUID, 'network',         'Network Equipment', 'Routers, switches, firewalls'),
    (NULL::UUID, 'cloud',           'Cloud Resources',   'Cloud-hosted compute and storage'),
    (NULL::UUID, 'application',     'Applications',      'Business applications and services'),
    (NULL::UUID, 'database',        'Databases',         'Database servers and instances'),
    (NULL::UUID, 'iot',             'IoT / OT Devices',  'Internet of Things / operational technology'),
    (NULL::UUID, 'service_account', 'Service Accounts',  'Non-human identities and service accounts'),
    (NULL::UUID, 'ai_agent',        'AI Agents',         'AI-powered automation agents'),
    (NULL::UUID, 'other',           'Other',             'Miscellaneous assets')
) AS seed_rows (organization_id, code, name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM asset_categories existing
  WHERE existing.organization_id IS NULL
    AND existing.code = seed_rows.code
);

-- ============================================================
-- PART 4: regulatory_impact_assessments
-- Assesses the impact of regulatory changes on the organization
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_impact_assessments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                 VARCHAR(500) NOT NULL,
  regulatory_change     TEXT,
  impact_level          VARCHAR(20)  NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  affected_controls     JSONB,       -- array of control IDs
  affected_policies     JSONB,       -- array of policy IDs
  required_actions      TEXT,
  status                VARCHAR(30)  NOT NULL DEFAULT 'open', -- open / in_progress / completed / accepted
  due_date              DATE,
  assigned_to           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ria_org
  ON regulatory_impact_assessments(organization_id);

-- ============================================================
-- PART 5: remediation_plans
-- AI-generated or manual remediation plans for controls/vulnerabilities
-- ============================================================

CREATE TABLE IF NOT EXISTS remediation_plans (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_name                  VARCHAR(500) NOT NULL,
  plan_type                  VARCHAR(50)  NOT NULL DEFAULT 'control',
    -- control / vulnerability / regulatory_change / general
  control_id                 UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  vulnerability_id           UUID REFERENCES vulnerabilities(id) ON DELETE SET NULL,
  impact_assessment_id       UUID REFERENCES regulatory_impact_assessments(id) ON DELETE SET NULL,
  priority_score             NUMERIC(5,1),
  priority_level             VARCHAR(20)  NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  risk_reduction             NUMERIC(5,1),
  estimated_hours            NUMERIC(8,1),
  estimated_start_date       DATE,
  estimated_completion_date  DATE,
  estimated_cost             NUMERIC(12,2),
  current_state              TEXT,
  target_state               TEXT,
  success_criteria           TEXT,
  ai_generated               BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_provider                VARCHAR(50),
  ai_model                   VARCHAR(100),
  status                     VARCHAR(30)  NOT NULL DEFAULT 'draft',
    -- draft / approved / in_progress / completed / cancelled
  completion_percentage      NUMERIC(5,2) NOT NULL DEFAULT 0,
  approved_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at                TIMESTAMP,
  created_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rp_org
  ON remediation_plans(organization_id);

CREATE INDEX IF NOT EXISTS idx_rp_status
  ON remediation_plans(organization_id, status);

-- ============================================================
-- PART 6: tprm_vendors
-- Third-Party Risk Management vendor registry
-- ============================================================

CREATE TABLE IF NOT EXISTS tprm_vendors (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name       VARCHAR(500) NOT NULL,
  vendor_type       VARCHAR(100),  -- software / saas / managed_service / consulting / other
  risk_tier         VARCHAR(20)   NOT NULL DEFAULT 'medium', -- critical / high / medium / low
  services_provided TEXT,
  data_access_level VARCHAR(30)   NOT NULL DEFAULT 'none',   -- none / metadata / limited / full
  website           TEXT,
  primary_contact   VARCHAR(255),
  contact_email     VARCHAR(255),
  status            VARCHAR(30)   NOT NULL DEFAULT 'active', -- active / inactive / offboarded
  onboarded_at      DATE,
  last_reviewed_at  DATE,
  next_review_date  DATE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tv_org
  ON tprm_vendors(organization_id);

-- ============================================================
-- PART 7: tprm_questionnaires
-- Security questionnaires sent to third-party vendors
-- ============================================================

CREATE TABLE IF NOT EXISTS tprm_questionnaires (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id       UUID        NOT NULL REFERENCES tprm_vendors(id) ON DELETE CASCADE,
  title           VARCHAR(500) NOT NULL,
  questions       JSONB,
  responses       JSONB,
  status          VARCHAR(30)  NOT NULL DEFAULT 'draft',
    -- draft / sent / in_progress / submitted / under_review / completed / archived
  sent_at         TIMESTAMP,
  due_date        DATE,
  submitted_at    TIMESTAMP,
  reviewed_at     TIMESTAMP,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tq_vendor
  ON tprm_questionnaires(vendor_id);

CREATE INDEX IF NOT EXISTS idx_tq_org
  ON tprm_questionnaires(organization_id);

-- ============================================================
-- PART 8: tprm_evidence
-- Evidence files submitted by vendors for questionnaire responses
-- ============================================================

CREATE TABLE IF NOT EXISTS tprm_evidence (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  questionnaire_id     UUID        NOT NULL REFERENCES tprm_questionnaires(id) ON DELETE CASCADE,
  original_filename    VARCHAR(500) NOT NULL,
  file_path            VARCHAR(1000),
  file_size_bytes      BIGINT,
  mime_type            VARCHAR(100),
  file_content         BYTEA,          -- Stored inline intentionally: TPRM evidence files are
                                       -- small vendor documents that must be passed directly to
                                       -- the AI analysis endpoint. file_path is also stored for
                                       -- cases where external storage is preferred.
  is_sbom              BOOLEAN      NOT NULL DEFAULT FALSE,
  sbom_format          VARCHAR(30),    -- spdx / cyclonedx / etc.
  sbom_component_count INTEGER,
  sbom_summary         JSONB,
  ai_analyzed_at       TIMESTAMP,
  ai_analysis_result   JSONB,
  uploaded_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_questionnaire
  ON tprm_evidence(questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_te_org
  ON tprm_evidence(organization_id);

SELECT 'Migration 023 completed.' AS result;
