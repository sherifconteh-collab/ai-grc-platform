-- Migration 100: Desktop schema reconcile
-- Normalizes existing installs onto the canonical desktop schema used by the
-- packaged Electron app, AI decision-log routes, and risk scoring service.

CREATE TABLE IF NOT EXISTS external_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(64) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature VARCHAR(100) NOT NULL,
  input_data JSONB,
  input_hash VARCHAR(64),
  output_data JSONB,
  output_hash VARCHAR(64),
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  regulatory_framework VARCHAR(100),
  model_version VARCHAR(100),
  correlation_id TEXT,
  session_id TEXT,
  processing_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  bias_flags JSONB DEFAULT '[]'::jsonb,
  bias_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  bias_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  bias_review_timestamp TIMESTAMP,
  human_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  review_outcome VARCHAR(30),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_timestamp TIMESTAMP,
  review_date TIMESTAMP,
  review_notes TEXT,
  approved_by VARCHAR(255),
  reasoning TEXT,
  confidence_score NUMERIC(5,4),
  decision_source VARCHAR(20) NOT NULL DEFAULT 'platform',
  data_lineage TEXT,
  fairness_notes TEXT,
  bias_score FLOAT,
  external_provider VARCHAR(100),
  external_model VARCHAR(255),
  external_decision_id VARCHAR(255),
  external_api_key_id UUID REFERENCES external_api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS feature VARCHAR(100),
  ADD COLUMN IF NOT EXISTS input_data JSONB,
  ADD COLUMN IF NOT EXISTS input_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS output_data JSONB,
  ADD COLUMN IF NOT EXISTS output_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS regulatory_framework VARCHAR(100),
  ADD COLUMN IF NOT EXISTS model_version VARCHAR(100),
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_timestamp TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS bias_flags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bias_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bias_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bias_review_timestamp TIMESTAMP,
  ADD COLUMN IF NOT EXISTS human_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_outcome VARCHAR(30),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_timestamp TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reasoning TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS decision_source VARCHAR(20) DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS data_lineage TEXT,
  ADD COLUMN IF NOT EXISTS fairness_notes TEXT,
  ADD COLUMN IF NOT EXISTS bias_score FLOAT,
  ADD COLUMN IF NOT EXISTS external_provider VARCHAR(100),
  ADD COLUMN IF NOT EXISTS external_model VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_decision_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_api_key_id UUID REFERENCES external_api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ai_decision_log' AND column_name = 'ai_agent_id'
  ) THEN
    EXECUTE 'ALTER TABLE ai_decision_log ALTER COLUMN ai_agent_id DROP NOT NULL';
  END IF;
END $$;

UPDATE ai_decision_log
SET feature = COALESCE(NULLIF(feature, ''), 'legacy')
WHERE feature IS NULL
   OR feature = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ai_decision_log' AND column_name = 'risk_assessment'
  ) THEN
    EXECUTE $sql$
      UPDATE ai_decision_log
      SET risk_level = CASE LOWER(COALESCE(risk_assessment::text, risk_level, 'low'))
        WHEN 'unacceptable' THEN 'critical'
        WHEN 'critical' THEN 'critical'
        WHEN 'high' THEN 'high'
        WHEN 'medium' THEN 'medium'
        WHEN 'limited' THEN 'limited'
        WHEN 'minimal' THEN 'low'
        WHEN 'low' THEN 'low'
        ELSE 'low'
      END
      WHERE risk_level IS NULL
         OR risk_level NOT IN ('limited', 'low', 'medium', 'high', 'critical')
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE ai_decision_log
      SET risk_level = 'low'
      WHERE risk_level IS NULL
         OR risk_level NOT IN ('limited', 'low', 'medium', 'high', 'critical')
    $sql$;
  END IF;
END $$;

UPDATE ai_decision_log
SET bias_flags = COALESCE(bias_flags, '[]'::jsonb),
    decision_source = CASE LOWER(COALESCE(decision_source, 'platform'))
      WHEN 'mcp_agent' THEN 'platform'
      WHEN 'platform' THEN 'platform'
      WHEN 'byok' THEN 'byok'
      WHEN 'external' THEN 'external'
      ELSE 'platform'
    END,
    processing_timestamp = COALESCE(processing_timestamp, created_at, NOW()),
    created_at = COALESCE(created_at, processing_timestamp, NOW()),
    updated_at = COALESCE(updated_at, created_at, processing_timestamp, NOW());

