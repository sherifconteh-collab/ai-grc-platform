-- SOC 2 Trust Services Criteria (TSC) 2017
-- Source: AICPA Trust Services Criteria

-- Framework
INSERT INTO frameworks (code, name, version, description, category, issuing_body, published_date, mandatory, url) VALUES
('soc2', 'SOC 2 Trust Services Criteria', '2017', 'Framework for service organizations to demonstrate controls relevant to security, availability, processing integrity, confidentiality, and privacy. Used for SOC 2 Type I and Type II audits. Based on five Trust Services Categories.', 'compliance', 'AICPA', '2017-01-01', false, 'https://www.aicpa.org/soc4so');

-- Get framework ID
DO $$
DECLARE
    fw_id UUID;
    cc_id UUID;
    sec_id UUID;
    avail_id UUID;
    proc_int_id UUID;
    conf_id UUID;
    priv_id UUID;
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'soc2';
    
    -- SOC 2 Trust Services Categories
    INSERT INTO framework_functions (framework_id, code, name, description, sequence_order) VALUES
    (fw_id, 'CC', 'Common Criteria', 'Common criteria related to all trust services categories. Foundation controls that apply across security, availability, processing integrity, confidentiality, and privacy.', 1),
    (fw_id, 'SEC', 'Security', 'Information and systems are protected against unauthorized access, unauthorized disclosure, and damage to systems that could compromise availability, integrity, confidentiality, and privacy.', 2),
    (fw_id, 'AVAIL', 'Availability', 'Information and systems are available for operation and use as committed or agreed.', 3),
    (fw_id, 'PI', 'Processing Integrity', 'System processing is complete, valid, accurate, timely, and authorized to meet the entity''s objectives.', 4),
    (fw_id, 'CONF', 'Confidentiality', 'Information designated as confidential is protected to meet the entity''s objectives.', 5),
    (fw_id, 'PRIV', 'Privacy', 'Personal information is collected, used, retained, disclosed, and disposed of to meet the entity''s objectives.', 6);
    
    SELECT id INTO cc_id FROM framework_functions WHERE framework_id = fw_id AND code = 'CC';
    SELECT id INTO sec_id FROM framework_functions WHERE framework_id = fw_id AND code = 'SEC';
    SELECT id INTO avail_id FROM framework_functions WHERE framework_id = fw_id AND code = 'AVAIL';
    SELECT id INTO proc_int_id FROM framework_functions WHERE framework_id = fw_id AND code = 'PI';
    SELECT id INTO conf_id FROM framework_functions WHERE framework_id = fw_id AND code = 'CONF';
    SELECT id INTO priv_id FROM framework_functions WHERE framework_id = fw_id AND code = 'PRIV';
    
    -- COMMON CRITERIA (CC) - Foundation controls
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    -- CC1: Control Environment
    (fw_id, cc_id, 'CC1.1', 'COSO Principle 1: Demonstrates commitment to integrity and ethical values', 'The entity demonstrates a commitment to integrity and ethical values through policies, procedures, and tone at the top.', 'critical', 'directive', 'low'),
    (fw_id, cc_id, 'CC1.2', 'COSO Principle 2: Board demonstrates independence and oversight', 'The board of directors demonstrates independence from management and exercises oversight of the development and performance of internal control.', 'high', 'directive', 'low'),
    (fw_id, cc_id, 'CC1.3', 'COSO Principle 3: Establishes structures, authorities, and responsibilities', 'Management establishes, with board oversight, structures, reporting lines, and appropriate authorities and responsibilities in the pursuit of objectives.', 'high', 'directive', 'low'),
    (fw_id, cc_id, 'CC1.4', 'COSO Principle 4: Demonstrates commitment to competence', 'The entity demonstrates a commitment to attract, develop, and retain competent individuals in alignment with objectives.', 'high', 'preventive', 'low'),
    (fw_id, cc_id, 'CC1.5', 'COSO Principle 5: Enforces accountability', 'The entity holds individuals accountable for their internal control responsibilities in the pursuit of objectives.', 'high', 'directive', 'low'),
    
    -- CC2: Communication and Information
    (fw_id, cc_id, 'CC2.1', 'COSO Principle 13: Uses relevant information', 'The entity obtains or generates and uses relevant, quality information to support the functioning of internal control.', 'high', 'preventive', 'medium'),
    (fw_id, cc_id, 'CC2.2', 'COSO Principle 14: Communicates internally', 'The entity internally communicates information, including objectives and responsibilities for internal control, necessary to support the functioning of internal control.', 'high', 'directive', 'low'),
    (fw_id, cc_id, 'CC2.3', 'COSO Principle 15: Communicates externally', 'The entity communicates with external parties regarding matters affecting the functioning of internal control.', 'medium', 'directive', 'low'),
    
    -- CC3: Risk Assessment
    (fw_id, cc_id, 'CC3.1', 'COSO Principle 6: Specifies suitable objectives', 'The entity specifies objectives with sufficient clarity to enable the identification and assessment of risks relating to objectives.', 'critical', 'directive', 'low'),
    (fw_id, cc_id, 'CC3.2', 'COSO Principle 7: Identifies and analyzes risk', 'The entity identifies risks to the achievement of its objectives across the entity and analyzes risks as a basis for determining how the risks should be managed.', 'critical', 'detective', 'medium'),
    (fw_id, cc_id, 'CC3.3', 'COSO Principle 8: Assesses fraud risk', 'The entity considers the potential for fraud in assessing risks to the achievement of objectives.', 'high', 'detective', 'low'),
    (fw_id, cc_id, 'CC3.4', 'COSO Principle 9: Identifies and analyzes significant change', 'The entity identifies and assesses changes that could significantly impact the system of internal control.', 'high', 'detective', 'medium'),
    
    -- CC4: Monitoring Activities
    (fw_id, cc_id, 'CC4.1', 'COSO Principle 16: Conducts ongoing and/or separate evaluations', 'The entity selects, develops, and performs ongoing and/or separate evaluations to ascertain whether the components of internal control are present and functioning.', 'high', 'detective', 'medium'),
    (fw_id, cc_id, 'CC4.2', 'COSO Principle 17: Evaluates and communicates deficiencies', 'The entity evaluates and communicates internal control deficiencies in a timely manner to those parties responsible for taking corrective action, including senior management and the board of directors, as appropriate.', 'high', 'corrective', 'low'),
    
    -- CC5: Control Activities
    (fw_id, cc_id, 'CC5.1', 'COSO Principle 10: Selects and develops control activities', 'The entity selects and develops control activities that contribute to the mitigation of risks to the achievement of objectives to acceptable levels.', 'critical', 'preventive', 'medium'),
    (fw_id, cc_id, 'CC5.2', 'COSO Principle 11: Selects and develops general controls over technology', 'The entity also selects and develops general control activities over technology to support the achievement of objectives.', 'critical', 'preventive', 'high'),
    (fw_id, cc_id, 'CC5.3', 'COSO Principle 12: Deploys control activities', 'The entity deploys control activities through policies that establish what is expected and procedures that put policies into action.', 'high', 'directive', 'medium'),
    
    -- CC6: Logical and Physical Access Controls
    (fw_id, cc_id, 'CC6.1', 'Restricts logical access', 'The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events to meet the entity''s objectives.', 'critical', 'preventive', 'high'),
    (fw_id, cc_id, 'CC6.2', 'Identifies and authenticates users', 'Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users whose access is administered by the entity.', 'critical', 'preventive', 'high'),
    (fw_id, cc_id, 'CC6.3', 'Considers network segmentation', 'The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on roles, responsibilities, or the system design and changes, giving consideration to the concepts of least privilege and segregation of duties.', 'high', 'preventive', 'high'),
    (fw_id, cc_id, 'CC6.4', 'Restricts access to information assets', 'The entity restricts physical access to facilities and protected information assets to authorized personnel to meet the entity''s objectives.', 'high', 'preventive', 'medium'),
    (fw_id, cc_id, 'CC6.5', 'Discontinues logical and physical access', 'The entity discontinues logical and physical protections over physical assets only after the ability to read or recover data and software from those assets has been diminished and is no longer required to meet the entity''s objectives.', 'high', 'preventive', 'medium'),
    (fw_id, cc_id, 'CC6.6', 'Implements logical access security measures', 'The entity implements logical access security measures to protect against threats from sources outside its system boundaries.', 'critical', 'preventive', 'high'),
    (fw_id, cc_id, 'CC6.7', 'Restricts access to system configurations', 'The entity restricts the transmission, movement, and removal of information to authorized internal and external users and processes, and protects it during transmission, movement, or removal to meet the entity''s objectives.', 'high', 'preventive', 'high'),
    (fw_id, cc_id, 'CC6.8', 'Restricts use of system utilities and configuration', 'The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software to meet the entity''s objectives.', 'critical', 'preventive', 'high'),
    
    -- CC7: System Operations
    (fw_id, cc_id, 'CC7.1', 'Detects and mitigates processing deviations', 'To meet its objectives, the entity uses detection and monitoring procedures to identify anomalies; analyzes anomalies to determine whether they represent security events; and, as appropriate, takes action.', 'critical', 'detective', 'high'),
    (fw_id, cc_id, 'CC7.2', 'Monitors system components', 'The entity monitors system components and the operation of those components for anomalies that are indicative of malicious acts, natural disasters, and errors affecting the entity''s ability to meet its objectives.', 'critical', 'detective', 'high'),
    (fw_id, cc_id, 'CC7.3', 'Implements incident response plan', 'The entity evaluates security events to determine whether they could or have resulted in a failure of the entity to meet its objectives and, if so, takes actions to prevent or address such failures.', 'critical', 'corrective', 'medium'),
    (fw_id, cc_id, 'CC7.4', 'Addresses impact of identified events', 'The entity responds to identified security incidents by executing a defined incident response program to understand, contain, remediate, and communicate security incidents, as appropriate.', 'critical', 'corrective', 'medium'),
    (fw_id, cc_id, 'CC7.5', 'Deploys detection and prevention tools', 'The entity identifies, develops, and implements activities to recover from identified security incidents.', 'critical', 'corrective', 'medium'),
    
    -- CC8: Change Management
    (fw_id, cc_id, 'CC8.1', 'Manages changes throughout the system lifecycle', 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet its objectives.', 'critical', 'preventive', 'medium'),
    
    -- CC9: Risk Mitigation
    (fw_id, cc_id, 'CC9.1', 'Identifies and assesses risks', 'The entity identifies, selects, and develops risk mitigation activities for risks arising from potential business disruptions.', 'high', 'preventive', 'low'),
    (fw_id, cc_id, 'CC9.2', 'Assesses and manages risks associated with vendors', 'The entity assesses and manages risks associated with vendors and business partners.', 'high', 'preventive', 'medium');
    
    -- ADDITIONAL CRITERIA: Security (A1)
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, sec_id, 'A1.1', 'Additional security policies', 'The entity has documented and communicated its security policies to authorized users.', 'high', 'directive', 'low'),
    (fw_id, sec_id, 'A1.2', 'Changes to security policies', 'The entity has documented and communicated its process for informing management of breaches of the system security and for addressing subsequent corrective action.', 'high', 'directive', 'low'),
    (fw_id, sec_id, 'A1.3', 'Security breach', 'The entity''s security policies address the classification of data and information.', 'high', 'directive', 'low');
    
    -- ADDITIONAL CRITERIA: Availability (A1)
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, avail_id, 'A1.1', 'Availability and performance capacity', 'The entity maintains, monitors, and evaluates current processing capacity and use of system components to manage capacity demand and to enable the implementation of additional capacity to help meet its objectives.', 'critical', 'preventive', 'high'),
    (fw_id, avail_id, 'A1.2', 'Environmental protections, software, data backup, and recovery', 'The entity authorizes, designs, develops or acquires, implements, operates, approves, maintains, and monitors environmental protections, software, data back-up processes, and recovery infrastructure to meet its objectives.', 'critical', 'preventive', 'high'),
    (fw_id, avail_id, 'A1.3', 'Recovery and business continuity plans', 'The entity tests recovery plan procedures supporting system recovery to meet its objectives.', 'critical', 'corrective', 'medium');
    
    -- ADDITIONAL CRITERIA: Processing Integrity (P1-P7)
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential, ai_relevance) VALUES
    (fw_id, proc_int_id, 'P1.1', 'Quality assurance', 'The entity implements policies and procedures over system inputs, including controls over completeness and accuracy, to result in products, services, and reporting to meet the entity''s objectives.', 'critical', 'preventive', 'medium', true),
    (fw_id, proc_int_id, 'P2.1', 'Authorization of system inputs', 'The entity implements policies and procedures over system processing to result in products, services, and reporting to meet the entity''s objectives.', 'high', 'preventive', 'medium', true),
    (fw_id, proc_int_id, 'P3.1', 'Accuracy and completeness of system inputs', 'The entity implements policies and procedures to make available or deliver output completely, accurately, and timely in accordance with specifications to meet the entity''s objectives.', 'high', 'preventive', 'high', true),
    (fw_id, proc_int_id, 'P3.2', 'Completeness, accuracy, timeliness, and authorization of system processing', 'The entity implements policies and procedures to store inputs, items in processing, and outputs completely, accurately, and timely in accordance with system specifications to meet the entity''s objectives.', 'high', 'preventive', 'high', true),
    (fw_id, proc_int_id, 'P4.1', 'Completeness, accuracy, timeliness, and authorization of system outputs', 'The entity corrects detected data processing errors on a timely basis to meet the entity''s objectives. Corrections are reviewed for authorization prior to processing.', 'high', 'corrective', 'medium', true),
    (fw_id, proc_int_id, 'P4.2', 'Completeness, accuracy, timeliness, and authorization of data stores', 'The entity processes data or communicates data to meet the entity''s objectives.', 'high', 'preventive', 'high', true),
    (fw_id, proc_int_id, 'P5.1', 'Error detection and correction procedures', 'The entity creates and maintains records of system processing activities to meet the entity''s objectives.', 'medium', 'detective', 'high', false);
    
    -- ADDITIONAL CRITERIA: Confidentiality (C1)
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, conf_id, 'C1.1', 'Confidential information is protected in storage', 'The entity identifies and maintains confidential information to meet the entity''s objectives related to confidentiality.', 'critical', 'preventive', 'high'),
    (fw_id, conf_id, 'C1.2', 'Confidential information is protected in transmission', 'The entity disposes of confidential information to meet the entity''s objectives related to confidentiality.', 'high', 'preventive', 'medium');
    
    -- ADDITIONAL CRITERIA: Privacy (P1-P8)
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, priv_id, 'P1.1', 'Notice and communication of objectives related to privacy', 'The entity provides notice to data subjects about its privacy practices to meet the entity''s objectives related to privacy.', 'critical', 'directive', 'low'),
    (fw_id, priv_id, 'P2.1', 'Choice and consent', 'The entity communicates choices available regarding the collection, use, retention, disclosure, and disposal of personal information to the data subjects and the consequences, if any, of each choice.', 'critical', 'directive', 'low'),
    (fw_id, priv_id, 'P3.1', 'Collection', 'The entity collects personal information only for the purposes identified in the notice.', 'critical', 'preventive', 'medium'),
    (fw_id, priv_id, 'P3.2', 'Personal information is collected with consent', 'The entity collects personal information from data subjects only for the purposes identified in the notice and only with implicit or explicit consent.', 'critical', 'preventive', 'medium'),
    (fw_id, priv_id, 'P4.1', 'Use, retention, and disposal', 'The entity limits the use of personal information to the purposes identified in the notice and for which the data subject has provided implicit or explicit consent.', 'critical', 'preventive', 'high'),
    (fw_id, priv_id, 'P4.2', 'Retention of personal information', 'The entity retains personal information for the time necessary to fulfill the stated purposes identified in the notice or as required by laws or regulations.', 'high', 'preventive', 'high'),
    (fw_id, priv_id, 'P4.3', 'Disposal of personal information', 'The entity securely disposes of personal information to meet the entity''s objectives related to privacy.', 'high', 'preventive', 'medium'),
    (fw_id, priv_id, 'P5.1', 'Access', 'The entity grants identified and authenticated data subjects the ability to access their stored personal information for review and, upon request, provides physical or electronic copies of that information to data subjects to meet the entity''s objectives related to privacy.', 'high', 'preventive', 'medium'),
    (fw_id, priv_id, 'P5.2', 'Data subjects may update personal information', 'The entity corrects, amends, or appends personal information based on information provided by data subjects and communicates such information to third parties, as committed or required, to meet the entity''s objectives related to privacy.', 'high', 'corrective', 'medium'),
    (fw_id, priv_id, 'P6.1', 'Disclosure to third parties', 'The entity discloses personal information to third parties with the explicit consent of data subjects, and such consent is obtained prior to disclosure to meet the entity''s objectives related to privacy.', 'critical', 'preventive', 'medium'),
    (fw_id, priv_id, 'P6.2', 'Third-party agreements', 'The entity creates and retains a complete, accurate, and timely record of authorized disclosures of personal information to meet the entity''s objectives related to privacy.', 'high', 'directive', 'medium'),
    (fw_id, priv_id, 'P7.1', 'Quality', 'The entity collects and maintains accurate, up-to-date, complete, and relevant personal information to meet the entity''s objectives related to privacy.', 'high', 'preventive', 'medium'),
    (fw_id, priv_id, 'P8.1', 'Monitoring and enforcement', 'The entity implements a process for receiving, addressing, resolving, and communicating the resolution of inquiries, complaints, and disputes from data subjects and others and periodically monitors compliance to meet the entity''s objectives related to privacy.', 'high', 'detective', 'low');
    
END $$;
