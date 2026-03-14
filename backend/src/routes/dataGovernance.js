// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// Data Governance — Retention Policies & Legal Holds
// ---------------------------------------------------------------

// GET /api/v1/data-governance/policies
router.get('/policies', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT * FROM data_retention_policies WHERE organization_id=$1 ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Retention policies error:', err);
    res.status(500).json({ success: false, error: 'Failed to load retention policies' });
  }
});

// POST /api/v1/data-governance/policies
router.post('/policies', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      policy_name, data_category, retention_period_days, action_on_expiry,
      applies_to_tables, legal_basis, description,
      // Also accept native column names
      resource_type, retention_days, active
    } = req.body || {};

    const effectiveResourceType = resource_type || data_category || policy_name || 'general';
    const effectiveDays = retention_days || retention_period_days || 365;
    const effectiveDesc = description || (action_on_expiry ? `Action: ${action_on_expiry}` : null);

    const result = await pool.query(
      `INSERT INTO data_retention_policies (
         organization_id, resource_type, retention_days,
         active, description, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        orgId,
        effectiveResourceType,
        effectiveDays,
        active !== false,
        effectiveDesc || null,
        req.user.id
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Retention policy create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create retention policy' });
  }
});

// PUT /api/v1/data-governance/policies/:id
router.put('/policies/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { resource_type, retention_days, active, description } = req.body || {};
    const result = await pool.query(
      `UPDATE data_retention_policies
       SET resource_type = COALESCE($3, resource_type),
           retention_days = COALESCE($4, retention_days),
           active = COALESCE($5, active),
           description = COALESCE($6, description),
           updated_at = NOW()
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [orgId, req.params.id, resource_type || null, retention_days || null,
       active !== undefined ? active : null, description || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Retention policy update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update retention policy' });
  }
});

// DELETE /api/v1/data-governance/policies/:id
router.delete('/policies/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM data_retention_policies WHERE organization_id=$1 AND id=$2 RETURNING id`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    console.error('Retention policy delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete retention policy' });
  }
});

// GET /api/v1/data-governance/legal-holds
router.get('/legal-holds', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT lh.*, u.email AS created_by_email
       FROM legal_holds lh
       LEFT JOIN users u ON u.id = lh.created_by
       WHERE lh.organization_id=$1
       ORDER BY lh.created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Legal holds error:', err);
    res.status(500).json({ success: false, error: 'Failed to load legal holds' });
  }
});

// POST /api/v1/data-governance/legal-holds
router.post('/legal-holds', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { hold_name, reason, scope, applies_to_tables, expires_at,
            resource_type, resource_id } = req.body || {};

    const effectiveResourceType = resource_type || scope || hold_name || 'general';
    const effectiveReason = reason || `Legal hold: ${effectiveResourceType}`;

    const result = await pool.query(
      `INSERT INTO legal_holds (
         organization_id, resource_type, resource_id, reason, expires_at, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [orgId, effectiveResourceType, resource_id || null, effectiveReason,
       expires_at || null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Legal hold create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create legal hold' });
  }
});

// DELETE /api/v1/data-governance/legal-holds/:id
router.delete('/legal-holds/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM legal_holds WHERE organization_id=$1 AND id=$2 RETURNING id`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Legal hold not found' });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    console.error('Legal hold delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete legal hold' });
  }
});

module.exports = router;
