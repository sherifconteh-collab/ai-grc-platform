-- 045_ai_decision_log_platform.sql
-- Adapt ai_decision_log to support both CMDB AI-agent decisions and platform LLM decisions.
--
-- Previously: ai_agent_id was NOT NULL and referenced assets (CMDB).
-- Now:        ai_agent_id is nullable so platform LLM decisions can be logged without a CMDB asset.
--             Added: feature (which LLM feature triggered this), risk_level (high/medium/low/limited).

-- Make ai_agent_id optional (platform AI has no CMDB asset)
ALTER TABLE ai_decision_log
  ALTER COLUMN ai_agent_id DROP NOT NULL;

-- Add feature column to track which LLM feature produced this decision
ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS feature VARCHAR(100);

-- Add risk_level shorthand alongside the existing risk_assessment JSONB
ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'limited';
