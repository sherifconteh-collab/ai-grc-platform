-- Migration 022: SBOM ingestion and component tracking
-- Adds first-class SBOM records, parsed components, and component-level vulnerabilities.

CREATE TABLE IF NOT EXISTS sboms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sbom_format VARCHAR(50) NOT NULL, -- CycloneDX, SPDX, SWID
  spec_version VARCHAR(32),
  serial_number VARCHAR(255),
  version INTEGER,
  tool_name VARCHAR(255),
  tool_version VARCHAR(100),
  generated_at TIMESTAMP,
  file_name VARCHAR(255),
  source VARCHAR(64) DEFAULT 'upload',
  sbom_data JSONB NOT NULL,
  total_components INTEGER DEFAULT 0,
  vulnerabilities_found INTEGER DEFAULT 0,
  critical_vulnerabilities INTEGER DEFAULT 0,
  high_vulnerabilities INTEGER DEFAULT 0,
  license_issues INTEGER DEFAULT 0,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sboms_org ON sboms(organization_id);
CREATE INDEX IF NOT EXISTS idx_sboms_asset ON sboms(asset_id);
CREATE INDEX IF NOT EXISTS idx_sboms_uploaded_at ON sboms(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS software_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sbom_id UUID NOT NULL REFERENCES sboms(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  parent_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  bom_ref VARCHAR(500),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(100),
  purl VARCHAR(500),
  cpe VARCHAR(500),
  component_type VARCHAR(100),
  vendor VARCHAR(255),
  supplier VARCHAR(255),
  author VARCHAR(255),
  licenses JSONB,
  known_vulnerabilities INTEGER DEFAULT 0,
  highest_severity VARCHAR(20),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_software_components_org ON software_components(organization_id);
CREATE INDEX IF NOT EXISTS idx_software_components_sbom ON software_components(sbom_id);
CREATE INDEX IF NOT EXISTS idx_software_components_parent_asset ON software_components(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_software_components_purl ON software_components(purl);

CREATE TABLE IF NOT EXISTS component_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES software_components(id) ON DELETE CASCADE,
  vulnerability_finding_id UUID REFERENCES vulnerability_findings(id) ON DELETE SET NULL,
  cve_id VARCHAR(50),
  cwe_id VARCHAR(50),
  severity VARCHAR(50),
  cvss_score DECIMAL(3,1),
  title TEXT,
  description TEXT,
  fix_available BOOLEAN DEFAULT FALSE,
  fixed_in_version VARCHAR(100),
  patch_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'open', -- open, acknowledged, mitigated, resolved, false_positive
  risk_accepted BOOLEAN DEFAULT FALSE,
  risk_acceptance_reason TEXT,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_date TIMESTAMP,
  discovered_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_component_vulns_component ON component_vulnerabilities(component_id);
CREATE INDEX IF NOT EXISTS idx_component_vulns_severity ON component_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_component_vulns_status ON component_vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_component_vulns_cve ON component_vulnerabilities(cve_id);

COMMENT ON TABLE sboms IS 'Uploaded SBOM records and parsing outcomes for CMDB and vulnerability linkage';
COMMENT ON TABLE software_components IS 'Software components extracted from SBOM uploads';
COMMENT ON TABLE component_vulnerabilities IS 'Component-level vulnerabilities from SBOM data and linked findings';

SELECT 'Migration 022 completed.' AS result;
