-- NIST SP 800-171 Rev 2 Seed Data
-- Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations
-- Released: February 2020
-- 14 Families, 110 Security Requirements

-- Insert Framework
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'nist_800_171',
    'NIST SP 800-171',
    'NIST Special Publication 800-171: Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations',
    'Rev 2',
    'National Institute of Standards and Technology (NIST)',
    'Security requirements for protecting the confidentiality of Controlled Unclassified Information (CUI) in nonfederal systems. Required for federal contractors, research institutions, and higher education.',
    'cybersecurity',
    'https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final',
    '2020-02-01'
);

-- Get framework ID
DO $$
DECLARE
    fw_id UUID;
    func_id UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'nist_800_171';

    -- ========================================
    -- ACCESS CONTROL (AC)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'AC', 'Access Control', 'Limit system access to authorized users, processes acting on behalf of authorized users, or devices', 1)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'AC', 'Access Control', 'Access control requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.1.1', 'Authorized Access', 'Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems)', 'preventive', 'critical', 1),
    (fw_id, func_id, cat_id, '3.1.2', 'Transaction Types', 'Limit system access to the types of transactions and functions that authorized users are permitted to execute', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, '3.1.3', 'External Connections', 'Control the flow of CUI in accordance with approved authorizations', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, '3.1.4', 'Separation of Duties', 'Separate the duties of individuals to reduce the risk of malevolent activity', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, '3.1.5', 'Least Privilege', 'Employ the principle of least privilege, including specific security functions and privileged accounts', 'preventive', 'critical', 5),
    (fw_id, func_id, cat_id, '3.1.6', 'Non-Privileged Account Use', 'Use non-privileged accounts or roles when accessing nonsecurity functions', 'preventive', 'high', 6),
    (fw_id, func_id, cat_id, '3.1.7', 'Privileged Function Execution', 'Prevent non-privileged users from executing privileged functions', 'preventive', 'critical', 7),
    (fw_id, func_id, cat_id, '3.1.8', 'Unsuccessful Logon Attempts', 'Limit unsuccessful logon attempts', 'preventive', 'high', 8),
    (fw_id, func_id, cat_id, '3.1.9', 'Privacy and Security Notices', 'Provide privacy and security notices consistent with applicable CUI rules', 'directive', 'medium', 9),
    (fw_id, func_id, cat_id, '3.1.10', 'Session Lock', 'Use session lock with pattern-hiding displays to prevent access and viewing of data', 'preventive', 'high', 10),
    (fw_id, func_id, cat_id, '3.1.11', 'Session Termination', 'Terminate (automatically) a user session after a defined condition', 'preventive', 'high', 11),
    (fw_id, func_id, cat_id, '3.1.12', 'Control Remote Access', 'Monitor and control remote access sessions', 'detective', 'critical', 12),
    (fw_id, func_id, cat_id, '3.1.13', 'Cryptographic Mechanisms for Remote Access', 'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions', 'preventive', 'critical', 13),
    (fw_id, func_id, cat_id, '3.1.14', 'Route Remote Access via Managed Points', 'Route remote access via managed access control points', 'preventive', 'high', 14),
    (fw_id, func_id, cat_id, '3.1.15', 'Authorize Remote Access', 'Authorize remote execution of privileged commands and remote access to security-relevant information', 'directive', 'high', 15),
    (fw_id, func_id, cat_id, '3.1.16', 'Wireless Access Authorization', 'Authorize wireless access prior to allowing such connections', 'preventive', 'high', 16),
    (fw_id, func_id, cat_id, '3.1.17', 'Protect Wireless Access', 'Protect wireless access using authentication and encryption', 'preventive', 'critical', 17),
    (fw_id, func_id, cat_id, '3.1.18', 'Control Connection of Mobile Devices', 'Control connection of mobile devices', 'preventive', 'high', 18),
    (fw_id, func_id, cat_id, '3.1.19', 'Encrypt CUI on Mobile Devices', 'Encrypt CUI on mobile devices and mobile computing platforms', 'preventive', 'critical', 19),
    (fw_id, func_id, cat_id, '3.1.20', 'External System Connections', 'Verify and control/limit connections to and use of external systems', 'preventive', 'high', 20),
    (fw_id, func_id, cat_id, '3.1.21', 'Portable Storage Usage', 'Limit use of portable storage devices on external systems', 'preventive', 'high', 21),
    (fw_id, func_id, cat_id, '3.1.22', 'Control CUI Posting', 'Control CUI posted or processed on publicly accessible systems', 'preventive', 'critical', 22);

    -- ========================================
    -- AWARENESS AND TRAINING (AT)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'AT', 'Awareness and Training', 'Ensure that managers and users are made aware of security risks and are trained to carry out security-related duties', 2)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'AT', 'Awareness and Training', 'Security awareness and training requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.2.1', 'Security Awareness', 'Ensure that managers and users of organizational systems are made aware of the security risks associated with their activities', 'preventive', 'high', 1),
    (fw_id, func_id, cat_id, '3.2.2', 'Role-Based Security Training', 'Ensure that personnel are trained to carry out their assigned information security-related duties and responsibilities', 'preventive', 'high', 2),
    (fw_id, func_id, cat_id, '3.2.3', 'Insider Threat Awareness', 'Provide security awareness training on recognizing and reporting potential indicators of insider threat', 'preventive', 'high', 3);

    -- ========================================
    -- AUDIT AND ACCOUNTABILITY (AU)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'AU', 'Audit and Accountability', 'Create, protect, and retain system audit records to enable monitoring, analysis, investigation, and reporting', 3)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'AU', 'Audit and Accountability', 'Audit logging and accountability requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.3.1', 'System Audit Logging', 'Create and retain system audit logs and records to enable monitoring, analysis, investigation, and reporting', 'detective', 'critical', 1),
    (fw_id, func_id, cat_id, '3.3.2', 'Audit Record Content', 'Ensure that the actions of individual system users can be uniquely traced to those users', 'detective', 'critical', 2),
    (fw_id, func_id, cat_id, '3.3.3', 'Audit Review and Analysis', 'Review and update logged events', 'detective', 'high', 3),
    (fw_id, func_id, cat_id, '3.3.4', 'Alert Generation', 'Alert in the event of an audit logging process failure', 'detective', 'high', 4),
    (fw_id, func_id, cat_id, '3.3.5', 'Audit Record Correlation', 'Correlate audit record review, analysis, and reporting processes for investigation and response', 'detective', 'medium', 5),
    (fw_id, func_id, cat_id, '3.3.6', 'Audit Reduction', 'Provide audit record reduction and report generation to support on-demand analysis', 'detective', 'medium', 6),
    (fw_id, func_id, cat_id, '3.3.7', 'Audit Monitoring', 'Provide a system capability that compares and synchronizes internal system clocks with an authoritative source', 'detective', 'medium', 7),
    (fw_id, func_id, cat_id, '3.3.8', 'Protect Audit Information', 'Protect audit information and audit logging tools from unauthorized access, modification, and deletion', 'preventive', 'critical', 8),
    (fw_id, func_id, cat_id, '3.3.9', 'Limit Audit Management', 'Limit management of audit logging functionality to a subset of privileged users', 'preventive', 'high', 9);

    -- ========================================
    -- CONFIGURATION MANAGEMENT (CM)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'CM', 'Configuration Management', 'Establish and maintain baseline configurations and inventories of organizational systems', 4)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'CM', 'Configuration Management', 'System configuration management requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.4.1', 'Baseline Configurations', 'Establish and maintain baseline configurations and inventories of organizational systems', 'preventive', 'critical', 1),
    (fw_id, func_id, cat_id, '3.4.2', 'Security Configuration Settings', 'Establish and enforce security configuration settings for IT products employed', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, '3.4.3', 'Configuration Change Control', 'Track, review, approve/disapprove, and log changes to organizational systems', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, '3.4.4', 'Impact Analysis', 'Analyze the security impact of changes prior to implementation', 'detective', 'high', 4),
    (fw_id, func_id, cat_id, '3.4.5', 'Access Restrictions for Change', 'Define, document, approve, and enforce physical and logical access restrictions', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, '3.4.6', 'Least Functionality', 'Employ the principle of least functionality by configuring systems to provide only essential capabilities', 'preventive', 'high', 6),
    (fw_id, func_id, cat_id, '3.4.7', 'Nonessential Programs', 'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services', 'preventive', 'high', 7),
    (fw_id, func_id, cat_id, '3.4.8', 'User-Installed Software', 'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software', 'preventive', 'high', 8),
    (fw_id, func_id, cat_id, '3.4.9', 'User-Installed Software Control', 'Control and monitor user-installed software', 'detective', 'high', 9);

    -- ========================================
    -- IDENTIFICATION AND AUTHENTICATION (IA)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'IA', 'Identification and Authentication', 'Identify system users, processes acting on behalf of users, or devices', 5)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'IA', 'Identification and Authentication', 'User identification and authentication requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.5.1', 'User Identification', 'Identify system users, processes acting on behalf of users, or devices', 'preventive', 'critical', 1),
    (fw_id, func_id, cat_id, '3.5.2', 'User Authentication', 'Authenticate (or verify) the identities of those users, processes, or devices', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, '3.5.3', 'Multi-Factor Authentication', 'Use multifactor authentication for local and network access to privileged accounts', 'preventive', 'critical', 3),
    (fw_id, func_id, cat_id, '3.5.4', 'Replay-Resistant Authentication', 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, '3.5.5', 'Identifier Management', 'Prevent reuse of identifiers for a defined period', 'preventive', 'medium', 5),
    (fw_id, func_id, cat_id, '3.5.6', 'Authenticator Management', 'Disable identifiers after a defined period of inactivity', 'preventive', 'high', 6),
    (fw_id, func_id, cat_id, '3.5.7', 'Password Complexity', 'Enforce a minimum password complexity and change of characters when new passwords are created', 'preventive', 'high', 7),
    (fw_id, func_id, cat_id, '3.5.8', 'Password Reuse Prohibition', 'Prohibit password reuse for a specified number of generations', 'preventive', 'high', 8),
    (fw_id, func_id, cat_id, '3.5.9', 'Temporary Password Security', 'Allow temporary password use for system logons with an immediate change to a permanent password', 'preventive', 'medium', 9),
    (fw_id, func_id, cat_id, '3.5.10', 'Cryptographically-Protected Passwords', 'Store and transmit only cryptographically-protected passwords', 'preventive', 'critical', 10),
    (fw_id, func_id, cat_id, '3.5.11', 'Obscure Feedback', 'Obscure feedback of authentication information', 'preventive', 'high', 11);

    -- ========================================
    -- INCIDENT RESPONSE (IR)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'IR', 'Incident Response', 'Establish an operational incident-handling capability for organizational systems', 6)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'IR', 'Incident Response', 'Security incident response requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.6.1', 'Incident Handling', 'Establish an operational incident-handling capability for organizational systems', 'corrective', 'critical', 1),
    (fw_id, func_id, cat_id, '3.6.2', 'Incident Reporting', 'Track, document, and report incidents to designated officials', 'directive', 'critical', 2),
    (fw_id, func_id, cat_id, '3.6.3', 'Incident Response Testing', 'Test the organizational incident response capability', 'detective', 'high', 3);

    -- ========================================
    -- MAINTENANCE (MA)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'MA', 'Maintenance', 'Perform maintenance on organizational systems and provide controls on tools, techniques, and personnel', 7)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'MA', 'Maintenance', 'System maintenance requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.7.1', 'Scheduled Maintenance', 'Perform maintenance on organizational systems', 'preventive', 'high', 1),
    (fw_id, func_id, cat_id, '3.7.2', 'Controlled Maintenance', 'Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance', 'preventive', 'high', 2),
    (fw_id, func_id, cat_id, '3.7.3', 'Maintenance Tools', 'Ensure equipment removed for off-site maintenance is sanitized of any CUI', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, '3.7.4', 'Nonlocal Maintenance', 'Check media containing diagnostic and test programs for malicious code before use', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, '3.7.5', 'Maintenance Personnel', 'Require multifactor authentication to establish nonlocal maintenance sessions', 'preventive', 'critical', 5),
    (fw_id, func_id, cat_id, '3.7.6', 'Maintenance Session Supervision', 'Supervise the maintenance activities of maintenance personnel without required access authorization', 'directive', 'high', 6);

    -- ========================================
    -- MEDIA PROTECTION (MP)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'MP', 'Media Protection', 'Protect system media (both paper and digital)', 8)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'MP', 'Media Protection', 'Protection of system media requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.8.1', 'Media Access', 'Protect (i.e., physically control and securely store) system media containing CUI', 'preventive', 'critical', 1),
    (fw_id, func_id, cat_id, '3.8.2', 'Media Access Limitation', 'Limit access to CUI on system media to authorized users', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, '3.8.3', 'Media Sanitization', 'Sanitize or destroy system media containing CUI before disposal or release for reuse', 'preventive', 'critical', 3),
    (fw_id, func_id, cat_id, '3.8.4', 'Media Marking', 'Mark media with necessary CUI markings and distribution limitations', 'directive', 'high', 4),
    (fw_id, func_id, cat_id, '3.8.5', 'Media Access Control', 'Control access to media containing CUI and maintain accountability for media', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, '3.8.6', 'Cryptographic Protection', 'Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media', 'preventive', 'critical', 6),
    (fw_id, func_id, cat_id, '3.8.7', 'Media Use Control', 'Control the use of removable media on system components', 'preventive', 'high', 7),
    (fw_id, func_id, cat_id, '3.8.8', 'Prohibit Media Use', 'Prohibit the use of portable storage devices when such devices have no identifiable owner', 'preventive', 'high', 8),
    (fw_id, func_id, cat_id, '3.8.9', 'Media Transport Protection', 'Protect the confidentiality of CUI transported outside of controlled areas using cryptography', 'preventive', 'critical', 9);

    -- ========================================
    -- PERSONNEL SECURITY (PS)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'PS', 'Personnel Security', 'Ensure that personnel are trustworthy and meet established security criteria', 9)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'PS', 'Personnel Security', 'Personnel screening and management requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.9.1', 'Personnel Screening', 'Screen individuals prior to authorizing access to organizational systems containing CUI', 'preventive', 'high', 1),
    (fw_id, func_id, cat_id, '3.9.2', 'CUI Protection Understanding', 'Ensure that organizational systems containing CUI are protected during and after personnel actions', 'directive', 'high', 2);

    -- ========================================
    -- PHYSICAL PROTECTION (PE)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'PE', 'Physical Protection', 'Limit physical access to organizational systems, equipment, and operating environments', 10)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'PE', 'Physical Protection', 'Physical security requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.10.1', 'Physical Access Authorizations', 'Limit physical access to organizational systems, equipment, and operating environments', 'preventive', 'critical', 1),
    (fw_id, func_id, cat_id, '3.10.2', 'Physical Access Control', 'Protect and monitor the physical facility and support infrastructure', 'preventive', 'high', 2),
    (fw_id, func_id, cat_id, '3.10.3', 'Escort Visitors', 'Escort visitors and monitor visitor activity', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, '3.10.4', 'Physical Access Logs', 'Maintain audit logs of physical access', 'detective', 'high', 4),
    (fw_id, func_id, cat_id, '3.10.5', 'Physical Access Device Management', 'Control and manage physical access devices', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, '3.10.6', 'Alternate Work Site Security', 'Enforce safeguarding measures for CUI at alternate work sites', 'preventive', 'high', 6);

    -- ========================================
    -- RISK ASSESSMENT (RA)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'RA', 'Risk Assessment', 'Periodically assess the risk to organizational operations, assets, and individuals', 11)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'RA', 'Risk Assessment', 'Risk assessment requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.11.1', 'Periodic Risk Assessment', 'Periodically assess the risk to organizational operations, assets, and individuals', 'detective', 'critical', 1),
    (fw_id, func_id, cat_id, '3.11.2', 'Vulnerability Scanning', 'Scan for vulnerabilities in organizational systems and applications', 'detective', 'critical', 2),
    (fw_id, func_id, cat_id, '3.11.3', 'Vulnerability Remediation', 'Remediate vulnerabilities in accordance with risk assessments', 'corrective', 'critical', 3);

    -- ========================================
    -- SECURITY ASSESSMENT (CA)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'CA', 'Security Assessment', 'Periodically assess security controls to ensure they are effective in their application', 12)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'CA', 'Security Assessment', 'Security control assessment requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.12.1', 'Periodic Assessments', 'Periodically assess the security controls in organizational systems', 'detective', 'critical', 1),
    (fw_id, func_id, cat_id, '3.12.2', 'Plans of Action', 'Develop and implement plans of action designed to correct deficiencies', 'corrective', 'critical', 2),
    (fw_id, func_id, cat_id, '3.12.3', 'System Interconnections', 'Monitor security controls on an ongoing basis to ensure continued effectiveness', 'detective', 'high', 3),
    (fw_id, func_id, cat_id, '3.12.4', 'Plan of Action Updates', 'Develop, document, and periodically update system security plans', 'directive', 'high', 4);

    -- ========================================
    -- SYSTEM AND COMMUNICATIONS PROTECTION (SC)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'SC', 'System and Communications Protection', 'Monitor, control, and protect organizational communications at external boundaries', 13)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'SC', 'System and Communications Protection', 'Communications security requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.13.1', 'Boundary Protection', 'Monitor, control, and protect communications at external boundaries and key internal boundaries', 'preventive', 'critical', 1),
    (fw_id, func_id, cat_id, '3.13.2', 'Architecture Security', 'Employ architectural designs, software development techniques, and systems engineering principles', 'preventive', 'high', 2),
    (fw_id, func_id, cat_id, '3.13.3', 'Security Function Isolation', 'Separate user functionality from system management functionality', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, '3.13.4', 'Deny by Default', 'Prevent unauthorized and unintended information transfer via shared system resources', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, '3.13.5', 'Public Access Protection', 'Implement subnetworks for publicly accessible system components that are physically or logically separated', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, '3.13.6', 'Network Communication by Exception', 'Deny network communications traffic by default and allow network communications traffic by exception', 'preventive', 'high', 6),
    (fw_id, func_id, cat_id, '3.13.7', 'Split Tunneling Prevention', 'Prevent remote devices from simultaneously establishing non-remote connections', 'preventive', 'high', 7),
    (fw_id, func_id, cat_id, '3.13.8', 'Cryptographic Protection', 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission', 'preventive', 'critical', 8),
    (fw_id, func_id, cat_id, '3.13.9', 'Network Disconnect', 'Terminate network connections associated with communications sessions at the end of the sessions', 'preventive', 'medium', 9),
    (fw_id, func_id, cat_id, '3.13.10', 'Cryptographic Key Management', 'Establish and manage cryptographic keys for cryptography employed in organizational systems', 'preventive', 'critical', 10),
    (fw_id, func_id, cat_id, '3.13.11', 'CUI Encryption', 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI', 'preventive', 'critical', 11),
    (fw_id, func_id, cat_id, '3.13.12', 'Collaborative Computing', 'Prohibit remote activation of collaborative computing devices', 'preventive', 'medium', 12),
    (fw_id, func_id, cat_id, '3.13.13', 'Mobile Code', 'Control and monitor the use of mobile code', 'preventive', 'high', 13),
    (fw_id, func_id, cat_id, '3.13.14', 'Voice over IP', 'Control and monitor the use of Voice over Internet Protocol (VoIP) technologies', 'preventive', 'medium', 14),
    (fw_id, func_id, cat_id, '3.13.15', 'Authenticity Protection', 'Protect the authenticity of communications sessions', 'preventive', 'high', 15),
    (fw_id, func_id, cat_id, '3.13.16', 'Data Origin Authentication', 'Protect the confidentiality of CUI at rest', 'preventive', 'critical', 16);

    -- ========================================
    -- SYSTEM AND INFORMATION INTEGRITY (SI)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'SI', 'System and Information Integrity', 'Identify, report, and correct information and system flaws in a timely manner', 14)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'SI', 'System and Information Integrity', 'System integrity requirements', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, '3.14.1', 'Flaw Remediation', 'Identify, report, and correct information and system flaws in a timely manner', 'corrective', 'critical', 1),
    (fw_id, func_id, cat_id, '3.14.2', 'Malicious Code Protection', 'Provide protection from malicious code at appropriate locations within organizational systems', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, '3.14.3', 'Security Alerts and Advisories', 'Monitor system security alerts and advisories and take action in response', 'detective', 'high', 3),
    (fw_id, func_id, cat_id, '3.14.4', 'Software and Information Integrity', 'Update malicious code protection mechanisms when new releases are available', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, '3.14.5', 'System and File Scanning', 'Perform periodic scans of organizational systems and real-time scans of files from external sources', 'detective', 'high', 5),
    (fw_id, func_id, cat_id, '3.14.6', 'Network Monitoring', 'Monitor organizational systems including inbound and outbound communications traffic', 'detective', 'critical', 6),
    (fw_id, func_id, cat_id, '3.14.7', 'Unauthorized System Changes', 'Identify unauthorized use of organizational systems', 'detective', 'high', 7);

END $$;
