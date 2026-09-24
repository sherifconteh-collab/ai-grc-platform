-- Migration 105: Row-Level Security (defense-in-depth)
--
-- Adds PostgreSQL RLS policies as a second layer of multi-tenant isolation.
-- Application-layer WHERE organization_id = $1 remains the primary guard;
-- RLS enforces it at the database layer when app.org_id is set on the session
-- via withOrgContext() in backend/src/config/database.js.
--
-- Policy behavior:
--   - When app.org_id is NOT set (empty string or NULL): policy is permissive
--     (all rows visible). This preserves backward compatibility for existing
--     queries, migrations, seeds, and platform-admin operations.
--   - When app.org_id IS set: only rows matching that organization_id are returned.
--
-- FORCE ROW LEVEL SECURITY applies the policy even to superusers, making it a true
-- defense-in-depth measure rather than a bypassable suggestion.
--
-- Ships in v3.4.0.

-- Applied only to tables that exist in this edition and carry an
-- organization_id column (the community schema has no `controls` table), and
-- idempotently, so a re-run cannot fail on an existing policy.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['controls', 'control_implementations', 'evidence', 'audit_engagements', 'audit_logs', 'users']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', tbl);
      EXECUTE format(
        'CREATE POLICY org_isolation ON %I USING ('
        || 'NULLIF(current_setting(''app.org_id'', TRUE), '''') IS NULL '
        || 'OR organization_id = NULLIF(current_setting(''app.org_id'', TRUE), '''')::uuid)',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;
