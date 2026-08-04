-- =============================================================================
-- 150_evidence_control_links_org_scope.sql
--
-- Gives evidence_control_links the organization_id every other link table in
-- this schema already carries. Flagged in migration 149's header as the weaker
-- of the two patterns and explicitly not the one to copy; this closes it.
--
-- WHY IT MATTERS
--
-- Today the table has no tenant column at all. Every read that scopes correctly
-- does so by joining through `evidence` and filtering `e.organization_id` --
-- which works, but makes correctness a property of each individual query rather
-- than of the schema. A single JOIN written without that filter returns another
-- organization's linkage, and nothing in the database objects. The six risk_*
-- link tables (140, 146, 147, 148, 149) all carry organization_id with a
-- SECURITY-annotated unique constraint precisely so that a mistake in one query
-- cannot become a cross-tenant read.
--
-- A NOTE ON WHICH DEFINITION IS LIVE
--
-- This table is created twice: migration 009 creates it with a composite
-- primary key (evidence_id, control_id) and no surrogate id, and migration 014
-- re-declares it with `id uuid PRIMARY KEY`, `linked_at`, and NOT NULL columns.
-- 009 runs first, so 014's CREATE TABLE IF NOT EXISTS is a no-op and its
-- definition has never existed in any database built from these migrations.
-- The live shape is 009's. Verified against a database built by running the
-- full migration set, not inferred from reading the files.
--
-- Nothing in the codebase reads `id` or `linked_at` on this table, so the dead
-- definition has caused no bug. It is left in place rather than edited --
-- migrations are forward-only -- but it should not be trusted as documentation.
--
-- BACKFILL
--
-- Derived from evidence.organization_id, which is the value every correct query
-- already filters on, so no row changes meaning. Rows whose evidence has since
-- been deleted cannot exist: the FK is ON DELETE CASCADE.
-- =============================================================================

ALTER TABLE evidence_control_links
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE;

UPDATE evidence_control_links ecl
   SET organization_id = e.organization_id
  FROM evidence e
 WHERE e.id = ecl.evidence_id
   AND ecl.organization_id IS DISTINCT FROM e.organization_id;

-- Only enforce NOT NULL once the backfill has actually populated every row.
-- A link whose evidence row is missing cannot exist (ON DELETE CASCADE), so a
-- remaining NULL would mean the backfill did not run -- fail loudly instead of
-- silently leaving the column optional.
DO $$
DECLARE
  orphaned bigint;
BEGIN
  SELECT COUNT(*) INTO orphaned
    FROM evidence_control_links
   WHERE organization_id IS NULL;

  IF orphaned > 0 THEN
    RAISE EXCEPTION
      'evidence_control_links: % row(s) still have a NULL organization_id after backfill', orphaned;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'evidence_control_links'
       AND column_name = 'organization_id'
       AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE evidence_control_links ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END$$;

-- SECURITY: org-scoped uniqueness makes a cross-tenant link unrepresentable
-- rather than merely unlikely. The composite primary key from migration 009
-- already prevents duplicate (evidence, control) pairs; this constraint is what
-- ties the pair to exactly one organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evidence_control_links_org_unique'
  ) THEN
    ALTER TABLE evidence_control_links
      ADD CONSTRAINT evidence_control_links_org_unique
      UNIQUE (organization_id, evidence_id, control_id);
  END IF;
END$$;

-- The common read is "what does this organization link to this control", which
-- filters by organization first.
CREATE INDEX IF NOT EXISTS idx_ecl_org_control
  ON evidence_control_links (organization_id, control_id);

CREATE INDEX IF NOT EXISTS idx_ecl_org_evidence
  ON evidence_control_links (organization_id, evidence_id);

COMMENT ON COLUMN evidence_control_links.organization_id IS
  'Tenant owner, denormalized from evidence.organization_id so isolation is enforced by the schema rather than by every query remembering to join through evidence.';
