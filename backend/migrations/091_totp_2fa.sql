-- Migration 091: TOTP Two-Factor Authentication (all tiers)
-- Adds TOTP-based 2FA available to all subscription tiers as a security option
-- while Passkey authentication remains gated at Professional+.
-- Backup codes are stored as a JSONB array of bcrypt hashes.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret       TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB;

CREATE INDEX IF NOT EXISTS idx_users_totp_enabled ON users(totp_enabled) WHERE totp_enabled = true;
