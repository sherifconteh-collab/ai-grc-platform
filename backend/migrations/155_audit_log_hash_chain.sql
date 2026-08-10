-- Migration 155: Hash-chain audit records (NIST AU-9(3), AU-10)
--
-- What already exists makes audit_logs tamper-RESISTANT: migration 153 added triggers
-- that reject DELETE, TRUNCATE, and any UPDATE other than the siem_forwarded
-- flag. What it cannot do is make tampering EVIDENT. The application owns this
-- table, so any code path may issue
-- `ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update` -- and one
-- legitimately does: the AU-11 retention purge has to, in order to delete
-- anything at all. Once that window can be opened for a good reason, it can be
-- opened for a bad one, and nothing in the table would show it afterward.
--
-- A hash chain closes that gap. Each row carries the digest of the row before
-- it, so removing or editing a row breaks every link after it. That does not
-- prevent tampering -- nothing in-database can, against an owner -- but it
-- makes it detectable, which is what AU-9(3) asks for.
--
-- Design notes:
--
-- 1. SHA-384, matching the CNSA Suite 1.0 posture the rest of the codebase
--    uses (utils/encrypt.js sha384, HMAC-SHA-384 webhooks). pgcrypto is
--    already enabled in 001_initial_schema.sql, so digest() is available
--    without a new dependency.
--
-- 2. The chain is computed in a BEFORE INSERT trigger rather than in
--    services/auditService.js. Reading the current chain head and appending to
--    it is a read-then-write race: two concurrent inserts for the same
--    organization would both read the same head and produce two rows claiming
--    the same predecessor. The trigger takes pg_advisory_xact_lock keyed on
--    the organization, which serializes appends per tenant inside the
--    transaction that is already open. Application code cannot close that race
--    without inventing its own locking, and any writer that bypassed the
--    service would silently produce an unchained row.
--
-- 3. Historical rows are deliberately NOT backfilled. Hashing rows that were
--    written before this migration would produce a chain that looks
--    authoritative over a period it cannot vouch for: those rows were never
--    protected, so the chain would only prove nothing changed since the
--    backfill, while presenting as though it covered everything. Leaving them
--    NULL states the truth -- the chain starts here. scripts/verify-audit-chain.js
--    reports the start point explicitly.
--
-- 4. The AU-11 retention purge necessarily breaks the chain when it deletes
--    the oldest rows, because the surviving oldest row's prev_hash then points
--    at something that no longer exists. That is expected, not tampering. The
--    purge records the boundary in its audit.retention_purge details, and the
--    verifier treats a discontinuity explained by such a record as legitimate.
--
-- Also changes audit_logs.organization_id from ON DELETE CASCADE to RESTRICT.
-- Deleting an organization would otherwise destroy its entire audit history as
-- a side effect -- the one deletion the append-only trigger cannot catch,
-- because it never sees a DELETE on audit_logs at all. No application path
-- deletes organizations today (verified: no `DELETE FROM organizations` in
-- either src/ tree), so this tightens a constraint nothing currently
-- exercises, and forces an explicit archive-then-purge if that changes.
--
-- Ships in the AU control family remediation batch.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS prev_hash   VARCHAR(96),
  ADD COLUMN IF NOT EXISTS record_hash VARCHAR(96);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record_hash ON audit_logs(record_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_chain ON audit_logs(organization_id, created_at, id);

-- Canonical serialization of the forensic fields. Column order is fixed here
-- and must never be reordered: changing it invalidates every existing hash.
-- COALESCE to a sentinel rather than concatenating NULLs, which would collapse
-- the whole expression to NULL.
CREATE OR REPLACE FUNCTION audit_log_canonical_payload(rec audit_logs)
RETURNS TEXT AS $$
  SELECT concat_ws('|',
    COALESCE(rec.id::text, ''),
    COALESCE(rec.organization_id::text, ''),
    COALESCE(rec.user_id::text, ''),
    COALESCE(rec.event_type, ''),
    COALESCE(rec.resource_type, ''),
    COALESCE(rec.resource_id::text, ''),
    COALESCE(rec.details::text, ''),
    COALESCE(rec.ip_address, ''),
    COALESCE(rec.user_agent, ''),
    COALESCE(rec.success::text, ''),
    COALESCE(rec.failure_reason, ''),
    COALESCE(rec.outcome, ''),
    COALESCE(rec.actor_name, ''),
    COALESCE(rec.source_system, ''),
    COALESCE(rec.request_id, ''),
    COALESCE(to_char(rec.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION audit_log_chain_append()
RETURNS TRIGGER AS $$
DECLARE
  head TEXT;
BEGIN
  -- Serialize appends per organization. Transaction-scoped, so it is released
  -- on COMMIT or ROLLBACK without an explicit unlock.
  PERFORM pg_advisory_xact_lock(
    hashtext('audit_logs_chain:' || COALESCE(NEW.organization_id::text, 'platform'))
  );

  SELECT record_hash INTO head
    FROM audit_logs
   WHERE organization_id IS NOT DISTINCT FROM NEW.organization_id
     AND record_hash IS NOT NULL
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  NEW.prev_hash := head;
  NEW.record_hash := encode(
    digest(audit_log_canonical_payload(NEW) || '|' || COALESCE(head, 'GENESIS'), 'sha384'),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_chain ON audit_logs;
CREATE TRIGGER audit_logs_chain
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_chain_append();

-- The append-only trigger must keep allowing the siem_forwarded write, which
-- happens after the hash is computed. siem_forwarded is intentionally absent
-- from the canonical payload above so that legitimate update does not
-- invalidate the row's own hash.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'audit_logs_organization_id_fkey'
       AND table_name = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_organization_id_fkey;
  END IF;
END$$;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN audit_logs.prev_hash IS
  'AU-9(3): record_hash of the preceding record for this organization. NULL on rows written before the chain migration, and on the first row of each chain.';
COMMENT ON COLUMN audit_logs.record_hash IS
  'AU-9(3): SHA-384 over this record''s forensic fields plus prev_hash. Excludes siem_forwarded, which is written after insert. Verify with scripts/verify-audit-chain.js.';

SELECT 'Migration 155 completed.' AS result;
