// @tier: community
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const pool = require('../config/database');
const llm = require('../services/llmService');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireSod } = require('../middleware/sod');
const { validateBody } = require('../middleware/validate');
const { normalizeTier, shouldEnforceAiLimitForByok } = require('../config/tierPolicy');
const { encrypt, decrypt } = require('../utils/encrypt');
const { isStripeConfigured, cancelSubscriptionNow } = require('../services/stripeService');
const { createRateLimiter } = require('../middleware/rateLimit');
const emailService = require('../services/emailService');

router.use(authenticate);

const orgSettingsRateLimiter = createRateLimiter({ label: 'org-settings', windowMs: 60 * 1000, max: 30 });

const ALLOWED_PROVIDERS = new Set(['claude', 'openai', 'gemini', 'grok', 'groq', 'ollama']);
const CONTENT_PACK_ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.log',
  '.pdf', '.docx', '.doc'
]);
const CONTENT_PACK_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const CONTENT_PACK_EXTRACT_MAX_CHARS = 180000;
const CONTENT_PACK_AI_INPUT_MAX_CHARS = 60000;

const contentPackDraftUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONTENT_PACK_UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!CONTENT_PACK_ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Unsupported content pack report file type'));
    }
    return cb(null, true);
  }
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function safeJsonParse(raw, fallback = null) {
  if (!nonEmptyString(raw)) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

function truncateText(text, maxChars) {
  const normalized = String(text || '');
  if (normalized.length <= maxChars) {
    return { value: normalized, truncated: false };
  }
  return { value: normalized.slice(0, maxChars), truncated: true };
}

function extractFirstJsonObject(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

// ---------- GET /api/v1/settings/llm ----------
// Get current LLM configuration for the org (keys are masked)
router.get('/llm', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(
      `SELECT setting_key, setting_value, is_encrypted, updated_at
       FROM organization_settings
       WHERE organization_id = $1 AND setting_key IN ('anthropic_api_key', 'openai_api_key', 'gemini_api_key', 'xai_api_key', 'groq_api_key', 'ollama_base_url', 'default_provider', 'default_model', 'apply_all_framework_guardrails')`,
      [orgId]
    );

    const settings = {};
    for (const row of result.rows) {
      if ((row.setting_key.includes('api_key') || row.setting_key === 'ollama_base_url') && row.setting_value) {
        // Decrypt before masking so the last-4 reflect the real key, not the ciphertext
        const plainValue = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
        settings[row.setting_key] = {
          configured: true,
          masked: row.setting_key === 'ollama_base_url' ? plainValue : '****' + plainValue.slice(-4),
          updated_at: row.updated_at
        };
      } else {
        settings[row.setting_key] = {
          value: row.setting_value,
          updated_at: row.updated_at
        };
      }
    }

    res.json({
      success: true,
      data: {
        settings,
        hasAnthropicKey: !!settings.anthropic_api_key?.configured,
        hasOpenAIKey:    !!settings.openai_api_key?.configured,
        hasGeminiKey:    !!settings.gemini_api_key?.configured,
        hasGrokKey:      !!settings.xai_api_key?.configured,
        hasGroqKey:      !!settings.groq_api_key?.configured,
        hasOllamaUrl:    !!settings.ollama_base_url?.configured,
        defaultProvider: settings.default_provider?.value || 'claude',
        defaultModel:    settings.default_model?.value || null,
        applyAllFrameworkGuardrails: settings.apply_all_framework_guardrails?.value === 'true'
      }
    });
  } catch (err) {
    console.error('Get LLM settings error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch LLM settings' });
  }
});

// ---------- PUT /api/v1/settings/llm ----------
// Save/update LLM API keys and preferences
router.put('/llm', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (body.default_provider && !ALLOWED_PROVIDERS.has(body.default_provider)) {
    errors.push('default_provider must be one of: claude, openai, gemini, grok, groq, ollama');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { anthropic_api_key, openai_api_key, gemini_api_key, xai_api_key, groq_api_key, ollama_base_url, default_provider, default_model, apply_all_framework_guardrails } = req.body;

    const upsert = async (key, value, shouldEncrypt = false) => {
      if (value === undefined) return;
      if (value === null || value === '') {
        await pool.query(
          'DELETE FROM organization_settings WHERE organization_id = $1 AND setting_key = $2',
          [orgId, key]
        );
        return;
      }
      const storedValue = shouldEncrypt ? encrypt(value) : value;
      await pool.query(`
        INSERT INTO organization_settings (organization_id, setting_key, setting_value, is_encrypted, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (organization_id, setting_key)
        DO UPDATE SET setting_value = $3, is_encrypted = $4, updated_at = NOW()
      `, [orgId, key, storedValue, shouldEncrypt]);
    };

    // Track which API key providers were updated for audit logging
    const updatedProviders = [];
    if (anthropic_api_key !== undefined && anthropic_api_key !== null && anthropic_api_key !== '') updatedProviders.push('claude');
    if (openai_api_key !== undefined && openai_api_key !== null && openai_api_key !== '') updatedProviders.push('openai');
    if (gemini_api_key !== undefined && gemini_api_key !== null && gemini_api_key !== '') updatedProviders.push('gemini');
    if (xai_api_key !== undefined && xai_api_key !== null && xai_api_key !== '') updatedProviders.push('grok');
    if (groq_api_key !== undefined && groq_api_key !== null && groq_api_key !== '') updatedProviders.push('groq');
    if (ollama_base_url !== undefined && ollama_base_url !== null && ollama_base_url !== '') updatedProviders.push('ollama');

    await upsert('anthropic_api_key', anthropic_api_key, true);
    await upsert('openai_api_key', openai_api_key, true);
    await upsert('gemini_api_key', gemini_api_key, true);
    await upsert('xai_api_key', xai_api_key, true);
    await upsert('groq_api_key', groq_api_key, true);
    await upsert('ollama_base_url', ollama_base_url, false);
    await upsert('default_provider', default_provider);
    await upsert('default_model', default_model);
    // Store the boolean flag as a string 'true'/'false'
    if (apply_all_framework_guardrails !== undefined) {
      await upsert('apply_all_framework_guardrails', apply_all_framework_guardrails ? 'true' : 'false');
    }

    // Audit log each provider key that was set/updated
    if (updatedProviders.length > 0) {
      await pool.query(`
        INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, success, created_at)
        VALUES ($1, $2, 'api_key_updated', 'org_settings', $1, $3, $4, true, NOW())
      `, [orgId, req.user.id, JSON.stringify({ providers: updatedProviders, action: 'set' }), req.ip || null]).catch(() => {});
    }

    // Invalidate cached API keys so the new provider/key is used immediately.
    // This ensures seamless handoff when switching providers — the next AI call
    // will resolve the new key and inject the full org context (master prompt)
    // so the new LLM has immediate awareness of the organization's environment.
    llm.invalidateApiKeyCache(orgId);

    res.json({
      success: true,
      message: 'LLM settings updated successfully'
    });
  } catch (err) {
    console.error('Update LLM settings error:', err);
    res.status(500).json({ success: false, error: 'Failed to update LLM settings' });
  }
});

