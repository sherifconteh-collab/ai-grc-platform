-- Migration 041: SSO Configuration
-- Supports generic OIDC (any IdP), social OAuth (Google, Microsoft, Apple, GitHub),
-- and SAML via metadata URL.
--
-- Each organization can have at most one SSO configuration.
-- Social login providers are configured at platform level via environment variables.

CREATE TABLE IF NOT EXISTS sso_configurations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider type
  provider_type   VARCHAR(32) NOT NULL
                    CHECK (provider_type IN ('oidc','saml')),

  -- Display name shown on login button (e.g. "Acme Corp SSO")
  display_name    VARCHAR(255) NOT NULL DEFAULT 'SSO',

  -- OIDC fields
  discovery_url   TEXT,   -- e.g. https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration
  client_id       TEXT,
  client_secret   TEXT,   -- stored encrypted via encrypt.js
  is_secret_encrypted BOOLEAN NOT NULL DEFAULT false,
  scopes          TEXT NOT NULL DEFAULT 'openid email profile',

  -- SAML fields
  metadata_url    TEXT,
  sp_entity_id    TEXT,

  -- Behaviour
  auto_provision  BOOLEAN NOT NULL DEFAULT true,   -- create user account on first SSO login
  default_role    VARCHAR(32) NOT NULL DEFAULT 'user',
  enabled         BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_config_org ON sso_configurations(organization_id);

-- Social login tokens linked to users
CREATE TABLE IF NOT EXISTS user_social_logins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(32) NOT NULL CHECK (provider IN ('google','microsoft','apple','github')),
  provider_user_id TEXT NOT NULL,
  email           TEXT,
  access_token    TEXT,    -- short-lived; refreshed on demand
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_logins_user    ON user_social_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_social_logins_provider ON user_social_logins(provider, provider_user_id);
