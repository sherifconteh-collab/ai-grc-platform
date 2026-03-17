// @tier: community
require('dotenv').config();
const { Pool } = require('pg');
const { AIUC1_FRAMEWORK, AIUC1_CONTROLS: AIUC1_SHARED_CONTROLS } = require('./lib/aiuc1-data');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

// NIST 800-160 aligned: frameworks organized by system lifecycle stages
// (Concept -> Development -> Production -> Utilization -> Support -> Retirement)
// with trustworthiness properties and security engineering integration

const frameworks = [
  // === FREE TIER: Core Cybersecurity ===
  {
    code: 'nist_csf_2.0', name: 'NIST Cybersecurity Framework 2.0', version: '2.0',
    category: 'Cybersecurity', tier_required: 'community',
    description: 'Comprehensive cybersecurity risk management framework with 6 core functions aligned to system lifecycle (NIST 800-160).',
    controls: [
      // GOVERN
      { control_id: 'GV.OC-01', title: 'Organizational Context - Mission Understanding', description: 'The organizational mission is understood and informs cybersecurity risk management.', priority: '1', control_type: 'strategic' },
      { control_id: 'GV.OC-02', title: 'Organizational Context - Internal Stakeholders', description: 'Internal stakeholders understand and support the cybersecurity risk management strategy.', priority: '2', control_type: 'strategic' },
      { control_id: 'GV.OC-03', title: 'Organizational Context - Legal Requirements', description: 'Legal, regulatory, and contractual requirements regarding cybersecurity are understood and managed.', priority: '1', control_type: 'strategic' },
      { control_id: 'GV.OC-04', title: 'Organizational Context - Critical Objectives', description: 'Critical objectives, capabilities, and services that stakeholders depend on are determined.', priority: '1', control_type: 'strategic' },
      { control_id: 'GV.OC-05', title: 'Organizational Context - Dependencies Understood', description: 'Outcomes, capabilities, and services that the organization depends on are understood and communicated.', priority: '2', control_type: 'strategic' },
      { control_id: 'GV.RM-01', title: 'Risk Management - Strategy Established', description: 'Risk management objectives are established and expressed as a strategy accepted by stakeholders.', priority: '1', control_type: 'strategic' },
      { control_id: 'GV.RM-02', title: 'Risk Management - Risk Appetite Statement', description: 'Risk appetite and tolerance statements are established, communicated, and maintained.', priority: '1', control_type: 'strategic' },
      { control_id: 'GV.RM-03', title: 'Risk Management - Supply Chain Risk', description: 'Cybersecurity supply chain risk management activities are integrated into risk management processes.', priority: '2', control_type: 'strategic' },
      { control_id: 'GV.RR-01', title: 'Roles & Responsibilities - Leadership Accountability', description: 'Organizational leadership is accountable for cybersecurity risk and fosters a risk-aware culture.', priority: '1', control_type: 'organizational' },
      { control_id: 'GV.RR-02', title: 'Roles & Responsibilities - Authority Defined', description: 'Roles, responsibilities, and authorities for cybersecurity risk management are established and communicated.', priority: '2', control_type: 'organizational' },
      { control_id: 'GV.PO-01', title: 'Policy - Cybersecurity Policy Established', description: 'A cybersecurity risk management policy based on organizational context is established and communicated.', priority: '1', control_type: 'policy' },
      { control_id: 'GV.PO-02', title: 'Policy - Policy Review and Update', description: 'The cybersecurity risk management policy is reviewed, updated, and communicated based on changes.', priority: '2', control_type: 'policy' },
      { control_id: 'GV.SC-01', title: 'Supply Chain - Cyber Supply Chain Risk Mgmt', description: 'A cyber supply chain risk management program is established including processes to identify and manage risks.', priority: '2', control_type: 'strategic' },
      // IDENTIFY
      { control_id: 'ID.AM-01', title: 'Asset Management - Hardware Inventory', description: 'Inventories of hardware managed by the organization are maintained.', priority: '1', control_type: 'technical' },
      { control_id: 'ID.AM-02', title: 'Asset Management - Software Inventory', description: 'Inventories of software, services, and systems managed by the organization are maintained.', priority: '1', control_type: 'technical' },
      { control_id: 'ID.AM-03', title: 'Asset Management - Data Flow Mapping', description: 'Representations of authorized network communication and data flows are maintained.', priority: '2', control_type: 'technical' },
      { control_id: 'ID.AM-04', title: 'Asset Management - External Systems Cataloged', description: 'Inventories of services provided by suppliers are maintained.', priority: '2', control_type: 'technical' },
      { control_id: 'ID.AM-05', title: 'Asset Management - Asset Prioritization', description: 'Assets are prioritized based on classification, criticality, and business value.', priority: '1', control_type: 'strategic' },
      { control_id: 'ID.RA-01', title: 'Risk Assessment - Vulnerability Identification', description: 'Vulnerabilities in assets are identified, validated, and recorded.', priority: '1', control_type: 'technical' },
      { control_id: 'ID.RA-02', title: 'Risk Assessment - Threat Intelligence', description: 'Cyber threat intelligence is received and is used to understand threats.', priority: '2', control_type: 'technical' },
      { control_id: 'ID.RA-03', title: 'Risk Assessment - Risk Identification', description: 'Internal and external threats to the organization are identified and recorded.', priority: '1', control_type: 'strategic' },
      { control_id: 'ID.RA-04', title: 'Risk Assessment - Impact Analysis', description: 'Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded.', priority: '1', control_type: 'strategic' },
      { control_id: 'ID.IM-01', title: 'Improvement - Lessons Learned', description: 'Improvements are identified from evaluations, exercises, and operational activities.', priority: '3', control_type: 'organizational' },
      // PROTECT
      { control_id: 'PR.AA-01', title: 'Identity & Access - Identities Managed', description: 'Identities and credentials for authorized users, services, and hardware are managed by the organization.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.AA-02', title: 'Identity & Access - Authentication', description: 'Identities are proofed and bound to credentials based on the context of interactions.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.AA-03', title: 'Identity & Access - Remote Access', description: 'Users, services, and hardware are authenticated by the organization.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.AA-04', title: 'Identity & Access - Access Permissions', description: 'Identity assertions and access permissions are managed, incorporated, and revoked.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.AA-05', title: 'Identity & Access - Physical Access', description: 'Physical access to assets is managed, monitored, and enforced commensurate with risk.', priority: '2', control_type: 'physical' },
      { control_id: 'PR.AT-01', title: 'Awareness & Training - Users Trained', description: 'Personnel are provided cybersecurity awareness and training so they can perform their duties.', priority: '2', control_type: 'organizational' },
      { control_id: 'PR.AT-02', title: 'Awareness & Training - Privileged Users Trained', description: 'Privileged users understand their roles and responsibilities.', priority: '1', control_type: 'organizational' },
      { control_id: 'PR.DS-01', title: 'Data Security - Data at Rest Protected', description: 'The confidentiality, integrity, and availability of data-at-rest are protected.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.DS-02', title: 'Data Security - Data in Transit Protected', description: 'The confidentiality, integrity, and availability of data-in-transit are protected.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.DS-10', title: 'Data Security - Confidentiality', description: 'The confidentiality of data is protected by access control and encryption mechanisms.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.DS-11', title: 'Data Security - Integrity', description: 'The integrity of data is maintained and validated using integrity checking mechanisms.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.PS-01', title: 'Platform Security - Configuration Management', description: 'Configuration management practices are established and applied.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.PS-02', title: 'Platform Security - Software Maintained', description: 'Software is maintained, replaced, and removed commensurate with risk.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.PS-03', title: 'Platform Security - Hardware Maintained', description: 'Hardware is maintained, replaced, and removed commensurate with risk.', priority: '2', control_type: 'technical' },
      { control_id: 'PR.IR-01', title: 'Resilience - Backups Maintained', description: 'Backups of data are created, protected, maintained, and tested.', priority: '1', control_type: 'technical' },
      { control_id: 'PR.IR-02', title: 'Resilience - Recovery Procedures', description: 'Recovery assets and processes are established and managed.', priority: '1', control_type: 'technical' },
      // DETECT
      { control_id: 'DE.CM-01', title: 'Continuous Monitoring - Network Monitoring', description: 'Networks and network services are monitored to find potentially adverse events.', priority: '1', control_type: 'technical' },
      { control_id: 'DE.CM-02', title: 'Continuous Monitoring - Physical Environment', description: 'The physical environment is monitored to find potentially adverse events.', priority: '3', control_type: 'physical' },
      { control_id: 'DE.CM-03', title: 'Continuous Monitoring - Personnel Activity', description: 'Personnel activity and technology usage are monitored to find potentially adverse events.', priority: '2', control_type: 'technical' },
      { control_id: 'DE.CM-06', title: 'Continuous Monitoring - External Provider Activity', description: 'External service provider activities and services are monitored to find potentially adverse events.', priority: '2', control_type: 'technical' },
      { control_id: 'DE.CM-09', title: 'Continuous Monitoring - Computing Hardware', description: 'Computing hardware and firmware are monitored to find potentially adverse events.', priority: '2', control_type: 'technical' },
      { control_id: 'DE.AE-02', title: 'Adverse Event Analysis - Anomalies Analyzed', description: 'Potentially adverse events are analyzed to better understand associated activities.', priority: '1', control_type: 'technical' },
      { control_id: 'DE.AE-03', title: 'Adverse Event Analysis - Correlation & Enrichment', description: 'Information is correlated from multiple sources to achieve situational awareness.', priority: '2', control_type: 'technical' },
      { control_id: 'DE.AE-06', title: 'Adverse Event Analysis - Incident Declared', description: 'Information on adverse events is provided to authorized staff and tools.', priority: '1', control_type: 'organizational' },
      // RESPOND
      { control_id: 'RS.MA-01', title: 'Incident Management - IR Plan Executed', description: 'The incident response plan is executed in coordination with relevant third parties.', priority: '1', control_type: 'organizational' },
      { control_id: 'RS.MA-02', title: 'Incident Management - Triage Performed', description: 'Incident reports are triaged and validated to support prioritized response.', priority: '1', control_type: 'organizational' },
      { control_id: 'RS.MA-03', title: 'Incident Management - Incidents Categorized', description: 'Incidents are categorized and prioritized based on severity and impact.', priority: '2', control_type: 'organizational' },
      { control_id: 'RS.AN-03', title: 'Incident Analysis - Root Cause Determined', description: 'Analysis is performed to determine the root cause of incidents.', priority: '1', control_type: 'technical' },
      { control_id: 'RS.CO-02', title: 'Incident Reporting - Stakeholders Notified', description: 'Internal and external stakeholders are notified of incidents per reporting requirements.', priority: '1', control_type: 'organizational' },
      { control_id: 'RS.MI-01', title: 'Incident Mitigation - Containment Performed', description: 'Incidents are contained to prevent further damage.', priority: '1', control_type: 'technical' },
      { control_id: 'RS.MI-02', title: 'Incident Mitigation - Eradication Performed', description: 'Incidents are eradicated by eliminating the root cause and associated artifacts.', priority: '1', control_type: 'technical' },
      // RECOVER
      { control_id: 'RC.RP-01', title: 'Recovery Execution - Recovery Plan Executed', description: 'The recovery portion of the incident response plan is executed once initiated.', priority: '1', control_type: 'organizational' },
      { control_id: 'RC.RP-02', title: 'Recovery Execution - Recovery Verified', description: 'Recovery actions are verified to confirm successful restoration of operations.', priority: '1', control_type: 'technical' },
      { control_id: 'RC.CO-03', title: 'Recovery Communication - Recovery Status Shared', description: 'Recovery activities and progress are communicated to designated stakeholders.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
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
  },
  {
    code: 'iso_27001', name: 'ISO/IEC 27001:2022', version: '2022',
    category: 'Information Security', tier_required: 'community',
    framework_group: 'iso_27000',
    description: 'Information security management system (ISMS) standard with Annex A controls.',
    controls: [
      { control_id: 'A.5.1', title: 'Policies for Information Security', description: 'A set of policies for information security shall be defined, approved by management, and communicated.', priority: '1', control_type: 'policy' },
      { control_id: 'A.5.2', title: 'Information Security Roles', description: 'Information security roles and responsibilities shall be defined and allocated.', priority: '1', control_type: 'organizational' },
      { control_id: 'A.5.3', title: 'Segregation of Duties', description: 'Conflicting duties and areas of responsibility shall be segregated to reduce unauthorized modification.', priority: '2', control_type: 'organizational' },
      { control_id: 'A.5.4', title: 'Management Responsibilities', description: 'Management shall require all personnel to apply information security in accordance with the policy.', priority: '1', control_type: 'organizational' },
      { control_id: 'A.5.7', title: 'Threat Intelligence', description: 'Information relating to information security threats shall be collected and analyzed.', priority: '2', control_type: 'technical' },
      { control_id: 'A.5.8', title: 'Information Security in Project Management', description: 'Information security shall be integrated into project management regardless of the project type.', priority: '2', control_type: 'organizational' },
      { control_id: 'A.5.9', title: 'Inventory of Information and Assets', description: 'An inventory of information and other associated assets shall be developed and maintained.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.10', title: 'Acceptable Use of Information', description: 'Rules for the acceptable use of information and assets shall be identified and documented.', priority: '2', control_type: 'policy' },
      { control_id: 'A.5.15', title: 'Access Control', description: 'Rules to control physical and logical access to information shall be established and implemented.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.16', title: 'Identity Management', description: 'The full lifecycle of identities shall be managed.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.17', title: 'Authentication Information', description: 'Allocation and management of authentication information shall be controlled.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.18', title: 'Access Rights', description: 'Access rights to information and assets shall be provisioned, reviewed, and removed.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.23', title: 'Information Security for Cloud Services', description: 'Processes for acquisition, use, management, and exit from cloud services shall be established.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.24', title: 'Information Security Incident Management', description: 'Information security incident management shall be planned and prepared.', priority: '1', control_type: 'organizational' },
      { control_id: 'A.5.25', title: 'Assessment and Decision on Events', description: 'Information security events shall be assessed and decided whether to categorize as incidents.', priority: '2', control_type: 'organizational' },
      { control_id: 'A.5.26', title: 'Response to Information Security Incidents', description: 'Information security incidents shall be responded to in accordance with documented procedures.', priority: '1', control_type: 'organizational' },
      { control_id: 'A.5.29', title: 'Information Security During Disruption', description: 'Information security continuity shall be embedded in business continuity management systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'A.5.30', title: 'ICT Readiness for Business Continuity', description: 'ICT readiness shall be planned, implemented, and tested based on business continuity objectives.', priority: '1', control_type: 'technical' },
      { control_id: 'A.5.36', title: 'Compliance with Policies and Standards', description: 'Compliance with the information security policy and standards shall be regularly reviewed.', priority: '2', control_type: 'organizational' },
      { control_id: 'A.6.1', title: 'Screening', description: 'Background verification checks on all candidates shall be carried out prior to joining.', priority: '3', control_type: 'organizational' },
      { control_id: 'A.6.3', title: 'Information Security Awareness', description: 'Personnel shall receive appropriate security awareness education and training.', priority: '2', control_type: 'organizational' },
      { control_id: 'A.7.1', title: 'Physical Security Perimeters', description: 'Security perimeters shall be defined and used to protect areas containing information.', priority: '2', control_type: 'physical' },
      { control_id: 'A.7.4', title: 'Physical Security Monitoring', description: 'Premises shall be continuously monitored for unauthorized physical access.', priority: '2', control_type: 'physical' },
      { control_id: 'A.8.1', title: 'User Endpoint Devices', description: 'Information stored on, processed by, or accessible via user endpoint devices shall be protected.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.2', title: 'Privileged Access Rights', description: 'The allocation and use of privileged access rights shall be restricted and managed.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.3', title: 'Information Access Restriction', description: 'Access to information and system functions shall be restricted in accordance with access control policy.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.5', title: 'Secure Authentication', description: 'Secure authentication technologies and procedures shall be established based on access restrictions.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.7', title: 'Protection Against Malware', description: 'Protection against malware shall be implemented and supported by user awareness.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.8', title: 'Management of Technical Vulnerabilities', description: 'Information about technical vulnerabilities shall be obtained and exposure evaluated.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.9', title: 'Configuration Management', description: 'Configurations including security configurations shall be established, documented, and maintained.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.10', title: 'Information Deletion', description: 'Information stored in information systems or devices shall be deleted when no longer required.', priority: '2', control_type: 'technical' },
      { control_id: 'A.8.12', title: 'Data Leakage Prevention', description: 'Data leakage prevention measures shall be applied to systems and networks containing sensitive data.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.13', title: 'Information Backup', description: 'Backup copies of information, software, and systems shall be maintained and regularly tested.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.15', title: 'Logging', description: 'Logs that record activities, exceptions, faults, and other relevant events shall be produced and stored.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.16', title: 'Monitoring Activities', description: 'Networks, systems, and applications shall be monitored for anomalous behavior.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.20', title: 'Networks Security', description: 'Networks and network devices shall be secured, managed, and controlled.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.24', title: 'Use of Cryptography', description: 'Rules for the effective use of cryptography shall be defined and implemented.', priority: '1', control_type: 'technical' },
      { control_id: 'A.8.25', title: 'Secure Development Lifecycle', description: 'Rules for the secure development of software and systems shall be established and applied.', priority: '2', control_type: 'technical' },
      { control_id: 'A.8.28', title: 'Secure Coding', description: 'Secure coding principles shall be applied to software development.', priority: '2', control_type: 'technical' },
    ]
  },
  {
    code: 'soc2', name: 'SOC 2 Type II', version: '2022',
    category: 'Audit', tier_required: 'community',
    description: 'Trust Service Criteria for service organizations. Mapped to NIST 800-160 trustworthiness objectives.',
    controls: [
      { control_id: 'CC1.1', title: 'COSO Principle 1 - Integrity and Ethical Values', description: 'The entity demonstrates a commitment to integrity and ethical values.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC1.2', title: 'COSO Principle 2 - Board Independence', description: 'The board of directors demonstrates independence from management and exercises oversight.', priority: '2', control_type: 'organizational' },
      { control_id: 'CC1.3', title: 'COSO Principle 3 - Management Authority', description: 'Management establishes structures, reporting lines, and appropriate authorities.', priority: '2', control_type: 'organizational' },
      { control_id: 'CC2.1', title: 'COSO Principle 13 - Quality Information', description: 'The entity obtains or generates and uses relevant, quality information to support internal control.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC2.2', title: 'COSO Principle 14 - Internal Communication', description: 'The entity internally communicates information needed to support the functioning of internal control.', priority: '2', control_type: 'organizational' },
      { control_id: 'CC3.1', title: 'COSO Principle 6 - Risk Assessment Objectives', description: 'The entity specifies objectives with sufficient clarity to enable identification of risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'CC3.2', title: 'COSO Principle 7 - Risk Identification', description: 'The entity identifies risks to the achievement of its objectives and analyzes them as a basis for management.', priority: '1', control_type: 'strategic' },
      { control_id: 'CC3.3', title: 'COSO Principle 8 - Fraud Risk', description: 'The entity considers the potential for fraud in assessing risks to achieving objectives.', priority: '2', control_type: 'strategic' },
      { control_id: 'CC3.4', title: 'COSO Principle 9 - Change Risk', description: 'The entity identifies and assesses changes that could significantly impact internal control.', priority: '2', control_type: 'strategic' },
      { control_id: 'CC4.1', title: 'COSO Principle 16 - Monitoring', description: 'The entity selects, develops, and performs ongoing evaluations to ascertain controls are present.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC5.1', title: 'COSO Principle 10 - Control Selection', description: 'The entity selects and develops control activities that contribute to mitigating risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'CC5.2', title: 'COSO Principle 11 - Technology Controls', description: 'The entity selects and develops general control activities over technology to support objectives.', priority: '1', control_type: 'technical' },
      { control_id: 'CC5.3', title: 'COSO Principle 12 - Control Deployment', description: 'The entity deploys control activities through policies that establish expectations and procedures.', priority: '1', control_type: 'technical' },
      { control_id: 'CC6.1', title: 'Logical and Physical Access - Access Controls', description: 'The entity implements logical access security software, infrastructure, and architectures.', priority: '1', control_type: 'technical' },
      { control_id: 'CC6.2', title: 'Logical and Physical Access - User Registration', description: 'Prior to issuing system credentials, the entity registers and authorizes new users.', priority: '1', control_type: 'technical' },
      { control_id: 'CC6.3', title: 'Logical and Physical Access - Role-Based Access', description: 'The entity authorizes, modifies, or removes access to data and assets based on roles.', priority: '1', control_type: 'technical' },
      { control_id: 'CC6.6', title: 'Logical and Physical Access - External Threats', description: 'The entity implements controls to prevent or detect and act upon unauthorized access.', priority: '1', control_type: 'technical' },
      { control_id: 'CC6.7', title: 'Logical and Physical Access - Data Transmission', description: 'The entity restricts the transmission of data to authorized external parties.', priority: '1', control_type: 'technical' },
      { control_id: 'CC6.8', title: 'Logical and Physical Access - Malicious Software', description: 'The entity implements controls to prevent or detect and act upon the introduction of malicious software.', priority: '1', control_type: 'technical' },
      { control_id: 'CC7.1', title: 'System Operations - Detection Mechanisms', description: 'The entity uses detection and monitoring procedures to identify changes to configurations and new vulnerabilities.', priority: '1', control_type: 'technical' },
      { control_id: 'CC7.2', title: 'System Operations - Anomaly Monitoring', description: 'The entity monitors system components for anomalies indicative of malicious acts and natural disasters.', priority: '1', control_type: 'technical' },
      { control_id: 'CC7.3', title: 'System Operations - Security Incident Evaluation', description: 'The entity evaluates security events to determine whether they could or have resulted in a failure.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC7.4', title: 'System Operations - Incident Response', description: 'The entity responds to identified security incidents by executing a defined incident response program.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC7.5', title: 'System Operations - Incident Recovery', description: 'The entity identifies, develops, and implements activities to recover from identified security incidents.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC8.1', title: 'Change Management - Change Authorization', description: 'The entity authorizes, designs, develops, configures, and tests changes prior to implementation.', priority: '1', control_type: 'organizational' },
      { control_id: 'CC9.1', title: 'Risk Mitigation - Risk Identification', description: 'The entity identifies, selects, and develops risk mitigation activities for risks arising from operations.', priority: '1', control_type: 'strategic' },
      { control_id: 'CC9.2', title: 'Risk Mitigation - Vendor Management', description: 'The entity assesses and manages risks associated with vendors and business partners.', priority: '2', control_type: 'organizational' },
    ]
  },

  // === STARTER TIER ===
  {
    code: 'nist_800_171', name: 'NIST SP 800-171 Rev 3', version: 'Rev 3',
    category: 'CUI Protection', tier_required: 'pro',
    description: 'Protecting Controlled Unclassified Information (CUI) in non-federal systems.',
    controls: [
      { control_id: '03.01.01', title: 'Account Management', description: 'Manage system accounts including defining account types, establishing conditions, and monitoring usage.', priority: '1', control_type: 'technical' },
      { control_id: '03.01.02', title: 'Access Enforcement', description: 'Enforce approved authorizations for logical access to systems in accordance with applicable policy.', priority: '1', control_type: 'technical' },
      { control_id: '03.01.03', title: 'Information Flow Enforcement', description: 'Control the flow of CUI in accordance with approved authorizations.', priority: '1', control_type: 'technical' },
      { control_id: '03.01.05', title: 'Least Privilege', description: 'Employ the principle of least privilege including for specific security functions and accounts.', priority: '1', control_type: 'technical' },
      { control_id: '03.01.12', title: 'Remote Access', description: 'Monitor and control remote access sessions and authorize remote execution of privileged commands.', priority: '1', control_type: 'technical' },
      { control_id: '03.01.20', title: 'Use of External Systems', description: 'Verify and control connections to and use of external information systems.', priority: '2', control_type: 'technical' },
      { control_id: '03.03.01', title: 'Event Logging', description: 'Create and retain system audit logs to enable monitoring, analysis, and reporting of unlawful activity.', priority: '1', control_type: 'technical' },
      { control_id: '03.03.02', title: 'Audit Record Content', description: 'Ensure audit records contain information needed to establish what occurred and the outcomes.', priority: '1', control_type: 'technical' },
      { control_id: '03.04.01', title: 'Baseline Configuration', description: 'Establish and maintain baseline configurations and inventories of organizational systems.', priority: '1', control_type: 'technical' },
      { control_id: '03.04.02', title: 'Configuration Settings', description: 'Establish and enforce security configuration settings for IT products in organizational systems.', priority: '1', control_type: 'technical' },
      { control_id: '03.04.06', title: 'Least Functionality', description: 'Configure systems to provide only mission-essential capabilities by restricting unnecessary functions.', priority: '2', control_type: 'technical' },
      { control_id: '03.05.01', title: 'User Identification and Authentication', description: 'Identify and authenticate users, processes, or devices as a prerequisite to system access.', priority: '1', control_type: 'technical' },
      { control_id: '03.05.02', title: 'Device Identification and Authentication', description: 'Authenticate devices before establishing connections to organizational systems.', priority: '2', control_type: 'technical' },
      { control_id: '03.05.03', title: 'Multi-Factor Authentication', description: 'Use multifactor authentication for local and network access to privileged and non-privileged accounts.', priority: '1', control_type: 'technical' },
      { control_id: '03.06.01', title: 'Incident Handling', description: 'Establish an operational incident-handling capability including preparation, detection, and response.', priority: '1', control_type: 'organizational' },
      { control_id: '03.08.01', title: 'Media Storage', description: 'Protect system media containing CUI both paper and digital during transport and storage.', priority: '2', control_type: 'technical' },
      { control_id: '03.11.01', title: 'Risk Assessment', description: 'Periodically assess risk to operations, assets, and individuals from system operation.', priority: '1', control_type: 'strategic' },
      { control_id: '03.11.02', title: 'Vulnerability Scanning', description: 'Scan for vulnerabilities in organizational systems and applications periodically and when new flaws arise.', priority: '1', control_type: 'technical' },
      { control_id: '03.12.01', title: 'Security Assessment', description: 'Periodically assess security controls to determine if they are effective in their application.', priority: '1', control_type: 'organizational' },
      { control_id: '03.13.01', title: 'Boundary Protection', description: 'Monitor, control, and protect communications at external and key internal boundaries.', priority: '1', control_type: 'technical' },
      { control_id: '03.13.08', title: 'CUI Transmission Confidentiality', description: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.', priority: '1', control_type: 'technical' },
      { control_id: '03.14.01', title: 'Flaw Remediation', description: 'Identify, report, and correct system flaws in a timely manner.', priority: '1', control_type: 'technical' },
      { control_id: '03.14.02', title: 'Malicious Code Protection', description: 'Provide protection from malicious code at appropriate locations within organizational systems.', priority: '1', control_type: 'technical' },
      { control_id: '03.14.06', title: 'System Monitoring', description: 'Monitor organizational systems including inbound and outbound communications for attacks.', priority: '1', control_type: 'technical' },
    ]
  },
  {
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
  },
  {
    code: 'nist_privacy', name: 'NIST Privacy Framework', version: '1.0',
    category: 'Privacy', tier_required: 'govcloud',
    description: 'Privacy risk management framework integrated with NIST 800-160 lifecycle.',
    controls: [
      { control_id: 'ID-P.01', title: 'Inventory and Mapping - Data Processing Inventory', description: 'Develop and maintain a data processing inventory covering all personal data activities.', priority: '1', control_type: 'technical' },
      { control_id: 'ID-P.02', title: 'Inventory and Mapping - Data Actions Identified', description: 'Data actions including collection, use, sharing, and disposal are identified and documented.', priority: '1', control_type: 'technical' },
      { control_id: 'GV-P.01', title: 'Governance - Privacy Policy', description: 'Establish and communicate a privacy policy that addresses purpose, scope, and compliance.', priority: '1', control_type: 'policy' },
      { control_id: 'GV-P.02', title: 'Governance - Legal Authorities', description: 'Legal authorities for data processing activities are identified and documented.', priority: '1', control_type: 'organizational' },
      { control_id: 'GV-P.03', title: 'Governance - Privacy Risk Strategy', description: 'Establish a privacy risk management strategy aligned with organizational risk tolerance.', priority: '1', control_type: 'strategic' },
      { control_id: 'CT-P.01', title: 'Control - Data Processing Policies', description: 'Data processing policies are established to manage privacy risks.', priority: '1', control_type: 'policy' },
      { control_id: 'CT-P.02', title: 'Control - Data Access Managed', description: 'Data access is managed and limited to authorized purposes and individuals.', priority: '1', control_type: 'technical' },
      { control_id: 'CM-P.01', title: 'Communicate - Individuals Informed', description: 'Individuals are informed about data processing activities and their rights.', priority: '1', control_type: 'organizational' },
      { control_id: 'CM-P.02', title: 'Communicate - Consent Mechanisms', description: 'Mechanisms for obtaining and tracking consent are implemented and maintained.', priority: '1', control_type: 'technical' },
      { control_id: 'PR-P.01', title: 'Protect - Data Protection Safeguards', description: 'Safeguards are implemented to protect personal data from unauthorized access and disclosure.', priority: '1', control_type: 'technical' },
      { control_id: 'PR-P.02', title: 'Protect - Identity Management', description: 'Identity management and access control mechanisms protect data processing activities.', priority: '1', control_type: 'technical' },
    ]
  },
  {
    code: 'fiscam', name: 'FISCAM', version: '2023',
    category: 'Financial Audit', tier_required: 'pro',
    description: 'Federal Information System Controls Audit Manual for financial statement audits.',
    controls: [
      { control_id: 'SM-1', title: 'Security Management - Program', description: 'Establish an information security program that aligns with organizational mission and objectives.', priority: '1', control_type: 'strategic' },
      { control_id: 'SM-2', title: 'Security Management - Risk Assessment', description: 'Conduct risk assessments to identify threats and vulnerabilities to financial information systems.', priority: '1', control_type: 'strategic' },
      { control_id: 'SM-3', title: 'Security Management - Policy', description: 'Develop and maintain information security policies consistent with federal requirements.', priority: '1', control_type: 'policy' },
      { control_id: 'SM-4', title: 'Security Management - Plan of Action', description: 'Develop and maintain a plan of action and milestones to address security weaknesses.', priority: '2', control_type: 'organizational' },
      { control_id: 'AC-FM-1', title: 'Access Control - User Accounts', description: 'Manage user accounts including creation, modification, disabling, and removal.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-FM-2', title: 'Access Control - Authorization', description: 'Establish and enforce authorization controls for system and data access.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-FM-3', title: 'Access Control - Authentication', description: 'Implement authentication mechanisms to verify user identities before granting access.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-FM-4', title: 'Access Control - Network Security', description: 'Implement network security controls to protect financial system communications.', priority: '1', control_type: 'technical' },
      { control_id: 'CC-1', title: 'Configuration Control - Software Changes', description: 'Control software changes through a formal change management process.', priority: '1', control_type: 'technical' },
      { control_id: 'CC-2', title: 'Configuration Control - Hardware/Software Config', description: 'Maintain and document hardware and software configurations for financial systems.', priority: '1', control_type: 'technical' },
      { control_id: 'SC-1', title: 'Segregation of Duties', description: 'Implement segregation of duties to prevent fraud and unauthorized modifications.', priority: '1', control_type: 'organizational' },
      { control_id: 'CP-FM-1', title: 'Contingency Planning', description: 'Develop and test contingency plans to ensure continuity of financial operations.', priority: '1', control_type: 'organizational' },
    ]
  },
  {
    code: 'nist_ai_rmf', name: 'NIST AI Risk Management Framework', version: '1.0',
    category: 'AI Governance', tier_required: 'community',
    description: 'AI risk management aligned with NIST 800-160 trustworthiness properties.',
    controls: [
      { control_id: 'GOVERN-1', title: 'AI Risk Management Policies', description: 'Policies reflecting risk management are defined, understood, and enforced for AI systems.', priority: '1', control_type: 'policy' },
      { control_id: 'GOVERN-2', title: 'AI Accountability Structure', description: 'Accountability structures for AI risk management are established and maintained.', priority: '1', control_type: 'organizational' },
      { control_id: 'GOVERN-3', title: 'AI Workforce Diversity', description: 'Workforce diversity and domain expertise are prioritized in AI design and deployment teams.', priority: '3', control_type: 'organizational' },
      { control_id: 'GOVERN-4', title: 'Organizational AI Risk Culture', description: 'A culture of risk management is cultivated throughout the organization for AI systems.', priority: '2', control_type: 'organizational' },
      { control_id: 'GOVERN-5', title: 'Third-Party AI Risk', description: 'Processes are in place to manage risks from third-party AI entities and supply chains.', priority: '2', control_type: 'strategic' },
      { control_id: 'GOVERN-6', title: 'AI Risk Reporting', description: 'AI risk reporting mechanisms provide timely and accurate information to decision-makers.', priority: '1', control_type: 'organizational' },
      { control_id: 'MAP-1', title: 'AI System Context Established', description: 'Context is established and understood for AI system design, development, and deployment.', priority: '1', control_type: 'strategic' },
      { control_id: 'MAP-2', title: 'AI Categorization and Classification', description: 'AI systems are categorized and classified based on their intended purpose and risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'MAP-3', title: 'AI Benefits and Costs Analyzed', description: 'AI system benefits and costs including societal impacts are analyzed and documented.', priority: '2', control_type: 'strategic' },
      { control_id: 'MAP-5', title: 'AI Impacts Assessed', description: 'Impacts to individuals, groups, communities, and the environment are assessed.', priority: '1', control_type: 'strategic' },
      { control_id: 'MEASURE-1', title: 'AI Risk Metrics Established', description: 'Appropriate methods and metrics are identified and applied to measure AI risks.', priority: '1', control_type: 'technical' },
      { control_id: 'MEASURE-2', title: 'AI System Evaluated', description: 'AI systems are evaluated for trustworthy characteristics using established metrics.', priority: '1', control_type: 'technical' },
      { control_id: 'MEASURE-3', title: 'AI System Monitored', description: 'AI systems are monitored for risks and performance throughout the lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'MEASURE-4', title: 'AI Feedback Incorporated', description: 'Feedback about AI system efficacy and impact is gathered and integrated into operations.', priority: '2', control_type: 'technical' },
      { control_id: 'MANAGE-1', title: 'AI Risk Treatment', description: 'AI risks based on assessments and other analytical output are treated and managed.', priority: '1', control_type: 'strategic' },
      { control_id: 'MANAGE-2', title: 'AI Risk Prioritization', description: 'Strategies to maximize AI benefits and minimize negative impacts are prioritized.', priority: '1', control_type: 'strategic' },
      { control_id: 'MANAGE-3', title: 'AI Risk Response', description: 'AI risk responses are developed and documented with clear assignment of responsibilities.', priority: '1', control_type: 'organizational' },
      { control_id: 'MANAGE-4', title: 'AI Risk Communication', description: 'Risk treatments including risk acceptance are communicated to relevant stakeholders.', priority: '2', control_type: 'organizational' },
    ]
  },

  // === PROFESSIONAL TIER ===
  {
    code: 'gdpr', name: 'GDPR', version: '2016/679',
    category: 'Privacy', tier_required: 'govcloud',
    description: 'EU General Data Protection Regulation requirements.',
    controls: [
      { control_id: 'GDPR-5', title: 'Principles of Processing', description: 'Personal data shall be processed lawfully, fairly, and transparently in relation to the data subject.', priority: '1', control_type: 'policy' },
      { control_id: 'GDPR-6', title: 'Lawfulness of Processing', description: 'Processing is lawful only if at least one legal basis applies such as consent or legitimate interest.', priority: '1', control_type: 'policy' },
      { control_id: 'GDPR-7', title: 'Conditions for Consent', description: 'Where processing is based on consent, the controller shall demonstrate the data subject consented.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-12', title: 'Transparent Communication', description: 'The controller shall facilitate the exercise of data subject rights with transparent communication.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-13', title: 'Information to Data Subject (Direct)', description: 'When personal data is collected from the data subject, the controller shall provide specified information.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-15', title: 'Right of Access', description: 'The data subject shall have the right to obtain confirmation of processing and access to personal data.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-17', title: 'Right to Erasure', description: 'The data subject shall have the right to obtain erasure of personal data without undue delay.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-20', title: 'Right to Data Portability', description: 'The data subject shall have the right to receive personal data in a structured, machine-readable format.', priority: '2', control_type: 'technical' },
      { control_id: 'GDPR-25', title: 'Data Protection by Design', description: 'The controller shall implement appropriate measures for data protection by design and by default.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-28', title: 'Processor Requirements', description: 'Processing by a processor shall be governed by a contract stipulating data protection obligations.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-30', title: 'Records of Processing Activities', description: 'Each controller shall maintain a record of processing activities under its responsibility.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-32', title: 'Security of Processing', description: 'The controller shall implement appropriate technical and organizational security measures.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-33', title: 'Breach Notification to Authority', description: 'The controller shall notify the supervisory authority of a personal data breach within 72 hours.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-34', title: 'Breach Notification to Data Subject', description: 'When a breach is likely to result in high risk, the controller shall notify the data subject.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-35', title: 'Data Protection Impact Assessment', description: 'Carry out a data protection impact assessment where processing is likely to result in high risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'GDPR-37', title: 'Data Protection Officer', description: 'The controller shall designate a data protection officer where required by regulation.', priority: '2', control_type: 'organizational' },
      { control_id: 'GDPR-44', title: 'International Transfers', description: 'Transfers of personal data to third countries shall only take place subject to appropriate safeguards.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
    code: 'hipaa', name: 'HIPAA Security Rule', version: '2024',
    category: 'Healthcare', tier_required: 'enterprise',
    description: 'Health Insurance Portability and Accountability Act security requirements.',
    controls: [
      { control_id: 'HIPAA-164.308(a)(1)', title: 'Security Management Process', description: 'Implement policies and procedures to prevent, detect, contain, and correct security violations.', priority: '1', control_type: 'strategic' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(2)', title: 'Assigned Security Responsibility', description: 'Identify the security official responsible for development and implementation of security policies.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(3)', title: 'Workforce Security', description: 'Implement policies and procedures to ensure appropriate access to ePHI by workforce members.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(4)', title: 'Information Access Management', description: 'Implement policies and procedures for authorizing access to ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(5)', title: 'Security Awareness and Training', description: 'Implement a security awareness and training program for all workforce members.', priority: '2', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(6)', title: 'Security Incident Procedures', description: 'Implement policies and procedures to address security incidents.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(7)', title: 'Contingency Plan', description: 'Establish policies and procedures for responding to emergencies that damage systems with ePHI.', priority: '1', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.308(a)(8)', title: 'Evaluation', description: 'Perform periodic technical and nontechnical evaluations of security policies and procedures.', priority: '2', control_type: 'organizational' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(a)(1)', title: 'Facility Access Controls', description: 'Implement policies to limit physical access to electronic information systems and facilities.', priority: '2', control_type: 'physical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(b)', title: 'Workstation Use', description: 'Implement policies and procedures specifying proper functions and physical attributes of workstations.', priority: '2', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(c)', title: 'Workstation Security', description: 'Implement physical safeguards for all workstations that access ePHI.', priority: '2', control_type: 'physical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.310(d)(1)', title: 'Device and Media Controls', description: 'Implement policies governing the receipt and removal of hardware and electronic media containing ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(a)(1)', title: 'Access Control', description: 'Implement technical policies and procedures to allow access only to authorized persons.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(b)', title: 'Audit Controls', description: 'Implement hardware, software, and procedural mechanisms to record and examine access to ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(c)(1)', title: 'Integrity', description: 'Implement policies and mechanisms to protect ePHI from improper alteration or destruction.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(d)', title: 'Person or Entity Authentication', description: 'Implement procedures to verify the identity of persons seeking access to ePHI.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'HIPAA-164.312(e)(1)', title: 'Transmission Security', description: 'Implement technical security measures to guard against unauthorized access to ePHI in transit.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
    ]
  },
  {
    code: 'hitech', name: 'HITECH Act', version: '2009',
    category: 'Healthcare', tier_required: 'enterprise',
    description: 'Health Information Technology for Economic and Clinical Health Act. Extends HIPAA enforcement, breach notification, and business associate requirements.', // ip-hygiene:ignore
    controls: [
      // Subtitle D — Privacy and Security of Electronic Health Information
      // Part 1 — Breach Notification (§13400–13410)
      { control_id: 'HITECH-13401', title: 'Unsecured PHI Breach Definition', description: 'Define what constitutes unsecured PHI and establish breach determination criteria.', priority: '1', control_type: 'policy' },
      { control_id: 'HITECH-13401d', title: 'Encryption and Destruction Safe Harbor', description: 'Apply encryption and destruction methods that render PHI unusable as a safe harbor from breach notification.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13402', title: 'Breach Notification to Individuals', description: 'Notify affected individuals without unreasonable delay following a breach of unsecured PHI.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13402d', title: 'Breach Notification Timeliness (60-Day Rule)', description: 'Provide breach notification within 60 days of discovery of the breach.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13402e', title: 'Substitute Breach Notification Methods', description: 'Establish substitute notification methods when direct contact information is insufficient.', priority: '2', control_type: 'organizational' },
      { control_id: 'HITECH-13403', title: 'Breach Notification to Secretary of HHS', description: 'Notify the Secretary of HHS of breaches of unsecured PHI as required by breach size thresholds.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13404', title: 'Breach Notification to Media', description: 'Notify prominent media outlets when a breach affects more than 500 residents of a state.', priority: '2', control_type: 'organizational' },
      { control_id: 'HITECH-13405', title: 'Content of Breach Notification', description: 'Include specified content elements in all breach notifications to individuals.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13407', title: 'Breach Risk Assessment (4-Factor Test)', description: 'Perform a risk assessment using four factors to determine if a breach notification is required.', priority: '1', control_type: 'strategic' },
      { control_id: 'HITECH-13408', title: 'Business Associate Breach Obligations', description: 'Business associates shall notify covered entities of breaches of unsecured PHI.', priority: '1', control_type: 'organizational' },
      // Part 2 — Business Associate and Enforcement (§13410–13424)
      { control_id: 'HITECH-13410', title: 'Business Associate HIPAA Compliance', description: 'Business associates are directly subject to HIPAA Security Rule requirements and penalties.', priority: '1', control_type: 'policy' }, // ip-hygiene:ignore
      { control_id: 'HITECH-13410e', title: 'Electronic Health Record Audit Controls', description: 'Implement audit controls for electronic health record technology to track access and modifications.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13411', title: 'Subcontractor Business Associate Requirements', description: 'Extend business associate agreement requirements to subcontractors handling PHI.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13405a', title: 'Individual Access to Electronic PHI', description: 'Provide individuals with electronic access to their PHI in electronic health records.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13405b', title: 'Individual Access Fee Limitations', description: 'Limit fees charged to individuals for copies of their PHI to reasonable cost-based amounts.', priority: '2', control_type: 'policy' },
      { control_id: 'HITECH-13421', title: 'Increased Civil Monetary Penalties', description: 'Apply increased civil monetary penalties for HIPAA violations based on the level of negligence.', priority: '1', control_type: 'policy' }, // ip-hygiene:ignore
      { control_id: 'HITECH-13422', title: 'Tiered Penalty Structure', description: 'Apply a tiered penalty structure based on the nature and extent of the violation.', priority: '2', control_type: 'policy' },
      { control_id: 'HITECH-13424', title: 'State Attorney General Enforcement', description: 'State attorneys general may bring civil actions on behalf of residents for HIPAA violations.', priority: '2', control_type: 'policy' }, // ip-hygiene:ignore
      // Strengthened Privacy Provisions
      { control_id: 'HITECH-13405c', title: 'Accounting of Disclosures for EHR', description: 'Provide an accounting of disclosures made through an electronic health record.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13406', title: 'Marketing Authorization and Restrictions', description: 'Require written authorization before using PHI for marketing and prohibit remuneration for referrals.', priority: '1', control_type: 'policy' },
      { control_id: 'HITECH-13406a', title: 'Prohibition on Sale of PHI', description: 'Prohibit the sale of PHI without written authorization from the individual.', priority: '1', control_type: 'policy' },
      { control_id: 'HITECH-13405d', title: 'Right to Request Restriction on Disclosures', description: 'Honor individual requests to restrict disclosures of PHI to health plans for self-paid services.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13405e', title: 'Minimum Necessary Standard Enforcement', description: 'Enforce the minimum necessary standard limiting PHI use, disclosure, and requests.', priority: '1', control_type: 'policy' },
      // Vulnerability Management and Technical Safeguards
      { control_id: 'HITECH-13412', title: 'EHR Technology Security Certification', description: 'Ensure electronic health record technology meets security certification standards.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412a', title: 'EHR Vulnerability Assessment and Patching', description: 'Conduct vulnerability assessments and apply patches to EHR systems in a timely manner.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412b', title: 'EHR Encryption at Rest and in Transit', description: 'Encrypt ePHI at rest and in transit within electronic health record systems.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412c', title: 'EHR Access Logging and Monitoring', description: 'Implement access logging and monitoring for electronic health record systems.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412d', title: 'EHR Integrity Verification Controls', description: 'Implement integrity verification controls to detect unauthorized EHR modifications.', priority: '1', control_type: 'technical' },
    ]
  },
  {
    code: 'ffiec', name: 'FFIEC IT Examination Handbook', version: '2024',
    category: 'Financial', tier_required: 'enterprise',
    description: 'Federal Financial Institutions Examination Council IT standards.',
    controls: [
      { control_id: 'FFIEC-AUD-1', title: 'Audit Program', description: 'Establish an IT audit program that provides independent assurance of IT risk management.', priority: '1', control_type: 'organizational' },
      { control_id: 'FFIEC-AUD-2', title: 'Audit Independence', description: 'Ensure IT audit functions maintain independence from IT management and operations.', priority: '2', control_type: 'organizational' },
      { control_id: 'FFIEC-IS-1', title: 'Information Security Program', description: 'Develop and implement an enterprise-wide information security program.', priority: '1', control_type: 'strategic' },
      { control_id: 'FFIEC-IS-2', title: 'Risk Assessment', description: 'Conduct risk assessments to identify threats to institution information assets.', priority: '1', control_type: 'strategic' },
      { control_id: 'FFIEC-IS-3', title: 'Security Controls', description: 'Implement security controls commensurate with the risk profile of the institution.', priority: '1', control_type: 'technical' },
      { control_id: 'FFIEC-BCP-1', title: 'Business Continuity Planning', description: 'Develop and maintain a business continuity plan that addresses technology recovery.', priority: '1', control_type: 'organizational' },
      { control_id: 'FFIEC-BCP-2', title: 'BCP Testing', description: 'Test business continuity plans periodically and update based on results.', priority: '2', control_type: 'organizational' },
      { control_id: 'FFIEC-OPS-1', title: 'IT Operations', description: 'Implement IT operations processes that ensure availability and reliability of systems.', priority: '1', control_type: 'technical' },
      { control_id: 'FFIEC-OPS-2', title: 'Change Management', description: 'Establish change management processes to control modifications to IT systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'FFIEC-AM-1', title: 'Authentication and Access', description: 'Implement authentication and access controls commensurate with the risk of the transaction.', priority: '1', control_type: 'technical' },
      { control_id: 'FFIEC-CYB-1', title: 'Cybersecurity Assessment', description: 'Perform ongoing cybersecurity assessments and maintain an inherent risk profile.', priority: '1', control_type: 'strategic' },
      { control_id: 'FFIEC-CYB-2', title: 'Threat Intelligence', description: 'Gather and analyze threat intelligence to support proactive cybersecurity measures.', priority: '2', control_type: 'technical' },
    ]
  },
  {
    code: 'nerc_cip', name: 'NERC CIP', version: '2024',
    category: 'Critical Infrastructure', tier_required: 'govcloud',
    description: 'North American Electric Reliability Corporation Critical Infrastructure Protection.',
    controls: [
      { control_id: 'CIP-002-6', title: 'BES Cyber System Categorization', description: 'Identify and categorize BES Cyber Systems by their impact on the reliable operation of the BES.', priority: '1', control_type: 'strategic' },
      { control_id: 'CIP-003-9', title: 'Security Management Controls', description: 'Specify consistent and sustainable security management controls for BES Cyber Systems.', priority: '1', control_type: 'policy' },
      { control_id: 'CIP-004-7', title: 'Personnel and Training', description: 'Require personnel risk assessments, training, and access management for BES Cyber Systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'CIP-005-7', title: 'Electronic Security Perimeter', description: 'Manage electronic access to BES Cyber Systems by specifying a controlled Electronic Security Perimeter.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-006-6', title: 'Physical Security', description: 'Manage physical access to BES Cyber Systems through defined Physical Security Plans.', priority: '1', control_type: 'physical' },
      { control_id: 'CIP-007-6', title: 'System Security Management', description: 'Manage system security by specifying security patch management, malware prevention, and logging.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-008-6', title: 'Incident Reporting and Response', description: 'Specify incident reporting and response planning requirements for BES Cyber Systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'CIP-009-6', title: 'Recovery Plans', description: 'Ensure recovery plan specifications for BES Cyber Systems following qualifying events.', priority: '1', control_type: 'organizational' },
      { control_id: 'CIP-010-4', title: 'Configuration Change Management', description: 'Prevent and detect unauthorized changes to BES Cyber Systems through configuration management.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-011-3', title: 'Information Protection', description: 'Prevent unauthorized access to BES Cyber System Information through information protection.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-013-2', title: 'Supply Chain Risk Management', description: 'Mitigate cybersecurity risks to BES Cyber Systems from supply chain compromise.', priority: '1', control_type: 'strategic' },
      { control_id: 'CIP-014-3', title: 'Physical Security', description: 'Identify and protect Transmission stations and substations from physical attack.', priority: '2', control_type: 'physical' },
    ]
  },

  // === UTILITIES TIER — FINANCIAL SERVICES AI GOVERNANCE PACK ===
  {
    code: 'finra_supervisory_ai', name: 'FINRA Supervisory Controls for AI (Notice 24-09)', version: '2024',
    category: 'Financial Services AI Governance', tier_required: 'govcloud',
    description: 'FINRA Regulatory Notice 24-09 supervisory obligations for AI-generated communications, robo-advisory outputs, and algorithmic trading surveillance.',
    controls: [
      { control_id: 'FINRA-SUP-1', title: 'AI Supervisory Framework', description: 'Establish a supervisory framework for the oversight and governance of AI-driven activities.', priority: '1', control_type: 'policy' },
      { control_id: 'FINRA-SUP-2', title: 'Suitability and Best Interest Alignment', description: 'Ensure AI outputs align with suitability and Regulation Best Interest obligations.', priority: '1', control_type: 'technical' },
      { control_id: 'FINRA-SUP-3', title: 'AI-Generated Communications Review', description: 'Review AI-generated communications to ensure compliance with FINRA content standards.', priority: '1', control_type: 'organizational' },
      { control_id: 'FINRA-SUP-4', title: 'Algorithmic Trading Surveillance', description: 'Monitor algorithmic trading activities for potential market manipulation and anomalies.', priority: '1', control_type: 'technical' },
      { control_id: 'FINRA-SUP-5', title: 'Third-Party AI Vendor Due Diligence', description: 'Conduct due diligence on third-party AI vendors to assess risks and regulatory compliance.', priority: '1', control_type: 'strategic' },
      { control_id: 'FINRA-SUP-6', title: 'AI Incident Response and Escalation', description: 'Establish incident response and escalation procedures for AI-related failures or anomalies.', priority: '1', control_type: 'organizational' },
      { control_id: 'FINRA-SUP-7', title: 'AI Training and Competency', description: 'Provide training to supervisory personnel on AI capabilities, limitations, and risks.', priority: '2', control_type: 'organizational' },
      { control_id: 'FINRA-SUP-8', title: 'Bias and Fairness Testing', description: 'Test AI models for bias and fairness to prevent discriminatory outcomes in financial services.', priority: '1', control_type: 'technical' },
      { control_id: 'FINRA-SUP-9', title: 'AI Model Change Management', description: 'Manage changes to AI models through a formal review and approval process.', priority: '2', control_type: 'technical' },
      { control_id: 'FINRA-SUP-10', title: 'Audit Trail and Recordkeeping', description: 'Maintain audit trails and records for AI-generated decisions and recommendations.', priority: '1', control_type: 'technical' },
    ]
  },
  {
    code: 'sec_markets_ai_risk', name: 'SEC AI Risk Management for RIAs & Broker-Dealers', version: '2024',
    category: 'Financial Services AI Governance', tier_required: 'govcloud',
    description: 'SEC guidance on conflicts-of-interest, fiduciary duty, and explainability requirements for AI-driven investment advice and automated compliance programmes.',
    controls: [
      { control_id: 'SEC-AI-1', title: 'Conflicts of Interest Disclosure', description: 'Identify and disclose conflicts of interest arising from the use of AI in investment advice.', priority: '1', control_type: 'organizational' },
      { control_id: 'SEC-AI-2', title: 'Fiduciary Duty and Explainability', description: 'Ensure AI-driven advice meets fiduciary duty requirements with explainable recommendations.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-3', title: 'Robo-Advisory Risk Assessment', description: 'Assess and manage risks specific to robo-advisory services and automated investment platforms.', priority: '1', control_type: 'strategic' },
      { control_id: 'SEC-AI-4', title: 'Cybersecurity and Data Privacy', description: 'Implement cybersecurity and data privacy protections for AI systems handling client data.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-5', title: 'AI Model Governance Policy', description: 'Establish an AI model governance policy covering development, validation, and deployment.', priority: '1', control_type: 'policy' },
      { control_id: 'SEC-AI-6', title: 'Customer Disclosure and Consent', description: 'Provide clear disclosure and obtain consent from customers regarding AI-driven services.', priority: '1', control_type: 'organizational' },
      { control_id: 'SEC-AI-7', title: 'Human Oversight and Override', description: 'Ensure human oversight and the ability to override AI-driven decisions when necessary.', priority: '1', control_type: 'organizational' },
      { control_id: 'SEC-AI-8', title: 'Periodic Model Validation', description: 'Conduct periodic validation of AI models to ensure continued accuracy and compliance.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-9', title: 'Books and Records Retention', description: 'Maintain books and records related to AI model inputs, outputs, and decision rationale.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-10', title: 'Systemic Risk Monitoring', description: 'Monitor AI systems for potential systemic risks to market stability and investor protection.', priority: '2', control_type: 'strategic' },
    ]
  },
  {
    code: 'sr_11_7', name: 'SR 11-7 Model Risk Management', version: '2011-Rev2024',
    category: 'Financial Services AI Governance', tier_required: 'govcloud',
    description: 'Federal Reserve / OCC Supervisory Guidance SR 11-7 on Model Risk Management covering model development, validation, governance, and ongoing monitoring for AI-driven decision-making.',
    controls: [
      { control_id: 'SR117-I-1', title: 'Model Inventory', description: 'Maintain a comprehensive inventory of all models used across the organization.', priority: '1', control_type: 'organizational' },
      { control_id: 'SR117-I-2', title: 'Model Risk Tiering', description: 'Tier models based on materiality, complexity, and potential risk impact.', priority: '1', control_type: 'strategic' },
      { control_id: 'SR117-D-1', title: 'Model Development Standards', description: 'Establish sound model development practices including data quality and methodology standards.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-D-2', title: 'Model Documentation', description: 'Maintain thorough documentation of model design, methodology, assumptions, and limitations.', priority: '1', control_type: 'organizational' },
      { control_id: 'SR117-V-1', title: 'Independent Model Validation', description: 'Conduct independent model validation to evaluate conceptual soundness and performance.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-V-2', title: 'Conceptual Soundness Review', description: 'Review the theoretical basis and assumptions underlying each model for conceptual soundness.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-V-3', title: 'Outcomes Analysis', description: 'Analyze model outcomes against actual results to assess ongoing performance.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-G-1', title: 'Model Risk Policy', description: 'Establish a model risk management policy approved by the board of directors.', priority: '1', control_type: 'policy' },
      { control_id: 'SR117-G-2', title: 'Model Risk Appetite', description: 'Define the organization\'s appetite for model risk and acceptable risk thresholds.', priority: '1', control_type: 'strategic' },
      { control_id: 'SR117-G-3', title: 'Model Risk Reporting', description: 'Report model risk exposure and validation findings to senior management and the board.', priority: '1', control_type: 'organizational' },
      { control_id: 'SR117-G-4', title: 'Ongoing Monitoring', description: 'Continuously monitor model performance and emerging risks throughout the model lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-G-5', title: 'Model Change Management', description: 'Implement a formal change management process for model modifications and updates.', priority: '2', control_type: 'technical' },
      { control_id: 'SR117-G-6', title: 'Vendor Model Oversight', description: 'Exercise appropriate oversight of vendor-supplied models including validation requirements.', priority: '1', control_type: 'strategic' },
      { control_id: 'SR117-G-7', title: 'Model Retirement', description: 'Establish criteria and procedures for the orderly retirement and replacement of models.', priority: '3', control_type: 'organizational' },
    ]
  },

  // === ENTERPRISE TIER ===
  {
    code: 'eu_ai_act', name: 'EU AI Act', version: '2024',
    category: 'AI Governance', tier_required: 'govcloud',
    description: 'European Union Artificial Intelligence Act. Full lifecycle governance per NIST 800-160.',
    controls: [
      { control_id: 'AIA-Art6', title: 'Classification Rules for High-Risk AI', description: 'Classify AI systems as high-risk based on their intended purpose and potential impact.', priority: '1', control_type: 'strategic' },
      { control_id: 'AIA-Art9', title: 'Risk Management System', description: 'Establish and implement a risk management system throughout the AI system lifecycle.', priority: '1', control_type: 'strategic' },
      { control_id: 'AIA-Art10', title: 'Data and Data Governance', description: 'Ensure training, validation, and testing data sets meet quality criteria and governance practices.', priority: '1', control_type: 'technical' },
      { control_id: 'AIA-Art11', title: 'Technical Documentation', description: 'Prepare technical documentation demonstrating compliance before an AI system is placed on the market.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art12', title: 'Record Keeping / Logging', description: 'Enable automatic recording of events (logging) throughout the AI system lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'AIA-Art13', title: 'Transparency and Information', description: 'Design high-risk AI systems to be sufficiently transparent to enable users to interpret output.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art14', title: 'Human Oversight', description: 'Design high-risk AI systems to be effectively overseen by natural persons during use.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art15', title: 'Accuracy, Robustness, Cybersecurity', description: 'Ensure high-risk AI systems achieve appropriate levels of accuracy, robustness, and cybersecurity.', priority: '1', control_type: 'technical' },
      { control_id: 'AIA-Art17', title: 'Quality Management System', description: 'Put in place a quality management system to ensure compliance with the AI Act.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art22', title: 'Authorized Representative Obligations', description: 'Authorized representatives shall perform tasks specified in the mandate from the provider.', priority: '3', control_type: 'organizational' },
      { control_id: 'AIA-Art26', title: 'Deployer Obligations', description: 'Deployers of high-risk AI systems shall use such systems in accordance with instructions.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art27', title: 'Fundamental Rights Impact Assessment', description: 'Perform a fundamental rights impact assessment before deploying high-risk AI systems.', priority: '1', control_type: 'strategic' },
      { control_id: 'AIA-Art50', title: 'Transparency for Generative AI', description: 'Providers of generative AI shall ensure transparency about AI-generated content.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art52', title: 'Prohibited AI Practices', description: 'Certain AI practices that create unacceptable risk are prohibited within the EU.', priority: '1', control_type: 'policy' },
      { control_id: 'AIA-Art72', title: 'Penalties for Non-Compliance', description: 'Non-compliance with the AI Act may result in administrative fines up to 35 million EUR or 7% of turnover.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
    code: 'iso_42001', name: 'ISO/IEC 42001:2023', version: '2023',
    category: 'AI Governance', tier_required: 'enterprise',
    framework_group: 'iso_ai',
    description: 'AI Management System standard. Lifecycle-aligned per NIST 800-160.',
    controls: [
      { control_id: 'ISO42-4.1', title: 'Understanding the Organization', description: 'Determine external and internal issues relevant to the organization\'s AI management system.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-4.2', title: 'Needs and Expectations of Interested Parties', description: 'Determine the needs and expectations of interested parties relevant to the AI management system.', priority: '2', control_type: 'strategic' },
      { control_id: 'ISO42-5.1', title: 'Leadership and Commitment', description: 'Top management shall demonstrate leadership and commitment to the AI management system.', priority: '1', control_type: 'organizational' },
      { control_id: 'ISO42-5.2', title: 'AI Policy', description: 'Establish an AI policy appropriate to the purpose of the organization.', priority: '1', control_type: 'policy' },
      { control_id: 'ISO42-6.1', title: 'Actions to Address AI Risks', description: 'Plan actions to address AI-related risks and opportunities.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-6.2', title: 'AI Objectives and Planning', description: 'Establish AI objectives at relevant functions and levels and plan how to achieve them.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-7.1', title: 'Resources for AI Management', description: 'Determine and provide resources needed for the AI management system.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-7.2', title: 'AI Competence', description: 'Ensure persons doing work under the AI management system are competent.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-8.1', title: 'Operational Planning and Control', description: 'Plan, implement, and control processes needed to meet AI management system requirements.', priority: '1', control_type: 'technical' },
      { control_id: 'ISO42-8.2', title: 'AI Risk Assessment', description: 'Perform AI risk assessments at planned intervals or when significant changes occur.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-8.3', title: 'AI Risk Treatment', description: 'Select and implement AI risk treatment options and prepare a risk treatment plan.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-8.4', title: 'AI Impact Assessment', description: 'Conduct AI system impact assessments to evaluate effects on individuals and society.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-9.1', title: 'Monitoring and Measurement', description: 'Determine what needs to be monitored and measured for AI management system effectiveness.', priority: '1', control_type: 'technical' },
      { control_id: 'ISO42-9.2', title: 'Internal Audit', description: 'Conduct internal audits at planned intervals to verify AI management system conformity.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-10.1', title: 'Nonconformity and Corrective Action', description: 'React to nonconformities by taking corrective action and dealing with consequences.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-10.2', title: 'Continual Improvement', description: 'Continually improve the suitability, adequacy, and effectiveness of the AI management system.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
    code: 'iso_42005', name: 'ISO/IEC 42005:2025', version: '2025',
    category: 'AI Governance', tier_required: 'enterprise',
    framework_group: 'iso_ai',
    description: 'AI system impact assessment guidance. Plan, document, and monitor AI impact assessments across the AI system lifecycle.',
    controls: [
      { control_id: 'IA-1', title: 'Impact Assessment Scope & Objectives', description: 'Define the scope, objectives, and boundaries of the AI system impact assessment.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-2', title: 'Stakeholders & Impacted Parties Identified', description: 'Identify all stakeholders and parties potentially impacted by the AI system.', priority: '1', control_type: 'organizational' },
      { control_id: 'IA-3', title: 'AI System Description & Context', description: 'Document the AI system description, intended purpose, and operational context.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-4', title: 'Data, Model, and Human Oversight Inputs', description: 'Identify data sources, model characteristics, and human oversight inputs for impact analysis.', priority: '1', control_type: 'technical' },
      { control_id: 'IA-5', title: 'Impact Identification (Safety, Fairness, Privacy, Security)', description: 'Identify potential impacts across safety, fairness, privacy, security, and societal dimensions.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-6', title: 'Impact Evaluation & Risk Rating', description: 'Evaluate identified impacts and assign risk ratings based on severity and likelihood.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-7', title: 'Mitigations & Controls Plan', description: 'Develop a plan of mitigations and controls to address identified AI impacts.', priority: '1', control_type: 'policy' },
      { control_id: 'IA-8', title: 'Documentation, Traceability & Accountability', description: 'Maintain documentation ensuring traceability, accountability, and reproducibility of the assessment.', priority: '2', control_type: 'organizational' },
      { control_id: 'IA-9', title: 'Communication & Transparency', description: 'Communicate impact assessment results transparently to relevant stakeholders.', priority: '2', control_type: 'policy' },
      { control_id: 'IA-10', title: 'Monitoring & Lifecycle Updates', description: 'Monitor AI system impacts and update the assessment throughout the system lifecycle.', priority: '2', control_type: 'technical' },
    ]
  },
  {
    code: AIUC1_FRAMEWORK.code, name: AIUC1_FRAMEWORK.name, version: AIUC1_FRAMEWORK.version,
    category: AIUC1_FRAMEWORK.category, tier_required: AIUC1_FRAMEWORK.tier_required,
    framework_group: AIUC1_FRAMEWORK.framework_group,
    description: AIUC1_FRAMEWORK.description,
    controls: AIUC1_SHARED_CONTROLS
  },
  {
    code: 'iso_27002', name: 'ISO/IEC 27002:2022', version: '2022',
    category: 'Information Security', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Information security controls guidance. Companion to ISO 27001 providing detailed implementation guidance for Annex A controls.', // ip-hygiene:ignore
    controls: [
      { control_id: 'AC-1', title: 'Access control management', description: 'Implement access control management policies and processes based on business requirements.', priority: '1', control_type: 'technical' },
      { control_id: 'CR-1', title: 'Cryptographic controls', description: 'Ensure proper and effective use of cryptography to protect confidentiality and integrity.', priority: '1', control_type: 'technical' },
      { control_id: 'PS-1', title: 'Physical security controls', description: 'Prevent unauthorized physical access, damage, and interference to information facilities.', priority: '1', control_type: 'physical' },
      { control_id: 'OS-1', title: 'Operations security monitoring', description: 'Ensure correct and secure operations of information processing facilities.', priority: '1', control_type: 'technical' },
      { control_id: 'CS-1', title: 'Communications security', description: 'Ensure the protection of information in networks and supporting information transfer facilities.', priority: '1', control_type: 'technical' },
      { control_id: 'SD-1', title: 'System acquisition and development', description: 'Ensure information security is designed and implemented within the development lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'SR-1', title: 'Supplier relationship security', description: 'Ensure protection of the organization\'s assets accessible by suppliers.', priority: '1', control_type: 'organizational' },
      { control_id: 'IM-1', title: 'Information security incident management', description: 'Ensure a consistent approach to managing information security incidents.', priority: '1', control_type: 'organizational' },
      { control_id: 'BC-1', title: 'Business continuity management', description: 'Embed information security continuity in the organization\'s business continuity systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'CL-1', title: 'Compliance with legal requirements', description: 'Avoid breaches of legal, statutory, regulatory, or contractual obligations.', priority: '1', control_type: 'policy' },
      { control_id: 'IP-1', title: 'Information security policies', description: 'Provide management direction and support for information security in accordance with requirements.', priority: '1', control_type: 'policy' },
      { control_id: 'HR-1', title: 'Human resource security', description: 'Ensure employees and contractors understand their information security responsibilities.', priority: '1', control_type: 'organizational' },
      { control_id: 'AM-1', title: 'Asset management controls', description: 'Identify organizational assets and define appropriate protection responsibilities.', priority: '1', control_type: 'organizational' },
      { control_id: 'ID-1', title: 'Identity management', description: 'Ensure authorized user access and prevent unauthorized access to systems and services.', priority: '1', control_type: 'technical' },
      { control_id: 'TI-1', title: 'Threat intelligence', description: 'Collect and analyze threat intelligence to support proactive security decisions.', priority: '2', control_type: 'technical' },
    ]
  },
  {
    code: 'iso_27005', name: 'ISO/IEC 27005:2022', version: '2022',
    category: 'Information Security', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Information security risk management. Provides guidelines for risk assessment and treatment aligned with ISO 27001 requirements.', // ip-hygiene:ignore
    controls: [
      { control_id: 'RC-1', title: 'Risk context establishment', description: 'Establish the external and internal context for information security risk management.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-1', title: 'Information asset identification', description: 'Identify information assets, their owners, and their value to the organization.', priority: '1', control_type: 'organizational' },
      { control_id: 'TH-1', title: 'Threat identification and assessment', description: 'Identify and assess threats that could exploit vulnerabilities in information assets.', priority: '1', control_type: 'strategic' },
      { control_id: 'VI-1', title: 'Vulnerability identification', description: 'Identify vulnerabilities that could be exploited by identified threats.', priority: '1', control_type: 'technical' },
      { control_id: 'RA-1', title: 'Risk analysis methodology', description: 'Define and apply a systematic risk analysis methodology for evaluating identified risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'RE-1', title: 'Risk evaluation criteria', description: 'Establish criteria for evaluating the significance of identified information security risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'RT-1', title: 'Risk treatment options', description: 'Select appropriate risk treatment options: modify, retain, avoid, or share risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'RAC-1', title: 'Risk acceptance criteria', description: 'Define criteria for accepting residual risks based on organizational risk appetite.', priority: '1', control_type: 'policy' },
      { control_id: 'RCP-1', title: 'Risk communication plan', description: 'Establish a plan for communicating risk information to relevant stakeholders.', priority: '2', control_type: 'organizational' },
      { control_id: 'RM-1', title: 'Risk monitoring and review', description: 'Monitor and review risks and the effectiveness of risk treatment on an ongoing basis.', priority: '1', control_type: 'organizational' },
      { control_id: 'RD-1', title: 'Residual risk documentation', description: 'Document residual risks and obtain formal acceptance from risk owners.', priority: '2', control_type: 'organizational' },
      { control_id: 'RAI-1', title: 'Risk assessment iteration', description: 'Iterate the risk assessment process to capture changes in the risk environment.', priority: '2', control_type: 'strategic' },
    ]
  },
  {
    code: 'iso_27017', name: 'ISO/IEC 27017:2015', version: '2015',
    category: 'Cloud Security', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Cloud security controls. Provides guidelines for information security controls applicable to cloud services based on ISO 27002.', // ip-hygiene:ignore
    controls: [
      { control_id: 'CSR-1', title: 'Cloud shared responsibility model', description: 'Define and document the shared responsibility model between cloud provider and customer.', priority: '1', control_type: 'strategic' },
      { control_id: 'CDP-1', title: 'Cloud service customer data protection', description: 'Implement data protection controls appropriate for cloud-hosted customer data.', priority: '1', control_type: 'technical' },
      { control_id: 'VM-1', title: 'Virtual machine security', description: 'Implement security controls for virtual machine isolation, hardening, and lifecycle management.', priority: '1', control_type: 'technical' },
      { control_id: 'CNS-1', title: 'Cloud network security isolation', description: 'Implement network segmentation and isolation controls within cloud environments.', priority: '1', control_type: 'technical' },
      { control_id: 'CAC-1', title: 'Cloud administrator access control', description: 'Restrict and manage cloud administrator access with strong authentication and monitoring.', priority: '1', control_type: 'technical' },
      { control_id: 'CML-1', title: 'Cloud service monitoring and logging', description: 'Implement monitoring and logging for cloud service activities and access events.', priority: '1', control_type: 'technical' },
      { control_id: 'CDL-1', title: 'Cloud data location and jurisdiction', description: 'Document and enforce policies regarding the physical location and jurisdiction of cloud data.', priority: '1', control_type: 'policy' },
      { control_id: 'CSP-1', title: 'Cloud service portability', description: 'Establish procedures for cloud service portability and migration of data between providers.', priority: '2', control_type: 'organizational' },
      { control_id: 'CIM-1', title: 'Cloud incident management', description: 'Establish cloud-specific incident management procedures including provider notification.', priority: '1', control_type: 'organizational' },
      { control_id: 'VSM-1', title: 'Virtualization security management', description: 'Manage the security of virtualization infrastructure and hypervisor configurations.', priority: '1', control_type: 'technical' },
      { control_id: 'CSA-1', title: 'Cloud service agreement security', description: 'Establish cloud service agreements that address security responsibilities and requirements.', priority: '1', control_type: 'policy' },
      { control_id: 'CDR-1', title: 'Cloud decommissioning and data removal', description: 'Ensure secure decommissioning and complete removal of data when exiting cloud services.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
    code: 'iso_27018', name: 'ISO/IEC 27018:2019', version: '2019',
    category: 'Privacy', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'PII protection in public cloud. Code of practice for protection of personally identifiable information in public cloud environments.', // ip-hygiene:ignore
    controls: [
      { control_id: 'PC-1', title: 'PII processor consent and purpose limitation', description: 'Process PII only for the purposes specified by the cloud service customer.', priority: '1', control_type: 'policy' },
      { control_id: 'PD-1', title: 'PII data subject rights', description: 'Enable data subjects to exercise their rights regarding their PII in the cloud.', priority: '1', control_type: 'organizational' },
      { control_id: 'PT-1', title: 'PII transparency and notification', description: 'Provide transparent notification about PII processing activities and purposes.', priority: '1', control_type: 'organizational' },
      { control_id: 'PL-1', title: 'PII processing limitation', description: 'Limit PII processing to what is necessary for the specified and legitimate purposes.', priority: '1', control_type: 'policy' },
      { control_id: 'CT-1', title: 'PII cross-border transfer controls', description: 'Implement controls for cross-border transfer of PII in cloud environments.', priority: '1', control_type: 'policy' },
      { control_id: 'SP-1', title: 'PII sub-processor management', description: 'Manage and oversee sub-processors that handle PII on behalf of the cloud processor.', priority: '1', control_type: 'organizational' },
      { control_id: 'PB-1', title: 'PII breach notification', description: 'Notify the cloud service customer of any PII breach in a timely manner.', priority: '1', control_type: 'organizational' },
      { control_id: 'PR-1', title: 'PII retention and disposal', description: 'Implement PII retention and secure disposal policies for cloud-processed data.', priority: '1', control_type: 'organizational' },
      { control_id: 'PE-1', title: 'PII encryption and pseudonymization', description: 'Apply encryption and pseudonymization techniques to protect PII in cloud environments.', priority: '1', control_type: 'technical' },
      { control_id: 'PA-1', title: 'PII access logging and monitoring', description: 'Log and monitor access to PII within cloud services for accountability.', priority: '1', control_type: 'technical' },
      { control_id: 'PV-1', title: 'PII processor compliance verification', description: 'Enable verification of cloud PII processor compliance through audits and attestations.', priority: '1', control_type: 'organizational' },
    ]
  },
  {
    code: 'iso_27701', name: 'ISO/IEC 27701:2019', version: '2019',
    category: 'Privacy', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Privacy information management system (PIMS). Extension to ISO 27001 and ISO 27002 for privacy information management.', // ip-hygiene:ignore
    controls: [
      { control_id: 'PG-1', title: 'Privacy governance and accountability', description: 'Establish privacy governance and accountability structures within the organization.', priority: '1', control_type: 'strategic' },
      { control_id: 'PRA-1', title: 'Privacy risk assessment', description: 'Conduct privacy risk assessments to identify and evaluate privacy risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'PBD-1', title: 'Privacy by design integration', description: 'Integrate privacy by design principles into systems and processes from the outset.', priority: '1', control_type: 'strategic' },
      { control_id: 'DSR-1', title: 'Data subject rights management', description: 'Implement processes to manage data subject rights requests effectively.', priority: '1', control_type: 'organizational' },
      { control_id: 'PNT-1', title: 'Privacy notice and transparency', description: 'Provide clear and accessible privacy notices to individuals about data processing.', priority: '1', control_type: 'organizational' },
      { control_id: 'CMF-1', title: 'Consent management framework', description: 'Establish a framework for obtaining, recording, and managing consent.', priority: '1', control_type: 'organizational' },
      { control_id: 'DPR-1', title: 'Data processing records', description: 'Maintain records of data processing activities as required by applicable regulations.', priority: '1', control_type: 'organizational' },
      { control_id: 'PIA-1', title: 'Privacy impact assessment', description: 'Conduct privacy impact assessments for new or changed processing activities.', priority: '1', control_type: 'strategic' },
      { control_id: 'CBT-1', title: 'Cross-border data transfer safeguards', description: 'Implement safeguards for cross-border transfers of personal data.', priority: '1', control_type: 'policy' },
      { control_id: 'PIR-1', title: 'Privacy incident response', description: 'Establish incident response procedures specific to privacy breaches.', priority: '1', control_type: 'organizational' },
      { control_id: 'TPA-1', title: 'Third-party privacy assurance', description: 'Obtain assurance from third parties regarding their privacy practices and compliance.', priority: '1', control_type: 'organizational' },
      { control_id: 'PTA-1', title: 'Privacy training and awareness', description: 'Provide privacy training and awareness programs to all relevant personnel.', priority: '2', control_type: 'organizational' },
      { control_id: 'DRE-1', title: 'Data retention and erasure governance', description: 'Establish governance for data retention periods and secure erasure procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'PAC-1', title: 'Privacy audit and continuous improvement', description: 'Conduct privacy audits and drive continuous improvement of the privacy program.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
    code: 'iso_31000', name: 'ISO 31000:2018', version: '2018',
    category: 'Risk Management', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Risk management principles and guidelines. Provides a framework for managing risk across all organizational activities.', // ip-hygiene:ignore
    controls: [
      { control_id: 'RMF-1', title: 'Risk management framework establishment', description: 'Establish a risk management framework that integrates into organizational governance.', priority: '1', control_type: 'strategic' },
      { control_id: 'LCR-1', title: 'Leadership commitment to risk management', description: 'Ensure leadership commitment to embedding risk management into all organizational activities.', priority: '1', control_type: 'organizational' },
      { control_id: 'RMP-1', title: 'Risk management policy', description: 'Define a risk management policy that articulates the organization\'s risk management commitment.', priority: '1', control_type: 'policy' },
      { control_id: 'RAP-1', title: 'Risk assessment process design', description: 'Design a systematic risk assessment process covering identification, analysis, and evaluation.', priority: '1', control_type: 'strategic' },
      { control_id: 'RIT-1', title: 'Risk identification techniques', description: 'Apply comprehensive risk identification techniques to uncover sources of risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'RAE-1', title: 'Risk analysis and evaluation', description: 'Analyze and evaluate risks to determine their nature, likelihood, and level of impact.', priority: '1', control_type: 'strategic' },
      { control_id: 'RTP-1', title: 'Risk treatment planning and implementation', description: 'Plan and implement risk treatment options to modify, share, avoid, or retain risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'RMC-1', title: 'Risk monitoring and continuous improvement', description: 'Monitor and review the risk management framework and its outcomes for continuous improvement.', priority: '1', control_type: 'organizational' },
      { control_id: 'RCC-1', title: 'Risk communication and consultation', description: 'Communicate and consult with stakeholders throughout the risk management process.', priority: '2', control_type: 'organizational' },
      { control_id: 'RMI-1', title: 'Risk management integration across processes', description: 'Integrate risk management into all organizational processes, governance, and decision-making.', priority: '1', control_type: 'organizational' },
      { control_id: 'RCB-1', title: 'Risk culture and capability building', description: 'Build risk management culture and capability through training and organizational development.', priority: '2', control_type: 'organizational' },
    ]
  },
  {
    code: 'nist_800_207', name: 'NIST SP 800-207 Zero Trust Architecture (Reference Model)', version: '2020',
    category: 'Reference Model', tier_required: 'enterprise',
    description: 'Zero Trust Architecture reference model and design principles. Not a certifiable compliance framework.',
    controls: [
      { control_id: 'ZTA-1', title: 'Resource Identification and Classification', description: 'Identify and classify all enterprise resources including data, services, and devices.', priority: '1', control_type: 'strategic' },
      { control_id: 'ZTA-2', title: 'Subject/Identity Verification', description: 'Verify the identity of all subjects before granting access to any resource.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-3', title: 'Least Privilege Access Per-Request', description: 'Grant minimum necessary access on a per-request basis regardless of network location.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-4', title: 'Policy Decision Point (PDP) Implementation', description: 'Implement a Policy Decision Point that evaluates access requests against dynamic policies.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-5', title: 'Policy Enforcement Point (PEP) Implementation', description: 'Implement a Policy Enforcement Point that enables and terminates connections based on PDP decisions.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-6', title: 'Continuous Diagnostics and Monitoring', description: 'Continuously monitor and diagnose the security state of all enterprise assets.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-7', title: 'Dynamic and Risk-Based Policy', description: 'Dynamically adjust access policies based on real-time risk signals and contextual data.', priority: '1', control_type: 'strategic' },
      { control_id: 'ZTA-8', title: 'Micro-Segmentation', description: 'Segment the network into micro-perimeters to contain lateral movement and limit blast radius.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-9', title: 'Encrypted Communications (All Traffic)', description: 'Encrypt all communications regardless of network location to prevent interception.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-10', title: 'Device Health Verification', description: 'Assess device health and posture before granting access to enterprise resources.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-11', title: 'Multi-Factor Authentication (All Access)', description: 'Require multi-factor authentication for all access requests to enterprise resources.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-12', title: 'Just-In-Time / Just-Enough Access', description: 'Provision just-in-time and just-enough access to minimize standing privileges.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-13', title: 'Session-Based Trust Evaluation', description: 'Evaluate trust continuously throughout each session rather than only at initial authentication.', priority: '2', control_type: 'technical' },
      { control_id: 'ZTA-14', title: 'Behavioral Analytics and Anomaly Detection', description: 'Use behavioral analytics and anomaly detection to identify suspicious access patterns.', priority: '2', control_type: 'technical' },
      { control_id: 'ZTA-15', title: 'Data Loss Prevention in Zero Trust', description: 'Implement data loss prevention controls within the zero trust architecture.', priority: '2', control_type: 'technical' },
      { control_id: 'ZTA-16', title: 'Network Visibility and Analytics', description: 'Maintain comprehensive network visibility and analytics across all traffic flows.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-17', title: 'API Security Gateway', description: 'Secure API gateways to authenticate, authorize, and monitor all API communications.', priority: '1', control_type: 'technical' },
      { control_id: 'ZTA-18', title: 'Supply Chain Trust Verification', description: 'Verify the trustworthiness of supply chain components before integration.', priority: '2', control_type: 'strategic' },
    ]
  },

  // === UTILITIES TIER (Enterprise Add-On): State & Regional Regulatory Packs ===
  {
    code: 'ccpa_cpra', name: 'CCPA / CPRA', version: '2023',
    category: 'Privacy', tier_required: 'govcloud',
    description: 'California Consumer Privacy Act and California Privacy Rights Act. Consumer data rights, opt-out requirements, and privacy risk assessments for California operations.',
    controls: [
      { control_id: 'CCPA-1', title: 'Right to Know / Access', description: 'Consumers have the right to know what personal information is collected and how it is used.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-2', title: 'Right to Delete', description: 'Consumers have the right to request deletion of their personal information.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-3', title: 'Right to Opt-Out of Sale', description: 'Consumers have the right to opt-out of the sale or sharing of their personal information.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-4', title: 'Right to Non-Discrimination', description: 'Businesses shall not discriminate against consumers who exercise their privacy rights.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-5', title: 'Right to Correct', description: 'Consumers have the right to request correction of inaccurate personal information.', priority: '2', control_type: 'policy' },
      { control_id: 'CCPA-6', title: 'Right to Limit Sensitive PI Use', description: 'Consumers have the right to limit the use and disclosure of their sensitive personal information.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-7', title: 'Privacy Notice Requirements', description: 'Provide consumers with a clear and conspicuous privacy notice at or before collection.', priority: '1', control_type: 'organizational' },
      { control_id: 'CCPA-8', title: 'Service Provider Agreements', description: 'Establish contractual requirements for service providers processing personal information.', priority: '1', control_type: 'organizational' },
      { control_id: 'CCPA-9', title: 'Data Inventory and Mapping', description: 'Maintain a comprehensive inventory and mapping of personal information data flows.', priority: '1', control_type: 'technical' },
      { control_id: 'CCPA-10', title: 'Consent and Opt-In for Minors', description: 'Obtain opt-in consent before selling personal information of consumers under 16 years of age.', priority: '2', control_type: 'policy' },
      { control_id: 'CPRA-1', title: 'Privacy Risk Assessment (Annual)', description: 'Conduct annual privacy risk assessments for processing that presents significant risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'CPRA-2', title: 'Cybersecurity Audit Requirements', description: 'Perform regular cybersecurity audits for businesses whose processing presents significant risk.', priority: '1', control_type: 'organizational' },
      { control_id: 'CPRA-3', title: 'Automated Decision-Making Opt-Out', description: 'Consumers have the right to opt-out of automated decision-making technology.', priority: '1', control_type: 'policy' },
      { control_id: 'CPRA-4', title: 'Cross-Context Behavioral Advertising', description: 'Establish controls for cross-context behavioral advertising and data sharing practices.', priority: '2', control_type: 'policy' },
    ]
  },
  {
    code: 'state_ai_governance', name: 'US State AI Governance Laws', version: '2025',
    category: 'AI Governance', tier_required: 'govcloud',
    description: 'Comprehensive coverage of enacted US state AI laws across 12+ jurisdictions: Colorado SB 205, Illinois AI Video Interview Act, NYC Local Law 144, California SB 942/AB 2013/AB 2885/AB 1008, Texas TRAIGA, Virginia HB 2048, Connecticut SB 2, Tennessee ELVIS Act, Utah SB 149, Washington SB 5838, Maryland HB 1281, and New York State AI legislation. Controls are crosswalked to NIST AI RMF so evidence collected once satisfies multiple jurisdictions.',
    controls: [
      // Colorado SB 205
      { control_id: 'CO-AI-1', title: 'CO SB 205 — High-Risk AI Impact Assessment', description: 'Before deploying a high-risk AI system, conduct and document an impact assessment covering intended purpose, known risks, measures to mitigate algorithmic discrimination, and a post-deployment monitoring plan. (Colo. Rev. Stat. § 6-1-1703)', priority: '1', control_type: 'strategic' },
      { control_id: 'CO-AI-2', title: 'CO SB 205 — Consumer Disclosure for Consequential Decisions', description: 'Provide clear, plain-language disclosure to consumers when a high-risk AI system is used to make a consequential decision (employment, education, financial services, housing, healthcare, insurance). Disclose data types used and purpose. (§ 6-1-1704)', priority: '1', control_type: 'policy' },
      { control_id: 'CO-AI-3', title: 'CO SB 205 — Algorithmic Discrimination Prevention', description: 'Implement reasonable care to protect consumers from known or reasonably foreseeable risks of algorithmic discrimination based on protected characteristics. Include bias testing before deployment and after material changes. (§ 6-1-1702)', priority: '1', control_type: 'strategic' },
      { control_id: 'CO-AI-4', title: 'CO SB 205 — Consumer Right to Appeal AI Decisions', description: 'Provide consumers an opportunity to appeal a consequential decision made by or with substantial assistance of a high-risk AI system, with a meaningful human review process and documented outcome. (§ 6-1-1705)', priority: '1', control_type: 'policy' },
      { control_id: 'CO-AI-5', title: 'CO SB 205 — Developer Documentation and Disclosure', description: 'AI developers must provide deployers with documentation of intended uses, known limitations, bias evaluation results, and required safeguards. Maintain version-controlled records and update on material changes. (§ 6-1-1706)', priority: '2', control_type: 'organizational' },
      // Illinois
      { control_id: 'IL-AI-1', title: 'IL AI Video Interview Act — Pre-Interview Consent', description: 'Before conducting an AI-analyzed video interview, notify applicants in writing that AI will be used to analyze the video and assess qualifications, explain how the AI works, and obtain express written consent. (430 ILCS 1/10)', priority: '1', control_type: 'policy' },
      { control_id: 'IL-AI-2', title: 'IL AI Video Interview Act — Video Data Destruction', description: 'Destroy the applicant\'s video interview recording and all AI-derived analysis within 30 days of a written destruction request. Share interview data only with parties whose expertise is needed to evaluate applicant fit. (430 ILCS 1/20)', priority: '1', control_type: 'technical' },
      { control_id: 'IL-AI-3', title: 'IL AI Video Interview Act — No Sole AI Screening', description: 'Do not use AI video interview analysis as the sole or primary basis to exclude an applicant from an in-person interview. Human review must be incorporated as a meaningful step. (430 ILCS 1/20(c))', priority: '1', control_type: 'policy' },
      { control_id: 'IL-AI-4', title: 'IL HB 3773 — AI in Employment Decision Transparency', description: 'For AI systems materially used in employment decisions (screening, promotion, termination), provide notice to affected employees and applicants, document factors the AI considers, and maintain decision audit logs for two years.', priority: '2', control_type: 'organizational' },
      // New York City — Local Law 144
      { control_id: 'NYC-AI-1', title: 'NYC LL 144 — Annual Independent Bias Audit of AEDT', description: 'Before using and annually thereafter, commission an independent bias audit of every Automated Employment Decision Tool (AEDT). Calculate selection rate and impact ratio by gender and race/ethnicity. Retain auditor qualifications. (NYC Admin. Code § 20-871)', priority: '1', control_type: 'organizational' },
      { control_id: 'NYC-AI-2', title: 'NYC LL 144 — Bias Audit Summary Publication', description: 'Post a clear summary of the most recent independent bias audit on the organization\'s website, including audit date, data source, and impact ratio results for each demographic category tested. (§ 20-872)', priority: '1', control_type: 'policy' },
      { control_id: 'NYC-AI-3', title: 'NYC LL 144 — Candidate Notification', description: 'For NYC-based roles, notify candidates at least 10 business days before applying an AEDT to their assessment. Offer an alternative selection process or reasonable accommodation upon request. (§ 20-872)', priority: '1', control_type: 'policy' },
      { control_id: 'NYC-AI-4', title: 'NYC LL 144 — Audit Record Retention', description: 'Retain bias audit reports, supporting data, and selection records for at least three years after the audit date to support regulatory inspection and potential legal discovery. (§ 20-872(c))', priority: '2', control_type: 'technical' },
      // California
      { control_id: 'CA-AI-1', title: 'CA SB 942 — AI Provenance and Watermarking', description: 'Generative AI providers must implement technical measures (C2PA watermarks, metadata) so AI-generated text, audio, video, and images can be identified. Consumers must be able to detect AI origin. (Cal. Bus. & Prof. Code § 22756)', priority: '1', control_type: 'technical' },
      { control_id: 'CA-AI-2', title: 'CA AB 2013 — Training Data Transparency Documentation', description: 'Publish a publicly accessible summary of training data for generative AI systems trained on data available after Jan 1, 2022. Document data sources, categories, and licensing status. (Cal. Bus. & Prof. Code § 22758)', priority: '1', control_type: 'policy' },
      { control_id: 'CA-AI-3', title: 'CA SB 896 — GenAI Risk Assessment for State Contracts', description: 'Organizations providing AI services to California state agencies must complete and disclose a risk assessment for generative AI deployments, including potential harms and mitigation measures prior to contract execution.', priority: '2', control_type: 'strategic' },
      { control_id: 'CA-AI-4', title: 'CA AB 302 — State Agency AI Use Transparency', description: 'Maintain a publicly available inventory of AI systems used in government operations, including purpose, risk level, training data sources, and human oversight procedures, submitted annually to the legislature.', priority: '2', control_type: 'organizational' },
      { control_id: 'CA-AI-5', title: 'CA AB 2885 — AI Statutory Definition Alignment', description: 'Apply California statutory definitions of "artificial intelligence" and "automated decision system" consistently across internal policies, vendor contracts, and public disclosures to ensure regulatory alignment.', priority: '3', control_type: 'policy' },
      { control_id: 'CA-AI-6', title: 'CA AB 1008 — AI-Derived Inferences as Personal Information', description: 'Treat AI-generated inferences, profiles, and predictions derived from personal information as personal information under CCPA/CPRA. Apply consumer rights (access, deletion, correction, opt-out) to AI-derived data.', priority: '1', control_type: 'technical' },
      // Texas — TRAIGA
      { control_id: 'TX-AI-1', title: 'TX TRAIGA — High-Risk AI Consumer Disclosure', description: 'Disclose to consumers when a high-risk AI system is used to make or substantially influence a consequential decision affecting them. Include data categories used, purpose, and a consumer inquiry contact. (Texas TRAIGA § 541.002)', priority: '1', control_type: 'policy' },
      { control_id: 'TX-AI-2', title: 'TX TRAIGA — Algorithmic Bias Risk Management Program', description: 'Implement a documented risk management policy and program for high-risk AI systems addressing known or foreseeable risks of algorithmic discrimination. Conduct pre-deployment testing by protected characteristic.', priority: '1', control_type: 'strategic' },
      { control_id: 'TX-AI-3', title: 'TX TRAIGA — Deployer Oversight and Monitoring', description: 'AI deployers must limit AI use to documented intended purposes, train personnel on AI risks and limitations, continuously monitor AI performance, and maintain audit records of consequential decision outcomes.', priority: '2', control_type: 'organizational' },
      // Virginia — HB 2048
      { control_id: 'VA-AI-1', title: 'VA HB 2048 — High-Risk AI Impact Assessment', description: 'Before deploying a high-risk AI system, complete a documented impact assessment identifying the system\'s purpose, risks to consumers, categories of data processed, and safeguards against algorithmic discrimination. (Va. Code Ann. § 59.1-578)', priority: '1', control_type: 'strategic' },
      { control_id: 'VA-AI-2', title: 'VA HB 2048 — Right to Opt-Out of AI Profiling', description: 'Provide Virginia consumers the right to opt-out of automated processing of personal data for profiling producing legal or significant effects. Implement an accessible opt-out mechanism and honor requests within required timeframes. (Va. Code Ann. § 59.1-574)', priority: '1', control_type: 'policy' },
      { control_id: 'VA-AI-3', title: 'VA HB 2048 — Human Review of Consequential AI Decisions', description: 'Implement a documented process for consumers to request human review of any consequential decision made through automated means. Automated processing may not be the sole basis for decisions without a human review option.', priority: '1', control_type: 'policy' },
      // Connecticut — SB 2
      { control_id: 'CT-AI-1', title: 'CT SB 2 — Developer Duty of Reasonable Care', description: 'AI developers of high-risk systems must use reasonable care in design, testing, and documentation to protect consumers from known or foreseeable risks of algorithmic discrimination based on protected class status.', priority: '1', control_type: 'strategic' },
      { control_id: 'CT-AI-2', title: 'CT SB 2 — Deployer Impact Assessment and Consumer Rights', description: 'Before deploying a high-risk AI system, complete an impact assessment and implement a governance program. Provide consumers notice of AI use in consequential decisions and a meaningful opportunity to appeal adverse outcomes.', priority: '1', control_type: 'organizational' },
      { control_id: 'CT-AI-3', title: 'CT SB 2 — Annual Compliance Disclosure to Attorney General', description: 'Submit an annual compliance summary of high-risk AI systems deployed, impact assessments completed, and any algorithmic discrimination incidents or consumer complaints to the Connecticut Attorney General.', priority: '2', control_type: 'organizational' },
      // Tennessee — ELVIS Act
      { control_id: 'TN-AI-1', title: 'TN ELVIS Act — AI Voice and Likeness Consent', description: 'Obtain explicit informed consent before using AI to replicate, simulate, or reproduce an individual\'s voice or likeness for commercial purposes. Applies to musicians, performers, and any identifiable individual. (Tenn. Code Ann. § 47-25-1101)', priority: '1', control_type: 'policy' },
      { control_id: 'TN-AI-2', title: 'TN ELVIS Act — Takedown and Removal Process', description: 'Establish and publish a process for individuals to submit takedown requests for unauthorized AI-generated replications of their voice or likeness. Acknowledge within 48 hours and remove within legally prescribed timeframes.', priority: '1', control_type: 'technical' },
      { control_id: 'TN-AI-3', title: 'TN ELVIS Act — Platform Safe Harbor Compliance', description: 'Platforms hosting AI-generated content must register a designated agent, implement compliant takedown procedures, and provide counter-notice processes to maintain safe harbor protections under the ELVIS Act.', priority: '2', control_type: 'organizational' },
      // Utah — SB 149
      { control_id: 'UT-AI-1', title: 'UT SB 149 — GenAI Disclosure in Regulated Occupations', description: 'Practitioners in regulated occupations (legal, healthcare, financial services) must clearly disclose to consumers when generative AI is used to provide services or advice, prior to service delivery. (Utah Code Ann. § 13-2-11)', priority: '1', control_type: 'policy' },
      { control_id: 'UT-AI-2', title: 'UT SB 149 — AI Chatbot Human Identity Disclosure', description: 'Operators of AI-powered conversational systems must disclose the AI nature of the service when a user sincerely inquires whether they are interacting with a human. Deceptive AI identity claims are prohibited. (Utah Code Ann. § 13-2-12)', priority: '1', control_type: 'policy' },
      { control_id: 'UT-AI-3', title: 'UT SB 149 — Consumer Protection Reporting', description: 'Report AI-related consumer complaints and significant incidents to the Utah Division of Consumer Protection as required. Maintain records sufficient to demonstrate compliance with reporting obligations.', priority: '3', control_type: 'organizational' },
      // Washington — SB 5838 / HB 1951
      { control_id: 'WA-AI-1', title: 'WA SB 5838 — Automated Decision System Inventory', description: 'Maintain a current inventory of automated decision systems used in consequential decisions affecting Washington residents. Document purpose, deployment context, affected populations, risk classification, and human oversight mechanisms.', priority: '1', control_type: 'organizational' },
      { control_id: 'WA-AI-2', title: 'WA SB 5838 — Impact Assessment and Public Notice', description: 'Conduct documented impact assessments for automated decision systems affecting Washington consumers in housing, employment, credit, education, and healthcare. Publish a public-facing summary of assessment results.', priority: '1', control_type: 'strategic' },
      { control_id: 'WA-AI-3', title: 'WA HB 1951 — AI in Employment Decision Disclosure', description: 'Disclose to Washington job applicants and employees when AI tools materially contribute to hiring, performance management, or termination decisions. Provide a documented human review option for individuals receiving adverse AI-assisted outcomes.', priority: '1', control_type: 'policy' },
      // Maryland — HB 1281
      { control_id: 'MD-AI-1', title: 'MD HB 1281 — Independent Bias Audit for Employment AEDT', description: 'Conduct an independent bias audit of automated decision tools used in employment decisions affecting Maryland residents before use and annually thereafter. Publish audit results and provide candidates notice before the tool is applied.', priority: '1', control_type: 'organizational' },
      { control_id: 'MD-AI-2', title: 'MD HB 1281 — Consumer Complaint Resolution Process', description: 'Establish and maintain a formal process for Maryland consumers to submit complaints about automated decision outcomes. Investigate and respond in writing within 30 days. Escalate unresolved complaints to the Maryland Attorney General as required.', priority: '2', control_type: 'policy' },
      // New York State
      { control_id: 'NY-AI-1', title: 'NY — Automated Decision System Transparency', description: 'Provide New York residents with plain-language explanations of how automated systems affect decisions about them, including data inputs, logic applied, confidence thresholds, and options to contest decisions or request human review.', priority: '1', control_type: 'policy' },
      { control_id: 'NY-AI-2', title: 'NY — AI Bias Reporting for High-Stakes Decisions', description: 'For AI systems making high-stakes decisions (employment, credit, housing, healthcare) affecting New York residents, conduct annual algorithmic bias evaluations and maintain reports available to state agencies upon request.', priority: '1', control_type: 'organizational' },
      // Cross-cutting multi-state controls
      { control_id: 'SAI-CORE-1', title: 'Multi-State AI Compliance Program', description: 'Establish a centralized AI compliance program tracking all applicable state AI laws by jurisdiction, with a compliance calendar, regulatory watch process, policy update procedure, and a designated compliance owner per active state.', priority: '1', control_type: 'strategic' },
      { control_id: 'SAI-CORE-2', title: 'Unified AI System Register', description: 'Maintain a unified register of all AI systems in use, documenting: jurisdictions of deployment, applicable state laws, risk classification, impact assessment status, bias audit dates, and assigned compliance owners.', priority: '1', control_type: 'organizational' },
      { control_id: 'SAI-CORE-3', title: 'Cross-State Algorithmic Fairness Controls', description: 'Implement baseline algorithmic fairness controls — protected-class disparity testing, impact ratio analysis, and corrective action procedures — sufficient to satisfy discrimination prohibitions in CO, TX, VA, CT, and WA simultaneously.', priority: '1', control_type: 'technical' },
      { control_id: 'SAI-CORE-4', title: 'AI Training Data Provenance Documentation', description: 'Document the origin, licensing status, consent basis, and data categories for all training data used in AI systems subject to CA AB 2013, VA, or CT transparency requirements. Maintain version history and make summaries publicly accessible.', priority: '2', control_type: 'technical' },
      { control_id: 'SAI-CORE-5', title: 'State-Level AI Consumer Rights Fulfillment', description: 'Implement operational workflows to fulfill AI-specific consumer rights across jurisdictions: right to access AI-derived inferences (CA/VA), right to appeal (CO/VA/CT), right to human review (NYC/WA), right to opt-out of AI profiling (VA/CO), and right to voice/likeness control (TN/CA).', priority: '1', control_type: 'policy' },
      { control_id: 'SAI-CORE-6', title: 'Regulatory Change Management for State AI Laws', description: 'Monitor state legislative and regulatory activity for AI laws across all 50 states. Update internal policies and controls within 90 days of new AI law enactments. Maintain a state-law tracking log updated at least quarterly.', priority: '2', control_type: 'strategic' },
    ]
  },
  {
    code: 'international_ai_governance', name: 'International AI Governance Laws', version: '2025',
    category: 'AI Governance', tier_required: 'govcloud',
    description: 'Comprehensive coverage of enacted international AI governance laws across 10+ jurisdictions: EU AI Act (Regulation 2024/1689), UK AI Regulation Approach, Canada AIDA (Bill C-27), Brazil LGPD AI Provisions, Singapore PDPA + AI Governance Framework 2.0, Japan APPI + AI Strategy, South Korea AI Basic Act, China Generative AI Regulation + Algorithm Recommendation Regulation, Australia Privacy Act AI Ethics Framework, and India DPDP Act 2023. Controls are crosswalked to NIST AI RMF and EU AI Act so evidence satisfies multiple jurisdictions.',
    controls: [
      // European Union — AI Act (Regulation 2024/1689) enhanced
      { control_id: 'EU-AIA-1', title: 'EU AI Act — Prohibited AI Practices (Art. 5)', description: 'Prohibit AI practices that pose unacceptable risk: subliminal manipulation, exploitation of vulnerabilities, social scoring by public authorities, real-time biometric surveillance in public spaces, and emotion recognition in workplace/education. Implement a prohibited-use checklist reviewed quarterly. (Regulation 2024/1689, Art. 5)', priority: '1', control_type: 'policy' },
      { control_id: 'EU-AIA-2', title: 'EU AI Act — High-Risk AI Classification (Art. 6 & Annex III)', description: 'Classify AI systems as high-risk if they fall within Annex III categories (biometrics, critical infrastructure, education, employment, essential services, law enforcement, migration, justice). Maintain a classification register reviewed on material changes. (Art. 6)', priority: '1', control_type: 'strategic' },
      { control_id: 'EU-AIA-3', title: 'EU AI Act — Risk Management System Lifecycle (Art. 9)', description: 'Implement a continuous risk management system covering identification and analysis of known and foreseeable risks, estimation and evaluation when used as intended and under misuse, and risk mitigation measures. Document and update throughout the AI lifecycle. (Art. 9)', priority: '1', control_type: 'strategic' },
      { control_id: 'EU-AIA-4', title: 'EU AI Act — Data Governance for High-Risk AI (Art. 10)', description: 'Ensure training, validation, and testing datasets satisfy quality criteria: relevance, representativeness, freedom from errors, completeness, and appropriate statistical properties. Implement data governance addressing potential biases. Document dataset provenance and preprocessing. (Art. 10)', priority: '1', control_type: 'technical' },
      { control_id: 'EU-AIA-5', title: 'EU AI Act — Technical Documentation (Art. 11 & Annex IV)', description: 'Prepare comprehensive technical documentation (Annex IV) before placing a high-risk AI system on the EU market: system description, architecture, design specifications, training methodologies, validation results, performance metrics, and intended purpose. (Art. 11)', priority: '1', control_type: 'organizational' },
      { control_id: 'EU-AIA-6', title: 'EU AI Act — Automatic Event Logging (Art. 12)', description: 'Design high-risk AI systems to automatically generate audit logs: system activation/deactivation, input data, output decisions, human oversight interventions, and reference database queries. Retain logs for at least 6 months. (Art. 12)', priority: '1', control_type: 'technical' },
      { control_id: 'EU-AIA-7', title: 'EU AI Act — Transparency and Instructions for Use (Art. 13)', description: 'Ensure high-risk AI systems are sufficiently transparent. Provide instructions for use including: provider identity, system capabilities and limitations, performance metrics, human oversight measures, expected lifetime, and maintenance requirements. (Art. 13)', priority: '1', control_type: 'organizational' },
      { control_id: 'EU-AIA-8', title: 'EU AI Act — Human Oversight Measures (Art. 14)', description: 'Design high-risk AI systems to enable effective human oversight: ability to understand capabilities and limitations, ability to disregard or override AI outputs, ability to interrupt operation, and assignment of oversight responsibility to competent natural persons. (Art. 14)', priority: '1', control_type: 'organizational' },
      { control_id: 'EU-AIA-9', title: 'EU AI Act — GPAI Model Transparency and Systemic Risk (Art. 53 & 55)', description: 'For GPAI models: provide technical documentation, publish training data summary, implement copyright compliance, and establish incident reporting. For GPAI with systemic risk (>10^25 FLOPs): conduct adversarial testing, notify incidents to the AI Office, implement cybersecurity measures. (Art. 53, 55)', priority: '1', control_type: 'strategic' },
      { control_id: 'EU-AIA-10', title: 'EU AI Act — Fundamental Rights Impact Assessment (Art. 27)', description: 'Before deploying high-risk AI in sectors affecting fundamental rights, conduct an impact assessment covering: purpose, system description, deployment geography, affected persons, specific risks identified, and proportionality. Register in the EU database. (Art. 27)', priority: '1', control_type: 'strategic' },
      // United Kingdom — Pro-Innovation AI Regulatory Approach
      { control_id: 'UK-AI-1', title: 'UK AI — Cross-Sector Safety Requirements', description: 'Apply the UK AI safety principle: AI systems must be technically secure and function as designed. Implement a safety case covering failure modes, adversarial robustness, and incident response applicable to your sector regulator (FCA, CMA, ICO, Ofcom). (DSIT AI Framework, Safety Principle)', priority: '1', control_type: 'strategic' },
      { control_id: 'UK-AI-2', title: 'UK AI — Transparency and Explainability', description: 'Apply the UK transparency principle: be transparent about when AI is used, the basis for AI-influenced decisions, and provide meaningful explanations. Comply with ICO guidance on AI and data protection transparency under UK GDPR. (DSIT AI Framework, Transparency Principle)', priority: '1', control_type: 'policy' },
      { control_id: 'UK-AI-3', title: 'UK AI — Fairness and Non-Discrimination', description: 'Apply the UK fairness principle: AI systems must not undermine equality law. Conduct bias assessments covering the nine protected characteristics under the UK Equality Act 2010 for AI influencing decisions about individuals. Document and remediate disparate impacts. (DSIT AI Framework, Fairness Principle)', priority: '1', control_type: 'strategic' },
      { control_id: 'UK-AI-4', title: 'UK AI — Accountability and Governance', description: 'Apply the UK accountability principle: establish AI governance structures with defined roles, responsibilities, and escalation paths. Maintain an AI register, conduct regular reviews, and designate senior accountability for AI risk. Comply with FCA/PRA model risk management where applicable. (DSIT AI Framework)', priority: '1', control_type: 'organizational' },
      { control_id: 'UK-AI-5', title: 'UK AI — Contestability and Redress', description: 'Apply the UK contestability principle: where AI influences significant decisions about individuals, provide clear routes to contest decisions and seek human review. Implement an AI complaints and appeals process with defined SLAs. (DSIT AI Framework, Contestability Principle)', priority: '2', control_type: 'policy' },
      // Canada — AIDA (Artificial Intelligence and Data Act, Bill C-27)
      { control_id: 'CA-AIDA-1', title: 'Canada AIDA — High-Impact AI System Identification', description: 'Identify AI systems meeting the definition of "high-impact system" under AIDA: systems making automated decisions having significant effects in employment, access to services, criminal justice, or health. Maintain an inventory of all high-impact systems. (AIDA Bill C-27, Part 3, s. 5)', priority: '1', control_type: 'organizational' },
      { control_id: 'CA-AIDA-2', title: 'Canada AIDA — Risk Assessment and Mitigation', description: 'Conduct risk assessments for high-impact AI systems prior to deployment and at defined intervals covering risks to individuals, society, and democratic institutions. Document implemented mitigation measures proportionate to identified risks. (AIDA Bill C-27, s. 6-7)', priority: '1', control_type: 'strategic' },
      { control_id: 'CA-AIDA-3', title: 'Canada AIDA — Transparency and Plain-Language Disclosure', description: 'Make publicly available plain-language descriptions of high-impact AI systems in use, their general purposes, decision types, and available recourse mechanisms. Publish on the organizational website and update on material changes. (AIDA Bill C-27, s. 10)', priority: '1', control_type: 'policy' },
      { control_id: 'CA-AIDA-4', title: 'Canada AIDA — Monitoring and Record-Keeping', description: 'Monitor deployed high-impact AI systems for performance and unintended consequences. Maintain records of training data descriptions, risk assessment results, mitigation measures, and monitoring outcomes for a minimum of 10 years after system retirement. (AIDA Bill C-27, s. 12)', priority: '2', control_type: 'organizational' },
      // Brazil — LGPD AI Provisions & AI Bill (PL 2338/2023)
      { control_id: 'BR-AI-1', title: 'Brazil — Automated Processing Transparency (LGPD Art. 20)', description: 'When personal data is processed by automated means for decisions affecting an individual, provide upon request: information about the criteria and procedures used, right to request human review, and a plain-language explanation of the decision. (Lei 13.709/2018, Art. 20)', priority: '1', control_type: 'policy' },
      { control_id: 'BR-AI-2', title: 'Brazil — Right to Human Review of Automated Decisions (LGPD Art. 20)', description: 'Establish a documented process allowing data subjects to request human review of decisions based solely on automated processing of personal data that affect their interests. Process requests within 15 days and document outcomes. (Lei 13.709/2018, Art. 20, §3)', priority: '1', control_type: 'policy' },
      { control_id: 'BR-AI-3', title: 'Brazil AI Bill — High-Risk AI Impact Assessment (PL 2338/2023)', description: 'For high-risk AI systems under the Brazil AI Bill (critical infrastructure, employment, biometrics, criminal justice): conduct and document an algorithmic impact assessment covering purpose, methodology, data used, potential harms, and mitigation measures before deployment. (PL 2338/2023, Art. 15)', priority: '1', control_type: 'strategic' },
      { control_id: 'BR-AI-4', title: 'Brazil AI Bill — Non-Discrimination and Bias Controls', description: 'Implement technical and organizational measures to prevent AI systems from producing discriminatory outputs based on race, color, ethnicity, religion, national origin, gender, sexual orientation, or disability. Conduct periodic bias audits and document remediation actions. (PL 2338/2023, Art. 6)', priority: '1', control_type: 'technical' },
      // Singapore — PDPA + AI Governance Framework 2.0
      { control_id: 'SG-AI-1', title: 'Singapore — Internal AI Governance Structure (AIGF 2.0)', description: 'Establish an internal AI governance structure with senior leadership accountability, defined AI ethics principles, clear policies on permitted AI uses, and designated responsibilities for AI risk management. Align with the PDPC Model AI Governance Framework 2.0 and IMDA guidelines. (AIGF 2.0, Part 2)', priority: '1', control_type: 'organizational' },
      { control_id: 'SG-AI-2', title: 'Singapore — Human Involvement in AI Decision-Making (AIGF 2.0)', description: 'Determine the appropriate degree of human oversight for each AI use case based on probability of harm and severity of impact. For high-risk decisions (financial, medical, legal), require mandatory human review. Document the human oversight model in AI governance policies. (AIGF 2.0, Part 3)', priority: '1', control_type: 'organizational' },
      { control_id: 'SG-AI-3', title: 'Singapore — AI Operations Management and Model Monitoring', description: 'Implement operational controls covering: AI model documentation, pre-deployment validation, ongoing performance monitoring, data quality management, and version control. Establish minimum performance thresholds and trigger-based review procedures for model degradation. (AIGF 2.0, Part 4)', priority: '1', control_type: 'technical' },
      { control_id: 'SG-AI-4', title: 'Singapore — PDPA AI Data Protection Obligations', description: 'Comply with PDPA obligations for AI systems processing personal data: obtain valid consent or establish a valid legal basis, apply purpose limitation, implement data minimization in training datasets, and notify affected individuals when AI decisions materially affect them. (PDPA 2012, as amended 2020)', priority: '1', control_type: 'technical' },
      // Japan — APPI + AI Strategy 2022
      { control_id: 'JP-AI-1', title: 'Japan — APPI AI Data Processing Governance', description: 'Comply with the Act on the Protection of Personal Information (APPI) for AI systems: establish a legitimate purpose of use, notify individuals of purpose, implement security management measures proportionate to risk, and obtain consent for sensitive personal information used in AI training. (APPI Art. 18, 20, 24)', priority: '1', control_type: 'technical' },
      { control_id: 'JP-AI-2', title: 'Japan — AI Development and Utilization Principles (MIC/METI)', description: 'Apply the 10 AI development principles from Japan MIC/METI guidelines: human-centricity, education/literacy, privacy protection, security, fair competition, fairness, transparency, innovation, accountability, and safety. Document how each principle is operationalized in AI system design and deployment policies.', priority: '1', control_type: 'policy' },
      { control_id: 'JP-AI-3', title: 'Japan — Generative AI Guidelines (Cabinet AI Strategy 2024)', description: 'For generative AI operating in Japan: implement copyright compliance measures, establish content provenance mechanisms, publish usage guidelines for employees, and disclose to users when AI-generated content is being provided. Align with Cabinet Office Integrated Innovation Strategy guidelines on generative AI.', priority: '2', control_type: 'policy' },
      // South Korea — AI Basic Act (Act No. 20469)
      { control_id: 'KR-AI-1', title: 'South Korea AI Basic Act — High-Impact AI Risk Assessment', description: 'For AI classified as high-impact under the AI Basic Act (healthcare, employment, credit, education, law enforcement, critical infrastructure): conduct a pre-deployment impact assessment covering risks, data sources, mitigation measures, and monitoring plan. Submit to the Korea Communications Commission or applicable regulator as required. (AI Basic Act, Art. 27)', priority: '1', control_type: 'strategic' },
      { control_id: 'KR-AI-2', title: 'South Korea AI Basic Act — Transparency and Disclosure', description: 'Disclose to users: that they are interacting with an AI system, the purpose and key characteristics of the AI, available avenues for recourse, and the provider identity. For AI-generated content, implement technical disclosure measures. (AI Basic Act, Art. 28)', priority: '1', control_type: 'policy' },
      { control_id: 'KR-AI-3', title: 'South Korea AI Basic Act — Governance and Accountability', description: 'Establish an AI governance framework aligned with the AI Basic Act: appoint an AI safety officer for high-impact systems, implement an internal AI ethics committee or oversight body, and establish an incident response procedure for AI-related harms. (AI Basic Act, Art. 31)', priority: '2', control_type: 'organizational' },
      // China — Generative AI Regulation + Algorithm Recommendation Regulation
      { control_id: 'CN-AI-1', title: 'China — Generative AI Service Disclosure Requirements (CAC 2023)', description: 'Generative AI services in China must: obtain user consent before content generation, label AI-generated content with visible and covert watermarks, implement content security review mechanisms, and maintain logs of user instructions and AI outputs for 6 months. (CAC Measures for Generative AI, Art. 12, 17)', priority: '1', control_type: 'technical' },
      { control_id: 'CN-AI-2', title: 'China — Algorithm Recommendation Transparency and User Control (CAC 2022)', description: 'Algorithm recommendation services must: disclose use of algorithmic recommendations, provide users the ability to disable personalized recommendations, prohibit price discrimination based on user characteristics, and file algorithm records with the CAC for significant platforms. (Algorithm Recommendation Measures, Art. 9, 17, 21)', priority: '1', control_type: 'policy' },
      { control_id: 'CN-AI-3', title: 'China — AI Content Security and Prohibited Uses', description: 'Ensure AI systems do not generate content that endangers national security, disrupts social order, violates social ethics, or spreads false information. Implement content moderation aligned with CAC internet information security requirements. Conduct quarterly compliance reviews. (CAC Generative AI Measures, Art. 4, 15)', priority: '1', control_type: 'policy' },
      { control_id: 'CN-AI-4', title: 'China — Deep Synthesis (Deepfake) Regulation Compliance (CAC 2022)', description: 'Comply with the Deep Synthesis Regulation: label all AI-generated synthetic audio, video, and images with conspicuous technical markers; obtain consent before creating deepfake content of identifiable individuals; provide real-name registration for users of deep synthesis services in China. (Deep Synthesis Provisions, Art. 14, 16)', priority: '1', control_type: 'technical' },
      // Australia — Privacy Act + AI Ethics Framework
      { control_id: 'AU-AI-1', title: 'Australia — Privacy Act AI Transparency (APPs)', description: 'When AI systems make or significantly influence decisions about Australian individuals, comply with Australian Privacy Principles: disclose automated decision-making in collection notices, implement the open and transparent management principle (APP 1), and provide individuals with access to personal information used in AI decisions. (Privacy Act 1988, APPs 1, 5, 12)', priority: '1', control_type: 'policy' },
      { control_id: 'AU-AI-2', title: 'Australia — National AI Ethics Framework Alignment (DISR 2019)', description: 'Apply the Australian AI Ethics Framework principles: human, societal and environmental wellbeing; human-centred values; fairness; privacy protection and security; reliability and safety; transparency and explainability; contestability; and accountability. Document principle compliance in AI governance policies.', priority: '1', control_type: 'policy' },
      { control_id: 'AU-AI-3', title: 'Australia — Automated Decision Governance', description: 'Implement governance controls for automated decisions affecting individuals: maintain an automated decision system record, conduct human rights and privacy impact assessments, implement human review mechanisms for consequential decisions, and publish an automated decision register consistent with APS guidance. (APS Automated Decision-Making Better Practice Guide)', priority: '2', control_type: 'organizational' },
      // India — Digital Personal Data Protection Act 2023
      { control_id: 'IN-AI-1', title: 'India DPDP Act — Lawful Basis and Consent for AI Data Processing', description: 'For AI systems processing personal digital data of Indian residents: establish a valid consent or legitimate use basis, ensure consent is free, specific, informed, and unconditional, maintain consent artefacts, and provide a mechanism for data principals to withdraw consent affecting AI processing within a reasonable timeframe. (DPDP Act 2023, Sections 6, 7)', priority: '1', control_type: 'technical' },
      { control_id: 'IN-AI-2', title: 'India DPDP Act — Data Principal Rights in AI Contexts', description: 'Implement processes to fulfil data principal rights for AI-processed data: right to access a summary of personal data and processing activities, right to correction and erasure of inaccurate data used in AI models, right to grievance redressal within 30 days, and right to nominate. (DPDP Act 2023, Sections 11-14)', priority: '1', control_type: 'policy' },
      { control_id: 'IN-AI-3', title: 'India DPDP Act — Data Localisation and Transfer Compliance', description: 'Comply with data localisation requirements for AI training and inference: do not transfer personal data of Indian residents to restricted countries or territories. Implement technical controls to enforce data residency for AI workloads and maintain transfer documentation. (DPDP Act 2023, Section 16)', priority: '2', control_type: 'technical' },
      // Cross-cutting multi-jurisdiction controls
      { control_id: 'INTL-CORE-1', title: 'Multi-Jurisdiction AI Compliance Program', description: 'Establish a centralized international AI compliance program tracking applicable laws by jurisdiction, with a compliance calendar for key deadlines (EU AI Act phases: 2025-2027), regulatory watch process covering 50+ countries, policy update procedure, and designated compliance owners per active jurisdiction.', priority: '1', control_type: 'strategic' },
      { control_id: 'INTL-CORE-2', title: 'Unified International AI System Register', description: 'Maintain a unified register of all AI systems in use internationally, documenting: countries of deployment, applicable national laws, risk tier per jurisdiction, impact assessment status, audit dates, and assigned compliance owners. Update on deployment of new systems or expansion into new markets.', priority: '1', control_type: 'organizational' },
      { control_id: 'INTL-CORE-3', title: 'Cross-Jurisdiction Algorithmic Fairness Baseline', description: 'Implement baseline fairness controls satisfying anti-discrimination requirements across EU AI Act, UK Equality Act, Canada AIDA, Brazil AI Bill, and South Korea AI Basic Act simultaneously: protected-characteristic bias testing, impact ratio analysis, disparity documentation, and corrective action procedures.', priority: '1', control_type: 'technical' },
      { control_id: 'INTL-CORE-4', title: 'International AI Content Provenance and Watermarking', description: 'Implement AI content provenance and watermarking mechanisms satisfying EU AI Act (Art. 50), China CAC deep synthesis rules, and emerging international standards (C2PA, ISO/IEC 42101). Apply visible and non-visible markers to AI-generated text, images, audio, and video across all markets.', priority: '1', control_type: 'technical' }, // ip-hygiene:ignore
      { control_id: 'INTL-CORE-5', title: 'Global AI Incident Reporting and Response', description: 'Establish a global AI incident reporting and response program: unified incident classification (safety, bias, privacy, security), jurisdiction-specific reporting timelines (EU: immediately for serious incidents; UK: sector-regulator timelines; China: CAC 24-hour window for significant incidents), and a cross-border root-cause analysis process.', priority: '1', control_type: 'organizational' },
      { control_id: 'INTL-CORE-6', title: 'International AI Regulatory Change Management', description: 'Monitor AI legislative and regulatory developments across 50+ countries using a quarterly regulatory scan. Update internal policies and controls within 90 days of enacted laws. Maintain a jurisdiction-law tracking log covering EU, UK, Canada, Brazil, Singapore, Japan, South Korea, China, Australia, India, and emerging markets.', priority: '2', control_type: 'strategic' },
    ]
  }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data
    await client.query('DELETE FROM control_mappings');
    await client.query('DELETE FROM control_implementations');
    await client.query('DELETE FROM framework_controls');
    await client.query('DELETE FROM organization_frameworks');
    await client.query('DELETE FROM frameworks');

    let totalControls = 0;

    for (const fw of frameworks) {
      const fwResult = await client.query(
        `INSERT INTO frameworks (code, name, version, description, category, tier_required, is_active, framework_group)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id`,
        [fw.code, fw.name, fw.version, fw.description, fw.category, fw.tier_required, fw.framework_group || null]
      );
      const frameworkId = fwResult.rows[0].id;

      for (const ctrl of fw.controls) {
        await client.query(
          `INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [frameworkId, ctrl.control_id, ctrl.title, ctrl.description || null, ctrl.priority, ctrl.control_type]
        );
        totalControls++;
      }

      console.log(`  ${fw.code}: ${fw.controls.length} controls (${fw.tier_required} tier)`);
    }

    // Create some crosswalk mappings between common controls
    console.log('\nCreating crosswalk mappings...');
    const mappingPairs = [
      // NIST CSF <-> ISO 27001
      ['PR.AA-01', 'nist_csf_2.0', 'A.5.15', 'iso_27001', 95],
      ['PR.AA-02', 'nist_csf_2.0', 'A.5.17', 'iso_27001', 90],
      ['PR.DS-01', 'nist_csf_2.0', 'A.8.24', 'iso_27001', 85],
      ['DE.CM-01', 'nist_csf_2.0', 'A.8.16', 'iso_27001', 90],
      ['ID.AM-01', 'nist_csf_2.0', 'A.5.9', 'iso_27001', 95],
      ['RS.MA-01', 'nist_csf_2.0', 'A.5.24', 'iso_27001', 90],
      // NIST CSF <-> NIST 800-53
      ['PR.AA-01', 'nist_csf_2.0', 'AC-2', 'nist_800_53', 95],
      ['PR.AA-02', 'nist_csf_2.0', 'IA-2', 'nist_800_53', 95],
      ['DE.CM-01', 'nist_csf_2.0', 'SI-4', 'nist_800_53', 90],
      ['PR.DS-01', 'nist_csf_2.0', 'SC-13', 'nist_800_53', 85],
      ['RS.MA-01', 'nist_csf_2.0', 'IR-4', 'nist_800_53', 95],
      ['PR.IR-01', 'nist_csf_2.0', 'CP-9', 'nist_800_53', 95],
      // ISO 27001 <-> SOC 2
      ['A.5.15', 'iso_27001', 'CC6.1', 'soc2', 90],
      ['A.5.24', 'iso_27001', 'CC7.3', 'soc2', 85],
      ['A.8.15', 'iso_27001', 'CC7.2', 'soc2', 90],
      ['A.8.7', 'iso_27001', 'CC6.8', 'soc2', 90],
      // NIST 800-53 <-> SOC 2
      ['AC-2', 'nist_800_53', 'CC6.2', 'soc2', 90],
      ['IR-4', 'nist_800_53', 'CC7.4', 'soc2', 90],
      ['SI-4', 'nist_800_53', 'CC7.1', 'soc2', 85],
      ['RA-3', 'nist_800_53', 'CC3.2', 'soc2', 90],
      // AI frameworks
      ['GOVERN-1', 'nist_ai_rmf', 'AIA-Art9', 'eu_ai_act', 85],
      ['MEASURE-2', 'nist_ai_rmf', 'AIA-Art15', 'eu_ai_act', 80],
      ['MAP-1', 'nist_ai_rmf', 'AIA-Art6', 'eu_ai_act', 85],
      ['GOVERN-1', 'nist_ai_rmf', 'ISO42-5.2', 'iso_42001', 90],
      ['MEASURE-1', 'nist_ai_rmf', 'ISO42-9.1', 'iso_42001', 85],
      // AIUC-1 <-> NIST AI RMF
      ['SEC-1', 'aiuc_1', 'MEASURE-2', 'nist_ai_rmf', 92],
      ['ACC-1', 'aiuc_1', 'GOVERN-1', 'nist_ai_rmf', 88],
      ['ACC-3', 'aiuc_1', 'GOVERN-2', 'nist_ai_rmf', 90],
      ['SAF-1', 'aiuc_1', 'MEASURE-1', 'nist_ai_rmf', 90],
      ['REL-3', 'aiuc_1', 'MEASURE-3', 'nist_ai_rmf', 90],
      // AIUC-1 <-> EU AI Act
      ['ACC-1', 'aiuc_1', 'AIA-Art12', 'eu_ai_act', 95],
      ['ACC-3', 'aiuc_1', 'AIA-Art14', 'eu_ai_act', 95],
      ['SEC-3', 'aiuc_1', 'AIA-Art15', 'eu_ai_act', 90],
      ['SOC-4', 'aiuc_1', 'AIA-Art13', 'eu_ai_act', 92],
      ['SOC-5', 'aiuc_1', 'AIA-Art27', 'eu_ai_act', 90],
      // AIUC-1 <-> ISO 42001
      ['ACC-3', 'aiuc_1', 'ISO42-5.1', 'iso_42001', 85],
      ['SAF-5', 'aiuc_1', 'ISO42-10.2', 'iso_42001', 82],
      ['ACC-4', 'aiuc_1', 'ISO42-10.1', 'iso_42001', 88],
      // Zero Trust <-> NIST 800-53
      ['ZTA-2', 'nist_800_207', 'IA-2', 'nist_800_53', 90],
      ['ZTA-3', 'nist_800_207', 'AC-6', 'nist_800_53', 90],
      ['ZTA-6', 'nist_800_207', 'SI-4', 'nist_800_53', 85],
      ['ZTA-9', 'nist_800_207', 'SC-8', 'nist_800_53', 95],
      ['ZTA-11', 'nist_800_207', 'IA-2', 'nist_800_53', 90],
      // Zero Trust <-> NIST CSF
      ['ZTA-6', 'nist_800_207', 'DE.CM-01', 'nist_csf_2.0', 85],
      ['ZTA-3', 'nist_800_207', 'PR.AA-04', 'nist_csf_2.0', 90],
      ['ZTA-8', 'nist_800_207', 'PR.DS-10', 'nist_csf_2.0', 80],
    ];

    let mappingsCreated = 0;
    for (const [srcCtrl, srcFw, tgtCtrl, tgtFw, score] of mappingPairs) {
      const src = await client.query(
        `SELECT fc.id FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE fc.control_id = $1 AND f.code = $2`,
        [srcCtrl, srcFw]
      );
      const tgt = await client.query(
        `SELECT fc.id FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE fc.control_id = $1 AND f.code = $2`,
        [tgtCtrl, tgtFw]
      );

      if (src.rows.length > 0 && tgt.rows.length > 0) {
        await client.query(
          `INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score)
           VALUES ($1, $2, 'equivalent', $3)`,
          [src.rows[0].id, tgt.rows[0].id, score]
        );
        mappingsCreated++;
      }
    }

    await client.query('COMMIT');

    console.log(`\n=== Seed Complete ===`);
    console.log(`Frameworks: ${frameworks.length}`);
    console.log(`Controls: ${totalControls}`);
    console.log(`Crosswalk Mappings: ${mappingsCreated}`);

    // Auto-subscribe the first org to free-tier frameworks
    const orgResult = await pool.query('SELECT id, tier FROM organizations LIMIT 1');
    if (orgResult.rows.length > 0) {
      const org = orgResult.rows[0];
      const communityFrameworks = await pool.query("SELECT id FROM frameworks WHERE tier_required = 'community'");
      for (const fw of communityFrameworks.rows) {
        await pool.query(
          `INSERT INTO organization_frameworks (organization_id, framework_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [org.id, fw.id]
        );
      }
      console.log(`\nAuto-subscribed org (${org.tier} tier) to ${communityFrameworks.rows.length} free frameworks`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
