// @tier: community
/**
 * Departments: the organizational structure that risks, incidents,
 * obligations, objectives and indicators are owned by.
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { isUuid, isNonEmptyString, sanitizeText } = require('../middleware/validate');
const { log, serializeError } = require('../utils/logger');
const auditService = require('../services/auditService');

// express-rate-limit applied router-wide ahead of authenticate: a cheap
// IP-based bound before authenticate's JWT/DB work, and a rate limiter CodeQL
// recognizes covering every route below. The org-scoped limiter beneath is the
// real production control.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'departments', windowMs: 15 * 60 * 1000, max: 200 }));

const MAX_LIMIT = 200;

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * A department may not be its own ancestor. Without this an admin can create a
 * cycle (A parent of B, then B parent of A) and every recursive query over the
 * hierarchy — the org chart, the roll-up counts — hangs or errors.
 */
async function wouldCreateCycle(organizationId, departmentId, proposedParentId) {
  if (!proposedParentId) return false;
  if (proposedParentId === departmentId) return true;
  const { rows } = await pool.query(
    `WITH RECURSIVE ancestry AS (
       SELECT id, parent_id FROM departments
       WHERE id = $1 AND organization_id = $3
       UNION ALL
       SELECT d.id, d.parent_id FROM departments d
       JOIN ancestry a ON d.id = a.parent_id
       WHERE d.organization_id = $3
     )
     SELECT 1 FROM ancestry WHERE id = $2 LIMIT 1`,
    [proposedParentId, departmentId, organizationId]
  );
  return rows.length > 0;
}

async function orgUserExists(organizationId, userId) {
  if (!userId) return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND organization_id = $2',
    [userId, organizationId]
  );
  return rows.length > 0;
}

async function departmentInOrg(organizationId, departmentId) {
  if (!departmentId) return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM departments WHERE id = $1 AND organization_id = $2',
    [departmentId, organizationId]
  );
  return rows.length > 0;
}

