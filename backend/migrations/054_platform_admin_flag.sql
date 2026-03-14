-- Migration 054: platform admin flag on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_platform_admin
  ON users(is_platform_admin)
  WHERE is_platform_admin = TRUE;
