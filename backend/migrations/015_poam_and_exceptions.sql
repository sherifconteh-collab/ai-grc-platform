-- Migration 015: POA&M, Exceptions, and Vulnerability Tracking
-- Adds Plan of Action & Milestones (POA&M) tables, control exception
-- management, vulnerability tracking, and control-inheritance audit events.

-- ============================================================
-- PART 1: vulnerabilities
-- Tracks external vulnerability records (CVEs, scanner findings, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vuln_id         VARCHAR(100),           -- external ID (e.g. CVE-2024-1234)
  title           TEXT        NOT NULL,
  description     TEXT,
  severity        VARCHAR(20) NOT NULL DEFAULT 'medium', -- critical / high / medium / low
  cvss_score      NUMERIC(4,1),
  status          VARCHAR(30) NOT NULL DEFAULT 'open', -- open / in_progress / remediated / accepted / false_positive
  source          VARCHAR(50),                          -- scanner, manual, feed, etc.
  asset_id        UUID,                                 -- optional link to assets table
  discovered_at   TIMESTAMP,
  remediated_at   TIMESTAMP,
  due_date        DATE,
  owasp_top10_2025_category VARCHAR(100),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vulnerabilities_org
  ON vulnerabilities(organization_id);

CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity
  ON vulnerabilities(organization_id, severity, status);

-- ============================================================
-- PART 2: vulnerability_findings
-- Shorter-lived operational findings (e.g. from automated scans)
-- ============================================================

CREATE TABLE IF NOT EXISTS vulnerability_findings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vulnerability_id UUID       REFERENCES vulnerabilities(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  severity        VARCHAR(20) NOT NULL DEFAULT 'medium', -- critical / high / medium / low
  status          VARCHAR(30) NOT NULL DEFAULT 'open',   -- open / in_progress / remediated
  source          VARCHAR(50),
  details         JSONB,
  due_date        DATE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vf_org
  ON vulnerability_findings(organization_id);

CREATE INDEX IF NOT EXISTS idx_vf_status
  ON vulnerability_findings(organization_id, status);

-- ============================================================
-- PART 3: vulnerability_control_work_items
-- Links open vulnerabilities to affected framework controls
-- ============================================================

CREATE TABLE IF NOT EXISTS vulnerability_control_work_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_control_id UUID        NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  vulnerability_id     UUID        REFERENCES vulnerabilities(id) ON DELETE CASCADE,
  finding_id           UUID        REFERENCES vulnerability_findings(id) ON DELETE CASCADE,
  action_status        VARCHAR(30) NOT NULL DEFAULT 'open', -- open / in_progress / resolved / accepted
  control_effect       VARCHAR(50),                          -- how the vuln affects the control
  notes                TEXT,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vcwi_org
  ON vulnerability_control_work_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_vcwi_control
  ON vulnerability_control_work_items(organization_id, framework_control_id);

-- ============================================================
-- PART 4: poam_items
-- Plan of Action & Milestones items
-- ============================================================

CREATE TABLE IF NOT EXISTS poam_items (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                     VARCHAR(500) NOT NULL,
  description               TEXT,
  source_type               VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual / vulnerability / control / audit_finding / assessment
  source_id                 UUID,
  vulnerability_id          UUID REFERENCES vulnerability_findings(id) ON DELETE SET NULL,
  control_id                UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  owner_id                  UUID REFERENCES users(id) ON DELETE SET NULL,
  status                    VARCHAR(50) NOT NULL DEFAULT 'open',
    -- open / in_progress / pending_review / pending_auditor_review /
    -- auditor_approved / auditor_rejected / closed / risk_accepted
  priority                  VARCHAR(20) NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  due_date                  DATE,
  remediation_plan          TEXT,
  risk_acceptance_expires_at TIMESTAMP,
  closure_notes             TEXT,
  closed_at                 TIMESTAMP,
  created_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poam_items_org
  ON poam_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_poam_items_status
  ON poam_items(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_poam_items_control
  ON poam_items(control_id);

-- ============================================================
-- PART 5: poam_item_updates
-- Changelog entries for POA&M items
-- ============================================================

CREATE TABLE IF NOT EXISTS poam_item_updates (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  poam_item_id     UUID      NOT NULL REFERENCES poam_items(id) ON DELETE CASCADE,
  update_type      VARCHAR(50) NOT NULL DEFAULT 'note', -- status_change / note
  note             TEXT,
  previous_status  VARCHAR(50),
  new_status       VARCHAR(50),
  changed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poam_updates_item
  ON poam_item_updates(poam_item_id);

-- ============================================================
-- PART 6: poam_approval_requests
-- Approval workflow for POA&M status changes
-- ============================================================

CREATE TABLE IF NOT EXISTS poam_approval_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  poam_item_id            UUID        NOT NULL REFERENCES poam_items(id) ON DELETE CASCADE,
  control_id              UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  previous_control_status VARCHAR(50),
  new_control_status      VARCHAR(50),
  justification           TEXT,
  submitted_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
  reviewed_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMP,
  review_outcome          VARCHAR(30),  -- approved / rejected / changes_requested
  review_comments         TEXT,
  framework_specific_type VARCHAR(100) NOT NULL DEFAULT 'standard',
  framework_specific_data JSONB        NOT NULL DEFAULT '{}',
  updated_at              TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poam_approval_item
  ON poam_approval_requests(poam_item_id);

CREATE INDEX IF NOT EXISTS idx_poam_approval_org
  ON poam_approval_requests(organization_id);

-- ============================================================
-- PART 7: control_exceptions
-- Formal control exception records with approval workflow
-- ============================================================

CREATE TABLE IF NOT EXISTS control_exceptions (
  id                    UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id            UUID      NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  title                 VARCHAR(500) NOT NULL,
  reason                TEXT,
  compensating_controls TEXT,
  business_impact       TEXT,
  owner_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / active / expired / revoked
  expires_at            TIMESTAMP,
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMP,
  revoked_at            TIMESTAMP,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exceptions_org
  ON control_exceptions(organization_id);

CREATE INDEX IF NOT EXISTS idx_exceptions_control
  ON control_exceptions(control_id);

CREATE INDEX IF NOT EXISTS idx_exceptions_status
  ON control_exceptions(organization_id, status);

-- ============================================================
-- PART 8: control_inheritance_events
-- Audit trail for control status inheritance events
-- ============================================================

CREATE TABLE IF NOT EXISTS control_inheritance_events (
  id                 UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_control_id  UUID      NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  target_control_id  UUID      NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  source_status      VARCHAR(50),
  inherited_status   VARCHAR(50),
  similarity_score   INTEGER,  -- 0-100
  event_notes        TEXT,
  triggered_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cie_org
  ON control_inheritance_events(organization_id);

SELECT 'Migration 015 completed.' AS result;
