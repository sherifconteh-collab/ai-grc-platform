// @tier: free
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireSod } = require('../middleware/sod');
const { enqueueWebhookEvent } = require('../services/webhookService');
const { enqueueJob } = require('../services/jobService');
const { createNotification } = require('../services/notificationService');
const {
  getAllFrameworkTypes,
  getFrameworkPoamTypes,
  createFrameworkApprovalRequest,
  getApprovalRequestWithContext,
  getAuditorGuidance
} = require('../services/frameworkPoamService');

router.use(authenticate);

const ALLOWED_STATUS = ['open', 'in_progress', 'pending_review', 'pending_auditor_review', 'auditor_approved', 'auditor_rejected', 'closed', 'risk_accepted'];
const ALLOWED_PRIORITY = ['low', 'medium', 'high', 'critical'];
const ALLOWED_SOURCE_TYPE = ['manual', 'vulnerability', 'control', 'audit_finding', 'assessment'];
const ALLOWED_REVIEW_OUTCOMES = ['approved', 'rejected', 'changes_requested'];

function parseDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function dueDateFromSeverity(severity) {
  const dt = new Date();
  const sev = String(severity || '').toLowerCase();
  if (sev === 'critical') dt.setDate(dt.getDate() + 14);
  else if (sev === 'high') dt.setDate(dt.getDate() + 30);
  else if (sev === 'medium') dt.setDate(dt.getDate() + 45);
  else dt.setDate(dt.getDate() + 60);
  return dt.toISOString().slice(0, 10);
}

async function emitPoamEvent(orgId, userId, eventType, payload) {
  await enqueueWebhookEvent({
    organizationId: orgId,
    eventType,
    payload
  }).catch(() => {});

  await enqueueJob({
    organizationId: orgId,
    jobType: 'webhook_flush',
    payload: { limit: 50 },
    createdBy: userId
  }).catch(() => {});
}

// GET /api/v1/poam
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, priority, source_type, controlId, vulnerabilityId, ownerId, limit, offset } = req.query;
    const where = ['p.organization_id = $1'];
    const params = [orgId];
    let idx = 2;

    if (status && ALLOWED_STATUS.includes(String(status))) {
      where.push(`p.status = $${idx}`);
      params.push(status);
      idx += 1;
    }
    if (priority && ALLOWED_PRIORITY.includes(String(priority))) {
      where.push(`p.priority = $${idx}`);
      params.push(priority);
      idx += 1;
    }
    if (source_type) {
      where.push(`p.source_type = $${idx}`);
      params.push(String(source_type));
      idx += 1;
    }
    if (controlId) {
      where.push(`p.control_id = $${idx}`);
      params.push(controlId);
      idx += 1;
    }
    if (vulnerabilityId) {
      where.push(`p.vulnerability_id = $${idx}`);
      params.push(vulnerabilityId);
      idx += 1;
    }
    if (ownerId) {
      where.push(`p.owner_id = $${idx}`);
      params.push(ownerId);
      idx += 1;
    }

    const qLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const qOffset = Math.max(0, Number(offset) || 0);

    const rows = await pool.query(
      `SELECT
         p.*,
         fc.control_id AS control_code,
         fc.title AS control_title,
         f.code AS framework_code,
         vf.vulnerability_id,
         vf.severity AS vulnerability_severity,
         owner.email AS owner_email,
         creator.email AS created_by_email
       FROM poam_items p
       LEFT JOIN framework_controls fc ON fc.id = p.control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN vulnerability_findings vf ON vf.id = p.vulnerability_id
       LEFT JOIN users owner ON owner.id = p.owner_id
       LEFT JOIN users creator ON creator.id = p.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE p.priority
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         p.due_date NULLS LAST,
         p.created_at DESC
       LIMIT $${idx}
       OFFSET $${idx + 1}`,
      [...params, qLimit, qOffset]
    );

    const counts = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress','pending_review'))::int AS active,
         COUNT(*) FILTER (WHERE status = 'risk_accepted')::int AS risk_accepted,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('closed','risk_accepted'))::int AS overdue
       FROM poam_items p
       WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({
      success: true,
      data: {
        items: rows.rows,
        summary: counts.rows[0] || { total: 0, active: 0, risk_accepted: 0, overdue: 0 },
        pagination: { limit: qLimit, offset: qOffset }
      }
    });
  } catch (error) {
    console.error('POAM list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch POA&M items' });
  }
});

