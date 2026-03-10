-- Migration 001: Initial Schema for ControlWeave
-- Core tables for multi-tenant GRC compliance management

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations (multi-tenant)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'starter', 'professional', 'enterprise', 'utilities'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin', 'user', 'auditor'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Roles and Permissions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Frameworks
CREATE TABLE frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    description TEXT,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Framework Controls
CREATE TABLE framework_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_id UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
    control_id VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    control_type VARCHAR(50),
    priority VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Control Implementations (per organization)
CREATE TABLE control_implementations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'implemented', 'needs_review'
    implementation_notes TEXT,
    evidence_location TEXT,
    assigned_to UUID REFERENCES users(id),
    notes TEXT,
    implementation_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(control_id, organization_id)
);

-- Control Mappings (crosswalk between frameworks)
CREATE TABLE control_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
    target_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
    mapping_type VARCHAR(50) DEFAULT 'equivalent',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_framework_controls_framework ON framework_controls(framework_id);
CREATE INDEX idx_control_implementations_org ON control_implementations(organization_id);
CREATE INDEX idx_control_implementations_control ON control_implementations(control_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

COMMENT ON TABLE organizations IS 'Multi-tenant organizations with tier-based access control';
COMMENT ON TABLE users IS 'User accounts with organization association';
COMMENT ON TABLE framework_controls IS 'Compliance framework controls (ISO 27001, NIST, etc.)';
COMMENT ON TABLE control_implementations IS 'Organization-specific control implementation status';
