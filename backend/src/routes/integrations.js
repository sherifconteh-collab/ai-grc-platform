// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// Integrations — Splunk / external integration config
// ---------------------------------------------------------------

const SPLUNK_DOMAIN = 'splunk_config';

// GET /api/v1/integrations/splunk
router.get('/splunk', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT config_key, config_value FROM dynamic_config_entries WHERE organization_id=$1 AND config_domain=$2`,
      [orgId, SPLUNK_DOMAIN]
    );
    const config = {};
    for (const row of result.rows) {
      config[row.config_key] = row.config_key === 'api_key' ? '***' : row.config_value;
    }
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('Splunk config get error:', err);
    res.status(500).json({ success: false, error: 'Failed to load Splunk configuration' });
  }
});

// PUT /api/v1/integrations/splunk
router.put('/splunk', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const entries = req.body || {};
    for (const [key, value] of Object.entries(entries)) {
      await pool.query(
        `INSERT INTO dynamic_config_entries (organization_id, config_domain, config_key, config_value)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (organization_id, config_domain, config_key) DO UPDATE SET config_value=$4, updated_at=NOW()`,
        [orgId, SPLUNK_DOMAIN, key, String(value)]
      );
    }
    res.json({ success: true, data: { message: 'Splunk configuration updated' } });
  } catch (err) {
    console.error('Splunk config update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update Splunk configuration' });
  }
});

// DELETE /api/v1/integrations/splunk
router.delete('/splunk', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `DELETE FROM dynamic_config_entries WHERE organization_id=$1 AND config_domain=$2`,
      [orgId, SPLUNK_DOMAIN]
    );
    res.json({ success: true, data: { message: 'Splunk configuration removed' } });
  } catch (err) {
    console.error('Splunk config delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete Splunk configuration' });
  }
});

// POST /api/v1/integrations/splunk/test
router.post('/splunk/test', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: { status: 'reachable', message: 'Splunk connection test is a premium feature' } });
});

// GET /api/v1/integrations/splunk/live
router.get('/splunk/live', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: [], message: 'Live Splunk data requires active configuration' });
});

// POST /api/v1/integrations/splunk/import-evidence
router.post('/splunk/import-evidence', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { imported: 0, message: 'Splunk evidence import is a premium feature' } });
});

module.exports = router;
