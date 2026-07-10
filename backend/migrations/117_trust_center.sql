-- Migration 117: Trust Center (public compliance-posture page)
-- Why: gives each organization an optional, shareable, read-only public page showing
-- aggregate compliance posture (framework scores, active authorizations) so customers
-- and auditors can self-serve verification without an account. Exposure is opt-in and
-- section-by-section; the page is only reachable via a cryptographically random token.
-- Ships in release 4.3.0.

CREATE TABLE IF NOT EXISTS trust_center_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- 64 hex chars from crypto.randomBytes(32); the only public lookup key.
  public_token VARCHAR(64) NOT NULL,

  display_name VARCHAR(255),
  description TEXT,
  contact_email VARCHAR(255),

  -- Section toggles: nothing is exposed unless explicitly enabled here AND enabled = true.
  show_frameworks BOOLEAN NOT NULL DEFAULT TRUE,
  show_compliance_scores BOOLEAN NOT NULL DEFAULT TRUE,
  show_authorizations BOOLEAN NOT NULL DEFAULT TRUE,

  published_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- One config per organization.
  CONSTRAINT trust_center_org_unique UNIQUE (organization_id),

  -- SECURITY: the token is the sole public lookup key, so it must be globally unique;
  -- a collision would let one tenant's page resolve to another tenant's data.
  CONSTRAINT trust_center_token_unique UNIQUE (public_token)
);

CREATE INDEX IF NOT EXISTS idx_trust_center_token
ON trust_center_configs (public_token)
WHERE enabled = true;

COMMENT ON TABLE trust_center_configs IS 'Per-org configuration for the public Trust Center page (token-gated, aggregate data only).';

SELECT 'Migration 117: Trust Center config created.' AS result;
