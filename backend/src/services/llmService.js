// @tier: community
'use strict';

const crypto = require('crypto');
const pool = require('../config/database');

let log;
try {
  ({ log } = require('../utils/logger'));
} catch (_e) {
  log = (level, msg, meta) => console[level === 'error' ? 'error' : 'log'](`[${level}] ${msg}`, meta || '');
}

let Anthropic, OpenAI, axios;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_e) { Anthropic = null; }
try { OpenAI = require('openai'); } catch (_e) { OpenAI = null; }
try { axios = require('axios'); } catch (_e) { axios = null; }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USAGE_LIMITS = { community: -1, pro: -1, enterprise: -1, govcloud: -1 };

const PROVIDER_MODELS = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  grok: ['grok-3', 'grok-3-mini'],
  ollama: ['llama3.2', 'mistral', 'codellama'],
};
// Alias: ai.js uses 'claude' for Anthropic
PROVIDER_MODELS.claude = PROVIDER_MODELS.anthropic;
PROVIDER_MODELS.xai = PROVIDER_MODELS.grok;

const PROVIDER_KEY_COLUMNS = {
  anthropic: 'anthropic_api_key_enc',
  openai: 'openai_api_key_enc',
  gemini: 'gemini_api_key_enc',
  grok: 'xai_api_key_enc',
  groq: 'groq_api_key_enc',
};
PROVIDER_KEY_COLUMNS.claude = PROVIDER_KEY_COLUMNS.anthropic;
PROVIDER_KEY_COLUMNS.xai = PROVIDER_KEY_COLUMNS.grok;

const PROVIDER_ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  grok: 'XAI_API_KEY',
  groq: 'GROQ_API_KEY',
  ollama: 'OLLAMA_BASE_URL',
};
PROVIDER_ENV_VARS.claude = PROVIDER_ENV_VARS.anthropic;
PROVIDER_ENV_VARS.xai = PROVIDER_ENV_VARS.grok;

const DEFAULT_PROVIDER = 'anthropic';

const PROVIDER_TIMEOUT_MS = {
  anthropic: 60000,
  openai: 60000,
  gemini: 60000,
  groq: 60000,
  grok: 60000,
  ollama: 120000,
};

// Module-level tracking state
let _lastCallMeta = { usedProvider: null, usedModel: null };

// Simple in-memory cache
let _cache = {};

// ---------------------------------------------------------------------------
// Encryption helpers  (AES-256-GCM,  iv:authTag:ciphertext  hex)
// ---------------------------------------------------------------------------

function _getEncryptionKey() {
  if (process.env.LLM_ENCRYPTION_KEY) {
    const raw = process.env.LLM_ENCRYPTION_KEY;
    return Buffer.from(raw.length === 64 ? raw : crypto.createHash('sha256').update(raw).digest('hex'), 'hex');
  }
  if (process.env.JWT_SECRET) {
    // HKDF derivation from JWT_SECRET
    const ikm = Buffer.from(process.env.JWT_SECRET, 'utf8');
    const salt = Buffer.alloc(32, 0);
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
    const info = Buffer.from('llm-key-encryption', 'utf8');
    const t1 = crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest();
    return t1;
  }
  log('error', 'No LLM_ENCRYPTION_KEY or JWT_SECRET set – cannot encrypt/decrypt API keys');
  throw new Error('LLM encryption key not configured. Set LLM_ENCRYPTION_KEY or JWT_SECRET.');
}