// ---------- POST /api/v1/settings/llm/test ----------
// Test an API key by making a minimal LLM call
router.post('/llm/test', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (!body.provider) errors.push('provider is required');
  if (!body.apiKey) errors.push('apiKey is required');
  return errors;
}), async (req, res) => {
  try {
    const { provider, apiKey } = req.body;

    if (provider === 'claude') {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic.default({ apiKey });
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "API key verified" in exactly those words.' }]
      });
      return res.json({ success: true, message: 'Anthropic API key is valid', response: resp.content[0].text });
    }

    if (provider === 'openai') {
      const OpenAI = require('openai');
      const client = new OpenAI.default({ apiKey });
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "API key verified" in exactly those words.' }]
      });
      return res.json({ success: true, message: 'OpenAI API key is valid', response: resp.choices[0].message.content });
    }

    if (provider === 'gemini') {
      const payload = {
        contents: [{ role: 'user', parts: [{ text: 'Say API key verified in exactly those words.' }] }],
        generationConfig: { maxOutputTokens: 50 }
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `Gemini key test failed (${response.status})`);
      }

      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n') || '';
      return res.json({ success: true, message: 'Gemini API key is valid', response: text });
    }

    if (provider === 'grok') {
      const OpenAI = require('openai');
      const client = new OpenAI.default({ apiKey, baseURL: process.env.XAI_API_BASE || 'https://api.x.ai/v1' });
      const resp = await client.chat.completions.create({
        model: 'grok-3-latest',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "API key verified" in exactly those words.' }]
      });
      return res.json({ success: true, message: 'xAI Grok API key is valid', response: resp.choices[0].message.content });
    }

    if (provider === 'groq') {
      const OpenAI = require('openai');
      const client = new OpenAI.default({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
      const resp = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "API key verified" in exactly those words.' }]
      });
      return res.json({ success: true, message: 'Groq API key is valid', response: resp.choices[0].message.content });
    }

    if (provider === 'ollama') {
      // For Ollama, apiKey field contains the base URL
      const baseURL = apiKey || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
      const OpenAI = require('openai');
      const client = new OpenAI.default({ apiKey: 'ollama', baseURL });
      const resp = await client.chat.completions.create({
        model: 'llama3.2',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "connected" in one word.' }]
      });
      return res.json({ success: true, message: 'Ollama connection verified', response: resp.choices[0].message.content });
    }

    res.status(400).json({ success: false, error: 'Unsupported provider' });
  } catch (err) {
    console.error('LLM test error:', err);
    res.status(400).json({
      success: false,
      error: 'API key validation failed',
      details: err.message
    });
  }
});

// ---------- DELETE /api/v1/settings/llm/:provider ----------
// Remove an API key
router.delete('/llm/:provider', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const keyMap = { claude: 'anthropic_api_key', openai: 'openai_api_key', gemini: 'gemini_api_key', grok: 'xai_api_key', groq: 'groq_api_key', ollama: 'ollama_base_url' };
    const settingKey = keyMap[req.params.provider];

    if (!settingKey) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }

    await pool.query(
      'DELETE FROM organization_settings WHERE organization_id = $1 AND setting_key = $2',
      [orgId, settingKey]
    );

    // Audit log key removal
    await pool.query(`
      INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, success, created_at)
      VALUES ($1, $2, 'api_key_removed', 'org_settings', $1, $3, $4, true, NOW())
    `, [orgId, req.user.id, JSON.stringify({ provider: req.params.provider, action: 'remove' }), req.ip || null]).catch(() => {});

    res.json({ success: true, message: `${req.params.provider} API key removed` });
  } catch (err) {
    console.error('Delete LLM key error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove API key' });
  }
});

function normalizePack(pack, fallbacks = {}) {
  const raw = safeObject(pack);
  const controls = Array.isArray(raw.controls) ? raw.controls : [];
  const procedures = Array.isArray(raw.procedures) ? raw.procedures : [];

  return {
    pack_name: nonEmptyString(raw.pack_name) ? raw.pack_name.trim() : (fallbacks.pack_name || ''),
    pack_version: nonEmptyString(raw.pack_version) ? raw.pack_version.trim() : (fallbacks.pack_version || null),
    framework_code: nonEmptyString(raw.framework_code) ? raw.framework_code.trim().toLowerCase() : (fallbacks.framework_code || ''),
    source_vendor: nonEmptyString(raw.source_vendor) ? raw.source_vendor.trim() : (fallbacks.source_vendor || null),
    license_reference: nonEmptyString(raw.license_reference) ? raw.license_reference.trim() : (fallbacks.license_reference || null),
    metadata: safeObject(raw.metadata),
    controls: controls
      .map((item) => ({
        control_id: nonEmptyString(item?.control_id) ? item.control_id.trim() : '',
        title: nonEmptyString(item?.title) ? item.title.trim() : null,
        description: nonEmptyString(item?.description) ? item.description.trim() : null,
        metadata: safeObject(item?.metadata)
      }))
      .filter((item) => nonEmptyString(item.control_id) && (nonEmptyString(item.title) || nonEmptyString(item.description))),
    procedures: procedures
      .map((item) => ({
        control_id: nonEmptyString(item?.control_id) ? item.control_id.trim() : '',
        procedure_id: nonEmptyString(item?.procedure_id) ? item.procedure_id.trim() : '',
        title: nonEmptyString(item?.title) ? item.title.trim() : null,
        description: nonEmptyString(item?.description) ? item.description.trim() : null,
        expected_evidence: nonEmptyString(item?.expected_evidence) ? item.expected_evidence.trim() : null,
        assessor_notes: nonEmptyString(item?.assessor_notes) ? item.assessor_notes.trim() : null,
        metadata: safeObject(item?.metadata)
      }))
      .filter((item) =>
        nonEmptyString(item.control_id) &&
        nonEmptyString(item.procedure_id) &&
        (nonEmptyString(item.title) ||
          nonEmptyString(item.description) ||
          nonEmptyString(item.expected_evidence) ||
          nonEmptyString(item.assessor_notes))
      )
  };
}

function validatePackPayload(pack) {
  const errors = [];

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    errors.push('pack object is required');
    return errors;
  }

  if (!nonEmptyString(pack.pack_name)) errors.push('pack.pack_name is required');
  if (!nonEmptyString(pack.framework_code)) errors.push('pack.framework_code is required');
  if (!nonEmptyString(pack.license_reference)) errors.push('pack.license_reference is required');

  const controls = Array.isArray(pack.controls) ? pack.controls : [];
  const procedures = Array.isArray(pack.procedures) ? pack.procedures : [];
  if (controls.length === 0 && procedures.length === 0) {
    errors.push('pack must include at least one control or procedure entry');
  }

  controls.forEach((item, idx) => {
    if (!nonEmptyString(item?.control_id)) {
      errors.push(`pack.controls[${idx}].control_id is required`);
    }
    const hasOverride = nonEmptyString(item?.title) || nonEmptyString(item?.description);
    if (!hasOverride) {
      errors.push(`pack.controls[${idx}] must include title or description`);
    }
  });

  procedures.forEach((item, idx) => {
    if (!nonEmptyString(item?.control_id)) {
      errors.push(`pack.procedures[${idx}].control_id is required`);
    }
    if (!nonEmptyString(item?.procedure_id)) {
      errors.push(`pack.procedures[${idx}].procedure_id is required`);
    }
    const hasOverride = nonEmptyString(item?.title) ||
      nonEmptyString(item?.description) ||
      nonEmptyString(item?.expected_evidence) ||
      nonEmptyString(item?.assessor_notes);
    if (!hasOverride) {
      errors.push(`pack.procedures[${idx}] must include at least one override field`);
    }
  });

  return errors;
}

