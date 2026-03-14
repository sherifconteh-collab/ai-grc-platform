-- Migration 067: Vendor security scores
-- Supports SecurityScorecard and BitSight integrations

CREATE TABLE IF NOT EXISTS vendor_security_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_domain VARCHAR(255),
  score_provider VARCHAR(50) NOT NULL CHECK (score_provider IN ('securityscorecard', 'bitsight')),
  score_value INTEGER CHECK (score_value >= 0),
  score_grade VARCHAR(5),
  score_date DATE NOT NULL,
  risk_factors JSONB DEFAULT '{}',
  findings_summary JSONB DEFAULT '{}',
  previous_score INTEGER,
  score_trend VARCHAR(20) CHECK (score_trend IN ('improving', 'stable', 'declining', 'new')),
  assessment_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_scores_org ON vendor_security_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_vendor ON vendor_security_scores(vendor_name);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_domain ON vendor_security_scores(vendor_domain);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_provider ON vendor_security_scores(score_provider);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_date ON vendor_security_scores(score_date DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_value ON vendor_security_scores(score_value);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_trend ON vendor_security_scores(score_trend);
CREATE INDEX IF NOT EXISTS idx_vendor_scores_risk ON vendor_security_scores USING GIN(risk_factors);

COMMENT ON TABLE vendor_security_scores IS 'Third-party vendor security ratings and risk scores';
COMMENT ON COLUMN vendor_security_scores.score_provider IS 'Provider: securityscorecard (A-F scale) or bitsight (250-900 scale)';
COMMENT ON COLUMN vendor_security_scores.score_value IS 'Numeric score (0-100 for SSC, 250-900 for BitSight)';
COMMENT ON COLUMN vendor_security_scores.score_grade IS 'Letter grade (A-F) for SecurityScorecard';
COMMENT ON COLUMN vendor_security_scores.risk_factors IS 'Detailed risk factor breakdown';
COMMENT ON COLUMN vendor_security_scores.findings_summary IS 'Summary of security findings';

SELECT 'Migration 067 completed.' AS result;