function encryptKey(plaintext) {
  if (!plaintext) return null;
  const key = _getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptKey(ciphertext) {
  if (!ciphertext) return null;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return null;
  try {
    const key = _getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  } catch (err) {
    log('error', 'Failed to decrypt API key', { error: err.message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function _queryOne(sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  } catch (err) {
    log('error', 'DB query failed', { error: err.message, sql: sql.slice(0, 80) });
    return null;
  }
}

async function _queryAll(sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    log('error', 'DB query failed', { error: err.message, sql: sql.slice(0, 80) });
    return [];
  }
}

async function _exec(sql, params) {
  try {
    await pool.query(sql, params);
  } catch (err) {
    log('error', 'DB exec failed', { error: err.message, sql: sql.slice(0, 80) });
  }
}

// ---------------------------------------------------------------------------
// Core Infrastructure
// ---------------------------------------------------------------------------

function getUsageLimit(tier) {
  const key = (tier || 'community').toLowerCase();
  return USAGE_LIMITS[key] !== undefined ? USAGE_LIMITS[key] : USAGE_LIMITS.community;
}

async function getUsageCount(orgId) {
  const row = await _queryOne(
    `SELECT COUNT(*)::int AS cnt FROM ai_usage_log
     WHERE organization_id = $1
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [orgId]
  );
  return row ? row.cnt : 0;
}

async function resolveApiKey(provider, orgId) {
  const p = (provider || DEFAULT_PROVIDER).toLowerCase();

  // 1. Organization-level config
  if (orgId && PROVIDER_KEY_COLUMNS[p]) {
    const col = PROVIDER_KEY_COLUMNS[p];
    const row = await _queryOne(
      `SELECT ${col} AS enc_key FROM llm_configurations WHERE organization_id = $1`,
      [orgId]
    );
    if (row && row.enc_key) {
      const key = decryptKey(row.enc_key);
      if (key) return { key, source: 'organization' };
    }
  }
  // Ollama uses base_url instead of key
  if (p === 'ollama' && orgId) {
    const row = await _queryOne(
      'SELECT ollama_base_url FROM llm_configurations WHERE organization_id = $1',
      [orgId]
    );
    if (row && row.ollama_base_url) return { key: row.ollama_base_url, source: 'organization' };
  }

  // 2. Platform defaults
  const platform = await _queryOne(
    "SELECT setting_value FROM platform_settings WHERE setting_key = 'llm_defaults'",
    []
  );
  if (platform && platform.setting_value) {
    let pv;
    try {
      pv = typeof platform.setting_value === 'string'
        ? JSON.parse(platform.setting_value)
        : platform.setting_value;
    } catch (_jsonErr) {
      log('error', 'Failed to parse platform LLM defaults', { error: _jsonErr.message });
      pv = {};
    }
    const platformKey = pv[`${p}_api_key`] || pv[PROVIDER_ENV_VARS[p]];
    if (platformKey) return { key: platformKey, source: 'platform' };
  }

  // 3. Dynamic config entries
  if (orgId) {
    const dynRow = await _queryOne(
      `SELECT config_value FROM dynamic_config_entries
       WHERE organization_id = $1 AND config_domain = 'llm_config' AND config_key = $2`,
      [orgId, `${p}_api_key`]
    );
    if (dynRow && dynRow.config_value) {
      const val = typeof dynRow.config_value === 'object' ? dynRow.config_value.value : dynRow.config_value;
      if (val) return { key: val, source: 'organization' };
    }
  }

  // 4. Environment variables
  const envVar = PROVIDER_ENV_VARS[p];
  if (envVar && process.env[envVar]) {
    return { key: process.env[envVar], source: 'environment' };
  }

  return { key: null, source: 'none' };
}

function getProviderStatus(orgKeys, platformKeys) {
  const result = {};
  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    const hasOrgKey = orgKeys && orgKeys[provider];
    const hasPlatformKey = platformKeys && platformKeys[provider];
    const hasEnvKey = PROVIDER_ENV_VARS[provider] && !!process.env[PROVIDER_ENV_VARS[provider]];
    result[provider] = {
      available: !!(hasOrgKey || hasPlatformKey || hasEnvKey),
      models,
    };
  }
  return result;
}

async function withAITrackingContext(fn) {
  _lastCallMeta = { usedProvider: null, usedModel: null };
  const tracking = { usedProvider: null, usedModel: null, fallbackUsed: false, attempts: 0 };
  try {
    const result = await fn();
    tracking.usedProvider = _lastCallMeta.usedProvider;
    tracking.usedModel = _lastCallMeta.usedModel;
    tracking.attempts = 1;
    return { result, tracking };
  } catch (err) {
    tracking.usedProvider = _lastCallMeta.usedProvider;
    tracking.usedModel = _lastCallMeta.usedModel;
    tracking.attempts = 1;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Provider-specific call implementations
// ---------------------------------------------------------------------------

async function callAnthropic(apiKey, model, systemPrompt, messages) {
  if (!Anthropic) throw new Error('Anthropic SDK not installed');
  const client = new Anthropic({ apiKey });
  const mappedMessages = messages.map(m => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
  const resp = await client.messages.create({
    model: model || PROVIDER_MODELS.anthropic[0],
    max_tokens: 4096,
    system: systemPrompt || undefined,
    messages: mappedMessages,
  });
  const text = resp.content.map(b => b.type === 'text' ? b.text : '').join('');
  return text;
}

async function callOpenAI(apiKey, model, systemPrompt, messages) {
  if (!OpenAI) throw new Error('OpenAI SDK not installed');
  const client = new OpenAI({ apiKey });
  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
  allMessages.push(...messages);
  const resp = await client.chat.completions.create({
    model: model || PROVIDER_MODELS.openai[0],
    messages: allMessages,
  });
  if (!resp.choices?.[0]?.message) throw new Error('Unexpected OpenAI response format');
  return resp.choices[0].message.content;
}

async function callGemini(apiKey, model, systemPrompt, messages) {
  if (!axios) throw new Error('axios not installed');
  const m = model || PROVIDER_MODELS.gemini[0];
  const userText = messages.map(msg => msg.content).join('\n\n');
  const body = {
    contents: [{ parts: [{ text: userText }] }],
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
  const resp = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    timeout: PROVIDER_TIMEOUT_MS.gemini,
  });
  const candidates = resp.data.candidates || [];
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    return candidates[0].content.parts.map(p => p.text || '').join('');
  }
  return '';
}

async function callGroq(apiKey, model, systemPrompt, messages) {
  if (!axios) throw new Error('axios not installed');
  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
  allMessages.push(...messages);
  const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: model || PROVIDER_MODELS.groq[0],
    messages: allMessages,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: PROVIDER_TIMEOUT_MS.groq,
  });
  if (!resp.data?.choices?.[0]?.message) throw new Error('Unexpected Groq response format');
  return resp.data.choices[0].message.content;
}

async function callGrok(apiKey, model, systemPrompt, messages) {
  if (!axios) throw new Error('axios not installed');
  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
  allMessages.push(...messages);
  const resp = await axios.post('https://api.x.ai/v1/chat/completions', {
    model: model || PROVIDER_MODELS.grok[0],
    messages: allMessages,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: PROVIDER_TIMEOUT_MS.grok,
  });
  if (!resp.data?.choices?.[0]?.message) throw new Error('Unexpected Grok response format');
  return resp.data.choices[0].message.content;
}

async function callOllama(baseUrl, model, systemPrompt, messages) {
  if (!axios) throw new Error('axios not installed');
  const url = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
  allMessages.push(...messages);
  const resp = await axios.post(`${url}/api/chat`, {
    model: model || PROVIDER_MODELS.ollama[0],
    messages: allMessages,
    stream: false,
  }, { timeout: PROVIDER_TIMEOUT_MS.ollama });
  return resp.data.message ? resp.data.message.content : (resp.data.response || '');
}

// ---------------------------------------------------------------------------
// Unified call dispatcher
// ---------------------------------------------------------------------------

function callProvider(provider, apiKey, model, systemPrompt, messages) {
  const p = (provider || '').toLowerCase();
  switch (p) {
    case 'anthropic':
    case 'claude':
      return callAnthropic(apiKey, model, systemPrompt, messages);
    case 'openai': return callOpenAI(apiKey, model, systemPrompt, messages);
    case 'gemini': return callGemini(apiKey, model, systemPrompt, messages);
    case 'groq': return callGroq(apiKey, model, systemPrompt, messages);
    case 'grok':
    case 'xai':
      return callGrok(apiKey, model, systemPrompt, messages);
    case 'ollama': return callOllama(apiKey, model, systemPrompt, messages);
    default: throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function callLLM(params, systemPrompt, userPrompt) {
  const provider = (params.provider || DEFAULT_PROVIDER).toLowerCase();
  const model = params.model || (PROVIDER_MODELS[provider] ? PROVIDER_MODELS[provider][0] : null);
  const orgId = params.organizationId;

  const { key } = await resolveApiKey(provider, orgId);
  if (!key) throw new Error(`No API key configured for provider: ${provider}`);

  _lastCallMeta = { usedProvider: provider, usedModel: model };

  const messages = params.messages || [{ role: 'user', content: userPrompt }];
  return callProvider(provider, key, model, systemPrompt, messages);
}

// ---------------------------------------------------------------------------
// Chat & streaming
// ---------------------------------------------------------------------------

async function chat({ provider, model, organizationId, messages, systemPrompt }) {
  const p = (provider || DEFAULT_PROVIDER).toLowerCase();
  const m = model || (PROVIDER_MODELS[p] ? PROVIDER_MODELS[p][0] : null);
  const { key } = await resolveApiKey(p, organizationId);
  if (!key) throw new Error(`No API key configured for provider: ${p}`);

  _lastCallMeta = { usedProvider: p, usedModel: m };
  return callProvider(p, key, m, systemPrompt, messages);
}

async function* chatStream({ provider, model, organizationId, messages, systemPrompt }) {
  const p = (provider || DEFAULT_PROVIDER).toLowerCase();
  const m = model || (PROVIDER_MODELS[p] ? PROVIDER_MODELS[p][0] : null);
  const { key } = await resolveApiKey(p, organizationId);
  if (!key) throw new Error(`No API key configured for provider: ${p}`);

  _lastCallMeta = { usedProvider: p, usedModel: m };

  // Streaming for OpenAI-compatible providers
  if (p === 'openai' && OpenAI) {
    const client = new OpenAI({ apiKey: key });
    const allMessages = [];
    if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
    allMessages.push(...messages);
    const stream = await client.chat.completions.create({
      model: m,
      messages: allMessages,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
    return;
  }

  if (p === 'anthropic' && Anthropic) {
    const client = new Anthropic({ apiKey: key });
    const mappedMessages = messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));
    const stream = await client.messages.stream({
      model: m,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages: mappedMessages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta && event.delta.text) {
        yield event.delta.text;
      }
    }
    return;
  }

  // Fallback: non-streaming call, yield entire result
  const result = await callProvider(p, key, m, systemPrompt, messages);
  yield result;
}

// ---------------------------------------------------------------------------
// Org configuration helpers
// ---------------------------------------------------------------------------

async function getOrgDefaultProvider(orgId) {
  const row = await _queryOne(
    'SELECT default_provider FROM llm_configurations WHERE organization_id = $1',
    [orgId]
  );
  return row ? row.default_provider || DEFAULT_PROVIDER : DEFAULT_PROVIDER;
}

async function getOrgDefaultModel(orgId) {
  const row = await _queryOne(
    'SELECT default_model FROM llm_configurations WHERE organization_id = $1',
    [orgId]
  );
  return row ? row.default_model || null : null;
}

async function getOrgApiKey(orgId, provider) {
  const p = (provider || DEFAULT_PROVIDER).toLowerCase();
  // Ollama uses base_url, not an encrypted key column
  if (p === 'ollama') {
    const row = await _queryOne(
      'SELECT ollama_base_url FROM llm_configurations WHERE organization_id = $1',
      [orgId]
    );
    return (row && row.ollama_base_url) ? row.ollama_base_url : null;
  }
  const col = PROVIDER_KEY_COLUMNS[p];
  if (!col) return null;
  const row = await _queryOne(
    `SELECT ${col} AS enc_key FROM llm_configurations WHERE organization_id = $1`,
    [orgId]
  );
  if (!row || !row.enc_key) return null;
  return decryptKey(row.enc_key);
}

async function getPlatformApiKey(provider) {
  const p = (provider || DEFAULT_PROVIDER).toLowerCase();
  // Check platform_settings
  const row = await _queryOne(
    "SELECT setting_value FROM platform_settings WHERE setting_key = 'llm_defaults'",
    []
  );
  if (row && row.setting_value) {
    let sv;
    try {
      sv = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
    } catch (_jsonErr) {
      log('error', 'Failed to parse platform LLM defaults in getPlatformApiKey', { error: _jsonErr.message });
      sv = {};
    }
    const k = sv[`${p}_api_key`];
    if (k) return k;
  }
  // Fallback to env
  const envVar = PROVIDER_ENV_VARS[p];
  return envVar ? process.env[envVar] || null : null;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

async function logAIUsage(orgId, userId, feature, provider, model, meta = {}) {
  await _exec(
    `INSERT INTO ai_usage_log
       (organization_id, user_id, feature, provider, model, success, tokens_input, tokens_output, duration_ms, error_message, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      orgId, userId, feature,
      provider || null,
      model || null,
      meta.success !== undefined ? meta.success : true,
      meta.tokens_input || meta.tokensInput || 0,
      meta.tokens_output || meta.tokensOutput || 0,
      meta.duration_ms || meta.durationMs || 0,
      meta.error_message || meta.errorMessage || null,
    ]
  );
}

async function logAIDecision(orgId, feature, inputContext, outputText, meta = {}) {
  const inputStr = typeof inputContext === 'string' ? inputContext : JSON.stringify(inputContext);
  const outputStr = typeof outputText === 'string' ? outputText : JSON.stringify(outputText);
  const inputHash = crypto.createHash('sha256').update(inputStr).digest('hex');
  const outputHash = crypto.createHash('sha256').update(outputStr).digest('hex');
  const normalizeId = (v) => (v == null ? null : String(v));
  const correlationId = normalizeId(meta.correlation_id ?? meta.correlationId);
  const sessionId = normalizeId(meta.session_id ?? meta.sessionId);
  await _exec(
    `INSERT INTO ai_decision_log
       (organization_id, feature, input_hash, output_hash, model_version,
        correlation_id, session_id,
        data_lineage, risk_level, human_reviewed, bias_flags, bias_reviewed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      orgId, feature, inputHash, outputHash,
      meta.model_version || meta.modelVersion || null,
      correlationId,
      sessionId,
      meta.data_lineage || meta.dataLineage || null,
      meta.risk_level || meta.riskLevel || null,
      meta.human_reviewed || meta.humanReviewed || false,
      meta.bias_flags ? JSON.stringify(meta.bias_flags || meta.biasFlags) : null,
      meta.bias_reviewed || meta.biasReviewed || false,
    ]
  );
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

async function buildPersonalizedSystem(orgId, frameworkCode, mode, ragQuery, role) {
  const parts = [
    'You are ControlWeave AI, an expert Governance, Risk, and Compliance (GRC) assistant.',
    'You provide accurate, actionable, and well-structured guidance for compliance professionals.',
  ];

  if (frameworkCode) {
    parts.push(`The current compliance framework in scope is: ${frameworkCode}.`);
  }
  if (role) {
    parts.push(`The user's role is: ${role}. Tailor your responses to their level of expertise and responsibilities.`);
  }
  if (mode) {
    parts.push(`Operating mode: ${mode}.`);
  }

  // Fetch org context if available
  if (orgId) {
    const org = await _queryOne(
      'SELECT name, industry FROM organizations WHERE id = $1',
      [orgId]
    );
    if (org) {
      if (org.name) parts.push(`Organization: ${org.name}.`);
      if (org.industry) parts.push(`Industry: ${org.industry}.`);
    }
  }

  if (ragQuery) {
    parts.push(`Relevant context for this query: ${ragQuery}`);
  }

  parts.push(
    'Always cite relevant control IDs, framework sections, or regulatory references when applicable.',
    'If uncertain, clearly state your confidence level and suggest further review.'
  );

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Cache & service factory
// ---------------------------------------------------------------------------

function invalidateAICache() {
  _cache = {};
  log('info', 'AI cache invalidated');
}

async function getLLMService(orgId) {
  const provider = await getOrgDefaultProvider(orgId);
  const { key } = await resolveApiKey(provider, orgId);
  if (!key) return null;

  const p = provider.toLowerCase();
  const defaultModel = await getOrgDefaultModel(orgId);

  return {
    provider: p,
    key,
    call: (model, systemPrompt, messages) => callProvider(p, key, model, systemPrompt, messages),
    /**
     * Convenience helper for legacy single-prompt callers.
     * @param {string} prompt
     * @param {{ model?: string | null, systemPrompt?: string | null }} [options]
     * @returns {Promise<string>}
     */
    generateText: (prompt, options = {}) => callProvider(
      p,
      key,
      options.model || defaultModel || null,
      options.systemPrompt || null,
      [{ role: 'user', content: String(prompt || '') }]
    ),
  };
}

// ---------------------------------------------------------------------------
// Feature system prompts
// ---------------------------------------------------------------------------

const FEATURE_PROMPTS = {
  gapAnalysis: `You are a GRC gap analysis expert. Analyze the organization's current compliance posture against the target framework. Identify gaps, prioritize them by risk, and suggest remediation steps. Return your analysis as structured JSON with keys: "gaps" (array of { controlId, gapDescription, severity, recommendation }), "overallScore" (0-100), and "summary".`,

  crosswalk: `You are a compliance framework crosswalk specialist. Map controls between frameworks, identifying overlaps and unique requirements. Optimize the crosswalk to reduce redundant effort. Return JSON with keys: "mappings" (array of { sourceControl, targetControl, overlapPercentage, notes }), "efficiencyGain", and "recommendations".`,

  complianceForecast: `You are a predictive compliance analyst. Forecast the organization's compliance trajectory based on current trends, resource allocation, and regulatory changes. Return JSON with keys: "forecast" (array of { timeframe, complianceScore, risks, opportunities }), "keyDrivers", and "recommendations".`,

  regulatoryMonitor: `You are a regulatory intelligence analyst. Monitor and analyze regulatory changes that may affect the organization's compliance posture. Return JSON with keys: "changes" (array of { regulation, changeType, effectiveDate, impact, requiredActions }), "urgentItems", and "summary".`,

  remediationPlaybook: `You are a compliance remediation specialist. Generate a detailed, step-by-step remediation playbook for the specified control deficiency. Return JSON with keys: "steps" (array of { order, action, owner, timeline, resources, evidence }), "estimatedEffort", "riskReduction", and "dependencies".`,

  vulnerabilityRemediation: `You are a cybersecurity vulnerability remediation expert. Analyze the vulnerability and provide detailed remediation guidance. Return JSON with keys: "vulnerability" (summary), "severity", "remediationSteps" (array), "workarounds", "verificationSteps", and "references".`,

  iavmAssetAlert: `You are an IAVM (Information Assurance Vulnerability Management) specialist. Generate an asset alert for the given IAVM notice. Return JSON with keys: "alertSummary", "affectedAssets", "requiredActions" (array with timelines), "mitigations", and "complianceImpact".`,

  incidentResponse: `You are a cybersecurity incident response expert. Generate a comprehensive incident response plan for the specified incident type. Return JSON with keys: "phases" (array of { name, actions, roles, timeline }), "communicationPlan", "containmentStrategy", "recoverySteps", and "lessonsLearnedTemplate".`,

  executiveReport: `You are a GRC executive reporting specialist. Generate a concise, executive-level compliance report suitable for board presentation. Use markdown formatting with clear headers, bullet points, and key metrics. Include an executive summary, risk highlights, compliance scorecard, and strategic recommendations.`,

  riskHeatmap: `You are a risk visualization expert. Analyze the organization's risk landscape and generate data for a risk heatmap. Return JSON with keys: "risks" (array of { category, likelihood, impact, score, controls, trend }), "hotspots", "recommendations", and "overallRiskLevel".`,

  vendorRisk: `You are a third-party risk management expert. Assess the vendor's risk profile based on the provided information. Return JSON with keys: "riskScore" (0-100), "riskFactors" (array of { category, level, finding, recommendation }), "overallAssessment", "monitoringRecommendations", and "contractualSuggestions".`,

  vendorQuestionnaire: `You are a vendor assessment specialist. Generate a comprehensive vendor risk assessment questionnaire. Return JSON with keys: "sections" (array of { title, questions: [{ id, text, type, required, riskWeight }] }), "scoringMethodology", and "evaluationCriteria".`,

  questionnaireAnalysis: `You are a vendor questionnaire analysis expert. Analyze the vendor's responses to the risk assessment questionnaire. Return JSON with keys: "overallScore", "sectionScores" (array), "redFlags" (array), "strengths" (array), "gaps" (array), "recommendations", and "riskRating".`,

  vendorEvidence: `You are a vendor evidence review specialist. Analyze the submitted evidence against questionnaire responses for consistency and completeness. Return JSON with keys: "evidenceAssessment" (array of { question, evidenceProvided, adequacy, gaps }), "overallAdequacy", "missingEvidence", and "recommendations".`,

  auditReadiness: `You are an audit readiness assessment expert. Evaluate the organization's preparedness for an audit against the specified framework. Return JSON with keys: "readinessScore" (0-100), "areas" (array of { name, status, gaps, actions }), "timeline", "criticalFindings", and "recommendations".`,

  auditPbc: `You are an audit PBC (Prepared by Client) list specialist. Draft a PBC request document for the specified control. Use markdown formatting with clear sections: Request Description, Required Evidence, Due Date, Priority, Responsible Party, and Submission Instructions.`,

  auditWorkpaper: `You are an audit workpaper specialist. Draft a professional audit workpaper document. Use markdown formatting with sections: Objective, Procedure Performed, Evidence Reviewed, Test Results, Findings, and Conclusion.`,

  auditFinding: `You are an audit findings specialist. Draft a formal audit finding document. Use markdown formatting with sections: Finding Title, Control Reference, Condition, Criteria, Cause, Effect, Risk Rating, Recommendation, and Management Response Template.`,

  assetControlMapping: `You are an IT asset and control mapping specialist. Map organizational assets to relevant compliance controls. Return JSON with keys: "mappings" (array of { assetType, controls, coverageGaps }), "unmappedAssets", "recommendations", and "priorityActions".`,

  shadowIT: `You are a shadow IT detection specialist. Analyze the organization's environment for unauthorized or unmanaged IT resources. Return JSON with keys: "findings" (array of { type, description, riskLevel, evidence }), "riskSummary", "recommendations", and "governanceGaps".`,

  aiGovernance: `You are an AI governance and ethics specialist. Evaluate the organization's AI usage against governance frameworks and ethical guidelines. Return JSON with keys: "assessment" (array of { area, status, findings }), "complianceGaps", "ethicalConcerns", "recommendations", and "governanceMaturity".`,

  complianceQuery: `You are a compliance knowledge expert. Answer the compliance question accurately and thoroughly. Cite relevant standards, regulations, and control frameworks. Use markdown formatting for clarity.`,

  trainingRecommendation: `You are a compliance training specialist. Recommend training programs based on the organization's compliance gaps and roles. Return JSON with keys: "recommendations" (array of { title, audience, priority, duration, topics, objectives }), "trainingPlan", and "complianceAlignment".`,

  evidenceSuggestion: `You are a compliance evidence specialist. Suggest appropriate evidence artifacts for the specified control. Return JSON with keys: "suggestions" (array of { type, description, source, frequency, automatable }), "bestPractices", and "commonPitfalls".`,

  controlAnalysis: `You are a compliance control analysis expert. Perform a detailed analysis of the specified control's design effectiveness, implementation status, and operational effectiveness. Return JSON with keys: "controlSummary", "designEffectiveness", "implementationStatus", "operationalEffectiveness", "gaps", "recommendations", and "riskRating".`,

  testProcedures: `You are an audit test procedure specialist. Generate detailed test procedures for the specified control. Return JSON with keys: "procedures" (array of { id, objective, steps, expectedResults, sampleSize, evidenceRequired }), "testingStrategy", and "reportingTemplate".`,

  assetRisk: `You are an IT asset risk analyst. Analyze the risk profile of the specified asset. Return JSON with keys: "assetSummary", "riskFactors" (array of { factor, severity, likelihood, impact }), "vulnerabilities", "controls", "overallRisk", and "recommendations".`,

  policyGeneration: `You are a compliance policy drafting specialist. Generate a comprehensive, professional policy document for the specified policy type. Use markdown formatting with standard policy sections: Purpose, Scope, Policy Statement, Roles and Responsibilities, Procedures, Compliance, Exceptions, and Revision History Template.`,
};

// ---------------------------------------------------------------------------
// AI Feature Functions
// ---------------------------------------------------------------------------

async function generateGapAnalysis(params) {
  return callLLM(params, FEATURE_PROMPTS.gapAnalysis,
    `Perform a gap analysis for organization ${params.organizationId}. Framework: ${params.frameworkCode || 'general'}. Analyze current compliance posture and identify gaps.`);
}

async function optimizeCrosswalk(params) {
  return callLLM(params, FEATURE_PROMPTS.crosswalk,
    `Optimize the compliance framework crosswalk for organization ${params.organizationId}. Identify control mappings and efficiency opportunities.`);
}

async function forecastCompliance(params) {
  return callLLM(params, FEATURE_PROMPTS.complianceForecast,
    `Forecast compliance trajectory for organization ${params.organizationId}. Analyze current trends and predict future compliance posture.`);
}

async function monitorRegulatoryChanges(params) {
  const frameworks = params.frameworks ? (Array.isArray(params.frameworks) ? params.frameworks.join(', ') : params.frameworks) : 'all applicable frameworks';
  return callLLM(params, FEATURE_PROMPTS.regulatoryMonitor,
    `Monitor regulatory changes affecting these frameworks: ${frameworks}. Identify recent or upcoming changes and their impact.`);
}

async function generateRemediationPlaybook(params) {
  return callLLM(params, FEATURE_PROMPTS.remediationPlaybook,
    `Generate a remediation playbook for control ${params.controlId}. Provide step-by-step guidance to address the deficiency.`);
}

async function generateVulnerabilityRemediation(params) {
  return callLLM(params, FEATURE_PROMPTS.vulnerabilityRemediation,
    `Provide remediation guidance for vulnerability ${params.vulnerabilityId}. Include step-by-step fix instructions and verification.`);
}

async function generateIAVMAssetAlert(params) {
  return callLLM(params, FEATURE_PROMPTS.iavmAssetAlert,
    `Generate an IAVM asset alert for: ID=${params.iavmId}, Title="${params.title}", Description="${params.description}", Affected Products: ${params.affectedProducts || 'N/A'}, Severity: ${params.severity || 'N/A'}.`);
}

async function generateIncidentResponsePlan(params) {
  return callLLM(params, FEATURE_PROMPTS.incidentResponse,
    `Generate a comprehensive incident response plan for incident type: ${params.incidentType}. Include all phases from detection through recovery.`);
}

async function generateExecutiveReport(params) {
  return callLLM(params, FEATURE_PROMPTS.executiveReport,
    `Generate an executive-level compliance report for organization ${params.organizationId}. Summarize the current compliance posture, key risks, and strategic recommendations.`);
}

async function generateRiskHeatmap(params) {
  return callLLM(params, FEATURE_PROMPTS.riskHeatmap,
    `Generate risk heatmap data for organization ${params.organizationId}. Analyze risks across all categories and provide severity assessments.`);
}

async function assessVendorRisk(params) {
  const vendorInfo = typeof params.vendorInfo === 'string' ? params.vendorInfo : JSON.stringify(params.vendorInfo);
  return callLLM(params, FEATURE_PROMPTS.vendorRisk,
    `Assess the risk profile for this vendor: ${vendorInfo}`);
}

async function generateVendorQuestionnaire(params) {
  const vendorInfo = typeof params.vendorInfo === 'string' ? params.vendorInfo : JSON.stringify(params.vendorInfo);
  return callLLM(params, FEATURE_PROMPTS.vendorQuestionnaire,
    `Generate a vendor risk assessment questionnaire for: ${vendorInfo}`);
}

async function analyzeQuestionnaireResponses(params) {
  const vendorInfo = typeof params.vendorInfo === 'string' ? params.vendorInfo : JSON.stringify(params.vendorInfo);
  const questions = typeof params.questions === 'string' ? params.questions : JSON.stringify(params.questions);
  const responses = typeof params.responses === 'string' ? params.responses : JSON.stringify(params.responses);
  return callLLM(params, FEATURE_PROMPTS.questionnaireAnalysis,
    `Analyze questionnaire responses for vendor: ${vendorInfo}\n\nQuestions: ${questions}\n\nResponses: ${responses}`);
}

async function analyzeVendorEvidence(params) {
  const vendorInfo = typeof params.vendorInfo === 'string' ? params.vendorInfo : JSON.stringify(params.vendorInfo);
  const questions = typeof params.questions === 'string' ? params.questions : JSON.stringify(params.questions);
  const responses = typeof params.responses === 'string' ? params.responses : JSON.stringify(params.responses);
  const evidenceList = typeof params.evidenceList === 'string' ? params.evidenceList : JSON.stringify(params.evidenceList);
  return callLLM(params, FEATURE_PROMPTS.vendorEvidence,
    `Review vendor evidence for: ${vendorInfo}\n\nQuestionnaire: ${params.questionnaireTitle || 'N/A'}\nQuestions: ${questions}\nResponses: ${responses}\nEvidence: ${evidenceList}`);
}

async function assessAuditReadiness(params) {
  return callLLM(params, FEATURE_PROMPTS.auditReadiness,
    `Assess audit readiness for framework: ${params.framework}. Evaluate preparedness across all control families.`);
}

async function generateAuditPbcDraft(params) {
  return callLLM(params, FEATURE_PROMPTS.auditPbc,
    `Draft a PBC request for control ${params.controlId}, framework ${params.frameworkCode || 'N/A'}. Context: ${params.requestContext || 'Standard audit request'}. Due date: ${params.dueDate || 'TBD'}. Priority: ${params.priority || 'Medium'}.`);
}

async function generateAuditWorkpaperDraft(params) {
  return callLLM(params, FEATURE_PROMPTS.auditWorkpaper,
    `Draft an audit workpaper for control ${params.controlId}.\nObjective: ${params.objective || 'N/A'}\nProcedure: ${params.procedurePerformed || 'N/A'}\nEvidence Summary: ${params.evidenceSummary || 'N/A'}\nTest Outcome: ${params.testOutcome || 'N/A'}`);
}

async function generateAuditFindingDraft(params) {
  return callLLM(params, FEATURE_PROMPTS.auditFinding,
    `Draft an audit finding for control ${params.controlId}.\nIssue: ${params.issueSummary || 'N/A'}\nEvidence: ${params.evidenceSummary || 'N/A'}\nSeverity Hint: ${params.severityHint || 'Medium'}\nRecommendation Scope: ${params.recommendationScope || 'Standard'}`);
}

async function mapAssetsToControls(params) {
  return callLLM(params, FEATURE_PROMPTS.assetControlMapping,
    `Map IT assets to compliance controls for organization ${params.organizationId}. Identify coverage gaps and prioritize remediation.`);
}

async function detectShadowIT(params) {
  return callLLM(params, FEATURE_PROMPTS.shadowIT,
    `Detect potential shadow IT in organization ${params.organizationId}. Analyze for unauthorized resources and governance gaps.`);
}

async function checkAIGovernance(params) {
  return callLLM(params, FEATURE_PROMPTS.aiGovernance,
    `Evaluate AI governance posture for organization ${params.organizationId}. Assess against ethical guidelines and governance frameworks.`);
}

async function queryCompliance(params) {
  return callLLM(params, FEATURE_PROMPTS.complianceQuery,
    params.question || 'Provide a general compliance overview.');
}

async function recommendTraining(params) {
  return callLLM(params, FEATURE_PROMPTS.trainingRecommendation,
    `Recommend compliance training programs for organization ${params.organizationId}. Consider current gaps and role-based requirements.`);
}

async function suggestEvidence(params) {
  return callLLM(params, FEATURE_PROMPTS.evidenceSuggestion,
    `Suggest appropriate evidence artifacts for control ${params.controlId}. Include artifact types, sources, and collection frequency.`);
}

async function analyzeControl(params) {
  return callLLM(params, FEATURE_PROMPTS.controlAnalysis,
    `Analyze control ${params.controlId} for organization ${params.organizationId}. Evaluate design, implementation, and operational effectiveness.`);
}

async function generateTestProcedures(params) {
  return callLLM(params, FEATURE_PROMPTS.testProcedures,
    `Generate test procedures for control ${params.controlId}. Include objectives, steps, expected results, and evidence requirements.`);
}

async function analyzeAssetRisk(params) {
  return callLLM(params, FEATURE_PROMPTS.assetRisk,
    `Analyze the risk profile for asset ${params.assetId} in organization ${params.organizationId}. Evaluate vulnerabilities, controls, and overall risk.`);
}

async function generatePolicy(params) {
  return callLLM(params, FEATURE_PROMPTS.policyGeneration,
    `Generate a comprehensive ${params.policyType} policy for organization ${params.organizationId}. Follow industry best practices and regulatory requirements.`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Core infrastructure
  getUsageLimit,
  getUsageCount,
  resolveApiKey,
  getProviderStatus,
  withAITrackingContext,
  chatStream,
  chat,
  getOrgDefaultProvider,
  getOrgDefaultModel,
  getOrgApiKey,
  getPlatformApiKey,
  logAIUsage,
  logAIDecision,
  buildPersonalizedSystem,
  invalidateAICache,
  getLLMService,

  // AI feature functions
  generateGapAnalysis,
  optimizeCrosswalk,
  forecastCompliance,
  monitorRegulatoryChanges,
  generateRemediationPlaybook,
  generateVulnerabilityRemediation,
  generateIAVMAssetAlert,
  generateIncidentResponsePlan,
  generateExecutiveReport,
  generateRiskHeatmap,
  assessVendorRisk,
  generateVendorQuestionnaire,
  analyzeQuestionnaireResponses,
  analyzeVendorEvidence,
  assessAuditReadiness,
  generateAuditPbcDraft,
  generateAuditWorkpaperDraft,
  generateAuditFindingDraft,
  mapAssetsToControls,
  detectShadowIT,
  checkAIGovernance,
  queryCompliance,
  recommendTraining,
  suggestEvidence,
  analyzeControl,
  generateTestProcedures,
  analyzeAssetRisk,
  generatePolicy,

  // Internal utilities exposed for key management
  encryptKey,
  decryptKey,
  callProvider,

  // Provider metadata
  PROVIDER_MODELS,
};
