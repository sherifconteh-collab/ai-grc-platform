-- Migration 120: Add a dedicated due_date to control_implementations
--
-- control_implementations.implementation_date was overloaded to mean both
-- "date the control is due" (set on assignment) and "date the control was
-- completed" (set when status becomes 'implemented'), so marking a control
-- implemented silently wiped its due date. This adds a separate due_date
-- column so implementation_date can become an unambiguous completion date.
-- Ships in the feature-audit-fixes batch.

ALTER TABLE control_implementations ADD COLUMN IF NOT EXISTS due_date DATE;

-- Backfill: for controls not yet completed, implementation_date was holding
-- the assign-time due date. Completed/verified rows' implementation_date is
-- already a completion date (overwritten at status-change time), so it is
-- not a recoverable due date and is left NULL.
UPDATE control_implementations
SET due_date = implementation_date
WHERE due_date IS NULL
  AND implementation_date IS NOT NULL
  AND status IN ('not_started', 'in_progress', 'needs_review');

CREATE INDEX IF NOT EXISTS idx_control_impl_org_due
  ON control_implementations (organization_id, due_date);

SELECT 'Migration 120 completed.' AS result;
