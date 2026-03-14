-- Migration 020: AI Governance and Risk Scores
-- Adds the AI decision audit trail, usage logging, contextual memory,
-- and the Organization risk-score time series.

-- ============================================================
-- PART 1: ai_decision_log
-- Full audit trail of AI model calls (for explainability & compliance)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_decision_log (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature               VARCHAR(100) NOT NULL,
  input_data            JSONB,
  input_hash            VARCHAR(64),          -- SHA-256 of input
  output_data           JSONB,
  output_hash           VARCHAR(64),          -- SHA-256 of output
  risk_level            VARCHAR(20)  NOT NULL DEFAULT 'low',
    -- limited / low / medium / high / critical
  regulatory_framework  VARCHAR(100),
  model_version         VARCHAR(100),
  correlation_id        UUID,
  session_id            UUID,
  processing_timestamp  TIMESTAMP    NOT NULL DEFAULT NOW(),
  bias_flags            JSONB,
  bias_reviewed         BOOLEAN      NOT NULL DEFAULT FALSE,
  bias_reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  bias_review_timestamp TIMESTAMP,
  human_reviewed        BOOLEAN      NOT NULL DEFAULT FALSE,
  review_outcome        VARCHAR(30),          -- approved / rejected / needs_revision
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  review_timestamp      TIMESTAMP,
  review_date           TIMESTAMP,
  review_notes          TEXT,
  approved_by           VARCHAR(255),
  reasoning             TEXT,
  confidence_score      NUMERIC(5,4),
  decision_source       VARCHAR(50)  NOT NULL DEFAULT 'mcp_agent',
  data_lineage          TEXT,
  fairness_notes        TEXT,
  created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adl_org
  ON ai_decision_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_adl_feature
  ON ai_decision_log(organization_id, feature);

CREATE INDEX IF NOT EXISTS idx_adl_risk
  ON ai_decision_log(organization_id, risk_level);

-- ============================================================
-- PART 2: ai_usage_log
-- Lightweight per-request token / cost tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  feature         VARCHAR(100),
  provider        VARCHAR(50),  -- claude / openai / gemini / grok / groq / ollama
  model           VARCHAR(100),
  success         BOOLEAN      NOT NULL DEFAULT TRUE,
  error_message   VARCHAR(500),
  tokens_input    INTEGER,
  tokens_output   INTEGER,
  duration_ms     INTEGER,
  byok_used       BOOLEAN      NOT NULL DEFAULT FALSE,
  ip_address      VARCHAR(45),
  resource_type   VARCHAR(50),
  resource_id     UUID,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aul_org
  ON ai_usage_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_aul_user
  ON ai_usage_log(user_id);

CREATE INDEX IF NOT EXISTS idx_aul_created
  ON ai_usage_log(organization_id, created_at DESC);

-- ============================================================
-- PART 3: ai_reasoning_memory
-- Contextual memory to improve AI response quality over time
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_reasoning_memory (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature         VARCHAR(100) NOT NULL,
  input_summary   TEXT,
  output_summary  TEXT,
  key_findings    TEXT,
  keywords        TEXT[],
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arm_org_feature
  ON ai_reasoning_memory(organization_id, feature);

-- ============================================================
-- PART 4: risk_scores
-- Periodic risk-score snapshots computed by the scoring service
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_scores (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  overall_risk_score         NUMERIC(5,1) NOT NULL DEFAULT 0,
  risk_grade                 VARCHAR(4),            -- A+ / A / … / F
  control_implementation_score NUMERIC(5,1),
  vulnerability_score        NUMERIC(5,1),
  evidence_freshness_score   NUMERIC(5,1),
  assessment_coverage_score  NUMERIC(5,1),
  critical_gaps_count        INTEGER      NOT NULL DEFAULT 0,
  high_priority_gaps_count   INTEGER      NOT NULL DEFAULT 0,
  unpatched_critical_vulns   INTEGER      NOT NULL DEFAULT 0,
  overdue_assessments        INTEGER      NOT NULL DEFAULT 0,
  trend_direction            VARCHAR(20),           -- improving / stable / declining
  previous_score             NUMERIC(5,1),
  score_change               NUMERIC(5,1),
  predicted_score_30d        NUMERIC(5,1),
  predicted_score_60d        NUMERIC(5,1),
  predicted_score_90d        NUMERIC(5,1),
  calculation_method         VARCHAR(50)  NOT NULL DEFAULT 'weighted_aggregate',
  calculated_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
  created_at                 TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_org
  ON risk_scores(organization_id, calculated_at DESC);

SELECT 'Migration 020 completed.' AS result;
