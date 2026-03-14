-- Migration 022: Organization Systems, Vendors, Assets, SBOM, and Content Overrides
-- Adds tables for the Organization's system inventory, COTS product registry,
-- vendor contracts, asset CMDB, SBOM / software bill of materials,
-- and per-org content overrides for controls and assessment procedures.

-- ============================================================
-- PART 1: organization_systems
-- Formal system records (ATOs, system boundaries, CIA classifications)
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_systems (
  id                                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_name                             VARCHAR(500) NOT NULL,
  system_code                             VARCHAR(100),
  system_description                      TEXT,
  authorization_boundary_override         TEXT,
  operating_environment_summary_override  TEXT,
  confidentiality_impact                  VARCHAR(20) NOT NULL DEFAULT 'low', -- low / moderate / high
  integrity_impact                        VARCHAR(20) NOT NULL DEFAULT 'low',
  availability_impact                     VARCHAR(20) NOT NULL DEFAULT 'low',
  impact_rationale                        TEXT,
  environment_types                       TEXT[],  -- on_prem, cloud, hybrid, saas, ot, …
  deployment_model                        VARCHAR(50), -- on_prem / single_cloud / multi_cloud / hybrid / saas_only
  cloud_providers                         TEXT[],
  data_sensitivity_types                  TEXT[],  -- pii, phi, pci, cui, …
  is_primary                              BOOLEAN  NOT NULL DEFAULT FALSE,
  is_active                               BOOLEAN  NOT NULL DEFAULT TRUE,
  created_by                              UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by                              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_org
  ON organization_systems(organization_id);

-- ============================================================
-- PART 2: cots_products
-- Commercial-off-the-shelf and SaaS product registry
-- ============================================================

CREATE TABLE IF NOT EXISTS cots_products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_id        UUID REFERENCES organization_systems(id) ON DELETE SET NULL,
  product_name     VARCHAR(500) NOT NULL,
  vendor_name      VARCHAR(500) NOT NULL,
  product_version  VARCHAR(100),
  product_type     VARCHAR(50) NOT NULL DEFAULT 'cots',
    -- cots / saas / managed_service / platform / other
  deployment_model VARCHAR(50),
    -- on_prem / single_cloud / multi_cloud / hybrid / saas_only / managed_service / other
  data_access_level VARCHAR(20) NOT NULL DEFAULT 'none', -- none / metadata / limited / full
  lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'active', -- planned / active / deprecated / retired
  criticality      VARCHAR(20) NOT NULL DEFAULT 'medium', -- low / medium / high / critical
  support_end_date DATE,
  notes            TEXT,
  business_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_org
  ON cots_products(organization_id);

CREATE INDEX IF NOT EXISTS idx_cp_system
  ON cots_products(system_id);

-- ============================================================
-- PART 3: vendor_contracts
-- Legal / commercial contracts with vendors
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_contracts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_id            UUID REFERENCES organization_systems(id) ON DELETE SET NULL,
  cots_product_id      UUID REFERENCES cots_products(id) ON DELETE SET NULL,
  contract_name        VARCHAR(500) NOT NULL,
  vendor_name          VARCHAR(500) NOT NULL,
  contract_number      VARCHAR(200),
  contract_type        VARCHAR(30) NOT NULL DEFAULT 'other',
    -- msa / sow / license / dpa / baa / sla / other
  status               VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- draft / active / renewal_pending / expired / terminated
  start_date           DATE,
  end_date             DATE,
  renewal_date         DATE,
  notice_period_days   INTEGER,
  security_requirements TEXT,
  data_processing_terms TEXT,
  sla_summary          TEXT,
  notes                TEXT,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vc_org
  ON vendor_contracts(organization_id);

-- ============================================================
-- PART 4: assets
-- General asset / CMDB inventory (hardware, software, service accounts, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(500) NOT NULL,
  asset_type      VARCHAR(50),  -- hardware / software / service_account / ai_agent / etc.
  description     TEXT,
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(30)  NOT NULL DEFAULT 'active', -- active / inactive / decommissioned
  tags            TEXT[],
  metadata        JSONB,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_org
  ON assets(organization_id);

-- ============================================================
-- PART 5: sbom_records
-- Software Bill of Materials top-level records
-- ============================================================

CREATE TABLE IF NOT EXISTS sbom_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id        UUID REFERENCES assets(id) ON DELETE SET NULL,
  name            VARCHAR(500),
  sbom_format     VARCHAR(30),   -- spdx / cyclonedx / etc.
  sbom_version    VARCHAR(50),
  source          VARCHAR(100),
  raw_content     JSONB,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sbom_org
  ON sbom_records(organization_id);

-- ============================================================
-- PART 6: sbom_components
-- Individual software components within an SBOM
-- ============================================================

CREATE TABLE IF NOT EXISTS sbom_components (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sbom_id      UUID        NOT NULL REFERENCES sbom_records(id) ON DELETE CASCADE,
  name         VARCHAR(500) NOT NULL,
  version      VARCHAR(100),
  purl         TEXT,          -- Package URL
  license      VARCHAR(200),
  component_type VARCHAR(50), -- library / application / container / etc.
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_sbom
  ON sbom_components(sbom_id);

-- ============================================================
-- PART 7: component_vulnerabilities
-- Links SBOM components to known vulnerabilities
-- ============================================================

CREATE TABLE IF NOT EXISTS component_vulnerabilities (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id   UUID        NOT NULL REFERENCES sbom_components(id) ON DELETE CASCADE,
  cve_id         VARCHAR(50),
  severity       VARCHAR(20),
  cvss_score     NUMERIC(4,1),
  status         VARCHAR(30) NOT NULL DEFAULT 'open',
    -- open / in_progress / remediated / false_positive / accepted
  notes          TEXT,
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_component
  ON component_vulnerabilities(component_id);

-- ============================================================
-- PART 8: organization_control_content_overrides
-- Per-org overrides for control title/description
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_control_content_overrides (
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  title                TEXT,
  description          TEXT,
  updated_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, framework_control_id)
);

CREATE INDEX IF NOT EXISTS idx_occo_org
  ON organization_control_content_overrides(organization_id);

-- ============================================================
-- PART 9: organization_assessment_procedure_overrides
-- Per-org overrides for assessment procedure content
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_assessment_procedure_overrides (
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_procedure_id UUID NOT NULL REFERENCES assessment_procedures(id) ON DELETE CASCADE,
  title                   TEXT,
  description             TEXT,
  expected_evidence       TEXT,
  assessor_notes          TEXT,
  updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, assessment_procedure_id)
);

CREATE INDEX IF NOT EXISTS idx_oapo_org
  ON organization_assessment_procedure_overrides(organization_id);

SELECT 'Migration 022 completed.' AS result;