async function getDefaultProviderForOrg(organizationId) {
  return llm.getOrgDefaultProvider(organizationId);
}

async function enforceDraftAiLimit({ organizationId, organizationTier, provider }) {
  const tier = normalizeTier(organizationTier);
  const limit = llm.getUsageLimit(tier);
  const enforceByokLimits = shouldEnforceAiLimitForByok(tier);

  if (!enforceByokLimits) {
    const resolvedKey = await llm.resolveApiKey(provider, organizationId);
    if (resolvedKey.source === 'organization') {
      return { bypassed: true, tier, limit: 'unlimited', remaining: 'unlimited' };
    }
  }

  if (limit === -1) {
    return { bypassed: false, tier, limit: 'unlimited', remaining: 'unlimited' };
  }

  const used = await llm.getUsageCount(organizationId);
  if (used >= limit) {
    const err = new Error(`AI usage limit reached for ${tier} tier (${used}/${limit})`);
    err.status = 429;
    err.payload = {
      upgradeRequired: true,
      currentTier: tier,
      used,
      limit
    };
    throw err;
  }

  return {
    bypassed: false,
    tier,
    limit,
    remaining: Math.max(0, limit - used)
  };
}

async function extractReportText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const warnings = [];
  let parser = 'plain-text';
  let text = '';

  if (['.txt', '.md', '.csv', '.json', '.xml', '.log'].includes(ext)) {
    text = normalizeText(Buffer.from(file.buffer).toString('utf8'));
  } else if (ext === '.pdf') {
    parser = 'pdf-parse';
    try {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(file.buffer);
      text = normalizeText(parsed?.text || '');
    } catch (err) {
      parser = 'binary-fallback';
      warnings.push(`PDF parsing fallback used: ${err.message}`);
      text = normalizeText(Buffer.from(file.buffer).toString('utf8'));
    }
  } else if (ext === '.docx') {
    parser = 'mammoth';
    try {
      const mammoth = require('mammoth');
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      text = normalizeText(parsed?.value || '');
      if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
        warnings.push(`DOCX parser reported ${parsed.messages.length} warning(s).`);
      }
    } catch (err) {
      parser = 'binary-fallback';
      warnings.push(`DOCX parsing fallback used: ${err.message}`);
      text = normalizeText(Buffer.from(file.buffer).toString('utf8'));
    }
  } else {
    parser = 'binary-fallback';
    warnings.push(`Limited parsing support for ${ext || 'unknown extension'}; fallback parser used.`);
    text = normalizeText(Buffer.from(file.buffer).toString('utf8'));
  }

  const clipped = truncateText(text, CONTENT_PACK_EXTRACT_MAX_CHARS);
  if (!nonEmptyString(clipped.value)) {
    warnings.push('No extractable text was found in the uploaded report.');
  }

  return {
    parser,
    warnings,
    text: clipped.value,
    charCount: text.length,
    truncated: clipped.truncated
  };
}

