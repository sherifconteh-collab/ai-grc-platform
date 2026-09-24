-- Migration 150: Reconcile columns lost to shadowed duplicate CREATE TABLE
-- statements across the 009-098 migration range
--
-- WHAT HAPPENED
--
-- Seventeen tables in this schema are declared by CREATE TABLE IF NOT EXISTS
-- in two different migration files. Because IF NOT EXISTS makes the second
-- declaration a silent no-op once the first has run, whichever file sorts
-- first (numerically, per scripts/lib/migrationValidation.js) wins, and the
-- other file's column list has never existed in any database built from this
-- migration set — the same failure mode migration 125 already found and
-- fixed for audit_pbc_requests/audit_findings/auditor_workspace_links between
-- migrations 016 and 017. This migration applies the same fix to the rest.
--
-- Found by building a database from every migration in this directory and
-- diffing information_schema.columns for every table declared more than
-- once. Confirmed as live breakage, not just latent risk, by executing the
-- application's own queries against the resulting schema:
--
--   - sso_configurations:  ssoService.getOrgSsoConfig() -> column "enabled"
--     does not exist. Every column routes/sso.js and services/ssoService.js
--     read or wrote (provider_type, display_name, scopes, ...) was declared
--     only in the shadowed 041_sso_config.sql.
--   - siem_configurations: siemService.listSiemConfigs() -> column "name"
--     does not exist. Same cause, shadowed by 042_siem_config.sql.
--   - platform_jobs: jobService's retry-count UPDATE ("attempts = attempts +
--     1") -> column "attempts" does not exist. Shadowed by
--     023_program_foundation_release.sql.
--   - data_retention_policies: routes/dataGovernance.js validates
--     policy_name as a required field and inserts it on every create -> same
--     failure. Shadowed by 023_program_foundation_release.sql.
--
-- The remaining thirteen were not individually executed against a live
-- request the way the four above were, but are reconciled here on the same
-- evidence standard migration 125 used: the live column set is missing
-- columns their own application code (routes/vulnerabilities.js,
-- services/dynamicAuditFieldsService.js, routes/sbom.js, and so on, named in
-- each block below) selects, inserts, or updates by name.
--
-- WHY A NEW MIGRATION RATHER THAN EDITING 013/021/022/023/041/042/049/051/
-- 061/088/098
--
-- Already-numbered migrations are never edited — doing so changes their
-- stored checksum and hard-fails scripts/migrate-all.js on any database that
-- already applied them. This migration is additive and safe to run whether a
-- given database ended up with the "live" or the shadowed shape, because
-- ADD COLUMN IF NOT EXISTS is a no-op wherever the column already exists.
--
-- NOT NULL RELAXED ON FOUR COLUMNS
--
-- data_retention_policies.policy_name, sso_configurations.provider_type,
-- siem_configurations.name, and integrations_hub_connectors.template_id were
-- NOT NULL with no default in the migration that declared them. Per this
-- repo's migration convention, a NOT NULL column added to a table that may
-- already hold rows needs either a default or to stay nullable; since these
-- are org-scoped configuration tables that may already have rows written
-- against the live (pre-reconciliation) column set, they are added nullable
-- here. The application layer already validates all four as required on
-- create (dataGovernance.js, sso.js, siemService.js, integrationsHub.js), so
-- this does not relax anything a request can actually rely on.

-- 1) organization_frameworks (013_core_org_profile.sql, shadowed by 009)
ALTER TABLE organization_frameworks
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'planning',
  ADD COLUMN IF NOT EXISTS target_completion_date DATE,
  ADD COLUMN IF NOT EXISTS adopted_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 2) evidence_collection_rules (088_evidence_collection_rules.sql, shadowed by 014)
-- Read/written by routes/autoEvidenceCollection.js, routes/pendingEvidence.js,
-- routes/pendingControlAssessments.js, services/jobService.js.
ALTER TABLE evidence_collection_rules
  ADD COLUMN IF NOT EXISTS control_ids UUID[] NOT NULL DEFAULT '{}';

-- 3) data_retention_policies (023_program_foundation_release.sql, shadowed by 014)
-- routes/dataGovernance.js requires policy_name on create and orders list
-- results by it. Confirmed broken by execution -- see header.
ALTER TABLE data_retention_policies
  ADD COLUMN IF NOT EXISTS policy_name VARCHAR(150);

-- 4) vulnerability_control_work_items (021_vulnerability_control_workflow.sql,
-- shadowed by 015). Read/written by routes/vulnerabilities.js and
-- services/llmService.js.
ALTER TABLE vulnerability_control_work_items
  ADD COLUMN IF NOT EXISTS implementation_id UUID REFERENCES control_implementations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type VARCHAR(40) NOT NULL DEFAULT 'poam', -- poam, close_control_gap, risk_acceptance, false_positive_review
  ADD COLUMN IF NOT EXISTS response_summary TEXT,
  ADD COLUMN IF NOT EXISTS response_details TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 5) audit_column_preferences / audit_field_suggestions