// GET /api/v1/poam/:id
router.get('/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const itemResult = await pool.query(
      `SELECT p.*,
              fc.control_id AS control_code,
              fc.title AS control_title,
              f.code AS framework_code,
              vf.vulnerability_id,
              vf.title AS vulnerability_title,
              vf.severity AS vulnerability_severity
       FROM poam_items p
       LEFT JOIN framework_controls fc ON fc.id = p.control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN vulnerability_findings vf ON vf.id = p.vulnerability_id
       WHERE p.organization_id = $1 AND p.id = $2
       LIMIT 1`,
      [orgId, id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const updatesResult = await pool.query(
      `SELECT pu.*,
              u.email AS changed_by_email
       FROM poam_item_updates pu
       LEFT JOIN users u ON u.id = pu.changed_by
       WHERE pu.organization_id = $1 AND pu.poam_item_id = $2
       ORDER BY pu.created_at DESC`,
      [orgId, id]
    );

    res.json({
      success: true,
      data: {
        item: itemResult.rows[0],
        updates: updatesResult.rows
      }
    });
  } catch (error) {
    console.error('POAM detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch POA&M item' });
  }
});

// POST /api/v1/poam
router.post('/', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      title,
      description,
      source_type = 'manual',
      source_id = null,
      vulnerability_id = null,
      control_id = null,
      owner_id = null,
      status = 'open',
      priority = 'medium',
      due_date = null,
      remediation_plan = null,
      risk_acceptance_expires_at = null
    } = req.body || {};

    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'title is required (min 3 chars)' });
    }
    if (!ALLOWED_SOURCE_TYPE.includes(String(source_type))) {
      return res.status(400).json({ success: false, error: `source_type must be one of: ${ALLOWED_SOURCE_TYPE.join(', ')}` });
    }
    if (!ALLOWED_STATUS.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (!ALLOWED_PRIORITY.includes(String(priority))) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${ALLOWED_PRIORITY.join(', ')}` });
    }

    const itemResult = await pool.query(
      `INSERT INTO poam_items (
         organization_id, title, description, source_type, source_id, vulnerability_id, control_id,
         owner_id, status, priority, due_date, remediation_plan, risk_acceptance_expires_at, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        orgId,
        title,
        description || null,
        source_type,
        source_id,
        vulnerability_id,
        control_id,
        owner_id,
        status,
        priority,
        parseDate(due_date),
        remediation_plan,
        parseDate(risk_acceptance_expires_at),
        req.user.id
      ]
    );

    const item = itemResult.rows[0];

    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, NULL, $4, $5)`,
      [orgId, item.id, 'POA&M item created', item.status, req.user.id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_item_created', 'poam', $3, $4::jsonb, true)`,
      [orgId, req.user.id, item.id, JSON.stringify({ title: item.title, source_type: item.source_type, priority: item.priority })]
    );

    await emitPoamEvent(orgId, req.user.id, 'poam.item.created', {
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority
    });

    // Notify org admins of new POA&M item
    await createNotification(
      orgId,
      null, // broadcast
      'system',
      'New POA&M Item Created',
      `"${item.title}" (${item.priority} priority) has been added to your POA&M.`,
      `/dashboard/operations`
    );

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('POAM create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create POA&M item' });
  }
});