async function generateAIDraftPack({
  organizationId,
  frameworkCode,
  provider,
  model,
  packName,
  packVersion,
  sourceVendor,
  licenseReference,
  reportText
}) {
  const frameworkResult = await pool.query(
    'SELECT id, code FROM frameworks WHERE code = $1 AND is_active = true LIMIT 1',
    [frameworkCode]
  );
  if (frameworkResult.rows.length === 0) {
    throw new Error(`Framework "${frameworkCode}" not found or inactive`);
  }

  const framework = frameworkResult.rows[0];
  const controlsResult = await pool.query(
    'SELECT control_id FROM framework_controls WHERE framework_id = $1 ORDER BY control_id',
    [framework.id]
  );
  const proceduresResult = await pool.query(
    `SELECT fc.control_id, ap.procedure_id
     FROM assessment_procedures ap
     JOIN framework_controls fc ON fc.id = ap.framework_control_id
     WHERE fc.framework_id = $1
     ORDER BY fc.control_id, ap.procedure_id`,
    [framework.id]
  );

  const controlSet = new Set(controlsResult.rows.map((row) => row.control_id));
  const procedureSet = new Set(proceduresResult.rows.map((row) => `${row.control_id}::${row.procedure_id}`));
  const controlPreview = controlsResult.rows.slice(0, 500).map((row) => row.control_id).join(', ');
  const procedurePreview = proceduresResult.rows.slice(0, 300).map((row) => `${row.control_id}/${row.procedure_id}`).join(', ');
  const reportExcerpt = truncateText(reportText, CONTENT_PACK_AI_INPUT_MAX_CHARS).value;

  const aiRaw = await llm.chat({
    organizationId,
    provider,
    model,
    maxTokens: 4096,
    systemPrompt: [
      'You are an expert GRC analyst.',
      'Generate a JSON-only draft content pack from a customer-provided report.',
      'Do not output markdown, prose, or code fences. Output a single JSON object only.',
      'Never copy long standards text verbatim. Use concise paraphrased wording.'
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Create a draft content pack from this report excerpt.

Required output JSON shape:
{
  "pack_name": string,
  "pack_version": string|null,
  "framework_code": string,
  "source_vendor": string|null,
  "license_reference": string|null,
  "metadata": object,
  "controls": [
    { "control_id": string, "title": string|null, "description": string|null, "metadata": object }
  ],
  "procedures": [
    {
      "control_id": string,
      "procedure_id": string,
      "title": string|null,
      "description": string|null,
      "expected_evidence": string|null,
      "assessor_notes": string|null,
      "metadata": object
    }
  ]
}

Hard constraints:
- framework_code must be "${frameworkCode}".
- Prefer only these known control IDs (first 500 shown): ${controlPreview || 'none'}.
- Prefer only these known procedure IDs (first 300 shown): ${procedurePreview || 'none'}.
- Omit uncertain items.
- Keep descriptions concise and original.

Fallback metadata to keep:
- pack_name: ${packName || `${framework.code.toUpperCase()} Licensed Pack`}
- pack_version: ${packVersion || 'null'}
- source_vendor: ${sourceVendor || 'null'}
- license_reference: ${licenseReference || 'null'}

Report excerpt:
${reportExcerpt}`
    }]
  });

  const candidateJson = extractFirstJsonObject(aiRaw);
  if (!candidateJson) {
    throw new Error('AI response did not include a parseable JSON object.');
  }

  const parsed = JSON.parse(candidateJson);
  const parsedPack = parsed?.pack ? parsed.pack : parsed;
  const draftPack = normalizePack(parsedPack, {
    pack_name: packName || `${framework.code.toUpperCase()} Licensed Pack`,
    pack_version: packVersion || null,
    framework_code: frameworkCode,
    source_vendor: sourceVendor || null,
    license_reference: licenseReference || null
  });

  let matchedControls = 0;
  let unmatchedControls = 0;
  const unmatchedControlIds = [];
  for (const control of draftPack.controls) {
    if (controlSet.has(control.control_id)) {
      matchedControls++;
    } else {
      unmatchedControls++;
      unmatchedControlIds.push(control.control_id);
    }
  }

  let matchedProcedures = 0;
  let unmatchedProcedures = 0;
  const unmatchedProcedureIds = [];
  for (const procedure of draftPack.procedures) {
    const key = `${procedure.control_id}::${procedure.procedure_id}`;
    if (procedureSet.has(key)) {
      matchedProcedures++;
    } else {
      unmatchedProcedures++;
      unmatchedProcedureIds.push(`${procedure.control_id}/${procedure.procedure_id}`);
    }
  }

  return {
    pack: draftPack,
    summary: {
      matched_controls: matchedControls,
      unmatched_controls: unmatchedControls,
      matched_procedures: matchedProcedures,
      unmatched_procedures: unmatchedProcedures,
      sample_unmatched_control_ids: unmatchedControlIds.slice(0, 20),
      sample_unmatched_procedure_ids: unmatchedProcedureIds.slice(0, 20)
    }
  };
}

async function importContentPackWithClient(client, { orgId, userId, pack, sourceDraftId = null }) {
  const controls = Array.isArray(pack.controls) ? pack.controls : [];
  const procedures = Array.isArray(pack.procedures) ? pack.procedures : [];

  const frameworkResult = await client.query(
    'SELECT id, code FROM frameworks WHERE code = $1 AND is_active = true LIMIT 1',
    [pack.framework_code]
  );
  if (frameworkResult.rows.length === 0) {
    const err = new Error(`Framework "${pack.framework_code}" not found or inactive`);
    err.status = 400;
    throw err;
  }

  const canonicalPayload = JSON.stringify({
    framework_code: pack.framework_code,
    pack_name: pack.pack_name,
    pack_version: pack.pack_version || null,
    source_vendor: pack.source_vendor || null,
    license_reference: pack.license_reference,
    controls,
    procedures
  });
  const contentHash = crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');

  const metadata = safeObject(pack.metadata);
  if (sourceDraftId) {
    metadata.source_draft_id = sourceDraftId;
  }

  let packInsertResult;
  try {
    packInsertResult = await client.query(`
      INSERT INTO organization_content_packs
        (organization_id, framework_code, pack_name, pack_version, license_reference,
         content_hash_sha256, source_vendor, metadata, imported_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, imported_at
    `, [
      orgId,
      pack.framework_code,
      pack.pack_name.trim(),
      pack.pack_version || null,
      pack.license_reference.trim(),
      contentHash,
      pack.source_vendor || null,
      metadata,
      userId
    ]);
  } catch (insertErr) {
    if (insertErr.code === '23505') {
      const conflict = new Error('This content pack (same framework/hash) was already imported for your organization');
      conflict.status = 409;
      throw conflict;
    }
    throw insertErr;
  }

  const packId = packInsertResult.rows[0].id;
  const frameworkId = frameworkResult.rows[0].id;

  const controlIdList = Array.from(new Set([
    ...controls.map((item) => item.control_id),
    ...procedures.map((item) => item.control_id)
  ]));

  const controlsLookup = controlIdList.length > 0
    ? await client.query(
      'SELECT id, control_id FROM framework_controls WHERE framework_id = $1 AND control_id = ANY($2::text[])',
      [frameworkId, controlIdList]
    )
    : { rows: [] };

  const controlIdMap = new Map(controlsLookup.rows.map((row) => [row.control_id, row.id]));

  let controlsApplied = 0;
  let controlsSkipped = 0;
  for (const item of controls) {
    const frameworkControlId = controlIdMap.get(item.control_id);
    if (!frameworkControlId) {
      controlsSkipped++;
      continue;
    }

    await client.query(`
      INSERT INTO organization_control_content_overrides
        (organization_id, framework_control_id, source_pack_id, title, description, metadata, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (organization_id, framework_control_id)
      DO UPDATE SET
        source_pack_id = EXCLUDED.source_pack_id,
        title = COALESCE(EXCLUDED.title, organization_control_content_overrides.title),
        description = COALESCE(EXCLUDED.description, organization_control_content_overrides.description),
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      orgId,
      frameworkControlId,
      packId,
      nonEmptyString(item.title) ? item.title.trim() : null,
      nonEmptyString(item.description) ? item.description.trim() : null,
      safeObject(item.metadata)
    ]);
    controlsApplied++;
  }

  let proceduresApplied = 0;
  let proceduresSkipped = 0;
  for (const item of procedures) {
    const frameworkControlId = controlIdMap.get(item.control_id);
    if (!frameworkControlId) {
      proceduresSkipped++;
      continue;
    }

    const procedureResult = await client.query(`
      SELECT id
      FROM assessment_procedures
      WHERE framework_control_id = $1 AND procedure_id = $2
      LIMIT 1
    `, [frameworkControlId, item.procedure_id]);

    if (procedureResult.rows.length === 0) {
      proceduresSkipped++;
      continue;
    }

    await client.query(`
      INSERT INTO organization_assessment_procedure_overrides
        (organization_id, assessment_procedure_id, source_pack_id, title, description, expected_evidence, assessor_notes, metadata, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (organization_id, assessment_procedure_id)
      DO UPDATE SET
        source_pack_id = EXCLUDED.source_pack_id,
        title = COALESCE(EXCLUDED.title, organization_assessment_procedure_overrides.title),
        description = COALESCE(EXCLUDED.description, organization_assessment_procedure_overrides.description),
        expected_evidence = COALESCE(EXCLUDED.expected_evidence, organization_assessment_procedure_overrides.expected_evidence),
        assessor_notes = COALESCE(EXCLUDED.assessor_notes, organization_assessment_procedure_overrides.assessor_notes),
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      orgId,
      procedureResult.rows[0].id,
      packId,
      nonEmptyString(item.title) ? item.title.trim() : null,
      nonEmptyString(item.description) ? item.description.trim() : null,
      nonEmptyString(item.expected_evidence) ? item.expected_evidence.trim() : null,
      nonEmptyString(item.assessor_notes) ? item.assessor_notes.trim() : null,
      safeObject(item.metadata)
    ]);
    proceduresApplied++;
  }

  const summary = {
    controls_applied: controlsApplied,
    controls_skipped: controlsSkipped,
    procedures_applied: proceduresApplied,
    procedures_skipped: proceduresSkipped
  };

  await client.query(
    `UPDATE organization_content_packs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE id = $1 AND organization_id = $2`,
    [
      packId,
      orgId,
      JSON.stringify({ import_summary: summary })
    ]
  );

  return {
    id: packId,
    imported_at: packInsertResult.rows[0].imported_at,
    framework_code: pack.framework_code,
    pack_name: pack.pack_name,
    summary
  };
}

// ---------- GET /api/v1/settings/content-packs ----------
// List customer-provided licensed content packs for this organization.
router.get('/content-packs', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(`
      SELECT
        cp.id,
        cp.framework_code,
        cp.pack_name,
        cp.pack_version,
        cp.license_reference,
        cp.content_hash_sha256,
        cp.source_vendor,
        cp.metadata,
        cp.imported_at,
        cp.is_active,
        CONCAT(u.first_name, ' ', u.last_name) AS imported_by_name,
        (SELECT COUNT(*) FROM organization_control_content_overrides c WHERE c.organization_id = cp.organization_id AND c.source_pack_id = cp.id) AS control_overrides,
        (SELECT COUNT(*) FROM organization_assessment_procedure_overrides p WHERE p.organization_id = cp.organization_id AND p.source_pack_id = cp.id) AS procedure_overrides
      FROM organization_content_packs cp
      LEFT JOIN users u ON u.id = cp.imported_by
      WHERE cp.organization_id = $1
      ORDER BY cp.imported_at DESC
    `, [orgId]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List content packs error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch content packs' });
  }
});

// ---------- GET /api/v1/settings/content-packs/template ----------
// Return JSON template for licensed content pack imports.
router.get('/content-packs/template', requirePermission('settings.manage'), async (req, res) => {
  res.json({
    success: true,
    data: {
      schema_version: '1.0',
      pack_name: 'Customer Licensed Pack',
      pack_version: '2026-Q1',
      framework_code: 'iso_27001',
      source_vendor: 'Vendor Name',
      license_reference: 'Contract/PO/License reference',
      metadata: {
        notes: 'Optional metadata'
      },
      controls: [
        {
          control_id: 'A.5.12',
          title: 'Optional licensed title override',
          description: 'Optional licensed description override'
        }
      ],
      procedures: [
        {
          control_id: 'A.5.12',
          procedure_id: 'A.5.12-01',
          title: 'Optional licensed procedure title override',
          description: 'Optional licensed procedure description override',
          expected_evidence: 'Optional licensed expected evidence override',
          assessor_notes: 'Optional licensed notes override'
        }
      ]
    }
  });
});

// ---------- GET /api/v1/settings/content-packs/drafts ----------
// List draft workflow entries.
router.get('/content-packs/drafts', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(`
      SELECT
        d.id,
        d.framework_code,
        d.pack_name,
        d.pack_version,
        d.source_vendor,
        d.license_reference,
        d.report_file_name,
        d.report_mime_type,
        d.report_size_bytes,
        d.extracted_char_count,
        d.extracted_truncated,
        d.parse_summary,
        d.ai_provider,
        d.ai_model,
        d.attestation_confirmed,
        d.attested_at,
        d.review_required,
        d.review_status,
        d.review_notes,
        d.reviewed_at,
        d.imported_pack_id,
        d.imported_at,
        d.created_at,
        d.updated_at,
        jsonb_array_length(COALESCE(d.draft_pack->'controls', '[]'::jsonb)) AS draft_control_count,
        jsonb_array_length(COALESCE(d.draft_pack->'procedures', '[]'::jsonb)) AS draft_procedure_count,
        CONCAT(cu.first_name, ' ', cu.last_name) AS created_by_name,
        CONCAT(au.first_name, ' ', au.last_name) AS attested_by_name,
        CONCAT(ru.first_name, ' ', ru.last_name) AS reviewed_by_name
      FROM organization_content_pack_drafts d
      LEFT JOIN users cu ON cu.id = d.created_by
      LEFT JOIN users au ON au.id = d.attested_by
      LEFT JOIN users ru ON ru.id = d.reviewed_by
      WHERE d.organization_id = $1
      ORDER BY d.created_at DESC
    `, [orgId]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List content pack drafts error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch content pack drafts' });
  }
});

// ---------- GET /api/v1/settings/content-packs/drafts/:id ----------
// Get a single draft with editable pack JSON.
router.get('/content-packs/drafts/:id', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const draftId = req.params.id;

    const result = await pool.query(`
      SELECT
        d.*,
        LEFT(COALESCE(d.extracted_text, ''), 20000) AS extracted_preview,
        CONCAT(cu.first_name, ' ', cu.last_name) AS created_by_name,
        CONCAT(au.first_name, ' ', au.last_name) AS attested_by_name,
        CONCAT(ru.first_name, ' ', ru.last_name) AS reviewed_by_name
      FROM organization_content_pack_drafts d
      LEFT JOIN users cu ON cu.id = d.created_by
      LEFT JOIN users au ON au.id = d.attested_by
      LEFT JOIN users ru ON ru.id = d.reviewed_by
      WHERE d.id = $1 AND d.organization_id = $2
      LIMIT 1
    `, [draftId, orgId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content pack draft not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get content pack draft error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch content pack draft' });
  }
});

// ---------- POST /api/v1/settings/content-packs/drafts/upload ----------
// Upload report, parse text, and create AI-assisted draft pack.
router.post(
  '/content-packs/drafts/upload',
  requirePermission('settings.manage'),
  contentPackDraftUpload.single('report'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const orgId = req.user.organization_id;
      const userId = req.user.id;
      const frameworkCode = nonEmptyString(req.body.framework_code) ? req.body.framework_code.trim().toLowerCase() : '';

      if (!frameworkCode) {
        return res.status(400).json({ success: false, error: 'framework_code is required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'report file is required' });
      }

      const frameworkResult = await client.query(
        'SELECT id FROM frameworks WHERE code = $1 AND is_active = true LIMIT 1',
        [frameworkCode]
      );
      if (frameworkResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: `Framework "${frameworkCode}" not found or inactive` });
      }

      const packName = nonEmptyString(req.body.pack_name) ? req.body.pack_name.trim() : `${frameworkCode.toUpperCase()} Licensed Pack`;
      const packVersion = nonEmptyString(req.body.pack_version) ? req.body.pack_version.trim() : null;
      const sourceVendor = nonEmptyString(req.body.source_vendor) ? req.body.source_vendor.trim() : null;
      const licenseReference = nonEmptyString(req.body.license_reference) ? req.body.license_reference.trim() : null;
      const reviewRequired = toBoolean(req.body.review_required, false);
      const aiAssist = toBoolean(req.body.ai_assist, true);
      const requestedProvider = nonEmptyString(req.body.provider) ? req.body.provider.trim().toLowerCase() : null;
      const requestedModel = nonEmptyString(req.body.model) ? req.body.model.trim() : null;
      const metadata = safeObject(safeJsonParse(req.body.metadata, {}));

      if (requestedProvider && !ALLOWED_PROVIDERS.has(requestedProvider)) {
        return res.status(400).json({ success: false, error: 'provider must be one of: claude, openai, gemini, grok' });
      }

      const extraction = await extractReportText(req.file);
      const reportHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

      let provider = requestedProvider || await getDefaultProviderForOrg(orgId);
      if (!ALLOWED_PROVIDERS.has(provider)) provider = 'claude';

      let draftPack = normalizePack({}, {
        pack_name: packName,
        pack_version: packVersion,
        framework_code: frameworkCode,
        source_vendor: sourceVendor,
        license_reference: licenseReference
      });

      const warnings = [...extraction.warnings];
      let aiSummary = null;
      let aiError = null;

      if (aiAssist && nonEmptyString(extraction.text)) {
        try {
          await enforceDraftAiLimit({
            organizationId: orgId,
            organizationTier: req.user.organization_tier,
            provider
          });

          const aiDraft = await generateAIDraftPack({
            organizationId: orgId,
            frameworkCode,
            provider,
            model: requestedModel,
            packName,
            packVersion,
            sourceVendor,
            licenseReference,
            reportText: extraction.text
          });

          draftPack = normalizePack(aiDraft.pack, {
            pack_name: packName,
            pack_version: packVersion,
            framework_code: frameworkCode,
            source_vendor: sourceVendor,
            license_reference: licenseReference
          });
          aiSummary = aiDraft.summary;

          await llm.logAIUsage(orgId, userId, 'content_pack_draft', provider, requestedModel).catch(() => {});
        } catch (err) {
          aiError = err.message;
          if (err.status === 429) {
            warnings.push('AI draft skipped due to tier usage limit; manual review/edit required.');
          } else {
            warnings.push('AI draft generation failed; manual review/edit required.');
          }
        }
      }

      const parseSummary = {
        parser: extraction.parser,
        report_chars_extracted: extraction.charCount,
        report_truncated: extraction.truncated,
        ai_assisted: Boolean(aiAssist && !aiError),
        ai_provider: aiAssist ? provider : null,
        ai_model: requestedModel || null,
        ai_error: aiError,
        ai_summary: aiSummary,
        warnings,
        generated_at: new Date().toISOString()
      };

      draftPack.metadata = {
        ...safeObject(draftPack.metadata),
        ...metadata,
        draft_source: 'report_upload',
        report_file_name: req.file.originalname
      };

      const reviewStatus = reviewRequired ? 'pending' : 'not_required';
      const insertResult = await client.query(`
        INSERT INTO organization_content_pack_drafts (
          organization_id, framework_code, pack_name, pack_version, source_vendor, license_reference,
          report_file_name, report_mime_type, report_size_bytes, report_sha256,
          extracted_text, extracted_char_count, extracted_truncated, parse_summary,
          ai_provider, ai_model, draft_pack,
          review_required, review_status,
          created_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13, $14,
                $15, $16, $17,
                $18, $19,
                $20, NOW())
        RETURNING id, framework_code, pack_name, review_required, review_status, parse_summary, created_at
      `, [
        orgId,
        frameworkCode,
        draftPack.pack_name,
        draftPack.pack_version,
        draftPack.source_vendor,
        draftPack.license_reference,
        req.file.originalname,
        req.file.mimetype || null,
        Number(req.file.size || 0),
        reportHash,
        extraction.text,
        extraction.charCount,
        extraction.truncated,
        parseSummary,
        aiAssist ? provider : null,
        requestedModel,
        draftPack,
        reviewRequired,
        reviewStatus,
        userId
      ]);

      res.status(201).json({
        success: true,
        data: insertResult.rows[0]
      });
    } catch (err) {
      console.error('Upload content pack draft error:', err);
      const status = err.status || 500;
      res.status(status).json({
        success: false,
        error: 'Failed to create content pack draft',
        ...(err.payload ? { details: err.payload } : {})
      });
    } finally {
      client.release();
    }
  }
);

// ---------- PUT /api/v1/settings/content-packs/drafts/:id ----------
// Update draft pack JSON and review requirement.
router.put('/content-packs/drafts/:id', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (!body.pack || typeof body.pack !== 'object' || Array.isArray(body.pack)) {
    errors.push('pack object is required');
  }
  if (body.review_required !== undefined && typeof body.review_required !== 'boolean') {
    errors.push('review_required must be boolean');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const draftId = req.params.id;

    const currentResult = await pool.query(
      `SELECT id, framework_code, pack_name, pack_version, source_vendor, license_reference, review_required
       FROM organization_content_pack_drafts
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [draftId, orgId]
    );
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content pack draft not found' });
    }

    const current = currentResult.rows[0];
    const normalizedPack = normalizePack(req.body.pack, {
      pack_name: current.pack_name,
      pack_version: current.pack_version,
      framework_code: current.framework_code,
      source_vendor: current.source_vendor,
      license_reference: current.license_reference
    });

    if (!nonEmptyString(normalizedPack.framework_code)) {
      return res.status(400).json({ success: false, error: 'pack.framework_code is required' });
    }

    const frameworkResult = await pool.query(
      'SELECT id FROM frameworks WHERE code = $1 AND is_active = true LIMIT 1',
      [normalizedPack.framework_code]
    );
    if (frameworkResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: `Framework "${normalizedPack.framework_code}" not found or inactive` });
    }

    const reviewRequired = req.body.review_required !== undefined ? req.body.review_required : current.review_required;
    const reviewStatus = reviewRequired ? 'pending' : 'not_required';

    const updateResult = await pool.query(`
      UPDATE organization_content_pack_drafts
      SET framework_code = $3,
          pack_name = $4,
          pack_version = $5,
          source_vendor = $6,
          license_reference = $7,
          draft_pack = $8,
          review_required = $9,
          review_status = $10,
          review_notes = CASE WHEN $9 THEN NULL ELSE review_notes END,
          reviewed_by = CASE WHEN $9 THEN NULL ELSE reviewed_by END,
          reviewed_at = CASE WHEN $9 THEN NULL ELSE reviewed_at END,
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, framework_code, pack_name, review_required, review_status, updated_at
    `, [
      draftId,
      orgId,
      normalizedPack.framework_code,
      normalizedPack.pack_name,
      normalizedPack.pack_version,
      normalizedPack.source_vendor,
      normalizedPack.license_reference,
      normalizedPack,
      reviewRequired,
      reviewStatus
    ]);

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    console.error('Update content pack draft error:', err);
    res.status(500).json({ success: false, error: 'Failed to update content pack draft' });
  }
});

