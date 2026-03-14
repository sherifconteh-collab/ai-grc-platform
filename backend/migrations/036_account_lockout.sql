-- Migration 036: Account lockout tracking
-- Adds per-account failed login attempt counter and lockout timestamp.
-- The application increments failed_login_attempts on each bad password,
-- sets locked_until = NOW() + lockout_duration after N failures,
-- and resets both columns to their defaults on a successful login.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- Partial index — only covers locked rows, so it stays tiny in normal operation.
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users (locked_until)
  WHERE locked_until IS NOT NULL;

SELECT 'Migration 036 completed.' AS result;
