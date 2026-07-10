-- Migration 005: CMDB Assets with NIST 800-160 and AI Governance
-- Comprehensive Configuration Management Database for assets, AI agents, service accounts

-- Asset Categories
CREATE TABLE asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    tier_required VARCHAR(50) DEFAULT 'free', -- Minimum tier required
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert predefined categories
INSERT INTO asset_categories (name, code, description, tier_required) VALUES
    ('Hardware', 'hardware', 'Physical devices and equipment', 'free'),
    ('Software', 'software', 'Software applications and licenses', 'free'),
    ('Cloud Resource', 'cloud', 'Cloud infrastructure and services', 'starter'),
    ('Network Device', 'network', 'Routers, switches, firewalls', 'starter'),
    ('Database', 'database', 'Database systems and instances', 'starter'),
    ('AI Agent', 'ai_agent', 'Artificial Intelligence agents and models', 'professional'),
    ('Service Account', 'service_account', 'Service accounts and credentials', 'professional');

-- Environments (with IP tracking for AI governance)
CREATE TABLE environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    environment_type VARCHAR(50), -- 'development', 'staging', 'production', 'dr'

    -- Data classification flags (NIST 800-160)
    contains_pii BOOLEAN DEFAULT FALSE,
    contains_phi BOOLEAN DEFAULT FALSE,
    contains_pci BOOLEAN DEFAULT FALSE,
    data_classification VARCHAR(50), -- 'public', 'internal', 'confidential', 'restricted'

    -- Network information (for AI governance)
    ip_addresses JSONB, -- Array of IP addresses/CIDR blocks
    network_zone VARCHAR(100), -- 'dmz', 'internal', 'secure', 'isolated'

    -- NIST 800-160: System Security Requirements
    security_level VARCHAR(50), -- 'low', 'moderate', 'high' (per FIPS 199)
    criticality VARCHAR(50), -- 'low', 'medium', 'high', 'critical'

    -- Compliance
    compliance_requirements JSONB, -- Array of required compliance frameworks

    description TEXT,
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- Password Vaults
CREATE TABLE password_vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    vault_type VARCHAR(100), -- 'hashicorp_vault', 'aws_secrets_manager', 'azure_key_vault', 'cyberark', '1password'
    vault_url VARCHAR(500),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- Assets (unified table for all asset types)
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES asset_categories(id),

    -- Basic Information
    name VARCHAR(255) NOT NULL,
    asset_tag VARCHAR(100),
    serial_number VARCHAR(255),
    model VARCHAR(255),
    manufacturer VARCHAR(255),

    -- Ownership (NIST 800-160: Clear accountability)
    owner_id UUID REFERENCES users(id),
    custodian_id UUID REFERENCES users(id),
    business_owner_id UUID REFERENCES users(id),

    -- Location
    location VARCHAR(255),
    environment_id UUID REFERENCES environments(id),

    -- Lifecycle (NIST 800-160: Lifecycle management)
    status VARCHAR(50) DEFAULT 'active', -- 'planning', 'active', 'maintenance', 'deprecated', 'decommissioned'
    acquisition_date DATE,
    deployment_date DATE,
    end_of_life_date DATE,
    decommission_date DATE,

    -- Security Classification (NIST 800-160)
    security_classification VARCHAR(50), -- 'public', 'internal', 'confidential', 'secret'
    criticality VARCHAR(50), -- 'low', 'medium', 'high', 'critical'

    -- Network Information
    ip_address VARCHAR(50),
    hostname VARCHAR(255),
    fqdn VARCHAR(500),
    mac_address VARCHAR(17),

    -- Software/Cloud specific
    version VARCHAR(100),
    license_key TEXT,
    license_expiry DATE,
    cloud_provider VARCHAR(100),
    cloud_region VARCHAR(100),

    -- AI-specific fields (Professional+ tier only)
    ai_model_type VARCHAR(100), -- 'llm', 'computer_vision', 'nlp', 'recommendation', 'predictive'
    ai_risk_level VARCHAR(50), -- EU AI Act: 'unacceptable', 'high', 'limited', 'minimal'
    ai_training_data_source TEXT,
    ai_bias_testing_completed BOOLEAN DEFAULT FALSE,
    ai_bias_testing_date DATE,
    ai_human_oversight_required BOOLEAN DEFAULT FALSE,
    ai_transparency_score INTEGER, -- 0-100

    -- Compliance & Documentation
    compliance_status VARCHAR(50),
    last_audit_date DATE,
    next_audit_date DATE,
    documentation_url TEXT,
    notes TEXT,
    metadata JSONB, -- Flexible additional data

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Asset Dependencies (track relationships between assets)
CREATE TABLE asset_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    depends_on_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50), -- 'requires', 'uses', 'communicates_with', 'hosted_on'
    criticality VARCHAR(50), -- 'low', 'medium', 'high'
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, depends_on_asset_id, dependency_type)
);