// ---------- POST /api/v1/settings/content-packs/drafts/:id/attest ----------
// Mandatory licensing rights attestation for import eligibility.
router.post('/content-packs/drafts/:id/attest', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (body.confirm !== true) {
    errors.push('confirm must be true');
  }
  if (body.statement !== undefined && !nonEmptyString(body.statement)) {
    errors.push('statement must be a non-empty string when provided');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const draftId = req.params.id;
    const statement = nonEmptyString(req.body.statement)
      ? req.body.statement.trim()
      : 'I confirm that my organization has licensing rights for all uploaded content and accepts responsibility for legal use.';

    const result = await pool.query(`
      UPDATE organization_content_pack_drafts
      SET attestation_confirmed = true,
          attestation_statement = $3,
          attested_by = $4,
          attested_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, attestation_confirmed, attestation_statement, attested_at
    `, [draftId, orgId, statement, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content pack draft not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Attest content pack draft error:', err);
    res.status(500).json({ success: false, error: 'Failed to attest content pack draft' });
  }
});

// ---------- POST /api/v1/settings/content-packs/drafts/:id/review ----------
// Optional review/approval gate before import.
router.post('/content-packs/drafts/:id/review', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (!['approve', 'reject'].includes(body.action)) {
    errors.push('action must be one of: approve, reject');
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    errors.push('notes must be a string');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const draftId = req.params.id;

    const existing = await pool.query(
      'SELECT id, review_required, created_by FROM organization_content_pack_drafts WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [draftId, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content pack draft not found' });
    }
    if (!existing.rows[0].review_required) {
      return res.status(400).json({ success: false, error: 'Review is not required for this draft' });
    }

    // SOD: the user who created the draft cannot be the one to approve it
    const sodError = requireSod(existing.rows[0].created_by, userId, 'creator', 'reviewer', req.user.permissions || []);
    if (sodError) {
      return res.status(403).json({ success: false, error: sodError });
    }

    const status = req.body.action === 'approve' ? 'approved' : 'rejected';
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : null;

    const result = await pool.query(`
      UPDATE organization_content_pack_drafts
      SET review_status = $3,
          review_notes = $4,
          reviewed_by = $5,
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, review_required, review_status, review_notes, reviewed_at
    `, [draftId, orgId, status, notes, userId]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Review content pack draft error:', err);
    res.status(500).json({ success: false, error: 'Failed to review content pack draft' });
  }
});

