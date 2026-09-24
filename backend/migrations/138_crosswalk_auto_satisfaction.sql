-- Migration 138: Crosswalk auto-satisfaction credit ledger
--
-- ControlWeave already credits mapped controls automatically: setting a control
-- to `implemented` via PUT /controls/:id/implementation finds mappings at or
-- above the configured similarity threshold (`crosswalk.inheritance_min_similarity`,
-- default 90) with a strict mapping type, and flips `not_started` targets to
-- `satisfied_via_crosswalk`. POST /controls/:id/inherit does the same on demand.
-- That forward path works. What it has never had is a record of *why* a control
-- is credited, or any way back.
--
-- Three consequences this ledger fixes:
--
--   1. Credit was permanent. Un-implementing the source left every control it
--      had satisfied sitting at `satisfied_via_crosswalk` forever, because
--      nothing knew which controls that source had credited. An organization
--      that reverted a control kept a compliance posture it no longer had.
--   2. There was no provenance. An assessor asking why a control is satisfied
--      without its own evidence had only an appended sentence in a free-text
--      notes column. "Credited from NIST CSF 2.0 PR.AA-01 at 95% equivalence on
--      2026-07-29" is defensible; a notes string is not.
--   3. Reversal could not be safe without it. A target can be justified by more
--      than one source, so withdrawing credit requires knowing whether any
--      other still-implemented source supports it. Per-source rows make that a
--      query rather than a guess.
--
-- Ships alongside migrations 132-137.

CREATE TABLE IF NOT EXISTS control_crosswalk_credits (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- The control receiving credit.
  target_control_id    uuid NOT NULL REFERENCES framework_controls (id) ON DELETE CASCADE,
  -- The implemented control the credit derives from.
  source_control_id    uuid NOT NULL REFERENCES framework_controls (id) ON DELETE CASCADE,
  similarity_score     int  NOT NULL,
  mapping_type         text,
  -- Status the target held before credit was applied, so withdrawal restores
  -- exactly what was there rather than assuming 'not_started'.
  previous_status      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: one credit per (org, target, source). The organization_id is part
  -- of the key so a mapping in one tenant can never satisfy a control in
  -- another.
  CONSTRAINT control_crosswalk_credits_unique
    UNIQUE (organization_id, target_control_id, source_control_id)
);

CREATE INDEX IF NOT EXISTS idx_crosswalk_credits_org_target
  ON control_crosswalk_credits (organization_id, target_control_id);

CREATE INDEX IF NOT EXISTS idx_crosswalk_credits_org_source
  ON control_crosswalk_credits (organization_id, source_control_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'control_crosswalk_credits'::regclass
      AND conname = 'control_crosswalk_credits_no_self'
  ) THEN
    ALTER TABLE control_crosswalk_credits
      ADD CONSTRAINT control_crosswalk_credits_no_self
      CHECK (target_control_id <> source_control_id);
  END IF;
END $$;

SELECT 'Migration 138 completed.' AS result;
