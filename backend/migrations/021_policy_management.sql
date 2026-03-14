-- Migration 021: Policy Management
-- Full lifecycle management for Organizational policies: creation, versioning,
-- AI-powered gap analysis, control mapping, reviews, monitoring, and user acknowledgment.

-- ============================================================
-- PART 1: organization_policies
-- Master policy registry
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_policies (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_name           VARCHAR(500) NOT NULL,
  policy_type           VARCHAR(100),
  description           TEXT,
  version               VARCHAR(50)  NOT NULL DEFAULT '1.0',
  status                VARCHAR(30)  NOT NULL DEFAULT 'draft',
    -- draft / under_review / approved / published / archived
  effective_date        DATE,
  review_frequency_days INTEGER      NOT NULL DEFAULT 365,
  next_review_date      DATE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMP,
  published_at          TIMESTAMP,
  archived_at           TIMESTAMP,
  created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_op_org
  ON organization_policies(organization_id);

CREATE INDEX IF NOT EXISTS idx_op_status
  ON organization_policies(organization_id, status);

-- ============================================================
-- PART 2: policy_uploads
-- Documents uploaded for gap analysis
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_uploads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id         UUID REFERENCES organization_policies(id) ON DELETE SET NULL,
  file_name         VARCHAR(500) NOT NULL,
  file_path         VARCHAR(1000) NOT NULL,
  file_size         BIGINT,
  mime_type         VARCHAR(100),
  file_hash         VARCHAR(64),
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  parsed_content    TEXT,
  processing_status VARCHAR(30)  NOT NULL DEFAULT 'pending',
    -- pending / processing / completed / failed
  processing_error  TEXT,
  is_baseline       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pu_org
  ON policy_uploads(organization_id);

CREATE INDEX IF NOT EXISTS idx_pu_policy
  ON policy_uploads(policy_id);

-- ============================================================
-- PART 3: policy_gap_analysis
-- AI-generated gap analysis results for a policy document
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_gap_analysis (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_upload_id        UUID        NOT NULL REFERENCES policy_uploads(id) ON DELETE CASCADE,
  framework_id            UUID        NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  total_controls_analyzed INTEGER     NOT NULL DEFAULT 0,
  controls_covered        INTEGER     NOT NULL DEFAULT 0,
  controls_with_gaps      INTEGER     NOT NULL DEFAULT 0,
  coverage_percentage     NUMERIC(5,2) NOT NULL DEFAULT 0,
  gap_summary             JSONB,    -- { by_severity: {...}, by_type: {...} }
  analysis_date           TIMESTAMP   NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pga_org
  ON policy_gap_analysis(organization_id);

CREATE INDEX IF NOT EXISTS idx_pga_upload
  ON policy_gap_analysis(policy_upload_id);

-- ============================================================
-- PART 4: policy_control_gaps
-- Individual gap entries produced by the gap analysis
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_control_gaps (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gap_analysis_id     UUID        NOT NULL REFERENCES policy_gap_analysis(id) ON DELETE CASCADE,
  control_id          UUID        NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  framework_id        UUID        NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  gap_type            VARCHAR(30) NOT NULL DEFAULT 'missing',
    -- missing / partial / unclear / outdated
  gap_severity        VARCHAR(20) NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  gap_description     TEXT,
  recommended_action  TEXT,
  ai_confidence_score NUMERIC(4,3),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  review_status       VARCHAR(30),
  created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcg_gap_analysis
  ON policy_control_gaps(gap_analysis_id);

CREATE INDEX IF NOT EXISTS idx_pcg_org
  ON policy_control_gaps(organization_id);

-- ============================================================
-- PART 5: policy_sections
-- Structured sections within a policy document
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_sections (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id            UUID        NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  section_number       VARCHAR(50),
  section_title        VARCHAR(500),
  section_content      TEXT,
  framework_family_code VARCHAR(100),
  framework_family_name VARCHAR(255),
  display_order        INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ps_policy
  ON policy_sections(policy_id);

-- ============================================================
-- PART 6: policy_control_mappings
-- Links individual policy sections to framework controls
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_control_mappings (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_section_id UUID      NOT NULL REFERENCES policy_sections(id) ON DELETE CASCADE,
  control_id        UUID      NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  framework_id      UUID      NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  mapping_notes     TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (policy_section_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_section
  ON policy_control_mappings(policy_section_id);

CREATE INDEX IF NOT EXISTS idx_pcm_control
  ON policy_control_mappings(control_id);

-- ============================================================
-- PART 7: policy_reviews
-- Scheduled and ad-hoc review records for policies
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_reviews (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id                   UUID        NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  review_type                 VARCHAR(30) NOT NULL DEFAULT 'annual',
    -- annual / triggered / ad_hoc / change_driven
  review_date                 DATE,
  reviewed_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  review_status               VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    -- scheduled / in_progress / completed / overdue
  review_notes                TEXT,
  next_review_date            DATE,
  changes_made                BOOLEAN     NOT NULL DEFAULT FALSE,
  requires_user_acknowledgment BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_policy
  ON policy_reviews(policy_id);

CREATE INDEX IF NOT EXISTS idx_pr_org
  ON policy_reviews(organization_id);

-- ============================================================
-- PART 8: policy_monitoring_alerts
-- Compliance alerts generated by the policy monitoring system
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_monitoring_alerts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id           UUID        NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  alert_type          VARCHAR(100) NOT NULL, -- acknowledgment_required / review_overdue / gap_detected / etc.
  alert_severity      VARCHAR(20)  NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  alert_message       TEXT,
  alert_details       JSONB,
  resolved            BOOLEAN      NOT NULL DEFAULT FALSE,
  resolved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pma_policy
  ON policy_monitoring_alerts(policy_id);

CREATE INDEX IF NOT EXISTS idx_pma_org_unresolved
  ON policy_monitoring_alerts(organization_id, resolved)
  WHERE resolved = FALSE;

-- ============================================================
-- PART 9: policy_user_acknowledgments
-- Records of users confirming they have read a policy version
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_user_acknowledgments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id         UUID        NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  policy_review_id  UUID REFERENCES policy_reviews(id) ON DELETE SET NULL,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_version    VARCHAR(50),
  acknowledgment_notes TEXT,
  acknowledged_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (policy_id, user_id, policy_review_id)
);

CREATE INDEX IF NOT EXISTS idx_pua_policy
  ON policy_user_acknowledgments(policy_id);

CREATE INDEX IF NOT EXISTS idx_pua_user
  ON policy_user_acknowledgments(user_id);

SELECT 'Migration 021 completed.' AS result;
