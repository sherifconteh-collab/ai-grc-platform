-- Migration 153: Enforce audit_logs immutability at the database level (NIST AU-9)
--
-- AU-9 (Protection of Audit Information) requires audit records to be
-- protected from unauthorized modification and deletion. This repository had
-- no such protection. README.md and PROJECT_STATUS.md described the audit log
-- as "immutable" in five places, but the only thing standing between an audit
-- record and a rewrite was that routes/audit.js happens not to expose an
-- UPDATE or DELETE route. That is convention, not a control -- any other code
-- path (a future route, a script, a psql session using the same application
-- role) could freely rewrite or erase history. Those claims were corrected in
-- the documentation pass preceding this migration; this migration is what
-- makes them true again.
--
-- The row-level security policy added in 105_row_level_security.sql does not
-- help here: it is USING-only, which governs which rows a session can see,
-- not whether it may modify them.
--
-- This is a port of the sibling ControlWeaver-Pro repository's migration 121,
-- which has been enforcing this for some time. The logic is intentionally
-- identical so the two repositories do not drift on an audit control.
--
-- A trigger is used instead of REVOKE because this repo's hosted Postgres
-- setups typically run the whole application under one owning role, and
-- REVOKE has no effect on the object owner's own default privileges; a raised
-- exception inside the trigger fires unconditionally for any writer
-- regardless of role.
--
-- Scope of what this does and does not give you: the table becomes
-- tamper-RESISTANT, not tamper-EVIDENT. The application owns the table and can
-- therefore still issue ALTER TABLE ... DISABLE TRIGGER (the seed scripts do
-- exactly that, see below). Detecting a mutation that got through requires a
-- hash chain or an external write-once copy, neither of which exists yet.
--
-- Compatibility check performed before adding this: the only post-insert write
-- to audit_logs anywhere in this repository is the siem_forwarded flag set by
-- services/auditService.js:146, which the trigger explicitly permits. Unlike
-- the sibling repository, no seed or reset script here issues DELETE FROM
-- audit_logs, so nothing needed a trigger-disable wrapper. Any future script
-- that must clear tagged demo rows has to wrap the call in
-- `ALTER TABLE audit_logs DISABLE/ENABLE TRIGGER audit_logs_no_update`.
--
-- Ships in the AU control family remediation batch.

CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER AS $$
DECLARE
  old_with_new_flag audit_logs;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only (AU-9): DELETE is not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'audit_logs is append-only (AU-9): TRUNCATE is not permitted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- TG_OP = 'UPDATE': only the siem_forwarded metadata flag may change
  -- post-insert. It is set by services/auditService.js#forwardToSiem() once an
  -- event is confirmed delivered to the configured SIEM, and is the single
  -- legitimate post-insert write. Any change to a forensic field is rejected.
  old_with_new_flag := OLD;
  old_with_new_flag.siem_forwarded := NEW.siem_forwarded;

  IF old_with_new_flag IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION 'audit_logs is append-only (AU-9): only siem_forwarded may be updated post-insert'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION reject_audit_log_mutation();

COMMENT ON FUNCTION reject_audit_log_mutation() IS
  'AU-9: blocks DELETE/TRUNCATE on audit_logs and restricts UPDATE to the siem_forwarded flag only, so the table is append-only regardless of caller privileges.';

SELECT 'Migration 153 completed.' AS result;
