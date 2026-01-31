-- ISO 27001:2022, SOC 2, and Other Major Frameworks Seed Data
-- This file contains seed data for multiple frameworks

-- ============================================================================
-- ISO 27001:2022
-- ============================================================================
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'iso_27001',
    'ISO 27001',
    'ISO/IEC 27001:2022 Information Security Management Systems',
    '2022',
    'International Organization for Standardization (ISO)',
    'International standard for information security management systems (ISMS)',
    'cybersecurity',
    'https://www.iso.org/standard/82875.html',
    '2022-10-25'
);

-- Get ISO 27001 framework ID
DO $$
DECLARE
    fw_id_iso UUID;
    func_id UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id_iso FROM frameworks WHERE code = 'iso_27001';

    -- ISO 27001 has 4 domains/clauses with controls
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_iso, 'ORG', 'Organizational Controls', 'Controls related to organizational aspects of information security', 1)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_iso, func_id, 'A.5', 'Organizational Controls', 'Information security policies, roles, responsibilities', 1)
    RETURNING id INTO cat_id;

    -- A.5: Organizational Controls (37 controls)
    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_iso, func_id, cat_id, 'A.5.1', 'Policies for information security', 'A set of policies for information security shall be defined, approved by management, published and communicated', 'directive', 'critical', 1),
    (fw_id_iso, func_id, cat_id, 'A.5.2', 'Information security roles and responsibilities', 'Information security roles and responsibilities shall be defined and allocated', 'directive', 'critical', 2),
    (fw_id_iso, func_id, cat_id, 'A.5.3', 'Segregation of duties', 'Conflicting duties and areas of responsibility shall be segregated', 'preventive', 'high', 3),
    (fw_id_iso, func_id, cat_id, 'A.5.4', 'Management responsibilities', 'Management shall require personnel to apply information security in accordance with policies', 'directive', 'high', 4),
    (fw_id_iso, func_id, cat_id, 'A.5.5', 'Contact with authorities', 'Appropriate contacts with authorities shall be maintained', 'directive', 'medium', 5),
    (fw_id_iso, func_id, cat_id, 'A.5.6', 'Contact with special interest groups', 'Contacts with special interest groups shall be maintained', 'directive', 'medium', 6),
    (fw_id_iso, func_id, cat_id, 'A.5.7', 'Threat intelligence', 'Information about information security threats shall be collected and analyzed', 'detective', 'high', 7),
    (fw_id_iso, func_id, cat_id, 'A.5.8', 'Information security in project management', 'Information security shall be integrated into project management', 'directive', 'high', 8),
    (fw_id_iso, func_id, cat_id, 'A.5.9', 'Inventory of information and other associated assets', 'An inventory of information and assets shall be developed and maintained', 'directive', 'critical', 9),
    (fw_id_iso, func_id, cat_id, 'A.5.10', 'Acceptable use of information and other associated assets', 'Rules for acceptable use shall be identified, documented and implemented', 'directive', 'high', 10),
    (fw_id_iso, func_id, cat_id, 'A.5.11', 'Return of assets', 'Personnel shall return all organizational assets in their possession', 'directive', 'medium', 11),
    (fw_id_iso, func_id, cat_id, 'A.5.12', 'Classification of information', 'Information shall be classified according to security requirements', 'directive', 'critical', 12),
    (fw_id_iso, func_id, cat_id, 'A.5.13', 'Labelling of information', 'An appropriate set of procedures for information labelling shall be developed', 'directive', 'high', 13),
    (fw_id_iso, func_id, cat_id, 'A.5.14', 'Information transfer', 'Rules, procedures, or agreements shall be in place for transfer of information', 'directive', 'high', 14),
    (fw_id_iso, func_id, cat_id, 'A.5.15', 'Access control', 'Rules to control physical and logical access to information shall be established', 'preventive', 'critical', 15),
    (fw_id_iso, func_id, cat_id, 'A.5.16', 'Identity management', 'Full lifecycle of identities shall be managed', 'preventive', 'critical', 16),
    (fw_id_iso, func_id, cat_id, 'A.5.17', 'Authentication information', 'Allocation and management of authentication information shall be controlled', 'preventive', 'critical', 17),
    (fw_id_iso, func_id, cat_id, 'A.5.18', 'Access rights', 'Access rights shall be provisioned, reviewed, modified and removed', 'preventive', 'critical', 18),
    (fw_id_iso, func_id, cat_id, 'A.5.19', 'Information security in supplier relationships', 'Processes and procedures shall define and manage information security in supplier relationships', 'directive', 'high', 19),
    (fw_id_iso, func_id, cat_id, 'A.5.20', 'Addressing information security within supplier agreements', 'Security requirements shall be established and agreed with each supplier', 'directive', 'high', 20),
    (fw_id_iso, func_id, cat_id, 'A.5.21', 'Managing information security in ICT supply chain', 'Processes and procedures shall be defined to manage information security risks', 'directive', 'high', 21),
    (fw_id_iso, func_id, cat_id, 'A.5.22', 'Monitoring, review and change management of supplier services', 'Organizations shall monitor, review, evaluate supplier service delivery', 'detective', 'high', 22),
    (fw_id_iso, func_id, cat_id, 'A.5.23', 'Information security for use of cloud services', 'Processes for acquisition, use, management and exit from cloud services shall be established', 'directive', 'high', 23),
    (fw_id_iso, func_id, cat_id, 'A.5.24', 'Information security incident management planning', 'Organization shall plan and prepare for incident management', 'directive', 'critical', 24),
    (fw_id_iso, func_id, cat_id, 'A.5.25', 'Assessment and decision on information security events', 'Security events shall be assessed and classified as incidents', 'detective', 'high', 25),
    (fw_id_iso, func_id, cat_id, 'A.5.26', 'Response to information security incidents', 'Incidents shall be responded to in accordance with procedures', 'corrective', 'critical', 26),
    (fw_id_iso, func_id, cat_id, 'A.5.27', 'Learning from information security incidents', 'Knowledge from incidents shall be used to reduce likelihood of future incidents', 'corrective', 'high', 27),
    (fw_id_iso, func_id, cat_id, 'A.5.28', 'Collection of evidence', 'Organization shall establish procedures for identification and collection of evidence', 'detective', 'high', 28),
    (fw_id_iso, func_id, cat_id, 'A.5.29', 'Information security during disruption', 'Organization shall plan how to maintain information security during disruption', 'directive', 'high', 29),
    (fw_id_iso, func_id, cat_id, 'A.5.30', 'ICT readiness for business continuity', 'ICT readiness shall be planned, implemented, maintained and tested', 'preventive', 'high', 30),
    (fw_id_iso, func_id, cat_id, 'A.5.31', 'Legal, statutory, regulatory and contractual requirements', 'Legal, statutory, regulatory requirements shall be identified and documented', 'directive', 'critical', 31),
    (fw_id_iso, func_id, cat_id, 'A.5.32', 'Intellectual property rights', 'Organization shall implement procedures to protect intellectual property rights', 'directive', 'high', 32),
    (fw_id_iso, func_id, cat_id, 'A.5.33', 'Protection of records', 'Records shall be protected from loss, destruction, falsification and unauthorized access', 'preventive', 'high', 33),
    (fw_id_iso, func_id, cat_id, 'A.5.34', 'Privacy and protection of PII', 'Organization shall identify and meet requirements for privacy and PII protection', 'directive', 'critical', 34),
    (fw_id_iso, func_id, cat_id, 'A.5.35', 'Independent review of information security', 'Information security approach shall be reviewed independently at planned intervals', 'detective', 'high', 35),
    (fw_id_iso, func_id, cat_id, 'A.5.36', 'Compliance with policies and standards', 'Compliance with security policies shall be regularly reviewed', 'detective', 'high', 36),
    (fw_id_iso, func_id, cat_id, 'A.5.37', 'Documented operating procedures', 'Operating procedures for information processing facilities shall be documented', 'directive', 'high', 37);

    -- People Controls
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_iso, 'PEOPLE', 'People Controls', 'Controls related to people and human resources security', 2)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_iso, func_id, 'A.6', 'People Controls', 'Human resources security controls', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_iso, func_id, cat_id, 'A.6.1', 'Screening', 'Background verification checks shall be carried out on candidates for employment', 'preventive', 'high', 1),
    (fw_id_iso, func_id, cat_id, 'A.6.2', 'Terms and conditions of employment', 'Employment agreements shall state personnel and organizational responsibilities for security', 'directive', 'high', 2),
    (fw_id_iso, func_id, cat_id, 'A.6.3', 'Information security awareness, education and training', 'Personnel shall receive appropriate security awareness, education and training', 'preventive', 'critical', 3),
    (fw_id_iso, func_id, cat_id, 'A.6.4', 'Disciplinary process', 'A disciplinary process shall be established for personnel who commit security breaches', 'corrective', 'medium', 4),
    (fw_id_iso, func_id, cat_id, 'A.6.5', 'Responsibilities after termination', 'Security responsibilities that remain valid after termination shall be communicated', 'directive', 'high', 5),
    (fw_id_iso, func_id, cat_id, 'A.6.6', 'Confidentiality or non-disclosure agreements', 'Personnel shall sign confidentiality or non-disclosure agreements', 'directive', 'high', 6),
    (fw_id_iso, func_id, cat_id, 'A.6.7', 'Remote working', 'Security measures shall be implemented when personnel work remotely', 'preventive', 'high', 7),
    (fw_id_iso, func_id, cat_id, 'A.6.8', 'Information security event reporting', 'Organization shall provide a mechanism for personnel to report security events', 'detective', 'critical', 8);

    -- Physical Controls
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_iso, 'PHYSICAL', 'Physical Controls', 'Controls related to physical and environmental security', 3)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_iso, func_id, 'A.7', 'Physical Controls', 'Physical and environmental security controls', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_iso, func_id, cat_id, 'A.7.1', 'Physical security perimeters', 'Security perimeters shall be defined and used to protect areas with information', 'preventive', 'high', 1),
    (fw_id_iso, func_id, cat_id, 'A.7.2', 'Physical entry', 'Secure areas shall be protected by appropriate entry controls', 'preventive', 'high', 2),
    (fw_id_iso, func_id, cat_id, 'A.7.3', 'Securing offices, rooms and facilities', 'Physical security for offices, rooms and facilities shall be designed and implemented', 'preventive', 'high', 3),
    (fw_id_iso, func_id, cat_id, 'A.7.4', 'Physical security monitoring', 'Premises shall be continuously monitored for unauthorized physical access', 'detective', 'high', 4),
    (fw_id_iso, func_id, cat_id, 'A.7.5', 'Protecting against physical and environmental threats', 'Protection against physical and environmental threats shall be designed and implemented', 'preventive', 'high', 5),
    (fw_id_iso, func_id, cat_id, 'A.7.6', 'Working in secure areas', 'Security measures for working in secure areas shall be designed and implemented', 'preventive', 'medium', 6),
    (fw_id_iso, func_id, cat_id, 'A.7.7', 'Clear desk and clear screen', 'Clear desk rules and clear screen rules shall be defined and appropriately enforced', 'preventive', 'medium', 7),
    (fw_id_iso, func_id, cat_id, 'A.7.8', 'Equipment siting and protection', 'Equipment shall be sited securely and protected', 'preventive', 'high', 8),
    (fw_id_iso, func_id, cat_id, 'A.7.9', 'Security of assets off-premises', 'Off-site assets shall be protected', 'preventive', 'high', 9),
    (fw_id_iso, func_id, cat_id, 'A.7.10', 'Storage media', 'Storage media shall be managed through their lifecycle', 'preventive', 'high', 10),
    (fw_id_iso, func_id, cat_id, 'A.7.11', 'Supporting utilities', 'Information processing facilities shall be protected from power failures', 'preventive', 'high', 11),
    (fw_id_iso, func_id, cat_id, 'A.7.12', 'Cabling security', 'Cables carrying data or supporting information services shall be protected', 'preventive', 'medium', 12),
    (fw_id_iso, func_id, cat_id, 'A.7.13', 'Equipment maintenance', 'Equipment shall be maintained correctly to ensure availability and integrity', 'preventive', 'high', 13),
    (fw_id_iso, func_id, cat_id, 'A.7.14', 'Secure disposal or reuse of equipment', 'Items of equipment containing storage media shall be verified and securely disposed', 'preventive', 'high', 14);

    -- Technological Controls
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_iso, 'TECH', 'Technological Controls', 'Controls related to technology and systems', 4)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_iso, func_id, 'A.8', 'Technological Controls', 'Technical security controls', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_iso, func_id, cat_id, 'A.8.1', 'User endpoint devices', 'Information stored on, processed by or accessible via user endpoint devices shall be protected', 'preventive', 'high', 1),
    (fw_id_iso, func_id, cat_id, 'A.8.2', 'Privileged access rights', 'Allocation and use of privileged access rights shall be restricted and managed', 'preventive', 'critical', 2),
    (fw_id_iso, func_id, cat_id, 'A.8.3', 'Information access restriction', 'Access to information and systems shall be restricted', 'preventive', 'critical', 3),
    (fw_id_iso, func_id, cat_id, 'A.8.4', 'Access to source code', 'Read and write access to source code shall be appropriately managed', 'preventive', 'high', 4),
    (fw_id_iso, func_id, cat_id, 'A.8.5', 'Secure authentication', 'Secure authentication technologies and procedures shall be implemented', 'preventive', 'critical', 5),
    (fw_id_iso, func_id, cat_id, 'A.8.6', 'Capacity management', 'Use of resources shall be monitored and adjusted in accordance with requirements', 'preventive', 'medium', 6),
    (fw_id_iso, func_id, cat_id, 'A.8.7', 'Protection against malware', 'Protection against malware shall be implemented', 'preventive', 'critical', 7),
    (fw_id_iso, func_id, cat_id, 'A.8.8', 'Management of technical vulnerabilities', 'Information about technical vulnerabilities shall be obtained and addressed', 'corrective', 'critical', 8),
    (fw_id_iso, func_id, cat_id, 'A.8.9', 'Configuration management', 'Configurations, including security configurations, shall be established and managed', 'preventive', 'high', 9),
    (fw_id_iso, func_id, cat_id, 'A.8.10', 'Information deletion', 'Information stored in information systems shall be deleted when no longer required', 'preventive', 'high', 10),
    (fw_id_iso, func_id, cat_id, 'A.8.11', 'Data masking', 'Data masking shall be used in accordance with topic-specific policy', 'preventive', 'high', 11),
    (fw_id_iso, func_id, cat_id, 'A.8.12', 'Data leakage prevention', 'Data leakage prevention measures shall be applied to systems and networks', 'preventive', 'high', 12),
    (fw_id_iso, func_id, cat_id, 'A.8.13', 'Information backup', 'Backup copies of information and software shall be maintained', 'preventive', 'critical', 13),
    (fw_id_iso, func_id, cat_id, 'A.8.14', 'Redundancy of information processing facilities', 'Information processing facilities shall be implemented with redundancy', 'preventive', 'high', 14),
    (fw_id_iso, func_id, cat_id, 'A.8.15', 'Logging', 'Logs that record activities, exceptions, faults and events shall be produced and retained', 'detective', 'critical', 15),
    (fw_id_iso, func_id, cat_id, 'A.8.16', 'Monitoring activities', 'Networks, systems and applications shall be monitored for anomalous behaviour', 'detective', 'critical', 16),
    (fw_id_iso, func_id, cat_id, 'A.8.17', 'Clock synchronization', 'Clocks of information processing systems shall be synchronized', 'preventive', 'medium', 17),
    (fw_id_iso, func_id, cat_id, 'A.8.18', 'Use of privileged utility programs', 'Use of utility programs shall be restricted and controlled', 'preventive', 'high', 18),
    (fw_id_iso, func_id, cat_id, 'A.8.19', 'Installation of software on operational systems', 'Procedures and measures shall be implemented to securely manage software installation', 'preventive', 'high', 19),
    (fw_id_iso, func_id, cat_id, 'A.8.20', 'Networks security', 'Networks and network devices shall be secured and managed', 'preventive', 'high', 20),
    (fw_id_iso, func_id, cat_id, 'A.8.21', 'Security of network services', 'Security mechanisms shall be identified and implemented', 'preventive', 'high', 21),
    (fw_id_iso, func_id, cat_id, 'A.8.22', 'Segregation of networks', 'Groups of information services, users and systems shall be segregated', 'preventive', 'high', 22),
    (fw_id_iso, func_id, cat_id, 'A.8.23', 'Web filtering', 'Access to external websites shall be managed', 'preventive', 'medium', 23),
    (fw_id_iso, func_id, cat_id, 'A.8.24', 'Use of cryptography', 'Rules for effective use of cryptography shall be defined and implemented', 'preventive', 'critical', 24),
    (fw_id_iso, func_id, cat_id, 'A.8.25', 'Secure development lifecycle', 'Rules for secure development of software and systems shall be established', 'preventive', 'high', 25),
    (fw_id_iso, func_id, cat_id, 'A.8.26', 'Application security requirements', 'Information security requirements shall be identified and applied', 'preventive', 'high', 26),
    (fw_id_iso, func_id, cat_id, 'A.8.27', 'Secure system architecture and engineering principles', 'Principles for engineering secure systems shall be established and applied', 'preventive', 'high', 27),
    (fw_id_iso, func_id, cat_id, 'A.8.28', 'Secure coding', 'Secure coding principles shall be applied', 'preventive', 'high', 28),
    (fw_id_iso, func_id, cat_id, 'A.8.29', 'Security testing in development and acceptance', 'Security testing processes shall be defined and implemented', 'detective', 'high', 29),
    (fw_id_iso, func_id, cat_id, 'A.8.30', 'Outsourced development', 'Organization shall direct, monitor and review activities related to outsourced development', 'directive', 'high', 30),
    (fw_id_iso, func_id, cat_id, 'A.8.31', 'Separation of development, test and production environments', 'Development, testing and production environments shall be separated and secured', 'preventive', 'high', 31),
    (fw_id_iso, func_id, cat_id, 'A.8.32', 'Change management', 'Changes to information processing facilities shall be subject to change management', 'preventive', 'high', 32),
    (fw_id_iso, func_id, cat_id, 'A.8.33', 'Test information', 'Test data shall be protected and managed', 'preventive', 'medium', 33),
    (fw_id_iso, func_id, cat_id, 'A.8.34', 'Protection of information systems during audit testing', 'Audit tests shall be planned and agreed to minimize disruptions', 'preventive', 'medium', 34);

