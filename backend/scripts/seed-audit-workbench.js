#!/usr/bin/env node
// @tier: exclude
/**
 * seed-audit-workbench.js
 *
 * Fills the audit workbench for the demo audit firm (DEMO_AUDIT_FIRM_ACCOUNT)
 * so every workbench screen has something in it: engagements across the
 * lifecycle, PBC requests in each status, workpapers at each review stage,
 * findings at each severity, and a full signoff chain.
 *
 * Without this the audit-firm persona logs into an empty workbench and none of
 * the engagement/PBC/workpaper/finding/signoff flows can be demoed or tested.
 *
 * Idempotent — engagements are keyed by name within the organization and are
 * skipped if they already exist (pass --force to rebuild them).
 *
 * Run:
 *   npm run seed:demo:audit-workbench
 */
require('dotenv').config();
const pool = require('../src/config/database');
const { hashForLookup } = require('../src/utils/encrypt');
const { DEMO_AUDIT_FIRM_ACCOUNT } = require('./lib/demo-account-config');

const FORCE = process.argv.includes('--force');

const ENGAGEMENTS = Object.freeze([
  {
    name: 'SOC 2 Type II Examination — Harborline Retail Group',
    engagementType: 'external_audit',
    status: 'fieldwork',
    scope: 'Security, Availability, and Confidentiality trust services criteria for the '
      + 'order management and payment tokenization platforms.',
    frameworkCodes: ['soc2'],
    monthsBack: 9,
    pbc: [
      { title: 'Access review evidence for production AWS accounts', priority: 'critical', status: 'submitted',
        details: 'Provide the two most recent quarterly user access reviews for all production AWS accounts, including reviewer sign-off and any revocations performed.' },
      { title: 'Change management tickets sample (Q1-Q2)', priority: 'high', status: 'accepted',
        details: 'Provide a complete population export of production change tickets for the period, from which a sample of 25 will be selected.', responseNotes: 'Population export delivered via secure share; row count reconciled to the change system.' },
      { title: 'Vendor SOC 2 reports for subservice organizations', priority: 'high', status: 'in_progress',
        details: 'Provide current SOC 2 Type II reports for all subservice organizations relied upon for the in-scope systems.' },
      { title: 'Incident response test results', priority: 'medium', status: 'open',
        details: 'Provide documentation of the most recent incident response tabletop exercise, including participants, scenario, and lessons learned.' },
      { title: 'Encryption key rotation logs', priority: 'medium', status: 'rejected',
        details: 'Provide KMS key rotation evidence covering the examination period.', responseNotes: 'Screenshots submitted were undated and could not be tied to the period; resubmission requested with system-generated export.' },
      { title: 'Onboarding and termination checklists', priority: 'low', status: 'closed',
        details: 'Provide completed onboarding and termination checklists for a sample of joiners and leavers.', responseNotes: 'Sample of 15 received and tested without exception.' }
    ],
    workpapers: [
      { title: 'WP-100 Logical access provisioning', status: 'finalized',
        objective: 'Determine whether access to in-scope systems is provisioned only upon documented approval.',
        procedurePerformed: 'Selected a sample of 25 joiners from the period population and inspected the approval record and the resulting entitlement grant in the identity provider.',
        conclusion: 'No exceptions noted. Control operated effectively throughout the period.',
        reviewerNotes: 'Sampling basis and population completeness both evidenced. Approved.' },
      { title: 'WP-110 Quarterly access reviews', status: 'in_review',
        objective: 'Determine whether quarterly user access reviews are performed and revocations acted upon.',
        procedurePerformed: 'Inspected the Q1 and Q2 access review packages, reperformed the reviewer sign-off tie-out, and traced three flagged accounts to their revocation records.',
        conclusion: 'One review was completed 11 days after the policy deadline. Aggregating with WP-120 before concluding.' },
      { title: 'WP-120 Change management approvals', status: 'in_review',
        objective: 'Determine whether production changes are approved and tested before deployment.',
        procedurePerformed: 'Selected 25 production changes and inspected the approval, test evidence, and deployment record for each.',
        conclusion: 'Two changes were deployed with retrospective approval. Assessing severity with the engagement partner.' },
      { title: 'WP-200 Encryption of data at rest', status: 'draft',
        objective: 'Determine whether customer data is encrypted at rest using approved algorithms and rotated keys.',
        procedurePerformed: 'Requested KMS configuration export and key rotation history. Client resubmission pending (see PBC: Encryption key rotation logs).' }
    ],
    findings: [
      { title: 'Quarterly access review completed after policy deadline', severity: 'medium', status: 'remediating',
        description: 'The Q1 quarterly user access review for production AWS accounts was completed 11 days after the deadline set by the organization access management policy.',
        recommendation: 'Add a calendar-driven reminder and an escalation path so reviews that pass the deadline are surfaced to the control owner automatically.',
        managementResponse: 'Agreed. A scheduled reminder has been configured and a secondary reviewer named to cover absences.',
        workpaperTitle: 'WP-110 Quarterly access reviews' },
      { title: 'Production changes deployed with retrospective approval', severity: 'high', status: 'open',
        description: 'Two of 25 sampled production changes were deployed before the required approval was recorded; approvals were entered after the deployment completed.',
        recommendation: 'Enforce approval as a technical gate in the deployment pipeline rather than a procedural step recorded in the change ticket.',
        workpaperTitle: 'WP-120 Change management approvals' },
      { title: 'Key rotation evidence not system-generated', severity: 'low', status: 'open',
        description: 'Evidence provided for encryption key rotation consisted of undated screenshots that could not be tied to the examination period.',
        recommendation: 'Export key rotation history directly from the key management service so evidence carries a verifiable timestamp.' }
    ],
    signoffs: []
  },
  {
    name: 'ISO 27001 Surveillance Audit — Helixor Biosciences',
    engagementType: 'external_audit',
    status: 'planning',
    scope: 'Surveillance of the information security management system covering clinical data '
      + 'processing environments and the supporting cloud infrastructure.',
    frameworkCodes: ['iso_27001'],
    monthsBack: 2,
    pbc: [
      { title: 'Current Statement of Applicability', priority: 'high', status: 'open',
        details: 'Provide the approved Statement of Applicability with justification for all excluded Annex A controls.' },
      { title: 'Internal audit programme and results', priority: 'high', status: 'open',
        details: 'Provide the internal audit schedule for the certification cycle and reports for audits completed since the last surveillance.' },
      { title: 'Management review minutes', priority: 'medium', status: 'open',
        details: 'Provide minutes of management reviews of the ISMS held since the previous surveillance audit.' }
    ],
    workpapers: [
      { title: 'WP-010 Engagement planning and risk assessment', status: 'draft',
        objective: 'Establish scope, materiality, and the risk-based selection of Annex A controls for surveillance testing.',
        procedurePerformed: 'Reviewed the prior certification report, the current Statement of Applicability, and open corrective actions to select the surveillance sample.' }
    ],
    findings: [],
    signoffs: []
  },
  {
    name: 'Internal Controls Review — FY2026',
    engagementType: 'internal_audit',
    status: 'reporting',
    scope: 'Annual internal review of the firm\'s own control environment across access '
      + 'management, vendor oversight, and evidence retention.',
    frameworkCodes: ['nist_800_53'],
    monthsBack: 14,
    pbc: [
      { title: 'Prior-year remediation status', priority: 'medium', status: 'closed',
        details: 'Provide the current status of each remediation item raised in the FY2025 internal review.',
        responseNotes: 'All seven prior-year items evidenced as closed.' }
    ],
    workpapers: [
      { title: 'WP-300 Vendor oversight', status: 'finalized',
        objective: 'Determine whether third-party vendors handling client data are risk-assessed annually.',
        procedurePerformed: 'Inspected the vendor register and the most recent risk assessment for all 12 vendors classified as handling client data.',
        conclusion: 'No exceptions noted.',
        reviewerNotes: 'Vendor population agreed to the accounts payable ledger. Approved.' },
      { title: 'WP-310 Evidence retention', status: 'finalized',
        objective: 'Determine whether engagement evidence is retained for the required seven-year period.',
        procedurePerformed: 'Selected five archived engagements and confirmed the retention lock and expiry date on each evidence repository.',
        conclusion: 'No exceptions noted.',
        reviewerNotes: 'Approved.' }
    ],
    findings: [
      { title: 'Vendor risk assessments not refreshed within 12 months', severity: 'low', status: 'closed',
        description: 'Two vendor risk assessments were refreshed at 13 and 14 months rather than the annual cadence required by the vendor management procedure.',
        recommendation: 'Track assessment due dates in the vendor register with a 30-day advance notification.',
        managementResponse: 'Implemented. Due dates now tracked with automated reminders.',
        workpaperTitle: 'WP-300 Vendor oversight' }
    ],
    signoffs: [
      { signoffType: 'auditor', status: 'approved', comments: 'Fieldwork complete; all workpapers finalized and reviewed.', signer: 'auditor' },
      { signoffType: 'management', status: 'approved', comments: 'Findings and remediation commitments accepted.', signer: 'admin' },
      { signoffType: 'auditor_firm_recommendation', status: 'approved', comments: 'Recommend the control environment be reported as effective, with the one low-severity finding closed.', signer: 'admin' }
    ]
  }
]);