// ---------- POST /api/v1/settings/content-packs/drafts/:id/import ----------
// Import from draft after mandatory attestation and optional approval.
router.post('/content-packs/drafts/:id/import', requirePermission('settings.manage'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const draftId = req.params.id;

    await client.query('BEGIN');

    const draftResult = await client.query(`
      SELECT *
      FROM organization_content_pack_drafts
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE
    `, [draftId, orgId]);

    if (draftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Content pack draft not found' });
    }

    const draft = draftResult.rows[0];
    if (draft.imported_pack_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'This draft has already been imported' });
    }
    if (!draft.attestation_confirmed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Mandatory licensing attestation is required before import'
      });
    }
    if (draft.review_required && draft.review_status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Draft requires approval before import'
      });
    }

    const normalizedPack = normalizePack(draft.draft_pack, {
      pack_name: draft.pack_name,
      pack_version: draft.pack_version,
      framework_code: draft.framework_code,
      source_vendor: draft.source_vendor,
      license_reference: draft.license_reference
    });

    const errors = validatePackPayload(normalizedPack);
    if (errors.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    const importResult = await importContentPackWithClient(client, {
      orgId,
      userId,
      pack: normalizedPack,
      sourceDraftId: draftId
    });

    await client.query(`
      UPDATE organization_content_pack_drafts
      SET imported_pack_id = $3,
          imported_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
    `, [draftId, orgId, importResult.id]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        draft_id: draftId,
        import: importResult
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import content pack draft error:', err);
    res.status(err.status || 500).json({ success: false, error: 'Failed to import draft' });
  } finally {
    client.release();
  }
});

