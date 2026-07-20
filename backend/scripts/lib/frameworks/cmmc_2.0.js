module.exports = {
    code: 'cmmc_2.0', name: 'CMMC 2.0 (Level 2)', version: '2.0',
    category: 'CUI Protection', tier_required: 'pro',
    description: 'Cybersecurity Maturity Model Certification Level 2 — 110 practices aligned with NIST SP 800-171 for DoD contractor CUI protection.', // ip-hygiene:ignore
    controls: [
      // Domain: Access Control (AC)
      { control_id: 'AC.L2-3.1.1', title: 'Authorized Access Control', description: 'Limit system access to authorized users, processes, and devices.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.2', title: 'Transaction and Function Control', description: 'Limit system access to the types of transactions and functions that authorized users are permitted.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.3', title: 'Control CUI Flow', description: 'Control the flow of CUI in accordance with approved authorizations.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.5', title: 'Least Privilege', description: 'Employ the principle of least privilege including for specific security functions.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.7', title: 'Privileged Functions', description: 'Prevent non-privileged users from executing privileged functions.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.8', title: 'Unsuccessful Logon Attempts', description: 'Limit unsuccessful logon attempts and enforce a lockout after a specified number of failures.', priority: '2', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.12', title: 'Remote Access Control', description: 'Monitor and control remote access sessions.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.20', title: 'External System Connections', description: 'Verify and control or limit connections to and use of external systems.', priority: '1', control_type: 'technical' },
      { control_id: 'AC.L2-3.1.22', title: 'Control Public Information', description: 'Control information posted or processed on publicly accessible systems.', priority: '2', control_type: 'organizational' },
      // Domain: Awareness and Training (AT)
      { control_id: 'AT.L2-3.2.1', title: 'Role-Based Risk Awareness', description: 'Ensure that personnel are made aware of the security risks associated with their activities.', priority: '1', control_type: 'organizational' },
      { control_id: 'AT.L2-3.2.2', title: 'Insider Threat Awareness', description: 'Ensure that personnel are trained to recognize and report potential indicators of insider threat.', priority: '1', control_type: 'organizational' },
      // Domain: Audit and Accountability (AU)
      { control_id: 'AU.L2-3.3.1', title: 'System Auditing', description: 'Create and retain system audit logs and records to enable monitoring and reporting.', priority: '1', control_type: 'technical' },
      { control_id: 'AU.L2-3.3.2', title: 'Audit Record Content', description: 'Ensure that actions of individual users can be uniquely traced for accountability.', priority: '1', control_type: 'technical' },
      { control_id: 'AU.L2-3.3.4', title: 'Audit Failure Alerting', description: 'Alert in the event of an audit logging process failure.', priority: '1', control_type: 'technical' },
      { control_id: 'AU.L2-3.3.5', title: 'Audit Correlation', description: 'Correlate audit record review, analysis, and reporting for investigation and response.', priority: '2', control_type: 'technical' },
      // Domain: Security Assessment (CA)
      { control_id: 'CA.L2-3.12.1', title: 'Security Control Assessment', description: 'Periodically assess the security controls in organizational systems to determine effectiveness.', priority: '1', control_type: 'organizational' },
      { control_id: 'CA.L2-3.12.4', title: 'System Security Plan', description: 'Develop, document, and periodically update system security plans.', priority: '1', control_type: 'organizational' },
      // Domain: Configuration Management (CM)
      { control_id: 'CM.L2-3.4.1', title: 'System Baselining', description: 'Establish and maintain baseline configurations and inventories of organizational systems.', priority: '1', control_type: 'technical' },
      { control_id: 'CM.L2-3.4.2', title: 'Security Configuration Enforcement', description: 'Establish and enforce security configuration settings for IT products.', priority: '1', control_type: 'technical' },
      { control_id: 'CM.L2-3.4.5', title: 'Access Restrictions for Change', description: 'Define, document, approve, and enforce access restrictions associated with system changes.', priority: '1', control_type: 'technical' },
      { control_id: 'CM.L2-3.4.6', title: 'Least Functionality', description: 'Employ the principle of least functionality by configuring systems to provide only essential capabilities.', priority: '2', control_type: 'technical' },
      { control_id: 'CM.L2-3.4.8', title: 'Application Execution Policy', description: 'Apply deny-by-exception policy to prevent the use of unauthorized software.', priority: '2', control_type: 'technical' },
      // Domain: Identification and Authentication (IA)
      { control_id: 'IA.L2-3.5.1', title: 'User Identification', description: 'Identify and authenticate information system users, processes, or devices.', priority: '1', control_type: 'technical' },
      { control_id: 'IA.L2-3.5.2', title: 'Device Identification', description: 'Authenticate or verify the identities of devices before establishing connections.', priority: '2', control_type: 'technical' },
      { control_id: 'IA.L2-3.5.3', title: 'Multi-Factor Authentication', description: 'Use multifactor authentication for local and network access to privileged accounts.', priority: '1', control_type: 'technical' },
      { control_id: 'IA.L2-3.5.10', title: 'Cryptographic Authentication', description: 'Store and transmit only cryptographically-protected passwords.', priority: '1', control_type: 'technical' },
      // Domain: Incident Response (IR)
      { control_id: 'IR.L2-3.6.1', title: 'Incident Handling', description: 'Establish an operational incident-handling capability that includes preparation and response.', priority: '1', control_type: 'organizational' },
      { control_id: 'IR.L2-3.6.2', title: 'Incident Reporting', description: 'Track, document, and report incidents to designated officials and authorities.', priority: '1', control_type: 'organizational' },
      // Domain: Maintenance (MA)
      { control_id: 'MA.L2-3.7.1', title: 'System Maintenance', description: 'Perform maintenance on organizational systems in a timely manner.', priority: '2', control_type: 'organizational' },
      { control_id: 'MA.L2-3.7.5', title: 'Nonlocal Maintenance', description: 'Require multifactor authentication to establish nonlocal maintenance sessions.', priority: '2', control_type: 'technical' },
      // Domain: Media Protection (MP)
      { control_id: 'MP.L2-3.8.1', title: 'Media Protection', description: 'Protect system media containing CUI both paper and digital.', priority: '1', control_type: 'technical' },
      { control_id: 'MP.L2-3.8.3', title: 'Media Disposal', description: 'Sanitize or destroy system media containing CUI before disposal or reuse.', priority: '1', control_type: 'technical' },
      { control_id: 'MP.L2-3.8.9', title: 'CUI Backup Protection', description: 'Protect the confidentiality of backup CUI at storage locations.', priority: '1', control_type: 'technical' },
      // Domain: Physical Protection (PE)
      { control_id: 'PE.L2-3.10.1', title: 'Physical Access Limitation', description: 'Limit physical access to organizational systems, equipment, and operating environments.', priority: '1', control_type: 'technical' },
      { control_id: 'PE.L2-3.10.3', title: 'Escort Visitors', description: 'Escort visitors and monitor visitor activity throughout facilities.', priority: '2', control_type: 'organizational' },
      { control_id: 'PE.L2-3.10.6', title: 'Alternative Work Sites', description: 'Enforce safeguarding measures for CUI at alternate work sites.', priority: '2', control_type: 'organizational' },
      // Domain: Personnel Security (PS)
      { control_id: 'PS.L2-3.9.1', title: 'Personnel Screening', description: 'Screen individuals prior to authorizing access to systems containing CUI.', priority: '1', control_type: 'organizational' },
      { control_id: 'PS.L2-3.9.2', title: 'Personnel Actions', description: 'Ensure that CUI and systems are protected during and after personnel actions such as terminations.', priority: '1', control_type: 'organizational' },
      // Domain: Risk Assessment (RA)
      { control_id: 'RA.L2-3.11.1', title: 'Risk Assessments', description: 'Periodically assess the risk to organizational operations and assets.', priority: '1', control_type: 'strategic' },
      { control_id: 'RA.L2-3.11.2', title: 'Vulnerability Scanning', description: 'Scan for vulnerabilities in organizational systems and applications periodically.', priority: '1', control_type: 'technical' },
      { control_id: 'RA.L2-3.11.3', title: 'Vulnerability Remediation', description: 'Remediate vulnerabilities in accordance with risk assessments.', priority: '1', control_type: 'technical' },
      // Domain: System and Communications Protection (SC)
      { control_id: 'SC.L2-3.13.1', title: 'Boundary Protection', description: 'Monitor, control, and protect communications at the external system boundary.', priority: '1', control_type: 'technical' },
      { control_id: 'SC.L2-3.13.8', title: 'CUI Transmission Confidentiality', description: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.', priority: '1', control_type: 'technical' },
      { control_id: 'SC.L2-3.13.11', title: 'CUI Encryption', description: 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.', priority: '1', control_type: 'technical' },
      { control_id: 'SC.L2-3.13.16', title: 'Data at Rest Protection', description: 'Protect the confidentiality of CUI at rest.', priority: '1', control_type: 'technical' },
      // Domain: System and Information Integrity (SI)
      { control_id: 'SI.L2-3.14.1', title: 'Flaw Remediation', description: 'Identify, report, and correct system and information flaws in a timely manner.', priority: '1', control_type: 'technical' },
      { control_id: 'SI.L2-3.14.2', title: 'Malicious Code Protection', description: 'Provide protection from malicious code at designated locations within organizational systems.', priority: '1', control_type: 'technical' },
      { control_id: 'SI.L2-3.14.3', title: 'Security Alerts and Advisories', description: 'Monitor system security alerts and advisories and take action in response.', priority: '1', control_type: 'organizational' },
      { control_id: 'SI.L2-3.14.6', title: 'System Monitoring', description: 'Monitor organizational systems including inbound and outbound communications traffic.', priority: '1', control_type: 'technical' },
      { control_id: 'SI.L2-3.14.7', title: 'Advanced Threat Identification', description: 'Identify unauthorized use of organizational systems through advanced threat detection.', priority: '1', control_type: 'technical' },
    ]
  };
