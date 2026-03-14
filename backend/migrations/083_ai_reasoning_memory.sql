-- Migration 083: AI Reasoning Memory
-- Persistent semantic memory for AI analyses — stores key findings from past
-- analyses so subsequent LLM calls receive relevant historical context.
-- Used by reasoningMemory.js to make AI assessments increasingly accurate
-- by learning from prior gap analyses, risk scores, and compliance forecasts.

CREATE TABLE IF NOT EXISTS ai_reasoning_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    feature VARCHAR(100) NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    key_findings TEXT,
    keywords TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common query patterns in reasoningMemory.js
CREATE INDEX IF NOT EXISTS idx_ai_reasoning_memory_org_feature
    ON ai_reasoning_memory(organization_id, feature);
CREATE INDEX IF NOT EXISTS idx_ai_reasoning_memory_created
    ON ai_reasoning_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reasoning_memory_org_created
    ON ai_reasoning_memory(organization_id, created_at DESC);

COMMENT ON TABLE ai_reasoning_memory IS 'Persistent reasoning memory for AI analyses — stores findings from past analyses for context injection into subsequent LLM calls';
COMMENT ON COLUMN ai_reasoning_memory.feature IS 'AI feature name (e.g., gap_analysis, compliance_forecast, risk_heatmap)';
COMMENT ON COLUMN ai_reasoning_memory.input_summary IS 'Truncated summary of the input provided to the AI analysis';
COMMENT ON COLUMN ai_reasoning_memory.output_summary IS 'Truncated summary of the AI analysis output';
COMMENT ON COLUMN ai_reasoning_memory.key_findings IS 'Extracted key findings, bullet points, and critical items from the analysis';
COMMENT ON COLUMN ai_reasoning_memory.keywords IS 'Comma-separated keywords extracted from findings for similarity-based retrieval';
COMMENT ON COLUMN ai_reasoning_memory.metadata IS 'Additional context: correlation IDs, swarm name, duration, provider used';
