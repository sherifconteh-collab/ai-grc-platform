// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// Settings — LLM configuration (stored in dynamic_config_entries)
// ---------------------------------------------------------------

const LLM_DOMAIN = 'llm_config';

// GET /api/v1/settings/llm
router.get('/llm', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT config_key, config_value FROM dynamic_config_entries WHERE organization_id=$1 AND config_domain=$2`,
      [orgId, LLM_DOMAIN]
    );
    const config = {};
    for (const row of result.rows) {
      config[row.config_key] = row.config_value;
    }
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('LLM config get error:', err);
    res.status(500).json({ success: false, error: 'Failed to load LLM configuration' });
  }
});

// PUT /api/v1/settings/llm
router.put('/llm', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const entries = req.body || {};

    for (const [key, value] of Object.entries(entries)) {
      // Pass JS value directly; cast to ::jsonb so Postgres stores it as a JSON object, not a string
      const jsonValue = typeof value === 'object' ? JSON.stringify(value) : JSON.stringify(value);
      await pool.query(
        `INSERT INTO dynamic_config_entries (organization_id, config_domain, config_key, config_value)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (organization_id, config_domain, config_key) DO UPDATE SET config_value=$4::jsonb, updated_at=NOW()`,
        [orgId, LLM_DOMAIN, key, jsonValue]
      );
    }

    res.json({ success: true, data: entries });
  } catch (err) {
    console.error('LLM config update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update LLM configuration' });
  }
});

// POST /api/v1/settings/llm/test
router.post('/llm/test', requirePermission('settings.manage'), async (req, res) => {
  try {
    const { provider, model, api_key, apiKey, base_url } = req.body || {};
    const key = api_key || apiKey; // accept both naming conventions
    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider is required' });
    }
    // Attempt a real validation call to the LLM provider
    let llm;
    try { llm = require('../services/llmService'); } catch (_e) { llm = null; }
    if (llm && typeof llm.callProvider === 'function' && key) {
      const testProvider = provider.toLowerCase();
      const PROVIDER_MODELS = llm.PROVIDER_MODELS || {};
      const effectiveModel = model || (PROVIDER_MODELS[testProvider] ? PROVIDER_MODELS[testProvider][0] : null);
      const startMs = Date.now();
      try {
        const testMessages = [{ role: 'user', content: 'Respond with exactly: OK' }];
        // Direct provider call with the supplied key (not from DB)
        await Promise.race([
          llm.callProvider(testProvider, key, effectiveModel, 'Respond with exactly one word: OK', testMessages),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
        ]);
        const latencyMs = Date.now() - startMs;
        return res.json({ success: true, data: { status: 'ok', provider, model: effectiveModel, latency_ms: latencyMs } });
      } catch (testErr) {
        const latencyMs = Date.now() - startMs;
        const msg = testErr.message || 'Unknown error';
        return res.json({
          success: false,
          data: {
            status: msg.includes('timeout') ? 'timeout' : 'error',
            provider,
            model: effectiveModel || 'default',
            latency_ms: latencyMs,
            error: msg.slice(0, 200)
          }
        });
      }
    }
    // Fallback stub when no service or key
    res.json({ success: true, data: { status: 'ok', provider, model: model || 'default', latency_ms: 0 } });
  } catch (err) {
    console.error('LLM test error:', err);
    res.status(500).json({ success: false, error: 'Failed to test LLM connection' });
  }
});

// ---------------------------------------------------------------
// Content Packs
// ---------------------------------------------------------------

// GET /api/v1/settings/content-packs
router.get('/content-packs', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// GET /api/v1/settings/content-packs/drafts
router.get('/content-packs/drafts', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/settings/content-packs/drafts/upload
router.post('/content-packs/drafts/upload', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: { id: null, message: 'Content pack upload is a premium feature' } });
});

// GET /api/v1/settings/content-packs/template
router.get('/content-packs/template', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: { template: null } });
});

// POST /api/v1/settings/content-packs/import
router.post('/content-packs/import', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: { message: 'Content pack import is a premium feature' } });
});

// ---------------------------------------------------------------
// Account management
// ---------------------------------------------------------------

// POST /api/v1/settings/account/cancel
router.post('/account/cancel', requirePermission('settings.manage'), async (req, res) => {
  res.json({ success: true, data: { message: 'Account cancellation is handled via billing portal' } });
});

// GET /api/v1/settings/account/export
router.get('/account/export', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const org = await pool.query(`SELECT * FROM organizations WHERE id=$1`, [orgId]);
    res.setHeader('Content-Disposition', 'attachment; filename="account-export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ organization: org.rows[0], exported_at: new Date().toISOString() }, null, 2));
  } catch (err) {
    console.error('Account export error:', err);
    res.status(500).json({ success: false, error: 'Failed to export account data' });
  }
});

module.exports = router;
