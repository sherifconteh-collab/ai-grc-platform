// @tier: free
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');
const { createNotification } = require('../services/notificationService');
// Optional premium service — not available in community edition
let llmServiceModule;
try { llmServiceModule = require('../services/llmService'); } catch (_) { llmServiceModule = {}; }
const { invalidateAICache = () => {} } = llmServiceModule;

router.use(authenticate);

// POST /implementations/by-control/:controlId/ensure
// Ensure an implementation record exists for this org+control so the UI can assign, review, and link evidence.
router.post('/by-control/:controlId/ensure', requirePermission('implementations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const controlId = req.params.controlId;

    if (!isUuid(controlId)) {
      return res.status(400).json({ success: false, error: 'controlId must be a valid UUID' });
    }

    // Verify the control is in-scope for the org (selected frameworks only).
    const allowed = await pool.query(
      `SELECT 1
       FROM organization_frameworks of2
       JOIN framework_controls fc ON fc.framework_id = of2.framework_id
       WHERE of2.organization_id = $1 AND fc.id = $2
       LIMIT 1`,
      [orgId, controlId]
    );

    if (allowed.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control not found for this organization' });
    }

    const result = await pool.query(
      `INSERT INTO control_implementations (control_id, organization_id, status)
       VALUES ($1, $2, 'not_started')
       ON CONFLICT (control_id, organization_id) DO UPDATE SET
         status = control_implementations.status
       RETURNING id, status, (xmax = 0) AS inserted`,
      [controlId, orgId]
    );

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        inserted: Boolean(result.rows[0].inserted)
      }
    });
  } catch (error) {
    console.error('Ensure implementation error:', error);
    res.status(500).json({ success: false, error: 'Failed to ensure implementation' });
  }
});

