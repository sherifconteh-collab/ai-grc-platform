-- Migration 048: AI Decision Log Enhancements
-- Adds data lineage tracking, bias scoring, review workflow, and approval tracking
-- to support comprehensive AI governance and audit capabilities.

ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS data_lineage TEXT,
  ADD COLUMN IF NOT EXISTS bias_score FLOAT CHECK (bias_score >= 0.0 AND bias_score <= 1.0),
  ADD COLUMN IF NOT EXISTS review_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255);

-- Add index for review workflow queries
CREATE INDEX IF NOT EXISTS idx_ai_decision_review_date
  ON ai_decision_log (review_date DESC)
  WHERE review_date IS NOT NULL;

-- Add index for finding decisions by approver
CREATE INDEX IF NOT EXISTS idx_ai_decision_approved_by
  ON ai_decision_log (approved_by)
  WHERE approved_by IS NOT NULL;

COMMENT ON COLUMN ai_decision_log.data_lineage IS
  'Textual description of data sources and transformations applied to input data';
COMMENT ON COLUMN ai_decision_log.bias_score IS
  'Numerical bias score (0.0-1.0) indicating potential bias in decision, where higher values indicate greater bias risk';
COMMENT ON COLUMN ai_decision_log.review_date IS
  'Timestamp when the decision was formally reviewed for approval';
COMMENT ON COLUMN ai_decision_log.approved_by IS
  'Identifier of user or system that approved the decision';
