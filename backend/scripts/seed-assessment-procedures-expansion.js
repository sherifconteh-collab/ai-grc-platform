// @tier: free
/**
 * Seed Assessment Procedures - Expansion
 *
 * Adds assessment procedures for the newly added NIST 800-53 families
 * (CA, MA, MP, PE, PL, PM, PS, PT, SA, SR) and expanded ISO 27001/CSF controls.
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'grc_platform',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Helper to create standard procedures based on control family patterns
function makeExamineProc(controlId, title, evidence, source) {
  return {
    procedure_id: `${controlId}[E01]`,
    procedure_type: 'examine',
    title: `Examine ${title}`,
    description: `Examine documentation related to ${title.toLowerCase()} to verify policies, procedures, and controls are documented, current, and complete.`,
    expected_evidence: evidence,
    assessment_method: 'document_review',
    depth: 'focused',
    source_document: source || 'NIST SP 800-53A Rev 5'
  };
}

function makeInterviewProc(controlId, title, evidence, source) {
  return {
    procedure_id: `${controlId}[I01]`,
    procedure_type: 'interview',
    title: `Interview personnel on ${title}`,
    description: `Interview organizational personnel responsible for ${title.toLowerCase()} to determine understanding and implementation of related procedures.`,
    expected_evidence: evidence,
    assessment_method: 'personnel_interview',
    depth: 'focused',
    source_document: source || 'NIST SP 800-53A Rev 5'
  };
}

function makeTestProc(controlId, title, evidence, notes, source) {
  return {
    procedure_id: `${controlId}[T01]`,
    procedure_type: 'test',
    title: `Test ${title}`,
    description: `Test the mechanisms and processes supporting ${title.toLowerCase()} to verify they function as intended.`,
    expected_evidence: evidence,
    assessment_method: 'system_test',
    depth: 'comprehensive',
    assessor_notes: notes || null,
    source_document: source || 'NIST SP 800-53A Rev 5'
  };
}

// ============================================================
// NIST 800-53A procedures for new families
// ============================================================
const NEW_NIST_PROCEDURES = {
  // CA Family
  'CA-1': [
    makeExamineProc('CA-01', 'assessment, authorization, and monitoring policy', 'CA policy; CA procedures; organizational commitment to security assessment'),
  ],
  'CA-2': [
    makeExamineProc('CA-02', 'control assessment plan and results', 'Security assessment plan; assessment reports; assessment evidence; assessment team credentials'),
    makeInterviewProc('CA-02', 'control assessments', 'Interview notes; understanding of assessment methodology, scope, and findings'),
  ],
  'CA-5': [
    makeExamineProc('CA-05', 'plan of action and milestones', 'POA&M document; milestone tracking; resource allocation for remediation'),
  ],
  'CA-6': [
    makeExamineProc('CA-06', 'system authorization documentation', 'Authorization to operate (ATO) letter; authorization package; risk acceptance documentation'),
  ],
  'CA-7': [
    makeExamineProc('CA-07', 'continuous monitoring strategy', 'Continuous monitoring strategy; ConMon plan; automated monitoring tool configurations; security status reports'),
    makeTestProc('CA-07', 'continuous monitoring mechanisms', 'Automated monitoring tool outputs; real-time dashboard screenshots; alert correlation evidence', 'Verify monitoring covers all security-relevant events. Check that dashboards are reviewed at required frequency.'),
  ],
  'CA-8': [
    makeExamineProc('CA-08', 'penetration testing plans and results', 'Penetration test plan; scope documentation; test results; remediation tracking; rules of engagement'),
    makeTestProc('CA-08', 'penetration testing findings remediation', 'POA&M entries for pen test findings; evidence of remediation; re-test results', 'Verify critical and high findings are remediated within required timeframes.'),
  ],

  // MA Family
  'MA-1': [
    makeExamineProc('MA-01', 'maintenance policy and procedures', 'System maintenance policy; maintenance procedures; maintenance schedule'),
  ],
  'MA-2': [
    makeExamineProc('MA-02', 'maintenance records and schedules', 'Maintenance logs; work orders; maintenance schedule; approval records'),
    makeTestProc('MA-02', 'maintenance controls', 'Maintenance tool sanitization records; media handling during maintenance; cleared personnel verification'),
  ],
  'MA-4': [
    makeExamineProc('MA-04', 'nonlocal maintenance procedures', 'Remote maintenance procedures; encryption requirements; session monitoring; approval records'),
    makeTestProc('MA-04', 'nonlocal maintenance session controls', 'Remote session logs; encryption verification; session termination evidence', 'Verify remote maintenance sessions are encrypted, monitored, and properly terminated.'),
  ],

  // MP Family
  'MP-1': [
    makeExamineProc('MP-01', 'media protection policy', 'Media protection policy; handling procedures; sanitization procedures'),
  ],
  'MP-6': [
    makeExamineProc('MP-06', 'media sanitization records', 'Sanitization logs; certificates of destruction; sanitization tool validation; chain of custody records'),
    makeTestProc('MP-06', 'media sanitization effectiveness', 'Sanitization verification results; test sample of sanitized media', 'Verify sanitization method matches media type and data classification level.'),
  ],

  // PE Family
  'PE-1': [
    makeExamineProc('PE-01', 'physical and environmental protection policy', 'Physical security policy; facility security plan; environmental protection procedures'),
  ],
  'PE-2': [
    makeExamineProc('PE-02', 'physical access authorization list', 'Authorized personnel list; badge/credential issuance records; access authorization approvals'),
  ],
  'PE-3': [
    makeExamineProc('PE-03', 'physical access control mechanisms', 'Entry control documentation; badge reader configurations; security guard procedures; visitor escort procedures'),
    makeTestProc('PE-03', 'physical access controls', 'Entry point test results; badge reader test evidence; tailgating prevention verification', 'Test at least 3 entry points. Attempt to enter without proper credentials. Verify alarm systems function.'),
  ],
  'PE-6': [
    makeExamineProc('PE-06', 'physical access monitoring', 'CCTV configuration; access log review procedures; monitoring station procedures; incident response for physical breaches'),
    makeTestProc('PE-06', 'physical monitoring systems', 'CCTV footage review; access log samples; alert testing results', 'Verify cameras cover all entry points. Check footage retention period meets requirements.'),
  ],
  'PE-13': [
    makeExamineProc('PE-13', 'fire protection systems', 'Fire suppression system documentation; inspection records; fire marshal certifications; fire drill records'),
  ],

  // PL Family
  'PL-1': [
    makeExamineProc('PL-01', 'planning policy', 'Planning policy; SSP development procedures; SSP maintenance schedule'),
  ],
  'PL-2': [
    makeExamineProc('PL-02', 'system security plan', 'System security plan; authorization boundary documentation; control implementation descriptions; risk assessment references'),
    makeInterviewProc('PL-02', 'system security planning', 'Interview notes showing understanding of SSP content, maintenance requirements, and plan of action linkage'),
  ],
  'PL-4': [
    makeExamineProc('PL-04', 'rules of behavior', 'Rules of behavior document; signed acknowledgements; user agreements; AUP'),
  ],

  // PM Family
  'PM-1': [
    makeExamineProc('PM-01', 'information security program plan', 'Information security program plan; program milestones; resource allocation; program metrics'),
  ],
  'PM-2': [
    makeExamineProc('PM-02', 'senior information security officer appointment', 'CISO/SISO appointment letter; position description; organizational chart; resource allocation'),
  ],
  'PM-5': [
    makeExamineProc('PM-05', 'system inventory', 'System inventory; system categorization records; interconnection documentation; authorization status'),
  ],
  'PM-9': [
    makeExamineProc('PM-09', 'risk management strategy', 'Risk management strategy; risk tolerance/appetite statement; risk assessment methodology; governance structure'),
  ],
  'PM-16': [
    makeExamineProc('PM-16', 'threat awareness program', 'Threat intelligence feeds; information sharing agreements; threat briefing records; ISAC membership'),
  ],

  // PS Family
  'PS-1': [
    makeExamineProc('PS-01', 'personnel security policy', 'Personnel security policy; screening procedures; position categorization records'),
  ],
  'PS-2': [
    makeExamineProc('PS-02', 'position risk designations', 'Position risk designation records; screening criteria; risk designation review schedule'),
  ],
  'PS-3': [
    makeExamineProc('PS-03', 'personnel screening records', 'Background check records; screening completion dates; rescreening schedule; adjudication criteria'),
    makeInterviewProc('PS-03', 'personnel screening', 'Interview notes with HR and security personnel on screening processes and criteria'),
  ],
  'PS-4': [
    makeExamineProc('PS-04', 'personnel termination procedures', 'Termination checklist; access revocation records; exit interview records; equipment return records'),
    makeTestProc('PS-04', 'access revocation timeliness', 'Sample of terminated employees; access revocation timestamps; comparison against termination dates', 'Select 10 recent terminations and verify access was revoked within the required timeframe.'),
  ],
  'PS-5': [
    makeExamineProc('PS-05', 'personnel transfer procedures', 'Transfer access review records; access modification requests; old access removal verification'),
  ],
  'PS-6': [
    makeExamineProc('PS-06', 'access agreements', 'NDA documents; acceptable use agreements; signed acknowledgements; review schedule'),
  ],
  'PS-8': [
    makeExamineProc('PS-08', 'personnel sanctions process', 'Sanctions policy; HR disciplinary procedures; formal sanctions documentation'),
  ],

  // PT Family
  'PT-1': [
    makeExamineProc('PT-01', 'PII processing policy', 'PII processing and transparency policy; privacy procedures; privacy program documentation'),
  ],
  'PT-2': [
    makeExamineProc('PT-02', 'authority to process PII', 'Legal authority documentation; privacy act system of records notices; consent mechanisms; privacy impact assessments'),
  ],
  'PT-3': [
    makeExamineProc('PT-03', 'PII processing purposes', 'Purpose specification documentation; data inventory; processing activity records; data flow diagrams'),
  ],
  'PT-5': [
    makeExamineProc('PT-05', 'privacy notices', 'Privacy notice documents; website privacy policies; collection point notices; notice update records'),
  ],

  // SA Family
  'SA-1': [
    makeExamineProc('SA-01', 'acquisition policy', 'System and services acquisition policy; SDLC procedures; security requirements in procurement'),
  ],
  'SA-3': [
    makeExamineProc('SA-03', 'system development life cycle', 'SDLC documentation; security integration points; phase gate security reviews; risk management in SDLC'),
  ],
  'SA-4': [
    makeExamineProc('SA-04', 'acquisition process security requirements', 'Contract security clauses; RFP security requirements; vendor security questionnaires; acceptance criteria'),
  ],
  'SA-8': [
    makeExamineProc('SA-08', 'security engineering principles', 'Security engineering documentation; architecture reviews; defense-in-depth implementation; threat modeling'),
  ],
  'SA-9': [
    makeExamineProc('SA-09', 'external system services', 'External service provider agreements; SLAs with security requirements; monitoring of external services; compliance evidence from providers'),
    makeInterviewProc('SA-09', 'external service management', 'Interview notes with procurement and ISSO on vendor security management and oversight'),
  ],
  'SA-11': [
    makeExamineProc('SA-11', 'developer testing and evaluation', 'Security testing plans; test results; code review findings; static/dynamic analysis results; penetration test reports'),
    makeTestProc('SA-11', 'developer security testing adequacy', 'Code scanning tool results; OWASP testing evidence; remediation tracking', 'Verify testing covers OWASP Top 10. Check that critical findings are resolved before deployment.'),
  ],

  // SR Family
  'SR-1': [
    makeExamineProc('SR-01', 'supply chain risk management policy', 'SCRM policy; supply chain risk procedures; approved supplier list criteria'),
  ],
  'SR-2': [
    makeExamineProc('SR-02', 'supply chain risk management plan', 'SCRM plan; supply chain risk register; mitigation strategies; supply chain mapping'),
  ],
  'SR-3': [
    makeExamineProc('SR-03', 'supply chain controls', 'Supply chain control procedures; deficiency identification process; supplier audit results'),
  ],
  'SR-6': [
    makeExamineProc('SR-06', 'supplier assessments', 'Supplier assessment reports; security questionnaire responses; on-site audit results; continuous monitoring of suppliers'),
    makeInterviewProc('SR-06', 'supplier assessment process', 'Interview notes with procurement and risk management on supplier assessment frequency, criteria, and escalation'),
  ],
};

// Assessment procedures for expanded ISO controls (paraphrased internal guidance)
const NEW_ISO_PROCEDURES = {
  'A.5.12': [
    {
      procedure_id: 'A.5.12-01',
      procedure_type: 'audit_step',
      title: 'Review information classification governance',
      description: 'Confirm a documented classification model exists and is applied consistently by teams.',
      expected_evidence: 'Classification policy; classification levels; handling procedures per level',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.5.14': [
    {
      procedure_id: 'A.5.14-01',
      procedure_type: 'audit_step',
      title: 'Review information transfer safeguards',
      description: 'Confirm approved transfer methods use documented security controls and accountable ownership.',
      expected_evidence: 'Transfer policy; encryption requirements; approved transfer methods; transfer logs',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.5.19': [
    {
      procedure_id: 'A.5.19-01',
      procedure_type: 'audit_step',
      title: 'Review supplier security oversight',
      description: 'Confirm supplier onboarding and ongoing reviews include information security risk checks.',
      expected_evidence: 'Supplier risk assessment; approved supplier list; security requirements in contracts',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.6.7': [
    {
      procedure_id: 'A.6.7-01',
      procedure_type: 'audit_step',
      title: 'Review remote work security controls',
      description: 'Confirm remote work practices protect organization data, endpoints, and access channels.',
      expected_evidence: 'Remote working policy; VPN configuration; endpoint security for remote devices; remote access controls',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.2': [
    {
      procedure_id: 'A.8.2-01',
      procedure_type: 'audit_step',
      title: 'Review privileged access lifecycle',
      description: 'Confirm privileged access is tightly approved, periodically reviewed, and monitored.',
      expected_evidence: 'Privileged access policy; PAM tool configuration; privileged account inventory; access review records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
    {
      procedure_id: 'A.8.2-02',
      procedure_type: 'inspection',
      title: 'Inspect privileged session governance',
      description: 'Inspect PAM tooling and admin activity records to validate oversight and traceability.',
      expected_evidence: 'PAM tool dashboard; session recording samples; privileged activity logs',
      assessment_method: 'system_test',
      depth: 'comprehensive',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.7': [
    {
      procedure_id: 'A.8.7-01',
      procedure_type: 'audit_step',
      title: 'Review malware defense program',
      description: 'Confirm anti-malware controls are deployed, updated, and reinforced through user guidance.',
      expected_evidence: 'Anti-malware policy; endpoint protection configuration; update verification; malware incident records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.8': [
    {
      procedure_id: 'A.8.8-01',
      procedure_type: 'audit_step',
      title: 'Review vulnerability management cadence',
      description: 'Confirm vulnerabilities are identified, prioritized, tracked, and remediated on schedule.',
      expected_evidence: 'Vulnerability management policy; scan results; remediation timelines; patch management records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.12': [
    {
      procedure_id: 'A.8.12-01',
      procedure_type: 'audit_step',
      title: 'Review data loss safeguards',
      description: 'Confirm controls are active to reduce unintended data leakage from sensitive workflows.',
      expected_evidence: 'DLP policy; DLP tool configuration; incident reports; data classification alignment',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.20': [
    {
      procedure_id: 'A.8.20-01',
      procedure_type: 'audit_step',
      title: 'Review network security governance',
      description: 'Confirm network protections are implemented, maintained, and monitored across environments.',
      expected_evidence: 'Network security policy; firewall rules; network segmentation diagrams; network monitoring configuration',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.25': [
    {
      procedure_id: 'A.8.25-01',
      procedure_type: 'audit_step',
      title: 'Review secure SDLC execution',
      description: 'Confirm secure development expectations are documented and followed at each SDLC stage.',
      expected_evidence: 'SDLC security procedures; code review process; security testing in CI/CD; developer security training',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.28': [
    {
      procedure_id: 'A.8.28-01',
      procedure_type: 'audit_step',
      title: 'Review secure coding discipline',
      description: 'Confirm teams apply secure coding expectations and supporting validation checks.',
      expected_evidence: 'Secure coding standards; SAST/DAST tool configuration; code review findings; developer training records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
  'A.8.32': [
    {
      procedure_id: 'A.8.32-01',
      procedure_type: 'audit_step',
      title: 'Review change control effectiveness',
      description: 'Confirm system and infrastructure changes follow approved workflow, testing, and authorization steps.',
      expected_evidence: 'Change management policy; change tickets; approval workflows; test evidence; deployment records',
      assessment_method: 'document_review',
      depth: 'focused',
      source_document: 'ISO 19011:2018 / ISO 27001:2022'
    },
  ],
};

async function seedProcedures() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let totalProcedures = 0;

    const seedForFramework = async (frameworkCode, proceduresMap, label) => {
      const fwResult = await client.query('SELECT id FROM frameworks WHERE code = $1', [frameworkCode]);
      if (fwResult.rows.length === 0) {
        console.log(`  [SKIP] Framework "${frameworkCode}" not found`);
        return 0;
      }

      const frameworkId = fwResult.rows[0].id;
      let count = 0;

      for (const [controlId, procedures] of Object.entries(proceduresMap)) {
        const controlResult = await client.query(
          'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2',
          [frameworkId, controlId]
        );

        if (controlResult.rows.length === 0) {
          console.log(`  [SKIP] Control "${controlId}" not found in ${frameworkCode}`);
          continue;
        }

        const frameworkControlId = controlResult.rows[0].id;

        // Check if procedures already exist for this control
        const existingCount = await client.query(
          'SELECT COUNT(*) as cnt FROM assessment_procedures WHERE framework_control_id = $1',
          [frameworkControlId]
        );

        if (parseInt(existingCount.rows[0].cnt) > 0) {
          continue; // Skip if procedures already exist
        }

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

      console.log(`  [OK] ${label}: ${count} new procedures added`);
      return count;
    };

    console.log('\nAdding NIST 800-53A procedures for new families...');
    totalProcedures += await seedForFramework('nist_800_53', NEW_NIST_PROCEDURES, 'NIST 800-53A (new families)');

    console.log('\nAdding ISO 27001 procedures for new controls...');
    totalProcedures += await seedForFramework('iso_27001', NEW_ISO_PROCEDURES, 'ISO 27001 (new controls)');

    await client.query('COMMIT');

    // Final count
    const totalResult = await client.query('SELECT COUNT(*) as total FROM assessment_procedures');

    console.log(`\n========================================`);
    console.log(`New procedures added: ${totalProcedures}`);
    console.log(`Total procedures in database: ${totalResult.rows[0].total}`);
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