ALTER TABLE ai_decision_log
  ALTER COLUMN feature SET DEFAULT 'legacy',
  ALTER COLUMN feature SET NOT NULL,
  ALTER COLUMN risk_level SET DEFAULT 'low',
  ALTER COLUMN risk_level SET NOT NULL,
  ALTER COLUMN decision_source SET DEFAULT 'platform',
  ALTER COLUMN decision_source SET NOT NULL,
  ALTER COLUMN bias_reviewed SET DEFAULT FALSE,
  ALTER COLUMN human_reviewed SET DEFAULT FALSE,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN processing_timestamp SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_decision_log_decision_source_check'
  ) THEN
    ALTER TABLE ai_decision_log
      ADD CONSTRAINT ai_decision_log_decision_source_check
      CHECK (decision_source IN ('platform', 'byok', 'external'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_decision_log_org_feature
  ON ai_decision_log(organization_id, feature);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_risk_level
  ON ai_decision_log(organization_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_correlation
  ON ai_decision_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_session
  ON ai_decision_log(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_decision_source
  ON ai_decision_log(decision_source, processing_timestamp DESC);

CREATE TABLE IF NOT EXISTS risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  overall_risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_grade VARCHAR(4),
  control_implementation_score NUMERIC(5,2),
  vulnerability_score NUMERIC(5,2),
  evidence_freshness_score NUMERIC(5,2),
  assessment_coverage_score NUMERIC(5,2),
  critical_gaps_count INTEGER NOT NULL DEFAULT 0,
  high_priority_gaps_count INTEGER NOT NULL DEFAULT 0,
  unpatched_critical_vulns INTEGER NOT NULL DEFAULT 0,
  overdue_assessments INTEGER NOT NULL DEFAULT 0,
  trend_direction VARCHAR(20),
  previous_score NUMERIC(5,2),
  score_change NUMERIC(5,2),
  predicted_score_30d NUMERIC(5,2),
  predicted_score_60d NUMERIC(5,2),
  predicted_score_90d NUMERIC(5,2),
  calculation_method VARCHAR(50) NOT NULL DEFAULT 'weighted_aggregate',
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE risk_scores
  ADD COLUMN IF NOT EXISTS overall_risk_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_grade VARCHAR(4),
  ADD COLUMN IF NOT EXISTS control_implementation_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vulnerability_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS evidence_freshness_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS assessment_coverage_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS critical_gaps_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_priority_gaps_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpatched_critical_vulns INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_assessments INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trend_direction VARCHAR(20),
  ADD COLUMN IF NOT EXISTS previous_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS score_change NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS predicted_score_30d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS predicted_score_60d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS predicted_score_90d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS calculation_method VARCHAR(50) DEFAULT 'weighted_aggregate',
  ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'risk_scores' AND column_name = 'overall_score'
  ) THEN
    EXECUTE $sql$
      UPDATE risk_scores
      SET overall_risk_score = COALESCE(overall_risk_score, overall_score)
      WHERE overall_risk_score IS NULL
    $sql$;
  END IF;
END $$;

UPDATE risk_scores
SET overall_risk_score = COALESCE(overall_risk_score, 0),
    critical_gaps_count = COALESCE(critical_gaps_count, 0),
    high_priority_gaps_count = COALESCE(high_priority_gaps_count, 0),
    unpatched_critical_vulns = COALESCE(unpatched_critical_vulns, 0),
    overdue_assessments = COALESCE(overdue_assessments, 0),
    calculation_method = COALESCE(NULLIF(calculation_method, ''), 'weighted_aggregate'),
    calculated_at = COALESCE(calculated_at, created_at, NOW()),
    created_at = COALESCE(created_at, calculated_at, NOW()),
    updated_at = COALESCE(updated_at, created_at, calculated_at, NOW());

ALTER TABLE risk_scores
  ALTER COLUMN overall_risk_score SET DEFAULT 0,
  ALTER COLUMN overall_risk_score SET NOT NULL,
  ALTER COLUMN critical_gaps_count SET DEFAULT 0,
  ALTER COLUMN critical_gaps_count SET NOT NULL,
  ALTER COLUMN high_priority_gaps_count SET DEFAULT 0,
  ALTER COLUMN high_priority_gaps_count SET NOT NULL,
  ALTER COLUMN unpatched_critical_vulns SET DEFAULT 0,
  ALTER COLUMN unpatched_critical_vulns SET NOT NULL,
  ALTER COLUMN overdue_assessments SET DEFAULT 0,
  ALTER COLUMN overdue_assessments SET NOT NULL,
  ALTER COLUMN calculation_method SET DEFAULT 'weighted_aggregate',
  ALTER COLUMN calculation_method SET NOT NULL,
  ALTER COLUMN calculated_at SET DEFAULT NOW(),
  ALTER COLUMN calculated_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_risk_scores_org_calculated_at
  ON risk_scores(organization_id, calculated_at DESC);

ALTER TABLE IF EXISTS regulatory_impact_assessments
  ADD COLUMN IF NOT EXISTS framework_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS change_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS change_title VARCHAR(500),
  ADD COLUMN IF NOT EXISTS change_description TEXT,
  ADD COLUMN IF NOT EXISTS impact_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS estimated_effort_hours INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS regulation_effective_date DATE,
  ADD COLUMN IF NOT EXISTS compliance_deadline DATE,
  ADD COLUMN IF NOT EXISTS days_to_comply INTEGER,
  ADD COLUMN IF NOT EXISTS business_impact TEXT,
  ADD COLUMN IF NOT EXISTS technical_requirements TEXT,
  ADD COLUMN IF NOT EXISTS gap_analysis TEXT,
  ADD COLUMN IF NOT EXISTS recommended_actions TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE IF EXISTS remediation_plans
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
  ADD COLUMN IF NOT EXISTS remediation_steps JSONB,
  ADD COLUMN IF NOT EXISTS required_resources TEXT[],
  ADD COLUMN IF NOT EXISTS dependencies TEXT[],
  ADD COLUMN IF NOT EXISTS expected_benefits TEXT,
  ADD COLUMN IF NOT EXISTS roi_analysis TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS poam_approval_requests
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES frameworks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supporting_evidence_ids UUID[],
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poam_approval_requests') THEN
    UPDATE poam_approval_requests
    SET created_at = COALESCE(created_at, submitted_at, NOW())
    WHERE created_at IS NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS policy_monitoring_alerts
  ADD COLUMN IF NOT EXISTS policy_reference_id UUID REFERENCES policy_references(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

ALTER TABLE IF EXISTS policy_uploads
  ADD COLUMN IF NOT EXISTS upload_date TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policy_uploads') THEN
    UPDATE policy_uploads
    SET upload_date = COALESCE(upload_date, created_at, NOW())
    WHERE upload_date IS NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS policy_control_gaps
  ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policy_control_gaps') THEN
    UPDATE policy_control_gaps
    SET reviewed = COALESCE(reviewed, FALSE)
    WHERE reviewed IS NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS regulatory_news_items
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS relevant_frameworks TEXT[],
  ADD COLUMN IF NOT EXISTS impact_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regulatory_news_items') THEN
    UPDATE regulatory_news_items
    SET content = COALESCE(content, body),
        url = COALESCE(url, source_url, CONCAT('legacy://regulatory-news/', id::text)),
        keywords = COALESCE(keywords, tags),
        is_archived = COALESCE(is_archived, FALSE),
        source = COALESCE(NULLIF(source, ''), category, 'unknown'),
        published_at = COALESCE(published_at, created_at, NOW()),
        created_at = COALESCE(created_at, NOW()),
        updated_at = COALESCE(updated_at, created_at, NOW())
    WHERE content IS NULL
       OR url IS NULL
       OR keywords IS NULL
       OR is_archived IS NULL
       OR source IS NULL
       OR source = ''
       OR published_at IS NULL
       OR created_at IS NULL
       OR updated_at IS NULL;
  END IF;
END $$;

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

ALTER TABLE ai_reasoning_memory
  ADD COLUMN IF NOT EXISTS input_summary TEXT,
  ADD COLUMN IF NOT EXISTS output_summary TEXT,
  ADD COLUMN IF NOT EXISTS key_findings TEXT,
  ADD COLUMN IF NOT EXISTS keywords TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

UPDATE ai_reasoning_memory
SET feature = COALESCE(NULLIF(feature, ''), 'legacy'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, NOW());

ALTER TABLE ai_reasoning_memory
  ALTER COLUMN feature SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_reasoning_memory_org_feature
  ON ai_reasoning_memory(organization_id, feature);
CREATE INDEX IF NOT EXISTS idx_ai_reasoning_memory_created
  ON ai_reasoning_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reasoning_memory_org_created
  ON ai_reasoning_memory(organization_id, created_at DESC);

SELECT 'Migration 100 completed.' AS result;
