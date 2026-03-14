-- Migration 086: US State AI Laws Enhancement (Utilities Tier)
-- Expands the state_ai_governance framework with comprehensive, state-specific
-- controls covering 12+ US state AI laws enacted through 2025.
-- Replaces the generic 12-control set with 47 controls:
-- 41 jurisdiction-specific controls grouped by state (CO, IL, NYC, CA, TX, VA,
-- CT, TN, UT, WA, MD, NY) plus six cross-cutting multi-state SAI-CORE controls.
-- Idempotent: updates the framework if it already exists.

-- Ensure the unique constraint required for ON CONFLICT upserts exists.
-- Uses a DO block for idempotency since ADD CONSTRAINT has no IF NOT EXISTS clause.
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
  fw_state_ai UUID;
  fw_nist_ai  UUID;
BEGIN

  -- ── 1. Upsert the framework record ──────────────────────────────────────────

  SELECT id INTO fw_state_ai FROM frameworks WHERE code = 'state_ai_governance' LIMIT 1;

  IF fw_state_ai IS NULL THEN
    INSERT INTO frameworks (code, name, version, category, tier_required, description)
    VALUES (
      'state_ai_governance',
      'US State AI Governance Laws',
      '2025',
      'AI Governance',
      'utilities',
      'Comprehensive coverage of enacted US state AI laws across 12+ jurisdictions: '
      'Colorado SB 205, Illinois AI Video Interview Act, NYC Local Law 144, '
      'California SB 942/AB 2013/AB 2885/AB 1008, Texas TRAIGA, Virginia HB 2048, '
      'Connecticut SB 2, Tennessee ELVIS Act, Utah SB 149, Washington SB 5838, '
      'Maryland HB 1281, and New York State AI legislation. Controls are crosswalked '
      'to NIST AI RMF so evidence collected once satisfies multiple jurisdictions.'
    )
    RETURNING id INTO fw_state_ai;
  ELSE
    UPDATE frameworks SET
      name        = 'US State AI Governance Laws',
      version     = '2025',
      description = 'Comprehensive coverage of enacted US state AI laws across 12+ jurisdictions: '
                    'Colorado SB 205, Illinois AI Video Interview Act, NYC Local Law 144, '
                    'California SB 942/AB 2013/AB 2885/AB 1008, Texas TRAIGA, Virginia HB 2048, '
                    'Connecticut SB 2, Tennessee ELVIS Act, Utah SB 149, Washington SB 5838, '
                    'Maryland HB 1281, and New York State AI legislation. Controls are crosswalked '
                    'to NIST AI RMF so evidence collected once satisfies multiple jurisdictions.'
    WHERE id = fw_state_ai;

    -- Remove controls that are no longer referenced by org implementation progress or
    -- crosswalk mappings so we can replace them with the expanded, state-specific catalog
    -- without wiping any historical org data. Controls still referenced by
    -- control_implementations or control_mappings are left in place.
    DELETE FROM framework_controls fc
    WHERE fc.framework_id = fw_state_ai
      AND NOT EXISTS (
        SELECT 1 FROM control_implementations ci WHERE ci.control_id = fc.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM control_mappings cm
        WHERE cm.source_control_id = fc.id OR cm.target_control_id = fc.id
      );
  END IF;

  -- ── 2. Insert jurisdiction-specific controls ─────────────────────────────────

  -- ── COLORADO: SB 205 (Colorado AI Act) – effective Feb 1, 2026 ──────────────
  INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
  VALUES
  (fw_state_ai, 'CO-AI-1', 'CO SB 205 — High-Risk AI Impact Assessment',
   'Before deploying a high-risk AI system, conduct and document an impact assessment covering intended purpose, known risks, measures to mitigate algorithmic discrimination, and a post-deployment monitoring plan. (Colo. Rev. Stat. § 6-1-1703)',
   '1', 'strategic'),
  (fw_state_ai, 'CO-AI-2', 'CO SB 205 — Consumer Disclosure for Consequential Decisions',
   'Provide clear, plain-language disclosure to consumers when a high-risk AI system is used to make a consequential decision (employment, education, financial services, housing, healthcare, insurance). Disclose the types of data used and the purpose. (§ 6-1-1704)',
   '1', 'policy'),
  (fw_state_ai, 'CO-AI-3', 'CO SB 205 — Algorithmic Discrimination Prevention',
   'Implement reasonable care to protect consumers from known or reasonably foreseeable risks of algorithmic discrimination based on protected characteristics. Include bias testing before deployment and after material changes. (§ 6-1-1702)',
   '1', 'strategic'),
  (fw_state_ai, 'CO-AI-4', 'CO SB 205 — Consumer Right to Appeal AI Decisions',
   'Provide consumers an opportunity to appeal a consequential decision made by or with substantial assistance of a high-risk AI system, and offer a meaningful human review process with documented outcome. (§ 6-1-1705)',
   '1', 'policy'),
  (fw_state_ai, 'CO-AI-5', 'CO SB 205 — Developer Documentation and Disclosure',
   'AI developers must provide deployers with documentation of intended uses, known limitations, bias evaluation results, and required safeguards. Maintain version-controlled records and update on material changes. (§ 6-1-1706)',
   '2', 'organizational'),

  -- ── ILLINOIS ────────────────────────────────────────────────────────────────
  (fw_state_ai, 'IL-AI-1', 'IL AI Video Interview Act — Pre-Interview Consent',
   'Before conducting an AI-analyzed video interview, notify applicants in writing that AI will be used to analyze the video and assess qualifications, explain how the AI works, and obtain express written consent. (430 ILCS 1/10)',
   '1', 'policy'),
  (fw_state_ai, 'IL-AI-2', 'IL AI Video Interview Act — Video Data Destruction',
   'Destroy the applicant''s video interview recording and all AI-derived analysis within 30 days of a written destruction request. Share interview data only with parties whose expertise is needed to evaluate applicant fit. (430 ILCS 1/20)',
   '1', 'technical'),
  (fw_state_ai, 'IL-AI-3', 'IL AI Video Interview Act — No Sole AI Screening',
   'Do not use AI video interview analysis as the sole or primary basis to exclude an applicant from an in-person interview. Human review must be incorporated as a meaningful step in the process. (430 ILCS 1/20(c))',
   '1', 'policy'),
  (fw_state_ai, 'IL-AI-4', 'IL HB 3773 — AI in Employment Decision Transparency',
   'For AI systems materially used in employment decisions (screening, promotion, termination), provide notice to affected employees and applicants, document the factors the AI considers, and maintain decision audit logs for two years.',
   '2', 'organizational'),

  -- ── NEW YORK CITY: Local Law 144 ─────────────────────────────────────────────
  (fw_state_ai, 'NYC-AI-1', 'NYC LL 144 — Annual Independent Bias Audit of AEDT',
   'Before using and annually thereafter, commission an independent bias audit of every Automated Employment Decision Tool (AEDT). The audit must calculate selection rate and impact ratio by gender and race/ethnicity categories. Retain auditor qualifications. (NYC Admin. Code § 20-871)',
   '1', 'organizational'),
  (fw_state_ai, 'NYC-AI-2', 'NYC LL 144 — Bias Audit Summary Publication',
   'Post a clear summary of the most recent independent bias audit on the employer''s website, including audit date, data source used, and impact ratio results for each demographic category tested. (§ 20-872)',
   '1', 'policy'),
  (fw_state_ai, 'NYC-AI-3', 'NYC LL 144 — Candidate Notification',
   'For NYC-based roles, notify candidates and employees at least 10 business days before applying an AEDT to their assessment. Offer an alternative selection process or reasonable accommodation upon request. (§ 20-872)',
   '1', 'policy'),
  (fw_state_ai, 'NYC-AI-4', 'NYC LL 144 — Audit Record Retention',
   'Retain bias audit reports, supporting data, and selection records for at least three years after the audit date to support regulatory inspection and potential legal discovery. (§ 20-872(c))',
   '2', 'technical'),

  -- ── CALIFORNIA ───────────────────────────────────────────────────────────────
  (fw_state_ai, 'CA-AI-1', 'CA SB 942 — AI Provenance and Watermarking',
   'Generative AI providers must implement technical measures (e.g., C2PA watermarks, metadata) so that AI-generated text, audio, video, and images can be identified as AI-generated. Consumers must be able to detect AI origin. (Cal. Bus. & Prof. Code § 22756)',
   '1', 'technical'),
  (fw_state_ai, 'CA-AI-2', 'CA AB 2013 — Training Data Transparency Documentation',
   'Publish a publicly accessible summary of training data used in generative AI systems trained on data available after Jan 1, 2022. Document data sources, categories, licensing, and whether data was scraped or licensed. (Cal. Bus. & Prof. Code § 22758)',
   '1', 'policy'),
  (fw_state_ai, 'CA-AI-3', 'CA SB 896 — Generative AI Risk Assessment for State Contracts',
   'Organizations providing AI services to California state agencies must complete and disclose a risk assessment for generative AI deployments, including potential harms, likelihood, and mitigation measures prior to contract execution.',
   '2', 'strategic'),
  (fw_state_ai, 'CA-AI-4', 'CA AB 302 — State Agency AI Use Transparency',
   'Maintain a publicly available inventory of AI systems used in government operations, including purpose, risk level, training data sources, and human oversight procedures, submitted annually to the legislature.',
   '2', 'organizational'),
  (fw_state_ai, 'CA-AI-5', 'CA AB 2885 — AI Statutory Definition Alignment',
   'Apply California statutory definitions of "artificial intelligence" and "automated decision system" consistently across all internal policies, vendor contracts, and public disclosures to ensure regulatory alignment and avoid definitional gaps.',
   '3', 'policy'),
  (fw_state_ai, 'CA-AI-6', 'CA AB 1008 — AI-Derived Inferences as Personal Information (CCPA)',
   'Treat AI-generated inferences, profiles, and predictions derived from personal information as personal information subject to CCPA/CPRA. Apply the full suite of consumer rights (access, deletion, correction, opt-out of sale/sharing) to AI-derived data.',
   '1', 'technical'),

  -- ── TEXAS: TRAIGA (Texas Responsible AI Governance Act) ─────────────────────
  (fw_state_ai, 'TX-AI-1', 'TX TRAIGA — High-Risk AI Consumer Disclosure',
   'Disclose to consumers when a high-risk AI system is used to make or substantially influence a consequential decision affecting them. Include the category of data used, the purpose, and a contact for consumer inquiries. (Texas TRAIGA § 541.002)',
   '1', 'policy'),
  (fw_state_ai, 'TX-AI-2', 'TX TRAIGA — Algorithmic Bias Risk Management Program',
   'Implement a documented risk management policy and program for high-risk AI systems that addresses known or reasonably foreseeable risks of algorithmic discrimination. Conduct pre-deployment testing by protected characteristic.',
   '1', 'strategic'),
  (fw_state_ai, 'TX-AI-3', 'TX TRAIGA — Deployer Oversight and Monitoring Obligations',
   'AI deployers must implement policies limiting AI use to documented intended purposes, train personnel on AI limitations and risks, continuously monitor AI performance, and maintain audit records of consequential decision outcomes.',
   '2', 'organizational'),

  -- ── VIRGINIA: HB 2048 (Consumer Data Protection Act AI Provisions) ───────────
  (fw_state_ai, 'VA-AI-1', 'VA HB 2048 — High-Risk AI Impact Assessment',
   'Before deploying a high-risk AI system, complete a documented impact assessment identifying the system''s purpose, risks to consumers, categories of data processed, and safeguards implemented to prevent algorithmic discrimination. (Va. Code Ann. § 59.1-578)',
   '1', 'strategic'),
  (fw_state_ai, 'VA-AI-2', 'VA HB 2048 — Right to Opt-Out of AI Profiling',
   'Provide Virginia consumers the right to opt-out of automated processing of personal data for profiling that produces legal or similarly significant effects. Implement an accessible opt-out mechanism and honor requests within legally required timeframes. (Va. Code Ann. § 59.1-574)',
   '1', 'policy'),
  (fw_state_ai, 'VA-AI-3', 'VA HB 2048 — Human Review of Consequential AI Decisions',
   'Implement a documented process allowing consumers to request human review of any consequential decision made through automated means. Automated processing may not constitute the sole basis for decisions without a human review option.',
   '1', 'policy'),

  -- ── CONNECTICUT: SB 2 (Connecticut AI Act) ────────────────────────────────────
  (fw_state_ai, 'CT-AI-1', 'CT SB 2 — Developer Duty of Reasonable Care',
   'AI developers of high-risk systems must use reasonable care in design, testing, and documentation to protect consumers from known or reasonably foreseeable risks of algorithmic discrimination based on protected class status.',
   '1', 'strategic'),
  (fw_state_ai, 'CT-AI-2', 'CT SB 2 — Deployer Impact Assessment and Consumer Rights',
   'Before deploying a high-risk AI system, complete an impact assessment and implement a governance program. Provide consumers notice of AI use in consequential decisions and a meaningful opportunity to appeal adverse outcomes.',
   '1', 'organizational'),
  (fw_state_ai, 'CT-AI-3', 'CT SB 2 — Annual Compliance Disclosure to Attorney General',
   'Submit an annual compliance summary of high-risk AI systems deployed, impact assessments completed, and any algorithmic discrimination incidents or consumer complaints to the Connecticut Attorney General''s office.',
   '2', 'organizational'),

  -- ── TENNESSEE: ELVIS Act ──────────────────────────────────────────────────────
  (fw_state_ai, 'TN-AI-1', 'TN ELVIS Act — AI Voice and Likeness Consent',
   'Obtain explicit, informed consent from an individual before using AI to replicate, simulate, or reproduce their voice or likeness for commercial purposes. Applies to musicians, performers, and any identifiable individual. (Tenn. Code Ann. § 47-25-1101)',
   '1', 'policy'),
  (fw_state_ai, 'TN-AI-2', 'TN ELVIS Act — Takedown and Removal Process',
   'Establish and publish a process for individuals to submit takedown requests for unauthorized AI-generated replications of their voice or likeness. Acknowledge requests within 48 hours and remove content within legally prescribed timeframes.',
   '1', 'technical'),
  (fw_state_ai, 'TN-AI-3', 'TN ELVIS Act — Platform Safe Harbor Compliance',
   'Platforms hosting AI-generated content must register a designated agent, implement compliant takedown procedures, and provide counter-notice processes to maintain safe harbor protections under the ELVIS Act and avoid strict liability.',
   '2', 'organizational'),

  -- ── UTAH: SB 149 (Utah Artificial Intelligence Policy Act) ───────────────────
  (fw_state_ai, 'UT-AI-1', 'UT SB 149 — GenAI Disclosure in Regulated Occupations',
   'Practitioners in regulated occupations (legal, healthcare, financial services, real estate) must clearly disclose to consumers when generative AI is used to provide services or advice. Disclosure must be clear, conspicuous, and prior to service delivery. (Utah Code Ann. § 13-2-11)',
   '1', 'policy'),
  (fw_state_ai, 'UT-AI-2', 'UT SB 149 — AI Chatbot Human Identity Disclosure',
   'Operators of AI-powered conversational systems must disclose the AI nature of the service when a user sincerely inquires whether they are interacting with a human. Deceptive AI identity claims are prohibited. (Utah Code Ann. § 13-2-12)',
   '1', 'policy'),
  (fw_state_ai, 'UT-AI-3', 'UT SB 149 — Consumer Protection Reporting Compliance',
   'Report AI-related consumer complaints and significant incidents to the Utah Division of Consumer Protection as required by regulation. Maintain records sufficient to demonstrate compliance with reporting obligations.',
   '3', 'organizational'),

  -- ── WASHINGTON: SB 5838 / HB 1951 ───────────────────────────────────────────
  (fw_state_ai, 'WA-AI-1', 'WA SB 5838 — Automated Decision System Inventory',
   'Maintain a current, version-controlled inventory of automated decision systems used in consequential decisions affecting Washington residents. Document system purpose, deployment context, affected populations, risk classification, and human oversight mechanisms.',
   '1', 'organizational'),
  (fw_state_ai, 'WA-AI-2', 'WA SB 5838 — Impact Assessment and Public Notice',
   'Conduct documented impact assessments for automated decision systems affecting Washington consumers in housing, employment, credit, education, and healthcare. Publish a public-facing summary of assessment results.',
   '1', 'strategic'),
  (fw_state_ai, 'WA-AI-3', 'WA HB 1951 — AI in Employment Decision Disclosure',
   'Disclose to Washington job applicants and employees when AI tools materially contribute to hiring, performance management, or termination decisions. Provide a documented human review option for individuals receiving adverse AI-assisted outcomes.',
   '1', 'policy'),

  -- ── MARYLAND: HB 1281 (Automated Decision Tools) ─────────────────────────────
  (fw_state_ai, 'MD-AI-1', 'MD HB 1281 — Independent Bias Audit for Employment AEDT',
   'Conduct an independent bias audit of automated decision tools used in employment decisions affecting Maryland residents before use and annually thereafter. Publish audit results on the organization''s website and provide candidates notice before the tool is applied.',
   '1', 'organizational'),
  (fw_state_ai, 'MD-AI-2', 'MD HB 1281 — Consumer Complaint Resolution Process',
   'Establish and maintain a formal process for Maryland consumers to submit complaints about automated decision outcomes. Investigate and respond to complaints in writing within 30 days. Escalate unresolved complaints to the Maryland Attorney General as required.',
   '2', 'policy'),

  -- ── NEW YORK STATE: AI Transparency Legislation ───────────────────────────────
  (fw_state_ai, 'NY-AI-1', 'NY — Automated Decision System Transparency',
   'Provide New York residents with plain-language explanations of how automated systems affect decisions about them, including data inputs, logic applied, confidence thresholds, and available options to contest decisions or request human review.',
   '1', 'policy'),
  (fw_state_ai, 'NY-AI-2', 'NY — AI Bias Reporting for High-Stakes Decisions',
   'For AI systems making high-stakes decisions (employment, credit, housing, healthcare) affecting New York residents, conduct annual algorithmic bias evaluations and maintain reports available to relevant state agencies upon request.',
   '1', 'organizational'),

  -- ── CROSS-CUTTING / MULTI-STATE COMPLIANCE ────────────────────────────────────
  (fw_state_ai, 'SAI-CORE-1', 'Multi-State AI Compliance Program',
   'Establish a centralized AI compliance program tracking all applicable state AI laws by jurisdiction, with a compliance calendar, regulatory watch process, policy update procedure, and a designated compliance owner per active state.',
   '1', 'strategic'),
  (fw_state_ai, 'SAI-CORE-2', 'Unified AI System Register',
   'Maintain a unified register of all AI systems in use, documenting: jurisdictions of deployment, applicable state laws, risk classification, impact assessment completion status, bias audit dates, and assigned compliance owners.',
   '1', 'organizational'),
  (fw_state_ai, 'SAI-CORE-3', 'Cross-State Algorithmic Fairness Controls',
   'Implement baseline algorithmic fairness controls — including protected-class disparity testing, impact ratio analysis, and corrective action procedures — sufficient to satisfy discrimination prohibitions in CO, TX, VA, CT, and WA simultaneously.',
   '1', 'technical'),
  (fw_state_ai, 'SAI-CORE-4', 'AI Training Data Provenance Documentation',
   'Document the origin, licensing status, consent basis, and data categories for all training data used in AI systems subject to CA AB 2013, VA, or CT transparency requirements. Maintain version history and make summaries publicly accessible.',
   '2', 'technical'),
  (fw_state_ai, 'SAI-CORE-5', 'State-Level AI Consumer Rights Fulfillment',
   'Implement operational workflows to fulfill AI-specific consumer rights across jurisdictions: right to access AI-derived inferences (CA/VA), right to appeal consequential decisions (CO/VA/CT), right to human review (NYC/WA), right to opt-out of AI profiling (VA/CO), and right to voice/likeness control (TN/CA).',
   '1', 'policy'),
  (fw_state_ai, 'SAI-CORE-6', 'Regulatory Change Management for State AI Laws',
   'Monitor state legislative and regulatory activity for AI laws across all 50 states. Update internal policies and controls within 90 days of new AI law enactments or material regulatory guidance. Maintain a state-law tracking log updated at least quarterly.',
   '2', 'strategic')
  ON CONFLICT (framework_id, control_id) DO NOTHING;

  -- ── 3. Add crosswalk mappings to NIST AI RMF ────────────────────────────────

  SELECT id INTO fw_nist_ai FROM frameworks WHERE code = 'nist_ai_rmf' LIMIT 1;

  IF fw_nist_ai IS NOT NULL THEN
    -- Insert crosswalk mappings using control UUID lookups
    INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, notes)
    SELECT src.id, tgt.id, 'related', map_note
    FROM (VALUES
      -- GOVERN function
      ('CO-AI-1',    'GOVERN-1', 'Colorado impact assessment implements NIST AI RMF risk governance policy'),
      ('CO-AI-3',    'GOVERN-4', 'Colorado algorithmic discrimination prevention maps to organizational AI risk culture'),
      ('CO-AI-5',    'GOVERN-5', 'Colorado developer documentation covers third-party AI risk disclosure'),
      ('IL-AI-4',    'GOVERN-1', 'Illinois employment AI governance implements NIST AI policy requirements'),
      ('TX-AI-2',    'GOVERN-1', 'Texas TRAIGA bias risk program implements NIST AI risk management policies'),
      ('TX-AI-3',    'GOVERN-2', 'Texas deployer oversight maps to NIST accountability structure'),
      ('CT-AI-1',    'GOVERN-4', 'Connecticut developer duty of care maps to organizational AI risk culture'),
      ('SAI-CORE-1', 'GOVERN-2', 'Multi-state compliance program implements NIST AI accountability structure'),
      ('SAI-CORE-6', 'GOVERN-1', 'Regulatory change management maps to NIST AI risk management policy update'),
      -- MAP function
      ('CO-AI-1',    'MAP-1',    'Colorado impact assessment maps to NIST AI system context establishment'),
      ('VA-AI-1',    'MAP-1',    'Virginia impact assessment implements NIST AI MAP context function'),
      ('CT-AI-2',    'MAP-2',    'Connecticut deployer impact assessment maps to NIST AI categorization'),
      ('WA-AI-2',    'MAP-1',    'Washington automated decision impact assessment maps to NIST context'),
      ('TX-AI-1',    'MAP-2',    'Texas high-risk AI disclosure maps to NIST AI categorization/classification'),
      ('SAI-CORE-2', 'MAP-2',    'Unified AI register maps to NIST AI system categorization function'),
      -- MEASURE function
      ('NYC-AI-1',   'MEASURE-1', 'NYC annual bias audit maps to NIST AI risk metrics and bias measurement'),
      ('MD-AI-1',    'MEASURE-1', 'Maryland bias audit maps to NIST AI risk metrics measurement function'),
      ('CO-AI-3',    'MEASURE-2', 'Colorado algorithmic discrimination testing maps to NIST AI system evaluation'),
      ('CA-AI-1',    'MEASURE-2', 'California AI watermarking maps to NIST AI system trustworthy characteristic evaluation'),
      ('CA-AI-2',    'MEASURE-2', 'California training data transparency maps to NIST AI documentation and measurement'),
      ('WA-AI-1',    'MEASURE-3', 'Washington AI system inventory maps to NIST AI system monitoring function'),
      ('SAI-CORE-3', 'MEASURE-1', 'Cross-state algorithmic fairness controls map to NIST AI bias measurement'),
      ('SAI-CORE-4', 'MEASURE-2', 'Training data provenance documentation maps to NIST AI system evaluation'),
      -- MANAGE function
      ('CO-AI-4',    'MANAGE-3', 'Colorado consumer appeal right maps to NIST AI risk response with responsibility assignment'),
      ('IL-AI-1',    'MANAGE-3', 'Illinois video interview consent maps to NIST AI risk response policy'),
      ('NYC-AI-3',   'MANAGE-4', 'NYC candidate notification maps to NIST AI risk communication to stakeholders'),
      ('TN-AI-2',    'MANAGE-3', 'Tennessee AI takedown process maps to NIST AI risk response and incident management'),
      ('UT-AI-1',    'MANAGE-4', 'Utah AI disclosure requirements map to NIST AI risk communication to consumers'),
      ('VA-AI-3',    'MANAGE-3', 'Virginia human review obligation maps to NIST AI risk response assignment'),
      ('SAI-CORE-5', 'MANAGE-3', 'Multi-state consumer rights fulfillment maps to NIST AI risk response')
    ) AS t(src_ctrl, tgt_ctrl, map_note)
    JOIN framework_controls src ON src.framework_id = fw_state_ai AND src.control_id = t.src_ctrl
    JOIN framework_controls tgt ON tgt.framework_id = fw_nist_ai  AND tgt.control_id = t.tgt_ctrl
    WHERE NOT EXISTS (
      SELECT 1 FROM control_mappings cm
      WHERE cm.source_control_id = src.id AND cm.target_control_id = tgt.id
    );
  END IF;

END $$;