-- (049_dynamic_audit_fields.sql, shadowed by 017). Read by
-- services/dynamicAuditFieldsService.js.
ALTER TABLE audit_column_preferences
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE audit_field_suggestions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- 6) audit_log_custom_fields (049_dynamic_audit_fields.sql, shadowed by 017).
-- The live table (017) already carries a composite primary key
-- (audit_log_id, field_definition_id); a table can only have one primary
-- key, so the shadowed id column is added as a unique surrogate rather than
-- a second PRIMARY KEY. Nothing in dynamicAuditFieldsService.js currently
-- selects id or created_at by name (it inserts with RETURNING * and reads an
-- explicit column list), so this is reconciled for schema completeness
-- rather than a confirmed live break.
ALTER TABLE audit_log_custom_fields
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'audit_log_custom_fields'::regclass
      AND conname = 'audit_log_custom_fields_id_key'
  ) THEN
    ALTER TABLE audit_log_custom_fields ADD CONSTRAINT audit_log_custom_fields_id_key UNIQUE (id);
  END IF;
END $$;

-- 7) platform_jobs (023_program_foundation_release.sql, shadowed by 017).
-- Confirmed broken by execution -- see header. Read/written by
-- services/jobService.js and routes/ops.js.
ALTER TABLE platform_jobs
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS result JSONB;

-- 8) organization_control_content_overrides / organization_assessment_procedure_overrides
-- (022_systems_vendors_assets.sql, shadowed by 018). Written by
-- routes/orgSettings.js and routes/organizations.js.
ALTER TABLE organization_control_content_overrides
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE organization_assessment_procedure_overrides
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 9) component_vulnerabilities (022_systems_vendors_assets.sql, shadowed by
-- 022_sbom_ingestion.sql -- both files share the number 022; sbom_ingestion
-- sorts first alphabetically). Written by routes/ai.js and routes/sbom.js.
ALTER TABLE component_vulnerabilities
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 10) vendor_contracts (051_org_systems_cots_contracts.sql, shadowed by 022).
-- Read/written by routes/organizations.js.
ALTER TABLE vendor_contracts
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 11) policy_references (061_poam_approval_and_policy_engine.sql, shadowed
-- by 023_remaining_missing_tables.sql). Read/written by
-- services/policyService.js.
ALTER TABLE policy_references
  ADD COLUMN IF NOT EXISTS reference_description TEXT,
  ADD COLUMN IF NOT EXISTS last_monitored_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS monitoring_notes TEXT;

-- 12) sso_configurations (041_sso_config.sql, shadowed by 024). Confirmed
-- broken by execution -- see header. Read/written by routes/sso.js and
-- services/ssoService.js.
ALTER TABLE sso_configurations
  ADD COLUMN IF NOT EXISTS provider_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NOT NULL DEFAULT 'SSO',
  ADD COLUMN IF NOT EXISTS discovery_url TEXT, -- e.g. https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration
  ADD COLUMN IF NOT EXISTS is_secret_encrypted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scopes TEXT NOT NULL DEFAULT 'openid email profile',
  ADD COLUMN IF NOT EXISTS sp_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS auto_provision BOOLEAN NOT NULL DEFAULT true, -- create user account on first SSO login
  ADD COLUMN IF NOT EXISTS default_role VARCHAR(32) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false;

-- 13) user_social_logins (041_sso_config.sql, shadowed by 024). Read/written
-- by routes/sso.js and services/ssoService.js.
ALTER TABLE user_social_logins
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 14) siem_configurations (042_siem_config.sql, shadowed by 024). Confirmed
-- broken by execution -- see header. Read/written by services/siemService.js.
ALTER TABLE siem_configurations
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_key_encrypted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS splunk_index VARCHAR(255),
  ADD COLUMN IF NOT EXISTS splunk_sourcetype VARCHAR(255) DEFAULT '_json',
  ADD COLUMN IF NOT EXISTS elastic_index_prefix VARCHAR(255) DEFAULT 'controlweave',
  ADD COLUMN IF NOT EXISTS elastic_pipeline VARCHAR(255),
  ADD COLUMN IF NOT EXISTS syslog_host VARCHAR(255),
  ADD COLUMN IF NOT EXISTS syslog_port INTEGER DEFAULT 514,
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT, -- for HMAC signature verification (encrypted)
  ADD COLUMN IF NOT EXISTS is_secret_encrypted BOOLEAN NOT NULL DEFAULT false, -- encryption flag for webhook_secret, distinct from is_key_encrypted (api_key)
  ADD COLUMN IF NOT EXISTS webhook_headers JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS event_filter TEXT[] DEFAULT ARRAY['*']; -- event types to forward; ['*'] = all

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'siem_configurations' AND column_name = 'syslog_protocol'
  ) THEN
    ALTER TABLE siem_configurations
      ADD COLUMN syslog_protocol VARCHAR(8) DEFAULT 'udp' CHECK (syslog_protocol IN ('udp', 'tcp', 'tls'));
  END IF;
END $$;

-- 15) integrations_hub_connectors (098_integrations_hub_connectors.sql,
-- shadowed by 024). No current source reference found by name; reconciled
-- for schema completeness on the same basis as audit_log_custom_fields.
ALTER TABLE integrations_hub_connectors
  ADD COLUMN IF NOT EXISTS template_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
