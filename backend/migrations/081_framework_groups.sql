-- Migration 081: Add framework_group column for bundled framework counting
-- ISO standards are grouped so they count as 1 framework against tier limits

ALTER TABLE frameworks ADD COLUMN IF NOT EXISTS framework_group VARCHAR(50);

-- ISO 27000 Information Security & Privacy Series
UPDATE frameworks SET framework_group = 'iso_27000' WHERE code IN (
  'iso_27001', 'iso_27002', 'iso_27005', 'iso_27017', 'iso_27018', 'iso_27701', 'iso_31000'
);

-- ISO AI Governance Suite
UPDATE frameworks SET framework_group = 'iso_ai' WHERE code IN (
  'iso_42001', 'iso_42005', 'iso_23894', 'iso_38507', 'iso_22989', 'iso_23053',
  'iso_5259', 'iso_tr_24027', 'iso_tr_24028', 'iso_tr_24368'
);

-- Add index for group lookups
CREATE INDEX IF NOT EXISTS idx_frameworks_group ON frameworks(framework_group) WHERE framework_group IS NOT NULL;
