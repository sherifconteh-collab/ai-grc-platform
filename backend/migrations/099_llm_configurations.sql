-- Migration 099: LLM Configurations
-- Stores per-organization API keys for BYOK (Bring Your Own Key) AI providers.
-- Keys are stored encrypted (AES-256-GCM) by the application layer.

CREATE TABLE IF NOT EXISTS llm_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    anthropic_api_key_enc TEXT,
    openai_api_key_enc TEXT,
    gemini_api_key_enc TEXT,
    xai_api_key_enc TEXT,
    groq_api_key_enc TEXT,
    ollama_base_url TEXT,
    default_provider VARCHAR(50),
    default_model VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT llm_configurations_organization_id_key UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_llm_configurations_org
    ON llm_configurations (organization_id);
