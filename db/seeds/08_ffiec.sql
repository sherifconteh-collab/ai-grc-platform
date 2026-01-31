-- FFIEC (Federal Financial Institutions Examination Council) IT Examination Handbook Framework Seed Data
-- FFIEC provides IT examination guidelines for financial institutions
-- Based on FFIEC IT Examination Handbook

-- ============================================================================
-- FFIEC Framework
-- ============================================================================
INSERT INTO frameworks (code, name, full_name, version, issuing_body, description, category, official_url, last_updated)
VALUES (
    'ffiec',
    'FFIEC',
    'Federal Financial Institutions Examination Council IT Examination Handbook',
    '2024',
    'Federal Financial Institutions Examination Council (FFIEC)',
    'IT examination standards for financial institutions covering cybersecurity, operations, and risk management',
    'financial',
    'https://www.ffiec.gov/examination.htm',
    '2024-01-01'
);

-- Get FFIEC framework ID
DO $$
DECLARE
    fw_id_ffiec UUID;
    func_id UUID;
    cat_id UUID;
BEGIN
    SELECT id INTO fw_id_ffiec FROM frameworks WHERE code = 'ffiec';

    -- ========================================================================
    -- CYBERSECURITY (CS)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, 'CS', 'Cybersecurity', 'Cybersecurity controls and risk management for financial institutions', 1)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'CS-ASSESS', 'Cyber Risk Assessment', 'Cybersecurity risk assessment and management', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'CS-1', 'Cybersecurity Risk Assessment', 'Conduct regular cybersecurity risk assessments to identify threats and vulnerabilities', 'detective', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'CS-2', 'Cybersecurity Strategy', 'Develop and maintain comprehensive cybersecurity strategy aligned with business objectives', 'directive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'CS-3', 'Threat Intelligence', 'Maintain awareness of cybersecurity threats relevant to financial services', 'detective', 'high', 3),
    (fw_id_ffiec, func_id, cat_id, 'CS-4', 'Vulnerability Management', 'Identify, prioritize, and remediate cybersecurity vulnerabilities', 'corrective', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'CS-5', 'Penetration Testing', 'Conduct regular penetration testing and vulnerability scans', 'detective', 'high', 5);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'CS-PROTECT', 'Cybersecurity Protection', 'Protective cybersecurity controls', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'CS-6', 'Access Control Management', 'Implement strong access controls and authentication mechanisms', 'preventive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'CS-7', 'Multi-Factor Authentication', 'Require multi-factor authentication for critical systems and remote access', 'preventive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'CS-8', 'Network Segmentation', 'Segment networks to limit lateral movement and contain breaches', 'preventive', 'high', 3),
    (fw_id_ffiec, func_id, cat_id, 'CS-9', 'Data Encryption', 'Encrypt sensitive data in transit and at rest', 'preventive', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'CS-10', 'Secure Software Development', 'Implement secure development practices for applications', 'preventive', 'high', 5),
    (fw_id_ffiec, func_id, cat_id, 'CS-11', 'Endpoint Protection', 'Deploy endpoint security controls including anti-malware', 'preventive', 'critical', 6),
    (fw_id_ffiec, func_id, cat_id, 'CS-12', 'Email Security', 'Implement email filtering and anti-phishing controls', 'preventive', 'high', 7);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'CS-DETECT', 'Cybersecurity Detection', 'Detection and monitoring controls', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'CS-13', 'Security Monitoring', 'Implement continuous security monitoring and logging', 'detective', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'CS-14', 'Intrusion Detection', 'Deploy intrusion detection and prevention systems', 'detective', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'CS-15', 'Security Information and Event Management', 'Implement SIEM to correlate security events', 'detective', 'high', 3),
    (fw_id_ffiec, func_id, cat_id, 'CS-16', 'Anomaly Detection', 'Detect anomalous network and user behavior', 'detective', 'high', 4);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'CS-RESPOND', 'Incident Response', 'Cybersecurity incident response', 4)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'CS-17', 'Incident Response Plan', 'Develop and maintain cybersecurity incident response plan', 'directive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'CS-18', 'Incident Response Team', 'Establish incident response team with defined roles', 'directive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'CS-19', 'Incident Detection and Analysis', 'Detect and analyze cybersecurity incidents promptly', 'detective', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'CS-20', 'Incident Containment', 'Contain cybersecurity incidents to limit damage', 'corrective', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'CS-21', 'Incident Communication', 'Establish communication protocols for cybersecurity incidents', 'directive', 'critical', 5),
    (fw_id_ffiec, func_id, cat_id, 'CS-22', 'Regulatory Notification', 'Notify regulators of significant cybersecurity incidents per requirements', 'directive', 'critical', 6);

    -- ========================================================================
    -- BUSINESS CONTINUITY MANAGEMENT (BCM)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, 'BCM', 'Business Continuity Management', 'Business continuity and disaster recovery planning', 2)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'BCM', 'Business Continuity', 'Planning and testing for operational resilience', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'BCM-1', 'Business Impact Analysis', 'Conduct business impact analysis to identify critical functions', 'detective', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'BCM-2', 'Business Continuity Plan', 'Develop and maintain comprehensive business continuity plans', 'directive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'BCM-3', 'Disaster Recovery Plan', 'Develop disaster recovery plans for IT systems and data', 'directive', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'BCM-4', 'Recovery Time Objectives', 'Define recovery time objectives (RTO) for critical systems', 'directive', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'BCM-5', 'Recovery Point Objectives', 'Define recovery point objectives (RPO) for data', 'directive', 'critical', 5),
    (fw_id_ffiec, func_id, cat_id, 'BCM-6', 'Backup and Recovery', 'Implement backup procedures and test recovery capabilities', 'preventive', 'critical', 6),
    (fw_id_ffiec, func_id, cat_id, 'BCM-7', 'Alternate Site Operations', 'Establish and maintain alternate processing facilities', 'preventive', 'high', 7),
    (fw_id_ffiec, func_id, cat_id, 'BCM-8', 'BC Testing', 'Test business continuity and disaster recovery plans annually', 'detective', 'critical', 8),
    (fw_id_ffiec, func_id, cat_id, 'BCM-9', 'BC Training', 'Provide business continuity training to relevant personnel', 'preventive', 'high', 9),
    (fw_id_ffiec, func_id, cat_id, 'BCM-10', 'Third-Party Continuity', 'Assess business continuity capabilities of critical third parties', 'detective', 'high', 10);

    -- ========================================================================
    -- MANAGEMENT (MGT)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, 'MGT', 'Management', 'IT governance, risk management, and compliance', 3)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'MGT-GOV', 'IT Governance', 'IT governance and oversight', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'MGT-1', 'IT Governance Framework', 'Establish IT governance framework with board and management oversight', 'directive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'MGT-2', 'IT Strategic Planning', 'Develop IT strategic plan aligned with business objectives', 'directive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'MGT-3', 'IT Policies and Procedures', 'Establish comprehensive IT policies and procedures', 'directive', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'MGT-4', 'IT Risk Assessment', 'Conduct regular IT risk assessments', 'detective', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'MGT-5', 'Risk Management Program', 'Implement risk management program to identify and mitigate IT risks', 'directive', 'critical', 5);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'MGT-AUDIT', 'IT Audit', 'Internal and external IT audit', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'MGT-6', 'IT Audit Program', 'Establish independent IT audit function', 'detective', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'MGT-7', 'Audit Frequency', 'Conduct IT audits with appropriate frequency based on risk', 'detective', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'MGT-8', 'Audit Reporting', 'Report audit findings to board and management', 'directive', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'MGT-9', 'Remediation Tracking', 'Track and remediate audit findings in timely manner', 'corrective', 'critical', 4);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'MGT-THIRD', 'Third-Party Risk', 'Third-party vendor risk management', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'MGT-10', 'Third-Party Risk Program', 'Establish third-party risk management program', 'directive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'MGT-11', 'Third-Party Due Diligence', 'Conduct due diligence before engaging third parties', 'detective', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'MGT-12', 'Third-Party Contracts', 'Include security and compliance requirements in third-party contracts', 'directive', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'MGT-13', 'Third-Party Monitoring', 'Monitor third-party performance and compliance', 'detective', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'MGT-14', 'Critical Third-Party Oversight', 'Provide enhanced oversight for critical third parties', 'detective', 'critical', 5);

    -- ========================================================================
    -- DEVELOPMENT AND ACQUISITION (DA)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, 'DA', 'Development and Acquisition', 'Software development and technology acquisition controls', 4)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'DA-SDLC', 'Systems Development', 'Systems development lifecycle controls', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'DA-1', 'SDLC Methodology', 'Implement formal systems development lifecycle methodology', 'directive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'DA-2', 'Requirements Analysis', 'Document business and security requirements for systems', 'directive', 'high', 2),
    (fw_id_ffiec, func_id, cat_id, 'DA-3', 'Secure Coding Standards', 'Establish and enforce secure coding standards', 'preventive', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'DA-4', 'Code Review', 'Conduct code reviews for security vulnerabilities', 'detective', 'high', 4),
    (fw_id_ffiec, func_id, cat_id, 'DA-5', 'Application Testing', 'Test applications for functionality and security before deployment', 'detective', 'critical', 5),
    (fw_id_ffiec, func_id, cat_id, 'DA-6', 'Change Management', 'Control changes to applications through formal change management', 'preventive', 'critical', 6),
    (fw_id_ffiec, func_id, cat_id, 'DA-7', 'Development/Production Separation', 'Separate development, testing, and production environments', 'preventive', 'critical', 7);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'DA-ACQ', 'Technology Acquisition', 'Technology and vendor acquisition', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'DA-8', 'Acquisition Process', 'Establish process for evaluating and acquiring technology', 'directive', 'high', 1),
    (fw_id_ffiec, func_id, cat_id, 'DA-9', 'Security Requirements', 'Include security requirements in technology acquisition', 'directive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'DA-10', 'Vendor Assessment', 'Assess vendors for security and compliance capabilities', 'detective', 'critical', 3);

    -- ========================================================================
    -- SUPPORT AND DELIVERY (SD)
    -- ========================================================================
    INSERT INTO framework_functions (framework_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, 'SD', 'Support and Delivery', 'IT operations, service delivery, and support', 5)
    RETURNING id INTO func_id;

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'SD-OPS', 'IT Operations', 'Day-to-day IT operations management', 1)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'SD-1', 'Operations Management', 'Establish IT operations management processes', 'directive', 'high', 1),
    (fw_id_ffiec, func_id, cat_id, 'SD-2', 'Capacity Planning', 'Monitor capacity and plan for future needs', 'preventive', 'high', 2),
    (fw_id_ffiec, func_id, cat_id, 'SD-3', 'Performance Monitoring', 'Monitor system performance and availability', 'detective', 'high', 3),
    (fw_id_ffiec, func_id, cat_id, 'SD-4', 'Patch Management', 'Implement patch management process for timely updates', 'corrective', 'critical', 4),
    (fw_id_ffiec, func_id, cat_id, 'SD-5', 'Asset Management', 'Maintain inventory of IT assets', 'detective', 'high', 5),
    (fw_id_ffiec, func_id, cat_id, 'SD-6', 'Media Protection', 'Protect physical and digital media containing sensitive information', 'preventive', 'high', 6);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'SD-DATA', 'Data Management', 'Data integrity, retention, and disposal', 2)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'SD-7', 'Data Classification', 'Classify data based on sensitivity and criticality', 'directive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'SD-8', 'Data Integrity', 'Implement controls to ensure data integrity', 'preventive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'SD-9', 'Data Retention', 'Establish data retention policies and procedures', 'directive', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'SD-10', 'Data Disposal', 'Securely dispose of data and media per policy', 'preventive', 'high', 4),
    (fw_id_ffiec, func_id, cat_id, 'SD-11', 'Data Loss Prevention', 'Implement controls to prevent unauthorized data exfiltration', 'preventive', 'critical', 5);

    INSERT INTO framework_categories (framework_id, function_id, code, name, description, display_order)
    VALUES (fw_id_ffiec, func_id, 'SD-ACCESS', 'Access Controls', 'Logical and physical access management', 3)
    RETURNING id INTO cat_id;

    INSERT INTO framework_controls (framework_id, function_id, category_id, control_id, title, description, control_type, priority, display_order) VALUES
    (fw_id_ffiec, func_id, cat_id, 'SD-12', 'User Access Management', 'Manage user access throughout lifecycle', 'preventive', 'critical', 1),
    (fw_id_ffiec, func_id, cat_id, 'SD-13', 'Privileged Access Management', 'Control and monitor privileged access', 'preventive', 'critical', 2),
    (fw_id_ffiec, func_id, cat_id, 'SD-14', 'Access Reviews', 'Review user access rights periodically', 'detective', 'critical', 3),
    (fw_id_ffiec, func_id, cat_id, 'SD-15', 'Physical Security', 'Implement physical security controls for facilities and equipment', 'preventive', 'high', 4),
    (fw_id_ffiec, func_id, cat_id, 'SD-16', 'Environmental Controls', 'Implement environmental controls to protect IT equipment', 'preventive', 'high', 5);

END $$;

-- Add comments for documentation
COMMENT ON TABLE frameworks IS 'FFIEC framework added for financial institution IT compliance';
