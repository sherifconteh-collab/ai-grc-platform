-- Migration 116: RMF Leveraged Authorizations (package inheritance from COTS products)
-- Why: lets an RMF package (NIST SP 800-37) inherit controls and authorization posture
-- from FedRAMP-authorized or otherwise-assessed COTS/SaaS products, following the
-- leveraged-authorization model (a leveraging system consumes controls satisfied by a
-- provider's existing authorization). Also adds authorization-posture columns to
-- cots_products so product eligibility is meaningful. Ships in release 4.3.0.

-- ============================================================
-- 1) COTS product authorization posture (all nullable, additive)
-- ============================================================
ALTER TABLE cots_products ADD COLUMN IF NOT EXISTS authorization_status VARCHAR(30);
ALTER TABLE cots_products ADD COLUMN IF NOT EXISTS authorization_impact_level VARCHAR(20);
ALTER TABLE cots_products ADD COLUMN IF NOT EXISTS external_authorization_id VARCHAR(120);

DO $$ BEGIN
  ALTER TABLE cots_products ADD CONSTRAINT cots_products_authz_status_valid CHECK (
    authorization_status IS NULL OR authorization_status IN
      ('none', 'fedramp_ready', 'fedramp_in_process', 'fedramp_authorized', 'agency_ato', 'dod_il_authorized', 'other')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cots_products ADD CONSTRAINT cots_products_authz_level_valid CHECK (
    authorization_impact_level IS NULL OR authorization_impact_level IN ('li_saas', 'low', 'moderate', 'high')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN cots_products.authorization_status IS 'Provider authorization posture (FedRAMP / agency ATO / DoD IL) used for leveraged-authorization eligibility.';
COMMENT ON COLUMN cots_products.external_authorization_id IS 'External authorization package identifier, e.g. a FedRAMP package ID.';

-- ============================================================
-- 2) Leveraged authorizations (rmf_packages <- cots_products)
-- ============================================================
CREATE TABLE IF NOT EXISTS rmf_leveraged_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rmf_package_id UUID NOT NULL REFERENCES rmf_packages(id) ON DELETE CASCADE,
  cots_product_id UUID NOT NULL REFERENCES cots_products(id) ON DELETE CASCADE,

  -- 'full'    – provider satisfies the listed controls entirely
  -- 'partial' – a subset applies or conditions attach
  -- 'hybrid'  – shared responsibility; customer portion documented below
  inheritance_type VARCHAR(20) NOT NULL DEFAULT 'partial',
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  authorization_reference VARCHAR(255),              -- e.g. FedRAMP package ID
  inherited_controls JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of control-identifier strings
  provider_responsibilities TEXT,
  customer_responsibilities TEXT,                    -- customer-retained portion (CRM)
  review_date DATE,                                  -- next scheduled review of this leveraged authz
  expiration_date DATE,                              -- provider authorization expiry
  notes TEXT,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- SECURITY: organization_id participates in the uniqueness key so a package/product
  -- pair can only ever be linked within a single tenant; both foreign IDs are
  -- additionally re-verified org-scoped in the route handlers.
  CONSTRAINT rmf_leveraged_auth_unique UNIQUE (organization_id, rmf_package_id, cots_product_id),

  CONSTRAINT rmf_leveraged_auth_type_valid CHECK (
    inheritance_type IN ('full', 'partial', 'hybrid')
  ),
  CONSTRAINT rmf_leveraged_auth_status_valid CHECK (
    status IN ('active', 'pending', 'expired', 'revoked')
  ),
  CONSTRAINT rmf_leveraged_auth_controls_is_array CHECK (
    jsonb_typeof(inherited_controls) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS idx_rmf_leveraged_auth_pkg
ON rmf_leveraged_authorizations (rmf_package_id, status);

CREATE INDEX IF NOT EXISTS idx_rmf_leveraged_auth_product
ON rmf_leveraged_authorizations (cots_product_id);

CREATE INDEX IF NOT EXISTS idx_rmf_leveraged_auth_org_expiry
ON rmf_leveraged_authorizations (organization_id, expiration_date)
WHERE status = 'active' AND expiration_date IS NOT NULL;

COMMENT ON TABLE rmf_leveraged_authorizations IS 'Controls/authorization posture an RMF package inherits from COTS/SaaS products (FedRAMP-style leveraged authorization).';

SELECT 'Migration 116: RMF leveraged authorizations created.' AS result;
