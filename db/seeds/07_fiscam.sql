-- FISCAM (Federal Information Systems Controls Audit Manual) Framework Seed Data
-- FISCAM is used by federal auditors to assess IT controls in federal agencies
-- Version: 2023 (Latest)

-- ============================================================================
-- FISCAM Framework
-- ============================================================================
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'fiscam',
    'FISCAM',
    'Federal Information Systems Controls Audit Manual',
    '2023',
    'U.S. Government Accountability Office (GAO)',
    'Framework for auditing information system controls in federal agencies',
    'governance',
    'https://www.gao.gov/products/gao-09-232g',
    '2023-02-01'
);

-- Get FISCAM framework ID
DO $$
DECLARE
    fw_id_fiscam UUID;
    func_id UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id_fiscam FROM frameworks WHERE code = 'fiscam';

    -- ========================================================================
    -- SECURITY MANAGEMENT (SM)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, 'SM', 'Security Management', 'Controls for managing security programs and risk management', 1)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, func_id, 'SM', 'Security Management', 'Organizational security management and risk assessment', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_fiscam, func_id, cat_id, 'SM-1', 'Risk Assessment', 'Perform risk assessments to identify threats and vulnerabilities to information systems', 'detective', 'critical', 1),
    (fw_id_fiscam, func_id, cat_id, 'SM-2', 'Security Policies and Procedures', 'Establish and maintain documented security policies and procedures', 'directive', 'critical', 2),
    (fw_id_fiscam, func_id, cat_id, 'SM-3', 'Security Planning', 'Develop and maintain system security plans for each major application and general support system', 'directive', 'critical', 3),
    (fw_id_fiscam, func_id, cat_id, 'SM-4', 'Rules of Behavior', 'Establish and enforce rules of behavior for system users', 'directive', 'high', 4),
    (fw_id_fiscam, func_id, cat_id, 'SM-5', 'Personnel Security', 'Screen personnel and contractors prior to granting system access', 'preventive', 'critical', 5),
    (fw_id_fiscam, func_id, cat_id, 'SM-6', 'Security Awareness Training', 'Provide security awareness training to all personnel and contractors', 'preventive', 'critical', 6),
    (fw_id_fiscam, func_id, cat_id, 'SM-7', 'Certification and Accreditation', 'Conduct security certification and accreditation for information systems', 'detective', 'critical', 7),
    (fw_id_fiscam, func_id, cat_id, 'SM-8', 'Incident Response', 'Establish incident response capability and procedures', 'corrective', 'critical', 8),
    (fw_id_fiscam, func_id, cat_id, 'SM-9', 'Remedial Actions', 'Implement remedial actions for identified security weaknesses', 'corrective', 'high', 9),
    (fw_id_fiscam, func_id, cat_id, 'SM-10', 'Security Program Management', 'Implement and oversee organizational security program', 'directive', 'critical', 10);

    -- ========================================================================
    -- ACCESS CONTROLS (AC)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, 'AC', 'Access Controls', 'Controls for managing user access and authentication', 2)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, func_id, 'AC', 'Access Controls', 'Logical access control mechanisms', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_fiscam, func_id, cat_id, 'AC-1', 'Account Management', 'Manage information system accounts including establishment, activation, modification, review, and removal', 'preventive', 'critical', 1),
    (fw_id_fiscam, func_id, cat_id, 'AC-2', 'Access Authorization', 'Authorize access to the information system based on valid access authorization', 'preventive', 'critical', 2),
    (fw_id_fiscam, func_id, cat_id, 'AC-3', 'User Identification and Authentication', 'Uniquely identify and authenticate users before granting access', 'preventive', 'critical', 3),
    (fw_id_fiscam, func_id, cat_id, 'AC-4', 'Password Management', 'Enforce password complexity, history, and expiration requirements', 'preventive', 'critical', 4),
    (fw_id_fiscam, func_id, cat_id, 'AC-5', 'Session Controls', 'Terminate sessions after defined period of inactivity', 'preventive', 'high', 5),
    (fw_id_fiscam, func_id, cat_id, 'AC-6', 'Remote Access', 'Control and monitor remote access to information systems', 'preventive', 'critical', 6),
    (fw_id_fiscam, func_id, cat_id, 'AC-7', 'Wireless Access', 'Authorize, monitor, and control wireless access to information systems', 'preventive', 'high', 7),
    (fw_id_fiscam, func_id, cat_id, 'AC-8', 'Privileged Accounts', 'Restrict and monitor privileged account usage', 'preventive', 'critical', 8),
    (fw_id_fiscam, func_id, cat_id, 'AC-9', 'Least Privilege', 'Grant users minimum privileges necessary to perform assigned tasks', 'preventive', 'critical', 9),
    (fw_id_fiscam, func_id, cat_id, 'AC-10', 'Access Reviews', 'Review and update user access rights on a regular basis', 'detective', 'critical', 10),
    (fw_id_fiscam, func_id, cat_id, 'AC-11', 'Terminated/Transferred Users', 'Promptly disable accounts for terminated or transferred users', 'preventive', 'critical', 11),
    (fw_id_fiscam, func_id, cat_id, 'AC-12', 'Access Enforcement', 'Enforce approved authorizations for logical access', 'preventive', 'critical', 12);

    -- ========================================================================
    -- CONFIGURATION MANAGEMENT (CM)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, 'CM', 'Configuration Management', 'Controls for managing system configurations and changes', 3)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, func_id, 'CM', 'Configuration Management', 'Change control and configuration baseline management', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_fiscam, func_id, cat_id, 'CM-1', 'Configuration Management Plan', 'Develop and implement a configuration management plan', 'directive', 'critical', 1),
    (fw_id_fiscam, func_id, cat_id, 'CM-2', 'Baseline Configuration', 'Establish and maintain baseline configurations', 'directive', 'critical', 2),
    (fw_id_fiscam, func_id, cat_id, 'CM-3', 'Configuration Change Control', 'Control changes to information system configuration', 'preventive', 'critical', 3),
    (fw_id_fiscam, func_id, cat_id, 'CM-4', 'Security Impact Analysis', 'Analyze changes for security impact prior to implementation', 'detective', 'critical', 4),
    (fw_id_fiscam, func_id, cat_id, 'CM-5', 'Access Restrictions for Change', 'Define and enforce access restrictions for changes to the information system', 'preventive', 'critical', 5),
    (fw_id_fiscam, func_id, cat_id, 'CM-6', 'Configuration Settings', 'Establish and document mandatory configuration settings', 'directive', 'critical', 6),
    (fw_id_fiscam, func_id, cat_id, 'CM-7', 'Patch Management', 'Install software and firmware updates to remediate security flaws', 'corrective', 'critical', 7),
    (fw_id_fiscam, func_id, cat_id, 'CM-8', 'Software Inventory', 'Maintain inventory of software installed on systems', 'detective', 'high', 8),
    (fw_id_fiscam, func_id, cat_id, 'CM-9', 'Software Usage Restrictions', 'Control and monitor user-installed software', 'preventive', 'high', 9),
    (fw_id_fiscam, func_id, cat_id, 'CM-10', 'Testing Before Implementation', 'Test changes in non-production environment before implementation', 'preventive', 'critical', 10),
    (fw_id_fiscam, func_id, cat_id, 'CM-11', 'Configuration Monitoring', 'Monitor configuration changes and detect unauthorized changes', 'detective', 'critical', 11);

    -- ========================================================================
    -- SEGREGATION OF DUTIES (SD)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, 'SD', 'Segregation of Duties', 'Controls for separating incompatible functions and duties', 4)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, func_id, 'SD', 'Segregation of Duties', 'Separation of duties to prevent fraud and errors', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_fiscam, func_id, cat_id, 'SD-1', 'Segregation Policy', 'Define and document segregation of duties policies and procedures', 'directive', 'critical', 1),
    (fw_id_fiscam, func_id, cat_id, 'SD-2', 'Incompatible Functions', 'Identify and separate incompatible functions to reduce risk of fraud or error', 'preventive', 'critical', 2),
    (fw_id_fiscam, func_id, cat_id, 'SD-3', 'Developer/Administrator Separation', 'Separate system development from production administration', 'preventive', 'critical', 3),
    (fw_id_fiscam, func_id, cat_id, 'SD-4', 'Authorization/Execution Separation', 'Separate authorization from execution of transactions', 'preventive', 'critical', 4),
    (fw_id_fiscam, func_id, cat_id, 'SD-5', 'Dual Control', 'Require two or more individuals for critical or sensitive operations', 'preventive', 'high', 5),
    (fw_id_fiscam, func_id, cat_id, 'SD-6', 'Compensating Controls', 'Implement compensating controls when segregation is not feasible', 'detective', 'high', 6),
    (fw_id_fiscam, func_id, cat_id, 'SD-7', 'Periodic Reviews', 'Periodically review user access and duties for conflicts', 'detective', 'critical', 7);

    -- ========================================================================
    -- CONTINGENCY PLANNING (CP)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, 'CP', 'Contingency Planning', 'Controls for business continuity and disaster recovery', 5)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, func_id, 'CP', 'Contingency Planning', 'Planning for system availability and recovery', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_fiscam, func_id, cat_id, 'CP-1', 'Contingency Planning Policy', 'Develop and maintain contingency planning policy and procedures', 'directive', 'critical', 1),
    (fw_id_fiscam, func_id, cat_id, 'CP-2', 'Contingency Plan', 'Develop, document, and maintain contingency plans for information systems', 'directive', 'critical', 2),
    (fw_id_fiscam, func_id, cat_id, 'CP-3', 'Contingency Training', 'Provide contingency training to personnel with responsibilities', 'preventive', 'high', 3),
    (fw_id_fiscam, func_id, cat_id, 'CP-4', 'Contingency Plan Testing', 'Test contingency plans annually to ensure effectiveness', 'detective', 'critical', 4),
    (fw_id_fiscam, func_id, cat_id, 'CP-5', 'Alternate Storage Site', 'Establish alternate storage site for backup information', 'preventive', 'high', 5),
    (fw_id_fiscam, func_id, cat_id, 'CP-6', 'Alternate Processing Site', 'Establish alternate processing site for system operations', 'preventive', 'high', 6),
    (fw_id_fiscam, func_id, cat_id, 'CP-7', 'Data Backup', 'Conduct backups of user and system-level information', 'preventive', 'critical', 7),
    (fw_id_fiscam, func_id, cat_id, 'CP-8', 'Information System Recovery', 'Provide for recovery and reconstitution of the information system', 'corrective', 'critical', 8),
    (fw_id_fiscam, func_id, cat_id, 'CP-9', 'Backup Verification', 'Test backup information to verify integrity and restore capability', 'detective', 'critical', 9),
    (fw_id_fiscam, func_id, cat_id, 'CP-10', 'System Redundancy', 'Implement redundancy for critical system components', 'preventive', 'high', 10);

    -- ========================================================================
    -- AUDIT AND ACCOUNTABILITY (AA)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, 'AA', 'Audit and Accountability', 'Controls for audit logging and monitoring', 6)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_fiscam, func_id, 'AA', 'Audit and Accountability', 'Logging, monitoring, and audit trail management', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_fiscam, func_id, cat_id, 'AA-1', 'Audit Logging', 'Enable audit logging for security-relevant events', 'detective', 'critical', 1),
    (fw_id_fiscam, func_id, cat_id, 'AA-2', 'Audit Content', 'Ensure audit records contain sufficient information to establish what events occurred', 'detective', 'critical', 2),
    (fw_id_fiscam, func_id, cat_id, 'AA-3', 'Audit Storage Capacity', 'Allocate sufficient audit record storage capacity', 'preventive', 'high', 3),
    (fw_id_fiscam, func_id, cat_id, 'AA-4', 'Audit Processing Failure', 'Alert in the event of audit processing failure', 'detective', 'critical', 4),
    (fw_id_fiscam, func_id, cat_id, 'AA-5', 'Audit Review and Analysis', 'Review and analyze audit logs for inappropriate or unusual activity', 'detective', 'critical', 5),
    (fw_id_fiscam, func_id, cat_id, 'AA-6', 'Audit Reduction and Reporting', 'Provide audit reduction and report generation capability', 'detective', 'high', 6),
    (fw_id_fiscam, func_id, cat_id, 'AA-7', 'Time Stamps', 'Use internal system clocks to generate time stamps for audit records', 'detective', 'high', 7),
    (fw_id_fiscam, func_id, cat_id, 'AA-8', 'Protection of Audit Information', 'Protect audit information and audit tools from unauthorized access', 'preventive', 'critical', 8),
    (fw_id_fiscam, func_id, cat_id, 'AA-9', 'Non-Repudiation', 'Provide capability to determine source of action on the system', 'detective', 'high', 9),
    (fw_id_fiscam, func_id, cat_id, 'AA-10', 'Audit Record Retention', 'Retain audit records for minimum required retention period', 'directive', 'critical', 10);

END $$;

-- Add comments for documentation
COMMENT ON TABLE frameworks IS 'FISCAM framework added for federal IT audit compliance';
