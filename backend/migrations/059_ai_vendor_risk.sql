-- Migration 059: Third-Party AI Vendor Risk Management
-- Enhanced vendor risk assessment for AI supply chain
-- Addresses Gartner 2026 requirement for third-party AI risk management

DO $$
BEGIN

  -- -----------------------------------------------------------------------
  -- ai_vendor_assessments: Comprehensive vendor risk evaluations
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_vendor_assessments') THEN
    CREATE TABLE ai_vendor_assessments (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      
      -- Vendor identification
      vendor_name           VARCHAR(255) NOT NULL,
      vendor_type           VARCHAR(50) NOT NULL, -- 'llm_provider', 'ml_platform', 'data_provider', 'ai_tool', 'consulting'
      vendor_website        TEXT,
      vendor_contact        TEXT,
      
      -- Assessment metadata
      assessment_date       DATE NOT NULL DEFAULT CURRENT_DATE,
      assessed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
      assessment_type       VARCHAR(50) DEFAULT 'initial', -- 'initial', 'periodic', 'change_triggered'
      next_assessment_date  DATE,
      
      -- Risk scoring (0-100)
      overall_risk_score    INTEGER CHECK (overall_risk_score >= 0 AND overall_risk_score <= 100),
      risk_level            VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
      
      -- Risk dimension scores
      security_risk_score   INTEGER CHECK (security_risk_score >= 0 AND security_risk_score <= 100),
      privacy_risk_score    INTEGER CHECK (privacy_risk_score >= 0 AND privacy_risk_score <= 100),
      compliance_risk_score INTEGER CHECK (compliance_risk_score >= 0 AND compliance_risk_score <= 100),
      operational_risk_score INTEGER CHECK (operational_risk_score >= 0 AND operational_risk_score <= 100),
      financial_risk_score  INTEGER CHECK (financial_risk_score >= 0 AND financial_risk_score <= 100),
      
      -- AI-specific risk factors
      model_transparency    VARCHAR(20), -- 'high', 'medium', 'low', 'none'
      bias_testing_evidence BOOLEAN DEFAULT false,
      explainability_capability VARCHAR(20), -- 'high', 'medium', 'low', 'none'
      adversarial_robustness VARCHAR(20), -- 'strong', 'moderate', 'weak', 'unknown'
      data_provenance_clarity VARCHAR(20), -- 'clear', 'partial', 'unclear', 'undisclosed'
      
      -- Compliance attributes
      certifications        JSONB DEFAULT '[]', -- ['SOC 2', 'ISO 27001', 'ISO 42001']
      compliant_frameworks  JSONB DEFAULT '[]', -- ['GDPR', 'EU AI Act', 'NIST AI RMF']
      data_residency_options JSONB DEFAULT '[]', -- ['US', 'EU', 'UK']
      subprocessors         JSONB DEFAULT '[]', -- Array of sub-vendor names
      
      -- Contract details
      contract_start_date   DATE,
      contract_end_date     DATE,
      contract_value_annual DECIMAL(12,2),
      sla_uptime_guarantee  DECIMAL(5,2), -- e.g., 99.9
      data_retention_days   INTEGER,
      
      -- Business context
      business_criticality  VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
      data_sensitivity      VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
      usage_volume          VARCHAR(20), -- 'low', 'medium', 'high'
      affected_systems      JSONB DEFAULT '[]', -- Array of system names/IDs
      
      -- Risk treatment
      risk_acceptance_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'mitigated', 'transferred', 'avoided'
      risk_acceptance_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      risk_acceptance_date  DATE,
      risk_mitigation_plan  TEXT,
      
      -- Findings and recommendations
      key_findings          TEXT,
      recommendations       TEXT,
      follow_up_actions     JSONB DEFAULT '[]',
      
      -- Status
      status                VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'terminated', 'under_review'
      
      -- Audit
      notes                 TEXT,
      metadata              JSONB DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_ai_vendor_assessments_org ON ai_vendor_assessments (organization_id);
    CREATE INDEX idx_ai_vendor_assessments_vendor ON ai_vendor_assessments (vendor_name);
    CREATE INDEX idx_ai_vendor_assessments_risk ON ai_vendor_assessments (organization_id, risk_level);
    CREATE INDEX idx_ai_vendor_assessments_status ON ai_vendor_assessments (organization_id, status);
    CREATE INDEX idx_ai_vendor_assessments_next_date ON ai_vendor_assessments (next_assessment_date) WHERE status = 'active';
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_supply_chain_components: Track AI supply chain dependencies
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_supply_chain_components') THEN
    CREATE TABLE ai_supply_chain_components (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      
      -- Component identification
      component_name        VARCHAR(255) NOT NULL,
      component_type        VARCHAR(50) NOT NULL, -- 'model', 'dataset', 'library', 'infrastructure', 'api', 'tool'
      component_version     VARCHAR(100),
      
      -- Source information
      source_vendor_id      UUID REFERENCES ai_vendor_assessments(id) ON DELETE SET NULL,
      source_vendor_name    VARCHAR(255),
      source_url            TEXT,
      source_license        VARCHAR(255),
      
      -- Dependency mapping
      parent_component_id   UUID REFERENCES ai_supply_chain_components(id) ON DELETE CASCADE,
      used_by_assets        JSONB DEFAULT '[]', -- Array of asset UUIDs
      used_by_aiboms        JSONB DEFAULT '[]', -- Array of AIBOM UUIDs
      
      -- Risk attributes
      risk_level            VARCHAR(20) DEFAULT 'unknown', -- 'low', 'medium', 'high', 'critical', 'unknown'
      known_vulnerabilities INTEGER DEFAULT 0,
      latest_vuln_scan_date DATE,
      
      -- Compliance
      approved_for_use      BOOLEAN DEFAULT false,
      approval_date         DATE,
      approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
      restricted_use_cases  TEXT,
      
      -- Supply chain integrity
      provenance_verified   BOOLEAN DEFAULT false,
      checksum_hash         VARCHAR(128),
      signature_verified    BOOLEAN DEFAULT false,
      
      -- Status
      is_active             BOOLEAN DEFAULT true,
      end_of_life_date      DATE,
      replacement_component VARCHAR(255),
      
      -- Audit
      notes                 TEXT,
      metadata              JSONB DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_ai_supply_chain_org ON ai_supply_chain_components (organization_id);
    CREATE INDEX idx_ai_supply_chain_vendor ON ai_supply_chain_components (source_vendor_id);
    CREATE INDEX idx_ai_supply_chain_type ON ai_supply_chain_components (component_type);
    CREATE INDEX idx_ai_supply_chain_risk ON ai_supply_chain_components (organization_id, risk_level);
    CREATE INDEX idx_ai_supply_chain_active ON ai_supply_chain_components (organization_id, is_active) WHERE is_active = true;
    CREATE INDEX idx_ai_supply_chain_unapproved ON ai_supply_chain_components (organization_id, approved_for_use) WHERE approved_for_use = false;
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_vendor_incidents: Track vendor incidents and breaches
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_vendor_incidents') THEN
    CREATE TABLE ai_vendor_incidents (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      vendor_assessment_id  UUID REFERENCES ai_vendor_assessments(id) ON DELETE SET NULL,
      
      -- Incident details
      incident_date         DATE NOT NULL,
      incident_type         VARCHAR(50) NOT NULL, -- 'security_breach', 'data_leak', 'service_outage', 'compliance_violation', 'model_failure'
      severity              VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
      
      -- Description
      incident_summary      TEXT NOT NULL,
      incident_details      TEXT,
      affected_services     JSONB DEFAULT '[]',
      estimated_impact      TEXT,
      
      -- Vendor response
      vendor_notification_date DATE,
      vendor_response       TEXT,
      remediation_plan      TEXT,
      remediation_completed BOOLEAN DEFAULT false,
      remediation_date      DATE,
      
      -- Organizational response
      internal_response     TEXT,
      customer_notification_required BOOLEAN DEFAULT false,
      customers_notified    BOOLEAN DEFAULT false,
      regulatory_reporting_required BOOLEAN DEFAULT false,
      regulatory_reported   BOOLEAN DEFAULT false,
      
      -- Outcome
      status                VARCHAR(50) DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'closed'
      resolution_date       DATE,
      lessons_learned       TEXT,
      
      -- Audit
      reported_by           UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_ai_vendor_incidents_org ON ai_vendor_incidents (organization_id);
    CREATE INDEX idx_ai_vendor_incidents_vendor ON ai_vendor_incidents (vendor_assessment_id);
    CREATE INDEX idx_ai_vendor_incidents_date ON ai_vendor_incidents (incident_date DESC);
    CREATE INDEX idx_ai_vendor_incidents_severity ON ai_vendor_incidents (organization_id, severity, status);
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_vendor_performance_metrics: Track vendor SLA compliance
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_vendor_performance_metrics') THEN
    CREATE TABLE ai_vendor_performance_metrics (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      vendor_assessment_id  UUID NOT NULL REFERENCES ai_vendor_assessments(id) ON DELETE CASCADE,
      
      -- Measurement period
      period_start          DATE NOT NULL,
      period_end            DATE NOT NULL,
      
      -- Availability metrics
      uptime_percentage     DECIMAL(5,2), -- e.g., 99.95
      total_downtime_minutes INTEGER,
      incident_count        INTEGER DEFAULT 0,
      
      -- Performance metrics
      avg_response_time_ms  INTEGER,
      p95_response_time_ms  INTEGER,
      p99_response_time_ms  INTEGER,
      error_rate_percentage DECIMAL(5,2),
      
      -- Volume metrics
      total_requests        BIGINT DEFAULT 0,
      total_tokens_processed BIGINT DEFAULT 0,
      total_cost            DECIMAL(12,2),
      
      -- Quality metrics
      avg_quality_score     DECIMAL(3,2), -- 0.00 to 1.00
      user_satisfaction_score DECIMAL(3,2), -- 0.00 to 5.00
      
      -- Compliance
      sla_met               BOOLEAN DEFAULT true,
      sla_violations        JSONB DEFAULT '[]', -- Array of violation objects
      
      -- Status
      status                VARCHAR(50) DEFAULT 'current', -- 'current', 'historical'
      
      -- Audit
      calculated_at         TIMESTAMPTZ DEFAULT NOW(),
      calculated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
      notes                 TEXT,
      
      UNIQUE (vendor_assessment_id, period_start, period_end)
    );

    CREATE INDEX idx_ai_vendor_perf_org ON ai_vendor_performance_metrics (organization_id);
    CREATE INDEX idx_ai_vendor_perf_vendor ON ai_vendor_performance_metrics (vendor_assessment_id);
    CREATE INDEX idx_ai_vendor_perf_period ON ai_vendor_performance_metrics (period_start DESC, period_end DESC);
    CREATE INDEX idx_ai_vendor_perf_sla ON ai_vendor_performance_metrics (vendor_assessment_id, sla_met);
  END IF;

  -- -----------------------------------------------------------------------
  -- Create view for vendor risk dashboard
  -- -----------------------------------------------------------------------
  CREATE OR REPLACE VIEW ai_vendor_risk_summary AS
  SELECT
    ava.organization_id,
    ava.id as vendor_assessment_id,
    ava.vendor_name,
    ava.vendor_type,
    ava.overall_risk_score,
    ava.risk_level,
    ava.assessment_date,
    ava.next_assessment_date,
    ava.status,
    ava.business_criticality,
    COUNT(DISTINCT ascc.id) as supply_chain_components_count,
    COUNT(DISTINCT ascc.id) FILTER (WHERE ascc.known_vulnerabilities > 0) as components_with_vulns,
    COUNT(DISTINCT avi.id) as total_incidents,
    COUNT(DISTINCT avi.id) FILTER (WHERE avi.incident_date > CURRENT_DATE - INTERVAL '12 months') as incidents_last_12mo,
    COUNT(DISTINCT avi.id) FILTER (WHERE avi.severity IN ('high', 'critical') AND avi.status != 'closed') as open_critical_incidents,
    MAX(avpm.uptime_percentage) as latest_uptime_percentage,
    BOOL_OR(avpm.sla_met) as latest_sla_met,
    CASE 
      WHEN ava.next_assessment_date < CURRENT_DATE THEN 'overdue'
      WHEN ava.next_assessment_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_soon'
      ELSE 'current'
    END as assessment_status
  FROM ai_vendor_assessments ava
  LEFT JOIN ai_supply_chain_components ascc ON ascc.source_vendor_id = ava.id AND ascc.is_active = true
  LEFT JOIN ai_vendor_incidents avi ON avi.vendor_assessment_id = ava.id
  LEFT JOIN ai_vendor_performance_metrics avpm ON avpm.vendor_assessment_id = ava.id
  WHERE ava.status = 'active'
  GROUP BY 
    ava.organization_id, ava.id, ava.vendor_name, ava.vendor_type,
    ava.overall_risk_score, ava.risk_level, ava.assessment_date,
    ava.next_assessment_date, ava.status, ava.business_criticality;

  COMMENT ON VIEW ai_vendor_risk_summary IS
    'Comprehensive vendor risk dashboard with supply chain visibility and incident tracking';

END $$;

SELECT 'Migration 059 completed: Third-party AI vendor risk management infrastructure ready' AS result;