-- Service Accounts (Professional+ tier)
CREATE TABLE service_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Basic Information
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(100), -- 'bot', 'api_key', 'system_user', 'service_principal', 'oauth_client'
    description TEXT,

    -- Ownership
    owner_id UUID REFERENCES users(id),
    business_justification TEXT,

    -- Vault Integration
    vault_id UUID REFERENCES password_vaults(id),
    vault_path VARCHAR(500), -- Path within vault

    -- Credential Management
    credential_type VARCHAR(100), -- 'password', 'api_key', 'certificate', 'ssh_key', 'oauth_token'
    last_rotation_date DATE,
    rotation_frequency_days INTEGER DEFAULT 90,
    next_rotation_date DATE,
    auto_rotation_enabled BOOLEAN DEFAULT FALSE,

    -- Access & Privileges
    privilege_level VARCHAR(50), -- 'read', 'write', 'admin', 'root'
    scope TEXT, -- What resources this account can access

    -- Review & Compliance
    last_review_date DATE,
    next_review_date DATE,
    review_frequency_days INTEGER DEFAULT 90,
    reviewer_id UUID REFERENCES users(id),

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended', 'disabled'
    is_active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, account_name)
);

-- Service Account Access (which assets/systems use which service accounts)
CREATE TABLE service_account_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_account_id UUID NOT NULL REFERENCES service_accounts(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    environment_id UUID REFERENCES environments(id),
    access_type VARCHAR(100), -- 'database', 'api', 'ssh', 'cloud_service'
    granted_date DATE,
    expires_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(service_account_id, asset_id)
);

-- Asset Control Mappings (link assets to compliance controls)
CREATE TABLE asset_control_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    compliance_status VARCHAR(50), -- 'compliant', 'non_compliant', 'partial', 'not_applicable'
    last_assessed DATE,
    next_assessment DATE,
    evidence_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, control_id, organization_id)
);

-- Asset Access Logs (Enterprise+ tier - who accessed what asset)
CREATE TABLE asset_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    service_account_id UUID REFERENCES service_accounts(id),
    access_type VARCHAR(100), -- 'read', 'write', 'execute', 'delete', 'admin'
    ip_address VARCHAR(50),
    success BOOLEAN DEFAULT TRUE,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Service Account Reviews (Enterprise+ tier - periodic review workflow)
CREATE TABLE service_account_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_account_id UUID NOT NULL REFERENCES service_accounts(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    review_date DATE DEFAULT CURRENT_DATE,
    review_status VARCHAR(50), -- 'approved', 'revoke', 'modify', 'pending'
    findings TEXT,
    action_taken TEXT,
    next_review_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_assets_org ON assets(organization_id);
CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_owner ON assets(owner_id);
CREATE INDEX idx_assets_environment ON assets(environment_id);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_environments_org ON environments(organization_id);
CREATE INDEX idx_service_accounts_org ON service_accounts(organization_id);
CREATE INDEX idx_service_accounts_owner ON service_accounts(owner_id);
CREATE INDEX idx_service_accounts_vault ON service_accounts(vault_id);
CREATE INDEX idx_service_account_access_sa ON service_account_access(service_account_id);
CREATE INDEX idx_service_account_access_asset ON service_account_access(asset_id);
CREATE INDEX idx_asset_dependencies_asset ON asset_dependencies(asset_id);
CREATE INDEX idx_asset_dependencies_depends ON asset_dependencies(depends_on_asset_id);
CREATE INDEX idx_asset_control_mappings_asset ON asset_control_mappings(asset_id);
CREATE INDEX idx_asset_control_mappings_control ON asset_control_mappings(control_id);
CREATE INDEX idx_asset_access_logs_asset ON asset_access_logs(asset_id);
CREATE INDEX idx_asset_access_logs_created ON asset_access_logs(created_at DESC);

COMMENT ON TABLE assets IS 'CMDB: Unified asset tracking with NIST 800-160 lifecycle management and AI governance';
COMMENT ON TABLE environments IS 'Environments with IP tracking for AI governance and data classification';
COMMENT ON TABLE service_accounts IS 'Service accounts with vault integration and rotation tracking';
COMMENT ON TABLE asset_control_mappings IS 'Links assets to compliance controls for traceability';