// GET /implementations
router.get('/', requirePermission('implementations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { frameworkId, status, assignedTo, priority, controlId } = req.query;

    let query = `
      SELECT ci.id, ci.status, ci.implementation_notes, ci.evidence_location,
             ci.assigned_to, ci.notes, ci.implementation_date, ci.created_at,
             fc.control_id as control_code, fc.title as control_title, fc.priority,
             fc.id as framework_control_id,
             f.name as framework_name, f.code as framework_code,
             u.first_name || ' ' || u.last_name as assigned_to_name,
             u.email as assigned_to_email
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE ci.organization_id = $1
    `;
    const params = [orgId];
    let idx = 2;

    if (frameworkId) {
      query += ` AND f.id = $${idx}`;
      params.push(frameworkId);
      idx++;
    }
    if (status) {
      query += ` AND ci.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (assignedTo) {
      query += ` AND ci.assigned_to = $${idx}`;
      params.push(assignedTo);
      idx++;
    }
    if (priority) {
      query += ` AND fc.priority = $${idx}`;
      params.push(priority);
      idx++;
    }
    if (controlId) {
      query += ` AND fc.id = $${idx}`;
      params.push(controlId);
      idx++;
    }

    query += ' ORDER BY ci.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Implementations error:', error);
    res.status(500).json({ success: false, error: 'Failed to load implementations' });
  }
});

// GET /implementations/activity/feed
router.get('/activity/feed', requirePermission('implementations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(`
      SELECT al.id, al.event_type, al.details, al.created_at,
             u.first_name || ' ' || u.last_name as changed_by_name,
             COALESCE(al.details->>'status', '') as new_status,
             COALESCE(al.details->>'old_status', '') as old_status,
             fc.control_id as control_code, fc.title as control_title
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN framework_controls fc ON fc.id = al.resource_id
      WHERE al.organization_id = $1
        AND al.resource_type = 'control'
      ORDER BY al.created_at DESC
      LIMIT $2 OFFSET $3
    `, [orgId, limit, offset]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Activity feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to load activity feed' });
  }
});

// GET /implementations/due/upcoming
router.get('/due/upcoming', requirePermission('implementations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const days = parseInt(req.query.days) || 30;

    const result = await pool.query(`
      SELECT ci.id, ci.status, ci.implementation_date, ci.assigned_to,
             fc.control_id as control_code, fc.title as control_title, fc.priority,
             f.name as framework_name,
             u.first_name || ' ' || u.last_name as assigned_to_name
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE ci.organization_id = $1
        AND ci.status IN ('in_progress', 'needs_review')
        AND ci.implementation_date IS NOT NULL
        AND ci.implementation_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
      ORDER BY ci.implementation_date ASC
    `, [orgId, days.toString()]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Due controls error:', error);
    res.status(500).json({ success: false, error: 'Failed to load due controls' });
  }
});

// GET /implementations/:id
router.get('/:id', requirePermission('implementations.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ci.id, ci.status, ci.implementation_notes, ci.evidence_location,
             ci.assigned_to, ci.notes, ci.implementation_date, ci.implementation_date as due_date,
             CASE WHEN ci.status = 'implemented' THEN ci.implementation_date ELSE NULL END as completed_at,
             ci.created_at,
             fc.id as framework_control_id, fc.control_id as control_code, fc.title as control_title, fc.priority,
             f.name as framework_name, f.code as framework_code,
             u.first_name || ' ' || u.last_name as assigned_to_name,
             u.email as assigned_to_email
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE ci.id = $1 AND ci.organization_id = $2
    `, [req.params.id, req.user.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Implementation not found' });
    }

    const implementation = result.rows[0];

    const statusHistoryResult = await pool.query(`
      SELECT al.id,
             COALESCE(al.details->>'old_status', 'not_started') as old_status,
             COALESCE(al.details->>'status', al.details->>'new_status', 'not_started') as new_status,
             al.details->>'notes' as notes,
             al.created_at as changed_at,
             COALESCE(u.first_name || ' ' || u.last_name, 'System') as changed_by_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.organization_id = $1
        AND al.resource_type = 'control'
        AND al.resource_id = $2
      ORDER BY al.created_at DESC
      LIMIT 50
    `, [req.user.organization_id, req.params.id]);

    const evidenceResult = await pool.query(`
      SELECT e.id, e.file_name, e.description, e.mime_type,
             e.created_at as uploaded_at, ecl.notes as link_notes,
             COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') as uploaded_by_name
      FROM evidence_control_links ecl
      JOIN evidence e ON e.id = ecl.evidence_id
      LEFT JOIN users u ON u.id = e.uploaded_by
      WHERE e.organization_id = $1
        AND ecl.control_id = $2
      ORDER BY e.created_at DESC
    `, [req.user.organization_id, implementation.framework_control_id]);

    implementation.status_history = statusHistoryResult.rows;
    implementation.evidence = evidenceResult.rows;

    res.json({ success: true, data: implementation });
  } catch (error) {
    console.error('Get implementation error:', error);
    res.status(500).json({ success: false, error: 'Failed to load implementation' });
  }
});

