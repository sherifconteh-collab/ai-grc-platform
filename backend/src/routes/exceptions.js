// @tier: free
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { enqueueWebhookEvent } = require('../services/webhookService');

router.use(authenticate);

const VALID_STATUS = ['pending', 'active', 'expired', 'revoked'];

async function emitExceptionEvent(organizationId, eventType, payload) {
  await enqueueWebhookEvent({
    organizationId,
    eventType,
    payload
  }).catch(() => {});
}

// GET /api/v1/exceptions
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const status = req.query.status ? String(req.query.status) : null;

    const params = [orgId];
    let query = `
      SELECT
        ce.*,
        fc.control_id AS control_code,
        fc.title AS control_title,
        f.code AS framework_code,
        owner.email AS owner_email,
        approver.email AS approved_by_email
      FROM control_exceptions ce
      JOIN framework_controls fc ON fc.id = ce.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users owner ON owner.id = ce.owner_id
      LEFT JOIN users approver ON approver.id = ce.approved_by
      WHERE ce.organization_id = $1
    `;
    if (status && VALID_STATUS.includes(status)) {
      query += ' AND ce.status = $2';
      params.push(status);
    }
    query += ' ORDER BY ce.updated_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Exception list error:', error);
    res.status(500).json({ success: false, error: 'Failed to load control exceptions' });
  }
});

// POST /api/v1/exceptions
router.post('/', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { control_id, title, reason, compensating_controls, business_impact, owner_id, expires_at } = req.body || {};
    if (!control_id || !title || !reason) {
      return res.status(400).json({ success: false, error: 'control_id, title, and reason are required' });
    }

    const parsedExpiresAt = expires_at ? new Date(expires_at) : null;
    if (expires_at && Number.isNaN(parsedExpiresAt?.getTime())) {
      return res.status(400).json({ success: false, error: 'expires_at must be a valid date' });
    }

    const insert = await pool.query(
      `INSERT INTO control_exceptions (
         organization_id, control_id, title, reason, compensating_controls, business_impact,
         owner_id, status, expires_at, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
       RETURNING *`,
      [
        orgId,
        control_id,
        title,
        reason,
        compensating_controls || null,
        business_impact || null,
        owner_id || null,
        parsedExpiresAt ? parsedExpiresAt.toISOString().slice(0, 10) : null,
        req.user.id
      ]
    );

    const row = insert.rows[0];
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'control_exception_created', 'control_exception', $3, $4::jsonb, true)`,
      [orgId, req.user.id, row.id, JSON.stringify({ control_id, title })]
    );

    await emitExceptionEvent(orgId, 'exception.created', { id: row.id, control_id, status: row.status });

    res.status(201).json({ success: true, data: row });
  } catch (error) {
    console.error('Exception create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create control exception' });
  }
});

// PATCH /api/v1/exceptions/:id
router.patch('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const {
      title,
      reason,
      compensating_controls,
      business_impact,
      owner_id,
      status,
      expires_at
    } = req.body || {};

    if (status && !VALID_STATUS.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUS.join(', ')}` });
    }

    const parsedExpiresAt = expires_at ? new Date(expires_at) : null;
    if (expires_at && Number.isNaN(parsedExpiresAt?.getTime())) {
      return res.status(400).json({ success: false, error: 'expires_at must be a valid date' });
    }

    const existing = await pool.query(
      `SELECT id, status
       FROM control_exceptions
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control exception not found' });
    }

    const update = await pool.query(
      `UPDATE control_exceptions
       SET title = COALESCE($3, title),
           reason = COALESCE($4, reason),
           compensating_controls = COALESCE($5, compensating_controls),
           business_impact = COALESCE($6, business_impact),
           owner_id = COALESCE($7, owner_id),
           status = COALESCE($8, status),
           expires_at = COALESCE($9, expires_at),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        title || null,
        reason || null,
        compensating_controls || null,
        business_impact || null,
        owner_id || null,
        status || null,
        parsedExpiresAt ? parsedExpiresAt.toISOString().slice(0, 10) : null
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'control_exception_updated', 'control_exception', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ old_status: existing.rows[0].status, new_status: update.rows[0].status })]
    );

    await emitExceptionEvent(orgId, 'exception.updated', {
      id,
      old_status: existing.rows[0].status,
      new_status: update.rows[0].status
    });

    res.json({ success: true, data: update.rows[0] });
  } catch (error) {
    console.error('Exception update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update control exception' });
  }
});

// POST /api/v1/exceptions/:id/approve
router.post('/:id/approve', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const update = await pool.query(
      `UPDATE control_exceptions
       SET status = 'active',
           approved_by = $3,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, id, req.user.id]
    );
    if (update.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control exception not found' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'control_exception_approved', 'control_exception', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ status: 'active' })]
    );

    await emitExceptionEvent(orgId, 'exception.approved', { id, status: 'active' });

    res.json({ success: true, data: update.rows[0] });
  } catch (error) {
    console.error('Exception approve error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve control exception' });
  }
});

// POST /api/v1/exceptions/:id/revoke
router.post('/:id/revoke', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const note = req.body?.note || null;

    const update = await pool.query(
      `UPDATE control_exceptions
       SET status = 'revoked',
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, id]
    );
    if (update.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control exception not found' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'control_exception_revoked', 'control_exception', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ status: 'revoked', note })]
    );

    await emitExceptionEvent(orgId, 'exception.revoked', { id, status: 'revoked', note });

    res.json({ success: true, data: update.rows[0] });
  } catch (error) {
    console.error('Exception revoke error:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke control exception' });
  }
});

module.exports = router;
