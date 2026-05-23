-- Migration 100: AI Monitoring Compliance Layer (NIST AI 800-4 / 2026 alignment)
--
-- Background:
--   NIST AI 800-4 (2026) "Challenges to the Monitoring of Deployed AI Systems" identifies
--   that LLMOps/AgentOps tools only cover the OPERATIONAL layer (performance, latency,
--   errors, resource usage), while the COMPLIANCE layer remains entirely uncovered.
--
--   The compliance layer spans six functional categories:
--     1. fairness          — equitable outcomes across demographic groups
--     2. bias_detection    — identifying and flagging biased AI outputs
--     3. ethical_ai        — adherence to ethical principles and value alignment
--     4. human_factors     — human oversight, override capability, and intervention
--     5. societal_impact   — broader societal consequences and indirect harms
--     6. regulatory_adherence — compliance with applicable AI frameworks and laws
--
--   This migration adds `monitoring_category` to ai_monitoring_rules so each rule can
--   be classified as either an operational (LLMOps) or compliance-layer rule, enabling
--   the platform to report coverage across the six NIST AI 800-4 categories and surface
--   gaps directly to compliance teams.

-- Step 1: Add monitoring_category column
ALTER TABLE ai_monitoring_rules
  ADD COLUMN IF NOT EXISTS monitoring_category VARCHAR(50) NOT NULL DEFAULT 'operational';

-- Step 2: Add check constraint for valid categories
--
-- SYNC REQUIREMENT: The values in this constraint must stay in sync with:
--   • COMPLIANCE_MONITORING_CATEGORIES in backend/src/routes/aiMonitoring.js
--   • The categories CTE VALUES list in the view defined in Step 4 below
-- A startup validator (validateCategorySync in aiMonitoring.js) queries this
-- constraint at runtime and warns when it diverges from the JS constant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_monitoring_rules_category_check'
      AND conrelid = 'ai_monitoring_rules'::regclass
  ) THEN
    ALTER TABLE ai_monitoring_rules
      ADD CONSTRAINT ai_monitoring_rules_category_check
      CHECK (monitoring_category IN (
        'operational',
        'fairness',
        'bias_detection',
        'ethical_ai',
        'human_factors',
        'societal_impact',
        'regulatory_adherence'
      ));
  END IF;
END$$;

-- Step 3: Add index for coverage queries
-- Partial index: fast path for queries that filter WHERE is_enabled = true
CREATE INDEX IF NOT EXISTS idx_ai_monitoring_rules_category
  ON ai_monitoring_rules (organization_id, monitoring_category)
  WHERE is_enabled = true;

-- Covering index: supports the ai_compliance_monitoring_coverage view JOIN which
-- groups on (organization_id, monitoring_category) and reads is_enabled +
-- last_triggered_at without a WHERE filter on is_enabled.
CREATE INDEX IF NOT EXISTS idx_ai_monitoring_rules_org_cat_coverage
  ON ai_monitoring_rules (organization_id, monitoring_category)
  INCLUDE (is_enabled, last_triggered_at);

-- Step 4: Create view for compliance-layer coverage reporting
-- Returns one row per organization per NIST AI 800-4 category showing rule count,
-- enabled rule count, and latest trigger timestamp.
--
-- SYNC REQUIREMENT: The VALUES list below must stay in sync with:
--   • The CHECK constraint values defined in Step 2 above
--   • COMPLIANCE_MONITORING_CATEGORIES in backend/src/routes/aiMonitoring.js
CREATE OR REPLACE VIEW ai_compliance_monitoring_coverage AS
WITH categories(category) AS (
  VALUES
    ('fairness'),
    ('bias_detection'),
    ('ethical_ai'),
    ('human_factors'),
    ('societal_impact'),
    ('regulatory_adherence')
),
orgs_with_rules AS (
  SELECT DISTINCT organization_id FROM ai_monitoring_rules
),
base AS (
  SELECT
    oc.organization_id,
    c.category,
    COUNT(amr.id)                                           AS total_rules,
    COUNT(amr.id) FILTER (WHERE amr.is_enabled = true)     AS enabled_rules,
    MAX(amr.last_triggered_at)                             AS last_triggered_at,
    COUNT(amr.id) FILTER (WHERE amr.is_enabled = true) > 0 AS is_covered
  FROM orgs_with_rules oc
  CROSS JOIN categories c
  LEFT JOIN ai_monitoring_rules amr
    ON amr.organization_id = oc.organization_id
   AND amr.monitoring_category = c.category
  GROUP BY oc.organization_id, c.category
)
SELECT * FROM base;
