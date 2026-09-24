-- 129_legal_holds_missing_columns.sql
--
-- Why: live end-to-end QA (real Postgres + real backend, not Jest's mocked
-- pg.Pool) surfaced that the entire legal-holds / data-governance feature
-- (routes/dataGovernance.js: POST /legal-holds, POST /legal-holds/:id/release,
-- GET /evidence/:id/immutable-export) and evidence.js's DELETE /:id legal-hold
-- check have never worked -- every one throws a 500. The legal_holds table
-- as originally created only has id, organization_id, resource_type,
-- resource_id, reason, active, created_by, expires_at, created_at,
-- updated_at, but the route code consistently reads/writes hold_name,
-- starts_at, ends_at, released_by, and released_at. The sibling
-- ControlWeaver-Pro repo's legal_holds table has all five from its
-- original creation -- this is schema drift specific to this repo, not a
-- design difference (confirmed: this repo's own route code assumes the
-- fuller schema throughout, it isn't a stripped-down alternate design).
--
-- hold_name is required at the API layer (routes/dataGovernance.js already
-- 400s if missing) so it does not need a NOT NULL constraint here --
-- per migrations convention, new columns on an existing table stay
-- nullable/defaulted rather than NOT NULL with no default.

ALTER TABLE legal_holds
  ADD COLUMN IF NOT EXISTS hold_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;

SELECT 'Migration 129 completed.' AS result;
