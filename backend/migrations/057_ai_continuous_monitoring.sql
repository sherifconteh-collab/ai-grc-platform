-- Migration 057: AI Continuous Monitoring and Runtime Governance
-- Adds real-time monitoring, runtime policy enforcement, and anomaly detection
-- capabilities to support Gartner 2026 AI governance market requirements

DO $$
BEGIN

  -- -----------------------------------------------------------------------
  -- ai_monitoring_rules: Define monitoring rules for AI systems
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_monitoring_rules') THEN
    CREATE TABLE ai_monitoring_rules (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      
      -- Rule definition
      rule_name             VARCHAR(255) NOT NULL,
      rule_type             VARCHAR(50) NOT NULL, -- 'threshold', 'pattern', 'anomaly', 'policy_violation'
      description           TEXT,
      
      -- Scope
      ai_agent_id           UUID REFERENCES assets(id) ON DELETE CASCADE, -- NULL = applies to all agents
      framework_control_ids JSONB DEFAULT '[]', -- Array of framework_control UUIDs
      
      -- Monitoring parameters
      metric_name           VARCHAR(100), -- 'confidence_score', 'processing_time', 'error_rate', 'bias_score'
      threshold_value       DECIMAL(10,4),
      threshold_operator    VARCHAR(10), -- 'gt', 'lt', 'eq', 'gte', 'lte'
      pattern_regex         TEXT,
      evaluation_window_sec INTEGER DEFAULT 300, -- 5 minutes default
      
      -- Actions on violation
      alert_severity        VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
      block_on_violation    BOOLEAN DEFAULT false, -- Preventive control
      require_human_review  BOOLEAN DEFAULT false,
      notification_targets  JSONB DEFAULT '[]', -- Array of user IDs or email addresses
      
      -- Status
      is_enabled            BOOLEAN DEFAULT true,
      last_triggered_at     TIMESTAMPTZ,
      trigger_count         INTEGER DEFAULT 0,
      
      -- Audit
      created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_ai_mon_rules_org_id ON ai_monitoring_rules (organization_id);
    CREATE INDEX idx_ai_mon_rules_agent_id ON ai_monitoring_rules (ai_agent_id);
    CREATE INDEX idx_ai_mon_rules_enabled ON ai_monitoring_rules (organization_id, is_enabled) WHERE is_enabled = true;
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_monitoring_events: Real-time event log for monitoring violations
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_monitoring_events') THEN
    CREATE TABLE ai_monitoring_events (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      
      -- Event context
      rule_id               UUID REFERENCES ai_monitoring_rules(id) ON DELETE SET NULL,
      ai_agent_id           UUID REFERENCES assets(id) ON DELETE CASCADE,
      decision_log_id       UUID REFERENCES ai_decision_log(id) ON DELETE CASCADE,
      
      -- Event details
      event_type            VARCHAR(50) NOT NULL, -- 'threshold_exceeded', 'pattern_match', 'anomaly_detected', 'policy_violation'
      severity              VARCHAR(20) NOT NULL,
      metric_name           VARCHAR(100),
      metric_value          DECIMAL(10,4),
      threshold_value       DECIMAL(10,4),
      
      -- Description and context
      event_summary         TEXT NOT NULL,
      event_details         JSONB DEFAULT '{}',
      
      -- Response tracking
      blocked               BOOLEAN DEFAULT false,
      requires_review       BOOLEAN DEFAULT false,
      reviewed              BOOLEAN DEFAULT false,
      reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at           TIMESTAMPTZ,
      review_decision       VARCHAR(50), -- 'approved', 'rejected', 'escalated', 'false_positive'
      review_notes          TEXT,
      
      -- Resolution
      status                VARCHAR(50) DEFAULT 'open', -- 'open', 'acknowledged', 'resolved', 'false_positive'
      resolved_at           TIMESTAMPTZ,
      resolved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
      resolution_notes      TEXT,
      
      -- Audit
      detected_at           TIMESTAMPTZ DEFAULT NOW(),
      created_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_ai_mon_events_org_id ON ai_monitoring_events (organization_id);
    CREATE INDEX idx_ai_mon_events_rule_id ON ai_monitoring_events (rule_id);
    CREATE INDEX idx_ai_mon_events_agent_id ON ai_monitoring_events (ai_agent_id);
    CREATE INDEX idx_ai_mon_events_status ON ai_monitoring_events (organization_id, status) WHERE status = 'open';
    CREATE INDEX idx_ai_mon_events_severity ON ai_monitoring_events (organization_id, severity, detected_at DESC);
    CREATE INDEX idx_ai_mon_events_time ON ai_monitoring_events (detected_at DESC);
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_anomaly_baselines: ML-based anomaly detection baselines
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_anomaly_baselines') THEN
    CREATE TABLE ai_anomaly_baselines (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      ai_agent_id           UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      
      -- Baseline metrics (statistical)
      metric_name           VARCHAR(100) NOT NULL,
      sample_size           INTEGER NOT NULL,
      mean_value            DECIMAL(10,4),
      std_deviation         DECIMAL(10,4),
      min_value             DECIMAL(10,4),
      max_value             DECIMAL(10,4),
      percentile_50         DECIMAL(10,4),
      percentile_95         DECIMAL(10,4),
      percentile_99         DECIMAL(10,4),
      
      -- Baseline period
      baseline_start        TIMESTAMPTZ NOT NULL,
      baseline_end          TIMESTAMPTZ NOT NULL,
      
      -- Anomaly detection settings
      sensitivity           VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high'
      z_score_threshold     DECIMAL(5,2) DEFAULT 3.0, -- Standard deviations from mean
      
      -- Status
      is_active             BOOLEAN DEFAULT true,
      last_calculated_at    TIMESTAMPTZ DEFAULT NOW(),
      
      -- Audit
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW(),
      
      UNIQUE (organization_id, ai_agent_id, metric_name)
    );

    CREATE INDEX idx_ai_anomaly_baselines_org_agent ON ai_anomaly_baselines (organization_id, ai_agent_id);
    CREATE INDEX idx_ai_anomaly_baselines_active ON ai_anomaly_baselines (organization_id, is_active) WHERE is_active = true;
  END IF;

  -- -----------------------------------------------------------------------
  -- Add continuous monitoring fields to ai_boms
  -- -----------------------------------------------------------------------
  ALTER TABLE ai_boms
    ADD COLUMN IF NOT EXISTS continuous_monitoring_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS monitoring_frequency_sec INTEGER DEFAULT 300,
    ADD COLUMN IF NOT EXISTS last_monitoring_check TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS monitoring_status VARCHAR(50) DEFAULT 'inactive'; -- 'inactive', 'active', 'paused', 'error'

  COMMENT ON COLUMN ai_boms.continuous_monitoring_enabled IS
    'When true, AI system is under continuous real-time monitoring per Gartner 2026 requirements';
  COMMENT ON COLUMN ai_boms.monitoring_frequency_sec IS
    'Frequency of monitoring checks in seconds (default 300 = 5 minutes)';

  -- -----------------------------------------------------------------------
  -- Create materialized view for real-time monitoring dashboard
  -- -----------------------------------------------------------------------
  CREATE MATERIALIZED VIEW IF NOT EXISTS ai_monitoring_dashboard_summary AS
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    COUNT(DISTINCT ab.id) as total_ai_systems,
    COUNT(DISTINCT ab.id) FILTER (WHERE ab.continuous_monitoring_enabled = true) as monitored_systems,
    COUNT(DISTINCT amr.id) FILTER (WHERE amr.is_enabled = true) as active_rules,
    COUNT(ame.id) FILTER (WHERE ame.detected_at > NOW() - INTERVAL '24 hours') as events_last_24h,
    COUNT(ame.id) FILTER (WHERE ame.status = 'open') as open_events,
    COUNT(ame.id) FILTER (WHERE ame.severity = 'critical' AND ame.status = 'open') as critical_open_events,
    COUNT(ame.id) FILTER (WHERE ame.severity = 'high' AND ame.status = 'open') as high_open_events,
    MAX(ame.detected_at) as last_event_time
  FROM organizations o
  LEFT JOIN ai_boms ab ON ab.organization_id = o.id AND ab.is_active = true
  LEFT JOIN ai_monitoring_rules amr ON amr.organization_id = o.id
  LEFT JOIN ai_monitoring_events ame ON ame.organization_id = o.id
  GROUP BY o.id, o.name;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_mon_dash_summary_org ON ai_monitoring_dashboard_summary (organization_id);

  -- Refresh policy: Manual refresh via API endpoint
  COMMENT ON MATERIALIZED VIEW ai_monitoring_dashboard_summary IS
    'Real-time AI monitoring summary for dashboard - refresh every 5 minutes via cron or API trigger';

END $$;

SELECT 'Migration 057 completed: AI continuous monitoring infrastructure ready' AS result;
