-- Migration 072: PII data labeling for evidence

-- Add PII classification fields to the evidence table
ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS pii_classification VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (pii_classification IN ('none', 'low', 'moderate', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS pii_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_sensitivity VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (data_sensitivity IN ('public', 'internal', 'confidential', 'restricted'));

-- Index for filtering/reporting by PII classification
CREATE INDEX IF NOT EXISTS idx_evidence_pii_classification
  ON evidence(organization_id, pii_classification);

CREATE INDEX IF NOT EXISTS idx_evidence_data_sensitivity
  ON evidence(organization_id, data_sensitivity);

SELECT 'Migration 072 completed.' AS result;
