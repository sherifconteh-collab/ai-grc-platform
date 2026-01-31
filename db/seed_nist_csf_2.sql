-- NIST Cybersecurity Framework 2.0 - Complete Control Set
-- Source: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf

-- Framework
INSERT INTO frameworks (code, name, version, description, category, issuing_body, published_date, url) VALUES
('nist_csf_2', 'NIST Cybersecurity Framework', '2.0', 'A voluntary framework consisting of standards, guidelines, and best practices to manage cybersecurity risk. CSF 2.0 adds Govern function and expands to all critical infrastructure sectors.', 'cybersecurity', 'NIST', '2024-02-26', 'https://www.nist.gov/cyberframework');

-- Get framework ID for references
DO $$
DECLARE
    fw_id UUID;
    gov_id UUID;
    id_id UUID;
    pr_id UUID;
    de_id UUID;
    rs_id UUID;
    rc_id UUID;
    
    -- Categories
    cat_gov_oc_id UUID;
    cat_gov_rm_id UUID;
    cat_gov_sc_id UUID;
    cat_gov_oa_id UUID;
    
    cat_id_am_id UUID;
    cat_id_ra_id UUID;
    cat_id_im_id UUID;
    
    cat_pr_ac_id UUID;
    cat_pr_at_id UUID;
    cat_pr_ds_id UUID;
    cat_pr_ir_id UUID;
    cat_pr_ma_id UUID;
    cat_pr_ps_id UUID;
    cat_pr_pt_id UUID;
    
    cat_de_ae_id UUID;
    cat_de_cm_id UUID;
    cat_de_dp_id UUID;
    
    cat_rs_an_id UUID;
    cat_rs_co_id UUID;
    cat_rs_ma_id UUID;
    cat_rs_mi_id UUID;
    
    cat_rc_co_id UUID;
    cat_rc_rp_id UUID;
    cat_rc_im_id UUID;
    
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'nist_csf_2';
    
    -- Functions
    INSERT INTO framework_functions (framework_id, code, name, description, sequence_order) VALUES
    (fw_id, 'GV', 'Govern', 'The organization''s cybersecurity risk management strategy, expectations, and policy are established, communicated, and monitored.', 1),
    (fw_id, 'ID', 'Identify', 'The organization''s current cybersecurity risks are understood.', 2),
    (fw_id, 'PR', 'Protect', 'Safeguards to manage the organization''s cybersecurity risks are used.', 3),
    (fw_id, 'DE', 'Detect', 'Possible cybersecurity attacks and compromises are found and analyzed.', 4),
    (fw_id, 'RS', 'Respond', 'Actions regarding a detected cybersecurity incident are taken.', 5),
    (fw_id, 'RC', 'Recover', 'Assets and operations affected by a cybersecurity incident are restored.', 6)
    RETURNING id INTO gov_id;
    
    SELECT id INTO gov_id FROM framework_functions WHERE framework_id = fw_id AND code = 'GV';
    SELECT id INTO id_id FROM framework_functions WHERE framework_id = fw_id AND code = 'ID';
    SELECT id INTO pr_id FROM framework_functions WHERE framework_id = fw_id AND code = 'PR';
    SELECT id INTO de_id FROM framework_functions WHERE framework_id = fw_id AND code = 'DE';
    SELECT id INTO rs_id FROM framework_functions WHERE framework_id = fw_id AND code = 'RS';
    SELECT id INTO rc_id FROM framework_functions WHERE framework_id = fw_id AND code = 'RC';
    
    -- GOVERN Categories
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, sequence_order) VALUES
    (fw_id, gov_id, 'GV.OC', 'Organizational Context', 'Understanding the organization''s circumstances informs cybersecurity risk management decisions.', 1),
    (fw_id, gov_id, 'GV.RM', 'Risk Management Strategy', 'The organization''s priorities, constraints, risk tolerance and appetite statements, and assumptions are established, communicated, and used to support operational risk decisions.', 2),
    (fw_id, gov_id, 'GV.RR', 'Roles, Responsibilities, and Authorities', 'Cybersecurity roles, responsibilities, and authorities are established and communicated.', 3),
    (fw_id, gov_id, 'GV.PO', 'Policy', 'Organizational cybersecurity policy is established, communicated, and enforced.', 4),
    (fw_id, gov_id, 'GV.OV', 'Oversight', 'Results of organization-wide cybersecurity risk management activities are used to inform, improve, and adjust the risk management strategy.', 5),
    (fw_id, gov_id, 'GV.SC', 'Cybersecurity Supply Chain Risk Management', 'Cyber supply chain risk management processes are identified, established, managed, monitored, and improved.', 6);
    
    SELECT id INTO cat_gov_oc_id FROM framework_categories WHERE framework_id = fw_id AND code = 'GV.OC';
    SELECT id INTO cat_gov_rm_id FROM framework_categories WHERE framework_id = fw_id AND code = 'GV.RM';
    SELECT id INTO cat_gov_sc_id FROM framework_categories WHERE framework_id = fw_id AND code = 'GV.SC';
    
    -- IDENTIFY Categories
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, sequence_order) VALUES
    (fw_id, id_id, 'ID.AM', 'Asset Management', 'Assets are managed consistent with their importance to organizational objectives and the organization''s risk strategy.', 1),
    (fw_id, id_id, 'ID.RA', 'Risk Assessment', 'The cybersecurity risk to the organization is understood.', 2),
    (fw_id, id_id, 'ID.IM', 'Improvement', 'Improvements to organizational cybersecurity risk management processes are identified.', 3);
    
    SELECT id INTO cat_id_am_id FROM framework_categories WHERE framework_id = fw_id AND code = 'ID.AM';
    SELECT id INTO cat_id_ra_id FROM framework_categories WHERE framework_id = fw_id AND code = 'ID.RA';
    SELECT id INTO cat_id_im_id FROM framework_categories WHERE framework_id = fw_id AND code = 'ID.IM';
    
    -- PROTECT Categories
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, sequence_order) VALUES
    (fw_id, pr_id, 'PR.AA', 'Identity Management, Authentication, and Access Control', 'Access to physical and logical assets is limited to authorized users, services, and hardware.', 1),
    (fw_id, pr_id, 'PR.AT', 'Awareness and Training', 'The organization''s personnel are provided with cybersecurity awareness and training.', 2),
    (fw_id, pr_id, 'PR.DS', 'Data Security', 'Data are managed consistent with the organization''s risk strategy.', 3),
    (fw_id, pr_id, 'PR.IR', 'Platform Security', 'The hardware, software, and services of physical and virtual platforms are managed consistent with the organization''s risk strategy.', 4),
    (fw_id, pr_id, 'PR.PS', 'Technology Infrastructure Resilience', 'Security architectures are managed with the organization''s risk strategy to protect asset confidentiality, integrity, and availability.', 5);
    
    SELECT id INTO cat_pr_ac_id FROM framework_categories WHERE framework_id = fw_id AND code = 'PR.AA';
    SELECT id INTO cat_pr_at_id FROM framework_categories WHERE framework_id = fw_id AND code = 'PR.AT';
    SELECT id INTO cat_pr_ds_id FROM framework_categories WHERE framework_id = fw_id AND code = 'PR.DS';
    SELECT id INTO cat_pr_ir_id FROM framework_categories WHERE framework_id = fw_id AND code = 'PR.IR';
    SELECT id INTO cat_pr_ps_id FROM framework_categories WHERE framework_id = fw_id AND code = 'PR.PS';
    
    -- DETECT Categories
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, sequence_order) VALUES
    (fw_id, de_id, 'DE.CM', 'Continuous Monitoring', 'Assets are monitored to find anomalies, indicators of compromise, and other potentially adverse events.', 1),
    (fw_id, de_id, 'DE.AE', 'Adverse Event Analysis', 'Anomalies, indicators of compromise, and other potentially adverse events are analyzed to characterize them.', 2);
    
    SELECT id INTO cat_de_cm_id FROM framework_categories WHERE framework_id = fw_id AND code = 'DE.CM';
    SELECT id INTO cat_de_ae_id FROM framework_categories WHERE framework_id = fw_id AND code = 'DE.AE';
    
    -- RESPOND Categories
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, sequence_order) VALUES
    (fw_id, rs_id, 'RS.MA', 'Incident Management', 'Responses to detected cybersecurity incidents are managed.', 1),
    (fw_id, rs_id, 'RS.AN', 'Incident Analysis', 'Investigations are conducted to ensure effective response and support forensics and recovery activities.', 2),
    (fw_id, rs_id, 'RS.CO', 'Incident Response Reporting and Communication', 'Response activities are coordinated with internal and external stakeholders.', 3),
    (fw_id, rs_id, 'RS.MI', 'Incident Mitigation', 'Activities are performed to prevent expansion of an event and mitigate its effects.', 4);
    
    SELECT id INTO cat_rs_ma_id FROM framework_categories WHERE framework_id = fw_id AND code = 'RS.MA';
    SELECT id INTO cat_rs_an_id FROM framework_categories WHERE framework_id = fw_id AND code = 'RS.AN';
    SELECT id INTO cat_rs_co_id FROM framework_categories WHERE framework_id = fw_id AND code = 'RS.CO';
    SELECT id INTO cat_rs_mi_id FROM framework_categories WHERE framework_id = fw_id AND code = 'RS.MI';
    
    -- RECOVER Categories
    INSERT INTO framework_categories (framework_id, function_id, code, name, description, sequence_order) VALUES
    (fw_id, rc_id, 'RC.RP', 'Incident Recovery Plan Execution', 'Restoration activities are performed to ensure operational availability of systems and services affected by cybersecurity incidents.', 1),
    (fw_id, rc_id, 'RC.CO', 'Incident Recovery Communication', 'Restoration activities are coordinated with internal and external parties.', 2);
    
    SELECT id INTO cat_rc_rp_id FROM framework_categories WHERE framework_id = fw_id AND code = 'RC.RP';
    SELECT id INTO cat_rc_co_id FROM framework_categories WHERE framework_id = fw_id AND code = 'RC.CO';
    
    -- GOVERN Controls
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type) VALUES
    (fw_id, gov_id, cat_gov_oc_id, 'GV.OC-01', 'Organizational mission is understood and informs cybersecurity risk management', 'The organizational mission, objectives, and requirements are understood and communicated. The strategic cybersecurity risk management context is established, documented, and updated as needed.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_oc_id, 'GV.OC-02', 'Internal and external stakeholders are understood', 'Internal and external stakeholders, their interests and authority, and the inter-relationships among them are identified and documented.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_oc_id, 'GV.OC-03', 'Legal, regulatory, and contractual requirements are understood', 'Legal, regulatory, and contractual requirements regarding cybersecurity capabilities and limitations are understood and documented.', 'critical', 'directive'),
    (fw_id, gov_id, cat_gov_oc_id, 'GV.OC-04', 'Critical objectives and resources are understood', 'Critical services, critical objectives, dependencies, and functions for delivery of critical services are understood.', 'critical', 'directive'),
    (fw_id, gov_id, cat_gov_oc_id, 'GV.OC-05', 'Outcomes and resources drive priorities', 'Outcomes, capabilities, and services that the organization depends on are prioritized based on their criticality.', 'high', 'directive'),
    
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-01', 'Risk management objectives are established', 'Risk management objectives are established and agreed to by organizational stakeholders.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-02', 'Risk appetite and risk tolerance are established', 'Risk appetite and risk tolerance statements are established, communicated, and maintained.', 'critical', 'directive'),
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-03', 'Cybersecurity risk management activities are integrated into the broader enterprise risk management program', 'The organization''s cybersecurity risk management activities are integrated into broader enterprise risk management processes, and results are reported to senior leadership.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-04', 'Strategic direction that describes appropriate risk response options is established', 'Strategic direction is established for appropriate cybersecurity risk response (e.g., accept, avoid, transfer, or mitigate).', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-05', 'Prioritized risk response criteria are established and communicated', 'Priorities for addressing cybersecurity risk are established, communicated, and resourced.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-06', 'Risk management methods are established and applied', 'Methods are applied to identify, analyze, and monitor risk and inform risk management decisions.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_rm_id, 'GV.RM-07', 'Strategic opportunities and potential adverse impacts are identified and assessed', 'Strategic opportunities and potential adverse impacts related to emerging technologies, evolving threats, and external dependencies are identified, assessed, and integrated into strategic planning processes.', 'medium', 'directive');
    
    -- More GOVERN controls continue...
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type) VALUES
    (fw_id, gov_id, cat_gov_sc_id, 'GV.SC-01', 'Cybersecurity supply chain risk management processes are identified, established, and managed', 'A SCRM program is established, communicated to all organizational stakeholders, and regularly reviewed and updated.', 'high', 'directive'),
    (fw_id, gov_id, cat_gov_sc_id, 'GV.SC-02', 'Suppliers are known and prioritized by criticality', 'A method for identifying, assessing, and prioritizing suppliers is established and maintained.', 'high', 'preventive'),
    (fw_id, gov_id, cat_gov_sc_id, 'GV.SC-03', 'Contracts with suppliers are used to implement appropriate measures to meet the objectives of the organization''s cybersecurity program', 'Contracts include necessary provisions to implement security requirements and capabilities commensurate with the identified risks and risk tolerance.', 'critical', 'preventive'),
    (fw_id, gov_id, cat_gov_sc_id, 'GV.SC-04', 'Suppliers are routinely assessed using audits, test results, or other forms of evaluation', 'Assessment processes are established to verify that suppliers meet their contractual obligations and adhere to relevant standards.', 'high', 'detective'),
    (fw_id, gov_id, cat_gov_sc_id, 'GV.SC-05', 'Response and recovery planning includes suppliers', 'The supply chain is included in incident response, business continuity, and disaster recovery planning, testing, and improvement activities.', 'high', 'preventive');
    
    -- IDENTIFY Controls
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, id_id, cat_id_am_id, 'ID.AM-01', 'Inventories of hardware managed by the organization are maintained', 'Physical devices and systems are inventoried and kept current.', 'critical', 'preventive', 'high'),
    (fw_id, id_id, cat_id_am_id, 'ID.AM-02', 'Inventories of software, services, and systems managed by the organization are maintained', 'Software platform, application, and services inventories are documented and kept current.', 'critical', 'preventive', 'high'),
    (fw_id, id_id, cat_id_am_id, 'ID.AM-03', 'Representations of the organization''s authorized network communication and internal and external network data flows are maintained', 'Network diagrams and data flow diagrams are documented and maintained.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_am_id, 'ID.AM-04', 'Inventories of services provided by suppliers are maintained', 'Supplier services, including outsourced services, are inventoried and prioritized.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_am_id, 'ID.AM-05', 'Assets are prioritized based on classification, criticality, resources, and impact on the mission', 'Asset inventory includes criticality and business value assignments to support risk-based decision making.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_am_id, 'ID.AM-07', 'Inventories of data and corresponding metadata for designated data types are maintained', 'Data inventories catalog data types, sensitivity, locations, and relevant metadata.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_am_id, 'ID.AM-08', 'Systems, hardware, software, services, and data are managed throughout their life cycles', 'Life cycle management processes are established for all organizational assets.', 'high', 'preventive', 'medium');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-01', 'Vulnerabilities in assets are identified, validated, and recorded', 'Vulnerability identification, analysis, and remediation processes are in place.', 'critical', 'detective', 'high'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-02', 'Cyber threat intelligence is received from information sharing forums and sources', 'Threat intelligence sources are identified, accessed, and integrated into risk analysis.', 'high', 'detective', 'high'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-03', 'Internal and external threats to the organization are identified and recorded', 'Threat identification considers threat actors, their capabilities, and intentions.', 'high', 'detective', 'medium'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-04', 'Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded', 'Risk assessments consider vulnerabilities, threat scenarios, and potential business impacts.', 'critical', 'detective', 'medium'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-05', 'Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk and inform risk response decisions', 'Risk assessment results drive risk treatment and acceptance decisions.', 'critical', 'preventive', 'low'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-06', 'Risk responses are chosen, prioritized, planned, tracked, and communicated', 'Risk treatment plans document chosen responses and implementation progress.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-07', 'Changes and exceptions are managed, assessed for risk impact, recorded, and tracked', 'Change management and exception processes include risk assessment activities.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-08', 'Processes for receiving, analyzing, and responding to vulnerability disclosures are established', 'Coordinated vulnerability disclosure programs enable responsible vulnerability reporting.', 'medium', 'detective', 'medium'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-09', 'The authenticity and integrity of hardware and software are assessed prior to acquisition and use', 'Software and hardware provenance verification reduces supply chain risks.', 'high', 'preventive', 'medium'),
    (fw_id, id_id, cat_id_ra_id, 'ID.RA-10', 'Cybersecurity supply chain risk assessments are performed for suppliers', 'Third-party risk assessments evaluate supplier security posture and risks.', 'high', 'detective', 'low');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, id_id, cat_id_im_id, 'ID.IM-01', 'Improvements are identified from evaluations', 'Evaluation results inform continuous improvement of security practices.', 'medium', 'corrective', 'low'),
    (fw_id, id_id, cat_id_im_id, 'ID.IM-02', 'Improvements are identified from security tests and exercises', 'Security testing and exercises identify improvement opportunities.', 'medium', 'corrective', 'low'),
    (fw_id, id_id, cat_id_im_id, 'ID.IM-03', 'Improvements are identified from execution of operational processes, procedures, and activities', 'Operational metrics and feedback drive process improvements.', 'medium', 'corrective', 'medium'),
    (fw_id, id_id, cat_id_im_id, 'ID.IM-04', 'Incident response plans and other cybersecurity plans that affect operations are established, communicated, maintained, and improved', 'Plans are regularly reviewed, tested, and updated based on lessons learned.', 'high', 'corrective', 'low');
    
    -- PROTECT Controls (sample - full implementation would include all)
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, pr_id, cat_pr_ac_id, 'PR.AA-01', 'Identities and credentials for authorized users, services, and hardware are managed by the organization', 'Identity management systems provision, modify, and revoke identities and credentials.', 'critical', 'preventive', 'high'),
    (fw_id, pr_id, cat_pr_ac_id, 'PR.AA-02', 'Identities are proofed and bound to credentials based on the context of interactions', 'Identity verification rigor matches risk level of system and data access.', 'high', 'preventive', 'medium'),
    (fw_id, pr_id, cat_pr_ac_id, 'PR.AA-03', 'Users, services, and hardware are authenticated', 'Authentication mechanisms verify identity before granting access.', 'critical', 'preventive', 'high'),
    (fw_id, pr_id, cat_pr_ac_id, 'PR.AA-04', 'Identity assertions are protected, conveyed, and verified', 'Authentication tokens and assertions are cryptographically protected.', 'high', 'preventive', 'high'),
    (fw_id, pr_id, cat_pr_ac_id, 'PR.AA-05', 'Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed', 'Access control policies implement least privilege and separation of duties.', 'critical', 'preventive', 'high'),
    (fw_id, pr_id, cat_pr_ac_id, 'PR.AA-06', 'Physical access to assets is managed, monitored, and enforced commensurate with risk', 'Physical security controls protect facilities and equipment.', 'high', 'preventive', 'medium');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential, ai_relevance) VALUES
    (fw_id, pr_id, cat_pr_at_id, 'PR.AT-01', 'Personnel are provided with cybersecurity awareness and training', 'Security awareness training is provided to all users regularly.', 'high', 'preventive', 'medium', false),
    (fw_id, pr_id, cat_pr_at_id, 'PR.AT-02', 'Individuals in specialized roles are provided with role-based training', 'Role-specific security training addresses job-related risks and responsibilities.', 'high', 'preventive', 'medium', false);
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, pr_id, cat_pr_ds_id, 'PR.DS-01', 'The confidentiality, integrity, and availability of data-at-rest are protected', 'Encryption, access controls, and redundancy protect stored data.', 'critical', 'preventive', 'high'),
    (fw_id, pr_id, cat_pr_ds_id, 'PR.DS-02', 'The confidentiality, integrity, and availability of data-in-transit are protected', 'Encryption and integrity verification protect data during transmission.', 'critical', 'preventive', 'high'),
    (fw_id, pr_id, cat_pr_ds_id, 'PR.DS-10', 'The confidentiality, integrity, and availability of data-in-use are protected', 'Memory protection, secure enclaves, and other controls protect active data.', 'high', 'preventive', 'medium'),
    (fw_id, pr_id, cat_pr_ds_id, 'PR.DS-11', 'Backups of data are created, protected, maintained, and tested', 'Regular backups with recovery testing ensure data availability.', 'critical', 'preventive', 'high');
    
    -- DETECT Controls (sample)
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, de_id, cat_de_cm_id, 'DE.CM-01', 'Networks and network services are monitored to find potentially adverse events', 'Network monitoring detects anomalies and malicious activity.', 'critical', 'detective', 'high'),
    (fw_id, de_id, cat_de_cm_id, 'DE.CM-02', 'The physical environment is monitored to find potentially adverse events', 'Physical security monitoring detects unauthorized access attempts.', 'high', 'detective', 'high'),
    (fw_id, de_id, cat_de_cm_id, 'DE.CM-03', 'Personnel activity and technology usage are monitored to find potentially adverse events', 'User activity monitoring identifies suspicious behavior patterns.', 'high', 'detective', 'high'),
    (fw_id, de_id, cat_de_cm_id, 'DE.CM-06', 'External service provider activities and services are monitored to find potentially adverse events', 'Third-party access and activities are logged and monitored.', 'high', 'detective', 'medium'),
    (fw_id, de_id, cat_de_cm_id, 'DE.CM-09', 'Computing hardware and software, runtime environments, and their data are monitored to find potentially adverse events', 'System and application monitoring detects security events.', 'critical', 'detective', 'high');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, de_id, cat_de_ae_id, 'DE.AE-02', 'Potentially adverse events are analyzed to better understand associated activities', 'Security event correlation and analysis identifies incident patterns.', 'high', 'detective', 'high'),
    (fw_id, de_id, cat_de_ae_id, 'DE.AE-03', 'Information is correlated from multiple sources', 'SIEM or similar tools aggregate and correlate security data.', 'high', 'detective', 'high'),
    (fw_id, de_id, cat_de_ae_id, 'DE.AE-04', 'The estimated impact and scope of adverse events are understood', 'Impact assessments guide incident response prioritization.', 'high', 'detective', 'medium'),
    (fw_id, de_id, cat_de_ae_id, 'DE.AE-06', 'Information on adverse events is provided to authorized staff and tools', 'Security alerts are routed to appropriate responders and systems.', 'high', 'detective', 'high'),
    (fw_id, de_id, cat_de_ae_id, 'DE.AE-07', 'Cyber threat intelligence and other contextual information are integrated into the analysis', 'Threat intelligence enriches security event analysis.', 'medium', 'detective', 'high'),
    (fw_id, de_id, cat_de_ae_id, 'DE.AE-08', 'Incidents are declared when adverse events meet the defined incident criteria', 'Incident classification criteria trigger response processes.', 'critical', 'detective', 'medium');
    
    -- RESPOND Controls (sample)
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, rs_id, cat_rs_ma_id, 'RS.MA-01', 'The incident response plan is executed in coordination with relevant third parties once an incident is declared', 'Incident response procedures are followed consistently.', 'critical', 'corrective', 'low'),
    (fw_id, rs_id, cat_rs_ma_id, 'RS.MA-02', 'Incident reports are triaged and validated', 'Incident validation determines legitimacy and severity.', 'high', 'corrective', 'medium'),
    (fw_id, rs_id, cat_rs_ma_id, 'RS.MA-03', 'Incidents are categorized and prioritized', 'Incident classification drives response priority and resource allocation.', 'high', 'corrective', 'medium'),
    (fw_id, rs_id, cat_rs_ma_id, 'RS.MA-04', 'Incidents are escalated or elevated as needed', 'Escalation procedures engage appropriate stakeholders.', 'high', 'corrective', 'medium'),
    (fw_id, rs_id, cat_rs_ma_id, 'RS.MA-05', 'The criteria for initiating incident recovery are applied', 'Recovery transition occurs when containment is achieved.', 'high', 'corrective', 'low');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, rs_id, cat_rs_an_id, 'RS.AN-03', 'Analysis is performed to establish what has taken place during an incident and the root cause of the incident', 'Root cause analysis identifies attack vectors and contributing factors.', 'high', 'detective', 'medium'),
    (fw_id, rs_id, cat_rs_an_id, 'RS.AN-06', 'Actions performed during an investigation are recorded, and the records'' integrity is preserved', 'Forensic evidence handling maintains chain of custody.', 'high', 'detective', 'medium'),
    (fw_id, rs_id, cat_rs_an_id, 'RS.AN-07', 'Incident data and metadata are collected, and their integrity is preserved', 'Evidence collection preserves data for analysis and legal proceedings.', 'high', 'detective', 'medium'),
    (fw_id, rs_id, cat_rs_an_id, 'RS.AN-08', 'An incident''s magnitude is estimated and validated', 'Impact assessment quantifies incident scope and severity.', 'high', 'detective', 'medium');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, rs_id, cat_rs_co_id, 'RS.CO-02', 'Internal and external stakeholders are notified of incidents', 'Notification procedures ensure appropriate stakeholder communication.', 'critical', 'corrective', 'medium'),
    (fw_id, rs_id, cat_rs_co_id, 'RS.CO-03', 'Information is shared with designated internal and external stakeholders', 'Information sharing supports coordinated response and threat awareness.', 'high', 'corrective', 'medium');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, rs_id, cat_rs_mi_id, 'RS.MI-01', 'Incidents are contained', 'Containment actions prevent incident spread and limit damage.', 'critical', 'corrective', 'medium'),
    (fw_id, rs_id, cat_rs_mi_id, 'RS.MI-02', 'Incidents are eradicated', 'Threat removal ensures complete incident resolution.', 'critical', 'corrective', 'medium');
    
    -- RECOVER Controls (sample)
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, rc_id, cat_rc_rp_id, 'RC.RP-01', 'The recovery portion of the incident response plan is executed once initiated from the incident response process', 'Recovery procedures restore normal operations.', 'critical', 'corrective', 'low'),
    (fw_id, rc_id, cat_rc_rp_id, 'RC.RP-02', 'Recovery actions are selected, scoped, prioritized, and performed', 'Recovery prioritization considers business criticality.', 'critical', 'corrective', 'medium'),
    (fw_id, rc_id, cat_rc_rp_id, 'RC.RP-03', 'The integrity of backups and other restoration assets is verified before using them for restoration', 'Backup verification prevents restoring compromised systems.', 'critical', 'preventive', 'medium'),
    (fw_id, rc_id, cat_rc_rp_id, 'RC.RP-04', 'Critical mission functions and cybersecurity risk management are considered to establish post-incident operational norms', 'Lessons learned inform post-incident improvements.', 'high', 'corrective', 'low'),
    (fw_id, rc_id, cat_rc_rp_id, 'RC.RP-05', 'The integrity of restored assets is verified, systems and services are restored, and normal operating status is confirmed', 'System validation ensures complete recovery.', 'critical', 'detective', 'medium');
    
    INSERT INTO controls (framework_id, function_id, category_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (fw_id, rc_id, cat_rc_co_id, 'RC.CO-03', 'Recovery activities and progress in restoring operational capabilities are communicated to designated internal and external stakeholders', 'Recovery status updates keep stakeholders informed.', 'high', 'corrective', 'medium'),
    (fw_id, rc_id, cat_rc_co_id, 'RC.CO-04', 'Public updates of incident recovery are shared using approved methods and messaging', 'Public communications manage reputation and transparency.', 'medium', 'corrective', 'low');
    
END $$;
