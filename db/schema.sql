-- ControlWeave - Multi-Framework Database Schema
-- Supports: NIST CSF 2.0, NIST AI RMF, ISO 27001, SOC 2, HIPAA, GDPR, PCI DSS, CIS, COBIT, ISO 42001, FedRAMP, CMMC

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    size VARCHAR(50), -- small, medium, large, enterprise
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50), -- admin, compliance_officer, auditor, viewer
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- ============================================================================
-- FRAMEWORK CATALOG
-- ============================================================================

-- Frameworks Master List
CREATE TABLE frameworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- nist_csf_2.0, iso_27001, soc2, etc.
    name VARCHAR(255) NOT NULL,
    full_name TEXT,
    version VARCHAR(50),
    issuing_body VARCHAR(255), -- NIST, ISO, AICPA, etc.
    description TEXT,
    category VARCHAR(100), -- cybersecurity, privacy, ai_governance, compliance
    mandatory BOOLEAN DEFAULT FALSE, -- is this legally required?
    industry_specific BOOLEAN DEFAULT FALSE,
    applicable_industries TEXT[], -- array of industries
    last_updated DATE,
    official_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Framework Functions/Domains (high-level groupings)
CREATE TABLE framework_functions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL, -- ID, PR, DE, RS, RC for NIST CSF
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER,
    UNIQUE(framework_id, code)
);

-- Framework Categories (mid-level groupings)
CREATE TABLE framework_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
    function_id UUID REFERENCES framework_functions(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL, -- ID.AM, PR.AC, etc.
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER,
    UNIQUE(framework_id, code)
);

-- Framework Controls (individual requirements)
CREATE TABLE framework_controls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
    function_id UUID REFERENCES framework_functions(id),
    category_id UUID REFERENCES framework_categories(id),
    control_id VARCHAR(100) NOT NULL, -- ID.AM-01, A.5.1, CC1.1, etc.
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    implementation_guidance TEXT,
    example_implementations TEXT,
    
    -- Control attributes
    control_type VARCHAR(50), -- preventive, detective, corrective, directive
    automation_level VARCHAR(50), -- manual, semi_automated, fully_automated
    maturity_level INTEGER, -- 1-5 for some frameworks
    priority VARCHAR(20), -- critical, high, medium, low
    
    -- References
    references TEXT[], -- array of related standards/frameworks
    related_controls TEXT[], -- array of related control IDs
    
    -- Metadata
    display_order INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(framework_id, control_id)
);

-- Control Parameters (for configurable controls)
CREATE TABLE control_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
    parameter_name VARCHAR(255) NOT NULL,
    parameter_description TEXT,
    parameter_type VARCHAR(50), -- numeric, text, boolean, list
    default_value TEXT,
    allowed_values TEXT[], -- for list types
    is_required BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- ORGANIZATION IMPLEMENTATIONS
-- ============================================================================

-- Framework Adoption by Organizations
CREATE TABLE organization_frameworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'planning',
    target_completion_date DATE,
    last_assessment_date DATE,
    next_assessment_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, framework_id)
);

-- Control Implementation Status
CREATE TABLE control_implementations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'not_started',
    compliance_status VARCHAR(50),
    compliance_percentage INTEGER,
    implementation_notes TEXT,
    responsible_party VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, control_id)
);

-- ============================================================================
-- AI SYSTEMS & RISK
-- ============================================================================

-- AI Systems Inventory
CREATE TABLE ai_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    system_name VARCHAR(255) NOT NULL,
    system_id VARCHAR(100) UNIQUE,
    description TEXT,
    ai_type VARCHAR(100),
    risk_level VARCHAR(20),
    deployment_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk Register
CREATE TABLE risks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    risk_id VARCHAR(50) UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    risk_category VARCHAR(100),
    likelihood VARCHAR(20),
    impact VARCHAR(20),
    inherent_risk_score INTEGER,
    residual_risk_score INTEGER,
    status VARCHAR(50) DEFAULT 'identified',
    risk_owner VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assessments
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    framework_id UUID REFERENCES frameworks(id),
    assessment_type VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'planned',
    planned_start_date DATE,
    planned_end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assessment Findings
CREATE TABLE assessment_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
    control_id UUID REFERENCES framework_controls(id),
    finding_type VARCHAR(50),
    severity VARCHAR(20),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cross-framework Control Mappings
CREATE TABLE control_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
    target_control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
    mapping_type VARCHAR(50),
    similarity_score INTEGER,
    UNIQUE(source_control_id, target_control_id)
);

-- Activity Log
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_frameworks_code ON frameworks(code);
CREATE INDEX idx_controls_framework_id ON framework_controls(framework_id);
CREATE INDEX idx_implementations_org_id ON control_implementations(organization_id);
CREATE INDEX idx_risks_org_id ON risks(organization_id);
CREATE INDEX idx_ai_systems_org_id ON ai_systems(organization_id);
