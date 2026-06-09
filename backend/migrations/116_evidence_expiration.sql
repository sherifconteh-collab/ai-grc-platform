-- 116_evidence_expiration.sql
--
-- Why: time-sensitive evidence (certifications, audit reports, pen-test
-- results) loses validity, but the evidence table only tracked
-- retention_until (how long to keep the file), not when the evidence stops
-- demonstrating compliance. This adds an explicit validity expiration date
-- so the reminder sweep can warn owners before evidence goes stale and
-- dashboards can flag expired evidence.
--
-- Ships in: v3.1.0
--
-- Idempotent: safe to re-run.

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS expires_at DATE;

-- Partial index: the reminder sweep and freshness queries only scan rows
-- that actually have an expiration set.
CREATE INDEX IF NOT EXISTS idx_evidence_org_expires
  ON evidence(organization_id, expires_at)
  WHERE expires_at IS NOT NULL;

SELECT 'Migration 116 completed.' AS result;