async function findUserByEmail(client, orgId, email) {
  const result = await client.query(
    `SELECT id, TRIM(CONCAT(first_name, ' ', last_name)) AS full_name
     FROM users WHERE email_hash = $1 AND organization_id = $2`,
    [hashForLookup(String(email).trim().toLowerCase()), orgId]
  );
  return result.rows[0] || null;
}

async function pickControlIds(client, orgId, limit) {
  const result = await client.query(
    `SELECT control_id FROM control_implementations
     WHERE organization_id = $1 ORDER BY control_id LIMIT $2`,
    [orgId, limit]
  );
  return result.rows.map((row) => row.control_id);
}

function monthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function insertEngagement(client, ctx, spec) {
  const result = await client.query(
    `INSERT INTO audit_engagements
       (organization_id, name, engagement_type, scope, framework_codes, status,
        period_start, period_end, lead_auditor_id, engagement_owner_id, created_by)
     VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10, $10)
     RETURNING id`,
    [
      ctx.orgId, spec.name, spec.engagementType, spec.scope, spec.frameworkCodes, spec.status,
      monthsAgo(spec.monthsBack), monthsAgo(Math.max(0, spec.monthsBack - 6)),
      ctx.auditorId, ctx.adminId
    ]
  );
  return result.rows[0].id;
}

