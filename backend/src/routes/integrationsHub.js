// @tier: professional
// Integrations Hub — connectors management
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// GET /api/v1/integrations-hub/templates
router.get('/templates', requirePermission('settings.manage'), async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'splunk', name: 'Splunk', category: 'siem', description: 'Forward audit events to Splunk' },
      { id: 'elastic', name: 'Elastic / OpenSearch', category: 'siem', description: 'Forward audit events to Elastic' },
      { id: 'slack', name: 'Slack', category: 'notifications', description: 'Send compliance alerts to Slack' },
      { id: 'jira', name: 'Jira', category: 'ticketing', description: 'Create Jira issues for POAM items' },
      { id: 'servicenow', name: 'ServiceNow', category: 'ticketing', description: 'Create ServiceNow tickets for findings' }
    ]
  });
});

// GET /api/v1/integrations-hub/connectors
router.get('/connectors', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, connector_type, name, status, last_synced_at, created_at
       FROM integrations_hub_connectors
       WHERE organization_id=$1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Integrations hub connectors error:', err);
    res.status(500).json({ success: false, error: 'Failed to load connectors' });
  }
});

// POST /api/v1/integrations-hub/connectors
router.post('/connectors', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { connector_type, name, config } = req.body || {};
    if (!connector_type || !name) {
      return res.status(400).json({ success: false, error: 'connector_type and name are required' });
    }
    const result = await pool.query(
      `INSERT INTO integrations_hub_connectors (organization_id, connector_type, name, config, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, connector_type, name, status, created_at`,
      [orgId, connector_type, name, config ? JSON.stringify(config) : null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Integrations hub connector create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create connector' });
  }
});

// DELETE /api/v1/integrations-hub/connectors/:id
router.delete('/connectors/:id', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM integrations_hub_connectors WHERE organization_id=$1 AND id=$2 RETURNING id`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Connector not found' });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    console.error('Integrations hub connector delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete connector' });
  }
});

module.exports = router;
