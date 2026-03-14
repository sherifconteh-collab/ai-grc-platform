-- Migration 014: Evidence Management
-- Creates the evidence-related tables used throughout the platform.
-- NOTE: The codebase references these tables as "evidence" and
-- "evidence_control_links" (NOT the older "evidence_files" /
-- "control_evidence" names from migration 002).

-- ============================================================
-- PART 1: evidence
-- Primary evidence store (files, records, screenshots, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by             UUID        REFERENCES users(id) ON DELETE SET NULL,
  file_name               VARCHAR(500) NOT NULL,
  file_path               VARCHAR(1000) NOT NULL,
  file_size               BIGINT,
  mime_type               VARCHAR(100),
  description             TEXT,
  tags                    TEXT[],
  integrity_hash_sha256   VARCHAR(64),
  evidence_version        INTEGER     NOT NULL DEFAULT 1,
  retention_until         DATE,
  integrity_verified_at   TIMESTAMP,
  created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_org
  ON evidence(organization_id);

CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by
  ON evidence(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_evidence_retention
  ON evidence(retention_until);

-- ============================================================
-- PART 2: evidence_control_links
-- Associates evidence records with framework controls
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence_control_links (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID      NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  control_id  UUID      NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  notes       TEXT,
  linked_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (evidence_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_ecl_evidence
  ON evidence_control_links(evidence_id);

CREATE INDEX IF NOT EXISTS idx_ecl_control
  ON evidence_control_links(control_id);

-- ============================================================
-- PART 3: evidence_collection_rules
-- Scheduled / automatic evidence collection from integrations
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence_collection_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  source_type     VARCHAR(50)  NOT NULL, -- 'splunk', 'sentinel', 'jira', etc.
  source_config   JSONB,                 -- integration-specific connection config
  query           TEXT,                  -- search query / filter
  tags            TEXT[],
  enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  schedule        VARCHAR(20)  NOT NULL DEFAULT 'manual', -- 'manual', 'daily', 'weekly', 'monthly'
  next_run_at     TIMESTAMP,
  last_run_at     TIMESTAMP,
  last_run_status VARCHAR(20),           -- 'success', 'failed', 'running'
  last_run_error  TEXT,
  last_evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecr_org
  ON evidence_collection_rules(organization_id);

CREATE INDEX IF NOT EXISTS idx_ecr_next_run
  ON evidence_collection_rules(next_run_at)
  WHERE enabled = true;

-- ============================================================
-- PART 4: data_retention_policies
-- Configures how long evidence (and other data) is retained
-- ============================================================

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type   VARCHAR(50) NOT NULL, -- 'evidence', 'audit_logs', etc.
  retention_days  INTEGER   NOT NULL,
  active          BOOLEAN   NOT NULL DEFAULT TRUE,
  auto_enforce    BOOLEAN   NOT NULL DEFAULT FALSE,
  description     TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drp_org
  ON data_retention_policies(organization_id);

-- ============================================================
-- PART 5: legal_holds
-- Preserves evidence/data beyond normal retention rules
-- ============================================================

CREATE TABLE IF NOT EXISTS legal_holds (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type   VARCHAR(50) NOT NULL, -- 'evidence', etc.
  resource_id     UUID,                  -- NULL = all resources of that type
  reason          TEXT,
  active          BOOLEAN   NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_org
  ON legal_holds(organization_id);

CREATE INDEX IF NOT EXISTS idx_legal_holds_resource
  ON legal_holds(organization_id, resource_type, resource_id)
  WHERE active = true;

SELECT 'Migration 014 completed.' AS result;
