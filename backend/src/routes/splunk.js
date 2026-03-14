// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'integrations-route' }));

// GET /splunk - Get splunk config (from siem_configurations with provider='splunk')
router.get('/splunk', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, organization_id, name, provider, endpoint_url, enabled, created_at, updated_at
       FROM siem_configurations
       WHERE organization_id = $1 AND provider = 'splunk'`,
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
    const result = await pool.query(
      `INSERT INTO siem_configurations (organization_id, name, provider, endpoint_url, api_key, splunk_index, enabled, created_at, updated_at)
       VALUES ($1, 'Splunk', 'splunk', $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT (organization_id, provider) WHERE provider = 'splunk'
       DO UPDATE SET endpoint_url = $2, api_key = $3, splunk_index = $4, updated_at = NOW()
       RETURNING *`,
      [orgId, base_url, api_token, default_index]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    // Fall back to a simpler upsert if the ON CONFLICT fails
    try {
      const orgId = req.user.organization_id;
      const { base_url, api_token, default_index } = req.body;
      // Check if exists
      const existing = await pool.query(
        `SELECT id FROM siem_configurations WHERE organization_id = $1 AND provider = 'splunk'`,
        [orgId]
      );
      let result;
      if (existing.rows.length > 0) {
        result = await pool.query(
          `UPDATE siem_configurations SET endpoint_url = $1, api_key = $2, splunk_index = $3, updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [base_url, api_token, default_index, existing.rows[0].id]
        );
      } else {
        result = await pool.query(
          `INSERT INTO siem_configurations (organization_id, name, provider, endpoint_url, api_key, splunk_index, enabled, created_at, updated_at)
           VALUES ($1, 'Splunk', 'splunk', $2, $3, $4, true, NOW(), NOW()) RETURNING *`,
          [orgId, base_url, api_token, default_index]
        );
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (innerError) {
      res.status(500).json({ success: false, error: innerError.message });
    }
  }
});

// DELETE /splunk - Delete splunk config
router.delete('/splunk', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `DELETE FROM siem_configurations
       WHERE organization_id = $1 AND provider = 'splunk'`,
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
