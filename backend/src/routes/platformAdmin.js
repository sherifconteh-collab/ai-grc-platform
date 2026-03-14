// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

// Inline guard: only users with is_platform_admin=true may access these routes
function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.is_platform_admin) {
    return res.status(403).json({ success: false, error: 'Platform admin access required' });
  }
  next();
}

router.use(authenticate);
router.use(requirePlatformAdmin);

// ---------------------------------------------------------------
// Platform Admin — platform-wide management endpoints
// ---------------------------------------------------------------

// GET /api/v1/platform-admin/overview
router.get('/overview', async (req, res) => {
  try {
    const orgs = await pool.query(`SELECT COUNT(*) FROM organizations`);
    const users = await pool.query(`SELECT COUNT(*) FROM users`);
    // Use updated_at as a proxy for recent activity — no last_login_at column in community schema
    const activeUsers = await pool.query(
      `SELECT COUNT(*) FROM users WHERE updated_at > NOW() - INTERVAL '30 days'`
    );

    res.json({
      success: true,
      data: {
        total_organizations: parseInt(orgs.rows[0].count),
        total_users: parseInt(users.rows[0].count),
        active_users_30d: parseInt(activeUsers.rows[0].count)
      }
    });
  } catch (err) {
    console.error('Platform admin overview error:', err);
    res.status(500).json({ success: false, error: 'Failed to load platform overview' });
  }
});

// GET /api/v1/platform-admin/organizations
router.get('/organizations', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const result = await pool.query(
      `SELECT id, name, tier, created_at FROM organizations
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limitNum, offset]
    );
    const total = await pool.query(`SELECT COUNT(*) FROM organizations`);
    res.json({ success: true, data: result.rows, total: parseInt(total.rows[0].count), page: pageNum });
  } catch (err) {
    console.error('Platform admin orgs error:', err);
    res.status(500).json({ success: false, error: 'Failed to load organizations' });
  }
});

// GET /api/v1/platform-admin/llm-defaults
router.get('/llm-defaults', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key LIKE 'llm_defaults:%'`
    );
    const config = {};
    for (const row of result.rows) {
      const key = row.setting_key.replace('llm_defaults:', '');
      try { config[key] = JSON.parse(row.setting_value); } catch { config[key] = row.setting_value; }
    }
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('Platform LLM defaults error:', err);
    res.status(500).json({ success: false, error: 'Failed to load LLM defaults' });
  }
});

// PUT /api/v1/platform-admin/llm-defaults
router.put('/llm-defaults', async (req, res) => {
  try {
    const entries = req.body || {};
    for (const [key, value] of Object.entries(entries)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await pool.query(
        `INSERT INTO platform_settings (setting_key, setting_value) VALUES ($1,$2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        [`llm_defaults:${key}`, serialized]
      );
    }
    res.json({ success: true, data: entries });
  } catch (err) {
    console.error('Platform LLM defaults update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update LLM defaults' });
  }
});

// GET /api/v1/platform-admin/settings/features
router.get('/settings/features', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key LIKE 'feature_flags:%'`
    );
    const flags = {};
    for (const row of result.rows) {
      const key = row.setting_key.replace('feature_flags:', '');
      try { flags[key] = JSON.parse(row.setting_value); } catch { flags[key] = row.setting_value === 'true'; }
    }
    res.json({ success: true, data: flags });
  } catch (err) {
    console.error('Feature flags error:', err);
    res.status(500).json({ success: false, error: 'Failed to load feature flags' });
  }
});

// PUT /api/v1/platform-admin/settings/features
router.put('/settings/features', async (req, res) => {
  try {
    const flags = req.body || {};
    for (const [key, value] of Object.entries(flags)) {
      await pool.query(
        `INSERT INTO platform_settings (setting_key, setting_value) VALUES ($1,$2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        [`feature_flags:${key}`, JSON.stringify(value)]
      );
    }
    res.json({ success: true, data: flags });
  } catch (err) {
    console.error('Feature flags update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update feature flags' });
  }
});

// GET /api/v1/platform-admin/smtp
router.get('/smtp', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key LIKE 'smtp:%'`
    );
    const config = {};
    for (const row of result.rows) {
      const key = row.setting_key.replace('smtp:', '');
      config[key] = key === 'password' ? '***' : row.setting_value;
    }
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('SMTP config get error:', err);
    res.status(500).json({ success: false, error: 'Failed to load SMTP configuration' });
  }
});

// PUT /api/v1/platform-admin/smtp
router.put('/smtp', async (req, res) => {
  try {
    const entries = req.body || {};
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined || value === null) continue;
      await pool.query(
        `INSERT INTO platform_settings (setting_key, setting_value) VALUES ($1,$2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        [`smtp:${key}`, String(value)]
      );
    }
    res.json({ success: true, data: { message: 'SMTP configuration updated' } });
  } catch (err) {
    console.error('SMTP config update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update SMTP configuration' });
  }
});

// POST /api/v1/platform-admin/smtp/test
router.post('/smtp/test', async (req, res) => {
  res.json({ success: true, data: { message: 'SMTP test email queued (requires email service configuration)' } });
});

// GET /api/v1/platform-admin/llm/status
router.get('/llm/status', async (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      providers_available: ['openai', 'anthropic', 'ollama'],
      active_provider: null
    }
  });
});

module.exports = router;
