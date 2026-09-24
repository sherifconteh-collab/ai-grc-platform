// @tier: community
/**
 * POA&M gate and auto-raise service.
 *
 * Consolidates the remediation rules that used to live inline in
 * routes/controls.js. They were enforced on PUT /controls/:id only, which the
 * dashboard never calls -- the control detail page goes to
 * PATCH /implementations/:id/status and PATCH /implementations/:id/test-result,
 * neither of which had any POA&M logic. The federal compliance gate was
 * therefore enforced on a code path the product does not use.
 *
 * Two responsibilities:
 *
 *   1. THE GATE. Claiming a control is compliant requires a written
 *      justification, produces a POA&M in pending_auditor_review, and files a
 *      poam_approval_requests row so an auditor has something to act on.
 *   2. AUTO-RAISE. Declaring a gap -- a test or assessment procedure coming
 *      back other_than_satisfied, or an audit finding being recorded -- raises
 *      a draft POA&M so the gap cannot be found and then silently forgotten.
 *
 * Everything here is framework-neutral. framework_controls is a shared
 * cross-framework catalog, so an ISO 27001 corrective action request and a
 * FedRAMP POA&M travel exactly the same path; the vocabulary that names them
 * lives in frameworkPoamService.js.
 */

const pool = require('../config/database');
const { enqueueWebhookEvent } = require('./webhookService');
const { createNotification } = require('./notificationService');
const { log, serializeError } = require('../utils/logger');

// control_implementations.status vocabulary, shared by PUT /controls/:id and
// PATCH /implementations/:id/status.
const NON_COMPLIANT_STATUSES = ['not_started', 'in_progress', 'needs_review'];
const COMPLIANT_STATUSES = ['implemented', 'satisfied_via_crosswalk', 'verified'];

// control_implementations.test_result vocabulary (NIST SP 800-53A outcomes).
const TEST_RESULT_COMPLIANT = 'satisfied';
const TEST_RESULT_GAP = 'other_than_satisfied';

// Statuses that mean "this POA&M is still live", used to keep auto-raise
// idempotent and to decide when remediation on a risk has finished.
const OPEN_POAM_STATUSES = ['open', 'in_progress', 'pending_review', 'pending_auditor_review'];

const GAP_SOURCES = {
  test_result: { sourceType: 'assessment', label: 'control test' },
  procedure: { sourceType: 'assessment', label: 'assessment procedure' },
  finding: { sourceType: 'audit_finding', label: 'audit finding' }
};

// Findings below this severity do not raise a POA&M on their own. Low-severity
// observations are routinely closed in the same conversation that raises them,
// and auto-raising each one buries the register in noise.
const FINDING_SEVERITY_FLOOR = ['medium', 'high', 'critical'];

/**
 * Does moving from previousStatus to newStatus amount to claiming compliance?
 *
 * Cheap and side-effect free so a route can gate on it before writing anything.
 */
function isComplianceTransition(previousStatus, newStatus) {
  return NON_COMPLIANT_STATUSES.includes(String(previousStatus || 'not_started'))
    && COMPLIANT_STATUSES.includes(String(newStatus));
}

/**
 * Same question for the test_result vocabulary.
 */
function isTestResultComplianceTransition(previousResult, newResult) {
  return String(newResult) === TEST_RESULT_COMPLIANT
    && String(previousResult || 'not_assessed') !== TEST_RESULT_COMPLIANT;
}

function isTestResultGap(newResult) {
  return String(newResult) === TEST_RESULT_GAP;
}

/**
 * The 400 body every gated route returns. Kept in one place because
 * `requires_poam_submission` is a published response contract that existing API
 * clients branch on -- changing its shape would break them.
 */
function justificationRequiredResponse() {
  return {
    success: false,
    error: 'When marking a control as compliant, you must provide poam_justification explaining the remediation',
    requires_poam_submission: true
  };
}

async function fetchControlSummary(client, controlId) {
  const result = await client.query(
    'SELECT fc.control_id, fc.title FROM framework_controls fc WHERE fc.id = $1 LIMIT 1',
    [controlId]
  );
  return result.rows[0] || null;
}