// ---------- POST /api/v1/settings/content-packs/import ----------
// Import an org-scoped licensed content pack (controls/procedures overrides).
router.post('/content-packs/import', requirePermission('settings.manage'), validateBody((body) => {
  return validatePackPayload(body.pack);
}), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const pack = normalizePack(req.body.pack);

    await client.query('BEGIN');
    const importResult = await importContentPackWithClient(client, { orgId, userId, pack });
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: importResult
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import content pack error:', err);
    res.status(err.status || 500).json({ success: false, error: 'Failed to import content pack' });
  } finally {
    client.release();
  }
});

// ---------- DELETE /api/v1/settings/content-packs/:id ----------
// Deactivate a content pack and remove overrides sourced from it.
router.delete('/content-packs/:id', requirePermission('settings.manage'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const packId = req.params.id;

    await client.query('BEGIN');

    const packResult = await client.query(
      'SELECT id FROM organization_content_packs WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [packId, orgId]
    );
    if (packResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Content pack not found' });
    }

    const controlDelete = await client.query(
      'DELETE FROM organization_control_content_overrides WHERE organization_id = $1 AND source_pack_id = $2',
      [orgId, packId]
    );
    const procedureDelete = await client.query(
      'DELETE FROM organization_assessment_procedure_overrides WHERE organization_id = $1 AND source_pack_id = $2',
      [orgId, packId]
    );
    await client.query(
      'UPDATE organization_content_packs SET is_active = false WHERE id = $1 AND organization_id = $2',
      [packId, orgId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        removed_control_overrides: controlDelete.rowCount,
        removed_procedure_overrides: procedureDelete.rowCount
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete content pack error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove content pack' });
  } finally {
    client.release();
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `Report file exceeds ${Math.floor(CONTENT_PACK_UPLOAD_MAX_BYTES / (1024 * 1024))}MB upload limit`
      });
    }
    return res.status(400).json({ success: false, error: 'Invalid report upload request' });
  }

  if (err?.message === 'Unsupported content pack report file type') {
    return res.status(400).json({
      success: false,
      error: `Unsupported report file type. Allowed: ${Array.from(CONTENT_PACK_ALLOWED_EXTENSIONS).join(', ')}`
    });
  }

  return next(err);
});

// =========================================================================
// ACCOUNT MANAGEMENT — Cancel / Export
// =========================================================================

