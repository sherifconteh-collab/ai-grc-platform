-- Migration 087: International AI Governance Laws Framework (Utilities Tier)
-- Creates the international_ai_governance framework with 49 controls covering
-- 10+ international AI laws enacted through 2025:
--   43 jurisdiction-specific controls across EU AI Act (enhanced), UK AI Regulation,
--   Canada AIDA/C-27, Brazil LGPD AI provisions, Singapore AI Governance Framework,
--   Japan APPI/AI Strategy, South Korea AI Basic Act,
--   China GenAI & Algorithm Regulations, Australia Privacy Act/AI Ethics,
--   India DPDP Act, plus 6 cross-cutting multi-jurisdiction INTL-CORE controls.
-- Controls are crosswalked to NIST AI RMF and EU AI Act where applicable.
-- Idempotent: updates the framework if it already exists.

-- Ensure the unique constraint required for ON CONFLICT upserts exists.
-- Migration 086 already creates this constraint; this guard is kept here as
-- defence-in-depth so that this migration remains independently runnable
-- if 086 is ever skipped on a non-standard deployment path.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'framework_controls_framework_id_control_id_key'
      AND conrelid = 'framework_controls'::regclass
  ) THEN
    ALTER TABLE framework_controls
      ADD CONSTRAINT framework_controls_framework_id_control_id_key
      UNIQUE (framework_id, control_id);
  END IF;
END $$;

DO $$
DECLARE
  fw_intl_ai UUID;
  fw_eu_ai   UUID;
  fw_nist_ai UUID;
