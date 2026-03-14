-- Migration 098: Missing API Tables
-- Creates all database tables required by frontend API endpoints that do not
-- yet have corresponding backend routes or storage.  Every statement uses
-- IF NOT EXISTS so the migration is safe to re-run.
--
-- Run after: 097_server_license_pubkey.sql

-- ============================================================
-- PART 1: Vulnerability Management
-- ============================================================

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  cve_id           VARCHAR(50),
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  cvss_score       NUMERIC(3,1),
  severity         VARCHAR(20) CHECK (severity IN ('low','medium','high','critical')),
  source           VARCHAR(255),
  standard         VARCHAR(255),
  status           VARCHAR(30) DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','resolved','accepted','closed')),
  asset_id         UUID,
  remediation      TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vulnerability_workflow_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vulnerability_id  UUID NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,
  action_type       VARCHAR(100),
  action_status     VARCHAR(50),
  control_effect    VARCHAR(100),
  response_summary  TEXT,
  response_details  TEXT,
  due_date          DATE,
  owner_id          UUID,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 2: SBOM (Software Bill of Materials)
-- ============================================================

CREATE TABLE IF NOT EXISTS sbom_components (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
  asset_name          VARCHAR(255),
  component_name      VARCHAR(255) NOT NULL,
  version             VARCHAR(100),
  license             VARCHAR(255),
  supplier            VARCHAR(255),
  purl                VARCHAR(500),
  vulnerability_count INT DEFAULT 0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 3: CMDB (Configuration Management Database)
-- ============================================================

CREATE TABLE IF NOT EXISTS cmdb_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type   VARCHAR(50)
                    CHECK (resource_type IN (
                      'hardware','software','ai-agents',
                      'service-accounts','environments','password-vaults'
                    )),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  owner           VARCHAR(255),
  status          VARCHAR(50),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cmdb_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_asset_id   UUID NOT NULL REFERENCES cmdb_assets(id) ON DELETE CASCADE,
  target_asset_id   UUID NOT NULL REFERENCES cmdb_assets(id) ON DELETE CASCADE,
  relationship_type VARCHAR(100),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 4: LLM Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS llm_configurations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  anthropic_api_key_enc TEXT,
  openai_api_key_enc    TEXT,
  gemini_api_key_enc    TEXT,
  xai_api_key_enc       TEXT,
  default_provider    VARCHAR(50),
  default_model       VARCHAR(100),
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 5: Content Packs
-- ============================================================

CREATE TABLE IF NOT EXISTS content_packs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  version               VARCHAR(50),
  pack_data             JSONB,
  status                VARCHAR(30) DEFAULT 'draft'
                          CHECK (status IN ('draft','review','approved','imported')),
  review_required       BOOLEAN DEFAULT FALSE,
  attestation_statement TEXT,
  attested_at           TIMESTAMP,
  reviewed_by           UUID,
  review_notes          TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 6: Integration Configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type  VARCHAR(50)
                      CHECK (integration_type IN (
                        'splunk','sentinel','servicenow','jira',
                        'slack','teams','pagerduty','webhook'
                      )),
  config            JSONB DEFAULT '{}',
  enabled           BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 7: Auto-Evidence & Pending Evidence
-- ============================================================

CREATE TABLE IF NOT EXISTS auto_evidence_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  source_type     VARCHAR(100),
  source_config   JSONB,
  schedule        VARCHAR(100),
  control_ids     TEXT[],
  tags            TEXT[],
  enabled         BOOLEAN DEFAULT TRUE,
  last_run_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_evidence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  source                VARCHAR(255),
  suggested_control_ids TEXT[],
  status                VARCHAR(30) DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected')),
  reviewer_notes        TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 8: SSO, Social Login & Passkeys
-- ============================================================

CREATE TABLE IF NOT EXISTS sso_configurations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  provider_type   VARCHAR(50),
  config          JSONB,
  enabled         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_logins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         VARCHAR(50),
  provider_user_id VARCHAR(255),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS passkeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key    TEXT NOT NULL,
  name          VARCHAR(255),
  sign_count    INT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at  TIMESTAMP
);

