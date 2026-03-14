-- Migration: Dynamic Audit Log Fields
-- Enables organization-specific custom audit fields and column visibility preferences

-- Table to store custom audit field definitions per organization
CREATE TABLE IF NOT EXISTS audit_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- text, number, boolean, datetime, json
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    source_integration VARCHAR(100), -- siem, sso, splunk, elastic, etc.
    is_active BOOLEAN DEFAULT TRUE,
    is_ai_suggested BOOLEAN DEFAULT FALSE,
    ai_confidence_score DECIMAL(3,2) CHECK (ai_confidence_score IS NULL OR (ai_confidence_score >= 0.00 AND ai_confidence_score <= 1.00)), -- 0.00 to 1.00
    suggested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, field_name)
);

-- Table to store user preferences for audit log column visibility
CREATE TABLE IF NOT EXISTS audit_column_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_org_default BOOLEAN DEFAULT FALSE, -- If true, applies to all users in org
    visible_columns JSONB NOT NULL DEFAULT '[]', -- Array of column names
    column_order JSONB DEFAULT '[]', -- Array of column names in display order
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, user_id),
    CHECK (user_id IS NOT NULL OR is_org_default = TRUE) -- Org defaults must have NULL user_id
);

-- Add unique constraint for org default (only one per org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_column_prefs_org_default 
ON audit_column_preferences(organization_id) 
WHERE is_org_default = true;

-- Table to store dynamic field values for audit logs
-- This stores custom fields in a flexible way
CREATE TABLE IF NOT EXISTS audit_log_custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id UUID NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
    field_definition_id UUID NOT NULL REFERENCES audit_field_definitions(id) ON DELETE CASCADE,
    field_value JSONB NOT NULL, -- Store value as JSONB for flexibility
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(audit_log_id, field_definition_id)
);

-- Table to track AI field suggestions and their adoption
CREATE TABLE IF NOT EXISTS audit_field_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    suggested_field_name VARCHAR(100) NOT NULL,
    suggested_field_type VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    source_integration VARCHAR(100),
    sample_values JSONB, -- Array of sample values found
    occurrence_count INTEGER DEFAULT 1, -- How many times this field was seen
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00), -- AI confidence in suggestion
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, suggested_field_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_field_defs_org ON audit_field_definitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_field_defs_active ON audit_field_definitions(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_field_defs_source ON audit_field_definitions(organization_id, source_integration);

CREATE INDEX IF NOT EXISTS idx_audit_col_prefs_org ON audit_column_preferences(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_col_prefs_user ON audit_column_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_custom_fields_log ON audit_log_custom_fields(audit_log_id);
CREATE INDEX IF NOT EXISTS idx_audit_custom_fields_def ON audit_log_custom_fields(field_definition_id);

CREATE INDEX IF NOT EXISTS idx_audit_field_sugg_org ON audit_field_suggestions(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_field_sugg_status ON audit_field_suggestions(organization_id, status);

-- Comments for documentation
COMMENT ON TABLE audit_field_definitions IS 'Organization-specific custom audit field definitions';
COMMENT ON TABLE audit_column_preferences IS 'User and organization preferences for audit log column visibility';
COMMENT ON TABLE audit_log_custom_fields IS 'Dynamic custom field values for audit logs';
COMMENT ON TABLE audit_field_suggestions IS 'AI-suggested custom fields pending review';

COMMENT ON COLUMN audit_field_definitions.field_type IS 'Data type: text, number, boolean, datetime, json';
COMMENT ON COLUMN audit_field_definitions.source_integration IS 'Integration that provides this field: siem, sso, splunk, elastic, etc.';
COMMENT ON COLUMN audit_field_definitions.is_ai_suggested IS 'Whether this field was suggested by AI analysis';
COMMENT ON COLUMN audit_field_definitions.ai_confidence_score IS 'AI confidence in field relevance (0.00-1.00)';

COMMENT ON COLUMN audit_column_preferences.is_org_default IS 'If true, these preferences apply to all users in the organization';
COMMENT ON COLUMN audit_column_preferences.visible_columns IS 'Array of column names to display';
COMMENT ON COLUMN audit_column_preferences.column_order IS 'Ordered array of column names for display';

COMMENT ON COLUMN audit_field_suggestions.status IS 'Suggestion status: pending, accepted, rejected';
COMMENT ON COLUMN audit_field_suggestions.confidence_score IS 'AI confidence in suggestion (0.00-1.00)';
COMMENT ON COLUMN audit_field_suggestions.occurrence_count IS 'Number of times this field was observed in integration data';
