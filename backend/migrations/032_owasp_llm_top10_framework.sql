-- OWASP LLM Top 10 (2025) - AI Security framework
-- https://owasp.org/www-project-top-10-for-large-language-model-applications/

DO $$
DECLARE
  fw_id UUID;
BEGIN
  SELECT id INTO fw_id FROM frameworks WHERE code = 'owasp_llm_top10' LIMIT 1;

  IF fw_id IS NULL THEN
    INSERT INTO frameworks (code, name, version, description, category, tier_required, is_active)
    VALUES (
      'owasp_llm_top10',
      'OWASP LLM Top 10 (2025)',
      '2025',
      'The OWASP Top 10 for Large Language Model Applications identifies the most critical security risks for LLM deployments including prompt injection, insecure output handling, data poisoning, and model supply chain risks.',
      'AI Security',
      'professional',
      true
    )
    RETURNING id INTO fw_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_id) THEN
    INSERT INTO framework_controls (framework_id, control_id, title, priority, control_type)
    VALUES
      (fw_id, 'LLM01', 'Prompt Injection Prevention',                '1', 'technical'),
      (fw_id, 'LLM02', 'Sensitive Information Disclosure Controls',   '1', 'technical'),
      (fw_id, 'LLM03', 'Supply Chain Risk Management for AI',         '1', 'strategic'),
      (fw_id, 'LLM04', 'Data and Model Poisoning Prevention',         '1', 'technical'),
      (fw_id, 'LLM05', 'Insecure Output Handling Mitigations',        '1', 'technical'),
      (fw_id, 'LLM06', 'Excessive Agency Restrictions',               '2', 'organizational'),
      (fw_id, 'LLM07', 'System Prompt Confidentiality Controls',      '2', 'technical'),
      (fw_id, 'LLM08', 'Vector and Embedding Security Controls',      '2', 'technical'),
      (fw_id, 'LLM09', 'Misinformation and Hallucination Safeguards', '2', 'policy'),
      (fw_id, 'LLM10', 'Unbounded Consumption Rate Limiting',         '3', 'technical');
  END IF;
END $$;

SELECT 'Migration 032 completed.' AS result;