-- ============================================================
-- PART 9: SIEM Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS siem_configurations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  endpoint            VARCHAR(500),
  authentication_type VARCHAR(50),
  credentials_enc     TEXT,
  status              VARCHAR(50),
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 10: Platform Settings
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 11: TPRM (Third-Party Risk Management)
-- ============================================================

CREATE TABLE IF NOT EXISTS tprm_vendors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name      VARCHAR(255) NOT NULL,
  vendor_type      VARCHAR(100),
  risk_tier        VARCHAR(20) CHECK (risk_tier IN ('low','medium','high','critical')),
  review_status    VARCHAR(50),
  contact_email    VARCHAR(255),
  contact_name     VARCHAR(255),
  ai_risk_score    NUMERIC,
  ai_risk_summary  TEXT,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tprm_questionnaires (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES tprm_vendors(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  status          VARCHAR(30) DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','in_progress','completed','reviewed')),
  questions       JSONB,
  responses       JSONB,
  response_token  TEXT UNIQUE,
  recipient_email VARCHAR(255),
  due_date        DATE,
  sent_at         TIMESTAMP,
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tprm_evidence (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  questionnaire_id  UUID NOT NULL REFERENCES tprm_questionnaires(id) ON DELETE CASCADE,
  file_name         VARCHAR(255) NOT NULL,
  file_path         VARCHAR(500),
  file_size         INT,
  mime_type         VARCHAR(100),
  ai_analysis       TEXT,
  ai_risk_flags     JSONB,
  uploaded_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tprm_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES tprm_vendors(id) ON DELETE CASCADE,
  document_type   VARCHAR(100),
  title           VARCHAR(255) NOT NULL,
  status          VARCHAR(50),
  content         TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 12: Threat Intelligence
-- ============================================================

CREATE TABLE IF NOT EXISTS threat_intel_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  feed_url        VARCHAR(500),
  feed_type       VARCHAR(50),
  enabled         BOOLEAN DEFAULT TRUE,
  last_sync_at    TIMESTAMP,
  sync_status     VARCHAR(50),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threat_intel_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id           UUID NOT NULL REFERENCES threat_intel_feeds(id) ON DELETE CASCADE,
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  severity          VARCHAR(20),
  item_type         VARCHAR(50),
  exploit_available BOOLEAN DEFAULT FALSE,
  status            VARCHAR(50),
  indicator         TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 13: Vendor Security Scores
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_security_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name      VARCHAR(255) NOT NULL,
  domain           VARCHAR(255),
  score_provider   VARCHAR(100),
  current_score    NUMERIC,
  previous_score   NUMERIC,
  score_trend      VARCHAR(20),
  factors          JSONB,
  last_refreshed_at TIMESTAMP,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 14: Regulatory News
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_news (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  summary         TEXT,
  source          VARCHAR(255),
  source_url      VARCHAR(500),
  impact_level    VARCHAR(20) CHECK (impact_level IN ('low','medium','high')),
  is_read         BOOLEAN DEFAULT FALSE,
  is_archived     BOOLEAN DEFAULT FALSE,
  is_bookmarked   BOOLEAN DEFAULT FALSE,
  published_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 15: Data Sovereignty & Jurisdictions
-- ============================================================

CREATE TABLE IF NOT EXISTS data_sovereignty_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  primary_region          VARCHAR(100),
  data_residency_enabled  BOOLEAN DEFAULT FALSE,
  config                  JSONB DEFAULT '{}',
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jurisdictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  region                VARCHAR(100),
  data_protection_law   VARCHAR(255),
  adequacy_status       VARCHAR(100),
  recommended_frameworks TEXT[],
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_jurisdictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  jurisdiction_id   UUID NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  compliance_status VARCHAR(50),
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS regulatory_changes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  jurisdiction_code VARCHAR(50),
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  effective_date    DATE,
  status            VARCHAR(50),
  impact_assessment TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 16: Integrations Hub
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations_hub_connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  template_id     VARCHAR(100),
  name            VARCHAR(255) NOT NULL,
  config          JSONB,
  enabled         BOOLEAN DEFAULT TRUE,
  last_run_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 17: Organization Contacts
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255),
  role            VARCHAR(100),
  phone           VARCHAR(50),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 18: Risk Scores
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  overall_score   NUMERIC,
  breakdown       JSONB,
  calculated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 19: Regulatory Impact Assessments
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_impact_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  regulation        VARCHAR(255),
  impact_level      VARCHAR(20),
  affected_controls TEXT[],
  recommendations   JSONB,
  status            VARCHAR(50),
  reviewed_by       UUID,
  review_notes      TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 20: Remediation Plans
-- ============================================================

CREATE TABLE IF NOT EXISTS remediation_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  status          VARCHAR(30) DEFAULT 'draft'
                    CHECK (status IN ('draft','active','completed','cancelled')),
  priority        VARCHAR(20),
  target_date     DATE,
  tasks           JSONB,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 21: AI Monitoring
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_monitoring_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  rule_type       VARCHAR(100),
  conditions      JSONB,
  severity        VARCHAR(20),
  enabled         BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_monitoring_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id          UUID REFERENCES ai_monitoring_rules(id) ON DELETE SET NULL,
  ai_agent_id      UUID,
  severity         VARCHAR(20),
  status           VARCHAR(30) DEFAULT 'new'
                     CHECK (status IN ('new','reviewed','resolved')),
  details          JSONB,
  resolution_notes TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_monitoring_baselines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ai_agent_id     TEXT,
  baseline_data   JSONB,
  calculated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 22: RAG Documents
-- ============================================================

CREATE TABLE IF NOT EXISTS rag_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_name     VARCHAR(255),
  source_type     VARCHAR(100),
  source_id       VARCHAR(255),
  content_hash    TEXT,
  chunk_count     INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 23: RMF (Risk Management Framework) Packages
-- ============================================================

CREATE TABLE IF NOT EXISTS rmf_packages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  system_name           VARCHAR(255) NOT NULL,
  system_description    TEXT,
  system_id             TEXT,
  current_step          VARCHAR(30) DEFAULT 'prepare'
                          CHECK (current_step IN (
                            'prepare','categorize','select',
                            'implement','assess','authorize','monitor'
                          )),
  status                VARCHAR(50),
  authorization_status  VARCHAR(50),
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rmf_authorizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         UUID NOT NULL REFERENCES rmf_packages(id) ON DELETE CASCADE,
  authorization_type VARCHAR(100),
  authorized_by      TEXT,
  authorization_date DATE,
  expiration_date    DATE,
  conditions         TEXT,
  status             VARCHAR(50),
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 24: PLOT4ai Threats
-- ============================================================

CREATE TABLE IF NOT EXISTS plot4ai_threats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_name  VARCHAR(255) NOT NULL,
  description  TEXT,
  category     INT,
  ai_type      VARCHAR(100),
  role         VARCHAR(100),
  phase        VARCHAR(100),
  mitigation   TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 25: Data Governance & Legal Holds
-- ============================================================

CREATE TABLE IF NOT EXISTS data_governance_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  policy_name           VARCHAR(255) NOT NULL,
  data_category         VARCHAR(100),
  retention_period_days INT,
  auto_delete_enabled   BOOLEAN DEFAULT FALSE,
  legal_basis           TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legal_holds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  hold_name       VARCHAR(255) NOT NULL,
  hold_reason     TEXT,
  data_scope      TEXT,
  custodian_name  VARCHAR(255),
  start_date      DATE,
  release_date    DATE,
  status          VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active','released')),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PART 26: Billing / Subscriptions
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id      VARCHAR(255),
  stripe_subscription_id  VARCHAR(255),
  plan_lookup_key         VARCHAR(100),
  status                  VARCHAR(50),
  current_period_start    TIMESTAMP,
  current_period_end      TIMESTAMP,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Vulnerability management
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_org ON vulnerabilities(organization_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_status ON vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_vulnerability_workflow_vuln ON vulnerability_workflow_items(vulnerability_id);

-- SBOM
CREATE INDEX IF NOT EXISTS idx_sbom_components_org ON sbom_components(organization_id);

-- CMDB
CREATE INDEX IF NOT EXISTS idx_cmdb_assets_org ON cmdb_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmdb_assets_type ON cmdb_assets(organization_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_cmdb_relationships_org ON cmdb_relationships(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmdb_relationships_source ON cmdb_relationships(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_cmdb_relationships_target ON cmdb_relationships(target_asset_id);

-- Content packs
CREATE INDEX IF NOT EXISTS idx_content_packs_org ON content_packs(organization_id);

-- Integration configs
CREATE INDEX IF NOT EXISTS idx_integration_configs_org ON integration_configs(organization_id);

-- Auto-evidence & pending evidence
CREATE INDEX IF NOT EXISTS idx_auto_evidence_rules_org ON auto_evidence_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_pending_evidence_org ON pending_evidence(organization_id);
CREATE INDEX IF NOT EXISTS idx_pending_evidence_status ON pending_evidence(status);

-- Authentication (social logins & passkeys)
CREATE INDEX IF NOT EXISTS idx_social_logins_user ON social_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

-- SIEM
CREATE INDEX IF NOT EXISTS idx_siem_configurations_org ON siem_configurations(organization_id);

-- TPRM
CREATE INDEX IF NOT EXISTS idx_tprm_vendors_org ON tprm_vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_org ON tprm_questionnaires(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_vendor ON tprm_questionnaires(vendor_id);
CREATE INDEX IF NOT EXISTS idx_tprm_evidence_org ON tprm_evidence(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_evidence_questionnaire ON tprm_evidence(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_tprm_documents_org ON tprm_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_documents_vendor ON tprm_documents(vendor_id);

-- Threat intelligence
CREATE INDEX IF NOT EXISTS idx_threat_intel_feeds_org ON threat_intel_feeds(organization_id);
CREATE INDEX IF NOT EXISTS idx_threat_intel_items_feed ON threat_intel_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_threat_intel_items_org ON threat_intel_items(organization_id);

-- Vendor security scores
CREATE INDEX IF NOT EXISTS idx_vendor_security_scores_org ON vendor_security_scores(organization_id);

-- Regulatory news
CREATE INDEX IF NOT EXISTS idx_regulatory_news_org ON regulatory_news(organization_id);

-- Data sovereignty & jurisdictions
CREATE INDEX IF NOT EXISTS idx_org_jurisdictions_org ON organization_jurisdictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_jurisdictions_jur ON organization_jurisdictions(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_changes_org ON regulatory_changes(organization_id);

-- Integrations hub
CREATE INDEX IF NOT EXISTS idx_integrations_hub_org ON integrations_hub_connectors(organization_id);

-- Organization contacts
CREATE INDEX IF NOT EXISTS idx_org_contacts_org ON organization_contacts(organization_id);

-- Risk scores
CREATE INDEX IF NOT EXISTS idx_risk_scores_org ON risk_scores(organization_id);

-- Regulatory impact assessments
CREATE INDEX IF NOT EXISTS idx_reg_impact_assessments_org ON regulatory_impact_assessments(organization_id);

-- Remediation plans
CREATE INDEX IF NOT EXISTS idx_remediation_plans_org ON remediation_plans(organization_id);

-- AI monitoring
CREATE INDEX IF NOT EXISTS idx_ai_monitoring_rules_org ON ai_monitoring_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_monitoring_events_org ON ai_monitoring_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_monitoring_events_rule ON ai_monitoring_events(rule_id);
CREATE INDEX IF NOT EXISTS idx_ai_monitoring_baselines_org ON ai_monitoring_baselines(organization_id);

-- RAG documents
CREATE INDEX IF NOT EXISTS idx_rag_documents_org ON rag_documents(organization_id);

-- RMF packages
CREATE INDEX IF NOT EXISTS idx_rmf_packages_org ON rmf_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_rmf_authorizations_pkg ON rmf_authorizations(package_id);

-- Data governance & legal holds
CREATE INDEX IF NOT EXISTS idx_data_governance_policies_org ON data_governance_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_legal_holds_org ON legal_holds(organization_id);