async function insertPbc(client, ctx, engagementId, items) {
  let index = 0;
  for (const item of items) {
    await client.query(
      `INSERT INTO audit_pbc_requests
         (organization_id, engagement_id, title, request_details, priority, status,
          due_date, assigned_to, response_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        ctx.orgId, engagementId, item.title, item.details, item.priority, item.status,
        daysFromNow(7 + index * 5), ctx.adminId, item.responseNotes || null, ctx.auditorId
      ]
    );
    index += 1;
  }
}

async function insertWorkpapers(client, ctx, engagementId, items) {
  const ids = new Map();
  let index = 0;
  for (const item of items) {
    const reviewed = item.status === 'finalized';
    const result = await client.query(
      `INSERT INTO audit_workpapers
         (organization_id, engagement_id, control_id, title, objective, procedure_performed,
          conclusion, status, prepared_by, reviewed_by, reviewer_notes, prepared_at, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
       RETURNING id`,
      [
        ctx.orgId, engagementId, ctx.controlIds[index % ctx.controlIds.length] || null,
        item.title, item.objective, item.procedurePerformed || null, item.conclusion || null,
        item.status, ctx.auditorId, reviewed ? ctx.adminId : null,
        item.reviewerNotes || null, reviewed ? new Date() : null
      ]
    );
    ids.set(item.title, result.rows[0].id);
    index += 1;
  }
  return ids;
}

async function insertFindings(client, ctx, engagementId, items, workpaperIds) {
  let index = 0;
  for (const item of items) {
    await client.query(
      `INSERT INTO audit_findings
         (organization_id, engagement_id, related_workpaper_id, control_id, title, description,
          severity, status, recommendation, management_response, owner_user_id, due_date,
          created_by, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        ctx.orgId, engagementId, workpaperIds.get(item.workpaperTitle) || null,
        ctx.controlIds[index % ctx.controlIds.length] || null,
        item.title, item.description, item.severity, item.status,
        item.recommendation || null, item.managementResponse || null,
        ctx.adminId, daysFromNow(30 + index * 15), ctx.auditorId,
        item.status === 'closed' ? new Date() : null
      ]
    );
    index += 1;
  }
}

async function insertSignoffs(client, ctx, engagementId, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO audit_signoffs
         (organization_id, engagement_id, signoff_type, status, comments, signed_by, signed_by_name, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        ctx.orgId, engagementId, item.signoffType, item.status, item.comments,
        item.signer === 'auditor' ? ctx.auditorId : ctx.adminId,
        item.signer === 'auditor' ? ctx.auditorName : ctx.adminName
      ]
    );
  }
}

