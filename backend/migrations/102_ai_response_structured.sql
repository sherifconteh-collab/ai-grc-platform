-- Migration 102: Structured AI response persistence
--
-- v3.0.0 introduced a new structured field on the AI response envelope
-- (validated JSON parsed against services/llmSchemas.js). This column lets
-- ai_decision_log retain the structured payload alongside the narrative text
-- so downstream consumers (dashboards, reports, exports) can render
-- cards/tables/checklists without re-parsing markdown.
--
-- The column is JSONB and nullable: pre-3.0.0 rows and chat / non-schema
-- features remain unaffected.

ALTER TABLE IF EXISTS ai_decision_log
  ADD COLUMN IF NOT EXISTS structured JSONB;

CREATE INDEX IF NOT EXISTS idx_ai_decision_log_structured_notnull
  ON ai_decision_log ((structured IS NOT NULL))
  WHERE structured IS NOT NULL;
