// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'sso-route' }));

// GET /providers - Available SSO providers
router.get('/providers', (req, res) => {
  try {
    const providers = [
      { id: 'saml', name: 'SAML 2.0', enabled: false },
      { id: 'oidc', name: 'OpenID Connect', enabled: false },
      { id: 'google', name: 'Google Workspace', enabled: false },
      { id: 'microsoft', name: 'Microsoft Entra ID', enabled: false }
    ];
    res.json({ success: true, data: providers });
  } catch (err) {
    console.error('Error fetching SSO providers:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch SSO providers' });
  }
});

// GET /config - Get SSO configuration for organization
router.get('/config', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT id, organization_id, provider_type, config, enabled, created_at, updated_at FROM sso_configurations WHERE organization_id = $1',
      [orgId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    console.error('Error fetching SSO config:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch SSO configuration' });
  }
});

// PUT /config - Upsert SSO configuration
router.put('/config', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { provider_type, config, enabled } = req.body;

    const result = await pool.query(
      `INSERT INTO sso_configurations (organization_id, provider_type, config, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (organization_id)
       DO UPDATE SET provider_type = $2, config = $3, enabled = $4, updated_at = NOW()
       RETURNING *`,
      [orgId, provider_type, JSON.stringify(config), enabled !== false]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating SSO config:', err);
    res.status(500).json({ success: false, error: 'Failed to update SSO configuration' });
  }
});

// GET /social-logins - List social logins for current user
router.get('/social-logins', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT id, user_id, provider, provider_user_id, created_at FROM social_logins WHERE user_id = $1',
      [userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching social logins:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch social logins' });
  }
});

// DELETE /social-logins/:provider - Remove a social login
router.delete('/social-logins/:provider', async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider } = req.params;
    const result = await pool.query(
      'DELETE FROM social_logins WHERE user_id = $1 AND provider = $2 RETURNING *',
      [userId, provider]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Social login not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error deleting social login:', err);
    res.status(500).json({ success: false, error: 'Failed to delete social login' });
  }
});

module.exports = router;
