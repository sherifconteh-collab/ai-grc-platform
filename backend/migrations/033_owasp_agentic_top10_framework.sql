-- OWASP Top 10 for Agentic AI Applications (2026)
-- Security risks specific to autonomous and multi-agent AI systems.

DO $$
DECLARE
  fw_id UUID;
BEGIN
  SELECT id INTO fw_id FROM frameworks WHERE code = 'owasp_agentic_top10' LIMIT 1;

  IF fw_id IS NULL THEN
    INSERT INTO frameworks (code, name, version, description, category, tier_required, is_active)
    VALUES (
      'owasp_agentic_top10',
      'OWASP Agentic AI Top 10 (2026)',
      '2026',
      'Security risks specific to agentic and autonomous AI applications, addressing threats unique to AI systems that act independently, use tools, chain actions, and operate across multi-agent pipelines.',
      'AI Security',
      'professional',
      true
    )
    RETURNING id INTO fw_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_id) THEN
    INSERT INTO framework_controls (framework_id, control_id, title, priority, control_type)
    VALUES
      (fw_id, 'AGENT01', 'Agentic Authorization and Least Privilege',         '1', 'technical'),
      (fw_id, 'AGENT02', 'Tool and Action Boundary Enforcement',               '1', 'technical'),
      (fw_id, 'AGENT03', 'Multi-Agent Trust and Verification Controls',        '1', 'technical'),
      (fw_id, 'AGENT04', 'Prompt Injection Across Agent Chains',               '1', 'technical'),
      (fw_id, 'AGENT05', 'Autonomous Action Oversight and Human-in-the-Loop',  '1', 'organizational'),
      (fw_id, 'AGENT06', 'Memory and Context Integrity Controls',              '2', 'technical'),
      (fw_id, 'AGENT07', 'Irreversible Action Prevention and Approval Gates',  '2', 'organizational'),
      (fw_id, 'AGENT08', 'Agentic Supply Chain and Plugin Security',           '2', 'strategic'),
      (fw_id, 'AGENT09', 'Audit Logging and Explainability for Agent Actions', '2', 'technical'),
      (fw_id, 'AGENT10', 'Resource Exhaustion and Runaway Loop Prevention',    '3', 'technical');
  END IF;
END $$;

SELECT 'Migration 033 completed.' AS result;
