-- Migration 147: Many-to-many POA&M <-> control linkage
--
-- `poam_items.control_id` (migration 023) is a single nullable FK to
-- `framework_controls`. That models "this remediation belongs to one control",
-- which is not how remediation works and is not how the rest of this schema
-- models the same relationship:
--
--   * evidence  -> controls  via `evidence_control_links`
--   * risks     -> controls  via `risk_control_links` (migration 140)
--   * poam      -> controls  via ... a single column
--
-- POA&M was the only one of the three that could not express a remediation
-- spanning several controls, which is the common case: one access-review
-- remediation closes findings against AC-2, AC-3 and AC-6 at once. Worse, the
-- reverse lookup was lossy -- a control detail page asking "what remediation
-- touches me" could only find POA&Ms whose single FK happened to point at it.
--
-- `control_id` is deliberately KEPT as the primary/originating control rather
-- than dropped. It is read by routes/poam.js, routes/ops.js and the control
-- detail page, it carries the meaning "the control this item was raised
-- against", and removing it would be a breaking API change for no gain. Every
-- existing value is backfilled into the link table so no association is lost
-- and readers can migrate to the link table at their own pace.
--
-- Framework neutrality note: `framework_controls` is the shared cross-framework
-- catalog, so this linkage has never been NIST-specific -- an ISO 27001 CAR and
-- a SOC 2 deficiency link through exactly the same table.
--
-- Ships alongside migration 146 in the remediation-integration release.

CREATE TABLE IF NOT EXISTS poam_control_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  poam_item_id      uuid NOT NULL REFERENCES poam_items (id) ON DELETE CASCADE,
  -- framework_controls are shared catalog rows and carry no organization_id of
  -- their own; org scoping comes from poam_item_id and the constraint below.
  control_id        uuid NOT NULL REFERENCES framework_controls (id) ON DELETE CASCADE,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: organization_id participates in the key so a POA&M in one tenant
  -- can never accumulate control links written under another, matching
  -- risk_control_links.
  CONSTRAINT poam_control_links_unique UNIQUE (organization_id, poam_item_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_poam_control_links_poam ON poam_control_links (poam_item_id);
CREATE INDEX IF NOT EXISTS idx_poam_control_links_control
  ON poam_control_links (organization_id, control_id);

-- Backfill: every existing single-FK association becomes a link row. Without
-- this, deploying the link-table reads would make every pre-existing POA&M
-- appear to have no controls at all.
INSERT INTO poam_control_links (organization_id, poam_item_id, control_id, notes, created_by)
SELECT p.organization_id, p.id, p.control_id,
       'Backfilled from poam_items.control_id (migration 147)', p.created_by
FROM poam_items p
WHERE p.control_id IS NOT NULL
ON CONFLICT ON CONSTRAINT poam_control_links_unique DO NOTHING;

COMMENT ON TABLE poam_control_links IS
  'Many-to-many POA&M <-> framework_controls. poam_items.control_id remains the primary/originating control.';
