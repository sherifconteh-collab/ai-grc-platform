// @tier: community
/**
 * Seed Missing Controls
 *
 * Expands frameworks to full coverage beyond their initial seed.
 *
 * NIST 800-53 Rev 5's full 20-family base-control set now lives entirely in
 * lib/frameworks/nist_800_53.js (issue #217 Wave 1) -- this script no longer
 * carries its own copy.
 */

require('dotenv').config();
const { Pool } = require('pg');
const { addControlIfMissing } = require('./lib/frameworkControlUpsert');

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
        if (await addControlIfMissing(client, frameworkId, ctrl)) added++;
      }

      console.log(`  [OK] ${label}: ${added} new controls added (${controls.length - added} already existed)`);
      return added;
    };

    let totalAdded = 0;

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
