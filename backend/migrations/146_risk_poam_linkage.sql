-- Migration 146: Connect the risk register to POA&M remediation
--
-- Migration 136 introduced the risk register and stated its own design intent
-- plainly: link tables tie risks to "controls (what treats the risk), assets
-- (what is exposed), objectives (what is threatened) -- so the register is
-- connected to the compliance work rather than parallel to it".
--
-- POA&M was missing from that list, and it is arguably the most important
-- member of it. The consequence showed up in three places:
--
--   1. A register that cannot show what is being *done* about a risk. Treatment
--      strategy records the decision ("mitigate"); nothing recorded the work.
--   2. A POA&M that cannot name the risk it burns down. Federal and ISO
--      remediation records are expected to trace back to the risk that
--      justified the effort, and `poam_items` had no way to express it.
--   3. `risk_treatments` and `poam_items` are near-duplicate remediation
--      records -- both carry title, owner, due date, status, progress -- that
--      did not know about each other, so the same work was tracked twice with
--      no reconciliation.
--
-- Two relationships are added because two genuinely exist:
--
--   * `risk_poam_links` is many-to-many. One POA&M routinely addresses several
--     risks (a single access-control remediation reduces half a dozen), and one
--     risk needs several POA&Ms. Modeled on `risk_control_links` so the
--     register's generic link handling covers it without special cases.
--   * `poam_items.treatment_id` is the tighter, optional relationship: this
--     POA&M is how *this specific treatment* gets executed. Nullable, because
--     most POA&Ms are raised from a control test or a finding and never belong
--     to a treatment.
--
-- Deliberately NOT included: any trigger that moves a risk's residual score
-- when a linked POA&M closes. Migration 136 stores inherent and residual
-- separately so an assessor can see what the controls actually did; a score
-- that moves on its own destroys exactly that evidence. Closing remediation
-- makes a risk due for review (`risks.next_review_date`, `risk_reviews`); a
-- human records the reassessment.
--
-- Ships alongside migration 147 in the remediation-integration release.

CREATE TABLE IF NOT EXISTS risk_poam_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  poam_item_id      uuid NOT NULL REFERENCES poam_items (id) ON DELETE CASCADE,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: organization_id participates in the key so a POA&M in one tenant
  -- can never be linked to a risk in another, matching the guarantee the other
  -- three risk link tables make.
  CONSTRAINT risk_poam_links_unique UNIQUE (organization_id, risk_id, poam_item_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_poam_links_risk ON risk_poam_links (risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_poam_links_poam
  ON risk_poam_links (organization_id, poam_item_id);

-- The optional one-to-one-ish relationship: this POA&M executes this treatment.
-- ON DELETE SET NULL rather than CASCADE -- deleting a treatment plan should
-- not destroy the remediation record and its audit trail.
ALTER TABLE poam_items
  ADD COLUMN IF NOT EXISTS treatment_id uuid REFERENCES risk_treatments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poam_items_treatment
  ON poam_items (treatment_id)
  WHERE treatment_id IS NOT NULL;

-- `source_type` is a plain VARCHAR with no CHECK constraint (migration 023
-- constrains only status and priority), so admitting 'risk' as a provenance
-- value needs no DDL -- ALLOWED_SOURCE_TYPE in routes/poam.js is the enforcement
-- point. Recorded here so the set of legal values stays discoverable from the
-- migration history: manual, vulnerability, control, audit_finding, assessment,
-- risk.
COMMENT ON COLUMN poam_items.source_type IS
  'Provenance: manual, vulnerability, control, audit_finding, assessment, risk. Enforced in routes/poam.js (ALLOWED_SOURCE_TYPE).';

COMMENT ON COLUMN poam_items.treatment_id IS
  'Optional risk_treatments row this POA&M executes. Null for POA&Ms raised from a control test, finding or vulnerability.';
