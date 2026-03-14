-- Migration 060: Jurisdiction Framework Recommendations
-- Adds recommended frameworks per jurisdiction for onboarding experience
-- Addresses feature request: recommend frameworks based on region selection

DO $$
BEGIN

  -- -----------------------------------------------------------------------
  -- Add recommended_frameworks field to regulatory_jurisdictions
  -- -----------------------------------------------------------------------
  ALTER TABLE regulatory_jurisdictions
    ADD COLUMN IF NOT EXISTS recommended_frameworks JSONB DEFAULT '[]';

  COMMENT ON COLUMN regulatory_jurisdictions.recommended_frameworks IS
    'Array of framework codes recommended for organizations in this jurisdiction (e.g., ["nist_ai_rmf", "eu_ai_act", "gdpr"])';

  -- -----------------------------------------------------------------------
  -- Update existing jurisdictions with recommended frameworks
  -- -----------------------------------------------------------------------
  
  -- European Union: GDPR, EU AI Act, ISO 27001, ISO 42001
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["gdpr", "eu_ai_act", "iso_27001", "iso_42001", "nist_ai_rmf"]'
  WHERE jurisdiction_code = 'EU';

  -- United States: NIST 800-53, NIST CSF, SOC 2, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["nist_800_53", "nist_csf_2.0", "soc_2", "nist_ai_rmf"]'
  WHERE jurisdiction_code = 'US';

  -- United Kingdom: UK GDPR, ISO 27001, Cyber Essentials, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["gdpr", "iso_27001", "nist_csf_2.0", "nist_ai_rmf"]'
  WHERE jurisdiction_code = 'UK';

  -- China: PIPL, ISO 27001, Generative AI measures compliance
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["iso_27001", "nist_ai_rmf", "iso_42001"]'
  WHERE jurisdiction_code = 'CN';

  -- California: CCPA/CPRA, SOC 2, NIST CSF, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["soc_2", "nist_csf_2.0", "nist_ai_rmf", "nist_800_53"]'
  WHERE jurisdiction_code = 'CA';

  -- Singapore: PDPA, Model AI Governance Framework, ISO 27001
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["iso_27001", "nist_ai_rmf", "iso_42001", "soc_2"]'
  WHERE jurisdiction_code = 'SG';

  -- India: DPDP Act, ISO 27001, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["iso_27001", "nist_ai_rmf", "iso_42001"]'
  WHERE jurisdiction_code = 'IN';

  -- Brazil: LGPD, ISO 27001, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["iso_27001", "nist_ai_rmf", "iso_42001"]'
  WHERE jurisdiction_code = 'BR';

  -- Australia: Privacy Act, ISO 27001, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["iso_27001", "nist_csf_2.0", "nist_ai_rmf"]'
  WHERE jurisdiction_code = 'AU';

  -- Japan: APPI, ISO 27001, NIST AI RMF
  UPDATE regulatory_jurisdictions
  SET recommended_frameworks = '["iso_27001", "nist_ai_rmf", "iso_42001"]'
  WHERE jurisdiction_code = 'JP';

END $$;

SELECT 'Migration 060 completed: Jurisdiction framework recommendations added' AS result;
