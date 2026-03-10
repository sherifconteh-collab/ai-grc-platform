-- Migration 010: Assessment Procedures (NIST 800-53A and equivalent)
-- Stores structured testing/assessment procedures for SCAs and auditors

-- Assessment Procedures table
CREATE TABLE IF NOT EXISTS assessment_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  procedure_id VARCHAR(100),         -- e.g. "AC-01(a)" or "A.5.1-01"
  procedure_type VARCHAR(50) NOT NULL, -- 'examine', 'interview', 'test', 'audit_step', 'inquiry', 'observation', 'inspection'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_evidence TEXT,             -- what the assessor expects to find
  assessment_method VARCHAR(50),      -- 'document_review', 'personnel_interview', 'system_test', 'observation', 'walkthrough'
  depth VARCHAR(20) DEFAULT 'basic',  -- 'basic', 'focused', 'comprehensive' (per NIST 800-53A depth levels)
  frequency_guidance TEXT,            -- how often this should be assessed
  assessor_notes TEXT,                -- guidance for the SCA
  source_document VARCHAR(255),       -- e.g. "NIST SP 800-53A Rev 5", "ISO 19011:2018"
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Assessment Results table (track actual assessment outcomes)
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_procedure_id UUID NOT NULL REFERENCES assessment_procedures(id) ON DELETE CASCADE,
  assessor_id UUID REFERENCES users(id),
  status VARCHAR(50) NOT NULL DEFAULT 'not_assessed', -- 'not_assessed', 'satisfied', 'other_than_satisfied', 'not_applicable'
  finding TEXT,
  evidence_collected TEXT,
  risk_level VARCHAR(20),             -- 'critical', 'high', 'medium', 'low', 'info'
  remediation_required BOOLEAN DEFAULT FALSE,
  remediation_deadline DATE,
  assessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Assessment Plans (group procedures into assessment plans)
CREATE TABLE IF NOT EXISTS assessment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  framework_id UUID REFERENCES frameworks(id),
  assessment_type VARCHAR(50) DEFAULT 'initial', -- 'initial', 'annual', 'continuous', 'ad_hoc'
  depth VARCHAR(20) DEFAULT 'focused',           -- 'basic', 'focused', 'comprehensive'
  status VARCHAR(50) DEFAULT 'draft',            -- 'draft', 'in_progress', 'completed', 'archived'
  lead_assessor_id UUID REFERENCES users(id),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Link procedures to assessment plans
CREATE TABLE IF NOT EXISTS assessment_plan_procedures (
  assessment_plan_id UUID REFERENCES assessment_plans(id) ON DELETE CASCADE,
  assessment_procedure_id UUID REFERENCES assessment_procedures(id) ON DELETE CASCADE,
  PRIMARY KEY (assessment_plan_id, assessment_procedure_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assessment_procedures_control
ON assessment_procedures(framework_control_id);

CREATE INDEX IF NOT EXISTS idx_assessment_procedures_type
ON assessment_procedures(procedure_type);

CREATE INDEX IF NOT EXISTS idx_assessment_results_org
ON assessment_results(organization_id);

CREATE INDEX IF NOT EXISTS idx_assessment_results_procedure
ON assessment_results(assessment_procedure_id);

CREATE INDEX IF NOT EXISTS idx_assessment_results_status
ON assessment_results(status);

CREATE INDEX IF NOT EXISTS idx_assessment_plans_org
ON assessment_plans(organization_id);

SELECT 'Migration 010 completed.' as result;
