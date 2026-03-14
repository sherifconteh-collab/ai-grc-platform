// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'integrations-route' }));

// Ensure unique constraint exists for (organization_id, integration_type)
(async () => {
  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_configs_org_type
       ON integration_configs(organization_id, integration_type)`
    );
  } catch (_err) {
    // Table may not exist yet; constraint will be created by migration
  }
})();

// GET /splunk - Get splunk config
router.get('/splunk', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, organization_id, integration_type, config, enabled, created_at, updated_at
       FROM integration_configs
       WHERE organization_id = $1 AND integration_type = 'splunk'`,
      [orgId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /splunk - Upsert splunk config
router.put('/splunk', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { base_url, api_token, default_index } = req.body;
    const config = { base_url, api_token, default_index };
    const result = await pool.query(
      `INSERT INTO integration_configs (organization_id, integration_type, config, enabled, created_at, updated_at)
       VALUES ($1, 'splunk', $2, true, NOW(), NOW())
       ON CONFLICT (organization_id, integration_type) DO UPDATE SET
         config = $2, updated_at = NOW()
       RETURNING *`,
      [orgId, JSON.stringify(config)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /splunk - Delete splunk config
router.delete('/splunk', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `DELETE FROM integration_configs
       WHERE organization_id = $1 AND integration_type = 'splunk'`,
      [orgId]
    );
    res.json({ success: true, data: { message: 'Splunk configuration deleted' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /splunk/test - Stub
router.post('/splunk/test', async (_req, res) => {
  try {
    res.json({ success: true, data: { connected: false, message: 'Splunk connectivity test not yet configured' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /splunk/import-evidence - Stub
router.post('/splunk/import-evidence', async (_req, res) => {
  try {
    res.json({ success: true, data: { imported: 0, message: 'Splunk evidence import not yet configured' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
