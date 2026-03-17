-- Migration 096: Server License Key storage
-- Stores the activated perpetual license key for this self-hosted installation.
-- Allows license keys to persist across server restarts without requiring
-- manual edits to .env files.  Activated via POST /api/v1/license/activate.
--
-- Only one row is permitted (id = 1) — this is a server-wide setting.
-- id has no DEFAULT because the single-row constraint makes the value
-- fixed; INSERTs must always specify id = 1 explicitly.

CREATE TABLE IF NOT EXISTS server_license (
  id                   INTEGER PRIMARY KEY,
  license_key          TEXT NOT NULL,
  tier                 VARCHAR(50) NOT NULL,
  licensee             VARCHAR(255),
  seats                INTEGER DEFAULT -1,
  maintenance_until    DATE,
  activated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Ensures at most one row ever exists in this table.
  CONSTRAINT server_license_single_row CHECK (id = 1)
);

COMMENT ON TABLE server_license IS
  'Holds at most one row: the activated perpetual license key for this server instance.';
