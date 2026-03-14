-- Migration 061: Add Region Tracking for Data Sovereignty Planning
-- Adds region and country_code fields to users and organizations tables
-- Captures geolocation data from IP addresses on signup/login for compliance

DO $$
BEGIN

  -- -----------------------------------------------------------------------
  -- Add region tracking fields to users table
  -- -----------------------------------------------------------------------
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2),
    ADD COLUMN IF NOT EXISTS region VARCHAR(100);

  COMMENT ON COLUMN users.country_code IS
    'ISO 3166-1 alpha-2 country code captured from IP geolocation (e.g., US, GB, DE)';
  COMMENT ON COLUMN users.region IS
    'Geographic region or continent (e.g., North America, Europe, Asia Pacific)';

  -- -----------------------------------------------------------------------
  -- Add region tracking fields to organizations table
  -- -----------------------------------------------------------------------
  ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2),
    ADD COLUMN IF NOT EXISTS region VARCHAR(100);

  COMMENT ON COLUMN organizations.country_code IS
    'ISO 3166-1 alpha-2 country code of organization primary location';
  COMMENT ON COLUMN organizations.region IS
    'Geographic region or continent of organization (e.g., North America, Europe, Asia Pacific)';

  -- -----------------------------------------------------------------------
  -- Add index for efficient region-based queries
  -- -----------------------------------------------------------------------
  CREATE INDEX IF NOT EXISTS idx_organizations_region 
    ON organizations(region) WHERE region IS NOT NULL;
  
  CREATE INDEX IF NOT EXISTS idx_organizations_country_code 
    ON organizations(country_code) WHERE country_code IS NOT NULL;

END $$;

SELECT 'Migration 061 completed: Region tracking fields added to users and organizations' AS result;
