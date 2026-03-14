-- Migration 066: Threat intelligence items
-- Stores CVEs, KEVs, ATT&CK techniques, and OTX pulses

CREATE TABLE IF NOT EXISTS threat_intelligence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feed_id UUID NOT NULL REFERENCES external_threat_feeds(id) ON DELETE CASCADE,
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('cve', 'kev', 'attack_technique', 'pulse', 'indicator')),
  external_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  cvss_score NUMERIC(3,1) CHECK (cvss_score >= 0 AND cvss_score <= 10),
  cvss_vector TEXT,
  cwe_ids TEXT[],
  affected_products TEXT[],
  exploit_available BOOLEAN DEFAULT false,
  exploit_maturity VARCHAR(50),
  published_at TIMESTAMP,
  modified_at TIMESTAMP,
  due_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (organization_id, feed_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_threat_items_org ON threat_intelligence_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_threat_items_feed ON threat_intelligence_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_threat_items_type ON threat_intelligence_items(item_type);
CREATE INDEX IF NOT EXISTS idx_threat_items_external_id ON threat_intelligence_items(external_id);
CREATE INDEX IF NOT EXISTS idx_threat_items_severity ON threat_intelligence_items(severity);
CREATE INDEX IF NOT EXISTS idx_threat_items_cvss ON threat_intelligence_items(cvss_score DESC) WHERE cvss_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threat_items_exploit ON threat_intelligence_items(exploit_available) WHERE exploit_available = true;
CREATE INDEX IF NOT EXISTS idx_threat_items_published ON threat_intelligence_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_items_metadata ON threat_intelligence_items USING GIN(metadata);

COMMENT ON TABLE threat_intelligence_items IS 'Aggregated threat intelligence from multiple feeds';
COMMENT ON COLUMN threat_intelligence_items.item_type IS 'Type: cve, kev, attack_technique, pulse, indicator';
COMMENT ON COLUMN threat_intelligence_items.external_id IS 'External identifier (CVE-ID, ATT&CK ID, etc.)';
COMMENT ON COLUMN threat_intelligence_items.cwe_ids IS 'Array of CWE identifiers';
COMMENT ON COLUMN threat_intelligence_items.exploit_available IS 'Whether active exploits are known';
COMMENT ON COLUMN threat_intelligence_items.exploit_maturity IS 'Exploit maturity level (e.g., functional, high, proof-of-concept)';

SELECT 'Migration 066 completed.' AS result;
