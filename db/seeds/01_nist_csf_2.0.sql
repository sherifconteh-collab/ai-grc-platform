-- NIST Cybersecurity Framework 2.0 Seed Data
-- Released: February 2024
-- 6 Functions, 23 Categories, 106 Subcategories

-- Insert Framework
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'nist_csf_2.0',
    'NIST CSF 2.0',
    'NIST Cybersecurity Framework Version 2.0',
    '2.0',
    'National Institute of Standards and Technology (NIST)',
    'A voluntary framework for managing and reducing cybersecurity risks based on existing standards, guidelines, and practices.',
    'cybersecurity',
    'https://www.nist.gov/cyberframework',
    '2024-02-26'
);

-- Get framework ID for reference
DO $$
DECLARE
    fw_id UUID;
    func_id_govern UUID;
    func_id_identify UUID;
    func_id_protect UUID;
    func_id_detect UUID;
    func_id_respond UUID;
    func_id_recover UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'nist_csf_2.0';

    -- ========================================
    -- GOVERN (GV) - NEW IN 2.0
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'GV', 'Govern', 'The organization''s cybersecurity risk management strategy, expectations, and policy are established, communicated, and monitored.', 1)
    RETURNING id INTO func_id_govern;

    -- GV.OC: Organizational Context
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.OC', 'Organizational Context', 'The circumstances that surround the organization''s cybersecurity risk management decisions are understood', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.OC-01', 'Organizational Context', 'The organizational mission, objectives, stakeholders, and activities are understood and inform cybersecurity risk management decisions', 'directive', 'high', 1),
    (fw_id, func_id_govern, cat_id, 'GV.OC-02', 'Legal, Regulatory, and Contractual Requirements', 'Legal, regulatory, and contractual requirements regarding cybersecurity are understood and managed', 'directive', 'critical', 2),
    (fw_id, func_id_govern, cat_id, 'GV.OC-03', 'Internal and External Stakeholders', 'Internal and external stakeholders are identified, and their needs and expectations regarding cybersecurity are understood', 'directive', 'medium', 3);

    -- GV.RM: Risk Management Strategy
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.RM', 'Risk Management Strategy', 'The organization''s priorities, constraints, risk appetite and tolerance, and assumptions are established, communicated, and used to support operational risk decisions', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.RM-01', 'Risk Management Process', 'Risk management objectives are established and agreed to by organizational stakeholders', 'directive', 'high', 1),
    (fw_id, func_id_govern, cat_id, 'GV.RM-02', 'Risk Appetite and Tolerance', 'Risk appetite and risk tolerance statements are established, communicated, and maintained', 'directive', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.RM-03', 'Risk Determination', 'Cybersecurity risk is determined based on risk identification, analysis, and evaluation', 'detective', 'high', 3);

    -- GV.RR: Roles, Responsibilities, and Authorities
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.RR', 'Roles, Responsibilities, and Authorities', 'Cybersecurity roles, responsibilities, and authorities to foster accountability are established and communicated', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.RR-01', 'Cybersecurity Leadership', 'Organizational leadership is responsible and accountable for cybersecurity risk', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.RR-02', 'Roles and Responsibilities', 'Cybersecurity roles and responsibilities are established, communicated, understood, and enforced', 'directive', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.RR-03', 'Adequate Resources', 'Adequate resources are allocated commensurate with the cybersecurity risk strategy', 'directive', 'high', 3);

    -- GV.PO: Policy
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.PO', 'Policy', 'Organizational cybersecurity policy is established, communicated, and enforced', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.PO-01', 'Policy Establishment', 'Policy is established and communicated to manage cybersecurity risks', 'directive', 'critical', 1),
    (fw_id, func_id_govern, cat_id, 'GV.PO-02', 'Policy Review', 'Policy is reviewed, updated, and approved by organizational leadership', 'directive', 'high', 2);

    -- GV.OV: Oversight
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.OV', 'Oversight', 'Results of organization-wide cybersecurity risk management activities are used to inform, improve, and adjust the risk management strategy', 5)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.OV-01', 'Cybersecurity Strategy Review', 'The cybersecurity strategy is reviewed and adjusted to reflect changes to risk appetite, risk tolerance, or the threat landscape', 'detective', 'high', 1),
    (fw_id, func_id_govern, cat_id, 'GV.OV-02', 'Performance Monitoring', 'The cybersecurity strategy is monitored to inform cybersecurity risk management activities', 'detective', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.OV-03', 'Improvement', 'Cybersecurity risk management activities are improved based on findings', 'corrective', 'medium', 3);

    -- GV.SC: Supply Chain Risk Management
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_govern, 'GV.SC', 'Cybersecurity Supply Chain Risk Management', 'Cyber supply chain risk management processes are identified, established, managed, monitored, and improved by organizational stakeholders', 6)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_govern, cat_id, 'GV.SC-01', 'Supply Chain Strategy', 'A cybersecurity supply chain risk management strategy is established', 'directive', 'high', 1),
    (fw_id, func_id_govern, cat_id, 'GV.SC-02', 'Supplier Relationships', 'Suppliers and third-party partners are identified, prioritized, and assessed', 'detective', 'high', 2),
    (fw_id, func_id_govern, cat_id, 'GV.SC-03', 'Supplier Security Requirements', 'Contracts with suppliers include provisions for cybersecurity requirements', 'directive', 'high', 3);

    -- ========================================
    -- IDENTIFY (ID)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'ID', 'Identify', 'The organization''s current cybersecurity risks are understood.', 2)
    RETURNING id INTO func_id_identify;

    -- ID.AM: Asset Management
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_identify, 'ID.AM', 'Asset Management', 'Assets are managed consistent with the organization''s risk strategy', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_identify, cat_id, 'ID.AM-01', 'Physical Assets', 'Physical devices and systems are inventoried', 'detective', 'high', 1),
    (fw_id, func_id_identify, cat_id, 'ID.AM-02', 'Software Assets', 'Software platforms and applications are inventoried', 'detective', 'high', 2),
    (fw_id, func_id_identify, cat_id, 'ID.AM-03', 'Network Mapping', 'Organizational communication and data flows are mapped', 'detective', 'high', 3),
    (fw_id, func_id_identify, cat_id, 'ID.AM-04', 'External Assets', 'External information systems are catalogued', 'detective', 'medium', 4),
    (fw_id, func_id_identify, cat_id, 'ID.AM-05', 'Asset Prioritization', 'Assets are prioritized based on their classification, criticality, and business value', 'directive', 'high', 5),
    (fw_id, func_id_identify, cat_id, 'ID.AM-07', 'Data Classification', 'Data is identified and classified', 'directive', 'high', 6),
    (fw_id, func_id_identify, cat_id, 'ID.AM-08', 'Cybersecurity Roles', 'Cybersecurity roles and responsibilities for the entire workforce are identified', 'directive', 'high', 7);

    -- ID.RA: Risk Assessment
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_identify, 'ID.RA', 'Risk Assessment', 'The organization understands the cybersecurity risk to operations, assets, and individuals', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_identify, cat_id, 'ID.RA-01', 'Vulnerability Identification', 'Vulnerabilities in assets are identified and documented', 'detective', 'high', 1),
    (fw_id, func_id_identify, cat_id, 'ID.RA-02', 'Cyber Threat Intelligence', 'Cyber threat intelligence is received from information sharing forums and sources', 'detective', 'high', 2),
    (fw_id, func_id_identify, cat_id, 'ID.RA-03', 'Threat Identification', 'Internal and external threats are identified and documented', 'detective', 'high', 3),
    (fw_id, func_id_identify, cat_id, 'ID.RA-04', 'Impact Analysis', 'Potential business impacts and likelihoods are identified', 'detective', 'high', 4),
    (fw_id, func_id_identify, cat_id, 'ID.RA-05', 'Risk Response', 'Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk', 'detective', 'high', 5),
    (fw_id, func_id_identify, cat_id, 'ID.RA-06', 'Risk Responses', 'Risk responses are identified and prioritized', 'directive', 'high', 6);

    -- ID.IM: Improvement
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_identify, 'ID.IM', 'Improvement', 'Asset management and the associated cybersecurity risk strategy are improved', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_identify, cat_id, 'ID.IM-01', 'Asset Management Improvement', 'Improvements to asset management are identified from evaluations', 'corrective', 'medium', 1),
    (fw_id, func_id_identify, cat_id, 'ID.IM-02', 'Risk Strategy Improvement', 'Improvements to the organizational risk management strategy are identified', 'corrective', 'medium', 2);

    -- ========================================
    -- PROTECT (PR)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'PR', 'Protect', 'Safeguards to manage the organization''s cybersecurity risks are used.', 3)
    RETURNING id INTO func_id_protect;

    -- PR.AA: Identity Management, Authentication and Access Control
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_protect, 'PR.AA', 'Identity Management, Authentication and Access Control', 'Access to assets and associated facilities is limited to authorized users, processes, or devices', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_protect, cat_id, 'PR.AA-01', 'Identity Management', 'Identities and credentials are issued, managed, verified, revoked, and audited', 'preventive', 'critical', 1),
    (fw_id, func_id_protect, cat_id, 'PR.AA-02', 'Physical Access', 'Physical access to assets is managed and protected', 'preventive', 'high', 2),
    (fw_id, func_id_protect, cat_id, 'PR.AA-03', 'Remote Access', 'Remote access is managed and protected', 'preventive', 'high', 3),
    (fw_id, func_id_protect, cat_id, 'PR.AA-04', 'Least Privilege', 'Access permissions and authorizations are managed incorporating least privilege', 'preventive', 'critical', 4),
    (fw_id, func_id_protect, cat_id, 'PR.AA-05', 'Network Segmentation', 'Network integrity is protected (e.g., network segregation, network segmentation)', 'preventive', 'high', 5),
    (fw_id, func_id_protect, cat_id, 'PR.AA-06', 'Multi-factor Authentication', 'Multi-factor authentication is used', 'preventive', 'critical', 6);

    -- PR.AT: Awareness and Training
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_protect, 'PR.AT', 'Awareness and Training', 'The organization''s personnel are provided cybersecurity awareness and training', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_protect, cat_id, 'PR.AT-01', 'Security Awareness Training', 'All users are informed and trained on their cybersecurity roles and responsibilities', 'preventive', 'high', 1),
    (fw_id, func_id_protect, cat_id, 'PR.AT-02', 'Privileged User Training', 'Individuals in privileged roles receive role-appropriate cybersecurity training', 'preventive', 'high', 2);

    -- PR.DS: Data Security
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_protect, 'PR.DS', 'Data Security', 'Data is managed consistent with the organization''s risk strategy', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_protect, cat_id, 'PR.DS-01', 'Data-at-Rest Protection', 'Data-at-rest is protected', 'preventive', 'critical', 1),
    (fw_id, func_id_protect, cat_id, 'PR.DS-02', 'Data-in-Transit Protection', 'Data-in-transit is protected', 'preventive', 'critical', 2),
    (fw_id, func_id_protect, cat_id, 'PR.DS-10', 'Data Disposal', 'Data is disposed of securely', 'preventive', 'high', 3),
    (fw_id, func_id_protect, cat_id, 'PR.DS-11', 'Data Backups', 'Data are backed up consistent with the organization''s policy', 'preventive', 'high', 4);

    -- PR.PS: Platform Security
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_protect, 'PR.PS', 'Platform Security', 'The security of hardware, software, and services is managed', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_protect, cat_id, 'PR.PS-01', 'Configuration Management', 'Configuration management is performed throughout the lifecycle', 'preventive', 'high', 1),
    (fw_id, func_id_protect, cat_id, 'PR.PS-02', 'Secure Development', 'Software is maintained, replaced, and removed commensurate with risk', 'preventive', 'high', 2),
    (fw_id, func_id_protect, cat_id, 'PR.PS-03', 'Secure Configurations', 'Hardware is maintained, replaced, and removed commensurate with risk', 'preventive', 'high', 3),
    (fw_id, func_id_protect, cat_id, 'PR.PS-04', 'Log Generation', 'Log records are generated and made available for continuous monitoring', 'detective', 'high', 4),
    (fw_id, func_id_protect, cat_id, 'PR.PS-05', 'Software Installation Restrictions', 'Installation and execution of unauthorized software are prevented', 'preventive', 'high', 5);

    -- ========================================
    -- DETECT (DE)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'DE', 'Detect', 'Possible cybersecurity attacks and compromises are found and analyzed.', 4)
    RETURNING id INTO func_id_detect;

    -- DE.CM: Continuous Monitoring
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_detect, 'DE.CM', 'Continuous Monitoring', 'Assets are monitored to find anomalies, indicators of compromise, and other potentially adverse events', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_detect, cat_id, 'DE.CM-01', 'Network Monitoring', 'Networks and network services are monitored to find potentially adverse events', 'detective', 'high', 1),
    (fw_id, func_id_detect, cat_id, 'DE.CM-02', 'Physical Environment Monitoring', 'The physical environment is monitored to find potentially adverse events', 'detective', 'medium', 2),
    (fw_id, func_id_detect, cat_id, 'DE.CM-03', 'Personnel Activity Monitoring', 'Personnel activity and technology usage are monitored', 'detective', 'high', 3),
    (fw_id, func_id_detect, cat_id, 'DE.CM-06', 'External Service Provider Monitoring', 'External service provider activities are monitored', 'detective', 'high', 4),
    (fw_id, func_id_detect, cat_id, 'DE.CM-09', 'Incident Detection Tools', 'Computing hardware and software are monitored to find potentially adverse events', 'detective', 'high', 5);

    -- DE.AE: Adverse Event Analysis
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_detect, 'DE.AE', 'Adverse Event Analysis', 'Anomalies, indicators of compromise, and other potentially adverse events are analyzed', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_detect, cat_id, 'DE.AE-02', 'Event Correlation', 'Potentially adverse events are analyzed to better understand associated activities', 'detective', 'high', 1),
    (fw_id, func_id_detect, cat_id, 'DE.AE-03', 'Event Data Aggregation', 'Information is correlated from multiple sources', 'detective', 'high', 2),
    (fw_id, func_id_detect, cat_id, 'DE.AE-04', 'Impact Analysis', 'The estimated impact and scope of adverse events are understood', 'detective', 'high', 3),
    (fw_id, func_id_detect, cat_id, 'DE.AE-06', 'Incident Declaration', 'Information on adverse events is provided to authorized staff', 'detective', 'critical', 4);

    -- ========================================
    -- RESPOND (RS)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'RS', 'Respond', 'Actions regarding a detected cybersecurity incident are taken.', 5)
    RETURNING id INTO func_id_respond;

    -- RS.MA: Incident Management
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_respond, 'RS.MA', 'Incident Management', 'Responses to detected cybersecurity incidents are managed', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_respond, cat_id, 'RS.MA-01', 'Incident Response Plan', 'The incident response plan is executed in coordination with relevant third parties', 'corrective', 'critical', 1),
    (fw_id, func_id_respond, cat_id, 'RS.MA-02', 'Incident Reporting', 'Incidents are reported consistent with established criteria', 'directive', 'critical', 2),
    (fw_id, func_id_respond, cat_id, 'RS.MA-03', 'Incident Response Activities', 'Incident response activities are performed during and after an incident', 'corrective', 'critical', 3),
    (fw_id, func_id_respond, cat_id, 'RS.MA-04', 'Incident Escalation', 'Incidents are escalated or elevated as needed', 'directive', 'high', 4),
    (fw_id, func_id_respond, cat_id, 'RS.MA-05', 'Incident Response Plan Testing', 'The incident response plan is tested', 'detective', 'high', 5);

    -- RS.AN: Incident Analysis
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_respond, 'RS.AN', 'Incident Analysis', 'Investigations are conducted to ensure effective response and support forensics and recovery activities', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_respond, cat_id, 'RS.AN-03', 'Forensic Analysis', 'Analysis is performed to establish what happened during an incident', 'detective', 'high', 1),
    (fw_id, func_id_respond, cat_id, 'RS.AN-06', 'Impact Containment', 'Actions are taken to contain the impact of an incident', 'corrective', 'critical', 2),
    (fw_id, func_id_respond, cat_id, 'RS.AN-07', 'Incident Categorization', 'Incidents are categorized and prioritized', 'directive', 'high', 3);

    -- RS.CO: Incident Response Reporting and Communication
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_respond, 'RS.CO', 'Incident Response Reporting and Communication', 'Response activities are coordinated with internal and external stakeholders', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_respond, cat_id, 'RS.CO-02', 'Internal Communication', 'Internal incident response activities are coordinated with internal stakeholders', 'directive', 'critical', 1),
    (fw_id, func_id_respond, cat_id, 'RS.CO-03', 'External Communication', 'Information about incident response is shared with external stakeholders', 'directive', 'high', 2);

    -- RS.MI: Incident Mitigation
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_respond, 'RS.MI', 'Incident Mitigation', 'Activities are performed to prevent expansion of an event and mitigate its effects', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_respond, cat_id, 'RS.MI-01', 'Vulnerability Mitigation', 'Vulnerabilities are mitigated or documented as accepted risks', 'corrective', 'high', 1),
    (fw_id, func_id_respond, cat_id, 'RS.MI-02', 'Incident Containment', 'Incidents are contained', 'corrective', 'critical', 2);

    -- ========================================
    -- RECOVER (RC)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'RC', 'Recover', 'Assets and operations affected by a cybersecurity incident are restored.', 6)
    RETURNING id INTO func_id_recover;

    -- RC.RP: Incident Recovery Plan Execution
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_recover, 'RC.RP', 'Incident Recovery Plan Execution', 'Restoration activities are performed to ensure operational availability', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_recover, cat_id, 'RC.RP-01', 'Recovery Plan Execution', 'The recovery plan is executed during or after a cybersecurity incident', 'corrective', 'critical', 1),
    (fw_id, func_id_recover, cat_id, 'RC.RP-02', 'Recovery Plan Testing', 'Recovery plans are updated based on lessons learned', 'corrective', 'high', 2),
    (fw_id, func_id_recover, cat_id, 'RC.RP-03', 'Communication During Recovery', 'Recovery activities are communicated to internal and external stakeholders', 'directive', 'high', 3);

    -- RC.CO: Incident Recovery Communication
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id_recover, 'RC.CO', 'Incident Recovery Communication', 'Restoration activities are coordinated with internal and external parties', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id_recover, cat_id, 'RC.CO-03', 'Public Relations', 'Public relations are managed during the recovery from a cybersecurity incident', 'directive', 'medium', 1),
    (fw_id, func_id_recover, cat_id, 'RC.CO-04', 'Recovery Communication', 'Recovery activities and progress are communicated to internal and external stakeholders', 'directive', 'high', 2);

END $$;
