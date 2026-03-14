-- Migration 051: Organization systems + COTS products + vendor contracts
-- Adds:
-- 1) Multi-system overlays (org baseline + per-system overrides)
-- 2) COTS/SaaS product tracking
-- 3) Contract lifecycle tracking tied to systems/products

CREATE TABLE IF NOT EXISTS organization_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  system_name VARCHAR(255) NOT NULL,
  system_code VARCHAR(100),
  system_description TEXT,

  authorization_boundary_override TEXT,
  operating_environment_summary_override TEXT,

  confidentiality_impact VARCHAR(20),
  integrity_impact VARCHAR(20),
  availability_impact VARCHAR(20),
  impact_rationale TEXT,

  environment_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  deployment_model VARCHAR(50),
  cloud_providers TEXT[] NOT NULL DEFAULT '{}'::text[],
  data_sensitivity_types TEXT[] NOT NULL DEFAULT '{}'::text[],

  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_systems_confidentiality_valid
    CHECK (confidentiality_impact IS NULL OR confidentiality_impact IN ('low', 'moderate', 'high')),
  CONSTRAINT organization_systems_integrity_valid
    CHECK (integrity_impact IS NULL OR integrity_impact IN ('low', 'moderate', 'high')),
  CONSTRAINT organization_systems_availability_valid
    CHECK (availability_impact IS NULL OR availability_impact IN ('low', 'moderate', 'high')),
  CONSTRAINT organization_systems_deployment_model_valid
    CHECK (
      deployment_model IS NULL OR deployment_model IN (
        'on_prem', 'single_cloud', 'multi_cloud', 'hybrid', 'saas_only'
      )
    ),
  CONSTRAINT organization_systems_code_unique
    UNIQUE (organization_id, system_code)
);

CREATE INDEX IF NOT EXISTS idx_organization_systems_org_active
ON organization_systems (organization_id, is_active, system_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_systems_primary_per_org
ON organization_systems (organization_id)
WHERE is_primary = true AND is_active = true;

CREATE TABLE IF NOT EXISTS cots_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_id UUID REFERENCES organization_systems(id) ON DELETE SET NULL,

  product_name VARCHAR(255) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  product_version VARCHAR(120),
  product_type VARCHAR(50),
  deployment_model VARCHAR(50),
  data_access_level VARCHAR(30),
  lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'active',
  criticality VARCHAR(20),
  support_end_date DATE,

  business_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  technical_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT cots_products_type_valid
    CHECK (product_type IS NULL OR product_type IN ('cots', 'saas', 'managed_service', 'platform', 'other')),
  CONSTRAINT cots_products_deployment_model_valid
    CHECK (
      deployment_model IS NULL OR deployment_model IN (
        'on_prem', 'single_cloud', 'multi_cloud', 'hybrid', 'saas_only', 'managed_service', 'other'
      )
    ),
  CONSTRAINT cots_products_data_access_valid
    CHECK (data_access_level IS NULL OR data_access_level IN ('none', 'metadata', 'limited', 'full')),
  CONSTRAINT cots_products_lifecycle_valid
    CHECK (lifecycle_status IN ('planned', 'active', 'deprecated', 'retired')),
  CONSTRAINT cots_products_criticality_valid
    CHECK (criticality IS NULL OR criticality IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_cots_products_org
ON cots_products (organization_id, lifecycle_status, product_name);

CREATE INDEX IF NOT EXISTS idx_cots_products_org_system
ON cots_products (organization_id, system_id);

CREATE INDEX IF NOT EXISTS idx_cots_products_vendor
ON cots_products (vendor_name);

CREATE TABLE IF NOT EXISTS vendor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  system_id UUID REFERENCES organization_systems(id) ON DELETE SET NULL,
  cots_product_id UUID REFERENCES cots_products(id) ON DELETE SET NULL,

  contract_name VARCHAR(255) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  contract_number VARCHAR(120),
  contract_type VARCHAR(30),
  status VARCHAR(30) NOT NULL DEFAULT 'active',

  start_date DATE,
  end_date DATE,
  renewal_date DATE,
  notice_period_days INTEGER,

  security_requirements TEXT,
  data_processing_terms TEXT,
  sla_summary TEXT,
  notes TEXT,

  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT vendor_contracts_type_valid
    CHECK (contract_type IS NULL OR contract_type IN ('msa', 'sow', 'license', 'dpa', 'baa', 'sla', 'other')),
  CONSTRAINT vendor_contracts_status_valid
    CHECK (status IN ('draft', 'active', 'renewal_pending', 'expired', 'terminated')),
  CONSTRAINT vendor_contracts_notice_period_valid
    CHECK (notice_period_days IS NULL OR notice_period_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_org
ON vendor_contracts (organization_id, status, contract_name);

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_org_system
ON vendor_contracts (organization_id, system_id);

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_org_product
ON vendor_contracts (organization_id, cots_product_id);

CREATE INDEX IF NOT EXISTS idx_vendor_contracts_vendor
ON vendor_contracts (vendor_name);

-- Backfill one primary system per org from existing organization profile if no systems exist yet.
INSERT INTO organization_systems (
  organization_id,
  system_name,
  system_description,
  authorization_boundary_override,
  operating_environment_summary_override,
  confidentiality_impact,
  integrity_impact,
  availability_impact,
  impact_rationale,
  environment_types,
  deployment_model,
  cloud_providers,
  data_sensitivity_types,
  is_primary,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  op.organization_id,
  COALESCE(NULLIF(op.system_name, ''), COALESCE(NULLIF(op.company_legal_name, ''), 'Primary System')),
  op.system_description,
  op.authorization_boundary,
  op.operating_environment_summary,
  op.confidentiality_impact,
  op.integrity_impact,
  op.availability_impact,
  op.impact_rationale,
  COALESCE(op.environment_types, '{}'::text[]),
  op.deployment_model,
  COALESCE(op.cloud_providers, '{}'::text[]),
  COALESCE(op.data_sensitivity_types, '{}'::text[]),
  TRUE,
  TRUE,
  op.created_by,
  op.updated_by,
  NOW(),
  NOW()
FROM organization_profiles op
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_systems os
  WHERE os.organization_id = op.organization_id
);

COMMENT ON TABLE organization_systems IS 'Per-organization system inventory with optional requirement overlays over org baseline.';
COMMENT ON TABLE cots_products IS 'Third-party COTS/SaaS products tied to organization or specific systems.';
COMMENT ON TABLE vendor_contracts IS 'Contract lifecycle records (MSA/SOW/DPA/SLA) linked to systems and COTS products.';
