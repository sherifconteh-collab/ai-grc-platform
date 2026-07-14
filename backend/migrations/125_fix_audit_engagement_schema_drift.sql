-- Migration 125: Reconcile audit_pbc_requests/audit_findings/auditor_workspace_links
-- schema drift between migrations 016 and 017
--
-- Migration 016_audit_engagements.sql and 017_audit_engagement_workflow.sql both
-- define audit_engagements/audit_pbc_requests/audit_workpapers/audit_findings/
-- audit_signoffs via CREATE TABLE IF NOT EXISTS — two independent migration
-- histories that were merged without renumbering. On a fresh database, both
-- migrations run in filename order (016 before 017), so 016's schema wins and
-- 017's CREATE TABLE IF NOT EXISTS becomes a silent no-op. That leaves the
-- live schema out of sync with what routes/assessments.js actually assumes
-- (017's shape, which matches the sibling ControlWeaver-Pro repo's canonical
-- single migration):
--   - audit_pbc_requests.request_details ends up JSONB instead of TEXT NOT
--     NULL, but assessments.js always inserts a plain free-text string —
--     binding that to a jsonb column throws "invalid input syntax for type
--     json", breaking PBC creation entirely.
--   - audit_findings is missing closed_at, but assessments.js unconditionally
--     sets closed_at = NOW() when a finding's status becomes 'closed',
--     breaking finding closure entirely.
--   - audit_findings/audit_pbc_requests are missing 017's CHECK constraints.
--   - auditor_workspace_links.engagement_id cascades on delete (016) instead
--     of setting null (023_program_foundation_release.sql's intent), so
--     deleting an engagement silently deletes any auditor share links
--     pointing at it instead of preserving them.
-- Per this repo's migration convention, already-numbered/deployed migrations
-- (016, 017) are never edited (that changes their stored checksum and hard-
-- fails scripts/migrate-all.js on any already-applied database) — this is a
-- new migration that reconciles the drift going forward, safe to run whether
-- a given database ended up with 016's or 017's version of these tables.
-- Ships in the feature-audit-fixes batch (Auditor Workspace end-to-end audit).

-- audit_pbc_requests.request_details: JSONB -> TEXT NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_pbc_requests'
      AND column_name = 'request_details'
      AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE audit_pbc_requests
      ALTER COLUMN request_details TYPE TEXT
      USING COALESCE(request_details #>> '{}', '');
    ALTER TABLE audit_pbc_requests
      ALTER COLUMN request_details SET NOT NULL;
  END IF;
END $$;

-- audit_findings.closed_at
ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;

-- Defense-in-depth CHECK constraints from migration 017, added if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_pbc_priority_valid'
  ) THEN
    ALTER TABLE audit_pbc_requests
      ADD CONSTRAINT audit_pbc_priority_valid
      CHECK (priority IN ('low', 'medium', 'high', 'critical'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_pbc_status_valid'
  ) THEN
    ALTER TABLE audit_pbc_requests
      ADD CONSTRAINT audit_pbc_status_valid
      CHECK (status IN ('open', 'in_progress', 'submitted', 'accepted', 'rejected', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_findings_severity_valid'
  ) THEN
    ALTER TABLE audit_findings
      ADD CONSTRAINT audit_findings_severity_valid
      CHECK (severity IN ('low', 'medium', 'high', 'critical'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_findings_status_valid'
  ) THEN
    ALTER TABLE audit_findings
      ADD CONSTRAINT audit_findings_status_valid
      CHECK (status IN ('open', 'accepted', 'remediating', 'verified', 'closed'));
  END IF;
END $$;

-- auditor_workspace_links.engagement_id: ON DELETE CASCADE -> ON DELETE SET NULL
-- (deleting an engagement should not silently delete a share link's audit
-- trail; the link should just stop resolving engagement-scoped data)
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'auditor_workspace_links'
    AND con.contype = 'f'
    AND att.attname = 'engagement_id'
    AND con.confdeltype = 'c' -- 'c' = CASCADE; only touch it if it's still the old behavior
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE auditor_workspace_links DROP CONSTRAINT %I', fk_name);
    ALTER TABLE auditor_workspace_links
      ADD CONSTRAINT auditor_workspace_links_engagement_id_fkey
      FOREIGN KEY (engagement_id) REFERENCES audit_engagements(id) ON DELETE SET NULL;
  END IF;
END $$;

SELECT 'Migration 125 completed.' AS result;
