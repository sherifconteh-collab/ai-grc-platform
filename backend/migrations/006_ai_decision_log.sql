-- Migration 006: AI Decision Log for Evidence Chains
-- Provides complete traceability for AI decisions under regulatory scrutiny
-- Supports evidence-chain traceability requirements for AI governance and audit readiness

CREATE TABLE IF NOT EXISTS ai_decision_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reference to AI agent asset (assets table where category is 'AI Agent')
    ai_agent_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Input Data (with integrity verification)
    input_data JSONB,
    input_hash VARCHAR(64), -- SHA-256 for integrity verification

    -- Processing Details (model transparency)
    model_version VARCHAR(100),
    prompt_template TEXT,
    temperature DECIMAL(3,2),
    processing_timestamp TIMESTAMP DEFAULT NOW(),

    -- Output Data (with integrity verification)
    output_data JSONB,
    output_hash VARCHAR(64), -- SHA-256 for output integrity
    confidence_score DECIMAL(5,4), -- Model confidence level

    -- Explainability (as much as LLMs allow)
    reasoning TEXT, -- If model provides chain-of-thought
    key_factors JSONB, -- Factors that influenced the decision
    alternative_outputs JSONB, -- Other options considered (if available)

    -- Human Oversight (EU AI Act requirement for high-risk AI)
    human_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    review_timestamp TIMESTAMP,
    review_notes TEXT,
    review_outcome VARCHAR(50), -- 'approved', 'rejected', 'modified'

    -- Traceability & Correlation
    correlation_id VARCHAR(255), -- Link to business transaction/request
    session_id VARCHAR(255), -- Link related decisions in same session
    parent_decision_id UUID REFERENCES ai_decision_log(id), -- For decision chains

    -- Regulatory Compliance Fields
    regulatory_framework VARCHAR(100), -- 'EU AI Act', 'GDPR', 'CCPA', etc.
    risk_assessment VARCHAR(50), -- 'unacceptable', 'high', 'limited', 'minimal'
    compliance_notes TEXT,

    -- Audit Trail
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Index for performance
    CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_agent FOREIGN KEY (ai_agent_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_agent ON ai_decision_log(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_org ON ai_decision_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_correlation ON ai_decision_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_session ON ai_decision_log(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_timestamp ON ai_decision_log(processing_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_review ON ai_decision_log(human_reviewed, reviewed_by);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_framework ON ai_decision_log(regulatory_framework);

-- View for unreviewed high-risk decisions (alerts/dashboard)
CREATE OR REPLACE VIEW unreviewed_high_risk_decisions AS
SELECT
    dl.id,
    dl.ai_agent_id,
    a.name as agent_name,
    dl.processing_timestamp,
    dl.risk_assessment,
    dl.confidence_score,
    dl.correlation_id,
    dl.regulatory_framework,
    EXTRACT(EPOCH FROM (NOW() - dl.processing_timestamp))/3600 as hours_pending
FROM ai_decision_log dl
JOIN assets a ON dl.ai_agent_id = a.id
WHERE dl.human_reviewed = FALSE
  AND dl.risk_assessment IN ('high', 'unacceptable')
ORDER BY dl.processing_timestamp ASC;

-- View for compliance reporting (evidence chain summary)
CREATE OR REPLACE VIEW ai_decision_evidence_summary AS
SELECT
    dl.organization_id,
    dl.ai_agent_id,
    a.name as agent_name,
    a.ai_risk_level,
    COUNT(*) as total_decisions,
    COUNT(*) FILTER (WHERE dl.human_reviewed = TRUE) as reviewed_decisions,
    COUNT(*) FILTER (WHERE dl.human_reviewed = FALSE) as pending_review,
    COUNT(*) FILTER (WHERE dl.review_outcome = 'approved') as approved_decisions,
    COUNT(*) FILTER (WHERE dl.review_outcome = 'rejected') as rejected_decisions,
    AVG(dl.confidence_score) as avg_confidence,
    MIN(dl.processing_timestamp) as first_decision,
    MAX(dl.processing_timestamp) as latest_decision,
    COUNT(DISTINCT dl.correlation_id) as unique_transactions
FROM ai_decision_log dl
JOIN assets a ON dl.ai_agent_id = a.id
GROUP BY dl.organization_id, dl.ai_agent_id, a.name, a.ai_risk_level;

COMMENT ON TABLE ai_decision_log IS 'Evidence chain for AI decisions - provides complete traceability for regulatory compliance';
COMMENT ON COLUMN ai_decision_log.input_hash IS 'SHA-256 hash of input_data for integrity verification';
COMMENT ON COLUMN ai_decision_log.output_hash IS 'SHA-256 hash of output_data for integrity verification';
COMMENT ON COLUMN ai_decision_log.reasoning IS 'Chain-of-thought or reasoning provided by model (if available)';
COMMENT ON COLUMN ai_decision_log.key_factors IS 'JSON array of factors that influenced the decision';
COMMENT ON COLUMN ai_decision_log.correlation_id IS 'Links AI decision to business transaction for end-to-end traceability';
COMMENT ON COLUMN ai_decision_log.human_reviewed IS 'EU AI Act requirement: high-risk AI requires human oversight';
