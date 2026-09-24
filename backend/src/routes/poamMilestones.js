// @tier: community
/**
 * POA&M milestones (issue #569).
 *
 * A federal POA&M is a list of discrete milestones, each with its own target
 * date and completion state — not a single overall due date. These routes are a
 * sub-resource of a POA&M item.
 *
 * Registered in server.js on the same `/api/v1/poam` base path as routes/poam.js
 * rather than added to that file, which is already past the 800-line guideline.
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const rateLimit = require('express-rate-limit');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { log, serializeError } = require('../utils/logger');

// express-rate-limit applied router-wide, ahead of authenticate, so a cheap
// IP-based bound is in place before any JWT verification or database lookup
// runs. CodeQL does not model this repo's own createRateLimiter, so the
// per-route limits below are invisible to js/missing-rate-limiting; this layer
// is what it can trace. Set above those limits so they stay the binding
// constraint in normal use.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }));

router.use(authenticate);

const ALLOWED_MILESTONE_STATUS = ['pending', 'in_progress', 'completed', 'delayed', 'cancelled'];

/**
 * Confirms the parent item belongs to the caller's organization before any
 * milestone read or write. Without this, a milestone route could be used to
 * probe for POA&M ids in other tenants.
 */
async function ensureOrgPoamItem(orgId, poamItemId) {
  const result = await pool.query(
    'SELECT id FROM poam_items WHERE id = $1 AND organization_id = $2',
    [poamItemId, orgId]
  );
  return result.rows.length > 0;
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined; // signals invalid
  return parsed.toISOString().split('T')[0];
}

// GET /poam/:id/milestones
router.get('/:id/milestones',
  createRateLimiter({ label: 'poam-milestones-list', windowMs: 60 * 1000, max: 120 }),
  requirePermission('controls.read'), async (req, res) => {
  try {
    if (!(await ensureOrgPoamItem(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const result = await pool.query(
      `SELECT m.id, m.description, m.target_date, m.status, m.completed_date,
              m.sort_order, m.created_at, m.updated_at,
              u.first_name || ' ' || u.last_name AS created_by_name
       FROM poam_milestones m
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.organization_id = $1 AND m.poam_item_id = $2
       ORDER BY m.sort_order, m.target_date NULLS LAST, m.created_at`,
      [req.user.organization_id, req.params.id]
    );

    // Slippage is the whole reason milestones exist, so surface it rather than
    // making every caller derive it.
    const today = new Date().toISOString().split('T')[0];
    const overdue = result.rows.filter(
      (m) => m.target_date && m.status !== 'completed' && m.status !== 'cancelled'
        && m.target_date.toISOString?.().split('T')[0] < today
    ).length;

    res.json({
      success: true,
      data: {
        milestones: result.rows,
        total: result.rows.length,
        completed: result.rows.filter((m) => m.status === 'completed').length,
        overdue
      }
    });
  } catch (error) {
    log('error', 'poam.milestones_list_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to load POA&M milestones' });
  }
});

// POST /poam/:id/milestones
router.post('/:id/milestones',
  createRateLimiter({ label: 'poam-milestone-create', windowMs: 60 * 1000, max: 60 }),
  requirePermission('controls.write'), async (req, res) => {
  try {
    if (!(await ensureOrgPoamItem(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const { description, target_date, status, sort_order } = req.body || {};
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'description is required' });
    }
    const nextStatus = status === undefined ? 'pending' : String(status);
    if (!ALLOWED_MILESTONE_STATUS.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_MILESTONE_STATUS.join(', ')}`
      });
    }
    const targetDate = normalizeDate(target_date);
    if (targetDate === undefined) {
      return res.status(400).json({ success: false, error: 'target_date must be a valid date' });
    }

    const result = await pool.query(
      `INSERT INTO poam_milestones
         (poam_item_id, organization_id, description, target_date, status, completed_date, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id, req.user.organization_id, description.trim(), targetDate, nextStatus,
        nextStatus === 'completed' ? new Date().toISOString().split('T')[0] : null,
        Number.isInteger(sort_order) ? sort_order : 0,
        req.user.id
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'poam.milestone_create_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to create POA&M milestone' });
  }
});

// PATCH /poam/:id/milestones/:milestoneId
router.patch('/:id/milestones/:milestoneId',
  createRateLimiter({ label: 'poam-milestone-update', windowMs: 60 * 1000, max: 60 }),
  requirePermission('controls.write'), async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT m.* FROM poam_milestones m
       WHERE m.id = $1 AND m.poam_item_id = $2 AND m.organization_id = $3`,
      [req.params.milestoneId, req.params.id, req.user.organization_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milestone not found' });
    }

    const current = existing.rows[0];
    const patch = req.body || {};

    const nextStatus = patch.status !== undefined ? String(patch.status) : current.status;
    if (!ALLOWED_MILESTONE_STATUS.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_MILESTONE_STATUS.join(', ')}`
      });
    }

    let targetDate = current.target_date;
    if (patch.target_date !== undefined) {
      targetDate = normalizeDate(patch.target_date);
      if (targetDate === undefined) {
        return res.status(400).json({ success: false, error: 'target_date must be a valid date' });
      }
    }

    // Completion stamps itself when the status first reaches completed, and
    // clears if the milestone is reopened, so completed_date cannot contradict
    // status.
    let completedDate = current.completed_date;
    if (nextStatus === 'completed' && current.status !== 'completed') {
      completedDate = new Date().toISOString().split('T')[0];
    } else if (nextStatus !== 'completed') {
      completedDate = null;
    }

    const result = await pool.query(
      `UPDATE poam_milestones
       SET description = COALESCE($1, description),
           target_date = $2,
           status = $3,
           completed_date = $4,
           sort_order = COALESCE($5, sort_order),
           updated_at = NOW()
       WHERE id = $6 AND poam_item_id = $7 AND organization_id = $8
       RETURNING *`,
      [
        typeof patch.description === 'string' && patch.description.trim() ? patch.description.trim() : null,
        targetDate, nextStatus, completedDate,
        Number.isInteger(patch.sort_order) ? patch.sort_order : null,
        req.params.milestoneId, req.params.id, req.user.organization_id
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'poam.milestone_update_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to update POA&M milestone' });
  }
});

// DELETE /poam/:id/milestones/:milestoneId
router.delete('/:id/milestones/:milestoneId',
  createRateLimiter({ label: 'poam-milestone-delete', windowMs: 60 * 1000, max: 30 }),
  requirePermission('controls.write'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM poam_milestones
       WHERE id = $1 AND poam_item_id = $2 AND organization_id = $3
       RETURNING id`,
      [req.params.milestoneId, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Milestone not found' });
    }
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    log('error', 'poam.milestone_delete_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to delete POA&M milestone' });
  }
});

module.exports = router;
