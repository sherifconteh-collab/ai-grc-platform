-- Migration 057: Phase 6 AI-Powered Analysis - Risk Scoring and Impact Analysis
-- Created: 2025-02-18
-- Description: Adds predictive risk scoring (0-100) and regulatory impact analysis capabilities

-- Risk scores table: Stores calculated risk scores for organizations
CREATE TABLE IF NOT EXISTS risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Overall risk score (0-100)
  overall_risk_score NUMERIC(5,2) CHECK (overall_risk_score >= 0 AND overall_risk_score <= 100),
  risk_grade VARCHAR(4), -- A+, A, B, C, D, F
  
  -- Component scores
  control_implementation_score NUMERIC(5,2),
  vulnerability_score NUMERIC(5,2),
  evidence_freshness_score NUMERIC(5,2),
  assessment_coverage_score NUMERIC(5,2),
  
  -- Risk factors
  critical_gaps_count INTEGER DEFAULT 0,
  high_priority_gaps_count INTEGER DEFAULT 0,
  unpatched_critical_vulns INTEGER DEFAULT 0,
  overdue_assessments INTEGER DEFAULT 0,
  
  -- Trend data
  trend_direction VARCHAR(20), -- improving, declining, stable
  previous_score NUMERIC(5,2),
  score_change NUMERIC(5,2),
  
  -- Metadata
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  calculation_method VARCHAR(50) DEFAULT 'weighted_aggregate',
  ai_provider VARCHAR(50),
  
  -- Predictions
  predicted_score_30d NUMERIC(5,2),
  predicted_score_60d NUMERIC(5,2),
  predicted_score_90d NUMERIC(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE risk_scores
  ADD COLUMN IF NOT EXISTS overall_risk_score NUMERIC(5,2),
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
  ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS calculation_method VARCHAR(50) DEFAULT 'weighted_aggregate',
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS predicted_score_30d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS predicted_score_60d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS predicted_score_90d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Index for fast org lookups
CREATE INDEX IF NOT EXISTS idx_risk_scores_org_id ON risk_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_calculated_at ON risk_scores(organization_id, calculated_at DESC);

-- Regulatory impact assessments table
CREATE TABLE IF NOT EXISTS regulatory_impact_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Regulatory change details
  framework_code VARCHAR(50),
  change_type VARCHAR(50), -- new_requirement, updated_control, deprecated_control, enforcement_change
  change_title VARCHAR(500),
  change_description TEXT,
  
  -- Impact scoring
  impact_score NUMERIC(5,2) CHECK (impact_score >= 0 AND impact_score <= 100),
  impact_level VARCHAR(20), -- critical, high, medium, low, minimal
  
  -- Affected areas
  affected_controls TEXT[], -- Array of control IDs
  affected_systems TEXT[], -- Array of system names
  estimated_effort_hours INTEGER,
  estimated_cost NUMERIC(12,2),
  
  -- Timeline
  regulation_effective_date DATE,
  compliance_deadline DATE,
  days_to_comply INTEGER,
  
  -- Assessment details
  business_impact TEXT,
  technical_requirements TEXT,
  gap_analysis TEXT,
  recommended_actions TEXT,
  
  -- AI metadata
  ai_generated BOOLEAN DEFAULT true,
  ai_provider VARCHAR(50),
  ai_model VARCHAR(100),
  confidence_score NUMERIC(5,2),
  
  -- Review status
  review_status VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, approved, rejected
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE regulatory_impact_assessments
  ADD COLUMN IF NOT EXISTS framework_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS change_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS change_title VARCHAR(500),
  ADD COLUMN IF NOT EXISTS change_description TEXT,
  ADD COLUMN IF NOT EXISTS impact_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS affected_systems TEXT[],
  ADD COLUMN IF NOT EXISTS estimated_effort_hours INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS regulation_effective_date DATE,
  ADD COLUMN IF NOT EXISTS compliance_deadline DATE,
  ADD COLUMN IF NOT EXISTS days_to_comply INTEGER,
  ADD COLUMN IF NOT EXISTS business_impact TEXT,
  ADD COLUMN IF NOT EXISTS technical_requirements TEXT,
  ADD COLUMN IF NOT EXISTS gap_analysis TEXT,
  ADD COLUMN IF NOT EXISTS recommended_actions TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_regulatory_impact_org_id ON regulatory_impact_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_impact_framework ON regulatory_impact_assessments(framework_code);
CREATE INDEX IF NOT EXISTS idx_regulatory_impact_level ON regulatory_impact_assessments(organization_id, impact_level);
CREATE INDEX IF NOT EXISTS idx_regulatory_impact_deadline ON regulatory_impact_assessments(compliance_deadline);

-- Remediation plans table: Enhanced smart remediation tracking
CREATE TABLE IF NOT EXISTS remediation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Plan identification
  plan_name VARCHAR(500),
  plan_type VARCHAR(50), -- control_gap, vulnerability, assessment_finding, regulatory_change
  
  -- Related entities
  control_id UUID REFERENCES framework_controls(id),
  vulnerability_id UUID REFERENCES vulnerability_findings(id),
  impact_assessment_id UUID REFERENCES regulatory_impact_assessments(id),
  
  -- Priority and scoring
  priority_score NUMERIC(5,2) CHECK (priority_score >= 0 AND priority_score <= 100),
  priority_level VARCHAR(20), -- critical, high, medium, low
  risk_reduction NUMERIC(5,2), -- Expected risk reduction (0-100)
  
  -- Timeline estimation
  estimated_hours INTEGER,
  estimated_start_date DATE,
  estimated_completion_date DATE,
  actual_start_date DATE,
  actual_completion_date DATE,
  
  -- Plan details
  current_state TEXT,
  target_state TEXT,
  remediation_steps JSONB, -- Array of step objects with status, owner, etc.
  required_resources TEXT[],
  dependencies TEXT[],
  success_criteria TEXT,
  
  -- Cost-benefit
  estimated_cost NUMERIC(12,2),
  expected_benefits TEXT,
  roi_analysis TEXT,
  
  -- AI metadata
  ai_generated BOOLEAN DEFAULT true,
  ai_provider VARCHAR(50),
  ai_model VARCHAR(100),
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'draft', -- draft, approved, in_progress, completed, cancelled
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  
  -- Ownership
  assigned_to UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE remediation_plans
  ADD COLUMN IF NOT EXISTS control_id UUID REFERENCES framework_controls(id),
  ADD COLUMN IF NOT EXISTS vulnerability_id UUID REFERENCES vulnerability_findings(id),
  ADD COLUMN IF NOT EXISTS impact_assessment_id UUID REFERENCES regulatory_impact_assessments(id),
  ADD COLUMN IF NOT EXISTS risk_reduction NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
  ADD COLUMN IF NOT EXISTS remediation_steps JSONB,
  ADD COLUMN IF NOT EXISTS required_resources TEXT[],
  ADD COLUMN IF NOT EXISTS dependencies TEXT[],
  ADD COLUMN IF NOT EXISTS expected_benefits TEXT,
  ADD COLUMN IF NOT EXISTS roi_analysis TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_remediation_plans_org_id ON remediation_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_remediation_plans_control_id ON remediation_plans(control_id);
CREATE INDEX IF NOT EXISTS idx_remediation_plans_priority ON remediation_plans(organization_id, priority_level);
CREATE INDEX IF NOT EXISTS idx_remediation_plans_status ON remediation_plans(organization_id, status);

-- Add comment for documentation
COMMENT ON TABLE risk_scores IS 'Phase 6: Predictive risk scoring with 0-100 scale and trend analysis';
COMMENT ON TABLE regulatory_impact_assessments IS 'Phase 6: Automated regulatory impact analysis for compliance changes';
COMMENT ON TABLE remediation_plans IS 'Phase 6: Smart remediation plan generation with priority scoring and timeline estimation';
