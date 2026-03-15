// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

let llmService;
try {
  llmService = require('../services/llmService');
} catch (_e) {
  llmService = null;
}

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'settings-route' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

// --- LLM Configuration ---

function maskKey(key) {
  if (!key) return null;
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

// GET /llm - Get LLM config for org (keys masked)
router.get('/llm', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, organization_id, anthropic_api_key_enc, openai_api_key_enc,
              gemini_api_key_enc, xai_api_key_enc, groq_api_key_enc,
              ollama_base_url, default_provider, default_model,
              created_at, updated_at
       FROM llm_configurations WHERE organization_id = $1`,
      [orgId]
    );
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }
    const config = result.rows[0];
    // Mask encrypted keys; leave ollama_base_url as-is
    config.anthropic_api_key_enc = maskKey(config.anthropic_api_key_enc);
    config.openai_api_key_enc = maskKey(config.openai_api_key_enc);
    config.gemini_api_key_enc = maskKey(config.gemini_api_key_enc);
    config.xai_api_key_enc = maskKey(config.xai_api_key_enc);
    config.groq_api_key_enc = maskKey(config.groq_api_key_enc);
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /llm - Upsert LLM config
router.put('/llm', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      anthropic_api_key, openai_api_key, gemini_api_key, xai_api_key,
      groq_api_key, ollama_base_url, default_provider, default_model,
    } = req.body;

    // Encrypt keys if llmService is available, otherwise store as-is
    const enc = llmService && llmService.encryptKey ? llmService.encryptKey : (k) => k;
    const encAnth = anthropic_api_key ? enc(anthropic_api_key) : null;
    const encOai = openai_api_key ? enc(openai_api_key) : null;
    const encGem = gemini_api_key ? enc(gemini_api_key) : null;
    const encXai = xai_api_key ? enc(xai_api_key) : null;
    const encGroq = groq_api_key ? enc(groq_api_key) : null;

    const result = await pool.query(
      `INSERT INTO llm_configurations
        (organization_id, anthropic_api_key_enc, openai_api_key_enc, gemini_api_key_enc,
         xai_api_key_enc, groq_api_key_enc, ollama_base_url,
         default_provider, default_model, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
         anthropic_api_key_enc = COALESCE($2, llm_configurations.anthropic_api_key_enc),
         openai_api_key_enc = COALESCE($3, llm_configurations.openai_api_key_enc),
         gemini_api_key_enc = COALESCE($4, llm_configurations.gemini_api_key_enc),
         xai_api_key_enc = COALESCE($5, llm_configurations.xai_api_key_enc),
         groq_api_key_enc = COALESCE($6, llm_configurations.groq_api_key_enc),
         ollama_base_url = COALESCE($7, llm_configurations.ollama_base_url),
         default_provider = COALESCE($8, llm_configurations.default_provider),
         default_model = COALESCE($9, llm_configurations.default_model),
         updated_at = NOW()
       RETURNING *`,
      [orgId, encAnth, encOai, encGem, encXai, encGroq, ollama_base_url || null, default_provider, default_model]
    );
    const config = result.rows[0];
    config.anthropic_api_key_enc = maskKey(config.anthropic_api_key_enc);
    config.openai_api_key_enc = maskKey(config.openai_api_key_enc);
    config.gemini_api_key_enc = maskKey(config.gemini_api_key_enc);
    config.xai_api_key_enc = maskKey(config.xai_api_key_enc);
    config.groq_api_key_enc = maskKey(config.groq_api_key_enc);
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /llm/test - Validate a provider key by making a real API call
router.post('/llm/test', async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) {
      return res.status(400).json({ success: false, error: 'provider and apiKey are required' });
    }
    if (!llmService || !llmService.callProvider) {
      return res.json({ success: true, data: { status: 'ok', message: 'Key accepted (validation unavailable)' } });
    }
    const start = Date.now();
    await llmService.callProvider(provider, apiKey, null, 'Reply OK', [{ role: 'user', content: 'ping' }]);
    const latency_ms = Date.now() - start;
    res.json({ success: true, data: { status: 'ok', latency_ms } });
  } catch (error) {
    res.json({ success: false, data: { status: 'error', error: error.message } });
  }
});

// DELETE /llm/:provider - Set specific provider key to null
router.delete('/llm/:provider', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const provider = req.params.provider;
    const validProviders = ['anthropic', 'openai', 'gemini', 'xai', 'groq', 'ollama'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }
    if (provider === 'ollama') {
      await pool.query(
        'UPDATE llm_configurations SET ollama_base_url = NULL, updated_at = NOW() WHERE organization_id = $1',
        [orgId]
      );
    } else {
      const colMap = {
        anthropic: 'anthropic_api_key_enc',
        openai: 'openai_api_key_enc',
        gemini: 'gemini_api_key_enc',
        xai: 'xai_api_key_enc',
        groq: 'groq_api_key_enc',
      };
      const col = colMap[provider];
      if (!col) return res.status(400).json({ success: false, error: 'Invalid provider' });
      await pool.query(
        `UPDATE llm_configurations SET ${col} = NULL, updated_at = NOW() WHERE organization_id = $1`,
        [orgId]
      );
    }
    res.json({ success: true, data: { provider, message: 'API key removed' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Content Packs ---

// GET /content-packs - List imported content packs
router.get('/content-packs', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, name, description, version, status, created_at, updated_at
       FROM content_packs WHERE organization_id = $1 AND status = 'imported'
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /content-packs/template - Return template JSON structure
router.get('/content-packs/template', async (_req, res) => {
  try {
    res.json({
      success: true,
      data: {
        framework: { code: '', name: '', version: '' },
        controls: []
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /content-packs/drafts - List draft/review content packs
router.get('/content-packs/drafts', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, name, description, version, status, review_required,
              attestation_statement, attested_at, reviewed_by, review_notes,
              created_at, updated_at
       FROM content_packs WHERE organization_id = $1 AND status IN ('draft', 'review')
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /content-packs/drafts/:id - Get single draft
router.get('/content-packs/drafts/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT * FROM content_packs WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /content-packs/drafts/upload - Upload content pack file
router.post('/content-packs/drafts/upload', upload.single('file'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const packData = JSON.parse(req.file.buffer.toString('utf-8'));
    const name = packData.framework?.name || req.file.originalname || 'Untitled Pack';
    const description = packData.framework?.description || '';
    const version = packData.framework?.version || '1.0';
    const result = await pool.query(
      `INSERT INTO content_packs (organization_id, name, description, version, pack_data, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', NOW(), NOW())
       RETURNING *`,
      [orgId, name, description, version, JSON.stringify(packData)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({ success: false, error: 'Invalid JSON file' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /content-packs/drafts/:id - Update draft
router.put('/content-packs/drafts/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { pack_data, review_required } = req.body;
    const result = await pool.query(
      `UPDATE content_packs SET pack_data = COALESCE($1, pack_data),
              review_required = COALESCE($2, review_required), updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING *`,
      [pack_data ? JSON.stringify(pack_data) : null, review_required, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /content-packs/drafts/:id/attest - Set attestation
router.post('/content-packs/drafts/:id/attest', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { attestation_statement } = req.body;
    const result = await pool.query(
      `UPDATE content_packs SET attestation_statement = $1, attested_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [attestation_statement, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /content-packs/drafts/:id/review - Approve or reject
router.post('/content-packs/drafts/:id/review', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { action, review_notes } = req.body;
    const statusMap = { approve: 'approved', reject: 'draft' };
    const newStatus = statusMap[action];
    if (!newStatus) {
      return res.status(400).json({ success: false, error: 'Invalid action. Use "approve" or "reject"' });
    }
    const result = await pool.query(
      `UPDATE content_packs SET status = $1, review_notes = $2, reviewed_by = $3, updated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING *`,
      [newStatus, review_notes, req.user.id, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /content-packs/drafts/:id/import - Set status to imported
router.post('/content-packs/drafts/:id/import', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `UPDATE content_packs SET status = 'imported', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /content-packs/import - Import directly
router.post('/content-packs/import', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, description, version, pack_data } = req.body;
    const result = await pool.query(
      `INSERT INTO content_packs (organization_id, name, description, version, pack_data, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'imported', NOW(), NOW())
       RETURNING *`,
      [orgId, name, description, version, JSON.stringify(pack_data)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /content-packs/:id - Delete content pack
router.delete('/content-packs/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM content_packs WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content pack not found' });
    }
    res.json({ success: true, data: { id: result.rows[0].id, message: 'Content pack deleted' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Account ---

// POST /account/cancel - Stub
router.post('/account/cancel', async (_req, res) => {
  try {
    res.json({ success: true, data: { message: 'Account cancellation request received' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /account/export - Stub: export org data
router.get('/account/export', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const users = await pool.query('SELECT id, email, role, created_at FROM users WHERE organization_id = $1', [orgId]);
    const frameworks = await pool.query('SELECT id, name, version, created_at FROM frameworks WHERE organization_id = $1', [orgId]);
    res.json({
      success: true,
      data: {
        organization_id: orgId,
        exported_at: new Date().toISOString(),
        users: users.rows,
        frameworks: frameworks.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
