// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'integrations-hub-route' }));

const CONNECTOR_TEMPLATES = [
  { id: 'splunk', name: 'Splunk', category: 'SIEM', description: 'Import events from Splunk' },
  { id: 'sentinel', name: 'Microsoft Sentinel', category: 'SIEM' },
  { id: 'jira', name: 'Jira', category: 'Ticketing' },
  { id: 'servicenow', name: 'ServiceNow', category: 'ITSM' },
  { id: 'aws_cloudtrail', name: 'AWS CloudTrail', category: 'Cloud' },
  { id: 'github', name: 'GitHub', category: 'DevOps' }
];

router.get('/templates', async (req, res) => {
  try {
    return res.json({ success: true, data: CONNECTOR_TEMPLATES });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

router.get('/connectors', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM integrations_hub_connectors WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing connectors:', error);
    return res.status(500).json({ success: false, error: 'Failed to list connectors' });
  }
});

router.post('/connectors', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { template_id, name, config } = req.body;
    const result = await pool.query(
      `INSERT INTO integrations_hub_connectors (organization_id, template_id, name, config)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [org, template_id, name, config || {}]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating connector:', error);
    return res.status(500).json({ success: false, error: 'Failed to create connector' });
  }
});

router.patch('/connectors/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { name, config, enabled } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (config !== undefined) { fields.push(`config = $${idx++}`); values.push(config); }
    if (enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(enabled); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, org);

    const result = await pool.query(
      `UPDATE integrations_hub_connectors SET ${fields.join(', ')}
       WHERE id = $${idx++} AND organization_id = $${idx}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Connector not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating connector:', error);
    return res.status(500).json({ success: false, error: 'Failed to update connector' });
  }
});

router.delete('/connectors/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM integrations_hub_connectors WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Connector not found' });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting connector:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete connector' });
  }
});

router.post('/connectors/:id/run', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE integrations_hub_connectors SET last_run_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Connector not found' });
    }
    return res.json({ success: true, data: { run_id: null, message: 'Connector execution not yet configured' } });
  } catch (error) {
    console.error('Error running connector:', error);
    return res.status(500).json({ success: false, error: 'Failed to run connector' });
  }
});

router.get('/connectors/:id/runs', async (req, res) => {
  try {
    return res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching runs:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch runs' });
  }
});

module.exports = router;
