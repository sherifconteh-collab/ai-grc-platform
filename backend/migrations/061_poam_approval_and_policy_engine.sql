-- Migration 061: POA&M Approval Workflow and Policy Documentation Engine
-- Covers:
-- 1) POA&M approval workflow for auditors
-- 2) Organization policy management with control family structure
-- 3) Policy review and compliance monitoring system

-- 1) Extend POA&M items for approval workflow
ALTER TABLE poam_items 
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(50), -- pending_auditor_review, auditor_approved, auditor_rejected, changes_requested
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Add new valid statuses for POA&M workflow
ALTER TABLE poam_items DROP CONSTRAINT IF EXISTS poam_status_valid;
ALTER TABLE poam_items ADD CONSTRAINT poam_status_valid 
  CHECK (status IN ('open', 'in_progress', 'pending_review', 'pending_auditor_review', 'auditor_approved', 'auditor_rejected', 'closed', 'risk_accepted'));

CREATE INDEX IF NOT EXISTS idx_poam_review_status 
  ON poam_items(organization_id, review_status, submitted_for_review_at);

-- POA&M approval requests tracking
CREATE TABLE IF NOT EXISTS poam_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  poam_item_id UUID NOT NULL REFERENCES poam_items(id) ON DELETE CASCADE,
  control_id UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  framework_id UUID REFERENCES frameworks(id) ON DELETE SET NULL,
  previous_control_status VARCHAR(50),
  new_control_status VARCHAR(50),
  justification TEXT,
  supporting_evidence_ids UUID[], -- Array of evidence file IDs
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  review_outcome VARCHAR(50), -- approved, rejected, changes_requested
  review_comments TEXT,
  framework_specific_type VARCHAR(100), -- e.g., 'fiscam_cap', 'fiscam_nfr', 'standard', 'iso_car', 'soc2_exception'
  framework_specific_data JSONB DEFAULT '{}'::jsonb, -- Store framework-specific fields
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE poam_approval_requests
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES frameworks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poam_approval_org
  ON poam_approval_requests(organization_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_poam_approval_item
  ON poam_approval_requests(poam_item_id);

CREATE INDEX IF NOT EXISTS idx_poam_approval_control
  ON poam_approval_requests(control_id);

CREATE INDEX IF NOT EXISTS idx_poam_approval_framework
  ON poam_approval_requests(framework_id);

CREATE INDEX IF NOT EXISTS idx_poam_approval_type
  ON poam_approval_requests(organization_id, framework_specific_type);

-- 2) Organization policy management
CREATE TABLE IF NOT EXISTS organization_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_name VARCHAR(255) NOT NULL,
  policy_type VARCHAR(100) NOT NULL, -- security_policy, access_control_policy, data_governance_policy, incident_response_policy, etc.
  description TEXT,
  version VARCHAR(50) NOT NULL DEFAULT '1.0',
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, under_review, approved, published, archived
  effective_date DATE,
  review_frequency_days INTEGER NOT NULL DEFAULT 365, -- Annual review by default
  next_review_date DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  published_at TIMESTAMP,
  archived_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT policy_status_valid CHECK (status IN ('draft', 'under_review', 'approved', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_org_policies_org_status
  ON organization_policies(organization_id, status, next_review_date);

-- Policy sections organized by control families (similar to NIST 800-53 structure)
CREATE TABLE IF NOT EXISTS policy_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  section_number VARCHAR(20) NOT NULL, -- e.g., "AC-1", "AU-2", or "1.0", "2.1"
  section_title VARCHAR(255) NOT NULL, -- e.g., "Access Control Policy and Procedures"
  section_content TEXT NOT NULL,
  framework_family_code VARCHAR(50), -- e.g., "AC" for Access Control, "AU" for Audit
  framework_family_name VARCHAR(255), -- e.g., "Access Control", "Audit and Accountability"
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_sections_policy
  ON policy_sections(policy_id, display_order);

CREATE INDEX IF NOT EXISTS idx_policy_sections_family
  ON policy_sections(organization_id, framework_family_code);

-- Map policy sections to specific controls across frameworks
CREATE TABLE IF NOT EXISTS policy_control_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_section_id UUID NOT NULL REFERENCES policy_sections(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  mapping_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(policy_section_id, control_id)
);

ALTER TABLE policy_control_mappings
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_policy_control_mapping_section
  ON policy_control_mappings(policy_section_id);

CREATE INDEX IF NOT EXISTS idx_policy_control_mapping_control
  ON policy_control_mappings(control_id);

CREATE INDEX IF NOT EXISTS idx_policy_control_mapping_framework
  ON policy_control_mappings(framework_id);

-- Policy review and acknowledgment tracking
CREATE TABLE IF NOT EXISTS policy_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  review_type VARCHAR(50) NOT NULL, -- annual, triggered, ad_hoc, change_driven
  review_date DATE NOT NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_status VARCHAR(50) NOT NULL, -- scheduled, in_progress, completed, overdue
  review_notes TEXT,
  next_review_date DATE,
  changes_made BOOLEAN NOT NULL DEFAULT FALSE,
  requires_user_acknowledgment BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_reviews_policy
  ON policy_reviews(policy_id, review_date DESC);

CREATE INDEX IF NOT EXISTS idx_policy_reviews_status
  ON policy_reviews(organization_id, review_status, next_review_date);

-- User acknowledgment of policy changes
CREATE TABLE IF NOT EXISTS policy_user_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  policy_review_id UUID REFERENCES policy_reviews(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  acknowledgment_notes TEXT,
  policy_version VARCHAR(50),
  UNIQUE(policy_id, user_id, policy_review_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_acknowledgments_policy
  ON policy_user_acknowledgments(policy_id, acknowledged_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_acknowledgments_user
  ON policy_user_acknowledgments(user_id, acknowledged_at DESC);

-- Policy references that require continuous monitoring
CREATE TABLE IF NOT EXISTS policy_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  policy_section_id UUID REFERENCES policy_sections(id) ON DELETE CASCADE,
  reference_type VARCHAR(100) NOT NULL, -- asset, system, process, third_party, regulation, standard, control
  reference_name VARCHAR(255) NOT NULL,
  reference_identifier VARCHAR(255), -- e.g., system ID, asset tag, regulation code
  reference_description TEXT,
  monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monitoring_frequency_days INTEGER, -- How often to check this reference
  last_monitored_at TIMESTAMP,
  next_monitoring_date DATE,
  monitoring_status VARCHAR(50), -- compliant, non_compliant, needs_review, not_applicable
  monitoring_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_references_policy
  ON policy_references(policy_id);

CREATE INDEX IF NOT EXISTS idx_policy_references_section
  ON policy_references(policy_section_id);

CREATE INDEX IF NOT EXISTS idx_policy_references_monitoring
  ON policy_references(organization_id, monitoring_enabled, next_monitoring_date);

-- Policy monitoring alerts
CREATE TABLE IF NOT EXISTS policy_monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES organization_policies(id) ON DELETE CASCADE,
  policy_reference_id UUID REFERENCES policy_references(id) ON DELETE CASCADE,
  alert_type VARCHAR(100) NOT NULL, -- review_due, reference_changed, compliance_issue, acknowledgment_required
  alert_severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  alert_message TEXT NOT NULL,
  alert_details JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_alerts_org_status
  ON policy_monitoring_alerts(organization_id, resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_alerts_policy
  ON policy_monitoring_alerts(policy_id, resolved);

CREATE INDEX IF NOT EXISTS idx_policy_alerts_severity
  ON policy_monitoring_alerts(organization_id, alert_severity, resolved);

-- Policy uploads and gap analysis
CREATE TABLE IF NOT EXISTS policy_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  file_hash VARCHAR(64), -- SHA256 hash
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  upload_date TIMESTAMP NOT NULL DEFAULT NOW(),
  processing_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  processing_error TEXT,
  parsed_content TEXT, -- Extracted text content from the policy
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE, -- Is this the baseline policy for generation?
  policy_id UUID REFERENCES organization_policies(id) ON DELETE SET NULL, -- Linked generated policy
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE policy_uploads
  ADD COLUMN IF NOT EXISTS upload_date TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_policy_uploads_org
  ON policy_uploads(organization_id, upload_date DESC);

CREATE INDEX IF NOT EXISTS idx_policy_uploads_baseline
  ON policy_uploads(organization_id, is_baseline) WHERE is_baseline = true;

-- Policy gap analysis results
CREATE TABLE IF NOT EXISTS policy_gap_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_upload_id UUID NOT NULL REFERENCES policy_uploads(id) ON DELETE CASCADE,
  analysis_date TIMESTAMP NOT NULL DEFAULT NOW(),
  framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
  total_controls_analyzed INTEGER NOT NULL DEFAULT 0,
  controls_covered INTEGER NOT NULL DEFAULT 0,
  controls_with_gaps INTEGER NOT NULL DEFAULT 0,
  coverage_percentage NUMERIC(5,2),
  gap_summary JSONB DEFAULT '{}'::jsonb, -- Summary statistics
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE policy_gap_analysis
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS analysis_date TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_policy_gap_upload
  ON policy_gap_analysis(policy_upload_id);

CREATE INDEX IF NOT EXISTS idx_policy_gap_org_framework
  ON policy_gap_analysis(organization_id, framework_id, analysis_date DESC);

-- Policy control gaps - specific gaps identified
CREATE TABLE IF NOT EXISTS policy_control_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gap_analysis_id UUID NOT NULL REFERENCES policy_gap_analysis(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  gap_type VARCHAR(50) NOT NULL, -- missing, partial, unclear, outdated
  gap_severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  gap_description TEXT,
  recommended_action TEXT,
  ai_confidence_score NUMERIC(3,2), -- 0.00 to 1.00
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE policy_control_gaps
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_policy_control_gaps_analysis
  ON policy_control_gaps(gap_analysis_id);

CREATE INDEX IF NOT EXISTS idx_policy_control_gaps_control
  ON policy_control_gaps(control_id);

CREATE INDEX IF NOT EXISTS idx_policy_control_gaps_reviewed
  ON policy_control_gaps(organization_id, reviewed, gap_severity);

-- Audit trail for policy changes (no user context during migration)
INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
SELECT
  id,
  NULL,
  'system_migration',
  'database',
  gen_random_uuid(),
  '{"migration": "061_poam_approval_and_policy_engine_extended", "description": "Added policy upload and gap analysis tables"}'::jsonb,
  true
FROM organizations
LIMIT 1;
