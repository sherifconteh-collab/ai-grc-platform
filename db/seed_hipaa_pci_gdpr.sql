-- Additional Major Compliance Frameworks: HIPAA, PCI DSS, GDPR

-- ========== HIPAA SECURITY RULE ==========
INSERT INTO frameworks (code, name, version, description, category, issuing_body, published_date, mandatory, url) VALUES
('hipaa', 'HIPAA Security Rule', '2003', 'Health Insurance Portability and Accountability Act Security Rule. Establishes national standards to protect electronic protected health information (ePHI). Mandatory for covered entities and business associates handling health information.', 'compliance', 'HHS', '2003-02-20', true, 'https://www.hhs.gov/hipaa/for-professionals/security/index.html');

DO $$
DECLARE
    hipaa_fw_id UUID;
    admin_id UUID;
    physical_id UUID;
    technical_id UUID;
BEGIN
    SELECT id INTO hipaa_fw_id FROM frameworks WHERE code = 'hipaa';
    
    -- HIPAA Safeguards
    INSERT INTO framework_functions (framework_id, code, name, description, sequence_order) VALUES
    (hipaa_fw_id, 'ADMIN', 'Administrative Safeguards', 'Administrative actions, policies, and procedures to manage the selection, development, implementation, and maintenance of security measures to protect ePHI.', 1),
    (hipaa_fw_id, 'PHYSICAL', 'Physical Safeguards', 'Physical measures, policies, and procedures to protect electronic information systems and related buildings and equipment from natural and environmental hazards and unauthorized intrusion.', 2),
    (hipaa_fw_id, 'TECHNICAL', 'Technical Safeguards', 'Technology and the policy and procedures for its use that protect ePHI and control access to it.', 3);
    
    SELECT id INTO admin_id FROM framework_functions WHERE framework_id = hipaa_fw_id AND code = 'ADMIN';
    SELECT id INTO physical_id FROM framework_functions WHERE framework_id = hipaa_fw_id AND code = 'PHYSICAL';
    SELECT id INTO technical_id FROM framework_functions WHERE framework_id = hipaa_fw_id AND code = 'TECHNICAL';
    
    -- Administrative Safeguards
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (hipaa_fw_id, admin_id, '164.308(a)(1)(i)', 'Security Management Process (Required)', 'Implement policies and procedures to prevent, detect, contain, and correct security violations.', 'critical', 'directive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(1)(ii)(A)', 'Risk Analysis (Required)', 'Conduct an accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of ePHI.', 'critical', 'detective', 'low'),
    (hipaa_fw_id, admin_id, '164.308(a)(1)(ii)(B)', 'Risk Management (Required)', 'Implement security measures sufficient to reduce risks and vulnerabilities to a reasonable and appropriate level.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(1)(ii)(C)', 'Sanction Policy (Required)', 'Apply appropriate sanctions against workforce members who fail to comply with security policies and procedures.', 'high', 'corrective', 'low'),
    (hipaa_fw_id, admin_id, '164.308(a)(1)(ii)(D)', 'Information System Activity Review (Required)', 'Implement procedures to regularly review records of information system activity.', 'high', 'detective', 'high'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(2)', 'Assigned Security Responsibility (Required)', 'Identify the security official who is responsible for the development and implementation of security policies and procedures.', 'critical', 'directive', 'low'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(3)(i)', 'Workforce Security (Required)', 'Implement policies and procedures to ensure all workforce members have appropriate access to ePHI and prevent unauthorized access.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(3)(ii)(A)', 'Authorization and/or Supervision (Addressable)', 'Implement procedures for authorization and/or supervision of workforce members who work with ePHI or in locations where it might be accessed.', 'high', 'preventive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(3)(ii)(B)', 'Workforce Clearance Procedure (Addressable)', 'Implement procedures to determine that workforce access to ePHI is appropriate.', 'high', 'preventive', 'low'),
    (hipaa_fw_id, admin_id, '164.308(a)(3)(ii)(C)', 'Termination Procedures (Addressable)', 'Implement procedures for terminating access to ePHI when employment ends or as required by workforce access determinations.', 'critical', 'preventive', 'high'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(4)(i)', 'Information Access Management (Required)', 'Implement policies and procedures for authorizing access to ePHI consistent with HIPAA Privacy Rule requirements.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, admin_id, '164.308(a)(4)(ii)(A)', 'Isolating Healthcare Clearinghouse Functions (Required for clearinghouses)', 'If a health care clearinghouse is part of a larger organization, implement policies and procedures that protect ePHI from unauthorized access.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(4)(ii)(B)', 'Access Authorization (Addressable)', 'Implement policies and procedures for granting access to ePHI through access to workstations, transactions, programs, processes, or other mechanisms.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, admin_id, '164.308(a)(4)(ii)(C)', 'Access Establishment and Modification (Addressable)', 'Implement policies and procedures that establish, document, review, and modify user access rights to workstations, transactions, programs, and processes.', 'critical', 'preventive', 'high'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(5)(i)', 'Security Awareness and Training (Required)', 'Implement security awareness and training program for all workforce members.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(5)(ii)(A)', 'Security Reminders (Addressable)', 'Periodic security updates.', 'high', 'preventive', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(5)(ii)(B)', 'Protection from Malicious Software (Addressable)', 'Procedures for guarding against, detecting, and reporting malicious software.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, admin_id, '164.308(a)(5)(ii)(C)', 'Log-in Monitoring (Addressable)', 'Procedures for monitoring log-in attempts and reporting discrepancies.', 'high', 'detective', 'high'),
    (hipaa_fw_id, admin_id, '164.308(a)(5)(ii)(D)', 'Password Management (Addressable)', 'Procedures for creating, changing, and safeguarding passwords.', 'critical', 'preventive', 'high'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(6)(i)', 'Security Incident Procedures (Required)', 'Implement policies and procedures to address security incidents.', 'critical', 'corrective', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(6)(ii)', 'Response and Reporting (Required)', 'Identify and respond to suspected or known security incidents; mitigate, to the extent practicable, harmful effects; document incidents and outcomes.', 'critical', 'corrective', 'medium'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(7)(i)', 'Contingency Plan (Required)', 'Establish and implement policies and procedures for responding to emergencies or other occurrences that damage systems containing ePHI.', 'critical', 'preventive', 'low'),
    (hipaa_fw_id, admin_id, '164.308(a)(7)(ii)(A)', 'Data Backup Plan (Required)', 'Establish and implement procedures to create and maintain retrievable exact copies of ePHI.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, admin_id, '164.308(a)(7)(ii)(B)', 'Disaster Recovery Plan (Required)', 'Establish and implement procedures to restore any loss of data.', 'critical', 'corrective', 'medium'),
    (hipaa_fw_id, admin_id, '164.308(a)(7)(ii)(C)', 'Emergency Mode Operation Plan (Required)', 'Establish and implement procedures to enable continuation of critical business processes for protection of ePHI while operating in emergency mode.', 'critical', 'preventive', 'low'),
    (hipaa_fw_id, admin_id, '164.308(a)(7)(ii)(D)', 'Testing and Revision Procedures (Addressable)', 'Implement procedures for periodic testing and revision of contingency plans.', 'high', 'detective', 'low'),
    (hipaa_fw_id, admin_id, '164.308(a)(7)(ii)(E)', 'Applications and Data Criticality Analysis (Addressable)', 'Assess the relative criticality of specific applications and data in support of other contingency plan components.', 'high', 'detective', 'low'),
    
    (hipaa_fw_id, admin_id, '164.308(a)(8)', 'Evaluation (Required)', 'Perform a periodic technical and nontechnical evaluation in response to environmental or operational changes affecting security of ePHI.', 'critical', 'detective', 'low'),
    
    (hipaa_fw_id, admin_id, '164.308(b)(1)', 'Business Associate Contracts and Other Arrangements (Required)', 'A covered entity may permit a business associate to create, receive, maintain, or transmit ePHI on its behalf only if written assurances exist.', 'critical', 'preventive', 'low'),
    (hipaa_fw_id, admin_id, '164.308(b)(3)', 'Written Contract or Other Arrangement (Required)', 'Document satisfactory assurances through a written contract or other arrangement with the business associate.', 'critical', 'preventive', 'low');
    
    -- Physical Safeguards
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (hipaa_fw_id, physical_id, '164.310(a)(1)', 'Facility Access Controls (Required)', 'Implement policies and procedures to limit physical access to electronic information systems and facilities while ensuring authorized access.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, physical_id, '164.310(a)(2)(i)', 'Contingency Operations (Addressable)', 'Establish procedures allowing facility access in support of restoration of lost data under disaster recovery and emergency mode operations.', 'high', 'preventive', 'low'),
    (hipaa_fw_id, physical_id, '164.310(a)(2)(ii)', 'Facility Security Plan (Addressable)', 'Implement policies and procedures to safeguard the facility and equipment from unauthorized physical access, tampering, and theft.', 'high', 'preventive', 'low'),
    (hipaa_fw_id, physical_id, '164.310(a)(2)(iii)', 'Access Control and Validation Procedures (Addressable)', 'Implement procedures to control and validate a person''s access to facilities based on their role or function.', 'high', 'preventive', 'medium'),
    (hipaa_fw_id, physical_id, '164.310(a)(2)(iv)', 'Maintenance Records (Addressable)', 'Implement policies and procedures to document repairs and modifications to physical components of a facility related to security.', 'medium', 'detective', 'medium'),
    
    (hipaa_fw_id, physical_id, '164.310(b)', 'Workstation Use (Required)', 'Implement policies and procedures that specify proper functions to be performed, manner of performing functions, and physical attributes of surroundings for workstations accessing ePHI.', 'high', 'directive', 'low'),
    
    (hipaa_fw_id, physical_id, '164.310(c)', 'Workstation Security (Required)', 'Implement physical safeguards for all workstations that access ePHI to restrict access to authorized users.', 'critical', 'preventive', 'medium'),
    
    (hipaa_fw_id, physical_id, '164.310(d)(1)', 'Device and Media Controls (Required)', 'Implement policies and procedures that govern receipt and removal of hardware and electronic media containing ePHI into and out of a facility.', 'high', 'preventive', 'medium'),
    (hipaa_fw_id, physical_id, '164.310(d)(2)(i)', 'Disposal (Required)', 'Implement policies and procedures to address final disposition of ePHI and/or hardware or electronic media on which it is stored.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, physical_id, '164.310(d)(2)(ii)', 'Media Re-use (Required)', 'Implement procedures for removal of ePHI from electronic media before the media are made available for re-use.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, physical_id, '164.310(d)(2)(iii)', 'Accountability (Addressable)', 'Maintain a record of movements of hardware and electronic media and any person responsible therefore.', 'medium', 'detective', 'medium'),
    (hipaa_fw_id, physical_id, '164.310(d)(2)(iv)', 'Data Backup and Storage (Addressable)', 'Create a retrievable, exact copy of ePHI, when needed, before movement of equipment.', 'high', 'preventive', 'high');
    
    -- Technical Safeguards
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (hipaa_fw_id, technical_id, '164.312(a)(1)', 'Access Control (Required)', 'Implement technical policies and procedures for electronic information systems that maintain ePHI to allow only authorized persons or software programs access.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, technical_id, '164.312(a)(2)(i)', 'Unique User Identification (Required)', 'Assign a unique name and/or number for identifying and tracking user identity.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, technical_id, '164.312(a)(2)(ii)', 'Emergency Access Procedure (Required)', 'Establish and implement procedures for obtaining necessary ePHI during an emergency.', 'critical', 'preventive', 'medium'),
    (hipaa_fw_id, technical_id, '164.312(a)(2)(iii)', 'Automatic Logoff (Addressable)', 'Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity.', 'high', 'preventive', 'high'),
    (hipaa_fw_id, technical_id, '164.312(a)(2)(iv)', 'Encryption and Decryption (Addressable)', 'Implement a mechanism to encrypt and decrypt ePHI.', 'high', 'preventive', 'high'),
    
    (hipaa_fw_id, technical_id, '164.312(b)', 'Audit Controls (Required)', 'Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems containing or using ePHI.', 'critical', 'detective', 'high'),
    
    (hipaa_fw_id, technical_id, '164.312(c)(1)', 'Integrity (Required)', 'Implement policies and procedures to protect ePHI from improper alteration or destruction.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, technical_id, '164.312(c)(2)', 'Mechanism to Authenticate ePHI (Addressable)', 'Implement electronic mechanisms to corroborate that ePHI has not been altered or destroyed in an unauthorized manner.', 'high', 'detective', 'high'),
    
    (hipaa_fw_id, technical_id, '164.312(d)', 'Person or Entity Authentication (Required)', 'Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed.', 'critical', 'preventive', 'high'),
    
    (hipaa_fw_id, technical_id, '164.312(e)(1)', 'Transmission Security (Required)', 'Implement technical security measures to guard against unauthorized access to ePHI being transmitted over an electronic communications network.', 'critical', 'preventive', 'high'),
    (hipaa_fw_id, technical_id, '164.312(e)(2)(i)', 'Integrity Controls (Addressable)', 'Implement security measures to ensure that electronically transmitted ePHI is not improperly modified without detection.', 'high', 'detective', 'high'),
    (hipaa_fw_id, technical_id, '164.312(e)(2)(ii)', 'Encryption (Addressable)', 'Implement a mechanism to encrypt ePHI whenever deemed appropriate.', 'high', 'preventive', 'high');
    
END $$;

-- ========== PCI DSS 4.0 ==========
INSERT INTO frameworks (code, name, version, description, category, issuing_body, published_date, mandatory, url) VALUES
('pci_dss', 'PCI Data Security Standard', '4.0', 'Payment Card Industry Data Security Standard. Security standard for organizations handling branded credit cards. Mandatory for entities that store, process, or transmit cardholder data.', 'compliance', 'PCI SSC', '2022-03-31', true, 'https://www.pcisecuritystandards.org/');

DO $$
DECLARE
    pci_fw_id UUID;
BEGIN
    SELECT id INTO pci_fw_id FROM frameworks WHERE code = 'pci_dss';
    
    -- PCI DSS 4.0 has 12 main requirements organized into 6 goals
    INSERT INTO framework_functions (framework_id, code, name, description, sequence_order) VALUES
    (pci_fw_id, 'GOAL1', 'Build and Maintain a Secure Network and Systems', 'Requirements 1-2: Firewalls and security configurations', 1),
    (pci_fw_id, 'GOAL2', 'Protect Cardholder Data', 'Requirements 3-4: Data protection and encryption', 2),
    (pci_fw_id, 'GOAL3', 'Maintain a Vulnerability Management Program', 'Requirements 5-6: Malware protection and secure systems', 3),
    (pci_fw_id, 'GOAL4', 'Implement Strong Access Control Measures', 'Requirements 7-9: Access controls and physical security', 4),
    (pci_fw_id, 'GOAL5', 'Regularly Monitor and Test Networks', 'Requirements 10-11: Logging and testing', 5),
    (pci_fw_id, 'GOAL6', 'Maintain an Information Security Policy', 'Requirement 12: Security policy', 6);
    
    -- Requirement 1: Install and maintain network security controls
    INSERT INTO controls (framework_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (pci_fw_id, 'Req-1.1', 'Install and maintain network security controls', 'Processes and mechanisms for installing and maintaining network security controls are defined and understood.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-1.2', 'Configure and maintain network security controls', 'Network security controls (NSCs) are configured and maintained.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-1.3', 'Restrict network access between trusted and untrusted networks', 'Network access to and from the cardholder data environment is restricted.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-1.4', 'Restrict inbound and outbound traffic to that necessary', 'Network connections between trusted and untrusted networks are controlled.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-1.5', 'Risks to CDE from computing devices able to connect to both untrusted and trusted networks are mitigated', 'Risks to the CDE from computing devices that are able to connect to both untrusted networks and the CDE are mitigated.', 'high', 'preventive', 'medium');
    
    -- Requirement 2: Apply secure configurations to all system components
    INSERT INTO controls (framework_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (pci_fw_id, 'Req-2.1', 'Establish and implement processes for configuring system components', 'Processes and mechanisms for applying secure configurations to all system components are defined and understood.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-2.2', 'Configure system components to achieve security', 'System components are configured and managed securely.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-2.3', 'Wireless environments are configured and managed securely', 'Wireless environments are configured and managed securely.', 'critical', 'preventive', 'high');
    
    -- Requirement 3: Protect stored account data
    INSERT INTO controls (framework_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (pci_fw_id, 'Req-3.1', 'Establish and implement processes for protecting stored account data', 'Processes and mechanisms for protecting stored account data are defined and understood.', 'critical', 'preventive', 'medium'),
    (pci_fw_id, 'Req-3.2', 'Storage of account data is kept to a minimum', 'Storage of account data is kept to a minimum.', 'critical', 'preventive', 'medium'),
    (pci_fw_id, 'Req-3.3', 'Sensitive authentication data is not stored after authorization', 'Sensitive authentication data (SAD) is not stored after authorization.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-3.4', 'Access to displays of full PAN and ability to copy PAN is restricted', 'Access to displays of full PAN and ability to copy cardholder data are restricted.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-3.5', 'Primary account number is secured wherever it is stored', 'Primary account number (PAN) is secured wherever it is stored.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-3.6', 'Cryptographic keys used to protect stored account data are secured', 'Cryptographic keys used to protect stored account data are secured.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-3.7', 'Where cryptography is used to protect stored account data, key management processes are defined', 'Where cryptography is used to protect stored account data, key management processes and procedures are defined and implemented.', 'critical', 'preventive', 'medium');
    
    -- Requirement 4: Protect cardholder data with strong cryptography during transmission
    INSERT INTO controls (framework_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (pci_fw_id, 'Req-4.1', 'Establish and implement processes for protecting cardholder data with strong cryptography', 'Processes and mechanisms for protecting cardholder data with strong cryptography during transmission over open, public networks are defined and understood.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-4.2', 'PAN is protected with strong cryptography during transmission', 'PAN is protected with strong cryptography whenever it is transmitted over open, public networks.', 'critical', 'preventive', 'high');
    
    -- Requirements 5-12 (abbreviated for space)
    INSERT INTO controls (framework_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (pci_fw_id, 'Req-5.1', 'Malicious software is prevented, or detected and addressed', 'Processes and mechanisms for protecting all systems and networks from malicious software are defined, understood, and implemented.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-6.1', 'Establish and implement processes for security vulnerabilities', 'Processes and mechanisms for developing and maintaining secure systems and software are defined and understood.', 'critical', 'preventive', 'medium'),
    (pci_fw_id, 'Req-7.1', 'Access to system components and cardholder data is limited via access control systems', 'Processes and mechanisms for limiting access to system components and cardholder data via access control systems are defined and understood.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-8.1', 'Establish and implement processes for user identification and authentication', 'Processes and mechanisms for identifying and authenticating users are defined and understood.', 'critical', 'preventive', 'high'),
    (pci_fw_id, 'Req-9.1', 'Establish and implement processes to restrict physical access to cardholder data', 'Processes and mechanisms for restricting physical access to cardholder data are defined and understood.', 'critical', 'preventive', 'medium'),
    (pci_fw_id, 'Req-10.1', 'Establish and implement processes for logging and monitoring', 'Processes and mechanisms for implementing logging and monitoring of all access to system components and cardholder data are defined and documented.', 'critical', 'detective', 'high'),
    (pci_fw_id, 'Req-11.1', 'Establish and implement processes to test security of systems and networks', 'Processes and mechanisms for regularly testing security of systems and networks are defined and understood.', 'critical', 'detective', 'medium'),
    (pci_fw_id, 'Req-12.1', 'Establish and implement an information security policy', 'A comprehensive information security policy that governs and provides direction for protection of the entity''s information assets is known and current.', 'critical', 'directive', 'low');
    
END $$;

-- ========== GDPR (EU General Data Protection Regulation) ==========
INSERT INTO frameworks (code, name, version, description, category, issuing_body, published_date, mandatory, url) VALUES
('gdpr', 'General Data Protection Regulation', '2016/679', 'EU regulation on data protection and privacy for individuals within the European Union and European Economic Area. Also addresses export of personal data outside EU/EEA. Mandatory for organizations processing EU personal data.', 'privacy', 'European Union', '2016-04-27', true, 'https://gdpr.eu/');

DO $$
DECLARE
    gdpr_fw_id UUID;
    principles_id UUID;
    rights_id UUID;
    accountability_id UUID;
    security_id UUID;
BEGIN
    SELECT id INTO gdpr_fw_id FROM frameworks WHERE code = 'gdpr';
    
    -- GDPR Key Areas
    INSERT INTO framework_functions (framework_id, code, name, description, sequence_order) VALUES
    (gdpr_fw_id, 'PRINCIPLES', 'Data Protection Principles', 'Articles 5-6: Lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity, confidentiality, accountability', 1),
    (gdpr_fw_id, 'RIGHTS', 'Data Subject Rights', 'Articles 12-23: Rights of access, rectification, erasure, restriction, portability, objection', 2),
    (gdpr_fw_id, 'ACCOUNTABILITY', 'Controller and Processor Obligations', 'Articles 24-39: Data protection by design, DPIAs, DPO, records of processing, cooperation', 3),
    (gdpr_fw_id, 'SECURITY', 'Security and Breach Notification', 'Articles 32-34: Security of processing, breach notification, communication to data subjects', 4);
    
    SELECT id INTO principles_id FROM framework_functions WHERE framework_id = gdpr_fw_id AND code = 'PRINCIPLES';
    SELECT id INTO rights_id FROM framework_functions WHERE framework_id = gdpr_fw_id AND code = 'RIGHTS';
    SELECT id INTO accountability_id FROM framework_functions WHERE framework_id = gdpr_fw_id AND code = 'ACCOUNTABILITY';
    SELECT id INTO security_id FROM framework_functions WHERE framework_id = gdpr_fw_id AND code = 'SECURITY';
    
    -- Data Protection Principles
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (gdpr_fw_id, principles_id, 'Art.5(1)(a)', 'Lawfulness, fairness and transparency', 'Personal data shall be processed lawfully, fairly and in a transparent manner in relation to the data subject.', 'critical', 'directive', 'low'),
    (gdpr_fw_id, principles_id, 'Art.5(1)(b)', 'Purpose limitation', 'Personal data shall be collected for specified, explicit and legitimate purposes and not further processed in a manner incompatible with those purposes.', 'critical', 'preventive', 'medium'),
    (gdpr_fw_id, principles_id, 'Art.5(1)(c)', 'Data minimisation', 'Personal data shall be adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed.', 'critical', 'preventive', 'medium'),
    (gdpr_fw_id, principles_id, 'Art.5(1)(d)', 'Accuracy', 'Personal data shall be accurate and, where necessary, kept up to date. Every reasonable step must be taken to ensure that inaccurate personal data are erased or rectified without delay.', 'high', 'preventive', 'high'),
    (gdpr_fw_id, principles_id, 'Art.5(1)(e)', 'Storage limitation', 'Personal data shall be kept in a form which permits identification of data subjects for no longer than is necessary for the purposes for which the personal data are processed.', 'high', 'preventive', 'high'),
    (gdpr_fw_id, principles_id, 'Art.5(1)(f)', 'Integrity and confidentiality', 'Personal data shall be processed in a manner that ensures appropriate security, including protection against unauthorised or unlawful processing and against accidental loss, destruction or damage.', 'critical', 'preventive', 'high'),
    (gdpr_fw_id, principles_id, 'Art.5(2)', 'Accountability', 'The controller shall be responsible for, and be able to demonstrate compliance with, the principles.', 'critical', 'directive', 'low'),
    (gdpr_fw_id, principles_id, 'Art.6', 'Lawfulness of processing', 'Processing shall be lawful only if at least one legal basis applies (consent, contract, legal obligation, vital interests, public task, legitimate interests).', 'critical', 'directive', 'low');
    
    -- Data Subject Rights
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (gdpr_fw_id, rights_id, 'Art.12', 'Transparent information and communication', 'The controller shall take appropriate measures to provide information and communications relating to processing to the data subject in a concise, transparent, intelligible and easily accessible form.', 'critical', 'directive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.13', 'Information to be provided when data is collected from the data subject', 'Where personal data relating to a data subject are collected from the data subject, the controller shall provide identity, contact, purposes, legal basis, recipients, retention, and rights information.', 'critical', 'directive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.14', 'Information when data not obtained from the data subject', 'Where personal data have not been obtained from the data subject, the controller shall provide the data subject with required information.', 'critical', 'directive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.15', 'Right of access by the data subject', 'The data subject shall have the right to obtain from the controller confirmation as to whether or not personal data concerning them are being processed and access to the personal data.', 'critical', 'preventive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.16', 'Right to rectification', 'The data subject shall have the right to obtain from the controller without undue delay the rectification of inaccurate personal data.', 'high', 'corrective', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.17', 'Right to erasure (right to be forgotten)', 'The data subject shall have the right to obtain from the controller the erasure of personal data concerning them without undue delay under certain conditions.', 'critical', 'corrective', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.18', 'Right to restriction of processing', 'The data subject shall have the right to obtain from the controller restriction of processing under certain conditions.', 'high', 'preventive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.19', 'Notification regarding rectification, erasure or restriction', 'The controller shall communicate any rectification, erasure or restriction to recipients to whom the personal data have been disclosed.', 'high', 'directive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.20', 'Right to data portability', 'The data subject shall have the right to receive personal data in a structured, commonly used and machine-readable format and to transmit those data to another controller.', 'high', 'preventive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.21', 'Right to object', 'The data subject shall have the right to object to processing of personal data concerning them based on legitimate interests or for direct marketing purposes.', 'high', 'preventive', 'medium'),
    (gdpr_fw_id, rights_id, 'Art.22', 'Automated individual decision-making, including profiling', 'The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects or similarly significantly affects them.', 'critical', 'preventive', 'low');
    
    -- Accountability
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential, ai_relevance) VALUES
    (gdpr_fw_id, accountability_id, 'Art.24', 'Responsibility of the controller', 'The controller shall implement appropriate technical and organisational measures to ensure and demonstrate compliance with the regulation.', 'critical', 'directive', 'low', false),
    (gdpr_fw_id, accountability_id, 'Art.25', 'Data protection by design and by default', 'The controller shall implement appropriate technical and organisational measures designed to implement data-protection principles and integrate safeguards into processing.', 'critical', 'preventive', 'medium', true),
    (gdpr_fw_id, accountability_id, 'Art.28', 'Processor obligations', 'Processing by a processor shall be governed by a contract or legal act that sets out the subject-matter, duration, nature, purpose, and obligations of the processor.', 'critical', 'directive', 'low', false),
    (gdpr_fw_id, accountability_id, 'Art.30', 'Records of processing activities', 'Each controller and processor shall maintain a record of processing activities under its responsibility.', 'critical', 'directive', 'medium', false),
    (gdpr_fw_id, accountability_id, 'Art.32', 'Security of processing', 'The controller and processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk.', 'critical', 'preventive', 'high', false),
    (gdpr_fw_id, accountability_id, 'Art.35', 'Data protection impact assessment', 'Where processing is likely to result in a high risk to rights and freedoms, the controller shall carry out an assessment of the impact of the envisaged processing operations on the protection of personal data (DPIA).', 'critical', 'detective', 'low', true),
    (gdpr_fw_id, accountability_id, 'Art.37', 'Designation of the data protection officer', 'The controller and processor shall designate a data protection officer in certain cases.', 'high', 'directive', 'low', false);
    
    -- Security and Breach Notification
    INSERT INTO controls (framework_id, function_id, control_id, title, description, priority, control_type, automation_potential) VALUES
    (gdpr_fw_id, security_id, 'Art.32(1)', 'Appropriate technical and organisational measures', 'Implement pseudonymisation and encryption, ensure ongoing confidentiality/integrity/availability/resilience, restore availability and access to data after incident, regularly test and evaluate effectiveness.', 'critical', 'preventive', 'high'),
    (gdpr_fw_id, security_id, 'Art.33', 'Notification of personal data breach to supervisory authority', 'In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the breach to the supervisory authority.', 'critical', 'directive', 'medium'),
    (gdpr_fw_id, security_id, 'Art.34', 'Communication of personal data breach to the data subject', 'When the personal data breach is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall communicate the breach to the data subject without undue delay.', 'critical', 'directive', 'medium');
    
END $$;