// POST /api/v1/poam/from-vulnerability/:vulnerabilityId
router.post('/from-vulnerability/:vulnerabilityId', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vulnerabilityId = req.params.vulnerabilityId;

    const findingResult = await pool.query(
      `SELECT id, vulnerability_id, title, severity, status, due_date
       FROM vulnerability_findings
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, vulnerabilityId]
    );
    if (findingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability finding not found' });
    }

    const finding = findingResult.rows[0];
    const defaultDue = finding.due_date || dueDateFromSeverity(finding.severity);

    const created = await pool.query(
      `INSERT INTO poam_items (
         organization_id, title, description, source_type, source_id, vulnerability_id,
         status, priority, due_date, created_by
       )
       VALUES (
         $1, $2, $3, 'vulnerability', $4, $4,
         'open', $5, $6, $7
       )
       RETURNING *`,
      [
        orgId,
        `Remediate ${finding.vulnerability_id || 'vulnerability finding'}`,
        finding.title || 'Vulnerability remediation required.',
        finding.id,
        String(finding.severity || '').toLowerCase() === 'critical' ? 'critical' : 'high',
        defaultDue,
        req.user.id
      ]
    );

    const item = created.rows[0];

    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, NULL, $4, $5)`,
      [orgId, item.id, `Auto-created from vulnerability ${finding.vulnerability_id || finding.id}`, item.status, req.user.id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_item_created_from_vulnerability', 'poam', $3, $4::jsonb, true)`,
      [orgId, req.user.id, item.id, JSON.stringify({ vulnerability_id: finding.id, vulnerability_key: finding.vulnerability_id })]
    );

    await emitPoamEvent(orgId, req.user.id, 'poam.item.created_from_vulnerability', {
      id: item.id,
      vulnerability_id: finding.id
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('POAM from vulnerability error:', error);
    res.status(500).json({ success: false, error: 'Failed to create POA&M from vulnerability' });
  }
});

// PATCH /api/v1/poam/:id
router.patch('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const existingResult = await pool.query(
      `SELECT *
       FROM poam_items
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const existing = existingResult.rows[0];
    const patch = req.body || {};

    const nextStatus = patch.status !== undefined ? String(patch.status) : existing.status;
    const nextPriority = patch.priority !== undefined ? String(patch.priority) : existing.priority;
    if (!ALLOWED_STATUS.includes(nextStatus)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (!ALLOWED_PRIORITY.includes(nextPriority)) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${ALLOWED_PRIORITY.join(', ')}` });
    }

    const closedAt = ['closed', 'risk_accepted'].includes(nextStatus) ? new Date().toISOString() : null;

    const updatedResult = await pool.query(
      `UPDATE poam_items
       SET title = COALESCE($3, title),
           description = COALESCE($4, description),
           owner_id = COALESCE($5, owner_id),
           status = $6,
           priority = $7,
           due_date = COALESCE($8, due_date),
           remediation_plan = COALESCE($9, remediation_plan),
           closure_notes = COALESCE($10, closure_notes),
           risk_acceptance_expires_at = COALESCE($11, risk_acceptance_expires_at),
           closed_at = CASE WHEN $6 IN ('closed','risk_accepted') THEN COALESCE(closed_at, $12::timestamp) ELSE NULL END,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        patch.title || null,
        patch.description || null,
        patch.owner_id || null,
        nextStatus,
        nextPriority,
        parseDate(patch.due_date),
        patch.remediation_plan || null,
        patch.closure_notes || null,
        parseDate(patch.risk_acceptance_expires_at),
        closedAt
      ]
    );

    const updated = updatedResult.rows[0];

    if (existing.status !== updated.status) {
      await pool.query(
        `INSERT INTO poam_item_updates (
           organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
         )
         VALUES ($1, $2, 'status_change', $3, $4, $5, $6)`,
        [orgId, id, patch.note || 'Status updated', existing.status, updated.status, req.user.id]
      );
    } else if (patch.note) {
      await pool.query(
        `INSERT INTO poam_item_updates (
           organization_id, poam_item_id, update_type, note, changed_by
         )
         VALUES ($1, $2, 'note', $3, $4)`,
        [orgId, id, patch.note, req.user.id]
      );
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_item_updated', 'poam', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ old_status: existing.status, new_status: updated.status, priority: updated.priority })]
    );

    await emitPoamEvent(orgId, req.user.id, 'poam.item.updated', {
      id: updated.id,
      old_status: existing.status,
      new_status: updated.status
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POAM update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update POA&M item' });
  }
});

// POST /api/v1/poam/:id/updates
router.post('/:id/updates', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const note = String(req.body?.note || '').trim();
    if (!note) {
      return res.status(400).json({ success: false, error: 'note is required' });
    }

    const exists = await pool.query(
      `SELECT id
       FROM poam_items
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (exists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const inserted = await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, changed_by
       )
       VALUES ($1, $2, 'note', $3, $4)
       RETURNING *`,
      [orgId, id, note, req.user.id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_item_note_added', 'poam', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ note })]
    );

    await emitPoamEvent(orgId, req.user.id, 'poam.item.note_added', { id, note });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    console.error('POAM add note error:', error);
    res.status(500).json({ success: false, error: 'Failed to add POA&M update note' });
  }
});

// POST /api/v1/poam/:id/submit-for-review
// Submit POA&M for auditor review (typically after control status change from NC to Compliant)
router.post('/:id/submit-for-review', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamId = req.params.id;
    const {
      control_id,
      previous_control_status,
      new_control_status,
      justification,
      supporting_evidence_ids = [],
      framework_specific_type,
      framework_specific_data = {}
    } = req.body || {};

    // Validate POA&M exists
    const poamResult = await pool.query(
      `SELECT id, status, title FROM poam_items WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, poamId]
    );
    if (poamResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const poam = poamResult.rows[0];

    // Validate that POA&M is in appropriate state for submission
    if (!['in_progress', 'pending_review'].includes(poam.status)) {
      return res.status(400).json({
        success: false,
        error: 'POA&M must be in "in_progress" or "pending_review" status to submit for auditor review'
      });
    }

    if (!justification || String(justification).trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Justification is required (minimum 10 characters)'
      });
    }

    // Create framework-specific approval request
    const approvalRequest = await createFrameworkApprovalRequest(
      orgId,
      req.user.id,
      poamId,
      control_id,
      {
        previous_control_status,
        new_control_status,
        justification,
        supporting_evidence_ids,
        framework_specific_type,
        framework_specific_data
      }
    );

    // Update POA&M status
    await pool.query(
      `UPDATE poam_items
       SET status = 'pending_auditor_review',
           review_status = 'pending_auditor_review',
           submitted_for_review_at = NOW(),
           submitted_by = $3,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [orgId, poamId, req.user.id]
    );

    // Add update record
    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, $4, 'pending_auditor_review', $5)`,
      [
        orgId,
        poamId,
        `Submitted for auditor review${framework_specific_type ? ` (${framework_specific_type})` : ''}`,
        poam.status,
        req.user.id
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_submitted_for_review', 'poam', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        poamId,
        JSON.stringify({
          title: poam.title,
          control_id,
          previous_status: poam.status,
          framework_specific_type,
          justification: justification.substring(0, 200)
        })
      ]
    );

    // Emit webhook event
    await emitPoamEvent(orgId, req.user.id, 'poam.submitted_for_review', {
      id: poamId,
      title: poam.title,
      approval_request_id: approvalRequest.id,
      framework_specific_type
    });

    // Notify auditors with audit.read permission
    await createNotification(
      orgId,
      null, // broadcast to auditors
      'system',
      'POA&M Submitted for Review',
      `"${poam.title}" has been submitted for auditor review${framework_specific_type ? ` (${framework_specific_type})` : ''}.`,
      `/dashboard/audit/poam/${poamId}`
    );

    res.status(201).json({
      success: true,
      data: {
        poam_id: poamId,
        approval_request: approvalRequest,
        message: 'POA&M submitted for auditor review successfully'
      }
    });
  } catch (error) {
    console.error('POAM submit for review error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit POA&M for review' });
  }
});

