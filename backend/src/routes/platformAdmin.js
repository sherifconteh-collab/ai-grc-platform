// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePlatformOwner } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(requirePlatformOwner);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'platform-admin-route' }));

// GET /overview - Platform overview stats
router.get('/overview', async (req, res) => {
  try {
    const [orgsResult, usersResult, frameworksResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM organizations'),
      pool.query('SELECT COUNT(*) AS count FROM users'),
      pool.query('SELECT COUNT(*) AS count FROM frameworks')
    ]);

    res.json({
      success: true,
      data: {
        organizations: parseInt(orgsResult.rows[0].count, 10),
        users: parseInt(usersResult.rows[0].count, 10),
        frameworks: parseInt(frameworksResult.rows[0].count, 10)
      }
    });
  } catch (err) {
    console.error('Error fetching platform overview:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch platform overview' });
  }
});

// GET /organizations - List organizations with pagination
router.get('/organizations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const region = req.query.region;

    let query = 'SELECT * FROM organizations';
    const params = [];
    let paramIndex = 1;

    if (region) {
      query += ` WHERE region = $${paramIndex++}`;
      params.push(region);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) AS count FROM organizations';
    const countParams = [];
    if (region) {
      countQuery += ' WHERE region = $1';
      countParams.push(region);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      success: true,
      data: {
        organizations: result.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('Error fetching organizations:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch organizations' });
  }
});

// GET /llm-defaults - Get LLM default settings
router.get('/llm-defaults', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM platform_settings WHERE key = $1",
      ['llm_defaults']
    );
    res.json({ success: true, data: result.rows[0]?.value || {} });
  } catch (err) {
    console.error('Error fetching LLM defaults:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch LLM defaults' });
  }
});

// PUT /llm-defaults - Upsert LLM default settings
router.put('/llm-defaults', async (req, res) => {
  try {
    const { value } = req.body;

    const result = await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      ['llm_defaults', JSON.stringify(value)]
    );

    const responseData = { ...result.rows[0] };
    if (responseData.value && typeof responseData.value === 'object') {
      const masked = { ...responseData.value };
      for (const k of Object.keys(masked)) {
        if (k.toLowerCase().includes('api_key') || k.toLowerCase().includes('apikey') || k.toLowerCase().includes('secret')) {
          masked[k] = typeof masked[k] === 'string' && masked[k].length > 4 ? '****' + masked[k].slice(-4) : '****';
        }
      }
      responseData.value = masked;
    }

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('Error updating LLM defaults:', err);
    res.status(500).json({ success: false, error: 'Failed to update LLM defaults' });
  }
});

// GET /settings/features - Get feature flags
router.get('/settings/features', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM platform_settings WHERE key = $1",
      ['feature_flags']
    );
    res.json({ success: true, data: result.rows[0]?.value || {} });
  } catch (err) {
    console.error('Error fetching feature flags:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch feature flags' });
  }
});

// PUT /settings/features - Upsert feature flags
router.put('/settings/features', async (req, res) => {
  try {
    const { value } = req.body;
    const result = await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      ['feature_flags', JSON.stringify(value)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating feature flags:', err);
    res.status(500).json({ success: false, error: 'Failed to update feature flags' });
  }
});

// GET /organizations/:orgId/features - Get org-specific feature overrides
router.get('/organizations/:orgId/features', async (req, res) => {
  try {
    const { orgId } = req.params;
    const settingsKey = 'org_features_' + orgId;
    const result = await pool.query(
      "SELECT value FROM platform_settings WHERE key = $1",
      [settingsKey]
    );
    res.json({ success: true, data: result.rows[0]?.value || {} });
  } catch (err) {
    console.error('Error fetching org features:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch organization features' });
  }
});

// PUT /organizations/:orgId/features - Upsert org-specific feature overrides
router.put('/organizations/:orgId/features', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { value } = req.body;
    const settingsKey = 'org_features_' + orgId;
    const result = await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      [settingsKey, JSON.stringify(value)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating org features:', err);
    res.status(500).json({ success: false, error: 'Failed to update organization features' });
  }
});

