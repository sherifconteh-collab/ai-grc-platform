-- Migration 134: Row-Level Security for access governance tables
--
-- Why: migration 105 applied defense-in-depth RLS to a curated set of the
-- most sensitive org-scoped tables (controls, control_implementations,
-- evidence, audit_engagements, audit_logs, users). The access governance
-- tables added in 132/133 -- SoD rules, access review campaigns/items, and
-- uploaded RBAC documents with extracted text -- are exactly the same class
-- of sensitive governance/audit data and were missed. Application-layer
-- `WHERE organization_id = $1` filtering in accessGovernanceService.js /
-- routes/accessGovernance.js already enforces isolation correctly (verified
-- by qa-rbac-mega-test.js section 22's cross-org assertions); this migration
-- adds the same second layer of protection as the other core tables.
--
-- Policy behavior (identical to migration 105): permissive when app.org_id
-- is not set on the session (preserves existing pool.query() call sites
-- that don't use withOrgContext()); once app.org_id is set, only matching
-- rows are visible. sod_rules additionally treats organization_id IS NULL
-- (system rules) as always visible, matching its existing app-layer
-- `organization_id = $1 OR organization_id IS NULL` query pattern.

ALTER TABLE sod_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sod_rules FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sod_rules' AND policyname = 'org_isolation') THEN
    CREATE POLICY org_isolation ON sod_rules
      USING (
        NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
        OR organization_id IS NULL
        OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
      );
  END IF;
END;
$$;

ALTER TABLE access_review_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_review_campaigns FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'access_review_campaigns' AND policyname = 'org_isolation') THEN
    CREATE POLICY org_isolation ON access_review_campaigns
      USING (
        NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
        OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
      );
  END IF;
END;
$$;

ALTER TABLE access_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_review_items FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'access_review_items' AND policyname = 'org_isolation') THEN
    CREATE POLICY org_isolation ON access_review_items
      USING (
        NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
        OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
      );
  END IF;
END;
$$;

ALTER TABLE rbac_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_documents FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rbac_documents' AND policyname = 'org_isolation') THEN
    CREATE POLICY org_isolation ON rbac_documents
      USING (
        NULLIF(current_setting('app.org_id', TRUE), '') IS NULL
        OR organization_id = NULLIF(current_setting('app.org_id', TRUE), '')::uuid
      );
  END IF;
END;
$$;

SELECT 'Migration 134 completed.' AS result;
