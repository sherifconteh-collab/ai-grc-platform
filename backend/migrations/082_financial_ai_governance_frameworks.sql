-- Migration 082: Financial AI Governance Frameworks (Utilities Tier)
-- Adds FINRA Supervisory AI, SEC AI Risk Management, and SR 11-7 Model Risk Management
-- frameworks as part of the Financial Services AI Governance Pack (utilities tier add-on).
-- Idempotent: uses IF NOT EXISTS checks before bulk insert per framework.

DO $$
DECLARE
  fw_finra   UUID;
  fw_sec     UUID;
  fw_sr117   UUID;
  fw_nist_ai UUID;
BEGIN

  -- ── 1. Insert frameworks ────────────────────────────────────────────────────

  SELECT id INTO fw_finra FROM frameworks WHERE code = 'finra_supervisory_ai' LIMIT 1;
  IF fw_finra IS NULL THEN
    INSERT INTO frameworks (code, name, version, category, tier_required, description)
    VALUES (
      'finra_supervisory_ai',
      'FINRA Supervisory Controls for AI (Notice 24-09)',
      '2024',
      'Financial Services AI Governance',
      'utilities',
      'FINRA Regulatory Notice 24-09 supervisory obligations for AI-generated communications, '
      'robo-advisory outputs, and algorithmic trading surveillance.'
    )
    RETURNING id INTO fw_finra;
  END IF;

  SELECT id INTO fw_sec FROM frameworks WHERE code = 'sec_markets_ai_risk' LIMIT 1;
  IF fw_sec IS NULL THEN
    INSERT INTO frameworks (code, name, version, category, tier_required, description)
    VALUES (
      'sec_markets_ai_risk',
      'SEC AI Risk Management for RIAs & Broker-Dealers',
      '2024',
      'Financial Services AI Governance',
      'utilities',
      'SEC guidance on conflicts-of-interest, fiduciary duty, and explainability requirements '
      'for AI-driven investment advice and automated compliance programmes.'
    )
    RETURNING id INTO fw_sec;
  END IF;

  SELECT id INTO fw_sr117 FROM frameworks WHERE code = 'sr_11_7' LIMIT 1;
  IF fw_sr117 IS NULL THEN
    INSERT INTO frameworks (code, name, version, category, tier_required, description)
    VALUES (
      'sr_11_7',
      'SR 11-7 Model Risk Management',
      '2011-Rev2024',
      'Financial Services AI Governance',
      'utilities',
      'Federal Reserve / OCC Supervisory Guidance SR 11-7 on Model Risk Management. '
      'Covers model development, validation, governance, and ongoing monitoring for '
      'models used in credit, market risk, and AI-driven decision-making.'
    )
    RETURNING id INTO fw_sr117;
  END IF;

  -- ── 2. Load NIST AI RMF framework ID ────────────────────────────────────────

  SELECT id INTO fw_nist_ai FROM frameworks WHERE code = 'nist_ai_rmf';

  -- ── 3. FINRA controls ───────────────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_finra) THEN
    INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
    VALUES
      (fw_finra, 'FINRA-SUP-1', 'AI Supervisory Framework',
       'Establish a written supervisory system for AI-generated recommendations and communications.',
       '1', 'policy'),
      (fw_finra, 'FINRA-SUP-2', 'Suitability and Best Interest Alignment',
       'Verify that AI outputs satisfy Reg BI best-interest obligations before customer delivery.',
       '1', 'technical'),
      (fw_finra, 'FINRA-SUP-3', 'AI-Generated Communications Review',
       'Review, approve, and retain AI-generated customer communications per Rule 2210.',
       '1', 'organizational'),
      (fw_finra, 'FINRA-SUP-4', 'Algorithmic Trading Surveillance',
       'Monitor algorithmic trading systems for manipulative patterns, wash sales, and layering.',
       '1', 'technical'),
      (fw_finra, 'FINRA-SUP-5', 'Third-Party AI Vendor Due Diligence',
       'Conduct due diligence and ongoing oversight of third-party AI vendors.',
       '1', 'strategic'),
      (fw_finra, 'FINRA-SUP-6', 'AI Incident Response and Escalation',
       'Define escalation paths and customer remediation procedures for AI failures.',
       '1', 'organizational'),
      (fw_finra, 'FINRA-SUP-7', 'AI Training and Competency',
       'Train registered representatives on AI limitations, override procedures, and customer disclosure.',
       '2', 'organizational'),
      (fw_finra, 'FINRA-SUP-8', 'Bias and Fairness Testing',
       'Test AI models for disparate impact across protected classes before deployment.',
       '1', 'technical'),
      (fw_finra, 'FINRA-SUP-9', 'AI Model Change Management',
       'Apply structured change-management processes to AI model updates and retraining.',
       '2', 'technical'),
      (fw_finra, 'FINRA-SUP-10', 'Audit Trail and Recordkeeping',
       'Maintain immutable audit trails of AI-generated decisions for FINRA examination.',
       '1', 'technical');
  END IF;

  -- ── 4. SEC controls ─────────────────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_sec) THEN
    INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
    VALUES
      (fw_sec, 'SEC-AI-1', 'Conflicts of Interest Disclosure',
       'Identify and disclose AI-driven conflicts of interest per Investment Advisers Act § 206.',
       '1', 'organizational'),
      (fw_sec, 'SEC-AI-2', 'Fiduciary Duty and Explainability',
       'Provide explainable AI recommendations that satisfy RIA fiduciary duties.',
       '1', 'technical'),
      (fw_sec, 'SEC-AI-3', 'Robo-Advisory Risk Assessment',
       'Document risk tolerance inputs, model logic, and investment selection rationale.',
       '1', 'strategic'),
      (fw_sec, 'SEC-AI-4', 'Cybersecurity and Data Privacy',
       'Protect AI training data and customer data under Regulation S-P.',
       '1', 'technical'),
      (fw_sec, 'SEC-AI-5', 'AI Model Governance Policy',
       'Publish a model governance policy covering development, validation, and retirement.',
       '1', 'policy'),
      (fw_sec, 'SEC-AI-6', 'Customer Disclosure and Consent',
       'Disclose AI use in investment decisions and obtain informed consent.',
       '1', 'organizational'),
      (fw_sec, 'SEC-AI-7', 'Human Oversight and Override',
       'Ensure human advisors can override AI recommendations with documented rationale.',
       '1', 'organizational'),
      (fw_sec, 'SEC-AI-8', 'Periodic Model Validation',
       'Conduct independent model validation at least annually or after material changes.',
       '1', 'technical'),
      (fw_sec, 'SEC-AI-9', 'Books and Records Retention',
       'Retain AI decision logs and supporting data per Rule 17a-4 requirements.',
       '1', 'technical'),
      (fw_sec, 'SEC-AI-10', 'Systemic Risk Monitoring',
       'Monitor AI-driven portfolio concentration and correlated market risk.',
       '2', 'strategic');
  END IF;

  -- ── 5. SR 11-7 controls ─────────────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_sr117) THEN
    INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
    VALUES
      (fw_sr117, 'SR117-I-1', 'Model Inventory',
       'Maintain a comprehensive inventory of all models including AI/ML systems.',
       '1', 'organizational'),
      (fw_sr117, 'SR117-I-2', 'Model Risk Tiering',
       'Tier models by materiality, complexity, and use-case risk for proportionate oversight.',
       '1', 'strategic'),
      (fw_sr117, 'SR117-D-1', 'Model Development Standards',
       'Apply documented development standards covering data, assumptions, and methodology.',
       '1', 'technical'),
      (fw_sr117, 'SR117-D-2', 'Model Documentation',
       'Produce model documentation sufficient for an independent third party to replicate outcomes.',
       '1', 'organizational'),
      (fw_sr117, 'SR117-V-1', 'Independent Model Validation',
       'Validate all Tier-1 models independently of the development team.',
       '1', 'technical'),
      (fw_sr117, 'SR117-V-2', 'Conceptual Soundness Review',
       'Assess theoretical basis, assumptions, and limitations of the model.',
       '1', 'technical'),
      (fw_sr117, 'SR117-V-3', 'Outcomes Analysis',
       'Conduct back-testing, benchmarking, and sensitivity analysis.',
       '1', 'technical'),
      (fw_sr117, 'SR117-G-1', 'Model Risk Policy',
       'Board-approved model risk management policy with clear ownership and escalation.',
       '1', 'policy'),
      (fw_sr117, 'SR117-G-2', 'Model Risk Appetite',
       'Define quantitative model risk appetite statements integrated with enterprise risk.',
       '1', 'strategic'),
      (fw_sr117, 'SR117-G-3', 'Model Risk Reporting',
       'Report model risk profile, validation findings, and open issues to senior management.',
       '1', 'organizational'),
      (fw_sr117, 'SR117-G-4', 'Ongoing Monitoring',
       'Monitor model performance, data drift, and concept drift continuously.',
       '1', 'technical'),
      (fw_sr117, 'SR117-G-5', 'Model Change Management',
       'Apply change-management controls to model updates, recalibrations, and redevelopments.',
       '2', 'technical'),
      (fw_sr117, 'SR117-G-6', 'Vendor Model Oversight',
       'Apply SR 11-7 principles proportionately to third-party and vendor models.',
       '1', 'strategic'),
      (fw_sr117, 'SR117-G-7', 'Model Retirement',
       'Formally retire decommissioned models with documented rationale and data disposition.',
       '3', 'organizational');
  END IF;

  -- ── 6. Crosswalk mappings → NIST AI RMF ────────────────────────────────────

  IF fw_nist_ai IS NOT NULL THEN

    -- FINRA → NIST AI RMF
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT src.id, tgt.id, 'related', 80,
           'FINRA supervisory AI → NIST AI RMF crosswalk'
    FROM framework_controls src
    JOIN framework_controls tgt ON tgt.framework_id = fw_nist_ai
    WHERE src.framework_id = fw_finra
      AND (
            (src.control_id = 'FINRA-SUP-1'  AND tgt.control_id = 'GOVERN-1')
        OR  (src.control_id = 'FINRA-SUP-2'  AND tgt.control_id = 'MANAGE-1')
        OR  (src.control_id = 'FINRA-SUP-4'  AND tgt.control_id = 'MEASURE-3')
        OR  (src.control_id = 'FINRA-SUP-5'  AND tgt.control_id = 'GOVERN-5')
        OR  (src.control_id = 'FINRA-SUP-6'  AND tgt.control_id = 'MANAGE-3')
        OR  (src.control_id = 'FINRA-SUP-8'  AND tgt.control_id = 'MEASURE-2')
        OR  (src.control_id = 'FINRA-SUP-9'  AND tgt.control_id = 'MANAGE-3')
        OR  (src.control_id = 'FINRA-SUP-10' AND tgt.control_id = 'GOVERN-6')
      )
      AND NOT EXISTS (
        SELECT 1 FROM control_mappings cm
        WHERE cm.source_control_id = src.id AND cm.target_control_id = tgt.id
      );

    -- SEC → NIST AI RMF
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT src.id, tgt.id, 'related', 82,
           'SEC AI Risk Management → NIST AI RMF crosswalk'
    FROM framework_controls src
    JOIN framework_controls tgt ON tgt.framework_id = fw_nist_ai
    WHERE src.framework_id = fw_sec
      AND (
            (src.control_id = 'SEC-AI-1' AND tgt.control_id = 'GOVERN-1')
        OR  (src.control_id = 'SEC-AI-2' AND tgt.control_id = 'MANAGE-1')
        OR  (src.control_id = 'SEC-AI-3' AND tgt.control_id = 'MAP-2')
        OR  (src.control_id = 'SEC-AI-5' AND tgt.control_id = 'GOVERN-1')
        OR  (src.control_id = 'SEC-AI-7' AND tgt.control_id = 'MANAGE-2')
        OR  (src.control_id = 'SEC-AI-8' AND tgt.control_id = 'MEASURE-2')
      )
      AND NOT EXISTS (
        SELECT 1 FROM control_mappings cm
        WHERE cm.source_control_id = src.id AND cm.target_control_id = tgt.id
      );

    -- SR 11-7 → NIST AI RMF
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score, notes)
    SELECT src.id, tgt.id, 'related', 85,
           'SR 11-7 Model Risk Management → NIST AI RMF crosswalk'
    FROM framework_controls src
    JOIN framework_controls tgt ON tgt.framework_id = fw_nist_ai
    WHERE src.framework_id = fw_sr117
      AND (
            (src.control_id = 'SR117-I-1'  AND tgt.control_id = 'GOVERN-1')
        OR  (src.control_id = 'SR117-I-2'  AND tgt.control_id = 'MAP-2')
        OR  (src.control_id = 'SR117-D-1'  AND tgt.control_id = 'MEASURE-1')
        OR  (src.control_id = 'SR117-V-1'  AND tgt.control_id = 'MEASURE-2')
        OR  (src.control_id = 'SR117-V-2'  AND tgt.control_id = 'MEASURE-2')
        OR  (src.control_id = 'SR117-V-3'  AND tgt.control_id = 'MEASURE-3')
        OR  (src.control_id = 'SR117-G-1'  AND tgt.control_id = 'GOVERN-1')
        OR  (src.control_id = 'SR117-G-2'  AND tgt.control_id = 'GOVERN-4')
        OR  (src.control_id = 'SR117-G-3'  AND tgt.control_id = 'GOVERN-6')
        OR  (src.control_id = 'SR117-G-4'  AND tgt.control_id = 'MEASURE-3')
        OR  (src.control_id = 'SR117-G-6'  AND tgt.control_id = 'GOVERN-5')
      )
      AND NOT EXISTS (
        SELECT 1 FROM control_mappings cm
        WHERE cm.source_control_id = src.id AND cm.target_control_id = tgt.id
      );

  END IF;

END $$;
