-- Migration 023: Program foundation release
-- Covers:
-- 1) Dynamic configuration layer
-- 2) POA&M lifecycle
-- 3) Exception governance
-- 4) Dashboard builder
-- 5) Integration hub
-- 6) Webhooks + delivery queue
-- 7) Job queue / ops foundation
-- 8) Data governance (retention + legal hold + signatures)
-- 9) Auditor workspace links
-- 10) Cross-framework inheritance audit events

-- 1) Dynamic configuration
CREATE TABLE IF NOT EXISTS dynamic_config_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  config_domain VARCHAR(100) NOT NULL,
  config_key VARCHAR(150) NOT NULL,
  config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, config_domain, config_key)
);

CREATE INDEX IF NOT EXISTS idx_dynamic_config_domain
ON dynamic_config_entries(config_domain, config_key);

CREATE INDEX IF NOT EXISTS idx_dynamic_config_org
ON dynamic_config_entries(organization_id, config_domain);

-- 2) POA&M lifecycle
CREATE TABLE IF NOT EXISTS poam_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual, vulnerability, control, audit_finding, assessment
  source_id UUID,
  vulnerability_id UUID REFERENCES vulnerability_findings(id) ON DELETE SET NULL,
  control_id UUID REFERENCES framework_controls(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- open, in_progress, pending_review, closed, risk_accepted
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  remediation_plan TEXT,
  closure_notes TEXT,
  due_date DATE,
  risk_acceptance_expires_at DATE,
  closed_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT poam_status_valid CHECK (status IN ('open', 'in_progress', 'pending_review', 'closed', 'risk_accepted')),
  CONSTRAINT poam_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_poam_org_status
ON poam_items(organization_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_poam_control
ON poam_items(control_id);

CREATE INDEX IF NOT EXISTS idx_poam_vulnerability
ON poam_items(vulnerability_id);

CREATE TABLE IF NOT EXISTS poam_item_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  poam_item_id UUID NOT NULL REFERENCES poam_items(id) ON DELETE CASCADE,
  update_type VARCHAR(50) NOT NULL DEFAULT 'note', -- note, status_change, owner_change, due_date_change, evidence_link
  note TEXT,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poam_updates_item
ON poam_item_updates(poam_item_id, created_at DESC);

-- 3) Exception governance
CREATE TABLE IF NOT EXISTS control_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  compensating_controls TEXT,
  business_impact TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, active, expired, revoked
  approved_at TIMESTAMP,
  expires_at DATE,
  revoked_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT control_exception_status_valid CHECK (status IN ('pending', 'active', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_control_exceptions_org
ON control_exceptions(organization_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_control_exceptions_control
ON control_exceptions(control_id);

-- 4) Dashboard builder
CREATE TABLE IF NOT EXISTS dashboard_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_views_org_user
ON dashboard_views(organization_id, user_id, is_shared);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_view_id UUID NOT NULL REFERENCES dashboard_views(id) ON DELETE CASCADE,
  widget_type VARCHAR(100) NOT NULL,
  title VARCHAR(150) NOT NULL,
  widget_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position_row INTEGER NOT NULL DEFAULT 0,
  position_col INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 1,
  height INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_view
ON dashboard_widgets(dashboard_view_id, position_row, position_col);

-- 5) Integration hub
CREATE TABLE IF NOT EXISTS integration_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  connector_type VARCHAR(100) NOT NULL, -- splunk, acas, sbom_repo, stig_repo, siem_generic, scanner_generic
  status VARCHAR(50) NOT NULL DEFAULT 'inactive', -- inactive, active, error
  auth_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  connector_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_connectors_org
ON integration_connectors(organization_id, connector_type, status);

CREATE TABLE IF NOT EXISTS integration_connector_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES integration_connectors(id) ON DELETE CASCADE,
  run_type VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual, scheduled, webhook
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, running, success, failed
  result_summary JSONB,
  error_message TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_runs_connector
ON integration_connector_runs(connector_id, created_at DESC);

-- 6) Webhooks
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  target_url TEXT NOT NULL,
  signing_secret VARCHAR(255),
  subscribed_events TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_org
ON webhook_subscriptions(organization_id, active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL,
  delivery_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, delivered, failed
  attempt_count INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  response_body TEXT,
  next_attempt_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
ON webhook_deliveries(delivery_status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org
ON webhook_deliveries(organization_id, created_at DESC);

-- 7) Ops / jobs
CREATE TABLE IF NOT EXISTS platform_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  job_type VARCHAR(100) NOT NULL, -- webhook_flush, retention_cleanup, integration_sync
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, running, completed, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  result JSONB,
  error_message TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_jobs_queue
ON platform_jobs(status, run_after, created_at);

-- 8) Data governance
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_name VARCHAR(150) NOT NULL,
  resource_type VARCHAR(100) NOT NULL, -- evidence, audit_logs, vulnerability_findings, poam_items
  retention_days INTEGER NOT NULL,
  auto_enforce BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT retention_days_positive CHECK (retention_days >= 1)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_org
ON data_retention_policies(organization_id, resource_type, active);

CREATE TABLE IF NOT EXISTS legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hold_name VARCHAR(200) NOT NULL,
  resource_type VARCHAR(100) NOT NULL, -- evidence, audit_logs, vulnerability, poam, control
  resource_id TEXT,                    -- nullable for broad holds by type
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  released_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_lookup
ON legal_holds(organization_id, resource_type, resource_id, active);

CREATE TABLE IF NOT EXISTS artifact_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type VARCHAR(100) NOT NULL, -- evidence, report_export, audit_package
  resource_id TEXT NOT NULL,
  algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
  digest VARCHAR(128) NOT NULL,
  signed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifact_signatures_lookup
ON artifact_signatures(organization_id, resource_type, resource_id, created_at DESC);

-- 9) Auditor workspace links
CREATE TABLE IF NOT EXISTS auditor_workspace_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id UUID REFERENCES audit_engagements(id) ON DELETE SET NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  read_only BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditor_workspace_lookup
ON auditor_workspace_links(token, active, expires_at);

