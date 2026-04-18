-- Migration 103: bcrypt cost tracking
--
-- v3.0.0 raises BCRYPT_COST from 12 -> 14. Existing hashes continue to verify
-- successfully; on a successful login the hash is silently re-hashed at the
-- new cost (see backend/src/routes/auth.js maybeUpgradePasswordHash).
--
-- This column lets operators query how many users still have legacy hashes
-- so they can target a forced password reset campaign for inactive accounts
-- if desired. The column is purely informational; the cost-of-record always
-- comes from the password_hash string itself.

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS password_cost SMALLINT;

-- Best-effort backfill from existing hashes; ignored if password_hash is NULL
-- or malformed.
UPDATE users
   SET password_cost = NULLIF(SUBSTRING(password_hash FROM '^\$2[abxy]\$(\d{2})\$'), '')::SMALLINT
 WHERE password_hash IS NOT NULL
   AND password_cost IS NULL;
