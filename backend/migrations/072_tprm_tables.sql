-- Migration 072: Third-Party Risk Management (TPRM) tables
-- Supports vendor registry, security questionnaires, documentation requests, and CMDB linkage

-- Vendor registry
CREATE TABLE IF NOT EXISTS tprm_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_website VARCHAR(255),
  vendor_contact_name VARCHAR(255),
  vendor_contact_email VARCHAR(255),
  vendor_type VARCHAR(50) CHECK (vendor_type IN ('software', 'hardware', 'services', 'cloud', 'managed_service', 'data_processor', 'other')) DEFAULT 'other',
  risk_tier VARCHAR(20) CHECK (risk_tier IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  review_status VARCHAR(30) CHECK (review_status IN ('pending_review', 'in_review', 'approved', 'conditional', 'rejected', 'decommissioned')) DEFAULT 'pending_review',
  next_review_date DATE,
  last_review_date DATE,
  data_access_level VARCHAR(20) CHECK (data_access_level IN ('none', 'metadata', 'limited', 'full')) DEFAULT 'none',
  services_provided TEXT,
  notes TEXT,
  cmdb_asset_id UUID,
  ai_risk_summary TEXT,
  ai_risk_score INTEGER CHECK (ai_risk_score BETWEEN 0 AND 100),
  ai_assessed_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tprm_vendors
  ADD COLUMN IF NOT EXISTS vendor_website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vendor_contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vendor_contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS last_review_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS cmdb_asset_id UUID,
  ADD COLUMN IF NOT EXISTS ai_risk_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_risk_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_assessed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE tprm_vendors
SET contact_email = COALESCE(contact_email, vendor_contact_email),
    contact_name = COALESCE(contact_name, vendor_contact_name),
    review_status = COALESCE(review_status, 'pending_review'),
    metadata = COALESCE(metadata, '{}'::jsonb)
WHERE contact_email IS NULL
   OR contact_name IS NULL
   OR review_status IS NULL
   OR metadata IS NULL;

CREATE INDEX IF NOT EXISTS idx_tprm_vendors_org ON tprm_vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_vendors_risk_tier ON tprm_vendors(organization_id, risk_tier);
CREATE INDEX IF NOT EXISTS idx_tprm_vendors_review_status ON tprm_vendors(organization_id, review_status);
CREATE INDEX IF NOT EXISTS idx_tprm_vendors_next_review ON tprm_vendors(organization_id, next_review_date);

-- Security questionnaire templates and instances
CREATE TABLE IF NOT EXISTS tprm_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES tprm_vendors(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(30) CHECK (status IN ('draft', 'sent', 'in_progress', 'completed', 'overdue', 'cancelled')) DEFAULT 'draft',
  due_date DATE,
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  questions JSONB NOT NULL DEFAULT '[]',
  responses JSONB DEFAULT '{}',
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_analysis TEXT,
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tprm_questionnaires
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
  ADD COLUMN IF NOT EXISTS overall_score INTEGER,
  ADD COLUMN IF NOT EXISTS response_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_org ON tprm_questionnaires(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_vendor ON tprm_questionnaires(vendor_id);
CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_status ON tprm_questionnaires(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_due ON tprm_questionnaires(organization_id, due_date);

-- Documentation requests
CREATE TABLE IF NOT EXISTS tprm_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES tprm_vendors(id) ON DELETE CASCADE,
  document_type VARCHAR(50) CHECK (document_type IN ('soc2_report', 'iso27001_cert', 'pen_test_report', 'privacy_policy', 'dpa', 'baa', 'insurance_cert', 'business_continuity_plan', 'incident_response_plan', 'other')) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  request_status VARCHAR(30) CHECK (request_status IN ('requested', 'received', 'under_review', 'accepted', 'rejected', 'expired')) DEFAULT 'requested',
  requested_at TIMESTAMP DEFAULT NOW(),
  received_at TIMESTAMP,
  expires_at DATE,
  notes TEXT,
  file_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tprm_documents
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE tprm_documents
SET title = COALESCE(title, document_name),
    status = COALESCE(status, request_status),
    file_path = COALESCE(file_path, file_url),
    metadata = COALESCE(metadata, '{}'::jsonb)
WHERE title IS NULL
   OR status IS NULL
   OR file_path IS NULL
   OR metadata IS NULL;

CREATE INDEX IF NOT EXISTS idx_tprm_documents_org ON tprm_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_documents_vendor ON tprm_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_tprm_documents_status ON tprm_documents(organization_id, request_status);
CREATE INDEX IF NOT EXISTS idx_tprm_documents_expires ON tprm_documents(organization_id, expires_at);

COMMENT ON TABLE tprm_vendors IS 'Third-party risk management vendor registry';
COMMENT ON TABLE tprm_questionnaires IS 'Security questionnaires sent to vendors for due diligence';
COMMENT ON TABLE tprm_documents IS 'Documentation requests and certifications tracked per vendor';
COMMENT ON COLUMN tprm_vendors.cmdb_asset_id IS 'Optional link to a CMDB asset or system record';
COMMENT ON COLUMN tprm_questionnaires.ai_generated IS 'Whether questions were AI-generated based on vendor profile';

SELECT 'Migration 072 completed.' AS result;
