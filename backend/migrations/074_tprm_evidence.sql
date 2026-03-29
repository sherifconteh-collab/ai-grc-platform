-- Migration 074: TPRM Evidence table
-- Stores files (SBOMs, PDFs, certs, etc.) uploaded by vendors alongside questionnaire responses

CREATE TABLE IF NOT EXISTS tprm_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES tprm_questionnaires(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  original_filename VARCHAR(512) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type VARCHAR(128),
  -- Parsed SBOM metadata (populated when file is a valid SBOM)
  is_sbom BOOLEAN DEFAULT FALSE,
  sbom_format VARCHAR(50),                 -- cyclonedx, spdx, swid
  sbom_component_count INTEGER,
  sbom_parsed_at TIMESTAMP,
  sbom_summary JSONB,                      -- {tool, version, components: [{name,version,purl}], vulnerabilities: [...]}
  -- Raw file content stored as text (UTF-8 or base64 for binary)
  file_content TEXT NOT NULL,
  -- AI analysis results
  ai_analysis TEXT,
  ai_analyzed_at TIMESTAMP,
  ai_risk_flags JSONB,                     -- [{severity, finding, recommendation}]
  uploaded_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tprm_evidence
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS sbom_parsed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
  ADD COLUMN IF NOT EXISTS ai_risk_flags JSONB,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP DEFAULT NOW();

UPDATE tprm_evidence
SET created_at = COALESCE(created_at, uploaded_at, NOW()),
    updated_at = COALESCE(updated_at, created_at, NOW()),
    uploaded_at = COALESCE(uploaded_at, created_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL
   OR uploaded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tprm_evidence_questionnaire ON tprm_evidence(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_tprm_evidence_org ON tprm_evidence(organization_id);
CREATE INDEX IF NOT EXISTS idx_tprm_evidence_sbom ON tprm_evidence(questionnaire_id) WHERE is_sbom = TRUE;

COMMENT ON TABLE tprm_evidence IS 'Evidence files (SBOMs, certs, reports) uploaded by vendors as part of questionnaire submissions';
COMMENT ON COLUMN tprm_evidence.sbom_summary IS 'Parsed SBOM component and vulnerability summary (populated for SBOM files)';
COMMENT ON COLUMN tprm_evidence.ai_risk_flags IS 'AI-identified risk findings from evidence analysis';

SELECT 'Migration 074 completed.' AS result;
