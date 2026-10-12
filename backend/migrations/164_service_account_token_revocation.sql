-- Migration 164: Service account token revocation columns
--
-- Why: middleware/auth.js now checks every service account token against its
-- service_accounts row (active, same organization, same owner, token_hash
-- match, token_expires_at not passed), so regenerating, deactivating,
-- reassigning or deleting an account revokes earlier tokens. The
-- generate-token route has always tried to write these two columns, but no
-- migration created them, so the write was skipped and tokens could not be
-- revoked.
--
-- Ships in: the next weekly release after the security-review 2026-10-12 PR.
--
-- Additive and nullable. Existing rows keep NULL, which authenticate() treats
-- as "no valid token" (fail closed): tokens issued before this migration must
-- be regenerated.
ALTER TABLE service_accounts
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at DATE;
