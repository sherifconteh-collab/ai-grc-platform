-- Migration 028: Procedure-linked audit artifacts + expanded sign-off roles
-- Adds explicit links from engagement artifacts to assessment procedures
-- and broadens sign-off actor taxonomy for customer validation packages.

ALTER TABLE audit_pbc_requests
  ADD COLUMN IF NOT EXISTS assessment_procedure_id UUID REFERENCES assessment_procedures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_pbc_assessment_procedure
  ON audit_pbc_requests (assessment_procedure_id);

ALTER TABLE audit_workpapers
  ADD COLUMN IF NOT EXISTS assessment_procedure_id UUID REFERENCES assessment_procedures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_workpapers_assessment_procedure
  ON audit_workpapers (assessment_procedure_id);

ALTER TABLE audit_signoffs
  DROP CONSTRAINT IF EXISTS audit_signoffs_type_valid;

ALTER TABLE audit_signoffs
  ADD CONSTRAINT audit_signoffs_type_valid CHECK (
    signoff_type IN (
      'auditor',
      'management',
      'executive',
      'customer_acknowledgment',
      'company_leadership',
      'auditor_firm_recommendation'
    )
  );

SELECT 'Migration 028 completed.' AS result;