// POST /api/v1/poam/:id/review
// Auditor reviews and approves/rejects POA&M
router.post('/:id/review', requirePermission('audit.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamId = req.params.id;
    const { outcome, comments } = req.body || {};

    if (!outcome || !ALLOWED_REVIEW_OUTCOMES.includes(String(outcome))) {
      return res.status(400).json({
        success: false,
        error: `outcome must be one of: ${ALLOWED_REVIEW_OUTCOMES.join(', ')}`
      });
    }

    if (!comments || String(comments).trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Review comments are required (minimum 10 characters)'
      });
    }

    // Validate POA&M exists and is pending review
    const poamResult = await pool.query(
      `SELECT id, status, title, review_status, submitted_by FROM poam_items
       WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, poamId]
    );
    if (poamResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const poam = poamResult.rows[0];

    if (poam.status !== 'pending_auditor_review') {
      return res.status(400).json({
        success: false,
        error: 'POA&M must be in "pending_auditor_review" status to review'
      });
    }

    // SOD: the user who submitted the POA&M cannot be the reviewer
    const sodError = requireSod(poam.submitted_by, req.user.id, 'submitter', 'auditor reviewer', req.user.permissions || []);
    if (sodError) {
      return res.status(403).json({ success: false, error: sodError });
    }

    // Determine new status based on outcome
    let newStatus = poam.status;
    let newReviewStatus = outcome;

    if (outcome === 'approved') {
      newStatus = 'auditor_approved';
      newReviewStatus = 'auditor_approved';
    } else if (outcome === 'rejected') {
      newStatus = 'auditor_rejected';
      newReviewStatus = 'auditor_rejected';
    } else if (outcome === 'changes_requested') {
      newStatus = 'in_progress';
      newReviewStatus = 'changes_requested';
    }

    // Update POA&M with review
    await pool.query(
      `UPDATE poam_items
       SET status = $3,
           review_status = $4,
           reviewed_at = NOW(),
           reviewed_by = $5,
           review_notes = $6,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [orgId, poamId, newStatus, newReviewStatus, req.user.id, comments]
    );

    // Update approval request
    await pool.query(
      `UPDATE poam_approval_requests
       SET reviewed_by = $3,
           reviewed_at = NOW(),
           review_outcome = $4,
           review_comments = $5,
           updated_at = NOW()
       WHERE organization_id = $1 AND poam_item_id = $2
         AND reviewed_at IS NULL
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [orgId, poamId, req.user.id, outcome, comments]
    );

    // Add update record
    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, $4, $5, $6)`,
      [
        orgId,
        poamId,
        `Auditor review: ${outcome} - ${comments}`,
        poam.status,
        newStatus,
        req.user.id
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_auditor_reviewed', 'poam', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        poamId,
        JSON.stringify({
          title: poam.title,
          outcome,
          comments: comments.substring(0, 200)
        })
      ]
    );

    // Emit webhook event
    await emitPoamEvent(orgId, req.user.id, 'poam.auditor_reviewed', {
      id: poamId,
      title: poam.title,
      outcome
    });

    // Notify submitter
    const submitterResult = await pool.query(
      `SELECT submitted_by FROM poam_items WHERE id = $1 AND organization_id = $2`,
      [poamId, orgId]
    );
    if (submitterResult.rows.length > 0 && submitterResult.rows[0].submitted_by) {
      await createNotification(
        orgId,
        submitterResult.rows[0].submitted_by,
        'system',
        `POA&M Review ${outcome === 'approved' ? 'Approved' : outcome === 'rejected' ? 'Rejected' : 'Requires Changes'}`,
        `"${poam.title}" has been reviewed by an auditor. Status: ${outcome}`,
        `/dashboard/operations/poam/${poamId}`
      );
    }

    res.json({
      success: true,
      data: {
        poam_id: poamId,
        outcome,
        new_status: newStatus,
        message: `POA&M ${outcome} successfully`
      }
    });
  } catch (error) {
    console.error('POAM review error:', error);
    res.status(500).json({ success: false, error: 'Failed to review POA&M' });
  }
});

