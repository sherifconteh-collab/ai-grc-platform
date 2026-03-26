-- Migration 101: User PII field-level encryption
--
-- Adds email_hash column to users for HMAC-SHA-384 searchable indexing
-- alongside AES-256-GCM encrypted-at-rest email storage.
--
-- Design:
--   email        VARCHAR  — stores AES-256-GCM ciphertext envelope for new/migrated rows
--                           (plain-text retained for existing rows until lazy-migration on login)
--   email_hash   VARCHAR  — stores HMAC-SHA-384(email, HMAC_KEY) for O(1) lookup
--                           NULL for rows not yet migrated; NULL values are excluded from
--                           the UNIQUE constraint in PostgreSQL so no conflict on old rows.
--
-- Existing rows are migrated lazily: on the user's first login/lookup after this migration
-- is applied, the application layer backfills email_hash automatically.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(96);

-- Unique constraint: prevents duplicate encrypted-email registrations.
-- NULL values are not considered equal, so pre-migration rows with email_hash IS NULL
-- do not conflict with each other.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_hash_unique' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_hash_unique UNIQUE (email_hash);
  END IF;
END$$;
