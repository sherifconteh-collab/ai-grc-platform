// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'siem-route' }));

// GET / - List SIEM configurations for organization
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT id, organization_id, name, provider, enabled, endpoint_url, event_filter, created_at, updated_at FROM siem_configurations WHERE organization_id = $1',
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching SIEM configurations:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch SIEM configurations' });
  }
});

// POST / - Create SIEM configuration
router.post('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, provider, endpoint_url, api_key, enabled, event_filter } = req.body;

    const result = await pool.query(
      `INSERT INTO siem_configurations (organization_id, name, provider, endpoint_url, api_key, enabled, event_filter, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, organization_id, name, provider, enabled, endpoint_url, event_filter, created_at, updated_at`,
      [orgId, name, provider, endpoint_url, api_key, enabled !== false, event_filter || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error creating SIEM configuration:', err);
    res.status(500).json({ success: false, error: 'Failed to create SIEM configuration' });
  }
});

// PUT /:id - Update SIEM configuration
router.put('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { name, provider, endpoint_url, api_key, enabled, event_filter } = req.body;

    const existing = await pool.query(
      'SELECT id FROM siem_configurations WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SIEM configuration not found' });
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(name); }
    if (provider !== undefined) { fields.push(`provider = $${paramIndex++}`); values.push(provider); }
    if (endpoint_url !== undefined) { fields.push(`endpoint_url = $${paramIndex++}`); values.push(endpoint_url); }
    if (api_key !== undefined) { fields.push(`api_key = $${paramIndex++}`); values.push(api_key); }
    if (enabled !== undefined) { fields.push(`enabled = $${paramIndex++}`); values.push(enabled); }
    if (event_filter !== undefined) { fields.push(`event_filter = $${paramIndex++}`); values.push(event_filter); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, orgId);

    const result = await pool.query(
      `UPDATE siem_configurations SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
       RETURNING id, organization_id, name, provider, enabled, endpoint_url, event_filter, created_at, updated_at`,
      values
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating SIEM configuration:', err);
    res.status(500).json({ success: false, error: 'Failed to update SIEM configuration' });
  }
});

// DELETE /:id - Delete SIEM configuration
router.delete('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM siem_configurations WHERE id = $1 AND organization_id = $2 RETURNING *',
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SIEM configuration not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error deleting SIEM configuration:', err);
    res.status(500).json({ success: false, error: 'Failed to delete SIEM configuration' });
  }
});

// POST /:id/test - Test SIEM connectivity (stub)
router.post('/:id/test', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id FROM siem_configurations WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SIEM configuration not found' });
    }

    res.json({
      success: true,
      data: { connected: false, message: 'SIEM connectivity test not yet configured' }
    });
  } catch (err) {
    console.error('Error testing SIEM connection:', err);
    res.status(500).json({ success: false, error: 'Failed to test SIEM connection' });
  }
});

module.exports = router;