// GET /api/v1/poam/:id/approval-history
// Get approval request history for a POA&M
router.get('/:id/approval-history', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamId = req.params.id;

    const approvalHistory = await pool.query(
      `SELECT 
         par.*,
         fc.control_id AS control_code,
         fc.title AS control_title,
         submitter.email AS submitted_by_email,
         reviewer.email AS reviewed_by_email
       FROM poam_approval_requests par
       LEFT JOIN framework_controls fc ON fc.id = par.control_id
       LEFT JOIN users submitter ON submitter.id = par.submitted_by
       LEFT JOIN users reviewer ON reviewer.id = par.reviewed_by
       WHERE par.organization_id = $1 AND par.poam_item_id = $2
       ORDER BY par.submitted_at DESC`,
      [orgId, poamId]
    );

    res.json({
      success: true,
      data: approvalHistory.rows
    });
  } catch (error) {
    console.error('POAM approval history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch approval history' });
  }
});

// GET /api/v1/poam/framework-types
// Get all available framework-specific POA&M types
router.get('/framework-types', requirePermission('controls.read'), async (req, res) => {
  try {
    const { framework_code } = req.query;

    let types;
    if (framework_code) {
      const frameworkConfig = getFrameworkPoamTypes(framework_code);
      types = frameworkConfig ? frameworkConfig.types : [];
    } else {
      types = getAllFrameworkTypes();
    }

    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    console.error('Get framework types error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch framework types' });
  }
});

// GET /api/v1/poam/auditor-guidance/:frameworkCode/:typeCode
// Get auditor guidance for a specific framework type
router.get('/auditor-guidance/:frameworkCode/:typeCode', requirePermission('audit.read'), async (req, res) => {
  try {
    const { frameworkCode, typeCode } = req.params;

    const guidance = getAuditorGuidance(frameworkCode, typeCode);
    
    if (!guidance) {
      return res.status(404).json({
        success: false,
        error: 'Framework type not found or guidance not available'
      });
    }

    res.json({
      success: true,
      data: guidance
    });
  } catch (error) {
    console.error('Get auditor guidance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch auditor guidance' });
  }
});

// GET /api/v1/poam/approval-request/:id/context
// Get approval request with full framework context
router.get('/approval-request/:id/context', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const approvalRequestId = req.params.id;

    const request = await getApprovalRequestWithContext(approvalRequestId, orgId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Approval request not found'
      });
    }

    // Get auditor guidance if framework-specific type
    if (request.framework_code && request.framework_specific_type) {
      request.auditor_guidance = getAuditorGuidance(
        request.framework_code,
        request.framework_specific_type
      );
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Get approval request context error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch approval request context' });
  }
});

module.exports = router;
