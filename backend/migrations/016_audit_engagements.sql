-- Migration 016: Audit Engagements and Auditor Workspace
-- Supports the full audit lifecycle: engagements, PBC requests,
-- workpapers, findings, signoffs, templates, and auditor workspace links.

-- ============================================================
-- PART 1: audit_engagements
-- Top-level container for an audit engagement
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_engagements (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 VARCHAR(500) NOT NULL,
  engagement_type      VARCHAR(50) NOT NULL DEFAULT 'internal_audit',
    -- internal_audit / external_audit / readiness / assessment
  scope                TEXT,
  framework_codes      TEXT[],
  status               VARCHAR(30) NOT NULL DEFAULT 'planning',
    -- planning / fieldwork / reporting / completed / archived
  period_start         DATE,
  period_end           DATE,
  lead_auditor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  engagement_owner_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ae_org
  ON audit_engagements(organization_id);

CREATE INDEX IF NOT EXISTS idx_ae_status
  ON audit_engagements(organization_id, status);

-- ============================================================
-- PART 2: audit_pbc_requests
-- Provided-By-Client (PBC) document/evidence requests
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_pbc_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id           UUID        NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  title                   VARCHAR(500) NOT NULL,
  request_details         JSONB,
  priority                VARCHAR(20) NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  status                  VARCHAR(30) NOT NULL DEFAULT 'open',
    -- open / in_progress / submitted / accepted / rejected / closed
  due_date                DATE,
  assigned_to             UUID REFERENCES users(id) ON DELETE SET NULL,
  response_notes          TEXT,
  assessment_procedure_id UUID REFERENCES assessment_procedures(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pbc_engagement
  ON audit_pbc_requests(engagement_id);

CREATE INDEX IF NOT EXISTS idx_pbc_org
  ON audit_pbc_requests(organization_id);

-- ============================================================
-- PART 3: audit_workpapers
-- Auditor workpapers linking controls to assessment procedures
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_workpapers (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id           UUID        NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  control_id              UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  assessment_procedure_id UUID REFERENCES assessment_procedures(id) ON DELETE SET NULL,
  title                   VARCHAR(500) NOT NULL,
  objective               TEXT,
  procedure_performed     TEXT,
  conclusion              TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft / in_review / finalized
  prepared_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  prepared_at             TIMESTAMP,
  reviewed_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_notes          TEXT,
  reviewed_at             TIMESTAMP,
  created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wp_engagement
  ON audit_workpapers(engagement_id);

CREATE INDEX IF NOT EXISTS idx_wp_org
  ON audit_workpapers(organization_id);

-- ============================================================
-- PART 4: audit_findings
-- Findings identified during an audit engagement
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_findings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id         UUID        NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  related_pbc_request_id UUID REFERENCES audit_pbc_requests(id) ON DELETE SET NULL,
  related_workpaper_id  UUID REFERENCES audit_workpapers(id) ON DELETE SET NULL,
  control_id            UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  title                 VARCHAR(500) NOT NULL,
  description           TEXT,
  severity              VARCHAR(20) NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  status                VARCHAR(30) NOT NULL DEFAULT 'open',
    -- open / accepted / remediating / verified / closed
  recommendation        TEXT,
  management_response   TEXT,
  owner_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date              DATE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_af_engagement
  ON audit_findings(engagement_id);

CREATE INDEX IF NOT EXISTS idx_af_org
  ON audit_findings(organization_id);

-- ============================================================
-- PART 5: audit_signoffs
-- Formal signoff records for completed engagements
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_signoffs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id   UUID        NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  signoff_type    VARCHAR(50) NOT NULL,
    -- auditor / management / executive / customer_acknowledgment /
    -- company_leadership / auditor_firm_recommendation
  status          VARCHAR(20) NOT NULL DEFAULT 'approved', -- approved / rejected
  comments        TEXT,
  signed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  signed_by_name  VARCHAR(255),
  signed_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_as_engagement
  ON audit_signoffs(engagement_id);

-- ============================================================
-- PART 6: audit_artifact_templates
-- Reusable templates for PBC requests, workpapers, findings, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_artifact_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  artifact_type         VARCHAR(50) NOT NULL DEFAULT 'pbc',
    -- pbc / workpaper / finding / signoff / engagement_report
  template_name         VARCHAR(255),
  template_content      TEXT,
  template_format       VARCHAR(20) NOT NULL DEFAULT 'text', -- text / markdown / json
  source_filename       VARCHAR(500),
  source_mime_type      VARCHAR(100),
  extraction_parser     VARCHAR(50),
  extraction_warnings   JSONB,
  is_default            BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aat_org
  ON audit_artifact_templates(organization_id, artifact_type);

-- ============================================================
-- PART 7: auditor_workspace_links
-- Shareable read-only links for external auditors
-- ============================================================

CREATE TABLE IF NOT EXISTS auditor_workspace_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id   UUID REFERENCES audit_engagements(id) ON DELETE CASCADE,
  token           VARCHAR(128) NOT NULL UNIQUE,
  name            VARCHAR(255),
  read_only       BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMP,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_awl_org
  ON auditor_workspace_links(organization_id);

CREATE INDEX IF NOT EXISTS idx_awl_token
  ON auditor_workspace_links(token)
  WHERE active = true;

SELECT 'Migration 016 completed.' AS result;
