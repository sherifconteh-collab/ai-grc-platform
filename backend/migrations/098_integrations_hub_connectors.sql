-- Migration 098: integrations_hub_connectors table
-- Required by integrationsHub.js route for managing external service connectors

CREATE TABLE IF NOT EXISTS integrations_hub_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_hub_connectors_org
    ON integrations_hub_connectors(organization_id);
