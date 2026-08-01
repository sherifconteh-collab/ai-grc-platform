// @tier: community
/**
 * Business objectives. ISO 31000 defines risk as the effect of uncertainty on
 * objectives, so these are what the risk register is a register *about*.
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
const { nextReference } = require('../utils/referenceGenerator');
const { severityBand } = require('../services/riskRegisterService');

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'objectives', windowMs: 15 * 60 * 1000, max: 200 }));

const VALID_CATEGORIES = ['strategic', 'operational', 'reporting', 'compliance'];
const VALID_STATUSES = ['draft', 'active', 'achieved', 'missed', 'cancelled'];
const MAX_LIMIT = 200;

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
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

// GET /api/v1/objectives
router.get('/', requirePermission('objectives.read'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const { category, status, departmentId } = req.query;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (departmentId && !isUuid(departmentId)) {
      return res.status(400).json({ error: 'departmentId must be a valid id' });
    }

    // The linked-risk roll-up is the reason to look at this page: an objective
    // with three critical risks against it is the one that needs attention.
    const { rows } = await pool.query(
      `SELECT o.*,
              d.name AS department_name,
              u.first_name AS owner_first_name,
              u.last_name  AS owner_last_name,
              COALESCE(risk_rollup.risk_count, 0)   AS linked_risk_count,
              risk_rollup.max_residual_score
       FROM business_objectives o
       LEFT JOIN departments d ON d.id = o.department_id
       LEFT JOIN users u ON u.id = o.owner_user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS risk_count,
                MAX(r.residual_score) AS max_residual_score
         FROM risk_objective_links rol
         JOIN risks r ON r.id = rol.risk_id AND r.status <> 'closed'
         WHERE rol.objective_id = o.id AND rol.organization_id = o.organization_id
       ) risk_rollup ON true
       WHERE o.organization_id = $1
         AND ($2::text IS NULL OR o.category = $2)
         AND ($3::text IS NULL OR o.status = $3)
         AND ($4::uuid IS NULL OR o.department_id = $4)
       ORDER BY o.created_at DESC
       LIMIT $5 OFFSET $6`,
      [req.user.organization_id, category || null, status || null, departmentId || null, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM business_objectives
       WHERE organization_id = $1
         AND ($2::text IS NULL OR category = $2)
         AND ($3::text IS NULL OR status = $3)
         AND ($4::uuid IS NULL OR department_id = $4)`,
      [req.user.organization_id, category || null, status || null, departmentId || null]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        max_risk_severity: severityBand(row.max_residual_score)
      })),
      pagination: { page, limit, total: countRows[0].total }
    });
  } catch (error) {
    log('error', 'objectives.list_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/objectives/:id — objective plus the risks threatening it
router.get('/:id', requirePermission('objectives.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid objective id' });
    }
    const { rows } = await pool.query(
      `SELECT o.*, d.name AS department_name
       FROM business_objectives o
       LEFT JOIN departments d ON d.id = o.department_id
       WHERE o.id = $1 AND o.organization_id = $2`,
      [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    const { rows: risks } = await pool.query(
      `SELECT r.id, r.reference, r.title, r.status, r.category,
              r.inherent_score, r.residual_score
       FROM risk_objective_links rol
       JOIN risks r ON r.id = rol.risk_id
       WHERE rol.objective_id = $1 AND rol.organization_id = $2
       ORDER BY r.residual_score DESC NULLS LAST`,
      [req.params.id, req.user.organization_id]
    );

    res.json({
      success: true,
      data: {
        ...rows[0],
        risks: risks.map((risk) => ({
          ...risk,
          residual_severity: severityBand(risk.residual_score)
        }))
      }
    });
  } catch (error) {
    log('error', 'objectives.get_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/objectives
router.post('/', requirePermission('objectives.write'), async (req, res) => {
  try {
    const { reference, title, description, category, ownerUserId, departmentId, status, targetDate } = req.body || {};

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (ownerUserId && !isUuid(ownerUserId)) {
      return res.status(400).json({ error: 'ownerUserId must be a valid id' });
    }
    if (departmentId && !isUuid(departmentId)) {
      return res.status(400).json({ error: 'departmentId must be a valid id' });
    }
    if (!(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }
    if (!(await departmentInOrg(req.user.organization_id, departmentId))) {
      return res.status(400).json({ error: 'Department not found' });
    }

    const resolvedReference = isNonEmptyString(reference)
      ? sanitizeText(reference).trim()
      : await nextReference(pool, 'objective', req.user.organization_id);

    const { rows } = await pool.query(
      `INSERT INTO business_objectives
         (organization_id, reference, title, description, category,
          owner_user_id, department_id, status, target_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10)
       RETURNING *`,
      [
        req.user.organization_id,
        resolvedReference,
        sanitizeText(title).trim(),
        description ? sanitizeText(description) : null,
        category || 'strategic',
        ownerUserId || null,
        departmentId || null,
        status || 'active',
        targetDate || null,
        req.user.id
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'objective.created',
      resourceType: 'business_objective',
      resourceId: rows[0].id,
      details: { reference: rows[0].reference, category: rows[0].category },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An objective with that reference already exists' });
    }
    log('error', 'objectives.create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/objectives/:id
router.put('/:id', requirePermission('objectives.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid objective id' });
    }
    const { title, description, category, ownerUserId, departmentId, status, targetDate } = req.body || {};

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (ownerUserId && !(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }
    if (departmentId && !(await departmentInOrg(req.user.organization_id, departmentId))) {
      return res.status(400).json({ error: 'Department not found' });
    }

    const { rows } = await pool.query(
      `UPDATE business_objectives SET
         title         = COALESCE($3, title),
         description   = COALESCE($4, description),
         category      = COALESCE($5, category),
         owner_user_id = CASE WHEN $6::boolean THEN $7::uuid ELSE owner_user_id END,
         department_id = CASE WHEN $8::boolean THEN $9::uuid ELSE department_id END,
         status        = COALESCE($10, status),
         target_date   = COALESCE($11::date, target_date),
         updated_at    = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        title ? sanitizeText(title).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        category || null,
        ownerUserId !== undefined,
        ownerUserId || null,
        departmentId !== undefined,
        departmentId || null,
        status || null,
        targetDate || null
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'objective.updated',
      resourceType: 'business_objective',
      resourceId: rows[0].id,
      details: { status: rows[0].status },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'objectives.update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/objectives/:id
router.delete('/:id', requirePermission('objectives.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid objective id' });
    }
    const { rowCount } = await pool.query(
      'DELETE FROM business_objectives WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'objective.deleted',
      resourceType: 'business_objective',
      resourceId: req.params.id,
      success: true
    }).catch(() => {});

    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    log('error', 'objectives.delete_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
