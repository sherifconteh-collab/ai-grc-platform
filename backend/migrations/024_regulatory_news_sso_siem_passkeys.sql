-- Migration 024: Regulatory News, SSO, SIEM, Passkeys + Evidence/SBOM column additions
-- Covers additional tables needed by newly created route files.

-- ============================================================
-- PART 0: Evidence table enhancements for UI-accessible columns
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence' AND column_name='title') THEN
    ALTER TABLE evidence ADD COLUMN title VARCHAR(500);
    UPDATE evidence SET title = file_name WHERE title IS NULL;
    ALTER TABLE evidence ALTER COLUMN title SET DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence' AND column_name='file_content') THEN
    ALTER TABLE evidence ADD COLUMN file_content BYTEA;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence' AND column_name='pii_classification') THEN
    ALTER TABLE evidence ADD COLUMN pii_classification VARCHAR(50);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence' AND column_name='pii_types') THEN
    ALTER TABLE evidence ADD COLUMN pii_types TEXT[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence' AND column_name='data_sensitivity') THEN
    ALTER TABLE evidence ADD COLUMN data_sensitivity VARCHAR(50);
  END IF;
END $$;

-- evidence_control_links: ensure linked_by column exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidence_control_links' AND column_name='linked_by') THEN
    ALTER TABLE evidence_control_links ADD COLUMN linked_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- vulnerabilities: add partial unique constraint on (organization_id, vuln_id)
-- NULLs are never considered equal in PostgreSQL unique constraints, so rows
-- without a vuln_id will not conflict with each other — only named CVE/vuln IDs
-- are deduplicated within an organization.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_vulnerability_org_id_vuln_id'
  ) THEN
    ALTER TABLE vulnerabilities ADD CONSTRAINT uq_vulnerability_org_id_vuln_id UNIQUE (organization_id, vuln_id);
  END IF;
END $$;

-- ============================================================
-- PART 0b: SBOM table enhancements
-- ============================================================
-- sbom_records already has raw_content (JSONB) and created_by from migration 022.
-- Only add columns not already present.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sbom_components' AND column_name='purl') THEN
    ALTER TABLE sbom_components ADD COLUMN purl TEXT;
  END IF;
END $$;

-- ============================================================
-- PART 0c: Assets table enhancements
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='ip_address') THEN
    ALTER TABLE assets ADD COLUMN ip_address VARCHAR(45);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='hostname') THEN
    ALTER TABLE assets ADD COLUMN hostname VARCHAR(255);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='os') THEN
    ALTER TABLE assets ADD COLUMN os VARCHAR(100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='criticality') THEN
    ALTER TABLE assets ADD COLUMN criticality VARCHAR(20);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='category_id') THEN
    ALTER TABLE assets ADD COLUMN category_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- PART 0d: Vulnerabilities table enhancements
-- (cvss_score and created_by already exist in migration 015)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vulnerabilities' AND column_name='affected_component') THEN
    ALTER TABLE vulnerabilities ADD COLUMN affected_component VARCHAR(500);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vulnerabilities' AND column_name='remediation') THEN
    ALTER TABLE vulnerabilities ADD COLUMN remediation TEXT;
  END IF;
END $$;

-- ============================================================
-- PART 1: regulatory_news_items
-- ============================================================

CREATE TABLE IF NOT EXISTS regulatory_news_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = global feed
  title           TEXT        NOT NULL,
  summary         TEXT,
  body            TEXT,
  source          VARCHAR(200),
  source_url      TEXT,
  category        VARCHAR(100),
  jurisdiction    VARCHAR(100),
  effective_date  DATE,
  published_at    TIMESTAMP,
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  tags            TEXT[],
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rni_org
  ON regulatory_news_items(organization_id, is_read, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_rni_category
  ON regulatory_news_items(category);

-- ============================================================
-- PART 2: sso_configurations (SSO provider config per org)
-- ============================================================

CREATE TABLE IF NOT EXISTS sso_configurations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  provider        VARCHAR(50) NOT NULL DEFAULT 'saml', -- saml / oidc / oauth2
  is_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  client_id       VARCHAR(500),
  client_secret   TEXT,
  metadata_url    TEXT,
  login_url       TEXT,
  logout_url      TEXT,
  certificate     TEXT,
  attribute_mapping JSONB,
  extra_config    JSONB,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PART 3: user_social_logins (tracks OAuth / SSO linked accounts)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_social_logins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL, -- google / github / microsoft / saml
  provider_user_id VARCHAR(500) NOT NULL,
  email           VARCHAR(255),
  display_name    VARCHAR(255),
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMP,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_usl_user
  ON user_social_logins(user_id);

-- ============================================================
-- PART 4: siem_configurations (SIEM / Splunk / Elastic)
-- ============================================================

CREATE TABLE IF NOT EXISTS siem_configurations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL, -- splunk / elastic / sentinel / qradar
  endpoint_url    TEXT,
  api_key         TEXT,
  index_name      VARCHAR(200),
  enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
  last_sync_at    TIMESTAMP,
  extra_config    JSONB,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siem_org
  ON siem_configurations(organization_id);

-- ============================================================
-- PART 5: user_passkeys (WebAuthn passkeys)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_passkeys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id   TEXT        NOT NULL UNIQUE,
  public_key      TEXT        NOT NULL,
  counter         BIGINT      NOT NULL DEFAULT 0,
  transports      TEXT[],
  device_type     VARCHAR(50),
  backed_up       BOOLEAN     NOT NULL DEFAULT FALSE,
  name            VARCHAR(200),
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_up_user
  ON user_passkeys(user_id);

-- ============================================================
-- PART 6: integrations_hub_connectors (if not already in 098)
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations_hub_connectors (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_type  VARCHAR(100) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  config          JSONB,
  status          VARCHAR(30)  NOT NULL DEFAULT 'inactive',
  last_synced_at  TIMESTAMP,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ihc_org
  ON integrations_hub_connectors(organization_id);

SELECT 'Migration 024 completed.' AS result;
