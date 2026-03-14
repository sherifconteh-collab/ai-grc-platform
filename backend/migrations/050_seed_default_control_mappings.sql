-- Migration 050: Seed baseline auto-crosswalk mappings for AI-focused frameworks.
-- This is intentionally idempotent and safe to rerun.
--
-- Why:
-- Auto-crosswalk relies on control_mappings. Some deployments can have controls
-- loaded without baseline mappings, which makes crosswalk appear non-functional.
-- These curated pairs align OWASP LLM Top 10, OWASP Agentic Top 10, and ISO 42005.

WITH raw_pairs AS (
  SELECT *
  FROM (
    VALUES
      ('owasp_llm_top10', 'LLM01', 'owasp_agentic_top10', 'AGENT04', 97, 'equivalent', 'Prompt injection safeguards align across LLM and agentic chains.'),
      ('owasp_llm_top10', 'LLM03', 'owasp_agentic_top10', 'AGENT08', 96, 'equivalent', 'AI supply chain and plugin security controls align.'),
      ('owasp_llm_top10', 'LLM05', 'owasp_agentic_top10', 'AGENT02', 92, 'equivalent', 'Output and action boundary controls cover similar risk surface.'),
      ('owasp_llm_top10', 'LLM06', 'owasp_agentic_top10', 'AGENT05', 90, 'supporting', 'Agency restrictions map to human oversight guardrails.'),
      ('owasp_llm_top10', 'LLM07', 'owasp_agentic_top10', 'AGENT06', 90, 'supporting', 'System prompt protection overlaps with context integrity controls.'),
      ('owasp_llm_top10', 'LLM08', 'owasp_agentic_top10', 'AGENT06', 91, 'supporting', 'Embedding/vector security aligns with memory and context integrity.'),
      ('owasp_llm_top10', 'LLM10', 'owasp_agentic_top10', 'AGENT10', 96, 'equivalent', 'Rate limiting and runaway loop prevention are strongly aligned.'),

      ('owasp_llm_top10', 'LLM01', 'iso_42005', 'IA-5', 90, 'supporting', 'Prompt-injection defenses support impact identification workflows.'),
      ('owasp_llm_top10', 'LLM02', 'iso_42005', 'IA-8', 90, 'supporting', 'Sensitive data disclosure controls support traceability and accountability evidence.'),
      ('owasp_llm_top10', 'LLM03', 'iso_42005', 'IA-4', 90, 'supporting', 'Supply chain controls support governance of model/data/oversight inputs.'),
      ('owasp_llm_top10', 'LLM04', 'iso_42005', 'IA-4', 91, 'supporting', 'Poisoning prevention aligns with data and model input controls.'),
      ('owasp_llm_top10', 'LLM09', 'iso_42005', 'IA-6', 90, 'supporting', 'Hallucination/misinformation safeguards support impact evaluation and risk rating.'),
      ('owasp_llm_top10', 'LLM10', 'iso_42005', 'IA-10', 92, 'supporting', 'Unbounded consumption controls support lifecycle monitoring updates.'),

      ('owasp_agentic_top10', 'AGENT01', 'iso_42005', 'IA-7', 90, 'supporting', 'Authorization and least privilege support mitigation planning.'),
      ('owasp_agentic_top10', 'AGENT02', 'iso_42005', 'IA-7', 92, 'supporting', 'Tool/action boundary controls directly support mitigation plans.'),
      ('owasp_agentic_top10', 'AGENT03', 'iso_42005', 'IA-2', 90, 'supporting', 'Multi-agent trust controls align with stakeholder and impacted-party governance.'),
      ('owasp_agentic_top10', 'AGENT04', 'iso_42005', 'IA-5', 90, 'supporting', 'Agent-chain prompt injection defenses support impact identification.'),
      ('owasp_agentic_top10', 'AGENT05', 'iso_42005', 'IA-4', 91, 'supporting', 'Human-in-the-loop controls align with oversight and input governance.'),
      ('owasp_agentic_top10', 'AGENT06', 'iso_42005', 'IA-10', 90, 'supporting', 'Memory/context integrity supports ongoing lifecycle monitoring.'),
      ('owasp_agentic_top10', 'AGENT07', 'iso_42005', 'IA-7', 94, 'equivalent', 'Approval gates and irreversible-action prevention map to mitigation planning.'),
      ('owasp_agentic_top10', 'AGENT08', 'iso_42005', 'IA-4', 90, 'supporting', 'Agentic supply chain controls align with model/data input governance.'),
      ('owasp_agentic_top10', 'AGENT09', 'iso_42005', 'IA-8', 95, 'equivalent', 'Audit logging and explainability align with traceability and accountability.'),
      ('owasp_agentic_top10', 'AGENT10', 'iso_42005', 'IA-10', 94, 'equivalent', 'Runaway loop prevention aligns with lifecycle monitoring controls.')
  ) AS t (
    source_framework_code,
    source_control_code,
    target_framework_code,
    target_control_code,
    similarity_score,
    mapping_type,
    mapping_notes
  )
),
resolved_pairs AS (
  SELECT
    src.id AS source_control_id,
    tgt.id AS target_control_id,
    rp.similarity_score,
    rp.mapping_type,
    rp.mapping_notes
  FROM raw_pairs rp
  JOIN frameworks src_fw
    ON src_fw.code = rp.source_framework_code
   AND src_fw.is_active = true
  JOIN framework_controls src
    ON src.framework_id = src_fw.id
   AND src.control_id = rp.source_control_code
  JOIN frameworks tgt_fw
    ON tgt_fw.code = rp.target_framework_code
   AND tgt_fw.is_active = true
  JOIN framework_controls tgt
    ON tgt.framework_id = tgt_fw.id
   AND tgt.control_id = rp.target_control_code
  WHERE src.id <> tgt.id
),
dedup_pairs AS (
  SELECT
    LEAST(source_control_id, target_control_id) AS canonical_source_control_id,
    GREATEST(source_control_id, target_control_id) AS canonical_target_control_id,
    MAX(similarity_score) AS similarity_score,
    (ARRAY_AGG(mapping_type ORDER BY similarity_score DESC))[1] AS mapping_type,
    (ARRAY_AGG(mapping_notes ORDER BY similarity_score DESC))[1] AS mapping_notes
  FROM resolved_pairs
  GROUP BY
    LEAST(source_control_id, target_control_id),
    GREATEST(source_control_id, target_control_id)
),
inserted AS (
  INSERT INTO control_mappings (
    source_control_id,
    target_control_id,
    mapping_type,
    notes,
    similarity_score
  )
  SELECT
    dp.canonical_source_control_id,
    dp.canonical_target_control_id,
    dp.mapping_type,
    dp.mapping_notes,
    dp.similarity_score
  FROM dedup_pairs dp
  WHERE NOT EXISTS (
    SELECT 1
    FROM control_mappings cm
    WHERE
      (cm.source_control_id = dp.canonical_source_control_id AND cm.target_control_id = dp.canonical_target_control_id)
      OR
      (cm.source_control_id = dp.canonical_target_control_id AND cm.target_control_id = dp.canonical_source_control_id)
  )
  RETURNING id
)
SELECT 'Migration 050 completed. inserted_control_mappings=' || COUNT(*) AS result
FROM inserted;
