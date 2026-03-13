// @tier: community
/**
 * Seed Missing Controls
 *
 * Adds the missing 10 NIST 800-53 control families (CA, MA, MP, PE, PL, PM, PS, PT, SA, SR)
 * and expands other frameworks to full coverage.
 *
 * NIST 800-53 Rev 5 has 20 control families with 1,189 controls total.
 * We seed the most critical controls from each family.
 */

const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'grc_platform',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

// ============================================================
// Missing NIST 800-53 Control Families
// ============================================================

const NIST_800_53_MISSING_CONTROLS = [
  // CA - Assessment, Authorization, and Monitoring
  { control_id: 'CA-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate an assessment, authorization, and monitoring policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'CA-2', title: 'Control Assessments', description: 'Develop a control assessment plan; assess the controls in the system and its environment of operation at a defined frequency.', control_type: 'administrative', priority: '1' },
  { control_id: 'CA-3', title: 'Information Exchange', description: 'Approve and manage the exchange of information between the system and other systems using interconnection security agreements.', control_type: 'administrative', priority: '2' },
  { control_id: 'CA-5', title: 'Plan of Action and Milestones', description: 'Develop a plan of action and milestones (POA&M) for the system to document planned remediation actions.', control_type: 'administrative', priority: '1' },
  { control_id: 'CA-6', title: 'Authorization', description: 'Assign a senior official as the authorizing official; ensure the authorizing official authorizes the system before commencing operations.', control_type: 'administrative', priority: '1' },
  { control_id: 'CA-7', title: 'Continuous Monitoring', description: 'Develop a system-level continuous monitoring strategy and implement a continuous monitoring program.', control_type: 'administrative', priority: '1' },
  { control_id: 'CA-8', title: 'Penetration Testing', description: 'Conduct penetration testing at a defined frequency on the system and its environment.', control_type: 'technical', priority: '2' },
  { control_id: 'CA-9', title: 'Internal System Connections', description: 'Authorize internal connections of system components; document for each internal connection, the interface characteristics, security requirements, and the nature of the information communicated.', control_type: 'administrative', priority: '2' },

  // MA - Maintenance
  { control_id: 'MA-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a system maintenance policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'MA-2', title: 'Controlled Maintenance', description: 'Schedule, document, and review records of maintenance, repair, and replacement on system components.', control_type: 'operational', priority: '1' },
  { control_id: 'MA-3', title: 'Maintenance Tools', description: 'Approve, control, and monitor the use of system maintenance tools.', control_type: 'operational', priority: '2' },
  { control_id: 'MA-4', title: 'Nonlocal Maintenance', description: 'Approve and monitor nonlocal maintenance and diagnostic activities; allow the use of nonlocal maintenance only as consistent with organizational policy.', control_type: 'operational', priority: '2' },
  { control_id: 'MA-5', title: 'Maintenance Personnel', description: 'Establish a process for maintenance personnel authorization and maintain a list of authorized maintenance organizations or personnel.', control_type: 'operational', priority: '2' },
  { control_id: 'MA-6', title: 'Timely Maintenance', description: 'Obtain maintenance support and spare parts for system components within a defined time period of failure.', control_type: 'operational', priority: '2' },

  // MP - Media Protection
  { control_id: 'MP-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a media protection policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'MP-2', title: 'Media Access', description: 'Restrict access to digital and non-digital media to authorized individuals using defined controls.', control_type: 'operational', priority: '1' },
  { control_id: 'MP-3', title: 'Media Marking', description: 'Mark system media indicating the distribution limitations, handling caveats, and applicable security markings.', control_type: 'operational', priority: '2' },
  { control_id: 'MP-4', title: 'Media Storage', description: 'Physically control and securely store digital and non-digital media within controlled areas.', control_type: 'operational', priority: '2' },
  { control_id: 'MP-5', title: 'Media Transport', description: 'Protect and control digital and non-digital media during transport outside of controlled areas.', control_type: 'operational', priority: '2' },
  { control_id: 'MP-6', title: 'Media Sanitization', description: 'Sanitize system media prior to disposal, release out of organizational control, or release for reuse.', control_type: 'operational', priority: '1' },
  { control_id: 'MP-7', title: 'Media Use', description: 'Restrict the use of types of digital media on systems or system components using organizational security safeguards.', control_type: 'operational', priority: '2' },

  // PE - Physical and Environmental Protection
  { control_id: 'PE-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a physical and environmental protection policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'PE-2', title: 'Physical Access Authorizations', description: 'Develop, approve, and maintain a list of individuals with authorized access to the facility; issue authorization credentials for facility access.', control_type: 'operational', priority: '1' },
  { control_id: 'PE-3', title: 'Physical Access Control', description: 'Enforce physical access authorizations at entry/exit points to the facility; maintain physical access audit logs; control access to areas officially designated as publicly accessible.', control_type: 'operational', priority: '1' },
  { control_id: 'PE-4', title: 'Access Control for Transmission', description: 'Control physical access to system distribution and transmission lines within organizational facilities.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-5', title: 'Access Control for Output Devices', description: 'Control physical access to output from system output devices to prevent unauthorized individuals from obtaining the output.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-6', title: 'Monitoring Physical Access', description: 'Monitor physical access to the facility where the system resides to detect and respond to physical security incidents.', control_type: 'operational', priority: '1' },
  { control_id: 'PE-8', title: 'Visitor Access Records', description: 'Maintain visitor access records that include name, organization, date/time of access, and escort requirements.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-9', title: 'Power Equipment and Cabling', description: 'Protect power equipment and power cabling for the system from damage and destruction.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-10', title: 'Emergency Shutoff', description: 'Provide the capability of shutting off power to the system or individual system components in emergency situations.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-11', title: 'Emergency Power', description: 'Provide an uninterruptible power supply to facilitate an orderly shutdown of the system in the event of a primary power source loss.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-12', title: 'Emergency Lighting', description: 'Employ and maintain automatic emergency lighting that activates in the event of a power outage or disruption.', control_type: 'operational', priority: '3' },
  { control_id: 'PE-13', title: 'Fire Protection', description: 'Employ and maintain fire detection and suppression systems that are supported by an independent energy source.', control_type: 'operational', priority: '1' },
  { control_id: 'PE-14', title: 'Environmental Controls', description: 'Maintain temperature and humidity levels within the facility where the system resides at acceptable levels; monitor environmental conditions at a defined frequency.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-15', title: 'Water Damage Protection', description: 'Protect the system from damage resulting from water leakage by providing master shutoff or isolation valves.', control_type: 'operational', priority: '3' },
  { control_id: 'PE-16', title: 'Delivery and Removal', description: 'Authorize and control the entry and exit of system components from the facility; maintain records of the items.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-17', title: 'Alternate Work Site', description: 'Determine and document the alternate work sites allowed for use; employ security controls at alternate work sites.', control_type: 'operational', priority: '2' },
  { control_id: 'PE-18', title: 'Location of System Components', description: 'Position system components within the facility to minimize potential damage from physical and environmental hazards and to minimize the opportunity for unauthorized access.', control_type: 'operational', priority: '2' },

  // PL - Planning
  { control_id: 'PL-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a planning policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'PL-2', title: 'System Security and Privacy Plans', description: 'Develop security and privacy plans that describe the controls in place or planned; distribute plans to authorized personnel; review the plans at a defined frequency.', control_type: 'administrative', priority: '1' },
  { control_id: 'PL-4', title: 'Rules of Behavior', description: 'Establish and provide to individuals requiring access to the system, the rules that describe their responsibilities and expected behavior.', control_type: 'administrative', priority: '1' },
  { control_id: 'PL-7', title: 'Concept of Operations', description: 'Develop a concept of operations for the system describing how the organization intends to operate the system from the perspective of information security and privacy.', control_type: 'administrative', priority: '3' },
  { control_id: 'PL-8', title: 'Security and Privacy Architectures', description: 'Develop security and privacy architectures for the system that describe the philosophy, requirements, and approach to be taken to protect information.', control_type: 'administrative', priority: '2' },
  { control_id: 'PL-10', title: 'Baseline Selection', description: 'Select a control baseline for the system.', control_type: 'administrative', priority: '1' },
  { control_id: 'PL-11', title: 'Baseline Tailoring', description: 'Tailor the selected control baseline by applying specified tailoring actions.', control_type: 'administrative', priority: '1' },

  // PM - Program Management
  { control_id: 'PM-1', title: 'Information Security Program Plan', description: 'Develop and disseminate an organization-wide information security program plan.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-2', title: 'Information Security Program Leadership Role', description: 'Appoint a senior information security officer with the mission and resources to coordinate, develop, implement, and maintain an organization-wide information security program.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-3', title: 'Information Security and Privacy Resources', description: 'Include the resources needed to implement the information security and privacy programs in capital planning and investment requests.', control_type: 'administrative', priority: '2' },
  { control_id: 'PM-4', title: 'Plan of Action and Milestones Process', description: 'Implement a process to ensure that plans of action and milestones for the information security, privacy, and supply chain risk management programs are maintained and documented.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-5', title: 'System Inventory', description: 'Develop and maintain an inventory of organizational systems.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-6', title: 'Measures of Performance', description: 'Develop, monitor, and report on the results of information security and privacy measures of performance.', control_type: 'administrative', priority: '2' },
  { control_id: 'PM-7', title: 'Enterprise Architecture', description: 'Develop and maintain an enterprise architecture with consideration for information security, privacy, and the resulting risk to organizational operations and assets.', control_type: 'administrative', priority: '2' },
  { control_id: 'PM-9', title: 'Risk Management Strategy', description: 'Develop a comprehensive strategy to manage risk to organizational operations, assets, individuals, other organizations, and the Nation.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-10', title: 'Authorization Process', description: 'Manage the security and privacy state of organizational systems through authorization processes.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-11', title: 'Mission and Business Process Definition', description: 'Define organizational mission and business processes with consideration for information security and privacy and the resulting risk to organizational operations.', control_type: 'administrative', priority: '2' },
  { control_id: 'PM-13', title: 'Security and Privacy Workforce', description: 'Establish a security and privacy workforce development and improvement program.', control_type: 'administrative', priority: '2' },
  { control_id: 'PM-14', title: 'Testing, Training, and Monitoring', description: 'Implement a process for ensuring that organizational plans for conducting security and privacy testing, training, and monitoring activities are developed and maintained.', control_type: 'administrative', priority: '1' },
  { control_id: 'PM-15', title: 'Security and Privacy Groups and Associations', description: 'Establish and institutionalize contact with selected groups and associations within the security and privacy communities.', control_type: 'administrative', priority: '3' },
  { control_id: 'PM-16', title: 'Threat Awareness Program', description: 'Implement a threat awareness program that includes a cross-organization information-sharing capability.', control_type: 'administrative', priority: '1' },

  // PS - Personnel Security
  { control_id: 'PS-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a personnel security policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-2', title: 'Position Risk Designation', description: 'Assign a risk designation to all organizational positions; establish screening criteria for individuals filling those positions; review and update position risk designations at a defined frequency.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-3', title: 'Personnel Screening', description: 'Screen individuals prior to authorizing access to the system; rescreen individuals at a defined frequency.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-4', title: 'Personnel Termination', description: 'Upon termination of individual employment: disable system access within a defined time period; terminate/revoke any authenticators/credentials; conduct exit interviews; retrieve all organizational information system-related property.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-5', title: 'Personnel Transfer', description: 'Review and confirm ongoing operational need for current logical and physical access authorizations when individuals are reassigned or transferred to other positions.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-6', title: 'Access Agreements', description: 'Develop and document access agreements for organizational systems; review and update the access agreements at a defined frequency.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-7', title: 'External Personnel Security', description: 'Establish personnel security requirements for external providers; require external providers to comply with personnel security policies and procedures.', control_type: 'administrative', priority: '2' },
  { control_id: 'PS-8', title: 'Personnel Sanctions', description: 'Employ a formal sanctions process for individuals failing to comply with established information security and privacy policies and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'PS-9', title: 'Position Descriptions', description: 'Incorporate security and privacy role responsibilities in organizational position descriptions.', control_type: 'administrative', priority: '2' },

  // PT - PII Processing and Transparency
  { control_id: 'PT-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a personally identifiable information processing and transparency policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'PT-2', title: 'Authority to Process Personally Identifiable Information', description: 'Determine and document the legal authority that permits the collection, use, maintenance, and sharing of personally identifiable information.', control_type: 'administrative', priority: '1' },
  { control_id: 'PT-3', title: 'Personally Identifiable Information Processing Purposes', description: 'Identify and document the purpose(s) for processing personally identifiable information.', control_type: 'administrative', priority: '1' },
  { control_id: 'PT-4', title: 'Consent', description: 'Implement tools or mechanisms for individuals to consent to the processing of their personally identifiable information prior to collection.', control_type: 'administrative', priority: '1' },
  { control_id: 'PT-5', title: 'Privacy Notice', description: 'Provide notice to individuals about the processing of personally identifiable information.', control_type: 'administrative', priority: '1' },
  { control_id: 'PT-6', title: 'System of Records Notice', description: 'For systems that process information in a system of records, publish system of records notices in the Federal Register.', control_type: 'administrative', priority: '2' },
  { control_id: 'PT-7', title: 'Specific Categories of Personally Identifiable Information', description: 'Apply processing conditions for specific categories of PII (Social Security numbers, etc.).', control_type: 'administrative', priority: '1' },
  { control_id: 'PT-8', title: 'Computer Matching Requirements', description: 'When a system or organization is involved in a matching program, adhere to applicable computer matching regulations.', control_type: 'administrative', priority: '3' },

  // SA - System and Services Acquisition
  { control_id: 'SA-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a system and services acquisition policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-2', title: 'Allocation of Resources', description: 'Determine the high-level information security and privacy requirements for the system; include the resources needed to protect the system as a discrete line item.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-3', title: 'System Development Life Cycle', description: 'Acquire, develop, and manage the system using an SDLC that incorporates information security and privacy considerations.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-4', title: 'Acquisition Process', description: 'Include security and privacy functional requirements, strength requirements, assurance requirements, documentation requirements, and acceptance criteria in system acquisition contracts.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-5', title: 'System Documentation', description: 'Obtain or develop administrator documentation and user documentation for the system that describes secure configuration, installation, and operation.', control_type: 'administrative', priority: '2' },
  { control_id: 'SA-8', title: 'Security and Privacy Engineering Principles', description: 'Apply systems security and privacy engineering principles in the specification, design, development, implementation, and modification of the system.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-9', title: 'External System Services', description: 'Require that providers of external system services comply with organizational security and privacy requirements; define and document organizational oversight and user roles and responsibilities.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-10', title: 'Developer Configuration Management', description: 'Require the developer of the system to perform configuration management during system design, development, implementation, and operation.', control_type: 'administrative', priority: '2' },
  { control_id: 'SA-11', title: 'Developer Testing and Evaluation', description: 'Require the developer of the system to create a security and privacy assessment plan; perform testing/evaluation at a defined depth and coverage; produce evidence of the execution of the plan.', control_type: 'administrative', priority: '1' },
  { control_id: 'SA-15', title: 'Development Process, Standards, and Tools', description: 'Require the developer of the system to follow a documented development process that explicitly addresses security and privacy requirements.', control_type: 'administrative', priority: '2' },
  { control_id: 'SA-17', title: 'Developer Security and Privacy Architecture and Design', description: 'Require the developer of the system to produce a design specification and security and privacy architecture.', control_type: 'administrative', priority: '2' },
  { control_id: 'SA-22', title: 'Unsupported System Components', description: 'Replace system components when support for the components is no longer available from the developer, vendor, or manufacturer.', control_type: 'operational', priority: '1' },

  // SR - Supply Chain Risk Management
  { control_id: 'SR-1', title: 'Policy and Procedures', description: 'Develop, document, and disseminate a supply chain risk management policy and procedures.', control_type: 'administrative', priority: '1' },
  { control_id: 'SR-2', title: 'Supply Chain Risk Management Plan', description: 'Develop a plan for managing supply chain risks associated with the development, acquisition, maintenance, and disposal of systems.', control_type: 'administrative', priority: '1' },
  { control_id: 'SR-3', title: 'Supply Chain Controls and Processes', description: 'Establish and apply a process for identifying and addressing weaknesses or deficiencies in the supply chain elements and processes.', control_type: 'administrative', priority: '1' },
  { control_id: 'SR-5', title: 'Acquisition Strategies, Tools, and Methods', description: 'Employ acquisition strategies, contract tools, and procurement methods to protect against, identify, and mitigate supply chain risks.', control_type: 'administrative', priority: '2' },
  { control_id: 'SR-6', title: 'Supplier Assessments and Reviews', description: 'Assess and review the supply chain-related risks associated with suppliers or contractors at a defined frequency.', control_type: 'administrative', priority: '1' },
  { control_id: 'SR-8', title: 'Notification Agreements', description: 'Establish agreements and procedures with entities involved in the supply chain to notify the organization of supply chain compromises.', control_type: 'administrative', priority: '2' },
  { control_id: 'SR-10', title: 'Inspection of Systems or Components', description: 'Inspect systems or system components at a defined frequency to detect tampering.', control_type: 'operational', priority: '2' },
  { control_id: 'SR-11', title: 'Component Authenticity', description: 'Develop and implement anti-counterfeit policy and procedures; use anti-counterfeit mechanisms to detect counterfeit system components.', control_type: 'operational', priority: '2' },
  { control_id: 'SR-12', title: 'Component Disposal', description: 'Dispose of system components using approved disposal techniques and methods.', control_type: 'operational', priority: '2' },
];

// ============================================================
// Additional controls for other frameworks that may be thin
// ============================================================

const NIST_CSF_ADDITIONAL = [
  // Governance (GV) - expand
  { control_id: 'GV.SC-01', title: 'Cybersecurity Supply Chain Risk Management Program', description: 'A cyber supply chain risk management program, strategy, objectives, policies, and processes are established and agreed to by organizational stakeholders.', control_type: 'administrative', priority: '1' },
  { control_id: 'GV.SC-02', title: 'Cybersecurity Roles for Suppliers', description: 'Cybersecurity roles and responsibilities for suppliers, customers, and partners are established, communicated, and coordinated internally and externally.', control_type: 'administrative', priority: '2' },
  { control_id: 'GV.SC-03', title: 'Supply Chain Risk Assessment', description: 'Cybersecurity supply chain risk management is integrated into cybersecurity and enterprise risk management, risk assessment, and improvement processes.', control_type: 'administrative', priority: '2' },

  // Protect (PR) - expand
  { control_id: 'PR.AA-02', title: 'Identities Are Proofed', description: 'Identities are proofed and bound to credentials based on the context of interactions.', control_type: 'technical', priority: '1' },
  { control_id: 'PR.AA-03', title: 'Authenticators Managed', description: 'Users, services, and hardware are authenticated.', control_type: 'technical', priority: '1' },
  { control_id: 'PR.AA-04', title: 'Identity Assertions Verified', description: 'Identity assertions are protected, verified, and validated.', control_type: 'technical', priority: '2' },
  { control_id: 'PR.AA-05', title: 'Access Permissions Managed', description: 'Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed.', control_type: 'technical', priority: '1' },
  { control_id: 'PR.AT-01', title: 'Awareness and Training Provided', description: 'Personnel are provided cybersecurity awareness and training so that they can perform their cybersecurity-related tasks.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.AT-02', title: 'Privileged Users Trained', description: 'Individuals in specialized roles are provided with awareness and training so that they possess the knowledge and skills to perform relevant tasks with cybersecurity risks in mind.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.DS-02', title: 'Data-in-Transit Protection', description: 'The confidentiality, integrity, and availability of data-in-transit are protected.', control_type: 'technical', priority: '1' },
  { control_id: 'PR.DS-10', title: 'Data-in-Use Protection', description: 'The confidentiality, integrity, and availability of data-in-use are protected.', control_type: 'technical', priority: '2' },
  { control_id: 'PR.DS-11', title: 'Data Backups', description: 'Backups of data are created, protected, maintained, and tested.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.IR-01', title: 'Incident Response Plans', description: 'Incident response plans and procedures are established and maintained.', control_type: 'administrative', priority: '1' },
  { control_id: 'PR.IR-02', title: 'Incident Reporting', description: 'Incidents are reported consistent with established criteria.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.PS-01', title: 'Configuration Management', description: 'Configuration management practices are established and applied.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.PS-02', title: 'Software Maintenance', description: 'Software is maintained, replaced, and removed commensurate with risk.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.PS-03', title: 'Hardware Maintenance', description: 'Hardware is maintained, replaced, and removed commensurate with risk.', control_type: 'operational', priority: '1' },
  { control_id: 'PR.PS-04', title: 'Log Records Generated', description: 'Log records are generated and made available for continuous monitoring.', control_type: 'technical', priority: '1' },
  { control_id: 'PR.PS-05', title: 'Installation and Execution Controlled', description: 'Installation and execution of unauthorized software is prevented.', control_type: 'technical', priority: '1' },
  { control_id: 'PR.PS-06', title: 'Secure Software Development', description: 'Secure software development practices are integrated and their performance is monitored.', control_type: 'operational', priority: '1' },

  // Detect (DE) - expand
  { control_id: 'DE.AE-04', title: 'Impact Analysis', description: 'The estimated impact and scope of adverse events are understood.', control_type: 'operational', priority: '1' },
  { control_id: 'DE.AE-07', title: 'Threat Intelligence', description: 'Cyber threat intelligence and other contextual information are integrated into the analysis.', control_type: 'operational', priority: '2' },
  { control_id: 'DE.AE-08', title: 'Anomalous Activity Declared', description: 'Incidents are declared when adverse events meet the defined incident criteria.', control_type: 'operational', priority: '1' },

  // Respond (RS) - expand
  { control_id: 'RS.MA-02', title: 'Incident Reports Filed', description: 'Incidents are categorized and validated.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.MA-03', title: 'Incidents Categorized', description: 'Incidents are categorized and prioritized.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.MA-04', title: 'Incidents Escalated', description: 'Incidents are escalated or elevated as needed.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.MA-05', title: 'Incidents Contained', description: 'The criteria for initiating incident recovery are applied.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.AN-03', title: 'Incident Analysis Performed', description: 'Analysis is performed to determine what has taken place during an incident and the root cause of the incident.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.AN-06', title: 'Actions Taken Recorded', description: 'Actions performed during an investigation are recorded and the integrity of the investigation is preserved.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.AN-07', title: 'Incident Data Collected', description: 'Incident data and metadata are collected and their integrity and provenance are preserved.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.AN-08', title: 'Incident Root Cause', description: 'An incident\'s magnitude is estimated and validated.', control_type: 'operational', priority: '2' },
  { control_id: 'RS.CO-02', title: 'Internal Stakeholders Notified', description: 'Internal and external stakeholders are notified of incidents.', control_type: 'operational', priority: '1' },
  { control_id: 'RS.CO-03', title: 'Information Shared', description: 'Information is shared with designated internal and external stakeholders.', control_type: 'operational', priority: '2' },

  // Recover (RC) - expand
  { control_id: 'RC.RP-02', title: 'Recovery Actions Selected', description: 'Recovery actions are selected, scoped, prioritized, and performed.', control_type: 'operational', priority: '1' },
  { control_id: 'RC.RP-03', title: 'Data Integrity Verified', description: 'The integrity of backups and other restoration assets is verified before using them for restoration.', control_type: 'operational', priority: '1' },
  { control_id: 'RC.RP-04', title: 'Critical Functions Restored', description: 'Critical mission functions and cybersecurity risk management are considered to establish post-incident operational norms.', control_type: 'operational', priority: '1' },
  { control_id: 'RC.RP-05', title: 'End-State Verified', description: 'The integrity of restored assets is verified, systems and services are restored, and normal operating status is confirmed.', control_type: 'operational', priority: '1' },
  { control_id: 'RC.RP-06', title: 'Recovery Plan Communicated', description: 'The end of incident recovery is declared based on criteria and stakeholders are informed.', control_type: 'operational', priority: '2' },
  { control_id: 'RC.CO-03', title: 'Recovery Activities Communicated', description: 'Recovery activities and progress in restoring operational capabilities are communicated to designated internal and external stakeholders.', control_type: 'operational', priority: '2' },
  { control_id: 'RC.CO-04', title: 'Public Updates', description: 'Public updates on incident recovery are shared using approved methods and messaging.', control_type: 'operational', priority: '2' },
];

// Additional Annex A control intents (paraphrased for internal use)
const ISO_27001_ADDITIONAL = [
  { control_id: 'A.5.5', title: 'Contact with authorities', description: 'Appropriate contacts with relevant authorities should be maintained.', control_type: 'administrative', priority: '2' },
  { control_id: 'A.5.6', title: 'Contact with special interest groups', description: 'Appropriate contacts with special interest groups or other specialist security forums should be maintained.', control_type: 'administrative', priority: '3' },
  { control_id: 'A.5.11', title: 'Return of assets', description: 'Personnel and other interested parties should return all organizational assets in their possession upon change or termination of their employment, contract or agreement.', control_type: 'operational', priority: '2' },
  { control_id: 'A.5.12', title: 'Classification of information', description: 'Information should be classified according to the information security needs of the organization based on confidentiality, integrity, availability and relevant interested party requirements.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.13', title: 'Labelling of information', description: 'An appropriate set of procedures for information labelling should be developed and implemented in accordance with the information classification scheme adopted by the organization.', control_type: 'operational', priority: '2' },
  { control_id: 'A.5.14', title: 'Information transfer', description: 'Information transfer rules, procedures, or agreements should be in place for all types of transfer facilities within the organization and between the organization and other parties.', control_type: 'operational', priority: '1' },
  { control_id: 'A.5.19', title: 'Information security in supplier relationships', description: 'Processes and procedures should be defined and implemented to manage the information security risks associated with the use of suppliers products or services.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.20', title: 'Addressing information security within supplier agreements', description: 'Relevant information security requirements should be established and agreed with each supplier based on the type of supplier relationship.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.21', title: 'Managing information security in the ICT supply chain', description: 'Processes and procedures should be defined and implemented for managing information security risks associated with the ICT products and services supply chain.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.22', title: 'Monitoring, review and change management of supplier services', description: 'The organization should regularly monitor, review, evaluate and manage change in supplier information security practices and service delivery.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.27', title: 'Learning from information security incidents', description: 'Knowledge gained from information security incidents should be used to strengthen and improve the information security controls.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.28', title: 'Collection of evidence', description: 'The organization should establish and implement procedures for the identification, collection, acquisition and preservation of evidence related to information security events.', control_type: 'operational', priority: '1' },
  { control_id: 'A.5.31', title: 'Legal, statutory, regulatory and contractual requirements', description: 'Legal, statutory, regulatory and contractual requirements relevant to information security and the organizations approach to meet these requirements should be identified, documented and kept up to date.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.33', title: 'Protection of records', description: 'Records should be protected from loss, destruction, falsification, unauthorized access and unauthorized release.', control_type: 'operational', priority: '1' },
  { control_id: 'A.5.34', title: 'Privacy and protection of PII', description: 'The organization should identify and meet the requirements regarding the preservation of privacy and protection of PII as applicable.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.35', title: 'Independent review of information security', description: 'The organizations approach to managing information security and its implementation should be reviewed independently at planned intervals.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.5.37', title: 'Documented operating procedures', description: 'Operating procedures for information processing facilities should be documented and made available to personnel who need them.', control_type: 'operational', priority: '1' },
  { control_id: 'A.6.2', title: 'Terms and conditions of employment', description: 'The employment contractual agreements should state the employees and the organizations responsibilities for information security.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.6.4', title: 'Disciplinary process', description: 'A disciplinary process should be formalized and communicated to take actions against personnel and other relevant interested parties who have committed an information security policy violation.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.6.5', title: 'Responsibilities after termination or change of employment', description: 'Information security responsibilities and duties that remain valid after termination or change of employment should be defined, enforced and communicated to relevant personnel.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.6.6', title: 'Confidentiality or non-disclosure agreements', description: 'Confidentiality or non-disclosure agreements reflecting the organizations needs for the protection of information should be identified, documented, regularly reviewed and signed by personnel and other relevant interested parties.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.6.7', title: 'Remote working', description: 'Security measures should be implemented when personnel are working remotely to protect information accessed, processed or stored outside the organizations premises.', control_type: 'operational', priority: '1' },
  { control_id: 'A.6.8', title: 'Information security event reporting', description: 'The organization should provide a mechanism for personnel to report observed or suspected information security events through appropriate channels in a timely manner.', control_type: 'operational', priority: '1' },
  { control_id: 'A.7.2', title: 'Physical entry', description: 'Secure areas should be protected by appropriate entry controls to ensure that only authorized personnel are allowed access.', control_type: 'operational', priority: '1' },
  { control_id: 'A.7.3', title: 'Securing offices, rooms and facilities', description: 'Physical security for offices, rooms and facilities should be designed and implemented.', control_type: 'operational', priority: '2' },
  { control_id: 'A.7.4', title: 'Physical security monitoring', description: 'Premises should be continuously monitored for unauthorized physical access.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.2', title: 'Privileged access rights', description: 'The allocation and use of privileged access rights should be restricted and managed.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.3', title: 'Information access restriction', description: 'Access to information and other associated assets should be restricted in accordance with the established topic-specific policy on access control.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.4', title: 'Access to source code', description: 'Read and write access to source code, development tools and software libraries should be appropriately managed.', control_type: 'technical', priority: '2' },
  { control_id: 'A.8.5', title: 'Secure authentication', description: 'Secure authentication technologies and procedures should be established and implemented based on information access restrictions and the topic-specific policy on access control.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.6', title: 'Capacity management', description: 'The use of resources should be monitored and adjusted in line with current and expected capacity requirements.', control_type: 'operational', priority: '2' },
  { control_id: 'A.8.7', title: 'Protection against malware', description: 'Protection against malware should be implemented and supported by appropriate user awareness.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.8', title: 'Management of technical vulnerabilities', description: 'Information about technical vulnerabilities of information systems in use should be obtained, the organizations exposure to such vulnerabilities should be evaluated and appropriate measures should be taken.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.10', title: 'Information deletion', description: 'Information stored in information systems, devices or in any other storage media should be deleted when no longer required.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.11', title: 'Data masking', description: 'Data masking should be used in accordance with the organizations topic-specific policy on access control and other related topic-specific policies and business requirements.', control_type: 'technical', priority: '2' },
  { control_id: 'A.8.12', title: 'Data leakage prevention', description: 'Data leakage prevention measures should be applied to systems, networks and any other devices that process, store or transmit sensitive information.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.13', title: 'Information backup', description: 'Backup copies of information, software and systems should be maintained and regularly tested in accordance with the agreed topic-specific policy on backup.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.14', title: 'Redundancy of information processing facilities', description: 'Information processing facilities should be implemented with redundancy sufficient to meet availability requirements.', control_type: 'operational', priority: '2' },
  { control_id: 'A.8.16', title: 'Monitoring activities', description: 'Networks, systems and applications should be monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.17', title: 'Clock synchronization', description: 'The clocks of information processing systems used by the organization should be synchronized to approved time sources.', control_type: 'technical', priority: '2' },
  { control_id: 'A.8.18', title: 'Use of privileged utility programs', description: 'The use of utility programs that can be capable of overriding system and application controls should be restricted and tightly controlled.', control_type: 'technical', priority: '2' },
  { control_id: 'A.8.19', title: 'Installation of software on operational systems', description: 'Procedures and measures should be implemented to securely manage software installation on operational systems.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.20', title: 'Networks security', description: 'Networks and network devices should be secured, managed and controlled to protect information in systems and applications.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.21', title: 'Security of network services', description: 'Security mechanisms, service levels and service requirements of network services should be identified, implemented and monitored.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.22', title: 'Segregation of networks', description: 'Groups of information services, users and information systems should be segregated in the organizations networks.', control_type: 'technical', priority: '1' },
  { control_id: 'A.8.23', title: 'Web filtering', description: 'Access to external websites should be managed to reduce exposure to malicious content.', control_type: 'technical', priority: '2' },
  { control_id: 'A.8.25', title: 'Secure development life cycle', description: 'Rules for the secure development of software and systems should be established and applied.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.26', title: 'Application security requirements', description: 'Information security requirements should be identified, specified and approved when developing or acquiring applications.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.27', title: 'Secure system architecture and engineering principles', description: 'Principles for engineering secure systems should be established, documented, maintained and applied to any information system development activities.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.28', title: 'Secure coding', description: 'Secure coding principles should be applied to software development.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.29', title: 'Security testing in development and acceptance', description: 'Security testing processes should be defined and implemented in the development life cycle.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.30', title: 'Outsourced development', description: 'The organization should direct, monitor and review the activities related to outsourced system development.', control_type: 'administrative', priority: '1' },
  { control_id: 'A.8.31', title: 'Separation of development, test and production environments', description: 'Development, testing and production environments should be separated and secured.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.32', title: 'Change management', description: 'Changes to information processing facilities and information systems should be subject to change management procedures.', control_type: 'operational', priority: '1' },
  { control_id: 'A.8.33', title: 'Test information', description: 'Test information should be appropriately selected, protected and managed.', control_type: 'operational', priority: '2' },
  { control_id: 'A.8.34', title: 'Protection of information systems during audit testing', description: 'Audit tests and other assurance activities involving assessment of operational systems should be planned and agreed between the tester and appropriate management.', control_type: 'operational', priority: '2' },
];

async function seedControls() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Helper to add controls to a framework
    const addControls = async (frameworkCode, controls, label) => {
      const fwResult = await client.query(
        'SELECT id FROM frameworks WHERE code = $1',
        [frameworkCode]
      );

      if (fwResult.rows.length === 0) {
        console.log(`  [SKIP] Framework "${frameworkCode}" not found`);
        return 0;
      }

      const frameworkId = fwResult.rows[0].id;
      let added = 0;

      for (const ctrl of controls) {
        // Check if control already exists
        const exists = await client.query(
          'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2',
          [frameworkId, ctrl.control_id]
        );

        if (exists.rows.length > 0) {
          continue; // Skip existing
        }

        await client.query(
          `INSERT INTO framework_controls (framework_id, control_id, title, description, control_type, priority)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [frameworkId, ctrl.control_id, ctrl.title, ctrl.description, ctrl.control_type, ctrl.priority]
        );
        added++;
      }

      console.log(`  [OK] ${label}: ${added} new controls added (${controls.length - added} already existed)`);
      return added;
    };

    let totalAdded = 0;

    console.log('\nAdding missing NIST 800-53 control families...');
    totalAdded += await addControls('nist_800_53', NIST_800_53_MISSING_CONTROLS, 'NIST 800-53 (10 new families)');

    console.log('\nExpanding NIST CSF 2.0...');
    totalAdded += await addControls('nist_csf_2.0', NIST_CSF_ADDITIONAL, 'NIST CSF 2.0');

    console.log('\nExpanding ISO 27001:2022...');
    totalAdded += await addControls('iso_27001', ISO_27001_ADDITIONAL, 'ISO 27001:2022');

    await client.query('COMMIT');

    // Print final counts
    const countResult = await client.query(`
      SELECT f.code, f.name, COUNT(fc.id) as controls
      FROM frameworks f
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      GROUP BY f.code, f.name
      ORDER BY f.name
    `);

    console.log('\n========================================');
    console.log(`Total new controls added: ${totalAdded}`);
    console.log('\nFinal control counts per framework:');
    countResult.rows.forEach(row => {
      console.log(`  ${row.code.padEnd(16)} ${row.controls.toString().padStart(4)} controls | ${row.name}`);
    });
    console.log('========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedControls().catch(console.error);