-- 10) Cross-framework inheritance events
CREATE TABLE IF NOT EXISTS control_inheritance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  target_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  source_status VARCHAR(50) NOT NULL,
  inherited_status VARCHAR(50) NOT NULL,
  similarity_score INTEGER,
  event_notes TEXT,
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_inheritance_org
ON control_inheritance_events(organization_id, source_control_id, created_at DESC);

-- Seed default dynamic config records (global)
INSERT INTO dynamic_config_entries (organization_id, config_domain, config_key, config_value, is_active)
SELECT NULL, 'crosswalk', 'inheritance_min_similarity', '{"value":90}'::jsonb, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM dynamic_config_entries
  WHERE organization_id IS NULL
    AND config_domain = 'crosswalk'
    AND config_key = 'inheritance_min_similarity'
);

INSERT INTO dynamic_config_entries (organization_id, config_domain, config_key, config_value, is_active)
SELECT NULL, 'vulnerability', 'fallback_control_keywords',
       '["vulnerab","patch","remedi","scan","hardening","configuration"]'::jsonb, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM dynamic_config_entries
  WHERE organization_id IS NULL
    AND config_domain = 'vulnerability'
    AND config_key = 'fallback_control_keywords'
);

INSERT INTO dynamic_config_entries (organization_id, config_domain, config_key, config_value, is_active)
SELECT NULL, 'navigation', 'default_sections',
       '["dashboard","frameworks","controls","evidence","assets","vulnerabilities","sbom","assessments","reports","ai-analysis","audit","settings"]'::jsonb,
       TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM dynamic_config_entries
  WHERE organization_id IS NULL
    AND config_domain = 'navigation'
    AND config_key = 'default_sections'
);

SELECT 'Migration 023 completed.' AS result;
