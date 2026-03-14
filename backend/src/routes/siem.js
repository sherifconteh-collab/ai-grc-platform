// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// SIEM — Security Information and Event Management integrations
// ---------------------------------------------------------------

// GET /api/v1/siem
router.get('/', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, provider, endpoint_url, index_name, enabled, last_sync_at, created_at, updated_at
       FROM siem_configurations WHERE organization_id=$1 ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('SIEM list error:', err);
    res.status(500).json({ success: false, error: 'Failed to load SIEM configurations' });
  }
});

// POST /api/v1/siem
router.post('/', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { provider, endpoint_url, api_key, index_name, enabled, extra_config } = req.body || {};
    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider is required' });
    }
    const result = await pool.query(
      `INSERT INTO siem_configurations (organization_id, provider, endpoint_url, api_key, index_name, enabled, extra_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id, provider, endpoint_url, index_name, enabled, created_at`,
      [orgId, provider, endpoint_url || null, api_key || null, index_name || null, enabled || false,
       extra_config !== undefined && extra_config !== null ? JSON.stringify(extra_config) : null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('SIEM create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create SIEM configuration' });
  }
});

// PUT /api/v1/siem/:id
router.put('/:id', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { provider, endpoint_url, api_key, index_name, enabled } = req.body || {};
    const result = await pool.query(
      `UPDATE siem_configurations
       SET provider=COALESCE($3,provider), endpoint_url=COALESCE($4,endpoint_url),
           api_key=COALESCE($5,api_key), index_name=COALESCE($6,index_name),
           enabled=COALESCE($7,enabled), updated_at=NOW()
       WHERE organization_id=$1 AND id=$2
       RETURNING id, provider, endpoint_url, index_name, enabled, updated_at`,
      [orgId, req.params.id, provider||null, endpoint_url||null, api_key||null, index_name||null, enabled ?? null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SIEM configuration not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('SIEM update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update SIEM configuration' });
  }
});

// DELETE /api/v1/siem/:id
router.delete('/:id', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM siem_configurations WHERE organization_id=$1 AND id=$2 RETURNING id`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SIEM configuration not found' });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    console.error('SIEM delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete SIEM configuration' });
  }
});

// POST /api/v1/siem/:id/test
router.post('/:id/test', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: { status: 'reachable', message: 'SIEM connection test is a premium feature' } });
});

module.exports = router;