// PATCH /implementations/:id/status
router.patch('/:id/status', requirePermission('implementations.write'), validateBody((body) => {
  const errors = requireFields(body, ['status']);
  const allowedStatuses = ['not_started', 'in_progress', 'implemented', 'needs_review', 'satisfied_via_crosswalk', 'verified', 'not_applicable'];
  if (body.status && !allowedStatuses.includes(body.status)) {
    errors.push(`status must be one of: ${allowedStatuses.join(', ')}`);
  }
  return errors;
}), async (req, res) => {
  try {
    const { status, notes } = req.body;

    const existing = await pool.query(
      'SELECT id, status FROM control_implementations WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Implementation not found' });
    }

    const oldStatus = existing.rows[0].status;

    // Forward-only status enforcement
    const STATUS_ORDER = ['not_started', 'in_progress', 'implemented', 'verified'];
    const currentIdx = STATUS_ORDER.indexOf(oldStatus);
    const newIdx = STATUS_ORDER.indexOf(status);
    if (newIdx !== -1 && currentIdx !== -1 && newIdx < currentIdx) {
      return res.status(400).json({ success: false, error: 'Status cannot be moved backward.' });
    }
    if (status === 'verified' && req.user.role !== 'admin' && req.user.role !== 'auditor') {
      return res.status(403).json({ success: false, error: 'Only auditors or admins can set status to Verified.' });
    }

    const result = await pool.query(`
      UPDATE control_implementations SET status = $1, notes = COALESCE($2, notes),
        implementation_date = CASE WHEN $4 = 'implemented' THEN CURRENT_DATE ELSE implementation_date END
      WHERE id = $3 RETURNING *
    `, [status, notes || null, req.params.id, status]);

    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
       VALUES ($1, $2, 'control_status_changed', 'control', $3, $4)`,
      [req.user.organization_id, req.user.id, existing.rows[0].id,
       JSON.stringify({ old_status: oldStatus, status, notes })]
    );

    // Notify org when a control reaches 'verified'
    if (status === 'verified') {
      const ctrl = await pool.query(
        `SELECT fc.control_id FROM control_implementations ci
         JOIN framework_controls fc ON fc.id = ci.control_id
         WHERE ci.id = $1 LIMIT 1`,
        [req.params.id]
      );
      const controlRef = ctrl.rows[0]?.control_id || req.params.id;
      await createNotification(
        req.user.organization_id,
        null, // broadcast to org
        'status_change',
        'Control Verified',
        `Control ${controlRef} has been marked as Verified.`,
        `/dashboard/controls/${ctrl.rows[0]?.id || req.params.id}`
      );
    }

    // Invalidate AI caches when control status changes
    // This ensures gap analysis and compliance forecasting reflect the latest data
    invalidateAICache(req.user.organization_id);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// PATCH /implementations/:id/assign
router.patch('/:id/assign', requirePermission('implementations.write'), validateBody((body) => {
  const errors = [];
  if (body.assignedTo && !isUuid(body.assignedTo)) {
    errors.push('assignedTo must be a valid UUID');
  }
  if (body.dueDate && Number.isNaN(Date.parse(body.dueDate))) {
    errors.push('dueDate must be a valid date');
  }
  return errors;
}), async (req, res) => {
  try {
    const { assignedTo, dueDate, notes } = req.body;

    const result = await pool.query(`
      UPDATE control_implementations SET
        assigned_to = $1,
        implementation_date = $2,
        notes = COALESCE($3, notes)
      WHERE id = $4 AND organization_id = $5
      RETURNING *
    `, [assignedTo || null, dueDate || null, notes || null, req.params.id, req.user.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Implementation not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Assign error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign control' });
  }
});

// POST /implementations/:id/review
router.post('/:id/review', requirePermission('implementations.write'), validateBody(() => []), async (req, res) => {
  try {
    const { notes } = req.body;

    const result = await pool.query(`
      UPDATE control_implementations SET
        status = 'needs_review',
        notes = COALESCE($1, notes)
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `, [notes || null, req.params.id, req.user.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Implementation not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit review' });
  }
});

// PATCH /implementations/:id/test-result
// Records auditor/tester overall verdict at the control level
router.patch('/:id/test-result', requirePermission('assessments.write'), validateBody((body) => {
  const errors = [];
  const valid = ['not_assessed', 'satisfied', 'other_than_satisfied', 'not_applicable'];
  if (!body.test_result) {
    errors.push('test_result is required');
  } else if (!valid.includes(body.test_result)) {
    errors.push(`test_result must be one of: ${valid.join(', ')}`);
  }
  return errors;
}), async (req, res) => {
  try {
    const { test_result, test_notes } = req.body;
    const result = await pool.query(
      `UPDATE control_implementations
       SET test_result = $1, test_notes = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING id, test_result, test_notes, updated_at`,
      [test_result, test_notes || null, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Implementation not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Test result update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update test result' });
  }
});

module.exports = router;
