-- Migration 123: Add frameworks.coverage_status for honest catalog labeling
--
-- Framework control-set completeness was audited and found highly variable:
-- most catalogs are a curated "core control set" rather than a full
-- transcription of the official standard (e.g. NIST 800-53 Rev 5 ships
-- 13/20 families base-only vs the official ~322 base controls), a few are
-- fully complete (COBIT 2019, the OWASP Top-10s, and ControlWeave's own
-- state/international AI-law compilations), and several are intentionally
-- representative/illustrative guidance frameworks with no single canonical
-- enumerated control list (e.g. NERC CIP, FFIEC, FISCAM). This column lets
-- the UI say so accurately instead of implying uniform completeness.
-- Ships in the feature-audit-fixes batch.

ALTER TABLE frameworks ADD COLUMN IF NOT EXISTS coverage_status VARCHAR(20) DEFAULT 'core_controls';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'frameworks_coverage_status_valid'
  ) THEN
    ALTER TABLE frameworks
      ADD CONSTRAINT frameworks_coverage_status_valid
      CHECK (coverage_status IN ('comprehensive', 'core_controls', 'representative'));
  END IF;
END $$;

-- Verified complete against their official/self-defined catalog size.
UPDATE frameworks SET coverage_status = 'comprehensive'
WHERE code IN (
  'cobit_2019', 'owasp_llm_top10', 'owasp_agentic_top10',
  'state_ai_governance', 'international_ai_governance'
);

-- Examination-handbook / guidance frameworks with no single canonical
-- enumerated control list -- intentionally illustrative, not partial.
UPDATE frameworks SET coverage_status = 'representative'
WHERE code IN (
  'nist_privacy', 'fiscam', 'finra_supervisory_ai', 'sec_markets_ai_risk',
  'sr_11_7', 'iso_42005', 'iso_27005', 'iso_31000', 'ffiec', 'nerc_cip',
  'hitech', 'ccpa_cpra', 'nist_800_207', 'aiuc_1'
);

-- Everything else keeps the DEFAULT 'core_controls' -- a real, growing
-- subset of the official catalog (see scripts/seed-missing-controls.js
-- and the Wave 1-4 completion plan for the completion roadmap).

SELECT 'Migration 123 completed.' AS result;