BEGIN

  -- ── 1. Upsert the international AI governance framework ─────────────────────

  SELECT id INTO fw_intl_ai FROM frameworks WHERE code = 'international_ai_governance' LIMIT 1;

  IF fw_intl_ai IS NULL THEN
    INSERT INTO frameworks (code, name, version, category, tier_required, description)
    VALUES (
      'international_ai_governance',
      'International AI Governance Laws',
      '2025',
      'AI Governance',
      'utilities',
      'Comprehensive coverage of enacted international AI governance laws across 10+ jurisdictions: '
      'EU AI Act (Regulation 2024/1689), UK AI Regulation Approach, Canada AIDA (Bill C-27), '
      'Brazil LGPD AI Provisions, Singapore PDPA + AI Governance Framework 2.0, '
      'Japan APPI + AI Strategy, South Korea AI Basic Act, '
      'China Generative AI Regulation + Algorithm Recommendation Regulation, '
      'Australia Privacy Act AI Ethics Framework, and India DPDP Act 2023. '
      'Controls are crosswalked to NIST AI RMF and EU AI Act so evidence satisfies multiple jurisdictions.'
    )
    RETURNING id INTO fw_intl_ai;
  ELSE
    UPDATE frameworks SET
      name        = 'International AI Governance Laws',
      version     = '2025',
      description = 'Comprehensive coverage of enacted international AI governance laws across 10+ jurisdictions: '
                    'EU AI Act (Regulation 2024/1689), UK AI Regulation Approach, Canada AIDA (Bill C-27), '
                    'Brazil LGPD AI Provisions, Singapore PDPA + AI Governance Framework 2.0, '
                    'Japan APPI + AI Strategy, South Korea AI Basic Act, '
                    'China Generative AI Regulation + Algorithm Recommendation Regulation, '
                    'Australia Privacy Act AI Ethics Framework, and India DPDP Act 2023. '
                    'Controls are crosswalked to NIST AI RMF and EU AI Act so evidence satisfies multiple jurisdictions.'
    WHERE id = fw_intl_ai;

    -- Remove controls that are no longer referenced by org implementation progress or
    -- crosswalk mappings so we can replace them with the expanded, jurisdiction-specific
    -- catalog without wiping any historical org data. Controls still referenced by
    -- control_implementations or control_mappings are left in place.
    DELETE FROM framework_controls fc
    WHERE fc.framework_id = fw_intl_ai
      AND NOT EXISTS (
        SELECT 1 FROM control_implementations ci WHERE ci.control_id = fc.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM control_mappings cm
        WHERE cm.source_control_id = fc.id OR cm.target_control_id = fc.id
      );
  END IF;

  -- ── 2. Insert jurisdiction-specific controls ─────────────────────────────────

  -- ── EUROPEAN UNION: AI Act (Regulation 2024/1689) — enhanced ────────────────
  INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
  VALUES
  (fw_intl_ai, 'EU-AIA-1', 'EU AI Act — Prohibited AI Practices (Art. 5)',
   'Prohibit AI practices that pose unacceptable risk: subliminal manipulation, exploitation of vulnerabilities, social scoring by public authorities, real-time biometric surveillance in public spaces (with narrow exceptions), and emotion recognition in workplace/education. Implement a prohibited-use checklist reviewed quarterly. (Regulation 2024/1689, Art. 5)',
   '1', 'policy'),
  (fw_intl_ai, 'EU-AIA-2', 'EU AI Act — High-Risk AI Classification (Art. 6 & Annex III)',
   'Classify AI systems as high-risk if they fall within Annex III categories (biometrics, critical infrastructure, education, employment, essential services, law enforcement, migration, justice/democracy). Maintain a classification register reviewed on material changes. (Art. 6)',
   '1', 'strategic'),
  (fw_intl_ai, 'EU-AIA-3', 'EU AI Act — Risk Management System Lifecycle (Art. 9)',
   'Implement a continuous risk management system covering identification and analysis of known and foreseeable risks, estimation and evaluation of risks when the system is used as intended and under reasonably foreseeable misuse, and risk mitigation measures. Document and update throughout the AI lifecycle. (Art. 9)',
   '1', 'strategic'),
  (fw_intl_ai, 'EU-AIA-4', 'EU AI Act — Data Governance for High-Risk AI (Art. 10)',
   'Ensure training, validation, and testing datasets satisfy quality criteria: relevance, representativeness, freedom from errors, completeness, and appropriate statistical properties. Implement data governance practices addressing potential biases and data gaps. Document dataset provenance and preprocessing steps. (Art. 10)',
   '1', 'technical'),
  (fw_intl_ai, 'EU-AIA-5', 'EU AI Act — Technical Documentation (Art. 11 & Annex IV)',
   'Prepare comprehensive technical documentation (Annex IV) before placing a high-risk AI system on the EU market: system description, architecture, design specifications, training methodologies, validation results, performance metrics, and intended purpose. Keep documentation current and available to notified bodies. (Art. 11)',
   '1', 'organizational'),
  (fw_intl_ai, 'EU-AIA-6', 'EU AI Act — Automatic Event Logging (Art. 12)',
   'Design high-risk AI systems to automatically generate audit logs throughout operation: system activation/deactivation events, input data, output decisions, human oversight interventions, and reference database queries. Retain logs for at least 6 months unless EU law specifies otherwise. (Art. 12)',
   '1', 'technical'),
  (fw_intl_ai, 'EU-AIA-7', 'EU AI Act — Transparency and Instructions for Use (Art. 13)',
   'Ensure high-risk AI systems are sufficiently transparent. Provide instructions for use that include: identity of provider, system capabilities and limitations, performance metrics, human oversight measures, expected lifetime, and maintenance/update requirements. (Art. 13)',
   '1', 'organizational'),
  (fw_intl_ai, 'EU-AIA-8', 'EU AI Act — Human Oversight Measures (Art. 14)',
   'Design high-risk AI systems to enable effective human oversight: ability to understand capabilities and limitations, ability to disregard, override, or reverse AI outputs, ability to interrupt operation, and assignment of oversight responsibility to competent natural persons. (Art. 14)',
   '1', 'organizational'),
  (fw_intl_ai, 'EU-AIA-9', 'EU AI Act — GPAI Model Transparency and Systemic Risk (Art. 53 & 55)',
   'For General Purpose AI (GPAI) models: provide technical documentation to downstream providers, publish a summary of training data, implement copyright compliance policies, and establish an incident reporting process. For GPAI models with systemic risk (>10^25 FLOPs): conduct adversarial testing, notify incidents to the AI Office, implement cybersecurity measures. (Art. 53, 55)',
   '1', 'strategic'),
  (fw_intl_ai, 'EU-AIA-10', 'EU AI Act — Fundamental Rights Impact Assessment (Art. 27)',
   'Before deploying high-risk AI systems in sectors affecting fundamental rights (public administration, employment, essential services), conduct a fundamental rights impact assessment covering: the purpose, system description, deployment geography, potentially affected persons, specific risks identified, and proportionality assessment. Register in the EU database. (Art. 27)',
   '1', 'strategic'),

  -- ── UNITED KINGDOM: AI Regulation (Pro-Innovation Approach) ──────────────────
  (fw_intl_ai, 'UK-AI-1', 'UK AI — Cross-Sector Safety and Security Requirements',
   'Apply the safety principle from the UK AI Regulatory Framework: AI systems must be technically secure and function as designed. Implement a safety case and supporting evidence covering failure modes, adversarial robustness, and incident response plans applicable to your sector regulator (FCA, CMA, ICO, Ofcom). (DSIT AI Framework, Safety Principle)',
   '1', 'strategic'),
  (fw_intl_ai, 'UK-AI-2', 'UK AI — Transparency and Explainability Obligations',
   'Apply the transparency principle: organisations deploying AI must be transparent about when AI is used, the basis for AI-influenced decisions, and provide meaningful explanations. Comply with the ICO guidance on AI and data protection transparency and explainability requirements under UK GDPR. (DSIT AI Framework, Transparency Principle)',
   '1', 'policy'),
  (fw_intl_ai, 'UK-AI-3', 'UK AI — Fairness and Non-Discrimination',
   'Apply the fairness principle: AI systems must not undermine equality law protections. Conduct bias assessments covering the nine protected characteristics under the UK Equality Act 2010 for AI systems influencing decisions about individuals. Document and remediate identified disparate impacts. (DSIT AI Framework, Fairness Principle)',
   '1', 'strategic'),
  (fw_intl_ai, 'UK-AI-4', 'UK AI — Accountability and Governance',
   'Apply the accountability principle: establish clear governance structures for AI with defined roles, responsibilities, and escalation paths. Maintain an AI register, conduct regular reviews, and designate senior accountability for AI risk. Comply with FCA/PRA model risk management requirements where applicable. (DSIT AI Framework, Accountability Principle)',
   '1', 'organizational'),
  (fw_intl_ai, 'UK-AI-5', 'UK AI — Contestability and Redress',
   'Apply the contestability principle: where AI influences significant decisions about individuals, provide clear routes for individuals to contest decisions and seek human review. Implement an AI complaints and appeals process with defined SLAs. (DSIT AI Framework, Contestability Principle)',
   '2', 'policy'),

  -- ── CANADA: AIDA (Artificial Intelligence and Data Act, Bill C-27) ───────────
  (fw_intl_ai, 'CA-AIDA-1', 'Canada AIDA — High-Impact AI System Identification',
   'Identify AI systems that meet the definition of "high-impact system" under AIDA: systems that make automated decisions having significant effects on individuals in areas such as employment, access to services, criminal justice, or health. Maintain an inventory of all high-impact systems. (AIDA Bill C-27, Part 3, s. 5)',
   '1', 'organizational'),
  (fw_intl_ai, 'CA-AIDA-2', 'Canada AIDA — Risk Assessment and Mitigation',
   'Conduct risk assessments for high-impact AI systems prior to deployment and at defined intervals. Assessments must address identified risks to individuals, society, and democratic institutions, and document implemented mitigation measures proportionate to identified risks. (AIDA Bill C-27, s. 6-7)',
   '1', 'strategic'),
  (fw_intl_ai, 'CA-AIDA-3', 'Canada AIDA — Transparency and Plain-Language Disclosure',
   'Make publicly available plain-language descriptions of the types of high-impact AI systems in use, their general purposes, the types of decisions made, and available recourse mechanisms. Publish on the organizational website and update when material changes occur. (AIDA Bill C-27, s. 10)',
   '1', 'policy'),
  (fw_intl_ai, 'CA-AIDA-4', 'Canada AIDA — Monitoring and Record-Keeping',
   'Monitor deployed high-impact AI systems on an ongoing basis for performance and unintended consequences. Maintain records of training data descriptions, risk assessment results, mitigation measures, and monitoring outcomes for a minimum of 10 years after the system is retired. (AIDA Bill C-27, s. 12)',
   '2', 'organizational'),

  -- ── BRAZIL: LGPD AI Provisions & AI Bill (PL 2338/2023) ─────────────────────
  (fw_intl_ai, 'BR-AI-1', 'Brazil — Automated Processing Transparency (LGPD Art. 20)',
   'When personal data is processed by automated means for decisions affecting an individual, provide upon request: meaningful information about the criteria and procedures used, information about the right to request human review, and a plain-language explanation of the decision. (Lei 13.709/2018, Art. 20)',
   '1', 'policy'),
  (fw_intl_ai, 'BR-AI-2', 'Brazil — Right to Human Review of Automated Decisions (LGPD Art. 20)',
   'Establish a documented process allowing data subjects to request human review of decisions based solely on automated processing of personal data that affect their interests. Process requests within 15 days and document outcomes. (Lei 13.709/2018, Art. 20, §3)',
   '1', 'policy'),
  (fw_intl_ai, 'BR-AI-3', 'Brazil AI Bill — High-Risk AI Impact Assessment (PL 2338/2023)',
   'For high-risk AI systems under the Brazil AI Bill (critical infrastructure, employment, essential services, biometrics, criminal justice): conduct and document an algorithmic impact assessment covering purpose, methodology, data used, potential harms, and mitigation measures before deployment. (PL 2338/2023, Art. 15)',
   '1', 'strategic'),
  (fw_intl_ai, 'BR-AI-4', 'Brazil AI Bill — Non-Discrimination and Bias Controls',
   'Implement technical and organizational measures to prevent AI systems from producing discriminatory outputs based on race, color, ethnicity, religion, national origin, gender, sexual orientation, or disability. Conduct periodic bias audits and document remediation actions. (PL 2338/2023, Art. 6)',
   '1', 'technical'),

  -- ── SINGAPORE: PDPA + AI Governance Framework 2.0 ───────────────────────────
  (fw_intl_ai, 'SG-AI-1', 'Singapore — Internal AI Governance Structure (AIGF 2.0, Principle 1)',
   'Establish an internal AI governance structure with senior leadership accountability, defined AI ethics principles, clear policies on permitted AI uses, and designated responsibilities for AI risk management. Align with the PDPC Model AI Governance Framework 2.0 and IMDA guidelines. (AIGF 2.0, Part 2)',
   '1', 'organizational'),
  (fw_intl_ai, 'SG-AI-2', 'Singapore — Human Involvement in AI Decision-Making (AIGF 2.0, Principle 2)',
   'Determine the appropriate degree of human oversight for each AI use case based on the probability of harm and severity of impact. For high-risk decisions (financial, medical, legal), require mandatory human review. Document the human oversight model in AI governance policies. (AIGF 2.0, Part 3)',
   '1', 'organizational'),
  (fw_intl_ai, 'SG-AI-3', 'Singapore — AI Operations Management and Model Monitoring (AIGF 2.0)',
   'Implement operational controls covering: AI model documentation, pre-deployment validation, ongoing performance monitoring, data quality management, and version control. Establish minimum performance thresholds and trigger-based review procedures for model degradation. (AIGF 2.0, Part 4)',
   '1', 'technical'),
  (fw_intl_ai, 'SG-AI-4', 'Singapore — PDPA AI Data Protection Obligations',
   'Comply with PDPA obligations when processing personal data through AI systems: obtain valid consent or establish a valid legal basis, apply the purpose limitation principle, implement data minimization in AI training datasets, and notify affected individuals when AI decisions materially affect them. (PDPA 2012, as amended 2020)',
   '1', 'technical'),

  -- ── JAPAN: APPI + AI Strategy 2022 ──────────────────────────────────────────
  (fw_intl_ai, 'JP-AI-1', 'Japan — APPI AI Data Processing Governance (Act No. 57/2003)',
   'Comply with the Act on the Protection of Personal Information (APPI) for AI systems processing personal information: establish a legitimate purpose of use, notify individuals of purpose, implement security management measures proportionate to risk, and obtain consent for sensitive personal information used in AI training. (APPI Art. 18, 20, 24)',
   '1', 'technical'),
  (fw_intl_ai, 'JP-AI-2', 'Japan — AI Development and Utilization Principles (MIC/METI Guidelines)',
   'Apply the 10 AI development principles from Japan MIC/METI guidelines: human-centricity, education/literacy, privacy protection, security, fair competition, fairness, transparency, innovation, accountability, and safety. Document how each principle is operationalized in AI system design, development, and deployment policies.',
   '1', 'policy'),
  (fw_intl_ai, 'JP-AI-3', 'Japan — Generative AI Guidelines (Cabinet AI Strategy 2024)',
   'For generative AI systems operating in Japan: implement copyright compliance measures, establish content provenance mechanisms, publish usage guidelines for employees, and disclose to users when AI-generated content is being provided. Align with the Cabinet Office Integrated Innovation Strategy guidelines on generative AI.',
   '2', 'policy'),

  -- ── SOUTH KOREA: AI Basic Act (Act No. 20469) ────────────────────────────────
  (fw_intl_ai, 'KR-AI-1', 'South Korea AI Basic Act — High-Impact AI Risk Assessment',
   'For AI systems classified as high-impact under the AI Basic Act (healthcare, employment, credit, education, law enforcement, critical infrastructure): conduct a pre-deployment impact assessment covering risks, data sources, mitigation measures, and monitoring plan. Submit to the Korea Communications Commission or applicable regulator as required. (AI Basic Act, Art. 27)',
   '1', 'strategic'),
  (fw_intl_ai, 'KR-AI-2', 'South Korea AI Basic Act — Transparency and Disclosure Obligations',
   'Disclose to users: that they are interacting with an AI system, the purpose and key characteristics of the AI, available avenues for recourse, and the provider identity. For AI-generated content, implement technical disclosure measures. (AI Basic Act, Art. 28)',
   '1', 'policy'),
  (fw_intl_ai, 'KR-AI-3', 'South Korea AI Basic Act — Governance and Accountability Framework',
   'Establish an AI governance framework aligned with the AI Basic Act: appoint an AI safety officer for high-impact systems, implement an internal AI ethics committee or oversight body, and establish an incident response procedure for AI-related harms. (AI Basic Act, Art. 31)',
   '2', 'organizational'),

  -- ── CHINA: Generative AI Regulation + Algorithm Recommendation Regulation ────
  (fw_intl_ai, 'CN-AI-1', 'China — Generative AI Service Disclosure Requirements (CAC 2023)',
   'Generative AI services offered to the public in China must: obtain user consent before content generation, label AI-generated content with visible and covert watermarks, implement content security review mechanisms, and maintain logs of user instructions and AI outputs for 6 months. (CAC Measures for Generative AI, Art. 12, 17)',
   '1', 'technical'),
  (fw_intl_ai, 'CN-AI-2', 'China — Algorithm Recommendation Transparency and User Control (CAC 2022)',
   'Algorithm recommendation services must: disclose the use of algorithmic recommendations, provide users with the ability to disable personalized recommendations, prohibit use of algorithms to engage in price discrimination based on user characteristics, and file algorithm records with the CAC for significant internet platforms. (Algorithm Recommendation Measures, Art. 9, 17, 21)',
   '1', 'policy'),
  (fw_intl_ai, 'CN-AI-3', 'China — AI Content Security and Prohibited Uses',
   'Ensure AI systems do not generate content that: endangers national security, disrupts social order, violates social ethics, or spreads false information. Implement content moderation aligned with CAC internet information security requirements. Conduct quarterly compliance reviews and maintain records for regulatory inspection. (CAC Generative AI Measures, Art. 4, 15)',
   '1', 'policy'),
  (fw_intl_ai, 'CN-AI-4', 'China — Deep Synthesis (Deepfake) Regulation Compliance (CAC 2022)',
   'Comply with the Deep Synthesis Regulation: label all AI-generated synthetic audio, video, and images with conspicuous technical markers; obtain consent before creating deepfake content of identifiable individuals; and provide real-name registration for users of deep synthesis services operating in China. (Deep Synthesis Provisions, Art. 14, 16)',
   '1', 'technical'),

  -- ── AUSTRALIA: Privacy Act + AI Ethics Framework ─────────────────────────────
  (fw_intl_ai, 'AU-AI-1', 'Australia — Privacy Act AI-Automated Decision Transparency (APPs)',
   'When AI systems make or significantly influence decisions about Australian individuals using personal information, comply with Australian Privacy Principles: disclose the use of automated decision-making in collection notices, implement the open and transparent management principle (APP 1), and provide individuals with access to personal information used in AI decisions. (Privacy Act 1988, APPs 1, 5, 12)',
   '1', 'policy'),
  (fw_intl_ai, 'AU-AI-2', 'Australia — National AI Ethics Framework Alignment (DISR 2019)',
   'Apply Australia national AI Ethics Framework principles to AI system design and deployment: human, societal and environmental wellbeing; human-centred values; fairness; privacy protection and security; reliability and safety; transparency and explainability; contestability; and accountability. Document principle compliance in AI governance policies. (DISR AI Ethics Framework, 2019)',
   '1', 'policy'),
  (fw_intl_ai, 'AU-AI-3', 'Australia — Automated Decision Governance (ADGS for Government / Best Practice)',
   'Implement governance controls for automated decisions affecting individuals: maintain a record of automated decision systems, conduct human rights and privacy impact assessments, implement human review mechanisms for consequential decisions, and publish an automated decision register consistent with APS guidance and Privacy Act reform proposals. (APS Automated Decision-Making Better Practice Guide)',
   '2', 'organizational'),

  -- ── INDIA: Digital Personal Data Protection Act 2023 ─────────────────────────
  (fw_intl_ai, 'IN-AI-1', 'India DPDP Act — Lawful Basis and Consent for AI Data Processing',
   'For AI systems processing personal digital data of Indian residents: establish a valid consent or legitimate use basis under the DPDP Act 2023, ensure consent is free, specific, informed, and unconditional, maintain consent artefacts, and provide a mechanism for data principals to withdraw consent with effect on AI processing within a reasonable timeframe. (DPDP Act 2023, Sections 6, 7)',
   '1', 'technical'),
  (fw_intl_ai, 'IN-AI-2', 'India DPDP Act — Data Principal Rights in AI Contexts',
   'Implement processes to fulfil data principal rights under the DPDP Act for AI-processed data: right to access a summary of personal data and processing activities, right to correction and erasure of inaccurate or outdated personal data used in AI models, right to grievance redressal within 30 days, and right to nominate. (DPDP Act 2023, Sections 11-14)',
   '1', 'policy'),
  (fw_intl_ai, 'IN-AI-3', 'India DPDP Act — Data Localisation and Transfer Compliance',
   'Comply with data localisation requirements under the DPDP Act for AI training and inference: do not transfer personal data of Indian residents to countries or territories restricted by the Central Government. Implement technical controls to enforce data residency for AI workloads and maintain transfer documentation. (DPDP Act 2023, Section 16)',
   '2', 'technical'),

  -- ── CROSS-CUTTING / MULTI-JURISDICTION CONTROLS ───────────────────────────────
  (fw_intl_ai, 'INTL-CORE-1', 'Multi-Jurisdiction AI Compliance Program',
   'Establish a centralized international AI compliance program tracking applicable laws by jurisdiction, with a compliance calendar for key deadlines (EU AI Act phases: 2025-2027), regulatory watch process covering 50+ countries, policy update procedure, and designated compliance owners per active jurisdiction.',
   '1', 'strategic'),
  (fw_intl_ai, 'INTL-CORE-2', 'Unified International AI System Register',
   'Maintain a unified register of all AI systems in use internationally, documenting: countries of deployment, applicable national laws, risk tier per jurisdiction, impact assessment status, audit dates, and assigned compliance owners. Update on deployment of new systems or expansion into new markets.',
   '1', 'organizational'),
  (fw_intl_ai, 'INTL-CORE-3', 'Cross-Jurisdiction Algorithmic Fairness Baseline',
   'Implement baseline fairness controls sufficient to satisfy anti-discrimination requirements across EU AI Act, UK Equality Act, Canada AIDA, Brazil AI Bill, and South Korea AI Basic Act simultaneously: protected-characteristic bias testing, impact ratio analysis, disparity documentation, and corrective action procedures.',
   '1', 'technical'),
  (fw_intl_ai, 'INTL-CORE-4', 'International AI Content Provenance and Watermarking',
   'Implement AI content provenance and watermarking mechanisms satisfying EU AI Act (Art. 50), China CAC deep synthesis rules, and emerging international standards (C2PA, ISO/IEC 42101). Apply visible and non-visible markers to AI-generated text, images, audio, and video across all markets.', -- ip-hygiene:ignore
   '1', 'technical'),
  (fw_intl_ai, 'INTL-CORE-5', 'Global AI Incident Reporting and Response',
   'Establish a global AI incident reporting and response program: unified incident classification (safety, bias, privacy, security), jurisdiction-specific reporting timelines (EU: immediately for serious incidents; UK: sector-regulator timelines; China: CAC 24-hour window for significant incidents), and a cross-border root-cause analysis process.',
   '1', 'organizational'),
  (fw_intl_ai, 'INTL-CORE-6', 'International AI Regulatory Change Management',
   'Monitor AI legislative and regulatory developments across 50+ countries using a quarterly regulatory scan. Update internal policies and controls within 90 days of enacted laws. Maintain a jurisdiction-law tracking log covering EU, UK, Canada, Brazil, Singapore, Japan, South Korea, China, Australia, India, and emerging markets.',
   '2', 'strategic')
  ON CONFLICT (framework_id, control_id) DO NOTHING;

  -- ── 3. Add crosswalk mappings to NIST AI RMF and EU AI Act ──────────────────

  SELECT id INTO fw_nist_ai FROM frameworks WHERE code = 'nist_ai_rmf' LIMIT 1;
  SELECT id INTO fw_eu_ai   FROM frameworks WHERE code = 'eu_ai_act'   LIMIT 1;

  IF fw_nist_ai IS NOT NULL THEN
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, notes)
    SELECT src.id, tgt.id, 'related', map_note
    FROM (VALUES
      -- GOVERN
      ('EU-AIA-9',    'GOVERN-1', 'nist_ai_rmf', 'GPAI model governance maps to NIST AI risk management policy'),
      ('UK-AI-4',     'GOVERN-2', 'nist_ai_rmf', 'UK AI accountability principle maps to NIST AI accountability structure'),
      ('CA-AIDA-4',   'GOVERN-1', 'nist_ai_rmf', 'Canada AIDA record-keeping maps to NIST AI governance documentation'),
      ('KR-AI-3',     'GOVERN-2', 'nist_ai_rmf', 'South Korea AI governance framework maps to NIST accountability structure'),
      ('SG-AI-1',     'GOVERN-2', 'nist_ai_rmf', 'Singapore AIGF governance structure maps to NIST AI accountability'),
      ('INTL-CORE-1', 'GOVERN-1', 'nist_ai_rmf', 'Multi-jurisdiction compliance program maps to NIST AI risk management policy'),
      ('INTL-CORE-6', 'GOVERN-1', 'nist_ai_rmf', 'Regulatory change management maps to NIST AI policy update process'),
      -- MAP
      ('EU-AIA-2',    'MAP-2', 'nist_ai_rmf', 'EU AI Act risk classification maps to NIST AI system categorization'),
      ('EU-AIA-10',   'MAP-1', 'nist_ai_rmf', 'EU fundamental rights impact assessment maps to NIST AI context establishment'),
      ('CA-AIDA-1',   'MAP-2', 'nist_ai_rmf', 'Canada AIDA high-impact identification maps to NIST AI categorization'),
      ('BR-AI-3',     'MAP-1', 'nist_ai_rmf', 'Brazil AI Bill impact assessment maps to NIST AI context establishment'),
      ('AU-AI-3',     'MAP-2', 'nist_ai_rmf', 'Australia automated decision register maps to NIST AI system categorization'),
      ('INTL-CORE-2', 'MAP-2', 'nist_ai_rmf', 'Unified AI system register maps to NIST AI categorization function'),
      -- MEASURE
      ('EU-AIA-3',    'MEASURE-2', 'nist_ai_rmf', 'EU AI Act risk management lifecycle maps to NIST AI system evaluation'),
      ('EU-AIA-4',    'MEASURE-2', 'nist_ai_rmf', 'EU AI Act data governance maps to NIST AI data and model evaluation'),
      ('UK-AI-3',     'MEASURE-1', 'nist_ai_rmf', 'UK AI fairness principle maps to NIST AI bias measurement'),
      ('CA-AIDA-2',   'MEASURE-1', 'nist_ai_rmf', 'Canada AIDA risk assessment maps to NIST AI risk metrics'),
      ('KR-AI-1',     'MEASURE-1', 'nist_ai_rmf', 'South Korea AI impact assessment maps to NIST AI risk metrics'),
      ('SG-AI-3',     'MEASURE-3', 'nist_ai_rmf', 'Singapore AI operations monitoring maps to NIST AI system monitoring'),
      ('INTL-CORE-3', 'MEASURE-1', 'nist_ai_rmf', 'Cross-jurisdiction fairness baseline maps to NIST AI bias measurement'),
      -- MANAGE
      ('EU-AIA-7',    'MANAGE-4', 'nist_ai_rmf', 'EU AI Act transparency and instructions map to NIST AI risk communication'),
      ('EU-AIA-8',    'MANAGE-3', 'nist_ai_rmf', 'EU AI Act human oversight maps to NIST AI risk response with human control'),
      ('UK-AI-5',     'MANAGE-3', 'nist_ai_rmf', 'UK AI contestability maps to NIST AI risk response and remediation'),
      ('BR-AI-2',     'MANAGE-3', 'nist_ai_rmf', 'Brazil right to human review maps to NIST AI risk response assignment'),
      ('IN-AI-2',     'MANAGE-3', 'nist_ai_rmf', 'India DPDP data principal rights map to NIST AI risk response'),
      ('INTL-CORE-5', 'MANAGE-2', 'nist_ai_rmf', 'Global AI incident reporting maps to NIST AI risk prioritization and escalation')
    ) AS t(src_ctrl, tgt_ctrl, tgt_fw, map_note)
    JOIN framework_controls src ON src.framework_id = fw_intl_ai AND src.control_id = t.src_ctrl
    JOIN framework_controls tgt ON tgt.framework_id = fw_nist_ai  AND tgt.control_id = t.tgt_ctrl
    WHERE NOT EXISTS (
      SELECT 1 FROM control_mappings cm
      WHERE cm.source_control_id = src.id AND cm.target_control_id = tgt.id
    );
  END IF;

  IF fw_eu_ai IS NOT NULL THEN
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, notes)
    SELECT src.id, tgt.id, 'related', map_note
    FROM (VALUES
      -- Map similar non-EU controls to the relevant EU AI Act articles
      ('UK-AI-1',     'AIA-Art9',  'UK AI safety principle maps to EU AI Act Art. 9 risk management system'),
      ('UK-AI-3',     'AIA-Art27', 'UK AI fairness maps to EU fundamental rights impact assessment'),
      ('CA-AIDA-2',   'AIA-Art9',  'Canada AIDA risk assessment maps to EU AI Act Art. 9 risk management'),
      ('SG-AI-2',     'AIA-Art14', 'Singapore human involvement maps to EU AI Act Art. 14 human oversight'),
      ('KR-AI-1',     'AIA-Art27', 'South Korea impact assessment maps to EU fundamental rights impact assessment'),
      ('INTL-CORE-4', 'AIA-Art50', 'International watermarking maps to EU AI Act Art. 50 transparency for GenAI')
    ) AS t(src_ctrl, tgt_ctrl, map_note)
    JOIN framework_controls src ON src.framework_id = fw_intl_ai AND src.control_id = t.src_ctrl
    JOIN framework_controls tgt ON tgt.framework_id = fw_eu_ai   AND tgt.control_id = t.tgt_ctrl
    WHERE NOT EXISTS (
      SELECT 1 FROM control_mappings cm
      WHERE cm.source_control_id = src.id AND cm.target_control_id = tgt.id
    );
  END IF;

END $$;