// ---------- POST /api/v1/settings/account/cancel ----------
// Cancels active Stripe billing (when present), then downgrades the organization to Free tier.
router.post('/account/cancel', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
    errors.push('reason is required');
  }
  if (!body.confirm || body.confirm !== true) {
    errors.push('confirm must be true to proceed');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { reason } = req.body;

    const orgResult = await pool.query(
      `SELECT tier, billing_status, stripe_subscription_id
       FROM organizations
       WHERE id = $1`,
      [orgId]
    );

    if (!orgResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const org = orgResult.rows[0];
    const stripeSubscriptionId = org.stripe_subscription_id;
    const hadActiveStripeSubscription = !!stripeSubscriptionId;

    if (hadActiveStripeSubscription) {
      if (!isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Stripe billing is not configured. Cannot safely cancel an active paid subscription.'
        });
      }

      try {
        await cancelSubscriptionNow(stripeSubscriptionId);
      } catch (stripeErr) {
        console.error('Stripe subscription cancellation error:', stripeErr);
        return res.status(502).json({
          success: false,
          error: 'Failed to cancel Stripe subscription. Account cancellation was not applied.'
        });
      }
    }

    // Downgrade to free tier
    await pool.query(
      `UPDATE organizations
       SET tier = 'community',
           billing_status = 'canceled',
           paid_tier = NULL,
           stripe_subscription_id = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [orgId]
    );

    // Store cancellation record in org settings
    const cancelMeta = JSON.stringify({
      reason: reason.trim(),
      cancelled_at: new Date().toISOString(),
      cancelled_by: req.user.id,
      previous_tier: req.user.organization_tier || org.tier || 'unknown',
      previous_billing_status: org.billing_status || 'unknown',
      stripe_cancellation: hadActiveStripeSubscription
        ? {
            attempted: true,
            status: 'canceled',
            subscription_id: stripeSubscriptionId
          }
        : {
            attempted: false,
            status: 'no_active_subscription'
          }
    });
    await pool.query(`
      INSERT INTO organization_settings (organization_id, setting_key, setting_value, updated_at)
      VALUES ($1, 'cancellation_record', $2, NOW())
      ON CONFLICT (organization_id, setting_key)
      DO UPDATE SET setting_value = $2, updated_at = NOW()
    `, [orgId, cancelMeta]);

    // Audit log
    await pool.query(`
      INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, success, created_at)
      VALUES ($1, $2, 'account_cancelled', 'organization', $1, $3, $4, true, NOW())
    `, [orgId, req.user.id, cancelMeta, req.ip || null]).catch(() => {});

    res.json({
      success: true,
      message: 'Account cancelled. Your organization has been downgraded to the Community tier. Data is retained for 30 days.',
      newTier: 'community',
      paymentNote: hadActiveStripeSubscription
        ? 'Active Stripe subscription cancelled successfully. No further charges will be applied.'
        : 'No active Stripe subscription was found for this organization.'
    });
  } catch (err) {
    console.error('Account cancel error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel account' });
  }
});

// ---------- GET /api/v1/settings/account/export ----------
// Full data export — returns a JSON archive of all organization data.
router.get('/account/export', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // 1. Organization profile
    const orgResult = await pool.query(
      `SELECT o.id, o.name, o.tier, o.created_at, o.updated_at,
              op.company_legal_name, op.industry, op.website, op.hq_location,
              op.employee_count_range, op.company_description, op.system_name,
              op.system_description, op.authorization_boundary, op.operating_environment_summary,
              op.confidentiality_impact, op.integrity_impact, op.availability_impact,
              op.impact_rationale, op.environment_types, op.deployment_model,
              op.cloud_providers, op.data_sensitivity_types, op.rmf_stage,
              op.information_types, op.compliance_profile
       FROM organizations o
       LEFT JOIN organization_profiles op ON op.organization_id = o.id
       WHERE o.id = $1`, [orgId]
    );

    // 2. Frameworks
    const frameworksResult = await pool.query(
      `SELECT f.code, f.name, f.version, f.description, f.tier_required
       FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       WHERE of2.organization_id = $1
       ORDER BY f.name`, [orgId]
    );

    // 3. Controls + implementations
    const controlsResult = await pool.query(
      `SELECT fc.control_id, fc.title, fc.description, fc.control_type, fc.priority,
              f.code AS framework_code, f.name AS framework_name,
              ci.status, ci.implementation_notes, ci.evidence_location, ci.notes,
              ci.implementation_date
       FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       JOIN framework_controls fc ON fc.framework_id = f.id
       LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE of2.organization_id = $1
       ORDER BY f.code, fc.control_id`, [orgId]
    );

    // 4. Assets
    const assetsResult = await pool.query(
      `SELECT a.name, a.asset_type, a.description, a.criticality, a.status,
              a.owner, a.location, a.ip_address, a.mac_address,
              ac.name AS category_name, ac.code AS category_code
       FROM assets a
       LEFT JOIN asset_categories ac ON ac.id = a.category_id
       WHERE a.organization_id = $1
       ORDER BY a.name`, [orgId]
    );

    // 5. Users (name and email only — no passwords)
    const usersResult = await pool.query(
      `SELECT u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at
       FROM users u WHERE u.organization_id = $1
       ORDER BY u.created_at`, [orgId]
    );

    // 6. Audit logs (last 1000)
    const auditResult = await pool.query(
      `SELECT event_type, resource_type, resource_id, details, success, created_at
       FROM audit_logs WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 1000`, [orgId]
    );

    const exportData = {
      exported_at: new Date().toISOString(),
      exported_by: req.user.email,
      organization: orgResult.rows[0] || {},
      frameworks: frameworksResult.rows,
      controls: controlsResult.rows,
      assets: assetsResult.rows,
      users: usersResult.rows,
      audit_logs: auditResult.rows
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="controlweave-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({ success: true, data: exportData });
  } catch (err) {
    console.error('Account export error:', err);
    res.status(500).json({ success: false, error: 'Failed to export account data' });
  }
});

// ==================== SMTP CONFIGURATION (org-level) ====================
// Organizations configure their own SMTP so email notifications are sent from
// their own mail infrastructure.  Keys stored in organization_settings table
// (encrypted where appropriate) giving each org full autonomy.

const ORG_SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_email'];

// GET /api/v1/settings/smtp — returns current org SMTP config (password masked)
router.get('/smtp', orgSettingsRateLimiter, requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(
      `SELECT setting_key, setting_value, is_encrypted, updated_at
       FROM organization_settings WHERE organization_id = $1 AND setting_key = ANY($2)`,
      [orgId, ORG_SMTP_KEYS]
    );

    const settings = {};
    for (const row of result.rows) {
      const plainValue = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
      settings[row.setting_key] = {
        value: row.setting_key === 'smtp_pass'
          ? (plainValue ? '•'.repeat(12) : '')
          : (plainValue || ''),
        configured: Boolean(plainValue),
        updated_at: row.updated_at
      };
    }

    const dbHost = settings.smtp_host?.configured;
    const envHost = Boolean(process.env.SMTP_HOST);
    const source = dbHost ? 'database' : (envHost ? 'environment' : 'none');
    const smtpHostValue = dbHost ? (settings.smtp_host?.value || '') : '';

    res.json({
      success: true,
      data: {
        smtp_host: smtpHostValue,
        smtp_port: settings.smtp_port?.value || '',
        smtp_user: settings.smtp_user?.value || '',
        smtp_pass: settings.smtp_pass?.value || '',
        smtp_from_email: settings.smtp_from_email?.value || '',
        configured: dbHost || envHost,
        source
      }
    });
  } catch (error) {
    console.error('Org settings get SMTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SMTP configuration' });
  }
});

// PUT /api/v1/settings/smtp — save org SMTP configuration
router.put('/smtp', orgSettingsRateLimiter, requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email } = req.body || {};

    if (smtp_port !== undefined && smtp_port !== '' && smtp_port !== null) {
      const portStr = String(smtp_port).trim();
      const portNum = parseInt(portStr, 10);
      if (!/^\d+$/.test(portStr) || isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({ success: false, error: 'smtp_port must be a valid port number (1–65535)' });
      }
    }

    const upsert = async (key, value, shouldEncrypt = false) => {
      if (value === undefined) return;
      if (value === null || value === '') {
        await pool.query(
          'DELETE FROM organization_settings WHERE organization_id = $1 AND setting_key = $2',
          [orgId, key]
        );
        return;
      }
      const storedValue = shouldEncrypt ? encrypt(String(value)) : String(value);
      await pool.query(`
        INSERT INTO organization_settings (organization_id, setting_key, setting_value, is_encrypted, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (organization_id, setting_key)
        DO UPDATE SET setting_value = $3, is_encrypted = $4, updated_at = NOW()
      `, [orgId, key, storedValue, shouldEncrypt]);
    };

    await upsert('smtp_host', smtp_host, false);
    await upsert('smtp_port', smtp_port, false);
    await upsert('smtp_user', smtp_user, false);
    if (smtp_pass && !smtp_pass.startsWith('•')) {
      await upsert('smtp_pass', smtp_pass, true);
    }
    await upsert('smtp_from_email', smtp_from_email, false);

    if (typeof emailService.invalidateSmtpCacheForOrg === 'function') {
      emailService.invalidateSmtpCacheForOrg(orgId);
    }

    await pool.query(`
      INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, success, created_at)
      VALUES ($1, $2, 'smtp_config_updated', 'settings', $1, $3, $4, true, NOW())
    `, [orgId, req.user.id, JSON.stringify({ updated_by: req.user.email }), req.ip || null]).catch(() => {});

    res.json({ success: true, message: 'SMTP configuration saved. Send a test email to verify.' });
  } catch (error) {
    console.error('Org settings update SMTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to save SMTP configuration' });
  }
});

// POST /api/v1/settings/smtp/test — sends a test email using org SMTP config
router.post('/smtp/test', orgSettingsRateLimiter, requirePermission('settings.manage'), async (req, res) => {
  try {
    const { to_email } = req.body || {};
    if (!to_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to_email))) {
      return res.status(400).json({ success: false, error: 'A valid to_email is required' });
    }

    await emailService.sendNotificationEmail(
      { email: String(to_email), full_name: 'Test' },
      { title: 'ControlWeave SMTP Test', message: 'SMTP is configured correctly. Email delivery is working.', link: null },
      req.user.organization_id
    );

    res.json({ success: true, message: `Test email sent to ${to_email}` });
  } catch (error) {
    console.error('Org settings SMTP test error:', error);
    res.status(500).json({ success: false, error: 'SMTP test failed' });
  }
});

module.exports = router;
