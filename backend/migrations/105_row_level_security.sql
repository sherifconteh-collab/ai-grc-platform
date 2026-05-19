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
-- FORCE ROW SECURITY applies the policy even to superusers, making it a true
-- defense-in-depth measure rather than a bypassable suggestion.
--
-- Ships in v3.4.0.

-- controls
ALTER TABLE controls ENABLE ROW SECURITY;
ALTER TABLE controls FORCE ROW SECURITY;

CREATE POLICY org_isolation ON controls
  USING (
    NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
    OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
  );

-- control_implementations
ALTER TABLE control_implementations ENABLE ROW SECURITY;
ALTER TABLE control_implementations FORCE ROW SECURITY;

CREATE POLICY org_isolation ON control_implementations
  USING (
    NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
    OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
  );

-- evidence (conditional: table may not exist in all editions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'evidence') THEN
    EXECUTE 'ALTER TABLE evidence ENABLE ROW SECURITY';
    EXECUTE 'ALTER TABLE evidence FORCE ROW SECURITY';
    EXECUTE $policy$
      CREATE POLICY org_isolation ON evidence
        USING (
          NULLIF(current_setting(''app.org_id'', TRUE), '''') IS NULL
          OR organization_id = NULLIF(current_setting(''app.org_id'', TRUE), '''')::uuid
        )
    $policy$;
  END IF;
END;
$$;

-- audit_engagements (assessments)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_engagements') THEN
    EXECUTE 'ALTER TABLE audit_engagements ENABLE ROW SECURITY';
    EXECUTE 'ALTER TABLE audit_engagements FORCE ROW SECURITY';
    EXECUTE $policy$
      CREATE POLICY org_isolation ON audit_engagements
        USING (
          NULLIF(current_setting(''app.org_id'', TRUE), '''') IS NULL
          OR organization_id = NULLIF(current_setting(''app.org_id'', TRUE), '''')::uuid
        )
    $policy$;
  END IF;
END;
$$;

-- audit_logs
ALTER TABLE audit_logs ENABLE ROW SECURITY;
ALTER TABLE audit_logs FORCE ROW SECURITY;

CREATE POLICY org_isolation ON audit_logs
  USING (
    NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
    OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
  );

-- users (filtered by organization_id for intra-org visibility)
ALTER TABLE users ENABLE ROW SECURITY;
ALTER TABLE users FORCE ROW SECURITY;

CREATE POLICY org_isolation ON users
  USING (
    NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
    OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
  );
