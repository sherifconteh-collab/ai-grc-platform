-- Migration 039: Add control-level test result to control_implementations

ALTER TABLE control_implementations
  ADD COLUMN IF NOT EXISTS test_result VARCHAR(50)
    DEFAULT 'not_assessed'
    CHECK (test_result IN ('not_assessed', 'satisfied', 'other_than_satisfied', 'not_applicable')),
  ADD COLUMN IF NOT EXISTS test_notes TEXT;

-- Index for querying controls by test result
CREATE INDEX IF NOT EXISTS idx_impl_test_result
  ON control_implementations(organization_id, test_result);
