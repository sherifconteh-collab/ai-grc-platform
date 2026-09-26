-- Migration 158: Session hardening (refresh-token reuse detection, SSO handoff)
--
-- Part 1: refresh-token reuse detection.
--
-- Refresh tokens rotate on every use, but a replayed (already rotated) token
-- simply failed the lookup: nothing distinguished "stale token from a slow
-- second tab" from "token stolen and replayed by an attacker", and the
-- attacker's copy of the session family stayed alive until whoever refreshed
-- first lost the race. OWASP ASVS 3.5 / OAuth 2.0 Security BCP 4.14 call for
-- reuse detection: presenting a rotated refresh token revokes the session.
--
-- Each session keeps the hash of the token it rotated away from plus the
-- rotation time. A replay of that previous token after a short grace window
-- (which absorbs concurrent refreshes from multiple tabs) revokes the session.
--
-- Part 2: SSO handoff codes. SSO callbacks used to redirect to the frontend
-- with the access and refresh tokens in the URL fragment, where they land in
-- browser history and are readable by any script on the callback page. The
-- callback now redirects with a single-use, 60-second code (stored hashed) that
-- the frontend exchanges for tokens with a POST -- and that exchange is where
-- an enabled TOTP second factor is enforced, which SSO previously skipped.
--
-- Ships in the production-readiness Phase 0 security batch.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS previous_refresh_token TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_previous_refresh_token
  ON sessions (previous_refresh_token)
  WHERE previous_refresh_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS sso_handoff_codes (
  code_hash   TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_handoff_codes_expires_at
  ON sso_handoff_codes (expires_at);
