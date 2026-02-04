import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = express.Router();

/**
 * GET /api/v1/implementations
 * Get all control implementations for the organization
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { frameworkId, status, assignedTo, priority, controlId } = req.query;

    let query = `
      SELECT
        ci.id,
        ci.control_id,
        ci.status,
        ci.assigned_to,
        ci.due_date,
        ci.notes,
        ci.completed_at,
        ci.last_reviewed_at,
        ci.created_at,
        ci.updated_at,
        fc.control_id as control_code,
        fc.title as control_title,
        fc.description as control_description,
        fc.priority,
        f.id as framework_id,
        f.code as framework_code,
        f.name as framework_name,
        u.full_name as assigned_to_name,
        u.email as assigned_to_email,
        (SELECT COUNT(*) FROM control_evidence ce
         JOIN evidence_files ef ON ef.id = ce.evidence_id
         WHERE ce.control_id = fc.id AND ef.organization_id = $1) as evidence_count
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE ci.organization_id = $1
    `;

    const params = [organizationId];
    let paramIndex = 2;

    if (frameworkId) {
      query += ` AND f.id = $${paramIndex}`;
      params.push(frameworkId);
      paramIndex++;
    }

    if (status) {
      query += ` AND ci.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (assignedTo) {
      query += ` AND ci.assigned_to = $${paramIndex}`;
      params.push(assignedTo);
      paramIndex++;
    }

    if (priority) {
      query += ` AND fc.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (controlId) {
      query += ` AND ci.control_id = $${paramIndex}`;
      params.push(controlId);
      paramIndex++;
    }

    query += ` ORDER BY fc.priority DESC, f.code, fc.control_id`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get implementations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch implementations'
    });
  }
});

/**
 * GET /api/v1/implementations/:id
 * Get a specific control implementation with full details
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user.organizationId;

    const result = await pool.query(`
      SELECT
        ci.*,
        fc.control_id as control_code,
        fc.title as control_title,
        fc.description as control_description,
        fc.priority,
        fc.control_type,
        f.id as framework_id,
        f.code as framework_code,
        f.name as framework_name,
        u_assigned.full_name as assigned_to_name,
        u_assigned.email as assigned_to_email,
        u_completed.full_name as completed_by_name,
        u_reviewed.full_name as last_reviewed_by_name
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u_assigned ON u_assigned.id = ci.assigned_to
      LEFT JOIN users u_completed ON u_completed.id = ci.completed_by
      LEFT JOIN users u_reviewed ON u_reviewed.id = ci.last_reviewed_by
      WHERE ci.id = $1 AND ci.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Implementation not found'
      });
    }

    // Get status history
    const historyResult = await pool.query(`
      SELECT
        csh.id,
        csh.old_status,
        csh.new_status,
        csh.notes,
        csh.changed_at,
        u.full_name as changed_by_name
      FROM control_status_history csh
      LEFT JOIN users u ON u.id = csh.changed_by
      WHERE csh.control_implementation_id = $1
      ORDER BY csh.changed_at DESC
      LIMIT 20
    `, [id]);

    // Get linked evidence
    const evidenceResult = await pool.query(`
      SELECT
        ef.id,
        ef.file_name,
        ef.description,
        ef.mime_type,
        ef.uploaded_at,
        ce.notes as link_notes,
        ce.linked_at,
        u.full_name as uploaded_by_name
      FROM control_evidence ce
      JOIN evidence_files ef ON ef.id = ce.evidence_id
      LEFT JOIN users u ON u.id = ef.uploaded_by
      WHERE ce.control_id = (SELECT control_id FROM control_implementations WHERE id = $1)
      AND ef.organization_id = $2
      ORDER BY ce.linked_at DESC
    `, [id, organizationId]);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        status_history: historyResult.rows,
        evidence: evidenceResult.rows
      }
    });
  } catch (error) {
    console.error('Get implementation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch implementation'
    });
  }
});

/**
 * PATCH /api/v1/implementations/:id/status
 * Update implementation status (with status history tracking)
 */
