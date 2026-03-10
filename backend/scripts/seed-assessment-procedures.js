// @tier: free
/**
 * Seed Assessment Procedures
 *
 * Based on NIST SP 800-53A Rev 5 testing procedures for SCAs,
 * plus equivalent assessment procedures for ISO 27001, SOC 2,
 * NIST CSF, NIST 800-171, HIPAA, GDPR, CMMC 2.0, and other frameworks.
 *
 * Each control gets examine/interview/test procedures (NIST style)
 * or equivalent audit_step/inquiry/observation/inspection procedures.
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'grc_platform',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ============================================================
// NIST 800-53A Assessment Procedures (Examine/Interview/Test)
// Maps to NIST 800-53 Rev 5 control IDs
// ============================================================
const NIST_800_53A_PROCEDURES = {
  // ACCESS CONTROL (AC) Family
  'AC-1': [
    {
      procedure_id: 'AC-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine access control policy',
      description: 'Examine the access control policy to determine if it addresses purpose, scope, roles, responsibilities, management commitment, coordination among organizational entities, and compliance.',
      expected_evidence: 'Documented access control policy; procedures addressing access control implementation; organizational records showing policy dissemination',
      assessment_method: 'document_review',
      depth: 'basic',
      assessor_notes: 'Verify the policy is current (reviewed within the last 12 months), approved by appropriate authority, and disseminated to all relevant personnel.',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-01(a)[02]',
      procedure_type: 'interview',
      title: 'Interview organizational personnel with access control responsibilities',
      description: 'Interview organizational personnel with access control responsibilities to determine if the access control policy and procedures are understood, followed, and maintained.',
      expected_evidence: 'Interview notes demonstrating personnel understand their access control responsibilities',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      assessor_notes: 'Interview at least the ISSO, system administrator, and one end user. Document their understanding of access control policies.',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-01(b)[01]',
      procedure_type: 'examine',
      title: 'Examine access control policy review records',
      description: 'Examine records of access control policy reviews to determine if the policy is reviewed and updated at the organization-defined frequency.',
      expected_evidence: 'Policy version history; review meeting minutes; approval signatures with dates',
      assessment_method: 'document_review',
      depth: 'basic',
      frequency_guidance: 'At least annually or when significant changes occur',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AC-2': [
    {
      procedure_id: 'AC-02(a)[01]',
      procedure_type: 'examine',
      title: 'Examine account management procedures',
      description: 'Examine the account management procedures and identify the types of accounts allowed and specifically prohibited on the system.',
      expected_evidence: 'Account management procedures; list of authorized account types; system configuration settings showing account type restrictions',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-02(a)[02]',
      procedure_type: 'test',
      title: 'Test account management mechanisms',
      description: 'Test automated mechanisms supporting account management by attempting to create accounts of each type (authorized and prohibited) to verify proper enforcement.',
      expected_evidence: 'Test results showing prohibited account types are blocked; screenshots of account provisioning workflows',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Attempt to create at least one prohibited account type. Verify group/role account creation follows documented procedures. Check for orphaned accounts.',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-02(d)[01]',
      procedure_type: 'interview',
      title: 'Interview account managers on account lifecycle',
      description: 'Interview personnel responsible for account management regarding the process for creating, enabling, modifying, disabling, and removing accounts.',
      expected_evidence: 'Interview notes documenting understanding of account lifecycle procedures',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-02(j)[01]',
      procedure_type: 'examine',
      title: 'Examine account review records',
      description: 'Examine records of account reviews to verify accounts are reviewed at the organization-defined frequency for compliance with account management requirements.',
      expected_evidence: 'Account review logs; user access reports; recertification records',
      assessment_method: 'document_review',
      depth: 'focused',
      frequency_guidance: 'At least quarterly for privileged accounts, semi-annually for standard accounts',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AC-3': [
    {
      procedure_id: 'AC-03[01]',
      procedure_type: 'examine',
      title: 'Examine access enforcement policy and mechanisms',
      description: 'Examine the access control policy, procedures, and system configuration to determine if the system enforces approved authorizations for logical access.',
      expected_evidence: 'Access control lists; RBAC configurations; system security plan section on access enforcement',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-03[02]',
      procedure_type: 'test',
      title: 'Test access enforcement mechanisms',
      description: 'Test the system access enforcement mechanisms by attempting authorized and unauthorized access to system resources with different user roles.',
      expected_evidence: 'Test results showing access is properly granted/denied per policy; penetration test results',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Test with at least 3 different role levels. Attempt horizontal and vertical privilege escalation. Verify least privilege enforcement.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AC-6': [
    {
      procedure_id: 'AC-06[01]',
      procedure_type: 'examine',
      title: 'Examine least privilege implementation',
      description: 'Examine organizational policy, procedures, and system configurations to determine if the principle of least privilege is employed.',
      expected_evidence: 'Role definitions with minimum permissions; privilege assignment documentation; system configuration screenshots',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-06[02]',
      procedure_type: 'test',
      title: 'Test least privilege enforcement',
      description: 'Test system mechanisms to verify users are allocated only the minimum access needed to perform their duties.',
      expected_evidence: 'Access matrix; test results showing users cannot exceed assigned privileges',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-06[03]',
      procedure_type: 'interview',
      title: 'Interview system administrators on privilege management',
      description: 'Interview system administrators to determine how least privilege is enforced and how privilege requests are reviewed and approved.',
      expected_evidence: 'Documented privilege request workflow; approval authority designations',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AC-7': [
    {
      procedure_id: 'AC-07[01]',
      procedure_type: 'test',
      title: 'Test unsuccessful logon attempt handling',
      description: 'Test the system by deliberately entering incorrect credentials to verify the account lockout mechanism activates after the defined number of consecutive failures.',
      expected_evidence: 'Test results showing lockout after N failed attempts; lockout duration confirmation',
      assessment_method: 'system_test',
      depth: 'basic',
      assessor_notes: 'Document the lockout threshold and duration. Verify automatic unlock mechanism if configured.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AC-17': [
    {
      procedure_id: 'AC-17(a)[01]',
      procedure_type: 'examine',
      title: 'Examine remote access policy and procedures',
      description: 'Examine remote access policy, configuration settings, and usage restrictions to determine if remote access is properly controlled.',
      expected_evidence: 'Remote access policy; VPN configuration; remote access authorization records; connection logs',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AC-17(a)[02]',
      procedure_type: 'test',
      title: 'Test remote access controls',
      description: 'Test remote access mechanisms to verify only authorized methods are allowed and encryption is enforced for all remote sessions.',
      expected_evidence: 'VPN test results; encryption validation; unauthorized access attempt logs',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // AWARENESS AND TRAINING (AT) Family
  'AT-1': [
    {
      procedure_id: 'AT-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine security awareness and training policy',
      description: 'Examine the security awareness and training policy and procedures to determine if they address purpose, scope, roles, responsibilities, and compliance requirements.',
      expected_evidence: 'Security awareness policy; training procedures; training material inventory',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AT-2': [
    {
      procedure_id: 'AT-02[01]',
      procedure_type: 'examine',
      title: 'Examine security awareness training program',
      description: 'Examine security awareness training materials and completion records to determine if all personnel receive initial and annual refresher training.',
      expected_evidence: 'Training materials; LMS completion records; training attendance rosters; training content covering social engineering, insider threats, APTs',
      assessment_method: 'document_review',
      depth: 'focused',
      frequency_guidance: 'Initial training within 30 days of hire; annual refresher thereafter',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AT-02[02]',
      procedure_type: 'interview',
      title: 'Interview personnel on security awareness',
      description: 'Interview a sample of organizational personnel to determine their understanding of security awareness topics and their responsibilities.',
      expected_evidence: 'Interview notes showing personnel understand phishing, social engineering, password hygiene, incident reporting',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      assessor_notes: 'Select a random sample of at least 5 personnel from different departments. Include both technical and non-technical staff.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // AUDIT AND ACCOUNTABILITY (AU) Family
  'AU-1': [
    {
      procedure_id: 'AU-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine audit and accountability policy',
      description: 'Examine the audit and accountability policy to determine if it defines auditable events, audit storage requirements, and response to audit failures.',
      expected_evidence: 'Audit policy; audit procedures; list of auditable events; audit storage capacity planning',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AU-2': [
    {
      procedure_id: 'AU-02(a)[01]',
      procedure_type: 'examine',
      title: 'Examine audit event definitions',
      description: 'Examine audit event definitions to verify the system is configured to audit the events identified as necessary for investigation of security incidents.',
      expected_evidence: 'List of auditable events; system audit configuration; event categorization matrix',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AU-02(a)[02]',
      procedure_type: 'test',
      title: 'Test audit event generation',
      description: 'Test the system to verify it generates audit records for the defined set of auditable events, including successful and unsuccessful login attempts, privilege changes, and data access.',
      expected_evidence: 'Audit log samples showing all required event types are captured; test results for each auditable event category',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Trigger at least one event of each auditable type and verify it appears in the audit log with correct detail level.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AU-3': [
    {
      procedure_id: 'AU-03[01]',
      procedure_type: 'examine',
      title: 'Examine audit record content',
      description: 'Examine audit records to verify they contain sufficient information: what type of event, when the event occurred, where, the source, the outcome, and the identity of the individual/subject.',
      expected_evidence: 'Sample audit records showing all required fields: event type, timestamp, source, outcome, user identity',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'AU-6': [
    {
      procedure_id: 'AU-06(a)[01]',
      procedure_type: 'examine',
      title: 'Examine audit review and analysis procedures',
      description: 'Examine audit review procedures and records to determine if audit records are reviewed and analyzed at the defined frequency for indications of inappropriate or unusual activity.',
      expected_evidence: 'Audit review schedule; SIEM configuration; alert rules; audit review reports',
      assessment_method: 'document_review',
      depth: 'focused',
      frequency_guidance: 'At least weekly for privileged actions; daily automated alerting recommended',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'AU-06(a)[02]',
      procedure_type: 'interview',
      title: 'Interview audit review personnel',
      description: 'Interview personnel responsible for audit review to determine the process for identifying and responding to anomalous activities.',
      expected_evidence: 'Interview notes; documented escalation procedures; incident response correlation',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // CONFIGURATION MANAGEMENT (CM) Family
  'CM-1': [
    {
      procedure_id: 'CM-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine configuration management policy',
      description: 'Examine the configuration management policy and procedures to verify they address purpose, scope, roles, responsibilities, and compliance.',
      expected_evidence: 'CM policy; CM plan; baseline configuration documentation',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'CM-2': [
    {
      procedure_id: 'CM-02[01]',
      procedure_type: 'examine',
      title: 'Examine baseline configurations',
      description: 'Examine baseline configuration documentation to verify current, documented baseline configurations exist for all system components.',
      expected_evidence: 'Baseline configuration documents; configuration management database entries; approved deviation records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'CM-02[02]',
      procedure_type: 'test',
      title: 'Test baseline configuration compliance',
      description: 'Test a sample of system components to verify their actual configuration matches the documented baseline configuration.',
      expected_evidence: 'Compliance scan results; configuration comparison reports; deviation documentation',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Scan at least 10% of systems or a minimum of 5 systems. Compare against documented baseline. Document all deviations.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'CM-6': [
    {
      procedure_id: 'CM-06[01]',
      procedure_type: 'examine',
      title: 'Examine configuration settings',
      description: 'Examine configuration settings documentation, including security configuration checklists (STIGs, CIS Benchmarks), to verify the most restrictive settings are applied.',
      expected_evidence: 'Security configuration checklists; STIG compliance reports; CIS benchmark scan results',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'CM-06[02]',
      procedure_type: 'test',
      title: 'Test security configuration settings',
      description: 'Test system security configuration settings using automated scanning tools to verify compliance with approved security configuration checklists.',
      expected_evidence: 'Automated scan results (Nessus, Qualys, etc.); STIG Viewer results; remediation plans for non-compliant settings',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'CM-8': [
    {
      procedure_id: 'CM-08[01]',
      procedure_type: 'examine',
      title: 'Examine system component inventory',
      description: 'Examine the system component inventory to verify it is accurate, current, and includes all components within the authorization boundary.',
      expected_evidence: 'System inventory (hardware, software, firmware); network diagrams; asset management database',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // CONTINGENCY PLANNING (CP) Family
  'CP-1': [
    {
      procedure_id: 'CP-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine contingency planning policy',
      description: 'Examine the contingency planning policy and procedures to verify they address all aspects of business continuity and disaster recovery.',
      expected_evidence: 'Contingency planning policy; business continuity plan; disaster recovery plan',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'CP-2': [
    {
      procedure_id: 'CP-02[01]',
      procedure_type: 'examine',
      title: 'Examine contingency plan',
      description: 'Examine the contingency plan to verify it includes essential mission/business functions, recovery objectives, restoration priorities, roles and responsibilities, and contact information.',
      expected_evidence: 'Contingency plan; RTO/RPO definitions; recovery team contact list; essential functions list',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // IDENTIFICATION AND AUTHENTICATION (IA) Family
  'IA-1': [
    {
      procedure_id: 'IA-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine identification and authentication policy',
      description: 'Examine the identification and authentication policy and procedures to verify they address all aspects of user and device I&A.',
      expected_evidence: 'I&A policy; authentication procedures; identity proofing procedures',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'IA-2': [
    {
      procedure_id: 'IA-02[01]',
      procedure_type: 'test',
      title: 'Test user identification and authentication',
      description: 'Test the system to verify it uniquely identifies and authenticates organizational users (or processes acting on behalf of users).',
      expected_evidence: 'Authentication mechanism test results; MFA enrollment records; shared account prohibition verification',
      assessment_method: 'system_test',
      depth: 'focused',
      assessor_notes: 'Verify MFA is enforced for all privileged users. Test that shared/group accounts are prohibited or controlled.',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'IA-02[02]',
      procedure_type: 'examine',
      title: 'Examine authentication mechanism configuration',
      description: 'Examine authentication system configuration to verify multi-factor authentication is enabled and properly configured.',
      expected_evidence: 'MFA configuration screenshots; authentication policy settings; approved authenticator types',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'IA-5': [
    {
      procedure_id: 'IA-05[01]',
      procedure_type: 'examine',
      title: 'Examine authenticator management procedures',
      description: 'Examine authenticator management procedures to verify they address initial distribution, lost/compromised/damaged authenticators, and authenticator revocation.',
      expected_evidence: 'Password policy; authenticator distribution procedures; revocation procedures; complexity requirements',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'IA-05[02]',
      procedure_type: 'test',
      title: 'Test password complexity enforcement',
      description: 'Test the system password complexity requirements by attempting to set passwords that violate the policy.',
      expected_evidence: 'Test results showing weak passwords are rejected; password policy configuration screenshots',
      assessment_method: 'system_test',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // INCIDENT RESPONSE (IR) Family
  'IR-1': [
    {
      procedure_id: 'IR-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine incident response policy',
      description: 'Examine the incident response policy and procedures for completeness including purpose, scope, roles, responsibilities, and compliance.',
      expected_evidence: 'Incident response policy; IR plan; IR procedures; organizational commitment to IR',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'IR-4': [
    {
      procedure_id: 'IR-04[01]',
      procedure_type: 'examine',
      title: 'Examine incident handling procedures',
      description: 'Examine incident handling procedures and records of past incidents to determine if the organization handles incidents in accordance with the incident response plan.',
      expected_evidence: 'IR plan; incident tickets/records; post-incident reports; lessons learned documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'IR-04[02]',
      procedure_type: 'interview',
      title: 'Interview incident response team members',
      description: 'Interview incident response team members to determine their understanding of incident handling procedures, roles, and communication channels.',
      expected_evidence: 'Interview notes; IR team roster; communication plan understanding; escalation path knowledge',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // RISK ASSESSMENT (RA) Family
  'RA-1': [
    {
      procedure_id: 'RA-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine risk assessment policy',
      description: 'Examine the risk assessment policy and procedures to verify they address purpose, scope, roles, responsibilities, and compliance.',
      expected_evidence: 'Risk assessment policy; risk assessment procedures; organizational risk tolerance statement',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'RA-3': [
    {
      procedure_id: 'RA-03[01]',
      procedure_type: 'examine',
      title: 'Examine risk assessment results',
      description: 'Examine the risk assessment results to verify the assessment identifies threats, vulnerabilities, likelihoods, impacts, and risk levels for the system.',
      expected_evidence: 'Risk assessment report; threat catalog; vulnerability assessment results; risk register',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'RA-03[02]',
      procedure_type: 'examine',
      title: 'Examine risk assessment update records',
      description: 'Examine records to verify the risk assessment is updated at the organization-defined frequency or when significant changes occur.',
      expected_evidence: 'Risk assessment version history; change trigger documentation; update schedule',
      assessment_method: 'document_review',
      depth: 'focused',
      frequency_guidance: 'At least annually and upon significant system changes',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'RA-5': [
    {
      procedure_id: 'RA-05[01]',
      procedure_type: 'examine',
      title: 'Examine vulnerability scanning procedures',
      description: 'Examine vulnerability scanning procedures and results to verify the organization scans for vulnerabilities at the required frequency and remediates findings.',
      expected_evidence: 'Vulnerability scanning policy; scan results; remediation tracking; scan tool configuration',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'RA-05[02]',
      procedure_type: 'test',
      title: 'Test vulnerability scanning capability',
      description: 'Test the vulnerability scanning process by reviewing recent scan results and verifying that identified vulnerabilities are tracked and remediated.',
      expected_evidence: 'Recent scan reports; vulnerability tracking database; remediation timelines; patch management records',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Verify scans cover all systems within the authorization boundary. Check for authenticated vs. unauthenticated scanning.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // SYSTEM AND COMMUNICATIONS PROTECTION (SC) Family
  'SC-1': [
    {
      procedure_id: 'SC-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine system and communications protection policy',
      description: 'Examine the system and communications protection policy and procedures for completeness and currency.',
      expected_evidence: 'SC policy; encryption standards; network protection procedures',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'SC-7': [
    {
      procedure_id: 'SC-07[01]',
      procedure_type: 'examine',
      title: 'Examine boundary protection mechanisms',
      description: 'Examine boundary protection documentation including network diagrams, firewall rules, and DMZ configurations.',
      expected_evidence: 'Network architecture diagrams; firewall rule sets; DMZ design; boundary component inventory',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'SC-07[02]',
      procedure_type: 'test',
      title: 'Test boundary protection enforcement',
      description: 'Test boundary protection by attempting to bypass boundary controls and verifying that only authorized communications are permitted.',
      expected_evidence: 'Penetration test results; port scan results; firewall rule validation; traffic analysis',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'SC-8': [
    {
      procedure_id: 'SC-08[01]',
      procedure_type: 'test',
      title: 'Test transmission confidentiality and integrity',
      description: 'Test the system to verify that cryptographic mechanisms protect the confidentiality and integrity of transmitted information.',
      expected_evidence: 'TLS configuration test results; encrypted channel verification; protocol analysis',
      assessment_method: 'system_test',
      depth: 'focused',
      assessor_notes: 'Verify TLS 1.2+ is enforced. Check for weak cipher suites. Validate certificate management.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // SYSTEM AND INFORMATION INTEGRITY (SI) Family
  'SI-1': [
    {
      procedure_id: 'SI-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine system and information integrity policy',
      description: 'Examine the system and information integrity policy and procedures for completeness.',
      expected_evidence: 'SI policy; integrity monitoring procedures; malware protection procedures',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'SI-2': [
    {
      procedure_id: 'SI-02[01]',
      procedure_type: 'examine',
      title: 'Examine flaw remediation procedures',
      description: 'Examine flaw remediation procedures and patch management records to verify the organization identifies, reports, and corrects system flaws.',
      expected_evidence: 'Patch management policy; patch deployment records; vulnerability remediation timelines; WSUS/SCCM reports',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'SI-02[02]',
      procedure_type: 'test',
      title: 'Test flaw remediation implementation',
      description: 'Test a sample of systems to verify current patch levels and that critical patches are applied within the required timeframe.',
      expected_evidence: 'Patch compliance scan results; missing patch reports; patch deployment verification',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Check at least 10% of systems. Focus on critical/high severity patches. Verify patches are tested before production deployment.',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'SI-4': [
    {
      procedure_id: 'SI-04[01]',
      procedure_type: 'examine',
      title: 'Examine system monitoring strategy',
      description: 'Examine the system monitoring strategy, tools, and alert configurations to verify comprehensive monitoring coverage.',
      expected_evidence: 'Monitoring strategy document; SIEM configuration; IDS/IPS configuration; alert rules; monitoring coverage matrix',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    },
    {
      procedure_id: 'SI-04[02]',
      procedure_type: 'test',
      title: 'Test monitoring detection capabilities',
      description: 'Test monitoring tools by generating test events and verifying they are detected, alerted, and properly correlated.',
      expected_evidence: 'Test event results; alert notifications; SIEM correlation rules; detection time measurements',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // PLANNING (PL) Family
  'PL-1': [
    {
      procedure_id: 'PL-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine planning policy',
      description: 'Examine the planning policy and procedures to verify they address system security plan development and maintenance.',
      expected_evidence: 'Planning policy; SSP template; SSP maintenance schedule',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
  'PL-2': [
    {
      procedure_id: 'PL-02[01]',
      procedure_type: 'examine',
      title: 'Examine system security plan',
      description: 'Examine the system security plan to verify it is consistent with the organizational security architecture, describes the operational environment, and addresses all required security controls.',
      expected_evidence: 'System security plan; authorization boundary description; control implementation statements',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // PERSONNEL SECURITY (PS) Family
  'PS-1': [
    {
      procedure_id: 'PS-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine personnel security policy',
      description: 'Examine personnel security policy and procedures to verify they address position categorization, screening, termination, and transfer.',
      expected_evidence: 'Personnel security policy; position risk designation records; screening procedures',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // PHYSICAL AND ENVIRONMENTAL PROTECTION (PE) Family
  'PE-1': [
    {
      procedure_id: 'PE-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine physical and environmental protection policy',
      description: 'Examine the physical and environmental protection policy and procedures for completeness.',
      expected_evidence: 'Physical security policy; facility security plan; environmental protection procedures',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // SYSTEM AND SERVICES ACQUISITION (SA) Family
  'SA-1': [
    {
      procedure_id: 'SA-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine system and services acquisition policy',
      description: 'Examine the acquisition policy and procedures to verify they address security requirements in the SDLC.',
      expected_evidence: 'Acquisition policy; SDLC documentation; security requirements in RFPs/contracts',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // MAINTENANCE (MA) Family
  'MA-1': [
    {
      procedure_id: 'MA-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine maintenance policy',
      description: 'Examine the maintenance policy and procedures to verify they address system maintenance requirements.',
      expected_evidence: 'Maintenance policy; maintenance schedule; maintenance personnel authorization',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // MEDIA PROTECTION (MP) Family
  'MP-1': [
    {
      procedure_id: 'MP-01(a)[01]',
      procedure_type: 'examine',
      title: 'Examine media protection policy',
      description: 'Examine the media protection policy and procedures to verify they address media access, marking, storage, transport, sanitization, and disposal.',
      expected_evidence: 'Media protection policy; media handling procedures; sanitization records',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],

  // PROGRAM MANAGEMENT (PM) Family - additional key controls
  'PM-1': [
    {
      procedure_id: 'PM-01[01]',
      procedure_type: 'examine',
      title: 'Examine information security program plan',
      description: 'Examine the information security program plan to verify it provides an overview of the requirements for the security program and describes the program management controls.',
      expected_evidence: 'Information security program plan; resource allocation documentation; program milestones',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5'
    }
  ],
};

// ============================================================
// ISO 27001:2022 Audit Procedures (based on ISO 19011 methodology)
// Maps to Annex A controls
// ============================================================
const ISO_27001_PROCEDURES = {
  'A.5.1': [
    {
      procedure_id: 'A.5.1-01',
      procedure_type: 'audit_step',
      title: 'Verify information security policies exist and are approved',
      description: 'Review the set of information security policies to confirm they are defined, approved by management, published, and communicated to relevant interested parties.',
      expected_evidence: 'Information security policy document; management approval records; communication records; staff acknowledgements',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
    {
      procedure_id: 'A.5.1-02',
      procedure_type: 'inquiry',
      title: 'Interview management on policy commitment',
      description: 'Interview top management to confirm their commitment to information security and their understanding of the ISMS scope and objectives.',
      expected_evidence: 'Interview records showing management commitment; resource allocation evidence; management review minutes',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.5.2': [
    {
      procedure_id: 'A.5.2-01',
      procedure_type: 'audit_step',
      title: 'Verify information security roles and responsibilities',
      description: 'Verify that information security roles and responsibilities are defined and allocated. Confirm that conflicting duties and areas of responsibility are segregated.',
      expected_evidence: 'RACI matrix; role descriptions; organizational charts; appointment letters',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.5.10': [
    {
      procedure_id: 'A.5.10-01',
      procedure_type: 'audit_step',
      title: 'Verify acceptable use of information and assets',
      description: 'Verify that rules for acceptable use and procedures for handling information and assets are identified, documented, and implemented.',
      expected_evidence: 'Acceptable use policy; asset handling procedures; signed user agreements; classification scheme',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.5.23': [
    {
      procedure_id: 'A.5.23-01',
      procedure_type: 'audit_step',
      title: 'Verify cloud services security',
      description: 'Verify that processes for acquisition, use, management, and exit from cloud services are established in accordance with the organization\'s information security requirements.',
      expected_evidence: 'Cloud security policy; cloud service agreements; SLA monitoring; cloud risk assessments; shared responsibility matrix',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.6.1': [
    {
      procedure_id: 'A.6.1-01',
      procedure_type: 'audit_step',
      title: 'Verify personnel screening',
      description: 'Verify that background verification checks on all candidates for employment are carried out prior to joining the organization and on an ongoing basis.',
      expected_evidence: 'Screening policy; background check records; ongoing verification schedule; contractual requirements',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.6.3': [
    {
      procedure_id: 'A.6.3-01',
      procedure_type: 'audit_step',
      title: 'Verify information security awareness, education, and training',
      description: 'Verify that personnel and relevant interested parties receive appropriate awareness education and training, and regular updates of the organization\'s policies and procedures.',
      expected_evidence: 'Training program; attendance records; awareness materials; competency assessments; training needs analysis',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
    {
      procedure_id: 'A.6.3-02',
      procedure_type: 'inquiry',
      title: 'Interview staff on security awareness',
      description: 'Interview a sample of staff to verify their awareness of security policies, incident reporting procedures, and their role-specific security responsibilities.',
      expected_evidence: 'Interview notes; evidence of awareness; understanding of reporting channels',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.7.1': [
    {
      procedure_id: 'A.7.1-01',
      procedure_type: 'observation',
      title: 'Observe physical security perimeters',
      description: 'Observe physical security perimeters to verify they are defined and appropriate controls are in place to protect areas containing information and information processing facilities.',
      expected_evidence: 'Physical inspection notes; perimeter control documentation; access control system records',
      assessment_method: 'observation',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.8.1': [
    {
      procedure_id: 'A.8.1-01',
      procedure_type: 'audit_step',
      title: 'Verify user endpoint device security',
      description: 'Verify that information stored on, processed by, or accessible via user endpoint devices is protected.',
      expected_evidence: 'Endpoint security policy; MDM configuration; encryption status; endpoint protection platform logs',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
    {
      procedure_id: 'A.8.1-02',
      procedure_type: 'inspection',
      title: 'Inspect endpoint security controls',
      description: 'Inspect a sample of user endpoint devices to verify encryption, anti-malware, and patch compliance.',
      expected_evidence: 'Device inspection records; compliance scan results; encryption verification',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.8.9': [
    {
      procedure_id: 'A.8.9-01',
      procedure_type: 'audit_step',
      title: 'Verify configuration management',
      description: 'Verify that configurations of hardware, software, services, and networks are established, documented, implemented, monitored, and reviewed.',
      expected_evidence: 'Configuration management procedures; baseline configurations; configuration change records; compliance monitoring',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.8.15': [
    {
      procedure_id: 'A.8.15-01',
      procedure_type: 'audit_step',
      title: 'Verify logging and monitoring',
      description: 'Verify that logs recording activities, exceptions, faults, and other relevant events are produced, stored, protected, and analyzed.',
      expected_evidence: 'Logging policy; log configuration; log samples; SIEM configuration; log retention evidence',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
    {
      procedure_id: 'A.8.15-02',
      procedure_type: 'inspection',
      title: 'Inspect log monitoring and alerting',
      description: 'Inspect monitoring dashboards and alert configurations to verify anomalous activities are detected and escalated.',
      expected_evidence: 'SIEM dashboard screenshots; alert rules; escalation procedures; recent alert samples',
      assessment_method: 'system_test',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
  'A.8.24': [
    {
      procedure_id: 'A.8.24-01',
      procedure_type: 'audit_step',
      title: 'Verify cryptographic controls',
      description: 'Verify that rules for the effective use of cryptography, including key management, are defined and implemented.',
      expected_evidence: 'Cryptographic policy; key management procedures; certificate inventory; encryption standards',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    }
  ],
};

// ============================================================
// SOC 2 Trust Services Criteria Testing Procedures
// ============================================================
const SOC2_PROCEDURES = {
  'CC1.1': [
    {
      procedure_id: 'CC1.1-01',
      procedure_type: 'audit_step',
      title: 'Inspect code of conduct and ethics policies',
      description: 'Inspect the organization\'s code of conduct and ethics policies. Verify they are communicated to all personnel and acknowledged.',
      expected_evidence: 'Code of conduct; ethics policy; signed acknowledgement forms; annual training records',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC1.2': [
    {
      procedure_id: 'CC1.2-01',
      procedure_type: 'audit_step',
      title: 'Verify board of directors oversight',
      description: 'Verify that the board of directors demonstrates independence from management and exercises oversight of the development and performance of internal controls.',
      expected_evidence: 'Board meeting minutes; audit committee charter; independence declarations; oversight activities documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC2.1': [
    {
      procedure_id: 'CC2.1-01',
      procedure_type: 'audit_step',
      title: 'Verify internal communication of security information',
      description: 'Verify that the entity obtains or generates and uses relevant, quality information to support the functioning of internal controls related to security.',
      expected_evidence: 'Security dashboards; management reports; information flow diagrams; reporting procedures',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC3.1': [
    {
      procedure_id: 'CC3.1-01',
      procedure_type: 'audit_step',
      title: 'Verify risk assessment process',
      description: 'Verify that the entity specifies objectives with sufficient clarity to enable the identification and assessment of risks relating to objectives.',
      expected_evidence: 'Risk assessment methodology; risk register; objective-risk mapping; risk appetite statement',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC5.1': [
    {
      procedure_id: 'CC5.1-01',
      procedure_type: 'audit_step',
      title: 'Verify control activity selection and development',
      description: 'Verify that the entity selects and develops control activities that contribute to the mitigation of risks to the achievement of objectives to acceptable levels.',
      expected_evidence: 'Control inventory; risk-control mapping; control design documentation; control testing results',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC6.1': [
    {
      procedure_id: 'CC6.1-01',
      procedure_type: 'audit_step',
      title: 'Verify logical access security controls',
      description: 'Verify that logical access security software, infrastructure, and architectures have been implemented to support access control policies.',
      expected_evidence: 'Access control matrix; RBAC configuration; authentication mechanisms; access provisioning procedures',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    },
    {
      procedure_id: 'CC6.1-02',
      procedure_type: 'test',
      title: 'Test logical access controls',
      description: 'Test a sample of user access to verify it is appropriate for job functions and that terminated user access has been revoked timely.',
      expected_evidence: 'User access listing; termination cross-reference; access review evidence; test results',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      assessor_notes: 'Select a sample of 25 users (or 10% whichever is greater). Cross-reference active accounts against HR records.',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC6.2': [
    {
      procedure_id: 'CC6.2-01',
      procedure_type: 'audit_step',
      title: 'Verify user registration and authorization',
      description: 'Verify that new users are registered and authorized prior to being issued system credentials and that access is modified or removed when no longer needed.',
      expected_evidence: 'User provisioning workflow; access request forms; manager approvals; deprovisioning procedures; access review records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC6.3': [
    {
      procedure_id: 'CC6.3-01',
      procedure_type: 'audit_step',
      title: 'Verify role-based access controls',
      description: 'Verify that role-based access is established based on job functions and that authorization is required for access to system resources.',
      expected_evidence: 'RBAC definitions; role assignment records; periodic access certification results',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC6.6': [
    {
      procedure_id: 'CC6.6-01',
      procedure_type: 'audit_step',
      title: 'Verify boundary security controls',
      description: 'Verify that security measures are implemented to protect against threats from sources outside the system boundaries.',
      expected_evidence: 'Network diagrams; firewall configurations; IDS/IPS configurations; WAF configurations; penetration test results',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC7.1': [
    {
      procedure_id: 'CC7.1-01',
      procedure_type: 'audit_step',
      title: 'Verify monitoring of infrastructure and software',
      description: 'Verify that monitoring of the system infrastructure and software is implemented to detect security events and evaluate their effectiveness.',
      expected_evidence: 'Monitoring tools inventory; SIEM dashboard; alert thresholds; incident tickets generated from monitoring',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC7.2': [
    {
      procedure_id: 'CC7.2-01',
      procedure_type: 'audit_step',
      title: 'Verify anomaly detection and response',
      description: 'Verify that the entity monitors system components for anomalies that are indicative of malicious acts, natural disasters, and errors and that incidents are communicated to appropriate parties.',
      expected_evidence: 'Anomaly detection rules; incident response procedures; communication procedures; recent incident examples',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC7.3': [
    {
      procedure_id: 'CC7.3-01',
      procedure_type: 'audit_step',
      title: 'Verify incident response evaluation',
      description: 'Verify that security events are evaluated to determine whether they could or have resulted in a failure to meet objectives, and if so, the events are assessed and responded to.',
      expected_evidence: 'Incident classification criteria; severity matrix; incident response records; post-incident reviews',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC8.1': [
    {
      procedure_id: 'CC8.1-01',
      procedure_type: 'audit_step',
      title: 'Verify change management controls',
      description: 'Verify that changes to infrastructure, data, software, and procedures are authorized, designed, developed, configured, documented, tested, approved, and implemented.',
      expected_evidence: 'Change management policy; change tickets; approval workflows; test evidence; deployment records; rollback procedures',
      assessment_method: 'document_review',
      depth: 'focused',
      assessor_notes: 'Select a sample of 25 changes during the audit period. Verify each went through the full change management lifecycle.',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
  'CC9.1': [
    {
      procedure_id: 'CC9.1-01',
      procedure_type: 'audit_step',
      title: 'Verify risk mitigation strategies',
      description: 'Verify that the entity identifies, selects, and develops risk mitigation activities for risks arising from potential business disruptions.',
      expected_evidence: 'BCP/DR plans; risk treatment plans; insurance coverage; recovery testing results',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'AICPA SOC 2 Type II Guide'
    }
  ],
};

// ============================================================
// NIST CSF 2.0 Assessment Procedures
// ============================================================
const NIST_CSF_PROCEDURES = {
  'GV.OC-01': [
    {
      procedure_id: 'GV.OC-01-P01',
      procedure_type: 'examine',
      title: 'Examine organizational context documentation',
      description: 'Examine documentation to verify the organizational mission is understood and informs cybersecurity risk management.',
      expected_evidence: 'Mission statement; strategic plan; risk management strategy; cybersecurity program charter',
      assessment_method: 'document_review',
      depth: 'basic',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'GV.RM-01': [
    {
      procedure_id: 'GV.RM-01-P01',
      procedure_type: 'examine',
      title: 'Examine risk management objectives',
      description: 'Examine risk management documentation to verify objectives are established and agreed to by organizational stakeholders.',
      expected_evidence: 'Risk management policy; risk appetite statement; stakeholder agreement records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'ID.AM-01': [
    {
      procedure_id: 'ID.AM-01-P01',
      procedure_type: 'examine',
      title: 'Verify hardware asset inventory',
      description: 'Verify that inventories of hardware managed by the organization are maintained and complete.',
      expected_evidence: 'Hardware asset inventory; automated discovery scan results; CMDB records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'ID.AM-02': [
    {
      procedure_id: 'ID.AM-02-P01',
      procedure_type: 'examine',
      title: 'Verify software asset inventory',
      description: 'Verify that inventories of software, services, and systems managed by the organization are maintained.',
      expected_evidence: 'Software inventory; license management records; SaaS inventory; API inventory',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'ID.RA-01': [
    {
      procedure_id: 'ID.RA-01-P01',
      procedure_type: 'examine',
      title: 'Verify vulnerability identification',
      description: 'Verify that vulnerabilities in assets are identified, validated, and recorded.',
      expected_evidence: 'Vulnerability scan results; vulnerability tracking records; CVE correlation; penetration test findings',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'PR.AA-01': [
    {
      procedure_id: 'PR.AA-01-P01',
      procedure_type: 'examine',
      title: 'Verify identity management',
      description: 'Verify that identities and credentials for authorized users, services, and hardware are managed by the organization.',
      expected_evidence: 'Identity management procedures; credential lifecycle documentation; identity governance records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'PR.DS-01': [
    {
      procedure_id: 'PR.DS-01-P01',
      procedure_type: 'examine',
      title: 'Verify data-at-rest protection',
      description: 'Verify that the confidentiality, integrity, and availability of data-at-rest are protected.',
      expected_evidence: 'Encryption configuration; data classification scheme; data protection controls; backup records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'DE.CM-01': [
    {
      procedure_id: 'DE.CM-01-P01',
      procedure_type: 'examine',
      title: 'Verify continuous monitoring',
      description: 'Verify that networks and network services are monitored to find potentially adverse events.',
      expected_evidence: 'Network monitoring configuration; SIEM/SOC operations; alert rules; monitoring coverage documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'RS.MA-01': [
    {
      procedure_id: 'RS.MA-01-P01',
      procedure_type: 'examine',
      title: 'Verify incident management plan',
      description: 'Verify that the incident response plan is executed in coordination with relevant third parties once an incident is declared.',
      expected_evidence: 'Incident response plan; communication procedures; third-party contact lists; incident records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
  'RC.RP-01': [
    {
      procedure_id: 'RC.RP-01-P01',
      procedure_type: 'examine',
      title: 'Verify recovery plan execution',
      description: 'Verify that the recovery portion of the incident response plan is executed once initiated.',
      expected_evidence: 'Recovery plan; recovery test results; RTO/RPO measurements; business continuity exercise records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'NIST CSF 2.0 Assessment Guide'
    }
  ],
};

// ============================================================
// HIPAA Assessment Procedures (based on HHS audit protocol)
// ============================================================
const HIPAA_PROCEDURES = {
  'HIPAA-164.308(a)(1)': [
    {
      procedure_id: 'HIPAA-308a1-01',
      procedure_type: 'audit_step',
      title: 'Verify security management process',
      description: 'Verify that the entity has implemented policies and procedures to prevent, detect, contain, and correct security violations through a comprehensive risk analysis and risk management program.',
      expected_evidence: 'Risk analysis documentation; risk management plan; security management process documentation; sanction policies',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.308(a)(3)': [
    {
      procedure_id: 'HIPAA-308a3-01',
      procedure_type: 'audit_step',
      title: 'Verify workforce security procedures',
      description: 'Verify that policies and procedures ensure all workforce members have appropriate access and prevent unauthorized access to ePHI.',
      expected_evidence: 'Workforce security procedures; authorization procedures; access termination procedures; access clearance records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.308(a)(4)': [
    {
      procedure_id: 'HIPAA-308a4-01',
      procedure_type: 'audit_step',
      title: 'Verify information access management',
      description: 'Verify that policies and procedures authorize access to ePHI consistent with the applicable requirements and that access is restricted on a need-to-know basis.',
      expected_evidence: 'Access authorization policies; role-based access controls; access review records; minimum necessary documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.308(a)(5)': [
    {
      procedure_id: 'HIPAA-308a5-01',
      procedure_type: 'audit_step',
      title: 'Verify security awareness and training',
      description: 'Verify that the entity has implemented a security awareness and training program for all workforce members including management.',
      expected_evidence: 'Training program documentation; training completion records; phishing simulation results; password management training',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.308(a)(6)': [
    {
      procedure_id: 'HIPAA-308a6-01',
      procedure_type: 'audit_step',
      title: 'Verify security incident procedures',
      description: 'Verify that the entity has implemented policies and procedures to address security incidents, including identification, response, mitigation, and documentation.',
      expected_evidence: 'Incident response plan; incident logs; breach notification procedures; remediation records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.312(a)(1)': [
    {
      procedure_id: 'HIPAA-312a1-01',
      procedure_type: 'audit_step',
      title: 'Verify access control technical safeguards',
      description: 'Verify that technical policies and procedures allow only authorized persons and software to access ePHI systems.',
      expected_evidence: 'Unique user ID assignment; emergency access procedures; automatic logoff configuration; encryption/decryption mechanisms',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    },
    {
      procedure_id: 'HIPAA-312a1-02',
      procedure_type: 'test',
      title: 'Test access control enforcement',
      description: 'Test access control mechanisms to verify unauthorized users cannot access ePHI and that emergency access procedures work correctly.',
      expected_evidence: 'Access control test results; emergency access test records; automatic logoff verification',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.312(c)(1)': [
    {
      procedure_id: 'HIPAA-312c1-01',
      procedure_type: 'audit_step',
      title: 'Verify integrity controls',
      description: 'Verify that policies and procedures protect ePHI from improper alteration or destruction, and that electronic mechanisms are in place to corroborate that ePHI has not been altered or destroyed.',
      expected_evidence: 'Integrity verification procedures; hash values; digital signatures; audit trails showing data modifications',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.312(d)': [
    {
      procedure_id: 'HIPAA-312d-01',
      procedure_type: 'audit_step',
      title: 'Verify person or entity authentication',
      description: 'Verify that procedures exist to verify the identity of a person or entity seeking access to ePHI.',
      expected_evidence: 'Authentication procedures; MFA configuration; identity verification methods; biometric systems documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
  'HIPAA-164.312(e)(1)': [
    {
      procedure_id: 'HIPAA-312e1-01',
      procedure_type: 'test',
      title: 'Test transmission security',
      description: 'Test transmission security controls to verify that ePHI transmitted over electronic communications networks is properly protected.',
      expected_evidence: 'Encryption configuration (TLS/SSL); integrity controls; transmission audit logs; email encryption records',
      assessment_method: 'system_test',
      depth: 'focused',
      source_document: 'HHS HIPAA Audit Protocol'
    }
  ],
};

// ============================================================
// HITECH Assessment Procedures (based on HHS HITECH enforcement guidance)
// ============================================================
const HITECH_PROCEDURES = {
  'HITECH-13401': [
    {
      procedure_id: 'HITECH-13401-01',
      procedure_type: 'examine',
      title: 'Examine unsecured PHI breach definition',
      description: 'Review the organization definition of unsecured PHI and verify alignment with HITECH Act §13402 definition of PHI that is not rendered unusable, unreadable, or indecipherable to unauthorized individuals.',
      expected_evidence: 'Breach response policy; definition of unsecured PHI; encryption standards documentation; data classification procedures',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13401; HHS Breach Notification Guidance'
    }
  ],
  'HITECH-13401d': [
    {
      procedure_id: 'HITECH-13401d-01',
      procedure_type: 'test',
      title: 'Test encryption and destruction safe harbor controls',
      description: 'Test that encryption methods meet NIST standards and that PHI destruction processes render data unrecoverable, qualifying for breach notification safe harbor.',
      expected_evidence: 'Encryption configuration (AES-256 or equivalent); NIST SP 800-111 compliance evidence; media destruction certificates; degaussing records',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13402(h); HHS Guidance on Rendering PHI Unusable'
    }
  ],
  'HITECH-13402': [
    {
      procedure_id: 'HITECH-13402-01',
      procedure_type: 'examine',
      title: 'Examine breach notification procedures for individuals',
      description: 'Review breach notification procedures to verify they include individual notification within 60 days of discovery, with required content per §13405.',
      expected_evidence: 'Breach notification policy; notification templates; breach log with timelines; sample notification letters',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13402(a)-(e)'
    },
    {
      procedure_id: 'HITECH-13402-02',
      procedure_type: 'interview',
      title: 'Interview privacy officer on breach response',
      description: 'Interview the privacy officer to confirm understanding of breach notification triggers, timeline requirements, and escalation procedures.',
      expected_evidence: 'Interview notes; role descriptions; incident response team roster',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'HITECH Act §13402'
    }
  ],
  'HITECH-13402d': [
    {
      procedure_id: 'HITECH-13402d-01',
      procedure_type: 'examine',
      title: 'Verify breach notification timeliness compliance',
      description: 'Examine breach incident records to verify notifications were sent without unreasonable delay and within 60 days of breach discovery.',
      expected_evidence: 'Breach incident log with discovery and notification dates; postal/email delivery records; HHS reporting submissions',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13402(d)'
    }
  ],
  'HITECH-13403': [
    {
      procedure_id: 'HITECH-13403-01',
      procedure_type: 'examine',
      title: 'Verify HHS breach notification process',
      description: 'Verify that breaches affecting 500+ individuals are reported to the Secretary of HHS without unreasonable delay, and smaller breaches are logged annually.',
      expected_evidence: 'HHS breach reporting records; annual small-breach log; reporting procedures',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13403'
    }
  ],
  'HITECH-13407': [
    {
      procedure_id: 'HITECH-13407-01',
      procedure_type: 'examine',
      title: 'Examine breach risk assessment methodology',
      description: 'Review the 4-factor risk assessment methodology used to determine if a breach requires notification: (1) nature/extent of PHI, (2) unauthorized person, (3) whether PHI was acquired/viewed, (4) extent risk mitigated.',
      expected_evidence: 'Risk assessment templates; completed breach risk assessments; decision documentation; legal review records',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13402; 45 CFR §164.402'
    }
  ],
  'HITECH-13408': [
    {
      procedure_id: 'HITECH-13408-01',
      procedure_type: 'examine',
      title: 'Verify business associate breach obligation compliance',
      description: 'Review business associate agreements and breach notification procedures to verify BAs notify covered entities of breaches without unreasonable delay.',
      expected_evidence: 'Business associate agreements with breach clauses; BA breach notification records; BA incident response procedures',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13408'
    }
  ],
  'HITECH-13410': [
    {
      procedure_id: 'HITECH-13410-01',
      procedure_type: 'examine',
      title: 'Verify business associate HIPAA compliance',
      description: 'Examine business associate agreements and compliance documentation to verify BAs are directly subject to HIPAA Security Rule requirements.', // ip-hygiene:ignore
      expected_evidence: 'Business associate agreements; BA security attestations; BA audit reports; compliance monitoring records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13410'
    }
  ],
  'HITECH-13410e': [
    {
      procedure_id: 'HITECH-13410e-01',
      procedure_type: 'test',
      title: 'Test EHR audit controls',
      description: 'Test electronic health record audit controls to verify they log access, modifications, and disclosures of electronic PHI including who accessed what and when.',
      expected_evidence: 'EHR audit log samples; audit trail configuration; log retention policies; access review reports',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13410(e)'
    }
  ],
  'HITECH-13411': [
    {
      procedure_id: 'HITECH-13411-01',
      procedure_type: 'examine',
      title: 'Verify subcontractor BA requirements',
      description: 'Verify that subcontractors of business associates are treated as business associates and have appropriate agreements in place.',
      expected_evidence: 'Subcontractor BA agreements; subcontractor inventory; downstream compliance monitoring records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13411'
    }
  ],
  'HITECH-13405a': [
    {
      procedure_id: 'HITECH-13405a-01',
      procedure_type: 'test',
      title: 'Test individual access to electronic PHI',
      description: 'Test the process for individuals to obtain electronic copies of their PHI from EHR systems and verify the organization provides access in the format requested.',
      expected_evidence: 'Access request procedures; sample fulfilled requests; electronic format options documentation; response time records',
      assessment_method: 'system_test',
      depth: 'focused',
      source_document: 'HITECH Act §13405(a)'
    }
  ],
  'HITECH-13405c': [
    {
      procedure_id: 'HITECH-13405c-01',
      procedure_type: 'examine',
      title: 'Examine accounting of disclosures for EHR',
      description: 'Verify the organization maintains and can produce an accounting of disclosures of PHI made through electronic health records, including treatment, payment, and health care operations disclosures.',
      expected_evidence: 'Disclosure accounting procedures; EHR disclosure logs; sample accounting reports; 3-year retention evidence',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13405(c)'
    }
  ],
  'HITECH-13406': [
    {
      procedure_id: 'HITECH-13406-01',
      procedure_type: 'examine',
      title: 'Verify marketing authorization restrictions',
      description: 'Verify that marketing communications using PHI require individual authorization and that any financial remuneration for marketing use of PHI is disclosed.',
      expected_evidence: 'Marketing authorization policies; authorization forms; financial remuneration disclosures; marketing communication records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13406'
    }
  ],
  'HITECH-13406a': [
    {
      procedure_id: 'HITECH-13406a-01',
      procedure_type: 'examine',
      title: 'Verify prohibition on sale of PHI',
      description: 'Verify the organization does not sell PHI without individual authorization and that all permitted exceptions (public health, research, treatment) are properly documented.',
      expected_evidence: 'PHI sale prohibition policy; data use agreements; authorization records for any permitted disclosures involving remuneration',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13405(d)'
    }
  ],
  'HITECH-13405e': [
    {
      procedure_id: 'HITECH-13405e-01',
      procedure_type: 'examine',
      title: 'Verify minimum necessary standard enforcement',
      description: 'Verify the organization applies the minimum necessary standard to all uses and disclosures of PHI, limiting information shared to the minimum amount needed for the intended purpose.',
      expected_evidence: 'Minimum necessary policies; role-based access justifications; limited data set agreements; workforce training records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'HITECH Act §13405(b)'
    }
  ],
  'HITECH-13412': [
    {
      procedure_id: 'HITECH-13412-01',
      procedure_type: 'test',
      title: 'Test EHR technology security certification',
      description: 'Verify that EHR systems used by the organization have current ONC Health IT Certification and meet the security requirements specified by the certification criteria.',
      expected_evidence: 'ONC certification records; CHPL listing verification; security configuration documentation; version currency records',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13412; ONC Health IT Certification Program'
    }
  ],
  'HITECH-13412a': [
    {
      procedure_id: 'HITECH-13412a-01',
      procedure_type: 'test',
      title: 'Test EHR vulnerability assessment and patching',
      description: 'Verify that EHR systems undergo regular vulnerability assessments and that identified vulnerabilities are remediated within defined SLAs aligned with NIST guidance.',
      expected_evidence: 'Vulnerability scan reports; patch management records; remediation timelines; CVSS scoring and prioritization documentation',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13412; NIST SP 800-53 RA-5'
    }
  ],
  'HITECH-13412b': [
    {
      procedure_id: 'HITECH-13412b-01',
      procedure_type: 'test',
      title: 'Test EHR encryption at rest and in transit',
      description: 'Test that EHR systems encrypt PHI both at rest and in transit using FIPS 140-2 validated cryptographic modules.',
      expected_evidence: 'Encryption configuration; TLS certificate records; database encryption settings; FIPS 140-2 validation certificates',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13412; NIST SP 800-111'
    }
  ],
  'HITECH-13412c': [
    {
      procedure_id: 'HITECH-13412c-01',
      procedure_type: 'test',
      title: 'Test EHR access logging and monitoring',
      description: 'Test that EHR systems maintain comprehensive access logs capturing user identity, timestamp, records accessed, and actions performed, with active monitoring for anomalies.',
      expected_evidence: 'Audit log configuration; sample log entries; monitoring alert rules; log retention policy; anomaly detection reports',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13412; HIPAA §164.312(b)'
    }
  ],
  'HITECH-13412d': [
    {
      procedure_id: 'HITECH-13412d-01',
      procedure_type: 'test',
      title: 'Test EHR integrity verification controls',
      description: 'Test that EHR systems maintain integrity controls including hash verification, digital signatures, and tamper detection for electronic PHI.',
      expected_evidence: 'Integrity check configurations; hash verification logs; digital signature records; tamper detection alerts; data validation rules',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'HITECH Act §13412; HIPAA §164.312(c)'
    }
  ],
};

// ============================================================
// GDPR Assessment Procedures (based on DPA audit methodology)
// ============================================================
const GDPR_PROCEDURES = {
  'GDPR-5': [
    {
      procedure_id: 'GDPR-Art5-01',
      procedure_type: 'audit_step',
      title: 'Verify data processing principles',
      description: 'Verify that personal data is processed in accordance with all processing principles: lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity and confidentiality, and accountability.',
      expected_evidence: 'Data processing register (ROPA); lawful basis documentation; privacy notices; data retention schedules; data quality procedures',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-6': [
    {
      procedure_id: 'GDPR-Art6-01',
      procedure_type: 'audit_step',
      title: 'Verify lawful basis for processing',
      description: 'Verify that each processing activity has an identified and documented lawful basis under Article 6.',
      expected_evidence: 'Lawful basis register; consent records; legitimate interest assessments; contractual necessity documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-13': [
    {
      procedure_id: 'GDPR-Art13-01',
      procedure_type: 'audit_step',
      title: 'Verify transparency obligations',
      description: 'Verify that data subjects are provided with all required information at the time of data collection (identity, purposes, legal basis, recipients, retention periods, rights).',
      expected_evidence: 'Privacy notices; consent forms; information provided at data collection points; layered privacy notices',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-15': [
    {
      procedure_id: 'GDPR-Art15-01',
      procedure_type: 'audit_step',
      title: 'Verify right of access procedures',
      description: 'Verify that the organization has procedures to handle data subject access requests (DSARs) within the required 30-day timeframe.',
      expected_evidence: 'DSAR procedure documentation; DSAR tracking log; response templates; sample completed DSARs',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-25': [
    {
      procedure_id: 'GDPR-Art25-01',
      procedure_type: 'audit_step',
      title: 'Verify data protection by design and by default',
      description: 'Verify that appropriate technical and organizational measures are implemented to ensure data protection principles are integrated into processing activities from design stage.',
      expected_evidence: 'Privacy by design checklist; DPIA template; development lifecycle with privacy requirements; default settings documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-28': [
    {
      procedure_id: 'GDPR-Art28-01',
      procedure_type: 'audit_step',
      title: 'Verify processor agreements',
      description: 'Verify that all data processors are engaged under written contracts containing the required Article 28 clauses.',
      expected_evidence: 'Data processing agreements; processor register; sub-processor approval records; processor audit rights documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-30': [
    {
      procedure_id: 'GDPR-Art30-01',
      procedure_type: 'audit_step',
      title: 'Verify records of processing activities',
      description: 'Verify that the organization maintains records of processing activities (ROPA) containing all required information.',
      expected_evidence: 'ROPA document; data flow diagrams; processing activity descriptions; data category classifications',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-32': [
    {
      procedure_id: 'GDPR-Art32-01',
      procedure_type: 'audit_step',
      title: 'Verify security of processing',
      description: 'Verify that appropriate technical and organizational measures are implemented to ensure a level of security appropriate to the risk, including encryption, confidentiality, integrity, resilience, and regular testing.',
      expected_evidence: 'Security measures inventory; encryption documentation; access control records; resilience testing; security assessment results',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-33': [
    {
      procedure_id: 'GDPR-Art33-01',
      procedure_type: 'audit_step',
      title: 'Verify breach notification procedures',
      description: 'Verify that procedures exist to detect, report, and investigate personal data breaches and notify the supervisory authority within 72 hours where required.',
      expected_evidence: 'Breach notification procedure; breach register; notification templates; 72-hour timeline tracking; breach assessment criteria',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
  'GDPR-35': [
    {
      procedure_id: 'GDPR-Art35-01',
      procedure_type: 'audit_step',
      title: 'Verify DPIA process',
      description: 'Verify that data protection impact assessments (DPIAs) are conducted for processing activities that are likely to result in a high risk to data subjects.',
      expected_evidence: 'DPIA policy; completed DPIAs; DPIA screening criteria; consultation records with DPO',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'GDPR / EDPB Guidelines'
    }
  ],
};

// ============================================================
// ISO 27002 Assessment Procedures
// ============================================================
const ISO_27002_PROCEDURES = {
  'AC-1': [
    {
      procedure_id: 'ISO27002-AC1-01',
      procedure_type: 'examine',
      title: 'Review access control management documentation',
      description: 'Examine access control policies, procedures, and implementation records to verify alignment with ISO 27002 guidance.',
      expected_evidence: 'Access control policy; role-based access matrix; access provisioning records; periodic access reviews',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO/IEC 27002:2022 §5.15-5.18'
    }
  ],
  'CR-1': [
    {
      procedure_id: 'ISO27002-CR1-01',
      procedure_type: 'interview',
      title: 'Interview security team on cryptographic controls',
      description: 'Interview information security personnel to assess understanding and implementation of cryptographic control policies and key management procedures.',
      expected_evidence: 'Interview notes; cryptographic policy acknowledgement; key management procedure documentation',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO/IEC 27002:2022 §8.24'
    }
  ],
  'OS-1': [
    {
      procedure_id: 'ISO27002-OS1-01',
      procedure_type: 'test',
      title: 'Test operations security monitoring controls',
      description: 'Test security monitoring tools and processes to verify effective detection and alerting for security events in operational environments.',
      expected_evidence: 'Monitoring tool configurations; alert rules; sample security event logs; incident detection records',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO/IEC 27002:2022 §8.15-8.16'
    }
  ],
};

// ============================================================
// ISO 27005 Assessment Procedures
// ============================================================
const ISO_27005_PROCEDURES = {
  'RC-1': [
    {
      procedure_id: 'ISO27005-RC1-01',
      procedure_type: 'examine',
      title: 'Review risk context establishment documentation',
      description: 'Examine risk management context documentation to verify organizational scope, criteria, and boundaries for information security risk management.',
      expected_evidence: 'Risk management scope document; organizational context analysis; risk criteria definitions; stakeholder requirements',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO/IEC 27005:2022 §7'
    }
  ],
  'RA-1': [
    {
      procedure_id: 'ISO27005-RA1-01',
      procedure_type: 'interview',
      title: 'Interview risk management team on analysis methodology',
      description: 'Interview risk management personnel to assess the risk analysis methodology, including qualitative and quantitative approaches used for risk evaluation.',
      expected_evidence: 'Interview notes; risk analysis methodology documentation; risk assessment templates; sample risk registers',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO/IEC 27005:2022 §8.3'
    }
  ],
  'RT-1': [
    {
      procedure_id: 'ISO27005-RT1-01',
      procedure_type: 'test',
      title: 'Test risk treatment implementation effectiveness',
      description: 'Test implemented risk treatment measures to verify they effectively reduce identified risks to acceptable levels as defined by risk acceptance criteria.',
      expected_evidence: 'Risk treatment plans; control effectiveness evidence; residual risk calculations; risk acceptance records',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO/IEC 27005:2022 §8.6'
    }
  ],
};

// ============================================================
// ISO 27017 Assessment Procedures
// ============================================================
const ISO_27017_PROCEDURES = {
  'CSR-1': [
    {
      procedure_id: 'ISO27017-CSR1-01',
      procedure_type: 'examine',
      title: 'Review cloud shared responsibility model documentation',
      description: 'Examine the shared responsibility model documentation to verify clear delineation of security responsibilities between cloud service provider and customer.',
      expected_evidence: 'Shared responsibility matrix; cloud service agreements; security responsibility documentation; role assignments',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO/IEC 27017:2015 §CLD.6.3.1'
    }
  ],
  'CAC-1': [
    {
      procedure_id: 'ISO27017-CAC1-01',
      procedure_type: 'interview',
      title: 'Interview cloud administrators on access control practices',
      description: 'Interview cloud infrastructure administrators to assess privileged access management practices, including multi-factor authentication and session controls.',
      expected_evidence: 'Interview notes; privileged access policy; MFA configuration evidence; admin session logging',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO/IEC 27017:2015 §CLD.9.2'
    }
  ],
  'CML-1': [
    {
      procedure_id: 'ISO27017-CML1-01',
      procedure_type: 'test',
      title: 'Test cloud service monitoring and logging controls',
      description: 'Test cloud monitoring and logging capabilities to verify comprehensive capture and retention of security-relevant events across cloud services.',
      expected_evidence: 'Cloud logging configurations; SIEM integration evidence; log retention policies; sample security event reports',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO/IEC 27017:2015 §CLD.12.4'
    }
  ],
};

// ============================================================
// ISO 27018 Assessment Procedures
// ============================================================
const ISO_27018_PROCEDURES = {
  'PC-1': [
    {
      procedure_id: 'ISO27018-PC1-01',
      procedure_type: 'examine',
      title: 'Review PII consent and purpose limitation controls',
      description: 'Examine consent management and purpose limitation documentation to verify PII is processed only for specified, legitimate purposes with appropriate data subject consent.',
      expected_evidence: 'Consent management records; purpose limitation policy; data processing agreements; lawful basis documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO/IEC 27018:2019 §A.1'
    }
  ],
  'PB-1': [
    {
      procedure_id: 'ISO27018-PB1-01',
      procedure_type: 'interview',
      title: 'Interview privacy team on PII breach notification',
      description: 'Interview privacy and incident response personnel to assess PII breach notification procedures, including timeline requirements and regulatory reporting obligations.',
      expected_evidence: 'Interview notes; breach notification procedures; incident response plan; regulatory notification templates',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO/IEC 27018:2019 §A.9'
    }
  ],
  'PE-1': [
    {
      procedure_id: 'ISO27018-PE1-01',
      procedure_type: 'test',
      title: 'Test PII encryption and pseudonymization controls',
      description: 'Test encryption and pseudonymization mechanisms to verify PII is adequately protected at rest and in transit within public cloud environments.',
      expected_evidence: 'Encryption configuration evidence; key management records; pseudonymization technique documentation; data protection test results',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO/IEC 27018:2019 §A.11'
    }
  ],
};

// ============================================================
// ISO 27701 Assessment Procedures
// ============================================================
const ISO_27701_PROCEDURES = {
  'PG-1': [
    {
      procedure_id: 'ISO27701-PG1-01',
      procedure_type: 'examine',
      title: 'Review privacy governance and accountability documentation',
      description: 'Examine privacy governance structure and accountability documentation to verify clear roles, responsibilities, and reporting lines for privacy management.',
      expected_evidence: 'Privacy governance charter; accountability framework; DPO appointment records; privacy committee terms of reference',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO/IEC 27701:2019 §5.2'
    }
  ],
  'CMF-1': [
    {
      procedure_id: 'ISO27701-CMF1-01',
      procedure_type: 'interview',
      title: 'Interview privacy team on consent management framework',
      description: 'Interview privacy personnel to assess the consent management framework implementation, including consent collection, storage, withdrawal, and lifecycle management.',
      expected_evidence: 'Interview notes; consent management policy; consent records; consent withdrawal procedures',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO/IEC 27701:2019 §7.2.3'
    }
  ],
  'PIA-1': [
    {
      procedure_id: 'ISO27701-PIA1-01',
      procedure_type: 'test',
      title: 'Test privacy impact assessment process',
      description: 'Test the privacy impact assessment process to verify it effectively identifies and mitigates privacy risks for new and changed data processing activities.',
      expected_evidence: 'PIA templates; completed PIA reports; risk mitigation plans; PIA trigger criteria; follow-up action records',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO/IEC 27701:2019 §7.2.5'
    }
  ],
};

// ============================================================
// CMMC 2.0 Assessment Procedures (CMMC Assessment Guide methodology)
// Maps to CMMC Level 2 practice IDs
// ============================================================
const CMMC_PROCEDURES = {
  // Access Control domain assessments
  'AC.L2-3.1.1': [
    {
      procedure_id: 'CMMC-AC.L2-3.1.1-01',
      procedure_type: 'examine',
      title: 'Examine access control policies and system configurations', // ip-hygiene:ignore
      description: 'Review system security plan (SSP), access control policies, and account management records to verify authorized access is enforced per CMMC Level 2 practice AC.L2-3.1.1.', // ip-hygiene:ignore
      expected_evidence: 'System security plan; access control policy; account authorization records; system configuration screenshots; active user listings',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  'AC.L2-3.1.3': [
    {
      procedure_id: 'CMMC-AC.L2-3.1.3-01',
      procedure_type: 'examine',
      title: 'Verify CUI flow enforcement mechanisms', // ip-hygiene:ignore
      description: 'Examine network diagrams, data flow documentation, and boundary protection configurations to confirm CUI flow is controlled per practice AC.L2-3.1.3.', // ip-hygiene:ignore
      expected_evidence: 'Network diagrams; CUI data flow maps; firewall rule sets; DLP configurations; boundary device configurations',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  'AC.L2-3.1.5': [
    {
      procedure_id: 'CMMC-AC.L2-3.1.5-01',
      procedure_type: 'interview',
      title: 'Interview personnel on least privilege implementation',
      description: 'Interview system administrators and security personnel to verify least privilege principles are applied to CUI system access.',
      expected_evidence: 'Interview notes; role-based access documentation; privilege escalation procedures; access review records',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // Audit and Accountability domain
  'AU.L2-3.3.1': [
    {
      procedure_id: 'CMMC-AU.L2-3.3.1-01',
      procedure_type: 'test',
      title: 'Test audit logging and event capture',
      description: 'Validate that system auditing captures events as defined in the audit policy, including user actions on CUI and system-level events.',
      expected_evidence: 'Audit log samples; SIEM correlation rules; log retention configurations; audit policy documentation',
      assessment_method: 'technical_test',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // Configuration Management domain
  'CM.L2-3.4.1': [
    {
      procedure_id: 'CMMC-CM.L2-3.4.1-01',
      procedure_type: 'examine',
      title: 'Review system baseline configurations',
      description: 'Examine baseline configuration documentation and change management records to verify systems are maintained at approved baselines.',
      expected_evidence: 'Baseline configuration documents; hardening guides; change management records; configuration scanning reports',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // Identification and Authentication domain
  'IA.L2-3.5.3': [
    {
      procedure_id: 'CMMC-IA.L2-3.5.3-01',
      procedure_type: 'test',
      title: 'Test multi-factor authentication enforcement',
      description: 'Validate MFA is enforced for all network access to CUI systems, including local, remote, and privileged access paths.',
      expected_evidence: 'MFA configuration screenshots; authentication logs; MFA enrollment records; VPN authentication policies',
      assessment_method: 'technical_test',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // Incident Response domain
  'IR.L2-3.6.1': [
    {
      procedure_id: 'CMMC-IR.L2-3.6.1-01',
      procedure_type: 'examine',
      title: 'Examine incident handling procedures and DIBCAC reporting', // ip-hygiene:ignore
      description: 'Review incident response plan, DIBCAC reporting procedures, and incident records to verify compliance with DFARS 252.204-7012 72-hour reporting requirements.', // ip-hygiene:ignore
      expected_evidence: 'Incident response plan; DIBCAC reporting procedures; incident response records; tabletop exercise documentation; POC contact lists',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // Risk Assessment domain
  'RA.L2-3.11.2': [
    {
      procedure_id: 'CMMC-RA.L2-3.11.2-01',
      procedure_type: 'test',
      title: 'Test vulnerability scanning and POA&M management', // ip-hygiene:ignore
      description: 'Validate vulnerability scanning is conducted on CUI systems per organizational schedule, with findings tracked in Plan of Action and Milestones (POA&M).', // ip-hygiene:ignore
      expected_evidence: 'Vulnerability scan reports; POA&M records; remediation timelines; scanning tool configurations; risk acceptance documentation',
      assessment_method: 'technical_test',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // Security Assessment domain
  'CA.L2-3.12.1': [
    {
      procedure_id: 'CMMC-CA.L2-3.12.1-01',
      procedure_type: 'examine',
      title: 'Review security assessment and C3PAO readiness documentation', // ip-hygiene:ignore
      description: 'Examine SSP, POA&M, and prior assessment results to verify organization maintains assessment-ready documentation per CMMC Assessment Guide methodology.', // ip-hygiene:ignore
      expected_evidence: 'System security plan (SSP); POA&M; prior assessment reports; body of evidence index; C3PAO pre-assessment documentation',
      assessment_method: 'document_review',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  'CA.L2-3.12.4': [
    {
      procedure_id: 'CMMC-CA.L2-3.12.4-01',
      procedure_type: 'interview',
      title: 'Interview security personnel on SSP accuracy and completeness',
      description: 'Interview system owners and ISSMs to verify the system security plan accurately describes the CUI environment, authorization boundary, and interconnections.',
      expected_evidence: 'Interview notes; SSP review findings; authorization boundary diagrams; system interconnection documentation',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // System and Communications Protection domain
  'SC.L2-3.13.11': [
    {
      procedure_id: 'CMMC-SC.L2-3.13.11-01',
      procedure_type: 'test',
      title: 'Test CUI encryption at rest and in transit',
      description: 'Validate FIPS-validated cryptography is used for CUI encryption at rest and in transit across all organizational systems and communication channels.',
      expected_evidence: 'Encryption configuration evidence; FIPS 140-2/140-3 certificate numbers; TLS configuration scans; disk encryption settings; key management procedures',
      assessment_method: 'technical_test',
      depth: 'comprehensive',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
  // System and Information Integrity domain
  'SI.L2-3.14.1': [
    {
      procedure_id: 'CMMC-SI.L2-3.14.1-01',
      procedure_type: 'examine',
      title: 'Review flaw remediation and patch management processes',
      description: 'Examine patch management policies, vulnerability remediation procedures, and patching records to verify timely flaw remediation across CUI systems.',
      expected_evidence: 'Patch management policy; patching records; vulnerability remediation timelines; WSUS/SCCM reports; exception documentation',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'CMMC Assessment Guide (Level 2)'
    }
  ],
};

// ============================================================
// ISO 31000 Assessment Procedures
// ============================================================
const ISO_31000_PROCEDURES = {
  'RMF-1': [
    {
      procedure_id: 'ISO31000-RMF1-01',
      procedure_type: 'examine',
      title: 'Review risk management framework documentation',
      description: 'Examine risk management framework documentation to verify establishment of principles, governance structure, and integration with organizational processes.',
      expected_evidence: 'Risk management framework document; governance structure; integration plan; risk management mandate and commitment',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 31000:2018 §5'
    }
  ],
  'RIT-1': [
    {
      procedure_id: 'ISO31000-RIT1-01',
      procedure_type: 'interview',
      title: 'Interview risk owners on risk identification techniques',
      description: 'Interview risk owners and managers to assess the effectiveness of risk identification techniques and their application across organizational activities.',
      expected_evidence: 'Interview notes; risk identification methodology; risk register entries; risk workshop outputs',
      assessment_method: 'personnel_interview',
      depth: 'focused',
      source_document: 'ISO 31000:2018 §6.4'
    }
  ],
  'RTP-1': [
    {
      procedure_id: 'ISO31000-RTP1-01',
      procedure_type: 'test',
      title: 'Test risk treatment planning and implementation',
      description: 'Test risk treatment plans and their implementation to verify treatments effectively address identified risks and are integrated into operational processes.',
      expected_evidence: 'Risk treatment plans; implementation evidence; treatment effectiveness metrics; residual risk assessments',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO 31000:2018 §6.5'
    }
  ],
};

// ============================================================
// Main seeding function
// ============================================================
async function seedProcedures() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing procedures
    await client.query('DELETE FROM assessment_plan_procedures');
    await client.query('DELETE FROM assessment_results');
    await client.query('DELETE FROM assessment_procedures');
    console.log('Cleared existing assessment procedures.');

    let totalProcedures = 0;

    // Helper: seed procedures for a framework by matching control_id
    const seedForFramework = async (frameworkCode, proceduresMap, label) => {
      // Get framework
      const fwResult = await client.query(
        'SELECT id FROM frameworks WHERE code = $1',
        [frameworkCode]
      );

      if (fwResult.rows.length === 0) {
        console.log(`  [SKIP] Framework "${frameworkCode}" not found`);
        return 0;
      }

      const frameworkId = fwResult.rows[0].id;
      let count = 0;

      for (const [controlId, procedures] of Object.entries(proceduresMap)) {
        // Find the framework_control by control_id
        const controlResult = await client.query(
          'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2',
          [frameworkId, controlId]
        );

        if (controlResult.rows.length === 0) {
          console.log(`  [SKIP] Control "${controlId}" not found in ${frameworkCode}`);
          continue;
        }

        const frameworkControlId = controlResult.rows[0].id;

        for (let i = 0; i < procedures.length; i++) {
          const proc = procedures[i];
          await client.query(
            `INSERT INTO assessment_procedures
             (framework_control_id, procedure_id, procedure_type, title, description,
              expected_evidence, assessment_method, depth, frequency_guidance,
              assessor_notes, source_document, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              frameworkControlId,
              proc.procedure_id,
              proc.procedure_type,
              proc.title,
              proc.description,
              proc.expected_evidence || null,
              proc.assessment_method || null,
              proc.depth || 'basic',
              proc.frequency_guidance || null,
              proc.assessor_notes || null,
              proc.source_document || null,
              i + 1
            ]
          );
          count++;
        }
      }

      console.log(`  [OK] ${label}: ${count} procedures seeded`);
      return count;
    };

    // Seed NIST 800-53A procedures
    console.log('\nSeeding NIST SP 800-53A assessment procedures...');
    totalProcedures += await seedForFramework('nist_800_53', NIST_800_53A_PROCEDURES, 'NIST 800-53A');

    // Seed ISO 27001 audit procedures
    console.log('\nSeeding ISO 27001:2022 audit procedures...');
    totalProcedures += await seedForFramework('iso_27001', ISO_27001_PROCEDURES, 'ISO 27001');

    // Seed SOC 2 testing procedures
    console.log('\nSeeding SOC 2 testing procedures...');
    totalProcedures += await seedForFramework('soc2', SOC2_PROCEDURES, 'SOC 2');

    // Seed NIST CSF procedures
    console.log('\nSeeding NIST CSF 2.0 assessment procedures...');
    totalProcedures += await seedForFramework('nist_csf_2.0', NIST_CSF_PROCEDURES, 'NIST CSF');

    // Seed HIPAA procedures
    console.log('\nSeeding HIPAA assessment procedures...');
    totalProcedures += await seedForFramework('hipaa', HIPAA_PROCEDURES, 'HIPAA');

    // Seed HITECH procedures
    console.log('\nSeeding HITECH assessment procedures...');
    totalProcedures += await seedForFramework('hitech', HITECH_PROCEDURES, 'HITECH');

    // Seed GDPR procedures
    console.log('\nSeeding GDPR assessment procedures...');
    totalProcedures += await seedForFramework('gdpr', GDPR_PROCEDURES, 'GDPR');

    // Seed ISO 27002 procedures
    console.log('\nSeeding ISO 27002 assessment procedures...');
    totalProcedures += await seedForFramework('iso_27002', ISO_27002_PROCEDURES, 'ISO 27002');

    // Seed ISO 27005 procedures
    console.log('\nSeeding ISO 27005 assessment procedures...');
    totalProcedures += await seedForFramework('iso_27005', ISO_27005_PROCEDURES, 'ISO 27005');

    // Seed ISO 27017 procedures
    console.log('\nSeeding ISO 27017 assessment procedures...');
    totalProcedures += await seedForFramework('iso_27017', ISO_27017_PROCEDURES, 'ISO 27017');

    // Seed ISO 27018 procedures
    console.log('\nSeeding ISO 27018 assessment procedures...');
    totalProcedures += await seedForFramework('iso_27018', ISO_27018_PROCEDURES, 'ISO 27018');

    // Seed ISO 27701 procedures
    console.log('\nSeeding ISO 27701 assessment procedures...');
    totalProcedures += await seedForFramework('iso_27701', ISO_27701_PROCEDURES, 'ISO 27701');

    // Seed ISO 31000 procedures
    console.log('\nSeeding ISO 31000 assessment procedures...');
    totalProcedures += await seedForFramework('iso_31000', ISO_31000_PROCEDURES, 'ISO 31000');

    // Seed CMMC 2.0 procedures
    console.log('\nSeeding CMMC 2.0 assessment procedures...');
    totalProcedures += await seedForFramework('cmmc_2.0', CMMC_PROCEDURES, 'CMMC 2.0');

    await client.query('COMMIT');

    console.log(`\n========================================`);
    console.log(`Total assessment procedures seeded: ${totalProcedures}`);
    console.log(`Frameworks covered: NIST 800-53A, ISO 27001, SOC 2, NIST CSF, HIPAA, HITECH, GDPR, ISO 27002, ISO 27005, ISO 27017, ISO 27018, ISO 27701, ISO 31000, CMMC 2.0`); // ip-hygiene:ignore
    console.log(`========================================\n`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedProcedures().catch(console.error);
