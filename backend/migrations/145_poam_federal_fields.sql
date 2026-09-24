-- Migration 145: Federal POA&M structure — milestones, resources, scheduled
-- completion date (issue #569)
--
-- README claims "POA&M tracking for federal and regulatory reporting". The
-- poam_items table correctly links to controls and findings and carries the core
-- lifecycle, but it was short of the structure a federal POA&M actually
-- requires, in three specific ways:
--
--   1. One `due_date` and nothing else. A federal POA&M is a list of discrete
--      milestones, each with its own target date and completion state. A single
--      overall date cannot express "quarterly scanning stood up by March,
--      remediation SLA met by June".
--   2. No record of what remediation would cost. Federal POA&M templates
--      require an estimate of the resources — funding, staff, tooling — needed
--      to close the item, because that estimate is what gets reviewed.
--   3. No way to see slippage. OMB templates distinguish the *originally
--      scheduled* completion date from any *revised* one, precisely so that a
--      date being moved is visible rather than silent. With one mutable
--      `due_date`, revising it erased the fact that it had been revised.
--
-- `scheduled_completion_date` is therefore the original commitment and is meant
-- to be set once; `due_date` remains the current target. The gap between them is
-- the slippage.
--
-- Ports migration 134 from the ControlWeaver-Pro repository so the two stay at
-- parity. Ships in the remediation-integration release.

ALTER TABLE poam_items
  ADD COLUMN IF NOT EXISTS resources_required text;

ALTER TABLE poam_items
  ADD COLUMN IF NOT EXISTS scheduled_completion_date date;

-- Backfill the original commitment from the current target for existing rows.
-- Without this, every pre-existing item would read as having no original
-- commitment, which is indistinguishable from "never had a date" — and would
-- make slippage reporting silently skip them.
UPDATE poam_items
SET scheduled_completion_date = due_date
WHERE scheduled_completion_date IS NULL
  AND due_date IS NOT NULL;

COMMENT ON COLUMN poam_items.scheduled_completion_date IS
  'Originally scheduled completion date. Set once; due_date carries the current target so slippage stays visible.';
COMMENT ON COLUMN poam_items.resources_required IS
  'Estimate of funding, staff, and tooling needed to remediate (federal POA&M requirement).';

CREATE TABLE IF NOT EXISTS poam_milestones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poam_item_id   uuid NOT NULL REFERENCES poam_items (id) ON DELETE CASCADE,
  -- SECURITY: denormalized from the parent so every read is org-scoped without
  -- a join, matching how the rest of the POA&M routes filter.
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  description    text NOT NULL,
  target_date    date,
  status         text NOT NULL DEFAULT 'pending',
  completed_date date,
  sort_order     int  NOT NULL DEFAULT 0,

  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT poam_milestones_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_poam_milestones_org_item
  ON poam_milestones (organization_id, poam_item_id, sort_order);

SELECT 'Migration 134 completed.' AS result;
