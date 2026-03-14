// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// SSO — Single Sign-On configuration
// ---------------------------------------------------------------

// GET /api/v1/sso/providers
router.get('/providers', async (req, res) => {
  res.json({ success: true, data: ['saml', 'oidc', 'google', 'microsoft', 'github'] });
});

// GET /api/v1/sso/config
router.get('/config', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, provider, is_enabled, client_id, metadata_url, login_url, attribute_mapping, created_at, updated_at
       FROM sso_configurations WHERE organization_id=$1 LIMIT 1`,
      [orgId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    console.error('SSO config get error:', err);
    res.status(500).json({ success: false, error: 'Failed to load SSO configuration' });
  }
});

// PUT /api/v1/sso/config
router.put('/config', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { provider, is_enabled, client_id, client_secret, metadata_url, login_url, logout_url, attribute_mapping } = req.body || {};
    const result = await pool.query(
      `INSERT INTO sso_configurations (organization_id, provider, is_enabled, client_id, client_secret, metadata_url, login_url, logout_url, attribute_mapping)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (organization_id) DO UPDATE
         SET provider=$2, is_enabled=$3, client_id=$4, client_secret=$5,
             metadata_url=$6, login_url=$7, logout_url=$8, attribute_mapping=$9::jsonb, updated_at=NOW()
       RETURNING id, provider, is_enabled, client_id, metadata_url, login_url, attribute_mapping, updated_at`,
      [orgId, provider || 'saml', is_enabled || false, client_id || null, client_secret || null,
       metadata_url || null, login_url || null, logout_url || null,
       attribute_mapping !== undefined && attribute_mapping !== null
         ? JSON.stringify(attribute_mapping)
         : null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('SSO config update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update SSO configuration' });
  }
});

// GET /api/v1/sso/social-logins
router.get('/social-logins', requirePermission('users.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT usl.id, usl.provider, usl.email, usl.display_name, usl.created_at,
              u.email AS user_email
       FROM user_social_logins usl
       JOIN users u ON u.id = usl.user_id
       WHERE u.organization_id=$1
       ORDER BY usl.created_at DESC`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Social logins error:', err);
    res.status(500).json({ success: false, error: 'Failed to load social logins' });
  }
});

module.exports = router;