END $$;

-- ============================================================================
-- SOC 2 (Trust Services Criteria)
-- ============================================================================
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'soc2',
    'SOC 2',
    'System and Organization Controls 2',
    '2017',
    'American Institute of CPAs (AICPA)',
    'Framework for evaluating controls relevant to security, availability, processing integrity, confidentiality, and privacy',
    'compliance',
    'https://www.aicpa.org/soc2',
    '2017-05-01'
);

DO $$
DECLARE
    fw_id_soc UUID;
    func_id UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id_soc FROM frameworks WHERE code = 'soc2';

    -- CC: Common Criteria (applies to all TSCs)
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_soc, 'CC', 'Common Criteria', 'Trust service criteria common to all categories', 1)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_soc, func_id, 'CC', 'Common Criteria', 'Security, availability, processing integrity, confidentiality, privacy', 1)
    RETURNING id INTO cat_id;

    -- Common Criteria controls
    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_soc, func_id, cat_id, 'CC1.1', 'Control Environment', 'Entity demonstrates commitment to integrity and ethical values', 'directive', 'critical', 1),
    (fw_id_soc, func_id, cat_id, 'CC1.2', 'Board Independence', 'Board of directors demonstrates independence and oversight', 'directive', 'high', 2),
    (fw_id_soc, func_id, cat_id, 'CC1.3', 'Organizational Structure', 'Management establishes structures, reporting lines, authorities and responsibilities', 'directive', 'high', 3),
    (fw_id_soc, func_id, cat_id, 'CC1.4', 'Commitment to Competence', 'Entity demonstrates commitment to attract, develop, and retain competent individuals', 'directive', 'high', 4),
    (fw_id_soc, func_id, cat_id, 'CC1.5', 'Accountability', 'Entity holds individuals accountable for their internal control responsibilities', 'directive', 'high', 5),
    (fw_id_soc, func_id, cat_id, 'CC2.1', 'Risk Assessment Process', 'Entity specifies objectives with sufficient clarity to enable risk identification', 'detective', 'high', 6),
    (fw_id_soc, func_id, cat_id, 'CC2.2', 'Internal Risk Assessment', 'Entity identifies risks to achievement of objectives and analyzes risks', 'detective', 'high', 7),
    (fw_id_soc, func_id, cat_id, 'CC2.3', 'Fraud Risk Assessment', 'Entity considers potential for fraud in assessing risks', 'detective', 'high', 8),
    (fw_id_soc, func_id, cat_id, 'CC3.1', 'Control Activities', 'Entity specifies and develops control activities that contribute to mitigation of risks', 'preventive', 'high', 9),
    (fw_id_soc, func_id, cat_id, 'CC3.2', 'Technology Control Activities', 'Entity develops control activities over technology to support achievement of objectives', 'preventive', 'critical', 10),
    (fw_id_soc, func_id, cat_id, 'CC3.3', 'Policies and Procedures', 'Entity deploys control activities through policies and procedures', 'directive', 'high', 11),
    (fw_id_soc, func_id, cat_id, 'CC3.4', 'Segregation of Duties', 'Entity establishes segregation of duties in design of control activities', 'preventive', 'high', 12),
    (fw_id_soc, func_id, cat_id, 'CC4.1', 'Information Quality', 'Entity obtains or generates and uses relevant, quality information', 'detective', 'high', 13),
    (fw_id_soc, func_id, cat_id, 'CC4.2', 'Internal Communication', 'Entity internally communicates information to support functioning of internal control', 'directive', 'high', 14),
    (fw_id_soc, func_id, cat_id, 'CC5.1', 'Monitoring Activities', 'Entity selects, develops, and performs ongoing monitoring activities', 'detective', 'high', 15),
    (fw_id_soc, func_id, cat_id, 'CC5.2', 'Deficiency Evaluation', 'Entity evaluates and communicates internal control deficiencies', 'corrective', 'high', 16),
    (fw_id_soc, func_id, cat_id, 'CC6.1', 'Logical Access', 'Entity implements logical access security software and infrastructure', 'preventive', 'critical', 17),
    (fw_id_soc, func_id, cat_id, 'CC6.2', 'Access Provisioning', 'Prior to issuing credentials, entity registers and authorizes new users', 'preventive', 'critical', 18),
    (fw_id_soc, func_id, cat_id, 'CC6.3', 'Access Removal', 'Entity removes access when appropriate', 'preventive', 'high', 19),
    (fw_id_soc, func_id, cat_id, 'CC6.4', 'Physical Access', 'Entity restricts physical access to facilities and protected information assets', 'preventive', 'high', 20),
    (fw_id_soc, func_id, cat_id, 'CC6.5', 'Access Monitoring', 'Entity discontinues logical and physical protections when appropriate', 'detective', 'high', 21),
    (fw_id_soc, func_id, cat_id, 'CC6.6', 'Encryption', 'Entity implements encryption to protect data', 'preventive', 'critical', 22),
    (fw_id_soc, func_id, cat_id, 'CC6.7', 'Transmission Security', 'Entity restricts transmission, movement, and removal of information', 'preventive', 'high', 23),
    (fw_id_soc, func_id, cat_id, 'CC6.8', 'Change Management', 'Entity implements controls over system changes', 'preventive', 'high', 24),
    (fw_id_soc, func_id, cat_id, 'CC7.1', 'Threat Detection', 'Entity identifies and analyzes changes that could impact internal controls', 'detective', 'critical', 25),
    (fw_id_soc, func_id, cat_id, 'CC7.2', 'Threat Monitoring', 'Entity monitors system components for anomalies', 'detective', 'critical', 26),
    (fw_id_soc, func_id, cat_id, 'CC7.3', 'Incident Response', 'Entity evaluates security events to determine whether they could impact system', 'corrective', 'critical', 27),
    (fw_id_soc, func_id, cat_id, 'CC7.4', 'Incident Communication', 'Entity responds to and communicates security incidents', 'corrective', 'critical', 28),
    (fw_id_soc, func_id, cat_id, 'CC7.5', 'System Recovery', 'Entity identifies, develops, and implements activities to recover from incidents', 'corrective', 'high', 29),
    (fw_id_soc, func_id, cat_id, 'CC8.1', 'Change Management Process', 'Entity authorizes, designs, develops, and tests changes to infrastructure', 'preventive', 'high', 30),
    (fw_id_soc, func_id, cat_id, 'CC9.1', 'Third-Party Risk', 'Entity identifies, assesses, and manages risks associated with vendors', 'directive', 'high', 31),
    (fw_id_soc, func_id, cat_id, 'CC9.2', 'Vendor Monitoring', 'Entity assesses vendor controls and monitors vendor performance', 'detective', 'high', 32);

    -- Additional category-specific controls would go here (Availability, Confidentiality, Privacy, Processing Integrity)
    -- For brevity, showing the common criteria structure

END $$;
