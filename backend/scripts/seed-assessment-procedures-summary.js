// @tier: community
/**
 * Seed Assessment Procedure Summaries
 *
 * Adds one concise "how to satisfy this control" procedure for every control
 * that currently has no assessment procedures. This keeps detailed procedures
 * intact while ensuring framework-wide baseline guidance coverage.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'grc_platform',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const DEFAULT_PROFILE = {
  procedureType: 'audit_step',
  assessmentMethod: 'document_review',
  sourceDocument: 'Framework implementation guidance (summary)',
  frequencyGuidance: 'At least annually and after significant changes.',
  assessorNotes: 'Sample implementation evidence from at least one in-scope system and verify operating consistency.'
};

const FRAMEWORK_PROFILES = {
  nist_800_53: {
    procedureType: 'examine',
    assessmentMethod: 'document_review',
    sourceDocument: 'NIST SP 800-53A Rev 5 (summary guidance)',
    frequencyGuidance: 'At least annually and after significant system or threat changes.',
    assessorNotes: 'Pair policy and process review with sampled technical evidence from production systems.'
  },
  nist_800_171: {
    procedureType: 'examine',
    assessmentMethod: 'document_review',
    sourceDocument: 'NIST SP 800-171A Rev 3 (summary guidance)',
    frequencyGuidance: 'At least annually and before major CUI boundary changes.',
    assessorNotes: 'Validate implementation in systems that store, process, or transmit CUI.'
  },
  'nist_csf_2.0': {
    procedureType: 'examine',
    assessmentMethod: 'document_review',
    sourceDocument: 'NIST CSF 2.0 implementation examples (summary guidance)',
    frequencyGuidance: 'At planned risk review intervals and after material incidents.',
    assessorNotes: 'Link findings to risk outcomes and any active remediation commitments.'
  },
  nist_ai_rmf: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'NIST AI RMF Playbook (summary guidance)',
    frequencyGuidance: 'At each AI lifecycle stage and after model or data changes.',
    assessorNotes: 'Confirm governance, measurement, and management artifacts are all traceable to this control.'
  },
  nist_privacy: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'NIST Privacy Framework (summary guidance)',
    frequencyGuidance: 'At least annually and whenever processing purposes materially change.',
    assessorNotes: 'Validate both privacy governance documentation and operational evidence from systems handling personal data.'
  },
  nist_800_207: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'NIST SP 800-207 Zero Trust Architecture (summary guidance)',
    frequencyGuidance: 'Quarterly for high-risk assets and after trust policy changes.',
    assessorNotes: 'Treat this as architecture model guidance and verify implementation against policy decisions.'
  },
  iso_27001: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'ISO/IEC 27001:2022 and ISO 19011:2018 (summary guidance)',
    frequencyGuidance: 'Per internal audit program cadence and after significant ISMS changes.',
    assessorNotes: 'Validate control design, operation, and management review evidence.'
  },
  iso_42001: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'ISO/IEC 42001:2023 and ISO 19011:2018 (summary guidance)',
    frequencyGuidance: 'Per AIMS audit cycle and when high-impact AI use changes.',
    assessorNotes: 'Verify governance, risk controls, and lifecycle oversight for in-scope AI systems.'
  },
  iso_42005: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'ISO/IEC 42005:2025 (summary guidance)',
    frequencyGuidance: 'Before deployment, after major model/data changes, and at planned review intervals.',
    assessorNotes: 'Confirm AI impact assessments are performed, documented, approved, and updated across the AI system lifecycle.'
  },
  soc2: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'AICPA Trust Services Criteria (summary guidance)',
    frequencyGuidance: 'At least annually and before attestation periods.',
    assessorNotes: 'Tie evidence to control owner assertions and period-of-time operation.'
  },
  hipaa: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'HHS HIPAA Audit Protocol (summary guidance)',
    frequencyGuidance: 'At least annually and after major ePHI workflow changes.',
    assessorNotes: 'Confirm safeguards are implemented for confidentiality, integrity, and availability of ePHI.'
  },
  gdpr: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'GDPR and EDPB guidance (summary)',
    frequencyGuidance: 'At least annually and after major processing or legal-basis changes.',
    assessorNotes: 'Verify legal basis, accountability records, and operational compliance outcomes.'
  },
  ffiec: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'FFIEC IT Examination Handbook (summary guidance)',
    frequencyGuidance: 'Per examination schedule and risk-driven monitoring cycles.',
    assessorNotes: 'Confirm board-level governance linkage and evidence of operational testing.'
  },
  fiscam: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'GAO FISCAM (summary guidance)',
    frequencyGuidance: 'At least annually and during audit planning cycles.',
    assessorNotes: 'Use FISCAM control objectives to confirm both design and operating effectiveness.'
  },
  nerc_cip: {
    procedureType: 'inspection',
    assessmentMethod: 'walkthrough',
    sourceDocument: 'NERC CIP standards and implementation guidance (summary)',
    frequencyGuidance: 'Per CIP-required intervals and after BES cyber system changes.',
    assessorNotes: 'Include evidence traceability to BES cyber assets and responsible entities.'
  },
  eu_ai_act: {
    procedureType: 'audit_step',
    assessmentMethod: 'document_review',
    sourceDocument: 'EU AI Act obligations (summary guidance)',
    frequencyGuidance: 'Before deployment and on each significant model update.',
    assessorNotes: 'Confirm governance evidence can demonstrate conformity obligations for risk class.'
  },
};

const FOCUS_GUIDANCE = {
  vulnerability: {
    expectedEvidence: [
      'Latest vulnerability artifacts from applicable scanners and analysis sources (for example ACAS or equivalent, SBOM dependency review, STIG or SCAP findings, and secure code scan outputs).',
      'Prioritized remediation backlog with owner, target date, and risk rationale for each open finding.',
      'Closure package for remediated findings (change ticket, patch or configuration evidence, and follow-up validation scan).'
    ],
    notes: 'If a finding remains open, capture compensating controls and a time-bound remediation action plan.'
  },
  access: {
    expectedEvidence: [
      'Access policy and role or entitlement matrix mapped to business need.',
      'Approval records for account provisioning, privilege elevation, and periodic access reviews.',
      'Operational logs that confirm access decisions are enforced and monitored.'
    ],
    notes: 'Sample both standard and privileged accounts to verify least-privilege behavior.'
  },
  incident: {
    expectedEvidence: [
      'Documented incident process with severity definitions and escalation rules.',
      'Recent incident records with timeline, decisions, and containment or recovery steps.',
      'After-action outputs showing corrective actions tracked to closure.'
    ],
    notes: 'Validate at least one recent event from detection through closure.'
  },
  asset: {
    expectedEvidence: [
      'Current inventory of in-scope assets, services, and dependencies.',
      'Configuration baseline or hardening standard aligned to the control objective.',
      'Periodic review records showing inventory and baseline accuracy.'
    ],
    notes: 'Sample assets from different environments to confirm consistency.'
  },
  thirdParty: {
    expectedEvidence: [
      'Third-party risk criteria and due-diligence records for in-scope providers.',
      'Contract clauses or security addenda supporting the control objective.',
      'Ongoing monitoring results and issue tracking for supplier findings.'
    ],
    notes: 'Confirm the organization can enforce and evidence vendor obligations.'
  },
  privacy: {
    expectedEvidence: [
      'Data processing records showing purpose, legal basis, and retention expectations.',
      'Policy and notice artifacts demonstrating transparent processing obligations.',
      'Operational records for rights requests, exceptions, and approvals.'
    ],
    notes: 'Sample at least one processing activity from policy through execution evidence.'
  },
  ai: {
    expectedEvidence: [
      'AI governance artifacts (risk register, accountability roles, and decision records).',
      'Lifecycle evidence (data controls, model evaluation, and monitoring criteria).',
      'Issue tracking for performance, fairness, security, or reliability concerns.'
    ],
    notes: 'Verify the control is operating at both governance and model-operations levels.'
  },
  general: {
    expectedEvidence: [
      'Control policy or standard defining requirements and ownership.',
      'Implementation records showing the control is configured and operating.',
      'Review or monitoring outputs demonstrating ongoing effectiveness.'
    ],
    notes: 'Use representative samples and document any exceptions with corrective actions.'
  }
};

function sanitizeProcedureId(controlId) {
  const normalized = String(controlId || 'CONTROL')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  return (normalized || 'CONTROL').slice(0, 84);
}

function detectFocus(control) {
  const text = `${control.control_id || ''} ${control.title || ''} ${control.description || ''}`.toLowerCase();

  const frameworkCode = String(control.framework_code || '').toLowerCase();
  if (['nist_ai_rmf', 'iso_42001', 'iso_42005', 'eu_ai_act'].includes(frameworkCode)) return 'ai';

  if (/(vulnerab|scan|sbom|stig|scap|patch|hardening|cve|malware|weakness|remediation)/.test(text)) return 'vulnerability';
  if (/(account|access|auth|identity|privilege|mfa|authorization)/.test(text)) return 'access';
  if (/(incident|breach|response|recovery|containment|forensic|notification)/.test(text)) return 'incident';
  if (/(asset|inventory|configuration|baseline|cmdb|change management|system component)/.test(text)) return 'asset';
  if (/(vendor|supplier|third[- ]party|external service|supply chain)/.test(text)) return 'thirdParty';
  if (/(privacy|personal data|pii|consent|data subject|ephi|phi|lawful basis|retention)/.test(text)) return 'privacy';
  if (/(ai|model|machine learning|ml|training data|human oversight|drift|fairness|transparency)/.test(text)) return 'ai';

  return 'general';
}

function buildSummaryProcedure(control) {
  const profile = FRAMEWORK_PROFILES[control.framework_code] || DEFAULT_PROFILE;
  const focusKey = detectFocus(control);
  const focus = FOCUS_GUIDANCE[focusKey] || FOCUS_GUIDANCE.general;
  const controlLabel = control.title ? `${control.control_id} - ${control.title}` : control.control_id;

  return {
    frameworkControlId: control.framework_control_id,
    procedureId: `${sanitizeProcedureId(control.control_id)}-SUM-01`,
    procedureType: profile.procedureType,
    title: `Summary assessment guide for ${control.control_id}`,
    description: `Assess whether ${controlLabel} is implemented and operating effectively by validating design, execution, and objective evidence aligned to ${control.framework_name}.`,
    expectedEvidence: focus.expectedEvidence.join(' '),
    assessmentMethod: profile.assessmentMethod,
    depth: 'focused',
    frequencyGuidance: profile.frequencyGuidance,
    assessorNotes: `${profile.assessorNotes} ${focus.notes}`,
    sourceDocument: profile.sourceDocument,
    sortOrder: 900
  };
}

async function seedAssessmentProcedureSummaries() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const missingControlsResult = await client.query(`
      SELECT
        fc.id AS framework_control_id,
        fc.control_id,
        fc.title,
        fc.description,
        f.code AS framework_code,
        f.name AS framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM assessment_procedures ap
        WHERE ap.framework_control_id = fc.id
      )
      ORDER BY f.code, fc.control_id
    `);

    const missingControls = missingControlsResult.rows;
    if (missingControls.length === 0) {
      await client.query('COMMIT');
      console.log('No controls are missing assessment procedures. Nothing to seed.');
      return;
    }

    let insertedCount = 0;
    const insertedByFramework = new Map();

    for (const control of missingControls) {
      const procedure = buildSummaryProcedure(control);
      await client.query(
        `INSERT INTO assessment_procedures
          (framework_control_id, procedure_id, procedure_type, title, description,
           expected_evidence, assessment_method, depth, frequency_guidance,
           assessor_notes, source_document, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          procedure.frameworkControlId,
          procedure.procedureId,
          procedure.procedureType,
          procedure.title,
          procedure.description,
          procedure.expectedEvidence,
          procedure.assessmentMethod,
          procedure.depth,
          procedure.frequencyGuidance,
          procedure.assessorNotes,
          procedure.sourceDocument,
          procedure.sortOrder
        ]
      );

      insertedCount += 1;
      const current = insertedByFramework.get(control.framework_code) || 0;
      insertedByFramework.set(control.framework_code, current + 1);
    }

    await client.query('COMMIT');

    console.log('\nAssessment procedure summary seeding complete.');
    console.log(`Controls filled: ${insertedCount}`);
    console.log('By framework:');
    for (const [frameworkCode, count] of insertedByFramework.entries()) {
      console.log(`  - ${frameworkCode}: ${count}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Summary assessment procedure seed failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAssessmentProcedureSummaries().catch(() => process.exit(1));