// GET /organizations/:orgId/subscription - Get org subscription info
router.get('/organizations/:orgId/subscription', async (req, res) => {
  try {
    const { orgId } = req.params;
    const result = await pool.query(
      'SELECT id, name, tier, subscription_status, created_at, updated_at FROM organizations WHERE id = $1',
      [orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching org subscription:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch organization subscription' });
  }
});

// PUT /organizations/:orgId/subscription/tier - Update org tier
router.put('/organizations/:orgId/subscription/tier', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { tier } = req.body;

    const result = await pool.query(
      'UPDATE organizations SET tier = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, tier, subscription_status, updated_at',
      [tier, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating org tier:', err);
    res.status(500).json({ success: false, error: 'Failed to update organization tier' });
  }
});

// POST /organizations/:orgId/subscription/cancel - Cancel subscription (stub)
router.post('/organizations/:orgId/subscription/cancel', async (req, res) => {
  try {
    res.json({ success: true, data: { message: 'Subscription cancellation processed', orgId: req.params.orgId } });
  } catch (err) {
    console.error('Error cancelling subscription:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

// POST /organizations/:orgId/subscription/comp - Comp subscription (stub)
router.post('/organizations/:orgId/subscription/comp', async (req, res) => {
  try {
    res.json({ success: true, data: { message: 'Complementary subscription applied', orgId: req.params.orgId } });
  } catch (err) {
    console.error('Error applying comp subscription:', err);
    res.status(500).json({ success: false, error: 'Failed to apply comp subscription' });
  }
});

// POST /organizations/:orgId/subscription/reactivate - Reactivate subscription (stub)
router.post('/organizations/:orgId/subscription/reactivate', async (req, res) => {
  try {
    res.json({ success: true, data: { message: 'Subscription reactivated', orgId: req.params.orgId } });
  } catch (err) {
    console.error('Error reactivating subscription:', err);
    res.status(500).json({ success: false, error: 'Failed to reactivate subscription' });
  }
});

// GET /organizations/:orgId/trial - Get trial info (stub)
router.get('/organizations/:orgId/trial', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        orgId: req.params.orgId,
        trial_active: false,
        trial_start: null,
        trial_end: null,
        days_remaining: 0
      }
    });
  } catch (err) {
    console.error('Error fetching trial info:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch trial info' });
  }
});

// PUT /organizations/:orgId/trial - Update trial info (stub)
router.put('/organizations/:orgId/trial', async (req, res) => {
  try {
    res.json({ success: true, data: { message: 'Trial updated', orgId: req.params.orgId } });
  } catch (err) {
    console.error('Error updating trial:', err);
    res.status(500).json({ success: false, error: 'Failed to update trial' });
  }
});

// GET /smtp - Get SMTP configuration
router.get('/smtp', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM platform_settings WHERE key = $1",
      ['smtp_config']
    );
    res.json({ success: true, data: result.rows[0]?.value || {} });
  } catch (err) {
    console.error('Error fetching SMTP config:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch SMTP configuration' });
  }
});

// PUT /smtp - Upsert SMTP configuration
router.put('/smtp', async (req, res) => {
  try {
    const { value } = req.body;
    const result = await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      ['smtp_config', JSON.stringify(value)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating SMTP config:', err);
    res.status(500).json({ success: false, error: 'Failed to update SMTP configuration' });
  }
});

// POST /smtp/test - Test SMTP configuration (stub)
router.post('/smtp/test', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { sent: false, message: 'SMTP test not yet configured' }
    });
  } catch (err) {
    console.error('Error testing SMTP:', err);
    res.status(500).json({ success: false, error: 'Failed to test SMTP configuration' });
  }
});

// GET /llm/status - LLM provider status (stub)
router.get('/llm/status', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { configured: false, providers: [] }
    });
  } catch (err) {
    console.error('Error fetching LLM status:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch LLM status' });
  }
});

module.exports = router;
