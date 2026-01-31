-- NIST AI Risk Management Framework (AI RMF) 1.0 - Complete Control Set
-- Source: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf

-- Framework
INSERT INTO frameworks (code, name, version, description, category, issuing_body, published_date, url) VALUES
('nist_ai_rmf', 'NIST AI Risk Management Framework', '1.0', 'A framework to better manage risks to individuals, organizations, and society associated with artificial intelligence. Organized around four functions: Govern, Map, Measure, and Manage.', 'ai_governance', 'NIST', '2023-01-26', 'https://www.nist.gov/itl/ai-risk-management-framework');

-- Get framework ID
DO $$
DECLARE
    fw_id UUID;
    gov_id UUID;
    map_id UUID;
    measure_id UUID;
    manage_id UUID;
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'nist_ai_rmf';
    
    -- AI RMF Functions
    INSERT INTO framework_functions (framework_id, code, name, description, sequence_order) VALUES
    (fw_id, 'GOVERN', 'Govern', 'Cultivates a culture of risk management and fosters trustworthy AI. Establishes processes and accountability for mapping, measuring, and managing AI risks.', 1),
    (fw_id, 'MAP', 'Map', 'Establishes context to frame risks related to an AI system. Identifies and documents system context, use cases, stakeholders, and potential impacts.', 2),
    (fw_id, 'MEASURE', 'Measure', 'Employs quantitative, qualitative, or mixed-method tools, techniques, and methodologies to analyze, assess, benchmark, and monitor AI risk and trustworthiness.', 3),
    (fw_id, 'MANAGE', 'Manage', 'Allocates risk resources to mapped and measured risks on a regular basis. Prioritizes risks, responds to risks, and documents risk decisions and residual risks.', 4);
    
    SELECT id INTO gov_id FROM framework_functions WHERE framework_id = fw_id AND code = 'GOVERN';
    SELECT id INTO map_id FROM framework_functions WHERE framework_id = fw_id AND code = 'MAP';
    SELECT id INTO measure_id FROM framework_functions WHERE framework_id = fw_id AND code = 'MEASURE';
    SELECT id INTO manage_id FROM framework_functions WHERE framework_id = fw_id AND code = 'MANAGE';
    
    -- GOVERN Controls
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, ai_relevance) VALUES
    (fw_id, gov_id, 'GOVERN-1.1', 'Legal and regulatory requirements involving AI are understood, managed, and documented', 'Organizations identify applicable laws, regulations, and policies (including sector-specific and international) that govern AI development and deployment. Legal reviews are conducted regularly.', 'critical', 'directive', true),
    (fw_id, gov_id, 'GOVERN-1.2', 'The characteristics of trustworthy AI are integrated into organizational policies, processes, and procedures', 'Trustworthy AI characteristics (validity, reliability, safety, security, resilience, accountability, transparency, explainability, interpretability, privacy enhancement, fairness) are embedded in organizational processes.', 'critical', 'directive', true),
    (fw_id, gov_id, 'GOVERN-1.3', 'Processes, procedures, and practices are in place to determine the needed level of risk management activities based on the organization''s risk tolerance', 'Risk tolerance is established and communicated. Risk management intensity varies based on AI system risk level and organizational priorities.', 'high', 'directive', true),
    (fw_id, gov_id, 'GOVERN-1.4', 'The risk management process is established, communicated, and documented', 'Formal AI risk management processes are defined, approved, and integrated with enterprise risk management.', 'high', 'directive', true),
    (fw_id, gov_id, 'GOVERN-1.5', 'Ongoing monitoring and periodic review of the risk management process and its outcomes are planned, and organizational roles and responsibilities are clearly defined', 'Risk management effectiveness is measured. Roles including AI risk owners, risk managers, and executive oversight are documented.', 'high', 'directive', true),
    (fw_id, gov_id, 'GOVERN-1.6', 'Mechanisms are in place to inventory AI systems and track their status across the AI lifecycle', 'AI model registries or inventories catalog all AI systems, their purposes, risk levels, lifecycle stages, and responsible parties.', 'critical', 'preventive', true),
    (fw_id, gov_id, 'GOVERN-1.7', 'Processes and procedures are in place for decommissioning and phasing out AI systems safely and in a manner that does not increase risks or decrease the organization''s trustworthiness', 'AI system retirement includes data retention policies, model archiving, stakeholder notification, and impact assessments for discontinuation.', 'high', 'preventive', true),
    
    (fw_id, gov_id, 'GOVERN-2.1', 'Roles and responsibilities and lines of communication related to mapping, measuring, and managing AI risks are documented and are clear to all individuals and teams', 'Governance structures clearly define who is accountable for AI risk decisions. Communication paths connect technical teams, risk management, legal, and executive leadership.', 'high', 'directive', true),
    (fw_id, gov_id, 'GOVERN-2.2', 'Accountability structures are in place so that the appropriate teams and individuals can take the appropriate actions when risks or unintended outcomes are identified', 'Escalation procedures specify when and how AI risks are escalated. Authority to pause or decommission AI systems is clearly defined.', 'critical', 'directive', true),
    (fw_id, gov_id, 'GOVERN-2.3', 'Accountability for decisions and for making predictions and actions in the AI system design, development, and deployment is assigned and documented', 'Decision logs record who approved AI system designs, training data selections, deployment decisions, and risk acceptances.', 'high', 'detective', true),
    
    (fw_id, gov_id, 'GOVERN-3.1', 'Organizational teams are committed to a culture that considers and communicates AI risk', 'Leadership demonstrates commitment to responsible AI. Risk awareness is part of organizational culture. Employees feel empowered to raise AI concerns.', 'high', 'directive', true),
    (fw_id, gov_id, 'GOVERN-3.2', 'Policies and procedures are in place to address AI risks and benefits arising from third-party software and data and other AI supply chain concerns', 'Third-party AI components (models, datasets, APIs) undergo risk assessment. Contracts include AI-specific terms (e.g., data provenance, model documentation, liability).', 'critical', 'preventive', true),
    
    (fw_id, gov_id, 'GOVERN-4.1', 'Organizational policies and practices are in place to foster a critical thinking and safety-first mindset in the design, development, deployment, and uses of AI systems', 'Red teaming, adversarial testing, and failure mode analysis are standard practices. "Move fast and break things" culture is balanced with safety considerations.', 'high', 'preventive', true),
    (fw_id, gov_id, 'GOVERN-4.2', 'Organizational teams and processes are in place to foster a culture of diversity, equity, inclusion, and accessibility (DEIA)', 'AI development teams are diverse. Accessibility is considered in AI system design. DEIA metrics are tracked and reported.', 'high', 'directive', true),
    (fw_id, gov_id, 'GOVERN-4.3', 'Organizational policies and procedures are in place to oversee AI system lifecycle decisions that may raise ethical issues', 'Ethics review boards or processes evaluate AI use cases. Ethical considerations are documented in risk assessments.', 'high', 'directive', true),
    
    (fw_id, gov_id, 'GOVERN-5.1', 'Organizational practices are in place to enable AI testing, identification of incidents, and information sharing', 'Testing environments allow safe AI experimentation. Incident reporting channels are established. Information sharing with industry groups is encouraged.', 'high', 'preventive', true),
    (fw_id, gov_id, 'GOVERN-5.2', 'Mechanisms are in place for tracking and responding to AI risks and related incidents over time', 'AI risk registers are maintained. Incident response plans include AI-specific scenarios. Post-incident reviews drive improvements.', 'critical', 'detective', true),
    
    (fw_id, gov_id, 'GOVERN-6.1', 'Policies and procedures are in place that address AI risks associated with third-party entities, including risks of infringement of a third-party''s intellectual property, privacy, or other rights', 'Third-party risk assessments include AI-specific risks. Contracts address IP ownership, data rights, and liability for AI outputs.', 'high', 'preventive', true),
    (fw_id, gov_id, 'GOVERN-6.2', 'Contingency processes are in place to handle failures or incidents in third-party data or AI systems deemed to be high-risk', 'Vendor contingency plans exist for critical AI suppliers. Alternative providers or fallback models are identified.', 'high', 'preventive', true);
    
    -- MAP Controls
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, ai_relevance) VALUES
    (fw_id, map_id, 'MAP-1.1', 'Intended purposes, potentially beneficial uses, context-specific laws, norms and expectations, and prospective settings in which the AI system will be deployed are understood and documented', 'Use case documentation includes intended users, deployment context, expected benefits, and relevant regulations. Deployment environment characteristics are documented.', 'critical', 'directive', true),
    (fw_id, map_id, 'MAP-1.2', 'Interdisciplinary AI actors and perspectives are identified and coordinated across the AI lifecycle', 'Cross-functional teams (data scientists, engineers, domain experts, ethicists, legal, UX) collaborate throughout AI development. Stakeholder engagement is documented.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-1.3', 'Organizational responsibilities for and risks to individuals, communities, organizations, and society are understood and documented', 'Impact assessments consider effects on different stakeholder groups. Societal implications are evaluated. Responsibility for harms is documented.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-1.4', 'Organizational risk tolerances are determined and documented', 'Specific risk tolerance thresholds for AI systems are established (e.g., acceptable false positive/negative rates, fairness metrics, performance requirements).', 'critical', 'directive', true),
    (fw_id, map_id, 'MAP-1.5', 'Processes for engagement with relevant AI actors and AI risk management are documented and integrated into organizational practices', 'Engagement plans identify when and how to involve stakeholders. Feedback mechanisms allow affected parties to provide input.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-1.6', 'Understanding of system goals and benefits is informed by a broad range of relevant AI actors', 'Benefit assessments incorporate diverse perspectives. Potential unintended uses are considered.', 'high', 'directive', true),
    
    (fw_id, map_id, 'MAP-2.1', 'Intended purposes, potentially harmful uses, and expected capabilities of the AI system are understood and documented', 'Misuse potential is analyzed. Known limitations are documented. Edge cases and failure modes are identified.', 'critical', 'preventive', true),
    (fw_id, map_id, 'MAP-2.2', 'Interdependencies between AI capabilities, AI actors, and other interacting AI and non-AI systems are mapped', 'System architecture diagrams show AI component interactions. Dependencies on external data sources or models are documented. Human-AI interaction points are identified.', 'high', 'preventive', true),
    (fw_id, map_id, 'MAP-2.3', 'AI capabilities, goals, and expected benefits and costs for all relevant AI actors are understood and documented', 'Cost-benefit analysis includes model development costs, computational costs, maintenance costs, and societal costs/benefits.', 'medium', 'directive', true),
    
    (fw_id, map_id, 'MAP-3.1', 'Potential benefits of intended AI system functionality and performance are understood', 'Benefit metrics are defined and measurable. Success criteria are established before deployment.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-3.2', 'Assumptions and limitations about the AI system are documented', 'Training data limitations, model assumptions, known biases, and performance boundaries are explicitly documented.', 'critical', 'directive', true),
    (fw_id, map_id, 'MAP-3.3', 'Risks related to the specific context in which the AI system will be deployed are understood and documented', 'Context-specific risk assessments consider deployment environment characteristics, user populations, and local regulations.', 'critical', 'detective', true),
    (fw_id, map_id, 'MAP-3.4', 'The organization has identified and documented the connections between the development of AI systems and the advancement of civil rights, civil liberties, and equal opportunities', 'Civil rights impact assessments evaluate effects on protected groups. Accessibility considerations are documented.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-3.5', 'Potential positive and negative impacts related to issues such as environmental well-being, equity, inclusion, and accessibility are understood and documented', 'Environmental impact (computational resources, energy consumption) is assessed. Equity and inclusion impacts are evaluated.', 'medium', 'directive', true),
    
    (fw_id, map_id, 'MAP-4.1', 'AI technology, including design, development, updates, and maintenance, is understood and documented', 'Technical documentation includes model architecture, training procedures, hyperparameters, and update processes.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-4.2', 'Data used in AI system testing, training, and updates are understood and documented', 'Data cards or datasheets document data sources, collection methods, preprocessing steps, and known limitations.', 'critical', 'preventive', true),
    (fw_id, map_id, 'MAP-4.3', 'Environmental impacts and sustainability concerns of AI system development and deployment are understood', 'Carbon footprint calculations, energy consumption metrics, and sustainability considerations are documented.', 'medium', 'directive', true),
    
    (fw_id, map_id, 'MAP-5.1', 'Potential positive and negative impacts from AI systems on those who may interact with the system are identified and documented', 'User impact assessments consider cognitive load, trust calibration, automation bias, and user autonomy effects.', 'high', 'directive', true),
    (fw_id, map_id, 'MAP-5.2', 'Human-AI configurations and interaction are understood and optimized', 'Human-in-the-loop, human-on-the-loop, and fully automated decision points are clearly defined and appropriate for risk level.', 'critical', 'preventive', true);
    
    -- MEASURE Controls
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, ai_relevance) VALUES
    (fw_id, measure_id, 'MEASURE-1.1', 'Appropriate methods, metrics, and tools for AI risk measurement are identified and chosen', 'Measurement methodology selection considers system type, deployment context, and available resources. Both technical and sociotechnical metrics are included.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-1.2', 'Appropriateness of AI metrics, tools, and methodologies is regularly evaluated and updated', 'Measurement approaches evolve as AI technology and understanding of risks mature. Emerging measurement techniques are assessed for adoption.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-1.3', 'Internal experts who did not serve as front-line developers for the system and/or independent assessors are involved in regular assessments and updates', 'Independent review processes provide objective risk assessment. Third-party auditors may be engaged for high-risk systems.', 'high', 'detective', true),
    
    (fw_id, measure_id, 'MEASURE-2.1', 'Test sets, metrics, and details about the tools used during TEVV are documented', 'TEVV (Test, Evaluation, Verification, and Validation) procedures are documented. Test datasets are representative of deployment conditions.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.2', 'Evaluations involving human subjects are informed by relevant subject matter experts, including experts in human factors, cognitive science, and social science', 'Human subject testing follows ethical guidelines. Cognitive biases and human-AI interaction patterns are evaluated by experts.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.3', 'AI system performance or assurance criteria are assessed and documented, including those beyond intended use', 'Performance is tested under out-of-distribution conditions. Robustness to adversarial examples is evaluated. Failure modes are characterized.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.4', 'The functionality and behavior of the AI system are internally or externally validated with interested parties', 'User acceptance testing involves intended users. Stakeholder validation confirms system meets needs without unintended consequences.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.5', 'The AI system is evaluated regularly for safety risks', 'Safety testing includes failure condition analysis, fault tree analysis, and hazard identification. Safety-critical systems undergo rigorous testing.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.6', 'The AI system is evaluated for trustworthy characteristics (valid, reliable, safe, secure, resilient, accountable, transparent, explainable, interpretable, privacy-enhanced, and fair)', 'Comprehensive trustworthiness assessments use established metrics and methodologies. Gaps are documented and addressed.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.7', 'AI system performance or assurance criteria are measured qualitatively or quantitatively and demonstrated for conditions similar to deployment setting(s)', 'Testing environments mirror production. Performance metrics reflect real-world operating conditions.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.8', 'Risks associated with transparency and accountability are examined and documented', 'Trade-offs between explainability and performance are evaluated. Documentation completeness is assessed.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.9', 'Negative residual risks (defined as the sum of all effects minus applied controls and any beneficial effects) are examined and documented', 'Residual risk after controls is quantified. Risk acceptance decisions are documented with justification.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.10', 'Measurement results regarding AI system trustworthiness in deployment context(s) are informed by input from domain experts and relevant AI actors', 'Expert review validates that measurement results correctly interpret system trustworthiness for specific context.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.11', 'Fairness and bias are assessed for the AI system as well as for data used to build the AI system', 'Bias testing covers training data, model outputs, and end-to-end system behavior. Multiple fairness metrics are evaluated. Disparate impact analysis is conducted.', 'critical', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.12', 'Environmental impacts and sustainability of AI model training and management activities are assessed and documented', 'Energy consumption, carbon emissions, and resource usage are measured and reported.', 'medium', 'detective', true),
    (fw_id, measure_id, 'MEASURE-2.13', 'Effectiveness of transparency mechanisms is assessed and documented', 'User comprehension of AI system capabilities and limitations is tested. Transparency materials (disclosures, explanations) are validated with users.', 'high', 'detective', true),
    
    (fw_id, measure_id, 'MEASURE-3.1', 'Approaches and metrics for measuring AI risks enumerated during the MAP function are selected for implementation starting with the most significant AI risks', 'Risk prioritization drives measurement focus. High-risk areas receive more intensive measurement.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-3.2', 'Appropriateness of metrics for an AI system is regularly assessed', 'Metric validity is evaluated. New metrics are adopted as understanding of AI risks evolves.', 'medium', 'detective', true),
    (fw_id, measure_id, 'MEASURE-3.3', 'Measurable performance improvements or declines based on consultations with relevant AI actors are identified and documented', 'Performance trends are tracked over time. Degradation is detected and investigated.', 'high', 'detective', true),
    
    (fw_id, measure_id, 'MEASURE-4.1', 'AI system constructs are tested and evaluated in a systematic fashion', 'Systematic testing includes unit tests, integration tests, and system tests. Test coverage is measured.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-4.2', 'Feedback about positive and negative impacts from those interacting with the AI system is captured and evaluated', 'User feedback mechanisms are in place. Complaints and concerns are tracked and analyzed.', 'high', 'detective', true),
    (fw_id, measure_id, 'MEASURE-4.3', 'AI risks and benefits are periodically assessed in structured ways', 'Regular risk reviews (quarterly, annually) reassess AI system risk profile. Benefit realization is tracked.', 'high', 'detective', true);
    
    -- MANAGE Controls
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, ai_relevance) VALUES
    (fw_id, manage_id, 'MANAGE-1.1', 'Priorities for addressing identified AI risks are identified and documented based on potential impact, likelihood, and available resources and methods', 'Risk prioritization considers severity, probability, and feasibility of mitigation. Resource allocation aligns with priorities.', 'critical', 'preventive', true),
    (fw_id, manage_id, 'MANAGE-1.2', 'Risk treatments for mapped and measured risks are communicated clearly to relevant AI actors', 'Risk treatment decisions (accept, mitigate, transfer, avoid) are documented and communicated. Rationale is provided.', 'high', 'preventive', true),
    (fw_id, manage_id, 'MANAGE-1.3', 'Responses to the AI risks deemed high priority are developed, planned, and documented', 'Mitigation plans include specific actions, responsible parties, timelines, and success criteria.', 'critical', 'preventive', true),
    (fw_id, manage_id, 'MANAGE-1.4', 'Risk treatments address the effectiveness of model lifecycle controls, including for training, tuning, and updates', 'Model governance processes control changes to AI systems. Update procedures include risk assessment.', 'high', 'preventive', true),
    
    (fw_id, manage_id, 'MANAGE-2.1', 'Identified AI risks are tracked and monitored on an ongoing basis', 'Risk dashboards provide visibility into current risk levels. Risk indicators trigger alerts when thresholds are exceeded.', 'critical', 'detective', true),
    (fw_id, manage_id, 'MANAGE-2.2', 'Risk management strategies are adjusted based on results of monitoring and feedback, or in response to incidents', 'Post-incident reviews drive risk management improvements. Emerging risks trigger strategy updates.', 'high', 'corrective', true),
    (fw_id, manage_id, 'MANAGE-2.3', 'Efficacy of risk treatments and controls for trustworthy characteristics is regularly evaluated, improved, or retired', 'Control effectiveness testing validates that risk mitigations work as intended. Ineffective controls are improved or replaced.', 'high', 'corrective', true),
    (fw_id, manage_id, 'MANAGE-2.4', 'Negative residual risks (defined as the sum of all effects minus applied controls and any beneficial effects) for the AI system are documented', 'Residual risks that remain after controls are applied are clearly communicated to decision-makers and affected parties.', 'critical', 'directive', true),
    
    (fw_id, manage_id, 'MANAGE-3.1', 'Risks and trustworthiness characteristics of third-party AI systems or components are regularly monitored', 'Vendor performance against SLAs is tracked. Third-party model outputs are monitored for degradation or bias.', 'high', 'detective', true),
    (fw_id, manage_id, 'MANAGE-3.2', 'Pre-trained models which are used for development are monitored as part of AI system regular monitoring and maintenance', 'Foundation model updates and deprecations are tracked. Model drift from pre-training is monitored.', 'high', 'detective', true),
    
    (fw_id, manage_id, 'MANAGE-4.1', 'Post-deployment AI system monitoring occurs', 'Production monitoring includes model performance, data quality, system health, and user behavior. Alerts notify teams of anomalies.', 'critical', 'detective', true),
    (fw_id, manage_id, 'MANAGE-4.2', 'Post-deployment monitoring is informed by specific risk assessments and AI system specifications', 'Monitoring scope and metrics align with identified risks. High-risk areas receive more intensive monitoring.', 'critical', 'detective', true),
    (fw_id, manage_id, 'MANAGE-4.3', 'Incidents and errors are tracked, monitored, and documented', 'Incident management systems capture AI-specific incidents. Root cause analysis is performed. Trends are analyzed.', 'critical', 'detective', true),
    (fw_id, manage_id, 'MANAGE-4.4', 'Post-deployment performance monitoring is carried out with relevant AI actors in an ongoing manner', 'User feedback is continuously collected. Stakeholder concerns are investigated and addressed.', 'high', 'detective', true);
    
END $$;
