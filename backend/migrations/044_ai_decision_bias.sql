-- Migration 044: Bias tracking fields on ai_decision_log
-- Adds bias_flags (JSONB array of detected bias signals), fairness notes,
-- and a human bias-review workflow aligned with EU AI Act requirements.

ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS bias_flags JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS fairness_notes TEXT,
  ADD COLUMN IF NOT EXISTS bias_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bias_reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS bias_review_timestamp TIMESTAMP;

-- Index for finding decisions with unreviewed bias flags
CREATE INDEX IF NOT EXISTS idx_ai_decision_bias_review
  ON ai_decision_log (organization_id, bias_reviewed, created_at DESC)
  WHERE bias_reviewed = false;

COMMENT ON COLUMN ai_decision_log.bias_flags IS
  'Array of detected bias signal objects: [{"type":"subjectivity","severity":"low","detail":"..."}]';
COMMENT ON COLUMN ai_decision_log.bias_reviewed IS
  'True when a human reviewer has assessed and cleared the bias_flags for this decision';