router.patch('/:id/status', authenticateToken, requirePermission('controls.write'), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const organizationId = req.user.organizationId;
    const userId = req.user.userId;

    const validStatuses = ['not_started', 'in_progress', 'implemented', 'verified', 'not_applicable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    await client.query('BEGIN');

    // Get current status
    const currentResult = await client.query(
      'SELECT status FROM control_implementations WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Implementation not found'
      });
    }

    const oldStatus = currentResult.rows[0].status;

    // Update the implementation
    const updateFields = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let paramIndex = 2;

    // Set completed fields if status is 'implemented' or 'verified'
    if (status === 'implemented' || status === 'verified') {
      if (oldStatus !== 'implemented' && oldStatus !== 'verified') {
        updateFields.push(`completed_at = NOW()`);
        updateFields.push(`completed_by = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }
    }

    if (notes) {
      updateFields.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    params.push(id);
    params.push(organizationId);

    await client.query(`
      UPDATE control_implementations
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
    `, params);

    // Record status change in history
    await client.query(`
      INSERT INTO control_status_history (control_implementation_id, old_status, new_status, changed_by, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, oldStatus, status, userId, notes]);

    // Log to audit trail
    await client.query(`
      INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      'update_control_status',
      'control_implementation',
      id,
      req.ip,
      req.headers['user-agent'],
      JSON.stringify({ old_status: oldStatus, new_status: status, notes })
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Status updated from '${oldStatus}' to '${status}'`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status'
    });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/v1/implementations/:id/assign
 * Assign control to a user
 */
router.patch('/:id/assign', authenticateToken, requirePermission('controls.assign'), async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo, dueDate, notes } = req.body;
    const organizationId = req.user.organizationId;
    const userId = req.user.userId;

    // Verify assignee belongs to the organization
    if (assignedTo) {
      const userCheck = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
        [assignedTo, organizationId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Assigned user not found in your organization'
        });
      }
    }

    const updateFields = ['updated_at = NOW()'];
    const params = [];
    let paramIndex = 1;

    if (assignedTo !== undefined) {
      updateFields.push(`assigned_to = $${paramIndex}`);
      params.push(assignedTo || null);
      paramIndex++;
    }

    if (dueDate !== undefined) {
      updateFields.push(`due_date = $${paramIndex}`);
      params.push(dueDate || null);
      paramIndex++;
    }

    if (notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    params.push(id);
    params.push(organizationId);

    const result = await pool.query(`
      UPDATE control_implementations
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Implementation not found'
      });
    }

    // Log to audit trail
    await pool.query(`
      INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      'assign_control',
      'control_implementation',
      id,
      req.ip,
      req.headers['user-agent'],
      JSON.stringify({ assigned_to: assignedTo, due_date: dueDate })
    ]);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Assign control error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign control'
    });
  }
});

/**
 * POST /api/v1/implementations/:id/review
 * Mark control as reviewed (for periodic review workflow)
 */
router.post('/:id/review', authenticateToken, requirePermission('controls.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, stillApplicable, evidenceUpdated } = req.body;
    const organizationId = req.user.organizationId;
    const userId = req.user.userId;

    const result = await pool.query(`
      UPDATE control_implementations
      SET
        last_reviewed_at = NOW(),
        last_reviewed_by = $1,
        notes = COALESCE($2, notes),
        updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `, [userId, notes, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Implementation not found'
      });
    }

    // Record in status history
    await pool.query(`
      INSERT INTO control_status_history (control_implementation_id, old_status, new_status, changed_by, notes)
      VALUES ($1, $2, $2, $3, $4)
    `, [id, result.rows[0].status, userId, `Reviewed: ${notes || 'No notes'}`]);

    // Log to audit trail
    await pool.query(`
      INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      'review_control',
      'control_implementation',
      id,
      req.ip,
      req.headers['user-agent'],
      JSON.stringify({ notes, still_applicable: stillApplicable, evidence_updated: evidenceUpdated })
    ]);

    res.json({
      success: true,
      message: 'Review recorded successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Review control error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record review'
    });
  }
});

/**
 * GET /api/v1/implementations/activity
 * Get recent activity feed for control implementations
 */
router.get('/activity/feed', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT
        csh.id,
        csh.old_status,
        csh.new_status,
        csh.notes,
        csh.changed_at,
        u.full_name as changed_by_name,
        u.email as changed_by_email,
        fc.control_id as control_code,
        fc.title as control_title,
        f.code as framework_code,
        f.name as framework_name
      FROM control_status_history csh
      JOIN control_implementations ci ON ci.id = csh.control_implementation_id
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = csh.changed_by
      WHERE ci.organization_id = $1
      ORDER BY csh.changed_at DESC
      LIMIT $2 OFFSET $3
    `, [organizationId, limit, offset]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get activity feed error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity feed'
    });
  }
});

/**
 * GET /api/v1/implementations/due
 * Get controls that are due soon or overdue
 */
router.get('/due/upcoming', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const { days = 30 } = req.query;

    const result = await pool.query(`
      SELECT
        ci.id,
        ci.status,
        ci.due_date,
        ci.assigned_to,
        fc.control_id as control_code,
        fc.title as control_title,
        fc.priority,
        f.code as framework_code,
        u.full_name as assigned_to_name,
        u.email as assigned_to_email,
        CASE
          WHEN ci.due_date < CURRENT_DATE THEN 'overdue'
          WHEN ci.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
          ELSE 'upcoming'
        END as urgency
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE ci.organization_id = $1
      AND ci.due_date IS NOT NULL
      AND ci.due_date <= CURRENT_DATE + INTERVAL '1 day' * $2
      AND ci.status NOT IN ('implemented', 'verified', 'not_applicable')
      ORDER BY ci.due_date ASC, fc.priority DESC
    `, [organizationId, days]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get due controls error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch due controls'
    });
  }
});

export default router;
