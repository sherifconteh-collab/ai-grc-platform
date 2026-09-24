-- Migration 152: Convert audit_logs.created_at to timestamptz (NIST AU-8)
--
-- AU-8 (Time Stamps) requires audit records to carry timestamps that can be
-- mapped to Coordinated Universal Time. audit_logs.created_at was created as
-- TIMESTAMP WITHOUT TIME ZONE in 001_initial_schema.sql and is defaulted
-- server-side by NOW(), so the recorded instant is only interpretable if the
-- reader independently knows the database server's zone -- and nothing in the
-- record states it. Two deployments in different zones produce audit trails
-- that cannot be correlated, which is exactly what AU-8 exists to prevent.
--
-- This also brings the column in line with .claude/rules/database.md, whose
-- data-type table specifies timestamptz and explicitly lists bare `timestamp`
-- as the type to avoid. agent_audit_events (092) already uses TIMESTAMPTZ;
-- audit_logs was the outlier.
--
-- The FedRAMP deployment guide previously claimed "All records use timestamptz
-- (UTC)" for AU-8. That claim was corrected to describe the real type in the
-- documentation pass that precedes this migration; this migration is what
-- makes the original claim true.
--
-- CONVERSION SAFETY: existing rows were written by NOW() under a TIMESTAMP
-- column, which captured the database server's local wall-clock time. The
-- USING clause below interprets those stored values as UTC. That is correct
-- for a server running UTC, which is the case for the containerized and
-- Railway deployments this repo targets. Before applying to a deployment whose
-- database is NOT in UTC, substitute the real zone in the USING clause --
-- otherwise every historical timestamp shifts by the server's offset.
-- Check with: SHOW timezone;
--
-- Ordering note: migration 153 in this same batch adds the append-only
-- triggers this repository has been missing. This conversion runs first, while
-- the table is still freely rewritable, so the two do not interact. (Even
-- reversed it would be safe -- ALTER COLUMN TYPE is a table rewrite, not
-- row-level DML, so a BEFORE UPDATE trigger would not fire -- but running the
-- type change first avoids relying on that.)
--
-- Ships in the AU control family remediation batch.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'audit_logs'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE audit_logs
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'UTC';
  END IF;
END$$;

COMMENT ON COLUMN audit_logs.created_at IS
  'AU-8: instant the audit record was written, stored as timestamptz so it is unambiguously mappable to UTC. Set server-side by NOW() -- never supplied by the caller.';

-- Document the two columns whose population is narrower than their presence
-- suggests. Before this batch, services/auditService.js#extractAuditContext
-- attempted to read both from the request and always got undefined -- the JWT
-- payload carries only userId, the authenticate middleware selects neither
-- column, and express-session is not a dependency. Those dead reads are
-- removed in the same change; the columns are retained because
-- authentication_method is genuinely populated by authentication events, and
-- because request_id already provides per-request correlation for everything
-- else.
COMMENT ON COLUMN audit_logs.authentication_method IS
  'Populated for authentication events only (password, sso), set explicitly by auditService.logAuthentication/logLogout. NULL on request-derived records -- not derivable from a request.';

COMMENT ON COLUMN audit_logs.session_id IS
  'Reserved. No writer populates this today: the platform issues stateless JWTs with no session identifier. Use request_id for per-request correlation.';

SELECT 'Migration 152 completed.' AS result;
