module.exports = {
    code: 'nist_800_53', name: 'NIST SP 800-53 Rev 5', version: 'Rev 5',
    category: 'Cybersecurity', tier_required: 'community',
    description: 'Security and privacy controls for information systems. Controls mapped to NIST 800-160 system lifecycle stages.',
    controls: [
      // Access Control
      { control_id: 'AC-1', title: 'Access Control Policy and Procedures', description: 'Develop, document, and disseminate an access control policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'AC-2', title: 'Account Management', description: 'Define and manage information system accounts including establishing, activating, modifying, and disabling.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-3', title: 'Access Enforcement', description: 'Enforce approved authorizations for logical access to information and system resources.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-4', title: 'Information Flow Enforcement', description: 'Enforce approved authorizations for controlling information flows within and between systems.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-5', title: 'Separation of Duties', description: 'Identify and document duties of individuals requiring separation and define system access authorizations.', priority: '2', control_type: 'organizational' },
      { control_id: 'AC-6', title: 'Least Privilege', description: 'Employ the principle of least privilege allowing only authorized accesses for users and processes.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-7', title: 'Unsuccessful Logon Attempts', description: 'Enforce a limit of consecutive invalid logon attempts by a user and take defined actions upon exceeding.', priority: '2', control_type: 'technical' },
      { control_id: 'AC-8', title: 'System Use Notification', description: 'Display an approved system use notification message before granting access to the system.', priority: '3', control_type: 'technical' },
      { control_id: 'AC-11', title: 'Device Lock', description: 'Prevent further access by initiating a session lock after a defined period of inactivity.', priority: '2', control_type: 'technical' },
      { control_id: 'AC-17', title: 'Remote Access', description: 'Establish and document usage restrictions and implementation guidance for remote access.', priority: '1', control_type: 'technical' },
      // Audit and Accountability
      { control_id: 'AU-1', title: 'Audit and Accountability Policy', description: 'Develop, document, and disseminate an audit and accountability policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'AU-2', title: 'Event Logging', description: 'Identify events that the system is capable of auditing in support of the audit function.', priority: '1', control_type: 'technical' },
      { control_id: 'AU-3', title: 'Content of Audit Records', description: 'Ensure that audit records contain sufficient information to establish what events occurred.', priority: '1', control_type: 'technical' },
      { control_id: 'AU-6', title: 'Audit Record Review and Reporting', description: 'Review and analyze information system audit records for indications of inappropriate activity.', priority: '1', control_type: 'organizational' },
      { control_id: 'AU-8', title: 'Time Stamps', description: 'Use internal system clocks to generate time stamps for audit records.', priority: '2', control_type: 'technical' },
      { control_id: 'AU-9', title: 'Protection of Audit Information', description: 'Protect audit information and audit logging tools from unauthorized access and modification.', priority: '1', control_type: 'technical' },
      { control_id: 'AU-12', title: 'Audit Record Generation', description: 'Provide audit record generation capability for auditable events at all system components.', priority: '1', control_type: 'technical' },
      // Awareness and Training
      { control_id: 'AT-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a security awareness and training policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'AT-2', title: 'Literacy Training and Awareness', description: 'Provide basic security literacy training to system users as part of initial and ongoing awareness.', priority: '2', control_type: 'organizational' },
      { control_id: 'AT-3', title: 'Role-Based Training', description: 'Provide role-based security training to personnel with assigned security roles and responsibilities.', priority: '2', control_type: 'organizational' },
      // Config Management
      { control_id: 'CM-1', title: 'Configuration Management Policy', description: 'Develop, document, and disseminate a configuration management policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'CM-2', title: 'Baseline Configuration', description: 'Develop, document, and maintain a current baseline configuration of the information system.', priority: '1', control_type: 'technical' },
      { control_id: 'CM-3', title: 'Configuration Change Control', description: 'Determine and document types of changes to the system that are configuration-controlled.', priority: '1', control_type: 'organizational' },
      { control_id: 'CM-6', title: 'Configuration Settings', description: 'Establish and document configuration settings for system components using security configuration checklists.', priority: '1', control_type: 'technical' },
      { control_id: 'CM-7', title: 'Least Functionality', description: 'Configure the system to provide only mission-essential capabilities and restrict the use of functions and services.', priority: '2', control_type: 'technical' },
      { control_id: 'CM-8', title: 'System Component Inventory', description: 'Develop and document an inventory of system components that is consistent with system boundaries.', priority: '1', control_type: 'technical' },
      // Contingency Planning
      { control_id: 'CP-1', title: 'Contingency Planning Policy', description: 'Develop, document, and disseminate a contingency planning policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'CP-2', title: 'Contingency Plan', description: 'Develop a contingency plan that identifies essential missions, functions, and recovery objectives.', priority: '1', control_type: 'organizational' },
      { control_id: 'CP-4', title: 'Contingency Plan Testing', description: 'Test the contingency plan using defined tests to determine the plan effectiveness and readiness.', priority: '2', control_type: 'organizational' },
      { control_id: 'CP-9', title: 'System Backup', description: 'Conduct backups of user-level, system-level, and security-related information at defined frequency.', priority: '1', control_type: 'technical' },
      { control_id: 'CP-10', title: 'System Recovery and Reconstitution', description: 'Provide for the recovery and reconstitution of the system to a known state after a disruption.', priority: '1', control_type: 'technical' },
      // Identification & Auth
      { control_id: 'IA-1', title: 'Identification and Authentication Policy', description: 'Develop, document, and disseminate an identification and authentication policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'IA-2', title: 'Identification and Authentication (Org Users)', description: 'Uniquely identify and authenticate organizational users or processes acting on behalf of users.', priority: '1', control_type: 'technical' },
      { control_id: 'IA-4', title: 'Identifier Management', description: 'Manage information system identifiers by receiving authorization and issuing individual identifiers.', priority: '1', control_type: 'technical' },
      { control_id: 'IA-5', title: 'Authenticator Management', description: 'Manage system authenticators by verifying identity, establishing initial content, and ensuring security.', priority: '1', control_type: 'technical' },
      { control_id: 'IA-8', title: 'Identification and Authentication (Non-Org Users)', description: 'Uniquely identify and authenticate non-organizational users or processes acting on their behalf.', priority: '2', control_type: 'technical' },
      // Incident Response
      { control_id: 'IR-1', title: 'Incident Response Policy', description: 'Develop, document, and disseminate an incident response policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'IR-2', title: 'Incident Response Training', description: 'Provide incident response training to system users consistent with assigned roles.', priority: '2', control_type: 'organizational' },
      { control_id: 'IR-4', title: 'Incident Handling', description: 'Implement incident handling capability for incidents including preparation, detection, analysis, and recovery.', priority: '1', control_type: 'organizational' },
      { control_id: 'IR-5', title: 'Incident Monitoring', description: 'Track and document information system security incidents on an ongoing basis.', priority: '1', control_type: 'technical' },
      { control_id: 'IR-6', title: 'Incident Reporting', description: 'Require personnel to report suspected security incidents to the organizational incident response capability.', priority: '1', control_type: 'organizational' },
      { control_id: 'IR-8', title: 'Incident Response Plan', description: 'Develop an incident response plan that provides a roadmap for incident response capability.', priority: '1', control_type: 'organizational' },
      // Risk Assessment
      { control_id: 'RA-1', title: 'Risk Assessment Policy', description: 'Develop, document, and disseminate a risk assessment policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'RA-2', title: 'Security Categorization', description: 'Categorize the information system and document the results in the security plan.', priority: '1', control_type: 'strategic' },
      { control_id: 'RA-3', title: 'Risk Assessment', description: 'Conduct assessments of risk including likelihood and magnitude of harm from unauthorized access.', priority: '1', control_type: 'strategic' },
      { control_id: 'RA-5', title: 'Vulnerability Monitoring and Scanning', description: 'Monitor and scan for vulnerabilities in the system and hosted applications at defined frequency.', priority: '1', control_type: 'technical' },
      // System & Comms Protection
      { control_id: 'SC-1', title: 'System and Communications Protection Policy', description: 'Develop, document, and disseminate a system and communications protection policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'SC-7', title: 'Boundary Protection', description: 'Monitor and control communications at external and key internal boundaries of the system.', priority: '1', control_type: 'technical' },
      { control_id: 'SC-8', title: 'Transmission Confidentiality and Integrity', description: 'Protect the confidentiality and integrity of transmitted information.', priority: '1', control_type: 'technical' },
      { control_id: 'SC-12', title: 'Cryptographic Key Management', description: 'Establish and manage cryptographic keys used within the system.', priority: '1', control_type: 'technical' },
      { control_id: 'SC-13', title: 'Cryptographic Protection', description: 'Implement cryptographic mechanisms to prevent unauthorized disclosure and modification of information.', priority: '1', control_type: 'technical' },
      // System & Info Integrity
      { control_id: 'SI-1', title: 'System and Information Integrity Policy', description: 'Develop, document, and disseminate a system and information integrity policy and procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'SI-2', title: 'Flaw Remediation', description: 'Identify, report, and correct information system flaws in a timely manner.', priority: '1', control_type: 'technical' },
      { control_id: 'SI-3', title: 'Malicious Code Protection', description: 'Implement malicious code protection mechanisms at system entry and exit points.', priority: '1', control_type: 'technical' },
      { control_id: 'SI-4', title: 'System Monitoring', description: 'Monitor the system to detect attacks, unauthorized connections, and indicators of compromise.', priority: '1', control_type: 'technical' },
      { control_id: 'SI-5', title: 'Security Alerts and Advisories', description: 'Receive information system security alerts and advisories and disseminate to appropriate personnel.', priority: '2', control_type: 'organizational' },
    ]
  };
