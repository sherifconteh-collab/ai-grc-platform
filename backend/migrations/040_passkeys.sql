-- Migration 040: WebAuthn / Passkey support
-- Stores registered passkeys per user and ephemeral registration/auth challenges

CREATE TABLE IF NOT EXISTS user_passkeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id   TEXT NOT NULL UNIQUE,
  public_key      TEXT NOT NULL,          -- base64url-encoded COSE public key
  counter         BIGINT NOT NULL DEFAULT 0,
  device_type     VARCHAR(32),            -- 'singleDevice' | 'multiDevice'
  backed_up       BOOLEAN NOT NULL DEFAULT false,
  transports      TEXT[],                 -- e.g. ['internal','hybrid','usb']
  name            VARCHAR(255) NOT NULL DEFAULT 'Passkey',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge   TEXT NOT NULL,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('registration','authentication')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id     ON user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential  ON user_passkeys(credential_id);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user   ON passkey_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expiry ON passkey_challenges(expires_at);