/**
 * Mirror the primary control_id into poam_control_links (migration 141) so the
 * many-to-many view is complete no matter which path created the item.
 */
async function linkPrimaryControl(client, { orgId, poamItemId, controlId, userId }) {
  if (!controlId) return;
  await client.query(
    `INSERT INTO poam_control_links (organization_id, poam_item_id, control_id, notes, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT poam_control_links_unique DO NOTHING`,
    [orgId, poamItemId, controlId, 'Originating control', userId]
  );
}

/**
 * Record a compliance claim: create or advance the POA&M and file the approval
 * request an auditor will review.
 *
 * Accepts a caller-supplied `client` so this composes into the caller's
 * transaction rather than opening a competing one. Returns the POA&M row.
 */
async function recordComplianceTransition(client, {
  orgId,
  userId,
  controlId,
  previousStatus,
  newStatus,
  justification,
  frameworkSpecificType,
  frameworkSpecificData
}) {
  const control = await fetchControlSummary(client, controlId);

  // An open POA&M for this control is the normal case -- the gap was recorded
  // when it was found, and this transition is the claim that it is closed.
  const existing = await client.query(
    `SELECT id FROM poam_items
     WHERE organization_id = $1 AND control_id = $2 AND status = ANY($3::text[])
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, controlId, OPEN_POAM_STATUSES]
  );

  let poamItem;
  if (existing.rows.length > 0) {
    const poamId = existing.rows[0].id;
    const updated = await client.query(
      `UPDATE poam_items
       SET status = 'pending_auditor_review',
           remediation_plan = COALESCE(remediation_plan, $3),
           closure_notes = $4,
           submitted_by = $5,
           submitted_for_review_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [poamId, orgId, justification, `Control ${control?.control_id} marked as ${newStatus}`, userId]
    );
    poamItem = updated.rows[0];

    await client.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, $4, 'pending_auditor_review', $5)`,
      [orgId, poamId, `Control remediated: ${justification}`, existing.rows[0].status || 'in_progress', userId]
    );
  } else {
    const created = await client.query(
      `INSERT INTO poam_items (
         organization_id, title, description, source_type, source_id, control_id,
         status, priority, remediation_plan, closure_notes, created_by,
         submitted_by, submitted_for_review_at
       )
       VALUES ($1, $2, $3, 'control', $4, $4, 'pending_auditor_review', 'medium', $5, $6, $7, $7, NOW())
       RETURNING *`,
      [
        orgId,
        `Remediation: ${control?.control_id} - ${control?.title}`,
        `Control transitioned from ${previousStatus} to ${newStatus}`,
        controlId,
        justification,
        `Control marked as ${newStatus}`,
        userId
      ]
    );
    poamItem = created.rows[0];

    await client.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, 'pending_auditor_review', $4)`,
      [orgId, poamItem.id, 'POA&M created for control compliance change', userId]
    );
  }

  await linkPrimaryControl(client, { orgId, poamItemId: poamItem.id, controlId, userId });

  await client.query(
    `INSERT INTO poam_approval_requests (
       organization_id, poam_item_id, control_id, previous_control_status,
       new_control_status, justification, submitted_by, framework_specific_type,
       framework_specific_data
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      orgId,
      poamItem.id,
      controlId,
      previousStatus,
      newStatus,
      justification,
      userId,
      frameworkSpecificType || 'standard',
      frameworkSpecificData || {}
    ]
  );

  await client.query(
    `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
     VALUES ($1, $2, 'poam_compliance_gate_submitted', 'poam', $3, $4::jsonb, true)`,
    [orgId, userId, poamItem.id,
      JSON.stringify({ control_id: controlId, previous_status: previousStatus, new_status: newStatus })]
  );

  return poamItem;
}

/**
 * Fire the notifications a compliance claim should produce. Deliberately
 * separate from recordComplianceTransition and called after COMMIT -- a webhook
 * queued inside a transaction that later rolls back announces something that
 * never happened.
 */
async function notifyComplianceTransition({ orgId, userId, controlId, controlCode, previousStatus, newStatus, poamItem }) {
  await enqueueWebhookEvent({
    organizationId: orgId,
    eventType: 'control.compliance_change',
    payload: {
      control_id: controlId,
      control_code: controlCode,
      previous_status: previousStatus,
      new_status: newStatus,
      poam_id: poamItem?.id
    }
  }).catch(() => {});

  if (poamItem?.id) {
    await createNotification(
      orgId,
      null,
      'poam_review_requested',
      'POA&M awaiting auditor review',
      `${poamItem.title} was submitted for review after a control compliance change.`,
      `/dashboard/poam/${poamItem.id}`
    ).catch(() => {});
  }
}

/**
 * Raise a draft POA&M for a gap that was just declared.
 *
 * Deliberately incomplete: owner, dates and remediation plan are left blank for
 * a human to fill in. The point is that the gap is recorded and visible, not
 * that the system invents a remediation plan nobody agreed to. Nothing here
 * ever closes, approves or assigns an item.
 *
 * Idempotent per (control, source): re-running a failing test does not stack up
 * duplicate POA&Ms for the same gap.
 */
async function raiseFromGap(client, {
  orgId,
  userId,
  source,
  sourceId,
  controlId,
  severity,
  title,
  description
}) {
  const config = GAP_SOURCES[source];
  if (!config) {
    throw new Error(`raiseFromGap: unknown source "${source}"`);
  }
  if (!controlId) return null;

  if (source === 'finding' && !FINDING_SEVERITY_FLOOR.includes(String(severity || '').toLowerCase())) {
    return null;
  }

  const existing = await client.query(
    `SELECT id FROM poam_items
     WHERE organization_id = $1
       AND control_id = $2
       AND source_type = $3
       AND status = ANY($4::text[])
     LIMIT 1`,
    [orgId, controlId, config.sourceType, OPEN_POAM_STATUSES]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const control = await fetchControlSummary(client, controlId);
  const priority = FINDING_SEVERITY_FLOOR.includes(String(severity || '').toLowerCase())
    ? String(severity).toLowerCase()
    : 'medium';

  const created = await client.query(
    `INSERT INTO poam_items (
       organization_id, title, description, source_type, source_id, control_id,
       status, priority, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8)
     RETURNING *`,
    [
      orgId,
      title || `Remediate ${control?.control_id || 'control'}: ${config.label} gap`,
      description || `Raised automatically from a ${config.label} recorded as a gap. Assign an owner, target date and remediation plan.`,
      config.sourceType,
      sourceId || null,
      controlId,
      priority,
      userId
    ]
  );
  const poamItem = created.rows[0];

  await linkPrimaryControl(client, { orgId, poamItemId: poamItem.id, controlId, userId });

  await client.query(
    `INSERT INTO poam_item_updates (
       organization_id, poam_item_id, update_type, note, new_status, changed_by
     )
     VALUES ($1, $2, 'status_change', $3, 'open', $4)`,
    [orgId, poamItem.id, `Raised automatically from a ${config.label}`, userId]
  );

  await client.query(
    `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
     VALUES ($1, $2, 'poam_auto_raised', 'poam', $3, $4::jsonb, true)`,
    [orgId, userId, poamItem.id,
      JSON.stringify({ source: config.sourceType, source_id: sourceId, control_id: controlId, severity: priority })]
  );

  return poamItem;
}

/**
 * Convenience wrapper for callers that are not already inside a transaction.
 * Opens one, runs `fn(client)`, commits, and never lets a POA&M side effect
 * take down the caller's own operation -- a control test result must still be
 * recorded even if raising the POA&M fails.
 */
async function inTransaction(fn, { swallowErrors = false, context = 'poam_gate' } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (!swallowErrors) throw error;
    log('error', `${context}.failed`, { error: serializeError(error) });
    return null;
  } finally {
    client.release();
  }
}

module.exports = {
  NON_COMPLIANT_STATUSES,
  COMPLIANT_STATUSES,
  OPEN_POAM_STATUSES,
  TEST_RESULT_COMPLIANT,
  TEST_RESULT_GAP,
  isComplianceTransition,
  isTestResultComplianceTransition,
  isTestResultGap,
  justificationRequiredResponse,
  recordComplianceTransition,
  notifyComplianceTransition,
  raiseFromGap,
  inTransaction
};
