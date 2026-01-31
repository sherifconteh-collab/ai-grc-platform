-- NIST AI Risk Management Framework (AI RMF) Seed Data
-- Released: January 2023
-- 4 Functions: GOVERN, MAP, MEASURE, MANAGE
-- 7 Categories, 97+ Actions/Controls

-- Insert Framework
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'nist_ai_rmf',
    'NIST AI RMF',
    'NIST Artificial Intelligence Risk Management Framework',
    '1.0',
    'National Institute of Standards and Technology (NIST)',
    'A framework for managing risks to individuals, organizations, and society associated with artificial intelligence.',
    'ai_governance',
    'https://www.nist.gov/itl/ai-risk-management-framework',
    '2023-01-26'
);

-- Get framework ID
DO $$
DECLARE
    fw_id UUID;
    func_id_govern UUID;
    func_id_map UUID;
    func_id_measure UUID;
    func_id_manage UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'nist_ai_rmf';

    -- ========================================
    -- GOVERN
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'GOVERN', 'Govern', 'Cultivates a culture of risk management and establishes roles, responsibilities, and authorities.', 1)
    RETURNING id INTO func_id_govern;

    -- GV.1: AI Risk Management Culture
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.1', 'Organizational culture', 'A culture of risk management and responsible AI is established across the organization', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.1.1', 'Senior Leadership Engagement', 'Senior leadership engages with and is accountable for AI risk management decisions', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.1.2', 'Risk Culture Development', 'Organization demonstrates commitment to a culture that considers and communicates AI risks', 'directive', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.1.3', 'Diversity and Inclusion', 'Diversity, equity, inclusion, and accessibility are prioritized in AI design, development, and deployment', 'directive', 'high', 3),
    (fw_id, func_id_govern, cat_id, 'GV.1.4', 'Ethics Principles', 'Organizational values and principles are established and integrated into AI system design and use', 'directive', 'high', 4),
    (fw_id, func_id_govern, cat_id, 'GV.1.5', 'AI Purpose Alignment', 'The organization''s AI principles and practices are evaluated and updated regularly', 'directive', 'medium', 5);

    -- GV.2: Roles and Responsibilities
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.2', 'Roles and Responsibilities', 'Clear roles, responsibilities, and authorities for AI risk management are established', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.2.1', 'AI Governance Structure', 'Roles and responsibilities related to AI are clearly defined, communicated, and documented', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.2.2', 'Resource Allocation', 'Resources for AI risk management are allocated and assigned', 'directive', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.2.3', 'Cross-functional Collaboration', 'AI risk management includes cross-functional collaboration across the organization', 'directive', 'high', 3);

    -- GV.3: AI Risk Policies and Procedures
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.3', 'Policies and Procedures', 'Policies, processes, procedures, and practices for AI are in place', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.3.1', 'AI Policy Framework', 'Policies and procedures are in place to address AI risks throughout the lifecycle', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.3.2', 'AI Risk Documentation', 'Risk management processes and decisions are documented', 'directive', 'high', 2);

    -- GV.4: Risk Management Strategy
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.4', 'Risk Strategy', 'Risk tolerance and risk appetite are determined and communicated', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.4.1', 'Risk Tolerance Definition', 'Organizational risk tolerance and risk appetite for AI systems are defined and communicated', 'directive', 'high', 1),
    (fw_id, func_id_govern, cat_id, 'GV.4.2', 'Risk Criteria', 'Risk criteria are defined for AI systems based on their intended use and context', 'directive', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.4.3', 'Continuous Risk Management', 'AI risk management processes are regularly reviewed and improved', 'corrective', 'medium', 3);

    -- GV.5: Legal and Regulatory
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.5', 'Legal and Regulatory', 'Legal and regulatory requirements involving AI are managed', 5)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.5.1', 'Regulatory Compliance', 'Relevant AI laws, regulations, and policies are identified and monitored', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.5.2', 'Legal Review Process', 'Legal reviews for AI systems are conducted before deployment', 'detective', 'high', 2);

    -- GV.6: Human-AI Configuration
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.6', 'Human-AI Configuration', 'The roles and responsibilities of humans and AI systems are clearly defined', 6)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.6.1', 'Human Oversight', 'Processes are in place for human oversight of AI systems', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.6.2', 'Human-AI Interaction', 'The organization ensures humans can appropriately assess, understand, and act on AI system outputs', 'directive', 'high', 2);

    -- ========================================
    -- MAP
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'MAP', 'Map', 'The context is established and risks are identified.', 2)
    RETURNING id INTO func_id_map;

    -- MAP.1: Context Establishment
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_map, 'MAP.1', 'Context Establishment', 'Intended purposes, potentially beneficial uses, and context of use are defined', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_map, cat_id, 'MAP.1.1', 'AI System Purpose', 'The intended purpose and beneficial uses of the AI system are documented', 'directive', 'critical', 1),
    (fw_id, func_id_map, cat_id, 'MAP.1.2', 'Use Context Definition', 'The context of use, including domain, users, and environment, is documented', 'directive', 'high', 2),
    (fw_id, func_id_map, cat_id, 'MAP.1.3', 'Stakeholder Identification', 'Relevant stakeholders, including impacted communities, are identified and engaged', 'directive', 'high', 3),
    (fw_id, func_id_map, cat_id, 'MAP.1.4', 'Expected Benefits', 'Expected benefits of the AI system are documented and assessed', 'directive', 'medium', 4),
    (fw_id, func_id_map, cat_id, 'MAP.1.5', 'Misuse Scenarios', 'Potential misuse scenarios and negative impacts are identified', 'detective', 'high', 5),
    (fw_id, func_id_map, cat_id, 'MAP.1.6', 'End-of-Life Planning', 'Processes for decommissioning and phasing out AI systems are established', 'directive', 'medium', 6);

    -- MAP.2: AI Capability Assessment
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_map, 'MAP.2', 'AI Capabilities', 'Interdisciplinary AI actors identify and document the AI system''s capabilities', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_map, cat_id, 'MAP.2.1', 'Capability Documentation', 'AI system capabilities and limitations are documented', 'directive', 'high', 1),
    (fw_id, func_id_map, cat_id, 'MAP.2.2', 'Performance Assessment', 'The AI system''s expected performance characteristics are documented', 'detective', 'high', 2),
    (fw_id, func_id_map, cat_id, 'MAP.2.3', 'Technology Assessment', 'The AI system''s technology type and architecture are documented', 'directive', 'medium', 3);

    -- MAP.3: Data and Input Quality
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_map, 'MAP.3', 'Data and Input', 'AI system training, validation, and testing data and inputs are identified and documented', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_map, cat_id, 'MAP.3.1', 'Data Sources', 'Data sources and characteristics are documented, including provenance and metadata', 'directive', 'high', 1),
    (fw_id, func_id_map, cat_id, 'MAP.3.2', 'Data Quality Assessment', 'Data quality, representativeness, and suitability are assessed', 'detective', 'high', 2),
    (fw_id, func_id_map, cat_id, 'MAP.3.3', 'Data Bias Identification', 'Potential biases in training data are identified and documented', 'detective', 'critical', 3),
    (fw_id, func_id_map, cat_id, 'MAP.3.4', 'Data Privacy', 'Processes for protecting data privacy and security are established', 'preventive', 'critical', 4),
    (fw_id, func_id_map, cat_id, 'MAP.3.5', 'Data Lineage', 'Data lineage and data lifecycle are documented', 'directive', 'medium', 5);

    -- MAP.4: Risk Identification
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_map, 'MAP.4', 'Risks and Impacts', 'AI risks and potential impacts are identified', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_map, cat_id, 'MAP.4.1', 'Harm Identification', 'Potential harms to individuals and society are identified', 'detective', 'critical', 1),
    (fw_id, func_id_map, cat_id, 'MAP.4.2', 'Fairness Assessment', 'Potential fairness concerns and discriminatory impacts are identified', 'detective', 'critical', 2),
    (fw_id, func_id_map, cat_id, 'MAP.4.3', 'Security Risk Assessment', 'Security and resilience risks are identified', 'detective', 'high', 3),
    (fw_id, func_id_map, cat_id, 'MAP.4.4', 'Transparency Requirements', 'Requirements for explainability and transparency are identified', 'directive', 'high', 4),
    (fw_id, func_id_map, cat_id, 'MAP.4.5', 'Environmental Impact', 'Environmental impacts of the AI system are assessed', 'detective', 'medium', 5);

    -- MAP.5: Impact Assessment
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_map, 'MAP.5', 'Impact Assessment', 'Impacts to individuals, groups, communities, organizations, and society are characterized', 5)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_map, cat_id, 'MAP.5.1', 'Impact Characterization', 'Potential positive and negative impacts on stakeholders are characterized', 'detective', 'high', 1),
    (fw_id, func_id_map, cat_id, 'MAP.5.2', 'Differential Impact Assessment', 'Differential impacts on various groups and populations are assessed', 'detective', 'critical', 2);

    -- ========================================
    -- MEASURE
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'MEASURE', 'Measure', 'Identified risks are analyzed, assessed, and prioritized.', 3)
    RETURNING id INTO func_id_measure;

    -- MEASURE.1: Risk Metrics
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_measure, 'MEASURE.1', 'Measurement Methods', 'Appropriate methods and metrics for measuring AI risks are identified and implemented', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_measure, cat_id, 'MEASURE.1.1', 'Risk Measurement Framework', 'A framework for measuring AI risks is established and implemented', 'detective', 'high', 1),
    (fw_id, func_id_measure, cat_id, 'MEASURE.1.2', 'Performance Metrics', 'Metrics for evaluating AI system performance are defined and tracked', 'detective', 'high', 2),
    (fw_id, func_id_measure, cat_id, 'MEASURE.1.3', 'Fairness Metrics', 'Metrics for assessing fairness and bias are established and monitored', 'detective', 'critical', 3);

    -- MEASURE.2: Trustworthiness
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_measure, 'MEASURE.2', 'Trustworthiness', 'AI systems are evaluated for trustworthiness characteristics', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.1', 'Validity and Reliability', 'AI system validity and reliability are assessed and documented', 'detective', 'high', 1),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.2', 'Safety Testing', 'AI system safety is tested and validated', 'detective', 'critical', 2),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.3', 'Security Testing', 'AI system security and resilience are tested', 'detective', 'critical', 3),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.4', 'Robustness Testing', 'AI system robustness to perturbations and adversarial inputs is tested', 'detective', 'high', 4),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.5', 'Explainability Assessment', 'The degree of AI system explainability is assessed', 'detective', 'high', 5),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.6', 'Transparency Evaluation', 'AI system transparency is evaluated', 'detective', 'medium', 6),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.7', 'Accountability Mechanisms', 'Mechanisms for AI system accountability are evaluated', 'detective', 'high', 7),
    (fw_id, func_id_measure, cat_id, 'MEASURE.2.8', 'Privacy Assessment', 'Privacy protections are assessed', 'detective', 'critical', 8);

    -- MEASURE.3: Ongoing Monitoring
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_measure, 'MEASURE.3', 'Monitoring', 'Mechanisms for tracking identified AI risks over time are in place', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_measure, cat_id, 'MEASURE.3.1', 'Production Monitoring', 'AI system performance in production is monitored', 'detective', 'critical', 1),
    (fw_id, func_id_measure, cat_id, 'MEASURE.3.2', 'Risk Tracking', 'AI risks are tracked over time with regular reviews', 'detective', 'high', 2),
    (fw_id, func_id_measure, cat_id, 'MEASURE.3.3', 'Impact Monitoring', 'Real-world impacts of AI systems are monitored', 'detective', 'high', 3);

    -- MEASURE.4: Validation
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_measure, 'MEASURE.4', 'Validation', 'AI system performance is validated', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_measure, cat_id, 'MEASURE.4.1', 'Independent Validation', 'Independent assessment and validation of AI systems are performed', 'detective', 'high', 1),
    (fw_id, func_id_measure, cat_id, 'MEASURE.4.2', 'Real-world Testing', 'AI systems are tested in realistic conditions', 'detective', 'high', 2),
    (fw_id, func_id_measure, cat_id, 'MEASURE.4.3', 'User Feedback', 'Feedback from users and impacted parties is collected and analyzed', 'detective', 'medium', 3);

    -- ========================================
    -- MANAGE
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'MANAGE', 'Manage', 'Identified AI risks are prioritized and responded to according to the projected impact.', 4)
    RETURNING id INTO func_id_manage;

    -- MANAGE.1: Risk Response
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_manage, 'MANAGE.1', 'Risk Response', 'AI risks are managed based on risk tolerance', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_manage, cat_id, 'MANAGE.1.1', 'Risk Treatment Plans', 'Risk treatment plans are developed and implemented', 'corrective', 'high', 1),
    (fw_id, func_id_manage, cat_id, 'MANAGE.1.2', 'Risk Prioritization', 'AI risks are prioritized based on their severity and likelihood', 'directive', 'high', 2),
    (fw_id, func_id_manage, cat_id, 'MANAGE.1.3', 'Risk Acceptance', 'Decisions to accept AI risks are documented and approved', 'directive', 'medium', 3);

    -- MANAGE.2: Risk Mitigation
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_manage, 'MANAGE.2', 'Mitigation', 'Risks identified from MAP and MEASURE functions are mitigated', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_manage, cat_id, 'MANAGE.2.1', 'Technical Mitigations', 'Technical risk mitigation methods are implemented', 'preventive', 'high', 1),
    (fw_id, func_id_manage, cat_id, 'MANAGE.2.2', 'Process Mitigations', 'Process-based risk mitigations are implemented', 'preventive', 'high', 2),
    (fw_id, func_id_manage, cat_id, 'MANAGE.2.3', 'Mitigation Effectiveness', 'The effectiveness of risk mitigations is evaluated', 'detective', 'high', 3);

    -- MANAGE.3: Incident Response
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_manage, 'MANAGE.3', 'Incident Response', 'Responses to AI incidents and errors are planned and implemented', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_manage, cat_id, 'MANAGE.3.1', 'Incident Response Plan', 'AI incident response plans are developed and maintained', 'directive', 'critical', 1),
    (fw_id, func_id_manage, cat_id, 'MANAGE.3.2', 'Incident Detection', 'Mechanisms to detect AI incidents and failures are in place', 'detective', 'critical', 2),
    (fw_id, func_id_manage, cat_id, 'MANAGE.3.3', 'Incident Escalation', 'Procedures for escalating AI incidents are established', 'directive', 'high', 3),
    (fw_id, func_id_manage, cat_id, 'MANAGE.3.4', 'Lessons Learned', 'Lessons learned from AI incidents are documented and used for improvement', 'corrective', 'medium', 4);

    -- MANAGE.4: Continuous Improvement
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_manage, 'MANAGE.4', 'Continuous Improvement', 'AI risk management processes are continuously improved', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_manage, cat_id, 'MANAGE.4.1', 'Regular Reviews', 'AI risk management processes are regularly reviewed and updated', 'corrective', 'medium', 1),
    (fw_id, func_id_manage, cat_id, 'MANAGE.4.2', 'Stakeholder Feedback', 'Feedback from stakeholders is incorporated into AI risk management', 'corrective', 'medium', 2),
    (fw_id, func_id_manage, cat_id, 'MANAGE.4.3', 'Emerging Risks', 'Processes for identifying and responding to emerging AI risks are in place', 'detective', 'high', 3);

END $$;