// GET /api/v1/departments
router.get('/', requirePermission('departments.read'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const includeInactive = req.query.includeInactive === 'true';

    const { rows } = await pool.query(
      `SELECT d.*,
              parent.name AS parent_name,
              head.first_name AS head_first_name,
              head.last_name  AS head_last_name,
              (SELECT COUNT(*) FROM departments child
                WHERE child.parent_id = d.id)::int AS child_count,
              (SELECT COUNT(*) FROM risks r
                WHERE r.department_id = d.id AND r.status <> 'closed')::int AS open_risk_count,
              (SELECT COUNT(*) FROM incidents i
                WHERE i.department_id = d.id AND i.status NOT IN ('closed', 'false_positive'))::int
                AS open_incident_count
       FROM departments d
       LEFT JOIN departments parent ON parent.id = d.parent_id
       LEFT JOIN users head ON head.id = d.head_user_id
       WHERE d.organization_id = $1
         AND ($2::boolean OR d.is_active = true)
       ORDER BY d.name
       LIMIT $3 OFFSET $4`,
      [req.user.organization_id, includeInactive, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM departments
       WHERE organization_id = $1 AND ($2::boolean OR is_active = true)`,
      [req.user.organization_id, includeInactive]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total: countRows[0].total }
    });
  } catch (error) {
    log('error', 'departments.list_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/departments/:id
router.get('/:id', requirePermission('departments.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid department id' });
    }
    const { rows } = await pool.query(
      `SELECT d.*, parent.name AS parent_name
       FROM departments d
       LEFT JOIN departments parent ON parent.id = d.parent_id
       WHERE d.id = $1 AND d.organization_id = $2`,
      [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'departments.get_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/departments
router.post('/', requirePermission('departments.write'), async (req, res) => {
  try {
    const { name, code, description, parentId, headUserId, costCenter } = req.body || {};
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (parentId && !isUuid(parentId)) {
      return res.status(400).json({ error: 'parentId must be a valid id' });
    }
    if (headUserId && !isUuid(headUserId)) {
      return res.status(400).json({ error: 'headUserId must be a valid id' });
    }
    if (!(await departmentInOrg(req.user.organization_id, parentId))) {
      return res.status(400).json({ error: 'Parent department not found' });
    }
    if (!(await orgUserExists(req.user.organization_id, headUserId))) {
      return res.status(400).json({ error: 'Department head must be a member of your organization' });
    }

    const { rows } = await pool.query(
      `INSERT INTO departments
         (organization_id, name, code, description, parent_id, head_user_id, cost_center, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.organization_id,
        sanitizeText(name).trim(),
        code ? sanitizeText(code).trim() : null,
        description ? sanitizeText(description) : null,
        parentId || null,
        headUserId || null,
        costCenter ? sanitizeText(costCenter).trim() : null,
        req.user.id
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'department.created',
      resourceType: 'department',
      resourceId: rows[0].id,
      details: { name: rows[0].name, parentId: parentId || null },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    log('error', 'departments.create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/departments/:id
router.put('/:id', requirePermission('departments.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid department id' });
    }
    const { name, code, description, parentId, headUserId, costCenter, isActive } = req.body || {};

    if (parentId !== undefined && parentId !== null) {
      if (!isUuid(parentId)) {
        return res.status(400).json({ error: 'parentId must be a valid id' });
      }
      if (!(await departmentInOrg(req.user.organization_id, parentId))) {
        return res.status(400).json({ error: 'Parent department not found' });
      }
      if (await wouldCreateCycle(req.user.organization_id, req.params.id, parentId)) {
        return res.status(400).json({ error: 'That parent would create a cycle in the department hierarchy' });
      }
    }
    if (headUserId && !(await orgUserExists(req.user.organization_id, headUserId))) {
      return res.status(400).json({ error: 'Department head must be a member of your organization' });
    }

    const { rows } = await pool.query(
      `UPDATE departments SET
         name         = COALESCE($3, name),
         code         = COALESCE($4, code),
         description  = COALESCE($5, description),
         parent_id    = CASE WHEN $6::boolean THEN $7::uuid ELSE parent_id END,
         head_user_id = CASE WHEN $8::boolean THEN $9::uuid ELSE head_user_id END,
         cost_center  = COALESCE($10, cost_center),
         is_active    = COALESCE($11::boolean, is_active),
         updated_at   = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        name ? sanitizeText(name).trim() : null,
        code !== undefined && code !== null ? sanitizeText(code).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        parentId !== undefined,
        parentId || null,
        headUserId !== undefined,
        headUserId || null,
        costCenter !== undefined && costCenter !== null ? sanitizeText(costCenter).trim() : null,
        isActive === undefined ? null : Boolean(isActive)
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'department.updated',
      resourceType: 'department',
      resourceId: rows[0].id,
      details: { name: rows[0].name, isActive: rows[0].is_active },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    log('error', 'departments.update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/departments/:id
//
// Deactivates rather than deletes when the department still owns records: the
// risks and incidents assigned to it would lose their owning business unit,
// and a historic incident with no department is a hole in the audit trail.
router.delete('/:id', requirePermission('departments.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid department id' });
    }

    // Confirm the department is this organization's before counting anything.
    // Without this the usage counts below would answer questions about another
    // tenant's department to anyone who guessed its id, even though the write
    // that follows is org-scoped and would change nothing.
    if (!(await departmentInOrg(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const { rows: usage } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM risks WHERE department_id = $1)::int AS risks,
         (SELECT COUNT(*) FROM incidents WHERE department_id = $1)::int AS incidents,
         (SELECT COUNT(*) FROM compliance_obligations WHERE department_id = $1)::int AS obligations,
         (SELECT COUNT(*) FROM business_objectives WHERE department_id = $1)::int AS objectives,
         (SELECT COUNT(*) FROM departments WHERE parent_id = $1)::int AS children`,
      [req.params.id]
    );
    const inUse = Object.values(usage[0]).some((count) => count > 0);

    if (inUse) {
      const { rows } = await pool.query(
        `UPDATE departments SET is_active = false, updated_at = now()
         WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [req.params.id, req.user.organization_id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Department not found' });
      }
      auditService.logFromRequest(req, {
        eventType: 'department.deactivated',
        resourceType: 'department',
        resourceId: req.params.id,
        details: { reason: 'in_use', usage: usage[0] },
        success: true
      }).catch(() => {});
      return res.json({
        success: true,
        data: rows[0],
        message: 'Department deactivated because records are still assigned to it'
      });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM departments WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'department.deleted',
      resourceType: 'department',
      resourceId: req.params.id,
      success: true
    }).catch(() => {});

    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    log('error', 'departments.delete_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