async function seedEngagement(client, ctx, spec) {
  const existing = await client.query(
    'SELECT id FROM audit_engagements WHERE organization_id = $1 AND name = $2',
    [ctx.orgId, spec.name]
  );

  if (existing.rows.length > 0) {
    if (!FORCE) {
      console.log(`  · ${spec.name} — already present, skipping (use --force to rebuild)`);
      return;
    }
    // Children cascade from the engagement row.
    await client.query('DELETE FROM audit_engagements WHERE id = $1', [existing.rows[0].id]);
  }

  const engagementId = await insertEngagement(client, ctx, spec);
  await insertPbc(client, ctx, engagementId, spec.pbc);
  const workpaperIds = await insertWorkpapers(client, ctx, engagementId, spec.workpapers);
  await insertFindings(client, ctx, engagementId, spec.findings, workpaperIds);
  await insertSignoffs(client, ctx, engagementId, spec.signoffs);

  console.log(
    `  ✓ ${spec.status.padEnd(10)} ${spec.name} — `
    + `${spec.pbc.length} PBC, ${spec.workpapers.length} workpapers, `
    + `${spec.findings.length} findings, ${spec.signoffs.length} signoffs`
  );
}

async function run() {
  const account = DEMO_AUDIT_FIRM_ACCOUNT;
  const client = await pool.connect();

  try {
    console.log(`\n🌱 Seeding audit workbench for ${account.orgName}...\n`);

    const orgResult = await client.query('SELECT id FROM organizations WHERE name = $1', [account.orgName]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      throw new Error(`Organization "${account.orgName}" not found — run seed:demo-accounts first.`);
    }

    const admin = await findUserByEmail(client, orgId, account.email);
    const auditor = await findUserByEmail(client, orgId, `auditor@${account.industryKey}.com`);
    if (!admin || !auditor) {
      throw new Error(
        `Audit firm users missing (admin: ${Boolean(admin)}, auditor: ${Boolean(auditor)}). `
        + 'Run seed:demo-accounts and seed:auditor-accounts first.'
      );
    }

    const controlIds = await pickControlIds(client, orgId, 12);
    const ctx = {
      orgId,
      adminId: admin.id,
      adminName: admin.full_name,
      auditorId: auditor.id,
      auditorName: auditor.full_name,
      controlIds
    };

    for (const spec of ENGAGEMENTS) {
      await client.query('BEGIN');
      try {
        await seedEngagement(client, ctx, spec);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('\n✅ Audit workbench ready.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(`\n❌ Audit workbench seeding failed: ${error.message}\n`);
  process.exitCode = 1;
});
