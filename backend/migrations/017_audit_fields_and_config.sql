-- Migration 017: Audit Fields, Dynamic Config, and Platform Jobs
-- Adds the dynamic audit-field system, generic key-value config store,
-- and the background job queue.

-- ============================================================
-- PART 1: audit_field_definitions
-- Organization-defined custom fields for audit log entries
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_field_definitions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_name           VARCHAR(100) NOT NULL,
  display_name         VARCHAR(255) NOT NULL,
  field_type           VARCHAR(30)  NOT NULL DEFAULT 'text',
    -- text / number / boolean / datetime / json / select / multiselect
  description          TEXT,
  source_integration   VARCHAR(50),          -- splunk / sentinel / jira / etc.
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  is_ai_suggested      BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_confidence_score  NUMERIC(4,3),
  suggested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_afd_org
  ON audit_field_definitions(organization_id);

-- ============================================================
-- PART 2: audit_column_preferences
-- Per-user or org-wide column visibility settings
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_column_preferences (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  is_org_default  BOOLEAN   NOT NULL DEFAULT FALSE,
  visible_columns JSONB,
  column_order    JSONB,
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_acp_org
  ON audit_column_preferences(organization_id);

-- ============================================================
-- PART 3: audit_log_custom_fields
-- Values of dynamic fields attached to individual audit log entries
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log_custom_fields (
  audit_log_id        UUID NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES audit_field_definitions(id) ON DELETE CASCADE,
  field_value         JSONB,
  PRIMARY KEY (audit_log_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_alcf_log
  ON audit_log_custom_fields(audit_log_id);

-- ============================================================
-- PART 4: audit_field_suggestions
-- AI-generated suggestions for new dynamic audit fields
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_field_suggestions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  suggested_field_name  VARCHAR(100) NOT NULL,
  suggested_field_type  VARCHAR(30)  NOT NULL DEFAULT 'text',
  display_name          VARCHAR(255),
  description           TEXT,
  source_integration    VARCHAR(50),
  sample_values         JSONB,
  occurrence_count      INTEGER      NOT NULL DEFAULT 1,
  confidence_score      NUMERIC(4,3),
  status                VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending / accepted / rejected
  reviewed_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, suggested_field_name)
);

CREATE INDEX IF NOT EXISTS idx_afs_org
  ON audit_field_suggestions(organization_id, status);

-- ============================================================
-- PART 5: dynamic_config_entries
-- Generic key-value config for integrations, AI settings, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS dynamic_config_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = server-wide
  config_domain   VARCHAR(100) NOT NULL, -- license / integration / ai_settings / etc.
  config_key      VARCHAR(200) NOT NULL,
  config_value    JSONB,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, config_domain, config_key)
);

CREATE INDEX IF NOT EXISTS idx_dce_org_domain
  ON dynamic_config_entries(organization_id, config_domain);

-- ============================================================
-- PART 6: platform_jobs
-- Async background job queue (evidence collection, webhooks, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  job_type        VARCHAR(100) NOT NULL,
    -- webhook_flush / retention_cleanup / integration_sync / evidence_auto_collect
  payload         JSONB,
  status          VARCHAR(20)  NOT NULL DEFAULT 'queued', -- queued / running / completed / failed
  run_after       TIMESTAMP,
  started_at      TIMESTAMP,
  finished_at     TIMESTAMP,
  error_message   TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pj_org_status
  ON platform_jobs(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_pj_run_after
  ON platform_jobs(run_after, status)
  WHERE status = 'queued';

SELECT 'Migration 017 completed.' AS result;
