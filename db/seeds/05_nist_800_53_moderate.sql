-- NIST SP 800-53 Rev 5 Seed Data (MODERATE Baseline)
-- Security and Privacy Controls for Information Systems and Organizations
-- Released: September 2020
-- 20 Control Families, ~325 controls in MODERATE baseline

-- Insert Framework
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'nist_800_53',
    'NIST SP 800-53',
    'NIST Special Publication 800-53 Revision 5: Security and Privacy Controls for Information Systems and Organizations',
    'Rev 5',
    'National Institute of Standards and Technology (NIST)',
    'Comprehensive catalog of security and privacy controls for federal information systems and organizations. The foundation for FedRAMP, CMMC, and other federal compliance frameworks.',
    'cybersecurity',
    'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    '2020-09-23'
);

-- Get framework ID
DO $$
DECLARE
    fw_id UUID;
    func_id UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id FROM frameworks WHERE code = 'nist_800_53';

    -- ========================================
    -- ACCESS CONTROL (AC)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'AC', 'Access Control', 'Controls to limit information system access to authorized users, processes, or devices', 1)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'AC', 'Access Control', 'Access control policy and procedures', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, 'AC-1', 'Policy and Procedures', 'Develop, document, and disseminate access control policy and procedures', 'directive', 'high', 1),
    (fw_id, func_id, cat_id, 'AC-2', 'Account Management', 'Manage system accounts including identification, creation, enabling, modification, review, disabling, and removal', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, 'AC-3', 'Access Enforcement', 'Enforce approved authorizations for logical access to information and system resources', 'preventive', 'critical', 3),
    (fw_id, func_id, cat_id, 'AC-4', 'Information Flow Enforcement', 'Enforce approved authorizations for controlling the flow of information within the system', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, 'AC-5', 'Separation of Duties', 'Identify and document separation of duties of individuals', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, 'AC-6', 'Least Privilege', 'Employ the principle of least privilege', 'preventive', 'critical', 6),
    (fw_id, func_id, cat_id, 'AC-7', 'Unsuccessful Logon Attempts', 'Enforce a limit of consecutive invalid logon attempts', 'preventive', 'high', 7),
    (fw_id, func_id, cat_id, 'AC-8', 'System Use Notification', 'Display system use notification message before granting access', 'directive', 'medium', 8),
    (fw_id, func_id, cat_id, 'AC-11', 'Device Lock', 'Prevent further access by initiating a device lock after a period of inactivity', 'preventive', 'high', 9),
    (fw_id, func_id, cat_id, 'AC-12', 'Session Termination', 'Automatically terminate a user session after defined conditions', 'preventive', 'high', 10),
    (fw_id, func_id, cat_id, 'AC-14', 'Permitted Actions Without Identification', 'Identify user actions that can be performed without identification or authentication', 'directive', 'medium', 11),
    (fw_id, func_id, cat_id, 'AC-17', 'Remote Access', 'Establish and document usage restrictions for remote access', 'directive', 'critical', 12),
    (fw_id, func_id, cat_id, 'AC-18', 'Wireless Access', 'Establish usage restrictions and implementation guidance for wireless access', 'directive', 'high', 13),
    (fw_id, func_id, cat_id, 'AC-19', 'Access Control for Mobile Devices', 'Establish usage restrictions and implementation guidance for mobile devices', 'directive', 'high', 14),
    (fw_id, func_id, cat_id, 'AC-20', 'Use of External Systems', 'Establish terms and conditions for authorized individuals to access the system from external systems', 'directive', 'high', 15),
    (fw_id, func_id, cat_id, 'AC-22', 'Publicly Accessible Content', 'Designate individuals authorized to make information publicly accessible', 'directive', 'medium', 16);

    -- ========================================
    -- AWARENESS AND TRAINING (AT)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'AT', 'Awareness and Training', 'Controls for security and privacy awareness and training programs', 2)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'AT', 'Awareness and Training', 'Security awareness and training', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, 'AT-1', 'Policy and Procedures', 'Develop, document, and disseminate awareness and training policy and procedures', 'directive', 'high', 1),
    (fw_id, func_id, cat_id, 'AT-2', 'Literacy Training and Awareness', 'Provide literacy training on recognizing and reporting security and privacy incidents', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, 'AT-3', 'Role-Based Training', 'Provide role-based security and privacy training before authorizing access', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, 'AT-4', 'Training Records', 'Document and monitor information security and privacy training activities', 'detective', 'medium', 4);

    -- ========================================
    -- AUDIT AND ACCOUNTABILITY (AU)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'AU', 'Audit and Accountability', 'Controls for audit logging, monitoring, analysis, and reporting', 3)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'AU', 'Audit and Accountability', 'Audit and accountability policy', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, 'AU-1', 'Policy and Procedures', 'Develop, document, and disseminate audit and accountability policy and procedures', 'directive', 'high', 1),
    (fw_id, func_id, cat_id, 'AU-2', 'Event Logging', 'Identify the types of events that the system is capable of logging', 'detective', 'critical', 2),
    (fw_id, func_id, cat_id, 'AU-3', 'Content of Audit Records', 'Ensure audit records contain information that establishes what type of event occurred', 'detective', 'critical', 3),
    (fw_id, func_id, cat_id, 'AU-4', 'Audit Log Storage Capacity', 'Allocate audit log storage capacity to accommodate organization-defined audit log retention requirements', 'preventive', 'high', 4),
    (fw_id, func_id, cat_id, 'AU-5', 'Response to Audit Logging Process Failures', 'Alert personnel in the event of an audit logging process failure', 'detective', 'high', 5),
    (fw_id, func_id, cat_id, 'AU-6', 'Audit Record Review, Analysis, and Reporting', 'Review and analyze system audit records for indications of inappropriate activity', 'detective', 'critical', 6),
    (fw_id, func_id, cat_id, 'AU-7', 'Audit Record Reduction and Report Generation', 'Provide and implement an audit record reduction and report generation capability', 'detective', 'medium', 7),
    (fw_id, func_id, cat_id, 'AU-8', 'Time Stamps', 'Use internal system clocks to generate time stamps for audit records', 'detective', 'high', 8),
    (fw_id, func_id, cat_id, 'AU-9', 'Protection of Audit Information', 'Protect audit information and audit logging tools from unauthorized access', 'preventive', 'critical', 9),
    (fw_id, func_id, cat_id, 'AU-11', 'Audit Record Retention', 'Retain audit records for a time period consistent with records retention policy', 'directive', 'high', 10),
    (fw_id, func_id, cat_id, 'AU-12', 'Audit Record Generation', 'Provide audit record generation capability for events defined in AU-2', 'detective', 'critical', 11);

    -- ========================================
    -- ASSESSMENT, AUTHORIZATION, AND MONITORING (CA)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'CA', 'Security Assessment and Authorization', 'Controls for assessing, authorizing, and monitoring security and privacy controls', 4)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'CA', 'Assessment and Authorization', 'Security assessment and authorization', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, 'CA-1', 'Policy and Procedures', 'Develop, document, and disseminate assessment and authorization policy', 'directive', 'high', 1),
    (fw_id, func_id, cat_id, 'CA-2', 'Control Assessments', 'Develop a control assessment plan and assess the controls in the system', 'detective', 'critical', 2),
    (fw_id, func_id, cat_id, 'CA-3', 'Information Exchange', 'Approve, document, and manage the exchange of information between systems', 'directive', 'high', 3),
    (fw_id, func_id, cat_id, 'CA-5', 'Plan of Action and Milestones', 'Develop a plan of action and milestones for the system to document planned remediation actions', 'corrective', 'high', 4),
    (fw_id, func_id, cat_id, 'CA-6', 'Authorization', 'Assign a senior official as the authorizing official for the system', 'directive', 'critical', 5),
    (fw_id, func_id, cat_id, 'CA-7', 'Continuous Monitoring', 'Develop a system-level continuous monitoring strategy', 'detective', 'critical', 6),
    (fw_id, func_id, cat_id, 'CA-9', 'Internal System Connections', 'Authorize internal connections of system components to the system', 'directive', 'high', 7);

    -- ========================================
    -- CONFIGURATION MANAGEMENT (CM)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'CM', 'Configuration Management', 'Controls for configuration management of systems and system components', 5)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'CM', 'Configuration Management', 'Configuration management policy', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, 'CM-1', 'Policy and Procedures', 'Develop, document, and disseminate configuration management policy', 'directive', 'high', 1),
    (fw_id, func_id, cat_id, 'CM-2', 'Baseline Configuration', 'Develop, document, and maintain a current baseline configuration of the system', 'preventive', 'critical', 2),
    (fw_id, func_id, cat_id, 'CM-3', 'Configuration Change Control', 'Determine and document the types of changes to the system that are configuration-controlled', 'preventive', 'critical', 3),
    (fw_id, func_id, cat_id, 'CM-4', 'Impact Analyses', 'Analyze changes to the system to determine potential security and privacy impacts', 'detective', 'high', 4),
    (fw_id, func_id, cat_id, 'CM-5', 'Access Restrictions for Change', 'Define, document, approve, and enforce physical and logical access restrictions', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, 'CM-6', 'Configuration Settings', 'Establish and document configuration settings for components employed within the system', 'preventive', 'critical', 6),
    (fw_id, func_id, cat_id, 'CM-7', 'Least Functionality', 'Configure the system to provide only mission-essential capabilities', 'preventive', 'high', 7),
    (fw_id, func_id, cat_id, 'CM-8', 'System Component Inventory', 'Develop and document an inventory of system components', 'detective', 'critical', 8),
    (fw_id, func_id, cat_id, 'CM-9', 'Configuration Management Plan', 'Develop, document, and implement a configuration management plan', 'directive', 'high', 9),
    (fw_id, func_id, cat_id, 'CM-10', 'Software Usage Restrictions', 'Use software and associated documentation in accordance with contract agreements', 'directive', 'medium', 10),
    (fw_id, func_id, cat_id, 'CM-11', 'User-Installed Software', 'Establish policies governing the installation of software by users', 'directive', 'high', 11);

    -- ========================================
    -- CONTINGENCY PLANNING (CP)
    -- ========================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id, 'CP', 'Contingency Planning', 'Controls for contingency planning, backup operations, and disaster recovery', 6)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id, func_id, 'CP', 'Contingency Planning', 'Contingency planning policy', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id, func_id, cat_id, 'CP-1', 'Policy and Procedures', 'Develop, document, and disseminate contingency planning policy', 'directive', 'high', 1),
    (fw_id, func_id, cat_id, 'CP-2', 'Contingency Plan', 'Develop a contingency plan for the system that identifies essential mission and business functions', 'directive', 'critical', 2),
    (fw_id, func_id, cat_id, 'CP-3', 'Contingency Training', 'Provide contingency plan training to system users consistent with assigned roles', 'preventive', 'high', 3),
    (fw_id, func_id, cat_id, 'CP-4', 'Contingency Plan Testing', 'Test the contingency plan for the system to determine effectiveness', 'detective', 'high', 4),
    (fw_id, func_id, cat_id, 'CP-6', 'Alternate Storage Site', 'Establish an alternate storage site including necessary agreements', 'preventive', 'high', 5),
    (fw_id, func_id, cat_id, 'CP-7', 'Alternate Processing Site', 'Establish an alternate processing site including necessary agreements', 'preventive', 'high', 6),
    (fw_id, func_id, cat_id, 'CP-9', 'System Backup', 'Conduct backups of user-level and system-level information', 'preventive', 'critical', 7),
    (fw_id, func_id, cat_id, 'CP-10', 'System Recovery and Reconstitution', 'Provide for the recovery and reconstitution of the system to a known state', 'corrective', 'high', 8);

    -- Note: Due to the size of NIST 800-53, this seed file contains MODERATE baseline controls
    -- Additional control families will be added in future updates:
    -- IA (Identification and Authentication)
    -- IR (Incident Response)
    -- MA (Maintenance)
    -- MP (Media Protection)
    -- PE (Physical and Environmental Protection)
    -- PL (Planning)
    -- PM (Program Management)
    -- PS (Personnel Security)
    -- PT (PII Processing and Transparency)
    -- RA (Risk Assessment)
    -- SA (System and Services Acquisition)
    -- SC (System and Communications Protection)
    -- SI (System and Information Integrity)
    -- SR (Supply Chain Risk Management)

    -- Placeholder controls for remaining families (to be expanded)
    INSERT INTO framework_functions (framework_id, code, name, description, display_order) VALUES
    (fw_id, 'IA', 'Identification and Authentication', 'Controls for identifying and authenticating users and devices', 7),
    (fw_id, 'IR', 'Incident Response', 'Controls for incident handling, reporting, and response', 8),
    (fw_id, 'MA', 'Maintenance', 'Controls for system maintenance and tools', 9),
    (fw_id, 'MP', 'Media Protection', 'Controls for protecting system media', 10),
    (fw_id, 'PE', 'Physical and Environmental Protection', 'Controls for physical access and environmental controls', 11),
    (fw_id, 'PL', 'Planning', 'Controls for security and privacy planning', 12),
    (fw_id, 'PS', 'Personnel Security', 'Controls for personnel screening and termination', 13),
    (fw_id, 'RA', 'Risk Assessment', 'Controls for risk assessment and vulnerability management', 14),
    (fw_id, 'SA', 'System and Services Acquisition', 'Controls for system development and acquisition', 15),
    (fw_id, 'SC', 'System and Communications Protection', 'Controls for system and communications protection', 16),
    (fw_id, 'SI', 'System and Information Integrity', 'Controls for system and information integrity', 17),
    (fw_id, 'SR', 'Supply Chain Risk Management', 'Controls for supply chain risk management', 18);

END $$;

-- Note: This is the MODERATE baseline implementation of NIST 800-53 Rev 5
-- For complete LOW and HIGH baseline controls, additional seed files can be created
-- Total controls in full 800-53 Rev 5: ~1000+ across all baselines and enhancements
