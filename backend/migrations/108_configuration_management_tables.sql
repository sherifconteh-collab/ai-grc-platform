-- Migration 101: Configuration management tables
-- Adds CM baseline, item, change control, audit, and activity tracking using UUID-compatible keys.

CREATE TABLE IF NOT EXISTS configuration_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  baseline_name VARCHAR(255) NOT NULL,
  baseline_version VARCHAR(50) NOT NULL,
  baseline_type VARCHAR(50) NOT NULL CHECK (baseline_type IN ('functional', 'allocated', 'product', 'system')),
  description TEXT,
  approval_status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'superseded', 'archived')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  effective_date DATE,
  baseline_document_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, baseline_name, baseline_version)
);

CREATE INDEX IF NOT EXISTS idx_config_baselines_org ON configuration_baselines(organization_id);
CREATE INDEX IF NOT EXISTS idx_config_baselines_status ON configuration_baselines(approval_status);
CREATE INDEX IF NOT EXISTS idx_config_baselines_type ON configuration_baselines(baseline_type);

CREATE TABLE IF NOT EXISTS configuration_items_cm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ci_number VARCHAR(100) NOT NULL,
  ci_type VARCHAR(50) NOT NULL CHECK (ci_type IN ('hardware', 'software', 'documentation', 'firmware', 'data', 'interface')),
  baseline_id UUID REFERENCES configuration_baselines(id) ON DELETE SET NULL,
  configuration_status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (configuration_status IN ('draft', 'under_review', 'approved', 'released', 'obsolete')),
  version_number VARCHAR(50),
  serial_number VARCHAR(100),
  part_number VARCHAR(100),
  interface_dependencies TEXT[] DEFAULT ARRAY[]::TEXT[],
  cm_owner UUID REFERENCES users(id) ON DELETE SET NULL,
  last_audit_date DATE,
  next_audit_date DATE,
  audit_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, ci_number)
);

CREATE INDEX IF NOT EXISTS idx_ci_cm_org ON configuration_items_cm(organization_id);
CREATE INDEX IF NOT EXISTS idx_ci_cm_asset ON configuration_items_cm(asset_id);
CREATE INDEX IF NOT EXISTS idx_ci_cm_baseline ON configuration_items_cm(baseline_id);
CREATE INDEX IF NOT EXISTS idx_ci_cm_status ON configuration_items_cm(configuration_status);

CREATE TABLE IF NOT EXISTS change_control_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ccr_number VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('corrective', 'adaptive', 'perfective', 'preventive', 'emergency')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status VARCHAR(50) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'pending_approval', 'approved', 'rejected', 'implemented', 'verified', 'closed', 'cancelled')),
  affected_baseline_ids UUID[] DEFAULT ARRAY[]::UUID[],
  affected_ci_ids UUID[] DEFAULT ARRAY[]::UUID[],
  affected_systems TEXT[] DEFAULT ARRAY[]::TEXT[],
  impact_analysis TEXT,
  security_impact VARCHAR(20) CHECK (security_impact IN ('none', 'low', 'medium', 'high', 'critical')),
  cost_estimate DECIMAL(12,2),
  implementation_effort_hours INTEGER,
  risk_assessment TEXT,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  implemented_by UUID REFERENCES users(id) ON DELETE SET NULL,
  implemented_at TIMESTAMP,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP,
  ccb_meeting_date DATE,
  ccb_meeting_notes TEXT,
  ccb_decision TEXT,
  implementation_plan TEXT,
  rollback_plan TEXT,
  test_plan TEXT,
  documentation_updates TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, ccr_number)
);

CREATE INDEX IF NOT EXISTS idx_ccr_org ON change_control_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status ON change_control_requests(status);
CREATE INDEX IF NOT EXISTS idx_ccr_priority ON change_control_requests(priority);
CREATE INDEX IF NOT EXISTS idx_ccr_type ON change_control_requests(change_type);
CREATE INDEX IF NOT EXISTS idx_ccr_submitted_by ON change_control_requests(submitted_by);

CREATE TABLE IF NOT EXISTS configuration_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_number VARCHAR(100) NOT NULL,
  audit_type VARCHAR(50) NOT NULL CHECK (audit_type IN ('functional', 'physical', 'process', 'compliance')),
  audit_scope TEXT NOT NULL,
  baseline_id UUID REFERENCES configuration_baselines(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  actual_start_date DATE,
  actual_end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  audit_result VARCHAR(50) CHECK (audit_result IN ('passed', 'passed_with_findings', 'failed', 'not_applicable')),
  lead_auditor UUID REFERENCES users(id) ON DELETE SET NULL,
  audit_team UUID[] DEFAULT ARRAY[]::UUID[],
  findings_count INTEGER NOT NULL DEFAULT 0,
  critical_findings INTEGER NOT NULL DEFAULT 0,
  major_findings INTEGER NOT NULL DEFAULT 0,
  minor_findings INTEGER NOT NULL DEFAULT 0,
  observations INTEGER NOT NULL DEFAULT 0,
  audit_plan_url TEXT,
  audit_report_url TEXT,
  findings_summary TEXT,
  corrective_actions TEXT,
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  follow_up_date DATE,
  follow_up_status VARCHAR(50) CHECK (follow_up_status IN ('pending', 'in_progress', 'completed', 'overdue')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, audit_number)
);

CREATE INDEX IF NOT EXISTS idx_config_audits_org ON configuration_audits(organization_id);
CREATE INDEX IF NOT EXISTS idx_config_audits_status ON configuration_audits(status);
CREATE INDEX IF NOT EXISTS idx_config_audits_type ON configuration_audits(audit_type);
CREATE INDEX IF NOT EXISTS idx_config_audits_baseline ON configuration_audits(baseline_id);
CREATE INDEX IF NOT EXISTS idx_config_audits_scheduled ON configuration_audits(scheduled_date);

CREATE TABLE IF NOT EXISTS cm_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('baseline_created', 'baseline_updated', 'baseline_approved', 'ci_added', 'ci_updated', 'ci_status_changed', 'ccr_submitted', 'ccr_approved', 'ccr_implemented', 'audit_scheduled', 'audit_completed')),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('baseline', 'configuration_item', 'change_control_request', 'audit')),
  entity_id UUID NOT NULL,
  description TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cm_activity_org ON cm_activity_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_cm_activity_type ON cm_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_cm_activity_entity ON cm_activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cm_activity_performed ON cm_activity_log(performed_at DESC);

COMMENT ON TABLE configuration_baselines IS 'Approved configuration baselines used for change and audit tracking';
COMMENT ON TABLE configuration_items_cm IS 'Configuration-managed items linked to CMDB assets';
COMMENT ON TABLE change_control_requests IS 'Change control workflow records for configuration-managed systems';
COMMENT ON TABLE configuration_audits IS 'Configuration audits and follow-up tracking';
COMMENT ON TABLE cm_activity_log IS 'Immutable CM activity trail for baselines, items, changes, and audits';

SELECT 'Migration 101 completed.' AS result;