-- Migration 058: Data Sovereignty and Geographic Compliance
-- Adds multi-regional compliance support for fragmented global AI regulations
-- Supports Gartner prediction: 75% of world economies with AI regulations by 2030

DO $$
BEGIN

  -- -----------------------------------------------------------------------
  -- Add data sovereignty fields to organizations table
  -- -----------------------------------------------------------------------
  ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS primary_data_region VARCHAR(50) DEFAULT 'us-east-1',
    ADD COLUMN IF NOT EXISTS data_residency_requirements JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS cross_border_transfer_allowed BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS approved_transfer_regions JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS data_localization_policy TEXT,
    ADD COLUMN IF NOT EXISTS sovereignty_attestation_date DATE,
    ADD COLUMN IF NOT EXISTS sovereignty_attestation_by UUID REFERENCES users(id) ON DELETE SET NULL;

  COMMENT ON COLUMN organizations.primary_data_region IS
    'Primary geographic region for data storage (e.g., us-east-1, eu-west-1, ap-southeast-1)';
  COMMENT ON COLUMN organizations.data_residency_requirements IS
    'JSON object defining data residency requirements per data type or framework';
  COMMENT ON COLUMN organizations.cross_border_transfer_allowed IS
    'Whether cross-border data transfers are permitted under org policy';
  COMMENT ON COLUMN organizations.approved_transfer_regions IS
    'Array of approved regions for data transfer (e.g., ["EU", "US", "UK"])';

  -- -----------------------------------------------------------------------
  -- regulatory_jurisdictions: Track global regulatory requirements
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regulatory_jurisdictions') THEN
    CREATE TABLE regulatory_jurisdictions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      
      -- Jurisdiction identification
      jurisdiction_code     VARCHAR(10) NOT NULL UNIQUE, -- ISO 3166-1 alpha-2 or custom (e.g., 'US', 'EU', 'CN')
      jurisdiction_name     VARCHAR(255) NOT NULL,
      jurisdiction_type     VARCHAR(50) NOT NULL, -- 'country', 'region', 'state', 'supranational'
      parent_jurisdiction   VARCHAR(10), -- For nested jurisdictions (e.g., 'CA' parent is 'US')
      
      -- Regulatory profile
      has_ai_regulations    BOOLEAN DEFAULT false,
      has_data_residency    BOOLEAN DEFAULT false,
      has_localization_req  BOOLEAN DEFAULT false,
      regulation_effective_date DATE,
      
      -- Key regulations
      primary_ai_law        VARCHAR(255), -- 'EU AI Act', 'California AI Transparency Act', etc.
      primary_privacy_law   VARCHAR(255), -- 'GDPR', 'CCPA', 'LGPD', etc.
      data_transfer_mechanism VARCHAR(255), -- 'Standard Contractual Clauses', 'Adequacy Decision', etc.
      
      -- Requirements summary
      requirements_summary  TEXT,
      compliance_notes      TEXT,
      
      -- Metadata
      metadata              JSONB DEFAULT '{}',
      is_active             BOOLEAN DEFAULT true,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_regulatory_jurisdictions_code ON regulatory_jurisdictions (jurisdiction_code);
    CREATE INDEX idx_regulatory_jurisdictions_ai_regs ON regulatory_jurisdictions (has_ai_regulations) WHERE has_ai_regulations = true;
  END IF;

  -- -----------------------------------------------------------------------
  -- organization_jurisdictions: Org's operational jurisdictions
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_jurisdictions') THEN
    CREATE TABLE organization_jurisdictions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      jurisdiction_id       UUID NOT NULL REFERENCES regulatory_jurisdictions(id) ON DELETE CASCADE,
      
      -- Operational presence
      presence_type         VARCHAR(50) NOT NULL, -- 'headquarters', 'office', 'data_center', 'customers', 'vendors'
      operational_since     DATE,
      
      -- Compliance status
      compliance_required   BOOLEAN DEFAULT false,
      compliance_status     VARCHAR(50) DEFAULT 'not_assessed', -- 'not_assessed', 'in_progress', 'compliant', 'non_compliant'
      last_assessment_date  DATE,
      next_assessment_date  DATE,
      
      -- Assigned frameworks
      applicable_frameworks JSONB DEFAULT '[]', -- Array of framework IDs applicable in this jurisdiction
      
      -- Notes
      notes                 TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW(),
      
      UNIQUE (organization_id, jurisdiction_id)
    );

    CREATE INDEX idx_org_jurisdictions_org_id ON organization_jurisdictions (organization_id);
    CREATE INDEX idx_org_jurisdictions_jurisdiction_id ON organization_jurisdictions (jurisdiction_id);
    CREATE INDEX idx_org_jurisdictions_compliance ON organization_jurisdictions (organization_id, compliance_status);
  END IF;

  -- -----------------------------------------------------------------------
  -- regulatory_changes: Track regulatory change events
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regulatory_changes') THEN
    CREATE TABLE regulatory_changes (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      jurisdiction_id       UUID REFERENCES regulatory_jurisdictions(id) ON DELETE CASCADE,
      
      -- Change identification
      change_title          VARCHAR(500) NOT NULL,
      change_type           VARCHAR(50) NOT NULL, -- 'new_law', 'amendment', 'repeal', 'guidance', 'enforcement_action'
      change_source         VARCHAR(255), -- 'Legislative body', 'Regulatory agency', etc.
      
      -- Timeline
      announced_date        DATE,
      effective_date        DATE,
      compliance_deadline   DATE,
      
      -- Impact assessment
      impact_level          VARCHAR(20) DEFAULT 'unknown', -- 'low', 'medium', 'high', 'critical'
      affected_frameworks   JSONB DEFAULT '[]', -- Array of framework codes
      affected_controls     JSONB DEFAULT '[]', -- Array of control identifiers
      
      -- Description
      summary               TEXT NOT NULL,
      full_details          TEXT,
      source_url            TEXT,
      
      -- Organization response tracking
      requires_action       BOOLEAN DEFAULT false,
      action_plan_created   BOOLEAN DEFAULT false,
      action_plan_id        UUID, -- Could reference a POA&M or project
      
      -- Status
      status                VARCHAR(50) DEFAULT 'monitoring', -- 'monitoring', 'assessing', 'implementing', 'compliant'
      
      -- Metadata
      metadata              JSONB DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_regulatory_changes_jurisdiction ON regulatory_changes (jurisdiction_id);
    CREATE INDEX idx_regulatory_changes_effective_date ON regulatory_changes (effective_date DESC);
    CREATE INDEX idx_regulatory_changes_impact ON regulatory_changes (impact_level, status);
    CREATE INDEX idx_regulatory_changes_requires_action ON regulatory_changes (requires_action) WHERE requires_action = true;
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_provider_regions: Track AI provider geographic availability
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_provider_regions') THEN
    CREATE TABLE ai_provider_regions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      
      -- Provider identification
      provider_name         VARCHAR(100) NOT NULL, -- 'Anthropic', 'OpenAI', 'Google', etc.
      provider_model        VARCHAR(100), -- 'claude-sonnet-4', 'gpt-4o', etc.
      
      -- Regional availability
      region_code           VARCHAR(50) NOT NULL, -- 'us-east-1', 'eu-west-1', etc.
      jurisdiction_code     VARCHAR(10), -- Link to regulatory_jurisdictions
      
      -- Compliance attributes
      data_residency_guaranteed BOOLEAN DEFAULT false,
      data_processing_location TEXT,
      compliant_frameworks  JSONB DEFAULT '[]', -- e.g., ['GDPR', 'EU AI Act']
      
      -- Service details
      is_available          BOOLEAN DEFAULT true,
      endpoint_url          TEXT,
      latency_ms_p50        INTEGER,
      
      -- Metadata
      notes                 TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW(),
      
      UNIQUE (provider_name, provider_model, region_code)
    );

    CREATE INDEX idx_ai_provider_regions_provider ON ai_provider_regions (provider_name);
    CREATE INDEX idx_ai_provider_regions_jurisdiction ON ai_provider_regions (jurisdiction_code);
    CREATE INDEX idx_ai_provider_regions_available ON ai_provider_regions (is_available) WHERE is_available = true;
  END IF;

  -- -----------------------------------------------------------------------
  -- Seed initial regulatory jurisdictions
  -- -----------------------------------------------------------------------
  INSERT INTO regulatory_jurisdictions (jurisdiction_code, jurisdiction_name, jurisdiction_type, has_ai_regulations, has_data_residency, primary_ai_law, primary_privacy_law, regulation_effective_date)
  VALUES
    ('EU', 'European Union', 'supranational', true, true, 'EU AI Act', 'GDPR', '2024-08-01'),
    ('US', 'United States', 'country', true, false, 'Executive Order 14110', 'Various state laws', '2023-10-30'),
    ('UK', 'United Kingdom', 'country', true, false, 'AI Regulation Policy Paper', 'UK GDPR', '2023-01-01'),
    ('CN', 'China', 'country', true, true, 'Generative AI Measures', 'PIPL', '2023-08-15'),
    ('CA', 'California', 'state', true, false, 'California AI Transparency Act', 'CCPA/CPRA', '2024-01-01'),
    ('SG', 'Singapore', 'country', true, false, 'Model AI Governance Framework', 'PDPA', '2020-01-01'),
    ('IN', 'India', 'country', true, true, 'Draft Digital India Act', 'DPDP Act 2023', '2024-01-01'),
    ('BR', 'Brazil', 'country', true, false, 'Brazilian AI Bill', 'LGPD', '2023-01-01'),
    ('AU', 'Australia', 'country', true, false, 'AI Ethics Framework', 'Privacy Act 1988', '2019-01-01'),
    ('JP', 'Japan', 'country', true, false, 'AI Business Guidelines', 'APPI', '2022-04-01')
  ON CONFLICT (jurisdiction_code) DO NOTHING;

END $$;

SELECT 'Migration 058 completed: Data sovereignty and multi-regional compliance infrastructure ready' AS result;
