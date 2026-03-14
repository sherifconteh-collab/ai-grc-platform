-- Migration 017: Auditor engagement workflow (engagement-centric process model, original implementation)
-- Adds engagement-centered audit operations:
--   - engagements
--   - PBC requests
--   - workpapers
--   - findings
--   - sign-offs

CREATE TABLE IF NOT EXISTS audit_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  engagement_type VARCHAR(50) NOT NULL DEFAULT 'internal_audit', -- internal_audit, external_audit, readiness, assessment
  scope TEXT,
  framework_codes TEXT[] NOT NULL DEFAULT '{}'::text[],
  status VARCHAR(50) NOT NULL DEFAULT 'planning', -- planning, fieldwork, reporting, completed, archived
  period_start DATE,
  period_end DATE,
  lead_auditor_id UUID REFERENCES users(id),
  engagement_owner_id UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_engagements_status_valid CHECK (status IN ('planning', 'fieldwork', 'reporting', 'completed', 'archived'))
);

CREATE TABLE IF NOT EXISTS audit_pbc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  request_details TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, in_progress, submitted, accepted, rejected, closed
  due_date DATE,
  assigned_to UUID REFERENCES users(id),
  response_notes TEXT,
  created_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_pbc_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT audit_pbc_status_valid CHECK (status IN ('open', 'in_progress', 'submitted', 'accepted', 'rejected', 'closed'))
);

CREATE TABLE IF NOT EXISTS audit_workpapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  control_id UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  objective TEXT,
  procedure_performed TEXT,
  conclusion TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, in_review, finalized
  prepared_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewer_notes TEXT,
  prepared_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_workpapers_status_valid CHECK (status IN ('draft', 'in_review', 'finalized'))
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  related_pbc_request_id UUID REFERENCES audit_pbc_requests(id) ON DELETE SET NULL,
  related_workpaper_id UUID REFERENCES audit_workpapers(id) ON DELETE SET NULL,
  control_id UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, accepted, remediating, verified, closed
  recommendation TEXT,
  management_response TEXT,
  owner_user_id UUID REFERENCES users(id),
  due_date DATE,
  created_by UUID REFERENCES users(id),
  closed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_findings_severity_valid CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT audit_findings_status_valid CHECK (status IN ('open', 'accepted', 'remediating', 'verified', 'closed'))
);

CREATE TABLE IF NOT EXISTS audit_signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  signoff_type VARCHAR(50) NOT NULL, -- auditor, management, executive
  status VARCHAR(50) NOT NULL DEFAULT 'approved', -- approved, rejected
  comments TEXT,
  signed_by UUID NOT NULL REFERENCES users(id),
  signed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_signoffs_type_valid CHECK (signoff_type IN ('auditor', 'management', 'executive')),
  CONSTRAINT audit_signoffs_status_valid CHECK (status IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_audit_engagements_org
ON audit_engagements (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_engagements_status
ON audit_engagements (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_pbc_engagement
ON audit_pbc_requests (engagement_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_audit_workpapers_engagement
ON audit_workpapers (engagement_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_findings_engagement
ON audit_findings (engagement_id, severity, status, due_date);

CREATE INDEX IF NOT EXISTS idx_audit_signoffs_engagement
ON audit_signoffs (engagement_id, signoff_type, signed_at DESC);

SELECT 'Migration 017 completed.' AS result;
