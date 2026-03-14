-- Migration 065: External threat intelligence feeds
-- Supports NIST NVD, CISA KEV, MITRE ATT&CK, AlienVault OTX

CREATE TABLE IF NOT EXISTS external_threat_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feed_type VARCHAR(50) NOT NULL CHECK (feed_type IN ('nvd', 'cisa_kev', 'mitre', 'otx')),
  feed_name VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  api_key_encrypted TEXT,
  configuration JSONB DEFAULT '{}',
  last_sync_at TIMESTAMP,
  last_sync_status VARCHAR(50) CHECK (last_sync_status IN ('success', 'error', 'pending', 'never')),
  sync_error_message TEXT,
  rate_limit_remaining INTEGER,
  rate_limit_reset_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (organization_id, feed_type)
);

CREATE INDEX IF NOT EXISTS idx_threat_feeds_org ON external_threat_feeds(organization_id);
CREATE INDEX IF NOT EXISTS idx_threat_feeds_type ON external_threat_feeds(feed_type);
CREATE INDEX IF NOT EXISTS idx_threat_feeds_enabled ON external_threat_feeds(is_enabled);
CREATE INDEX IF NOT EXISTS idx_threat_feeds_sync ON external_threat_feeds(last_sync_at DESC) WHERE is_enabled = true;

COMMENT ON TABLE external_threat_feeds IS 'Configuration for external threat intelligence feeds';
COMMENT ON COLUMN external_threat_feeds.feed_type IS 'Type of feed: nvd, cisa_kev, mitre, otx';
COMMENT ON COLUMN external_threat_feeds.api_key_encrypted IS 'AES-256 encrypted API key for authenticated feeds';
COMMENT ON COLUMN external_threat_feeds.configuration IS 'Feed-specific configuration (filters, preferences, etc.)';

SELECT 'Migration 065 completed.' AS result;
