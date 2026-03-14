// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'data-governance-route' }));

// ── List all policies ───────────────────────────────────────────────────────
router.get('/policies', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM data_governance_policies WHERE organization_id = $1 ORDER BY created_at DESC',
      [org_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Data governance list policies error:', error);
    res.status(500).json({ success: false, error: 'Failed to list policies' });
  }
});

// ── Create policy ───────────────────────────────────────────────────────────
router.post('/policies', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { policy_name, data_category, retention_period_days, auto_delete_enabled, legal_basis } = req.body;

    if (!policy_name || !data_category) {
      return res.status(400).json({ success: false, error: 'policy_name and data_category are required' });
    }

    const result = await pool.query(
      `INSERT INTO data_governance_policies
         (organization_id, policy_name, data_category, retention_period_days, auto_delete_enabled, legal_basis)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [org_id, policy_name, data_category, retention_period_days || null, auto_delete_enabled ?? false, legal_basis || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Data governance create policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
});

// ── Update policy ───────────────────────────────────────────────────────────
router.patch('/policies/:id', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { id } = req.params;
    const { policy_name, data_category, retention_period_days, auto_delete_enabled, legal_basis } = req.body;

    const fields = [];
    const params = [];
    let idx = 1;

    if (policy_name !== undefined) { fields.push(`policy_name = $${idx++}`); params.push(policy_name); }
    if (data_category !== undefined) { fields.push(`data_category = $${idx++}`); params.push(data_category); }
    if (retention_period_days !== undefined) { fields.push(`retention_period_days = $${idx++}`); params.push(retention_period_days); }
    if (auto_delete_enabled !== undefined) { fields.push(`auto_delete_enabled = $${idx++}`); params.push(auto_delete_enabled); }
    if (legal_basis !== undefined) { fields.push(`legal_basis = $${idx++}`); params.push(legal_basis); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    params.push(id, org_id);

    const result = await pool.query(
      `UPDATE data_governance_policies SET ${fields.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Data governance update policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to update policy' });
  }
});

// ── List legal holds ────────────────────────────────────────────────────────
router.get('/legal-holds', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM legal_holds WHERE organization_id = $1 ORDER BY created_at DESC',
      [org_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Data governance list legal holds error:', error);
    res.status(500).json({ success: false, error: 'Failed to list legal holds' });
  }
});

// ── Create legal hold ───────────────────────────────────────────────────────
router.post('/legal-holds', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { hold_name, hold_reason, data_scope, custodian_name, start_date } = req.body;

    if (!hold_name || !hold_reason) {
      return res.status(400).json({ success: false, error: 'hold_name and hold_reason are required' });
    }

    const result = await pool.query(
      `INSERT INTO legal_holds
         (organization_id, hold_name, hold_reason, data_scope, custodian_name, start_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [org_id, hold_name, hold_reason, data_scope || null, custodian_name || null, start_date || new Date().toISOString()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Data governance create legal hold error:', error);
    res.status(500).json({ success: false, error: 'Failed to create legal hold' });
  }
});

// ── Release legal hold ──────────────────────────────────────────────────────
router.post('/legal-holds/:id/release', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE legal_holds SET status = 'released', release_date = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Legal hold not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Data governance release legal hold error:', error);
    res.status(500).json({ success: false, error: 'Failed to release legal hold' });
  }
});

// ── Sign evidence (stub) ───────────────────────────────────────────────────
router.post('/evidence/:evidenceId/sign', async (req, res) => {
  try {
    const { evidenceId } = req.params;
    res.json({
      success: true,
      data: {
        signed: true,
        evidence_id: evidenceId,
        signed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Data governance sign evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to sign evidence' });
  }
});

// ── Immutable export (stub) ─────────────────────────────────────────────────
router.get('/evidence/:evidenceId/immutable-export', async (req, res) => {
  try {
    const { evidenceId } = req.params;
    res.json({
      success: true,
      data: {
        evidence_id: evidenceId,
        message: 'Immutable export not yet configured',
      },
    });
  } catch (error) {
    console.error('Data governance immutable export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export evidence' });
  }
});

module.exports = router;
