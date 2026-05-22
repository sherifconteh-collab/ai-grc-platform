// @tier: community
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const pool = require('../config/database');
const { getAiUsageLimit } = require('../config/tierPolicy');
const { buildOrgContext, buildFrameworkGuardrails } = require('./orgContextService');
const { hasFeatureSchema } = require('./llmSchemas');
let _orgRagService = null;
const buildRagContext = (...args) => {
  if (!_orgRagService) _orgRagService = require('./orgRagService');
  return _orgRagService.buildRagContext(...args);
};
const { decrypt } = require('../utils/encrypt');
const aiSecurity = require('../utils/aiSecurity');
const path = require('path');

// ---------------------------------------------------------------------------
// Few-shot exemplar loader
// Loads curated examples from services/aiExemplars/ JSON files.
// Each file contains 2-3 examples that are injected into AI prompts to set
// the quality bar and guide output structure.
// ---------------------------------------------------------------------------
const EXEMPLAR_CACHE = new Map();

function loadExemplars(feature) {
  if (EXEMPLAR_CACHE.has(feature)) return EXEMPLAR_CACHE.get(feature);
  try {
    const filePath = path.join(__dirname, 'aiExemplars', `${feature}.json`);
    const data = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    // Filter out non-exemplar entries (e.g. metadata entries used to carry
    // IP-hygiene scanner directives). Real exemplars must have an `output` field.
    const exemplars = (Array.isArray(data) ? data : [])
      .filter(e => e && typeof e === 'object' && 'output' in e);
    EXEMPLAR_CACHE.set(feature, exemplars);
    return exemplars;
  } catch {
    EXEMPLAR_CACHE.set(feature, []);
    return [];
  }
}

/**
 * Build a few-shot exemplar block to prepend to the user message.
 * Includes a chain-of-thought reasoning instruction before output.
 *
 * @param {string} feature - Feature key (must match an aiExemplars/*.json file)
 * @param {number} [maxExemplars=2] - How many examples to include
 * @returns {string} Formatted exemplar + CoT block, or empty string if no exemplars
 */
function buildFewShotBlock(feature, maxExemplars = 2) {
  const exemplars = loadExemplars(feature).slice(0, maxExemplars);
  if (exemplars.length === 0) return '';

  const exampleLines = exemplars.map((ex, i) => {
    const outputStr = typeof ex.output === 'object'
      ? JSON.stringify(ex.output, null, 2)
      : String(ex.output);
    return `--- EXAMPLE ${i + 1} ---\nContext: ${ex.description || ex.input_summary || ''}\nHigh-quality output:\n${outputStr}`;
  }).join('\n\n');

  return `\n\n## Quality Exemplars\nThe following are examples of high-quality outputs for this type of analysis. Use them to calibrate your response quality, depth, and structure — do NOT copy them verbatim.\n\n${exampleLines}\n\n## Reasoning Approach\nBefore writing your response, think through:\n1. Scope and boundaries of the analysis\n2. Key assumptions about the organization's maturity\n3. Control intent and why gaps create real risk\n4. Priority ordering by business impact and remediation effort\n5. What specific evidence an auditor would need to close each gap\n\nThen produce your structured output.\n`;
}

// Set PHI_REDACT_ONLY=true to redact PHI inline instead of blocking the request.
// WARNING: PHI_REDACT_ONLY=true may not satisfy all HIPAA requirements — use only
// when routing exclusively to HIPAA-BAA-covered providers.
const PHI_REDACT_ONLY = process.env.PHI_REDACT_ONLY === 'true';

const GEMINI_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const XAI_API_BASE = process.env.XAI_API_BASE || 'https://api.x.ai/v1';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// ---------- Provider + task-profile configuration (extracted to ./ai/providerConfig) ----------
const {
  PROVIDERS,
  TASK_PROFILES,
  FEATURE_TASK_PROFILE,
  resolveTaskModel,
} = require('./ai/providerConfig');


// ---------- Org default provider ----------
const VALID_PROVIDERS = new Set(['claude', 'openai', 'gemini', 'grok', 'groq', 'ollama']);
const PROVIDER_SETTING_KEY_MAP = {
  claude: 'anthropic_api_key',
  openai: 'openai_api_key',
  gemini: 'gemini_api_key',
  grok: 'xai_api_key',
  groq: 'groq_api_key',
  ollama: 'ollama_base_url'
};
const SETTING_KEY_PROVIDER_MAP = Object.fromEntries(
  Object.entries(PROVIDER_SETTING_KEY_MAP).map(([provider, settingKey]) => [settingKey, provider])
);
const PLATFORM_API_KEYS_CACHE_KEY = 'platform:all';
const PROVIDER_FALLBACK_ORDER = ['claude', 'openai', 'grok', 'gemini', 'groq', 'ollama'];
const aiTrackingStorage = new AsyncLocalStorage();

async function withAITrackingContext(fn) {
  const base = {
    attempts: [],
    usedProvider: null,
    usedModel: null,
    fallbackUsed: false
  };
  return aiTrackingStorage.run(base, async () => {
    const result = await fn();
    const tracking = aiTrackingStorage.getStore() || base;
    return {
      result,
      tracking: {
        ...tracking,
        attempts: Array.isArray(tracking.attempts) ? [...tracking.attempts] : []
      }
    };
  });
}

function getAITrackingContext() {
  return aiTrackingStorage.getStore() || null;
}

function recordAIAttempt(provider, model, available = true) {
  const ctx = aiTrackingStorage.getStore();
  if (!ctx) return;
  ctx.attempts.push({
    provider,
    model: model || null,
    available: !!available,
    at: new Date().toISOString()
  });
}

function markAISuccess(provider, model, requestedProvider) {
  const ctx = aiTrackingStorage.getStore();
  if (!ctx) return;
  ctx.usedProvider = provider;
  ctx.usedModel = model || null;
  ctx.fallbackUsed = !!requestedProvider && provider !== requestedProvider;
}

function getDefaultModelForProvider(provider) {
  if (provider === 'claude') return 'claude-haiku-4-5-20251001';
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'grok') return 'grok-3-latest';
  if (provider === 'gemini') return 'gemini-2.5-flash';
  if (provider === 'groq') return 'llama-3.3-70b-versatile';
  if (provider === 'ollama') return 'llama3.2';
  return null;
}

async function getOrgDefaultProvider(organizationId) {
  try {
    const result = await pool.query(
      `SELECT setting_value FROM organization_settings
       WHERE organization_id = $1 AND setting_key = 'default_provider' LIMIT 1`,
      [organizationId]
    );
    const value = result.rows[0]?.setting_value;
    if (VALID_PROVIDERS.has(value)) {
      return value;
    }
    return 'claude';
  } catch {
    return 'claude';
  }
}

async function getPlatformDefaultProvider() {
  try {
    const result = await pool.query(
      `SELECT setting_value FROM platform_settings
       WHERE setting_key = 'default_provider'
       LIMIT 1`
    );
    const value = result.rows[0]?.setting_value;
    return VALID_PROVIDERS.has(value) ? value : 'claude';
  } catch {
    return 'claude';
  }
}

/**
 * Returns the configured default model for an organization, falling back to
 * the platform-level default model setting, then null (provider built-in default).
 * @param {string} organizationId
 * @returns {Promise<string|null>}
 */
async function getOrgDefaultModel(organizationId) {
  try {
    if (organizationId) {
      const orgResult = await pool.query(
        `SELECT setting_value FROM organization_settings
         WHERE organization_id = $1 AND setting_key = 'default_model' LIMIT 1`,
        [organizationId]
      );
      const orgModel = orgResult.rows[0]?.setting_value;
      if (orgModel) return orgModel;
    }

    const platformResult = await pool.query(
      `SELECT setting_value FROM platform_settings
       WHERE setting_key = 'default_model' LIMIT 1`
    );
    const platformModel = platformResult.rows[0]?.setting_value;
    return platformModel || null;
  } catch {
    return null;
  }
}

/**
 * In-memory cache for API keys with 5-minute TTL
 * Reduces database queries for frequently accessed keys
 */
const apiKeyCache = new Map();
const API_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clears API key cache for an organization (call on key updates)
 * @param {string} organizationId
 */
function invalidateApiKeyCache(organizationId) {
  for (const provider of Object.keys(PROVIDER_SETTING_KEY_MAP)) {
    const cacheKey = `${organizationId}:${provider}`;
    apiKeyCache.delete(cacheKey);
  }
  apiKeyCache.delete(`${organizationId}:all`);
}

function invalidatePlatformApiKeyCache() {
  apiKeyCache.delete(PLATFORM_API_KEYS_CACHE_KEY);
  for (const provider of Object.keys(PROVIDER_SETTING_KEY_MAP)) {
    apiKeyCache.delete(`platform:${provider}`);
  }
}

/**
 * Get all API keys for an organization in a single batched query
 * Returns a map of provider -> decrypted API key
 * @param {string} organizationId
 * @returns {Promise<Object>} Map of provider names to API keys
 */
async function getAllOrgApiKeys(organizationId) {
  const cacheKey = `${organizationId}:all`;
  const cached = apiKeyCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < API_KEY_CACHE_TTL_MS)) {
    return cached.data;
  }
  
  const settingKeys = Object.keys(SETTING_KEY_PROVIDER_MAP);
  const result = await pool.query(
    'SELECT setting_key, setting_value, is_encrypted FROM organization_settings WHERE organization_id = $1 AND setting_key = ANY($2)',
    [organizationId, settingKeys]
  );

  const apiKeys = {};
  for (const row of result.rows) {
    const provider = SETTING_KEY_PROVIDER_MAP[row.setting_key];
    if (provider) {
      apiKeys[provider] = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
    }
  }

  // Cache the result
  apiKeyCache.set(cacheKey, { data: apiKeys, timestamp: Date.now() });
  return apiKeys;
}

async function getAllPlatformApiKeys() {
  const cached = apiKeyCache.get(PLATFORM_API_KEYS_CACHE_KEY);
  if (cached && (Date.now() - cached.timestamp < API_KEY_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const settingKeys = Object.keys(SETTING_KEY_PROVIDER_MAP);
    const result = await pool.query(
      'SELECT setting_key, setting_value, is_encrypted FROM platform_settings WHERE setting_key = ANY($1)',
      [settingKeys]
    );

    const apiKeys = {};
    for (const row of result.rows) {
      const provider = SETTING_KEY_PROVIDER_MAP[row.setting_key];
      if (provider) {
        apiKeys[provider] = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
      }
    }

    apiKeyCache.set(PLATFORM_API_KEYS_CACHE_KEY, { data: apiKeys, timestamp: Date.now() });
    return apiKeys;
  } catch {
    return {};
  }
}

async function getPlatformApiKey(provider) {
  if (!PROVIDER_SETTING_KEY_MAP[provider]) return null;

  const cacheKey = `platform:${provider}`;
  const cached = apiKeyCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < API_KEY_CACHE_TTL_MS)) {
    return cached.data;
  }

  const allKeys = await getAllPlatformApiKeys();
  const apiKey = allKeys[provider] || null;
  apiKeyCache.set(cacheKey, { data: apiKey, timestamp: Date.now() });
  return apiKey;
}

// ---------- BYOK: Fetch user-provided keys from org settings ----------
async function getOrgApiKey(organizationId, provider) {
  // Check cache first
  const cacheKey = `${organizationId}:${provider}`;
  const cached = apiKeyCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < API_KEY_CACHE_TTL_MS)) {
    return cached.data;
  }

  const settingKey = PROVIDER_SETTING_KEY_MAP[provider];
  if (!settingKey) return null;

  const result = await pool.query(
    'SELECT setting_value, is_encrypted FROM organization_settings WHERE organization_id = $1 AND setting_key = $2',
    [organizationId, settingKey]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  // Decrypt if the value was stored with AES-256-GCM encryption.
  // decrypt() gracefully returns plain-text for legacy unencrypted rows.
  const apiKey = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
  
  // Cache the result
  apiKeyCache.set(cacheKey, { data: apiKey, timestamp: Date.now() });
  return apiKey;
}

async function resolveApiKey(provider, organizationId) {
  if (!PROVIDER_SETTING_KEY_MAP[provider]) {
    return { key: null, source: null };
  }

  if (organizationId) {
    const orgKey = await getOrgApiKey(organizationId, provider);
    if (orgKey) {
      return { key: orgKey, source: 'organization' };
    }
  }

  return { key: null, source: null };
}

function getClient(provider, orgApiKey) {
  if (provider === 'claude') {
    if (!orgApiKey) return null;
    return new Anthropic.default({ apiKey: orgApiKey });
  }
  if (provider === 'openai') {
    if (!orgApiKey) return null;
    return new OpenAI.default({ apiKey: orgApiKey });
  }
  if (provider === 'grok') {
    if (!orgApiKey) return null;
    return new OpenAI.default({ apiKey: orgApiKey, baseURL: XAI_API_BASE });
  }
  if (provider === 'gemini') {
    return orgApiKey ? { apiKey: orgApiKey } : null;
  }
  if (provider === 'groq') {
    if (!orgApiKey) return null;
    return new OpenAI.default({ apiKey: orgApiKey, baseURL: GROQ_API_BASE });
  }
  if (provider === 'ollama') {
    if (!orgApiKey) return null;
    // orgApiKey is the base URL for Ollama; Ollama ignores the Authorization header
    return new OpenAI.default({ apiKey: 'ollama', baseURL: orgApiKey });
  }
  return null;
}

function buildProviderAttemptChain(primaryProvider) {
  const chain = [];
  const seen = new Set();

  if (primaryProvider && VALID_PROVIDERS.has(primaryProvider)) {
    chain.push(primaryProvider);
    seen.add(primaryProvider);
  }

  for (const provider of PROVIDER_FALLBACK_ORDER) {
    if (seen.has(provider)) continue;
    chain.push(provider);
    seen.add(provider);
  }

  return chain;
}

function isRetryableProviderError(err) {
  const message = (err && err.message ? String(err.message) : '').toLowerCase();
  return (
    message.includes('quota exceeded') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('temporarily unavailable') ||
    message.includes('timed out') ||
    message.includes('status 429') ||
    message.includes('status 503')
  );
}

function buildNoKeyError(provider) {
  const err = new Error(`No API key configured for ${provider}. Add one in Settings > LLM Configuration.`);
  err.statusCode = 400;
  return err;
}

async function executeProviderChat({ provider, client, model, messages, systemPrompt, maxTokens, temperature, jsonMode = false }) {
  if (provider === 'claude') {
    const resp = await client.messages.create({
      model: model || getDefaultModelForProvider('claude'),
      max_tokens: maxTokens,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      system: systemPrompt || 'You are an expert GRC (Governance, Risk, and Compliance) analyst.',
      messages
    });
    return resp.content[0].text;
  }

  if (provider === 'openai') {
    const oaiMessages = [];
    if (systemPrompt) oaiMessages.push({ role: 'system', content: systemPrompt });
    oaiMessages.push(...messages);
    const resp = await client.chat.completions.create({
      model: model || getDefaultModelForProvider('openai'),
      max_tokens: maxTokens,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: oaiMessages
    });
    return resp.choices[0].message.content;
  }

  if (provider === 'grok') {
    const grokMessages = [];
    if (systemPrompt) grokMessages.push({ role: 'system', content: systemPrompt });
    grokMessages.push(...messages);
    const resp = await client.chat.completions.create({
      model: model || getDefaultModelForProvider('grok'),
      max_tokens: maxTokens,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: grokMessages
    });
    return resp.choices[0].message.content;
  }

  if (provider === 'gemini') {
    const chosenModel = model || getDefaultModelForProvider('gemini');
    const contents = messages.map((message) => {
      // Flatten content to a plain string — array blocks would produce "[object Object]" via String()
      let text;
      if (typeof message.content === 'string') {
        text = message.content;
      } else if (Array.isArray(message.content)) {
        text = message.content.map(b => {
          if (typeof b === 'string') return b.trim();
          if (b && typeof b.text === 'string') return b.text.trim();
          return '';
        }).filter(s => s).join(' ');
      } else {
        text = message.content != null ? String(message.content) : '';
      }
      return {
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }]
      };
    });

    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(jsonMode ? { responseMimeType: 'application/json' } : {})
      }
    };

    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(chosenModel)}:generateContent?key=${client.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      let errorText = `Gemini request failed with status ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error?.message) {
          errorText = errorBody.error.message;
        }
      } catch {
      }
      throw new Error(errorText);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return text;
  }

  if (provider === 'groq') {
    const groqMessages = [];
    if (systemPrompt) groqMessages.push({ role: 'system', content: systemPrompt });
    groqMessages.push(...messages);
    const resp = await client.chat.completions.create({
      model: model || getDefaultModelForProvider('groq'),
      max_tokens: maxTokens,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: groqMessages
    });
    return resp.choices[0].message.content;
  }

  if (provider === 'ollama') {
    const ollamaMessages = [];
    if (systemPrompt) ollamaMessages.push({ role: 'system', content: systemPrompt });
    ollamaMessages.push(...messages);
    const resp = await client.chat.completions.create({
      model: model || getDefaultModelForProvider('ollama'),
      max_tokens: maxTokens,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: ollamaMessages
    });
    return resp.choices[0].message.content;
  }

  throw new Error('Unsupported provider');
}

// ---------- Retry utilities ----------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const AI_MAX_RETRIES = Math.max(0, parseInt(process.env.AI_MAX_RETRIES || '2', 10));
const AI_RETRY_BASE_DELAY_MS = Math.max(100, parseInt(process.env.AI_RETRY_BASE_DELAY_MS || '1000', 10));

// ---------- AIDEFEND shared pipeline helpers ----------

/**
 * Sanitize all user-role messages in an LLM messages array.
 * Enforces per-message input size limits and handles string, array-block,
 * and other content types consistently for both sync and streaming paths.
 *
 * @param {Array}  messages      - Raw messages array
 * @param {string} organizationId - Used in audit log warnings
 * @returns {Array} Sanitized messages (non-user messages are returned unchanged)
 */
function sanitizeUserMessages(messages, organizationId) {
  return messages.map(msg => {
    if (msg.role !== 'user') return msg;

    if (typeof msg.content === 'string') {
      const { text, truncated } = aiSecurity.sanitizeInput(msg.content);
      if (truncated) {
        console.warn(`[aiSecurity] User message truncated to ${aiSecurity.MAX_INPUT_CHARS} chars (org=${organizationId})`);
      }
      return { ...msg, content: text };
    }

    if (Array.isArray(msg.content)) {
      const sanitizedBlocks = msg.content.map(block => {
        if (typeof block === 'string') {
          const { text, truncated } = aiSecurity.sanitizeInput(block);
          if (truncated) {
            console.warn(`[aiSecurity] User content block truncated to ${aiSecurity.MAX_INPUT_CHARS} chars (org=${organizationId})`);
          }
          return text;
        }
        if (block && typeof block.text === 'string') {
          const { text, truncated } = aiSecurity.sanitizeInput(block.text);
          if (truncated) {
            console.warn(`[aiSecurity] User content block truncated to ${aiSecurity.MAX_INPUT_CHARS} chars (org=${organizationId})`);
          }
          return truncated ? { ...block, text } : block;
        }
        return block;
      });
      return { ...msg, content: sanitizedBlocks };
    }

    if (msg.content != null) {
      const { text, truncated } = aiSecurity.sanitizeInput(String(msg.content));
      if (truncated) {
        console.warn(`[aiSecurity] User message (non-string content) truncated to ${aiSecurity.MAX_INPUT_CHARS} chars (org=${organizationId})`);
      }
      return { ...msg, content: text };
    }

    return msg;
  });
}

/**
 * AIDEFEND: Privacy Controls — apply PII/PHI detection, blocking, and redaction
 * to a set of already-sanitized messages and an optional system prompt.
 *
 * For user messages:
 *   - PHI triggers a hard block (HTTP 422) unless PHI_REDACT_ONLY is set.
 *   - PII (and PHI when PHI_REDACT_ONLY=true) is redacted inline.
 *
 * For the system prompt:
 *   - Always redacted (never blocked) since it is platform-authored content.
 *
 * @param {Array}  sanitizedMessages - Already input-sanitized messages array
 * @param {string} systemPrompt      - Optional system prompt text
 * @param {string} organizationId    - Used in audit log warnings/errors
 * @returns {{ messages: Array, systemPrompt: string }}
 * @throws If PHI is detected and PHI_REDACT_ONLY is false
 */
function applyPrivacyControls(sanitizedMessages, systemPrompt, organizationId) {
  // Scan user messages for PII and PHI
  const piiPhiScan = aiSecurity.scanMessagesForPiiPhi(sanitizedMessages);

  if (piiPhiScan.hasPhi && !PHI_REDACT_ONLY) {
    const types = piiPhiScan.phiTypes.join(', ');
    console.error(`[aiSecurity] PHI detected in LLM input — request blocked (org=${organizationId}, types=${types})`);
    const err = new Error(
      `Request contains Protected Health Information (PHI): ${types}. ` +
      'Transmitting PHI to external AI providers is not permitted. ' +
      'Remove all health-related identifiers before querying the AI assistant.'
    );
    err.status = 422;
    err.statusCode = 422;
    err.code = 'PHI_DETECTED';
    throw err;
  }

  let messages = sanitizedMessages;
  if (piiPhiScan.hasPii || (piiPhiScan.hasPhi && PHI_REDACT_ONLY)) {
    const { messages: redacted, piiTypes, phiTypes } = aiSecurity.redactMessagesForPiiPhi(sanitizedMessages);
    messages = redacted;
    if (piiTypes.length > 0) {
      console.warn(`[aiSecurity] PII redacted before LLM dispatch (org=${organizationId}, types=${piiTypes.join(', ')})`);
    }
    if (phiTypes.length > 0) {
      console.warn(`[aiSecurity] PHI redacted before LLM dispatch (org=${organizationId}, types=${phiTypes.join(', ')})`);
    }
  }

  // Scan systemPrompt for PII/PHI — platform-authored but may include RAG/org context
  // containing sensitive data. Always redact (never block) since this is not user input.
  // Call redactPiiPhi() directly and use its `redacted` flag to avoid scanning twice.
  let safeSystemPrompt = systemPrompt;
  if (systemPrompt) {
    const { text: redactedSp, redacted, piiTypes: spPii, phiTypes: spPhi } = aiSecurity.redactPiiPhi(systemPrompt);
    if (redacted) {
      safeSystemPrompt = redactedSp;
      const all = [...spPii, ...spPhi].join(', ');
      console.warn(`[aiSecurity] PII/PHI redacted from systemPrompt before LLM dispatch (org=${organizationId}, types=${all})`);
    }
  }

  return { messages, systemPrompt: safeSystemPrompt };
}

// ---------- Core chat function ----------
// Default maxTokens reduced from 4096 to 2048 for token optimization
async function chat({ provider = 'claude', model, messages, systemPrompt, organizationId, maxTokens = 2048, feature = null, temperature: callerTemperature, jsonMode: callerJsonMode }) {
  // Apply task-profile model tiering when no explicit model is supplied.
  // The caller can pass `feature` (e.g. 'gap_analysis') to get the right
  // model tier for the task without hard-coding model names in every function.
  // `temperature` is ALWAYS resolved from the task profile when a feature is
  // supplied, even when the model is overridden — a custom model still
  // benefits from the right temperature for the task type.
  let resolvedTemperature = typeof callerTemperature === 'number' ? callerTemperature : undefined;
  if (feature) {
    const orgModel = await getOrgDefaultModel(organizationId).catch(() => null);
    const resolved = resolveTaskModel(provider, feature, model || null, orgModel);
    if (!model && resolved.model) {
      model = resolved.model;
    }
    if (resolvedTemperature === undefined && typeof resolved.temperature === 'number') {
      resolvedTemperature = resolved.temperature;
    }
  }
  // Force JSON output on providers that support response_format / responseMimeType
  // when the feature has a registered schema (Phase 1.2). Claude does not set a
  // response_format — the schema + retry guard in aiHandler() handles Claude.
  const jsonMode = typeof callerJsonMode === 'boolean'
    ? callerJsonMode
    : hasFeatureSchema(feature);
  // ── AIDEFEND: Adversarial Input Defense ─────────────────────────────────
  // Validate messages array before processing (prevents TypeError on non-array input).
  if (!Array.isArray(messages)) {
    const err = new Error('messages must be an array');
    err.statusCode = 400;
    throw err;
  }

  // Enforce per-message input size limits (Privacy and Information Controls).
  // Sanitize/truncate BEFORE injection scanning to bound CPU cost and avoid
  // scanning attacker-supplied oversized payloads.
  const sanitizedMessages = sanitizeUserMessages(messages, organizationId);

  // Scan sanitized messages for prompt injection / adversarial patterns
  const injectionScan = aiSecurity.scanMessages(sanitizedMessages);
  if (injectionScan.detected) {
    const labels = [...new Set(injectionScan.threats.map(t => t.label))].join(', ');
    console.warn(`[aiSecurity] Prompt injection detected (org=${organizationId}, types=${labels})`);
  }

  // ── AIDEFEND: Privacy Controls — PII/PHI Detection & Redaction ──────────
  // Scan for PII and PHI before any data leaves the platform boundary.
  // PHI triggers a hard block by default (HIPAA §164.514 safe-harbour).
  // Set PHI_REDACT_ONLY=true in env to redact PHI inline instead of blocking.
  const { messages: messagesToSend, systemPrompt: safeSystemPrompt } =
    applyPrivacyControls(sanitizedMessages, systemPrompt, organizationId);
  // ─────────────────────────────────────────────────────────────────────────

  const providerChain = buildProviderAttemptChain(provider);
  let lastError = null;
  let noKeyError = null;

  for (const candidateProvider of providerChain) {
    const candidateModel = candidateProvider === provider ? model : null;
    const resolved = await resolveApiKey(candidateProvider, organizationId);
    const client = getClient(candidateProvider, resolved.key);

    if (!client || (candidateProvider === 'gemini' && !client.apiKey)) {
      recordAIAttempt(candidateProvider, candidateModel, false);
      noKeyError = buildNoKeyError(candidateProvider);
      continue;
    }

    // Per-provider retry loop with exponential backoff
    for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
      try {
        recordAIAttempt(candidateProvider, candidateModel, true);
        const effectiveModel = candidateModel || getDefaultModelForProvider(candidateProvider);
        const responseText = await executeProviderChat({
          provider: candidateProvider,
          client,
          model: candidateModel,
          messages: messagesToSend,
          systemPrompt: safeSystemPrompt,
          maxTokens,
          temperature: resolvedTemperature,
          jsonMode
        });
        markAISuccess(candidateProvider, effectiveModel, provider);

        // ── AIDEFEND: Output Hardening & Sanitization ────────────────────────
        const { text: safeOutput, redacted } = aiSecurity.sanitizeOutput(responseText);
        if (redacted) {
          console.warn(`[aiSecurity] Sensitive data pattern redacted from AI output (org=${organizationId}, provider=${candidateProvider})`);
        }
        // ─────────────────────────────────────────────────────────────────────

        return safeOutput;
      } catch (err) {
        lastError = err;
        if (!isRetryableProviderError(err)) {
          throw err;
        }
        if (attempt < AI_MAX_RETRIES) {
          const delay = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[LLM] ${candidateProvider} failed (retryable, attempt ${attempt + 1}/${AI_MAX_RETRIES}): ${err.message}; retrying in ${delay}ms`);
          await sleep(delay);
        } else {
          console.warn(`[LLM] ${candidateProvider} exhausted ${AI_MAX_RETRIES} retries: ${err.message}; moving to next provider`);
        }
      }
    }
  }

  // Try configured fallback provider if set and not already in chain
  const fallbackProvider = process.env.AI_FALLBACK_PROVIDER || null;
  if (fallbackProvider && VALID_PROVIDERS.has(fallbackProvider) && !providerChain.includes(fallbackProvider)) {
    console.warn(`[LLM] All providers in chain failed, trying env fallback ${fallbackProvider}`);
    try {
      const resolved = await resolveApiKey(fallbackProvider, organizationId);
      const client = getClient(fallbackProvider, resolved.key);
      if (client) {
        recordAIAttempt(fallbackProvider, null, true);
        const responseText = await executeProviderChat({
          provider: fallbackProvider,
          client,
          model: null,
          messages: messagesToSend,
          systemPrompt: safeSystemPrompt,
          maxTokens,
          temperature: resolvedTemperature,
          jsonMode
        });
        const { text: safeOutput } = aiSecurity.sanitizeOutput(responseText);
        return safeOutput;
      }
    } catch (fallbackErr) {
      console.error(`[LLM] Fallback provider ${fallbackProvider} also failed: ${fallbackErr.message}`);
    }
  }

  if (lastError) throw lastError;
  if (noKeyError) throw noKeyError;
  throw new Error('Unsupported provider');
}

// ---------- Streaming chat via async generator (for SSE endpoints) ----------
async function* chatStream({ provider = 'claude', model, messages, systemPrompt, organizationId, maxTokens = 2048, feature = null, temperature: callerTemperature }) {
  // Apply task-profile model tiering for streaming endpoints.
  // Temperature is always resolved from the task profile (see chat() above).
  let resolvedTemperature = typeof callerTemperature === 'number' ? callerTemperature : undefined;
  if (feature) {
    const orgModel = await getOrgDefaultModel(organizationId).catch(() => null);
    const resolved = resolveTaskModel(provider, feature, model || null, orgModel);
    if (!model && resolved.model) {
      model = resolved.model;
    }
    if (resolvedTemperature === undefined && typeof resolved.temperature === 'number') {
      resolvedTemperature = resolved.temperature;
    }
  }
  // ── AIDEFEND: Adversarial Input Defense (matching chat() pipeline) ──────
  if (!Array.isArray(messages)) {
    const err = new Error('messages must be an array');
    err.statusCode = 400;
    throw err;
  }

  const sanitizedMessages = sanitizeUserMessages(messages, organizationId);

  const injectionScan = aiSecurity.scanMessages(sanitizedMessages);
  if (injectionScan.detected) {
    const labels = [...new Set(injectionScan.threats.map(t => t.label))].join(', ');
    console.warn(`[aiSecurity] Prompt injection detected in stream (org=${organizationId}, types=${labels})`);
  }

  // ── AIDEFEND: Privacy Controls — PII/PHI Detection & Redaction (stream) ──
  const { messages: messagesToStream, systemPrompt: safeStreamSystemPrompt } =
    applyPrivacyControls(sanitizedMessages, systemPrompt, organizationId);
  // ─────────────────────────────────────────────────────────────────────────

  const resolved = await resolveApiKey(provider, organizationId);
  const client = getClient(provider, resolved.key);

  if (!client || (provider === 'gemini' && !client.apiKey)) {
    throw new Error(`No API key configured for ${provider}. Add one in Settings > LLM Configuration.`);
  }

  if (provider === 'claude') {
    const stream = client.messages.stream({
      model: model || getDefaultModelForProvider('claude'),
      max_tokens: maxTokens,
      ...(typeof resolvedTemperature === 'number' ? { temperature: resolvedTemperature } : {}),
      system: safeStreamSystemPrompt || 'You are an expert GRC (Governance, Risk, and Compliance) analyst.',
      messages: messagesToStream
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    return;
  }

  if (['openai', 'grok', 'groq', 'ollama'].includes(provider)) {
    const msgs = [];
    if (safeStreamSystemPrompt) msgs.push({ role: 'system', content: safeStreamSystemPrompt });
    msgs.push(...messagesToStream);
    const stream = await client.chat.completions.create({
      model: model || getDefaultModelForProvider(provider),
      max_tokens: maxTokens,
      ...(typeof resolvedTemperature === 'number' ? { temperature: resolvedTemperature } : {}),
      messages: msgs,
      stream: true
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
    return;
  }

  if (provider === 'gemini') {
    const chosenModel = model || getDefaultModelForProvider('gemini');
    const contents = messagesToStream.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));
    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(typeof resolvedTemperature === 'number' ? { temperature: resolvedTemperature } : {})
      }
    };
    if (safeStreamSystemPrompt) payload.systemInstruction = { parts: [{ text: safeStreamSystemPrompt }] };

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(chosenModel)}:streamGenerateContent?key=${client.apiKey}&alt=sse`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    if (!response.ok) {
      throw new Error(`Gemini streaming failed with status ${response.status}`);
    }

    // Incremental SSE streaming via ReadableStream (avoid buffering entire response)
    const reader = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;
    if (!reader) {
      // Fallback: no readable stream available, buffer entire response
      const responseText = await response.text();
      for (const line of responseText.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const chunk = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
            if (chunk) yield chunk;
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const chunk = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
            if (chunk) yield chunk;
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }

    if (buffer && buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        const chunk = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
        if (chunk) yield chunk;
      } catch {
        // Skip malformed SSE lines
      }
    }
    return;
  }

  throw new Error('Unsupported provider for streaming');
}

// ---------- GRC System Prompt ----------
// =====================================================================
// MODULAR SYSTEM PROMPT — Token-Optimized
// =====================================================================
// The full GRC_SYSTEM was ~2,000 tokens and included in every call.
// Most features only need 1-2 reference sections, not all of them.
// This modular approach sends only the sections each feature requires,
// cutting system-prompt tokens by 50-80% on most calls.
// =====================================================================

// Core identity + behavioral rules — always included (~400 tokens)

// ---------- GRC system prompt templates (extracted to ./ai/prompts) ----------
const {
  GRC_CORE,
  GRC_MODULES,
  PROMPT_PROFILES,
  buildGrcSystem,
  GRC_SYSTEM,
} = require('./ai/prompts');

// ---------- Helper: Compact JSON formatting for token optimization ----------
// Replaces compactJSON(data) with JSON.stringify(data) to remove
// indentation whitespace, reducing token count by 20-40% for large data structures.
function compactJSON(data) {
  return JSON.stringify(data);
}

// ---------- Org-personalized system prompt ----------
// promptProfile: a PROMPT_PROFILES key (e.g. 'controls', 'vulnerability', 'lean')
//   or an array of module keys. Defaults to 'full' for backward compatibility.
async function buildPersonalizedSystem(organizationId, extra, contextLevel = 'compact', ragQuery, promptProfile) {
  // ragQuery: optional text to use for RAG retrieval (user question, analysis topic, etc.)
  const ragQueryText = ragQuery || '';
  const [orgContext, frameworkGuardrails, ragContext] = await Promise.all([
    organizationId ? buildOrgContext(organizationId, contextLevel) : Promise.resolve(''),
    organizationId ? buildFrameworkGuardrails(organizationId) : Promise.resolve(''),
    organizationId && ragQueryText ? buildRagContext({ organizationId, queryText: ragQueryText }) : Promise.resolve('')
  ]);
  const grcBase = promptProfile ? buildGrcSystem(promptProfile) : GRC_SYSTEM;
  const base = extra ? `${grcBase}\n${extra}` : grcBase;
  const withGuardrails = frameworkGuardrails ? `${base}${frameworkGuardrails}` : base;
  const withOrg = orgContext ? `${withGuardrails}\n\n${orgContext}` : withGuardrails;
  return ragContext ? `${withOrg}${ragContext}` : withOrg;
}

// =====================================================================
// RESULT CACHING AND REQUEST DEDUPLICATION
// =====================================================================
// In-memory cache for AI analysis results with configurable TTL
// Prevents redundant AI calls when multiple users or components request the same analysis
const aiResultCache = new Map();
const aiInFlightRequests = new Map();
const AI_CACHE_TTL_MS = Math.max(1000, parseInt(process.env.AI_CACHE_TTL_MS || '300000', 10)); // Default 5 minutes, min 1 second
const AI_ERROR_CACHE_TTL_MS = 30 * 1000; // Cache errors for 30 seconds to prevent rapid retries

// Periodic cleanup of expired cache entries to prevent memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of aiResultCache.entries()) {
    const ttl = entry.error ? AI_ERROR_CACHE_TTL_MS : AI_CACHE_TTL_MS;
    if (now - entry.timestamp >= ttl) {
      aiResultCache.delete(key);
    }
  }
}, AI_CACHE_TTL_MS); // Run cleanup at same interval as TTL

// Allow graceful cleanup on shutdown
cleanupInterval.unref(); // Don't prevent process exit

/**
 * Wraps an AI function with caching and request deduplication
 * - Caches results for AI_CACHE_TTL_MS to prevent redundant AI API calls
 * - Caches errors for 30 seconds to prevent rapid retries during outages
 * - Deduplicates in-flight requests to prevent concurrent identical calls
 * 
 * @param {string} cacheKey - Unique key for this request (e.g., 'gap-analysis:orgId')
 * @param {Function} fn - Async function that returns the AI result
 * @returns {Promise<any>} The cached or freshly computed result
 */
async function withCacheAndDedup(cacheKey, fn) {
  // Check cache first
  const cached = aiResultCache.get(cacheKey);
  if (cached) {
    const ttl = cached.error ? AI_ERROR_CACHE_TTL_MS : AI_CACHE_TTL_MS;
    if (Date.now() - cached.timestamp < ttl) {
      if (cached.error) {
        throw new Error(cached.data);
      }
      return cached.data;
    }
  }

  // Check if request is already in flight
  const inFlight = aiInFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight; // Return the existing promise
  }

  // Execute the function and cache the promise
  const promise = (async () => {
    try {
      const result = await fn();
      // Cache the successful result
      aiResultCache.set(cacheKey, { data: result, timestamp: Date.now(), error: false });
      return result;
    } catch (err) {
      // Cache the error for a short period to prevent rapid retries
      aiResultCache.set(cacheKey, { data: err.message, timestamp: Date.now(), error: true });
      throw err;
    } finally {
      // Remove from in-flight requests
      aiInFlightRequests.delete(cacheKey);
    }
  })();

  aiInFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Invalidates the cache for a specific organization's AI results
 * Call this when org data changes significantly (e.g., control implementation updated)
 * 
 * @param {string} organizationId
 * @param {string} feature - Optional feature name to invalidate (e.g., 'gap-analysis')
 */
function invalidateAICache(organizationId, feature = null) {
  if (feature) {
    // Invalidate specific feature for this org — keys may include :provider:model suffixes
    const prefix = `${feature}:${organizationId}`;
    for (const key of aiResultCache.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        aiResultCache.delete(key);
      }
    }
  } else {
    // Invalidate all features for this org — match orgId anywhere in the key
    for (const key of aiResultCache.keys()) {
      if (key.includes(`:${organizationId}:`) || key.endsWith(`:${organizationId}`)) {
        aiResultCache.delete(key);
      }
    }
  }
}

/**
 * Cleanup function to stop background tasks
 * Call before process shutdown for graceful cleanup
 */
function cleanupAICache() {
  clearInterval(cleanupInterval);
  aiResultCache.clear();
  aiInFlightRequests.clear();
}

// =====================================================================
// 1. AUTOMATED GAP ANALYSIS
// =====================================================================
async function generateGapAnalysis({ organizationId, provider, model, schemaRetryHint = null }) {
  // Use cache and deduplication to prevent redundant AI calls
  // Skip cache on retry to get a fresh structured response
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  const cacheKey = schemaRetryHint
    ? `gap-analysis-retry:${organizationId}:${cacheProvider}:${cacheModel}`
    : `gap-analysis:${organizationId}:${cacheProvider}:${cacheModel}`;
  return withCacheAndDedup(cacheKey, async () => {
    const [frameworks, controls, evidenceStats, assessmentStats, assetStats, vulnStats, ownershipStats] = await Promise.all([
      pool.query(`
        SELECT f.code, f.name, COUNT(fc.id) as total,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
          COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress,
          COUNT(ci.id) FILTER (WHERE ci.status IS NULL OR ci.status = 'not_started') as not_started
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.code, f.name
      `, [organizationId]),
      pool.query(`
        SELECT fc.control_id, fc.title, fc.priority, f.code as framework,
          COALESCE(ci.status, 'not_started') as status
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1 AND (ci.status IS NULL OR ci.status != 'implemented')
        ORDER BY fc.priority ASC, f.code
        LIMIT 100
      `, [organizationId]),
      // Evidence coverage: how many controls have linked evidence (org-scoped)
      pool.query(`
        SELECT
          COUNT(DISTINCT fc.id) as total_controls,
          COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN ecl.control_id END) as controls_with_evidence,
          COUNT(DISTINCT e.id) as total_evidence_items
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN evidence_control_links ecl ON ecl.control_id = fc.id
        LEFT JOIN evidence e ON e.id = ecl.evidence_id AND e.organization_id = $1
        WHERE of2.organization_id = $1
      `, [organizationId]),
      // Assessment completion rates
      pool.query(`
        SELECT
          COUNT(DISTINCT ap2.assessment_procedure_id) as total_procedures_in_plans,
          COUNT(DISTINCT ar.assessment_procedure_id) as procedures_assessed,
          COUNT(ar.id) FILTER (WHERE ar.status = 'satisfied') as satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'other_than_satisfied') as other_than_satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_applicable') as not_applicable,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_assessed' OR ar.status IS NULL) as not_assessed
        FROM assessment_plans ap
        LEFT JOIN assessment_plan_procedures ap2 ON ap2.assessment_plan_id = ap.id
        LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap2.assessment_procedure_id AND ar.organization_id = $1
        WHERE ap.organization_id = $1
      `, [organizationId]),
      // Asset and environment stats
      pool.query(`
        SELECT
          COUNT(*) as total_assets,
          COUNT(*) FILTER (WHERE criticality = 'critical') as critical_assets,
          COUNT(*) FILTER (WHERE criticality = 'high') as high_assets,
          COUNT(*) FILTER (WHERE status = 'active') as active_assets
        FROM assets WHERE organization_id = $1
      `, [organizationId]),
      // Vulnerability stats
      pool.query(`
        SELECT
          COUNT(*) as total_vulns,
          COUNT(*) FILTER (WHERE status = 'open') as open_vulns,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_vulns,
          COUNT(*) FILTER (WHERE severity = 'high') as high_vulns,
          COUNT(*) FILTER (WHERE kev_listed = true) as kev_listed
        FROM vulnerability_findings WHERE organization_id = $1
      `, [organizationId]),
      // Control ownership / assignment stats
      pool.query(`
        SELECT
          COUNT(fc.id) as total_controls,
          COUNT(ci.assigned_to) as assigned_controls
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
      `, [organizationId])
    ]);

    const ev = evidenceStats.rows[0] || {};
    const assess = assessmentStats.rows[0] || {};
    const assets = assetStats.rows[0] || {};
    const vulns = vulnStats.rows[0] || {};
    const ownership = ownershipStats.rows[0] || {};

    const kpiBlock = [
      `- Evidence Coverage: ${ev.controls_with_evidence || 0} of ${ev.total_controls || 0} controls have linked evidence (${ev.total_evidence_items || 0} total evidence items)`,
      `- Assessment Completion: ${assess.procedures_assessed || 0} of ${assess.total_procedures_in_plans || 0} procedures assessed (${assess.satisfied || 0} satisfied, ${assess.other_than_satisfied || 0} other-than-satisfied, ${assess.not_applicable || 0} not applicable, ${assess.not_assessed || 0} not assessed)`,
      `- Control Ownership: ${ownership.assigned_controls || 0} of ${ownership.total_controls || 0} controls assigned to owners`,
      `- Asset Inventory: ${assets.total_assets || 0} assets (${assets.critical_assets || 0} critical, ${assets.high_assets || 0} high criticality)`,
      `- Vulnerability Exposure: ${vulns.total_vulns || 0} total findings (${vulns.open_vulns || 0} open, ${vulns.critical_vulns || 0} critical, ${vulns.high_vulns || 0} high, ${vulns.kev_listed || 0} KEV-listed)`
    ].join('\n');

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'full', 'compliance gap analysis controls implementation evidence audit readiness', 'controls'),
      messages: [{ role: 'user', content: `Generate a comprehensive gap analysis report that tells a compelling compliance story from two expert perspectives: a **CISO** (strategic risk, business impact, board communication) and a **Lead Auditor** (evidence sufficiency, control effectiveness, audit readiness).${buildFewShotBlock('gap_analysis')}

Framework Status:
${compactJSON(frameworks.rows)}

Top Unimplemented Controls:
${compactJSON(controls.rows)}

Key Performance Indicators (KPIs):
${kpiBlock}

Structure the report as follows:

## 1. Executive KPI Dashboard
Present a concise KPI scorecard with these metrics and RAG (Red/Amber/Green) status:
- **Implementation Rate**: % of controls implemented across all frameworks
- **Evidence Coverage Rate**: % of controls backed by evidence
- **Assessment Completion Rate**: % of assessment procedures completed
- **Control Ownership Rate**: % of controls assigned to responsible owners
- **Vulnerability Exposure Index**: open critical/high vulnerabilities relative to asset count
- **Audit Readiness Score**: composite score (0-100) based on above metrics

## 2. CISO Strategic Risk Narrative
Write from the perspective of a CISO presenting to the board:
- Translate compliance gaps into **business risk** (revenue impact, regulatory penalties, reputational exposure, operational disruption)
- Identify the **top 3 strategic risks** that demand immediate executive attention
- Provide **Mean Time to Compliance (MTTC)** estimates per framework
- Quantify potential **financial exposure** from regulatory non-compliance
- Recommend **budget and resource allocation** priorities

## 3. Lead Auditor Assessment
Write from the perspective of a lead auditor conducting a readiness review:
- Assess **evidence sufficiency** — are controls supported by adequate documentation?
- Evaluate **control effectiveness** — are implemented controls operating as intended?
- Identify **material weaknesses** vs. **significant deficiencies** vs. **observations**
- Assess **audit readiness** per framework with realistic timeline to attestation/certification
- Flag controls where the gap between implementation and evidence creates **audit risk**

## 4. Bridging the Gap: Unified Remediation Roadmap
Synthesize both perspectives into an actionable plan:
- **Immediate (0-30 days)**: Critical quick wins that address both strategic risk and audit findings
- **Short-term (30-90 days)**: Core control implementation with evidence collection
- **Medium-term (90-180 days)**: Advanced controls, continuous monitoring, audit preparation
- Identify **crosswalk leverage points** where one implementation satisfies multiple frameworks
- Prioritize controls by combined risk-and-audit-impact score

## 5. Quick Wins & Momentum Builders
Highlight 5-10 specific controls that can be implemented quickly to build compliance momentum, with estimated effort and cross-framework impact.${schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : ''}` }],
      feature: 'gap_analysis'
    });
  });
}

// =====================================================================
// 2. CROSSWALK OPTIMIZER
// =====================================================================
async function optimizeCrosswalk({ organizationId, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  return withCacheAndDedup(`crosswalk-optimizer:${organizationId}:${cacheProvider}:${cacheModel}`, async () => {
    const mappings = await pool.query(`
      SELECT fc1.control_id as source_id, fc1.title as source_title, f1.code as source_fw,
        fc2.control_id as target_id, fc2.title as target_title, f2.code as target_fw,
        cm.similarity_score, cm.mapping_type,
        COALESCE(ci1.status, 'not_started') as source_status,
        COALESCE(ci2.status, 'not_started') as target_status
      FROM control_mappings cm
      JOIN framework_controls fc1 ON fc1.id = cm.source_control_id
      JOIN framework_controls fc2 ON fc2.id = cm.target_control_id
      JOIN frameworks f1 ON f1.id = fc1.framework_id
      JOIN frameworks f2 ON f2.id = fc2.framework_id
      JOIN organization_frameworks of1 ON of1.framework_id = f1.id AND of1.organization_id = $1
      LEFT JOIN control_implementations ci1 ON ci1.control_id = fc1.id AND ci1.organization_id = $1
      LEFT JOIN control_implementations ci2 ON ci2.control_id = fc2.id AND ci2.organization_id = $1
      WHERE cm.similarity_score >= 80
      ORDER BY cm.similarity_score DESC
      LIMIT 200
    `, [organizationId]);

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', 'crosswalk framework control mapping implementation', 'controls'),
      messages: [{ role: 'user', content: `Analyze crosswalk mappings and recommend optimal implementation order.

Crosswalk Mappings (score >= 80%):
${compactJSON(mappings.rows)}

Provide:
1. Top 10 "implement first" controls that satisfy the most cross-framework requirements
2. For each recommendation, list all frameworks satisfied and the similarity scores
3. Estimated effort reduction percentage from leveraging crosswalks
4. Controls that are already implemented and their crosswalk impact
5. Recommended implementation sequence for maximum coverage with minimum effort` }],
      feature: 'crosswalk_optimizer',
      maxTokens: 3072
    });
  });
}

// =====================================================================
// 3. COMPLIANCE FORECASTING
// =====================================================================
async function forecastCompliance({ organizationId, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  return withCacheAndDedup(`compliance-forecast:${organizationId}:${cacheProvider}:${cacheModel}`, async () => {
    const [history, totals, frameworkBreakdown, evidenceTrend, assessmentProgress, controlMaturity] = await Promise.all([
      pool.query(`
        SELECT DATE_TRUNC('week', ci.created_at) as week,
          COUNT(*) as controls_completed
        FROM control_implementations ci
        WHERE ci.organization_id = $1 AND ci.status = 'implemented'
        GROUP BY DATE_TRUNC('week', ci.created_at)
        ORDER BY week DESC
        LIMIT 12
      `, [organizationId]),
      pool.query(`
        SELECT COUNT(fc.id) as total,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as done,
          COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
      `, [organizationId]),
      // Per-framework progress for targeted forecasting
      pool.query(`
        SELECT f.code, f.name,
          COUNT(fc.id) as total,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
          COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.code, f.name
      `, [organizationId]),
      // Evidence collection trend
      pool.query(`
        SELECT DATE_TRUNC('week', e.created_at) as week,
          COUNT(*) as evidence_uploaded
        FROM evidence e
        WHERE e.organization_id = $1
        GROUP BY DATE_TRUNC('week', e.created_at)
        ORDER BY week DESC
        LIMIT 12
      `, [organizationId]),
      // Assessment completion rates
      pool.query(`
        SELECT
          COUNT(ar.id) as total_results,
          COUNT(ar.id) FILTER (WHERE ar.status = 'satisfied') as satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'other_than_satisfied') as other_than_satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_applicable') as not_applicable,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_assessed' OR ar.status IS NULL) as not_assessed
        FROM assessment_results ar
        WHERE ar.organization_id = $1
      `, [organizationId]),
      // Control maturity: earliest/latest implementation dates per framework
      pool.query(`
        SELECT f.code, f.name,
          MIN(ci.created_at) as earliest_implementation,
          MAX(ci.created_at) as latest_implementation,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1 AND ci.status = 'implemented'
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.code, f.name
      `, [organizationId])
    ]);

    const assess = assessmentProgress.rows[0] || {};
    const maturity = controlMaturity.rows || [];

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', 'compliance forecast trajectory implementation velocity evidence collection', 'controls'),
      messages: [{ role: 'user', content: `Forecast compliance trajectory with dual-perspective analysis from a **CISO** and **Lead Auditor** viewpoint.

Implementation Velocity (weekly):
${compactJSON(history.rows)}

Current Totals: ${JSON.stringify(totals.rows[0] || {})}

Per-Framework Progress:
${compactJSON(frameworkBreakdown.rows)}

Evidence Collection Velocity (weekly):
${compactJSON(evidenceTrend.rows)}

Assessment Status: ${JSON.stringify(assess)}

Control Maturity (implementation history per framework):
${compactJSON(maturity)}

Structure the forecast as follows:

## 1. Compliance KPI Dashboard
Present current KPIs with trend indicators (▲ improving, ▼ declining, ► stable):
- **Overall Implementation Rate**: % complete with week-over-week change
- **Implementation Velocity**: controls/week (current, average, peak)
- **Evidence Collection Rate**: evidence items/week trend
- **Assessment Completion Rate**: % of procedures assessed
- **Per-Framework Compliance %**: individual framework progress
- **In-Progress Pipeline**: controls currently being worked on

## 2. CISO Strategic Forecast
From a CISO's perspective communicating to the board:
- **Projected Milestone Dates**: estimated dates to reach 50%, 80%, 90%, and 100% compliance (per framework and overall)
- **Business Risk Timeline**: when key regulatory deadlines intersect with projected compliance dates
- **Resource Burn Rate**: are current resources sufficient to meet targets?
- **Risk Exposure Window**: period during which the organization remains exposed before reaching acceptable compliance levels
- **Budget Impact**: estimated cost implications of current pace vs. accelerated timelines

## 3. Lead Auditor Readiness Assessment
From a lead auditor's perspective evaluating audit preparedness:
- **Evidence Sufficiency Forecast**: at current evidence collection rate, when will evidence coverage be adequate for audit?
- **Assessment Readiness**: based on assessment completion rates, when can a formal assessment/audit be scheduled?
- **Control Maturity Projection**: using the earliest/latest implementation dates provided, forecast when controls will have sufficient operational history for SOC 2 Type II (typically 3-6 months of operational evidence) or equivalent
- **Documentation Gap Forecast**: areas where evidence collection lags behind control implementation
- **Audit Engagement Timeline**: recommended dates for readiness assessment, internal audit, and external audit

## 4. Velocity Analysis & Bottleneck Identification
- Is the team accelerating or decelerating? Analyze the trend.
- Identify specific bottlenecks (resource constraints, complexity spikes, framework-specific slowdowns)
- Compare implementation velocity against evidence collection velocity — highlight mismatches
- Identify frameworks that are falling behind their peers

## 5. Acceleration Recommendations
Provide prioritized recommendations from both perspectives:
- **CISO Priority**: actions that reduce the most business risk the fastest
- **Auditor Priority**: actions that close the most evidence and assessment gaps
- **Combined Quick Wins**: actions that satisfy both strategic and audit objectives
- Resource reallocation suggestions based on framework-specific velocity data

## 6. Risk Assessment: Current Pace Scenario
- If current velocity continues unchanged, what are the consequences?
- Quantify compliance debt accumulation
- Identify regulatory deadlines at risk of being missed
- Provide a "wake-up call" metric that makes the urgency tangible` }],
      feature: 'compliance_forecast',
      maxTokens: 4096
    });
  });
}

// =====================================================================
// 4. REGULATORY CHANGE MONITOR
// =====================================================================
async function monitorRegulatoryChanges({ organizationId, frameworks: fwList, provider, model }) {
  // Query ALL adopted frameworks with compliance status for focused analysis
  const adopted = await pool.query(`
    SELECT f.code, f.name, f.version, f.category, f.tier_required,
           COUNT(fc.id) AS total_controls,
           COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') AS implemented_controls,
           ROUND(
             COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
             / NULLIF(COUNT(fc.id), 0) * 100, 1
           ) AS compliance_pct
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci
      ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.code, f.name, f.version, f.category, f.tier_required
    ORDER BY f.name
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId,
      'You have knowledge of regulatory changes and updates through your training data. ' +
      'Use the full organization context provided to tailor findings to their specific industry, ' +
      'deployment model, data sensitivity types, and compliance posture.',
      'full', null, 'policy'),
    messages: [{ role: 'user', content: `Analyze regulatory changes for EACH framework this organization has adopted.
Focus your analysis on every single framework listed below — do not skip any.

Adopted Frameworks (with current compliance status):
${compactJSON(adopted.rows)}

For EACH adopted framework, provide:
1. Recent and upcoming regulatory changes specific to that framework
2. Impact assessment for each change (High/Medium/Low)
3. New controls or requirements that may need to be added
4. Deprecated or modified controls
5. Timeline for compliance with new requirements
6. Recommended actions to stay ahead of changes

Also provide a cross-framework summary:
- Regulatory changes that affect multiple adopted frameworks simultaneously
- Priority actions across the entire compliance portfolio
- Gaps between current compliance posture and upcoming requirements` }]
  });
}

// =====================================================================
// 5. REMEDIATION PLAYBOOKS
// =====================================================================
async function generateRemediationPlaybook({ controlId, organizationId, provider, model, schemaRetryHint = null }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code, f.name as framework_name,
      COALESCE(ci.status, 'not_started') as impl_status, ci.notes as impl_notes
    FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE fc.id = $2
  `, [organizationId, controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  const assets = await pool.query(`
    SELECT a.name, a.hostname, ac.code as category, a.criticality
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1 ORDER BY a.criticality LIMIT 20
  `, [organizationId]);

  const controlTitle = control.rows[0]?.title || control.rows[0]?.control_id || 'control';

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', `remediation implementation playbook ${controlTitle}`, 'controls'),
    messages: [{ role: 'user', content: `Generate a detailed remediation playbook for this control.${buildFewShotBlock('remediation_playbook')}

Control:
${compactJSON(control.rows[0])}

Organization Assets:
${compactJSON(assets.rows)}

Provide:
1. Step-by-step implementation guide (numbered steps)
2. Required tools and technologies
3. Estimated effort (hours) and required skill level
4. Configuration examples / code snippets where applicable
5. Verification steps to confirm implementation
6. Common pitfalls and how to avoid them
7. Evidence artifacts to collect during implementation
8. Related controls that benefit from this implementation${schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : ''}` }],
    feature: 'remediation_playbook',
    maxTokens: 3072
  });
}

// =====================================================================
// VULNERABILITY REMEDIATION PLAN
// =====================================================================
async function generateVulnerabilityRemediation({
  vulnerabilityId,
  organizationId,
  provider,
  model
}) {
  const findingResult = await pool.query(
    `SELECT
       vf.id,
       vf.finding_key,
       vf.vulnerability_id,
       vf.source,
       vf.standard,
       vf.title,
       vf.description,
       vf.severity,
       vf.cvss_score,
       vf.status,
       vf.due_date,
       vf.package_name,
       vf.component_name,
       vf.version_detected,
       vf.cwe_id,
       vf.owasp_top10_2025_category,
       vf.kev_listed,
       vf.exploit_available,
       a.id AS asset_id,
       a.name AS asset_name,
       a.hostname AS asset_hostname,
       a.ip_address AS asset_ip,
       e.name AS environment_name
     FROM vulnerability_findings vf
     LEFT JOIN assets a ON a.id = vf.asset_id
     LEFT JOIN environments e ON e.id = a.environment_id
     WHERE vf.organization_id = $1
       AND vf.id = $2
     LIMIT 1`,
    [organizationId, vulnerabilityId]
  );

  if (findingResult.rows.length === 0) {
    throw new Error('Vulnerability finding not found');
  }

  const finding = findingResult.rows[0];

  const workflowResult = await pool.query(
    `SELECT
       vw.action_type,
       vw.action_status,
       vw.control_effect,
       vw.response_summary,
       vw.due_date,
       fc.control_id AS control_code,
       fc.title AS control_title,
       f.code AS framework_code,
       f.name AS framework_name,
       COALESCE(ci.status, 'not_started') AS implementation_status
     FROM vulnerability_control_work_items vw
     JOIN framework_controls fc ON fc.id = vw.framework_control_id
     JOIN frameworks f ON f.id = fc.framework_id
     LEFT JOIN control_implementations ci ON ci.id = vw.implementation_id
     WHERE vw.organization_id = $1
       AND vw.vulnerability_id = $2
     ORDER BY f.code, fc.control_id`,
    [organizationId, vulnerabilityId]
  );

  const poamResult = await pool.query(
    `SELECT
       id,
       title,
       status,
       priority,
       due_date,
       owner_id,
       remediation_plan
     FROM poam_items
     WHERE organization_id = $1
       AND vulnerability_id = $2
     ORDER BY created_at DESC
     LIMIT 5`,
    [organizationId, vulnerabilityId]
  );

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'Focus on practical remediation and control-closure actions for vulnerability findings.', 'compact', null, 'vulnerability'),
    messages: [{
      role: 'user',
      content: `Generate a vulnerability remediation and closure plan.

Vulnerability Finding:
${compactJSON(finding)}
${finding.owasp_top10_2025_category ? `\nOWASP Top 10:2025 Category: ${finding.owasp_top10_2025_category}` : ''}
${finding.cwe_id ? `CWE: ${finding.cwe_id}` : ''}

Related Control Workflow Items:
${compactJSON(workflowResult.rows)}

Related POA&M Items:
${compactJSON(poamResult.rows)}

Return:
1. Executive summary (risk + business impact)
2. Immediate containment actions (0-24h)
3. Remediation actions (patch/config/code/process) with owner roles and due dates
4. Control-closure impact: which controls can move to compliant, which remain partial
5. Required evidence artifacts for closure and audit defensibility
6. Residual risk statement and conditions for risk acceptance (if needed)
7. OWASP Top 10:2025 context: explain which OWASP category applies, why, and category-specific hardening best practices
8. A JSON block:
{
  "finding_id": "${finding.id}",
  "priority": "low|medium|high|critical",
  "recommended_actions": [
    {
      "title": "...",
      "owner_role": "...",
      "target_days": 7,
      "evidence_required": ["..."],
      "mapped_controls": ["..."]
    }
  ],
  "closure_criteria": ["..."],
  "poam_update_suggestion": "..."
}`
    }]
  });
}

// =====================================================================
// IAVM ASSET ALERT
// =====================================================================
// Matches an IAVM (Information Assurance Vulnerability Management) notice
// against the org's assets and generates an AI-powered risk alert with
// recommended remediation actions.
async function generateIAVMAssetAlert({ organizationId, iavmId, title, description, affectedProducts, severity, provider, model }) {
  const maxAssets = Math.max(50, parseInt(process.env.AI_IAVM_MAX_ASSETS || '500', 10));
  const assets = await pool.query(`
    SELECT a.id, a.name, a.hostname, a.fqdn, a.ip_address, a.operating_system,
           a.software_inventory, a.criticality, a.security_classification,
           ac.code AS category, e.name AS environment
    FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.organization_id = $1
    ORDER BY a.criticality NULLS LAST
    LIMIT $2
  `, [organizationId, maxAssets]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId,
      'You are an expert in DoD vulnerability management (IAVM program). ' +
      'You map IAVM notices to affected assets and generate actionable remediation guidance ' +
      'aligned with DISA STIGs, NIST 800-53 SI-2/RA-5, and CISA KEV timelines.',
      'compact', null, 'vulnerability'),
    messages: [{
      role: 'user',
      content: `Analyze this IAVM notice and determine which of the organization's assets are likely affected.

IAVM Notice:
- ID: ${iavmId || 'Unknown'}
- Title: ${title || 'Unknown'}
- Severity: ${severity || 'Unknown'}
- Affected Products / Platforms:
${affectedProducts ? compactJSON(affectedProducts) : 'Not specified'}
- Description:
${description || 'No description provided'}

Organization Assets (${assets.rows.length} total):
${compactJSON(assets.rows)}

Provide:
1. **Affected Assets** – List each asset likely affected by this IAVM, with a brief reason (hostname/OS/software match)
2. **Risk Assessment** – Overall risk to the organization (Critical/High/Medium/Low) with justification
3. **Remediation Steps** – Step-by-step remediation plan referencing DISA STIG or patch guidance where applicable
4. **Compliance Impact** – Which NIST 800-53 controls (e.g. SI-2, RA-5) or other framework controls are triggered
5. **Timeline** – Recommended remediation timeline based on IAVM severity category (CAT I = 21 days, CAT II = 30 days, CAT III = 180 days)
6. **Evidence Required** – What scan or patch evidence to collect for audit closure

If no assets appear to be affected, explicitly state that and explain why.`
    }]
  });
}

// =====================================================================
// 6. INCIDENT RESPONSE PLANS
// =====================================================================
async function generateIncidentResponsePlan({ organizationId, incidentType, provider, model }) {
  const assets = await pool.query(`
    SELECT a.name, a.hostname, a.ip_address, ac.code as category,
      a.criticality, a.security_classification, e.name as environment
    FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.organization_id = $1 ORDER BY a.criticality LIMIT 50
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'controls'),
    messages: [{ role: 'user', content: `Generate an incident response plan for: ${incidentType || 'General cybersecurity incident'}

Organization Asset Inventory:
${compactJSON(assets.rows)}

Generate a complete IR plan with:
1. Incident Classification & Severity Matrix
2. Detection & Identification procedures
3. Containment Strategy (short-term and long-term)
4. Eradication Steps
5. Recovery Procedures with asset-specific actions
6. Post-Incident Review checklist
7. Communication plan (internal stakeholders, regulators, affected parties)
8. Evidence preservation requirements
9. Regulatory notification requirements (GDPR 72hr, HIPAA, etc.)
10. Roles and responsibilities matrix` }]
  });
}

// =====================================================================
// 7. BOARD/EXECUTIVE REPORTS
// =====================================================================
async function generateExecutiveReport({ organizationId, provider, model }) {
  const stats = await pool.query(`
    SELECT f.code, f.name,
      COUNT(fc.id) as total,
      COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
      COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress,
      ROUND(COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric / NULLIF(COUNT(fc.id),0) * 100, 1) as pct
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.id, f.code, f.name ORDER BY f.name
  `, [organizationId]);

  const assetStats = await pool.query(`
    SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE criticality = 'critical') as critical,
      COUNT(*) FILTER (WHERE criticality = 'high') as high
    FROM assets WHERE organization_id = $1
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', 'executive compliance report board risk business impact', 'risk'),
    messages: [{ role: 'user', content: `Generate a board-ready executive compliance report.

Compliance Status by Framework:
${compactJSON(stats.rows)}

Asset Summary: ${JSON.stringify(assetStats.rows[0])}

Generate a professional executive report including:
1. Executive Summary (2-3 paragraphs, non-technical)
2. Overall Compliance Score with trend indicator
3. Framework-by-framework breakdown with RAG status (Red/Amber/Green)
4. Top 5 risks requiring board attention
5. Key achievements since last report
6. Resource requirements and budget considerations
7. Recommended board actions / decisions needed
8. 90-day outlook and next milestones` }],
    feature: 'executive_report',
    maxTokens: 3072
  });
}

// =====================================================================
// 8. RISK HEATMAP
// =====================================================================
async function generateRiskHeatmap({ organizationId, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  return withCacheAndDedup(`risk-heatmap:${organizationId}:${cacheProvider}:${cacheModel}`, async () => {
    const [assets, controlGaps] = await Promise.all([
      pool.query(`
        SELECT a.name, ac.code as category, a.criticality, a.security_classification,
          a.status, e.name as environment
        FROM assets a
        JOIN asset_categories ac ON ac.id = a.category_id
        LEFT JOIN environments e ON e.id = a.environment_id
        WHERE a.organization_id = $1
      `, [organizationId]),
      pool.query(`
        SELECT f.code as framework, fc.control_id, fc.title, fc.priority
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1 AND (ci.status IS NULL OR ci.status = 'not_started')
        AND fc.priority::int <= 2
        ORDER BY fc.priority LIMIT 50
      `, [organizationId])
    ]);

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'risk'),
      messages: [{ role: 'user', content: `Generate a risk heatmap analysis.

Assets:
${compactJSON(assets.rows)}

Priority 1-2 Control Gaps:
${compactJSON(controlGaps.rows)}

Provide:
1. Risk matrix (Likelihood x Impact) with specific items placed in each cell
2. Top 10 highest risk items with scores and justification
3. Risk by category (assets, controls, processes)
4. Risk by environment (production vs staging vs dev)
5. Trend analysis and emerging risks
6. Risk acceptance recommendations vs mitigation priorities
7. Return data in a structured JSON section for heatmap visualization:
   { "heatmapData": [{ "item": "name", "likelihood": 1-5, "impact": 1-5, "category": "..." }] }` }]
    });
  });
}

// =====================================================================
// 9. VENDOR RISK ASSESSMENT
// =====================================================================
async function assessVendorRisk({ organizationId, vendorInfo, provider, model }) {
  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'risk'),
    messages: [{ role: 'user', content: `Perform a third-party vendor risk assessment.

Vendor Information:
${compactJSON(vendorInfo)}

Provide:
1. Overall vendor risk score (1-100) with justification
2. Risk breakdown by category:
   - Data security & privacy
   - Business continuity
   - Regulatory compliance
   - Financial stability
   - Operational resilience
3. Key risk factors identified
4. Required contractual controls
5. Recommended monitoring frequency
6. Questionnaire items to send to the vendor
7. Due diligence checklist
8. Compliance framework alignment (which controls does this vendor impact)` }]
  });
}

// =====================================================================
// 10. AUDIT READINESS SCORE
// =====================================================================
async function assessAuditReadiness({ organizationId, framework, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  const cacheFramework = framework || 'all';
  return withCacheAndDedup(`audit-readiness:${organizationId}:${cacheFramework}:${cacheProvider}:${cacheModel}`, async () => {
    let fwFilter = '';
    const params = [organizationId];
    if (framework) {
      fwFilter = ' AND f.code = $2';
      params.push(framework);
    }

    const [data, evidence] = await Promise.all([
      pool.query(`
        SELECT f.code, f.name, fc.control_id, fc.title, fc.priority,
          COALESCE(ci.status, 'not_started') as status,
          ci.notes, ci.created_at as last_update
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1${fwFilter}
        ORDER BY fc.priority, f.code
      `, params),
      pool.query(`
        SELECT COUNT(*) as total_evidence,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') as recent_evidence
        FROM evidence WHERE organization_id = $1
      `, [organizationId])
    ]);

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', `audit readiness assessment ${framework || ''} evidence controls documentation`, 'audit'),
      messages: [{ role: 'user', content: `Assess audit readiness${framework ? ' for ' + framework : ''}.

Control Status:
${JSON.stringify(data.rows.slice(0, 100), null, 2)}

Evidence Stats: ${JSON.stringify(evidence.rows[0])}

Provide:
1. Overall Audit Readiness Score (0-100) with letter grade
2. Category-by-category readiness breakdown
3. Items an auditor would flag as findings
4. Missing evidence gaps
5. Controls with stale documentation (>90 days since update)
6. Recommended pre-audit actions (prioritized checklist)
7. Estimated time to become audit-ready
8. Sample auditor questions and suggested responses` }],
      feature: 'audit_readiness',
      maxTokens: 3072
    });
  });
}

// =====================================================================
// 11. ASSET-TO-CONTROL MAPPING
// =====================================================================
async function mapAssetsToControls({ organizationId, provider, model }) {
  const assets = await pool.query(`
    SELECT a.id, a.name, ac.code as category, a.criticality,
      a.security_classification, a.hostname, a.cloud_provider,
      a.ai_model_type, a.ai_risk_level
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1 ORDER BY a.criticality LIMIT 30
  `, [organizationId]);

  const frameworks = await pool.query(`
    SELECT f.code, f.name FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id WHERE of2.organization_id = $1
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'controls'),
    messages: [{ role: 'user', content: `Map assets to applicable compliance controls.

Assets:
${compactJSON(assets.rows)}

Adopted Frameworks: ${JSON.stringify(frameworks.rows)}

For each asset, identify:
1. Which framework controls directly apply to this asset type
2. Priority of each control-asset pairing (Critical/High/Medium/Low)
3. Any gaps where assets lack required controls
4. Recommended control implementations per asset category
5. Return structured mapping data:
   { "mappings": [{ "asset": "name", "controls": [{ "id": "XX-1", "framework": "code", "priority": "high", "reason": "..." }] }] }` }]
  });
}

// =====================================================================
// 12. SHADOW IT DETECTION
// =====================================================================
async function detectShadowIT({ organizationId, provider, model }) {
  const assets = await pool.query(`
    SELECT a.name, ac.code as category, a.hostname, a.ip_address, a.cloud_provider,
      a.status, a.security_classification, e.name as environment
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.organization_id = $1
  `, [organizationId]);

  const controls = await pool.query(`
    SELECT f.code, fc.control_id, fc.title FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    WHERE of2.organization_id = $1
    AND (fc.title ILIKE '%inventory%' OR fc.title ILIKE '%asset%' OR fc.title ILIKE '%configuration%')
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'lean'),
    messages: [{ role: 'user', content: `Analyze asset inventory for potential Shadow IT gaps.

Registered Assets:
${compactJSON(assets.rows)}

Asset-related Controls:
${compactJSON(controls.rows)}

Analyze and provide:
1. Categories of assets that are typically present but missing from inventory
2. Common Shadow IT patterns based on the current asset profile
3. Specific asset types that should be investigated
4. Questions to ask department heads about undocumented systems
5. Automated discovery recommendations (tools and techniques)
6. Risk exposure from potential unregistered assets
7. Compliance impact of Shadow IT on adopted frameworks` }]
  });
}

// =====================================================================
// 13. AI/ML MODEL GOVERNANCE CHECKS
// =====================================================================
async function checkAIGovernance({ organizationId, provider, model }) {
  const aiAssets = await pool.query(`
    SELECT a.name, a.ai_model_type, a.ai_risk_level, a.ai_training_data_source,
      a.ai_bias_testing_completed, a.ai_bias_testing_date, a.ai_human_oversight_required,
      a.status, a.version
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1 AND ac.code = 'ai_agent'
  `, [organizationId]);

  const aiControls = await pool.query(`
    SELECT f.code, f.name, fc.control_id, fc.title, COALESCE(ci.status, 'not_started') as status
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    AND f.code IN ('eu_ai_act', 'nist_ai_rmf', 'iso_42001', 'iso_42005', 'aiuc_1')
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'ai_governance'),
    messages: [{ role: 'user', content: `Perform AI/ML model governance assessment.

AI Assets:
${compactJSON(aiAssets.rows)}

AI Governance Controls:
${compactJSON(aiControls.rows)}

Assess:
1. EU AI Act compliance status per AI asset (risk classification, conformity assessment)
2. NIST AI RMF alignment check
3. ISO/IEC 42001 AI management system alignment (governance and operational controls)
4. ISO/IEC 42005 AI system impact assessment coverage
5. Bias testing gaps and recommendations
6. Data governance status for training data
7. Human oversight requirements vs current implementation
8. Model documentation completeness
9. Transparency and explainability gaps
10. AIUC-1 agentic AI certification readiness (Data & Privacy, Security, Safety, Reliability, Accountability, Societal Impact)
11. Recommended governance actions prioritized by risk level` }]
  });
}

// =====================================================================
// 14. NATURAL LANGUAGE COMPLIANCE QUERY
// =====================================================================
async function queryCompliance({ organizationId, question, provider, model }) {
  const stats = await pool.query(`
    SELECT f.code, f.name,
      COUNT(fc.id) as total, COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
      ROUND(COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric / NULLIF(COUNT(fc.id),0) * 100, 1) as pct
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1 GROUP BY f.id, f.code, f.name
  `, [organizationId]);

  const assetCount = await pool.query('SELECT COUNT(*) as count FROM assets WHERE organization_id = $1', [organizationId]);
  const evidenceCount = await pool.query('SELECT COUNT(*) as count FROM evidence WHERE organization_id = $1', [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, "Answer the user's compliance question based on their actual data. Be specific and cite numbers.", 'compact', null, 'copilot'),
    messages: [{ role: 'user', content: `Question: ${question}

Organization Data:
- Framework Compliance: ${JSON.stringify(stats.rows)}
- Total Assets: ${assetCount.rows[0].count}
- Total Evidence: ${evidenceCount.rows[0].count}

Answer the question thoroughly based on this data.` }]
  });
}

// =====================================================================
// 15. TRAINING RECOMMENDATIONS
// =====================================================================
async function recommendTraining({ organizationId, provider, model }) {
  const gaps = await pool.query(`
    SELECT f.code, fc.control_id, fc.title, fc.priority
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1 AND (ci.status IS NULL OR ci.status = 'not_started')
    ORDER BY fc.priority LIMIT 50
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'lean'),
    messages: [{ role: 'user', content: `Recommend security awareness training based on compliance gaps.

Unimplemented Controls:
${compactJSON(gaps.rows)}

Provide:
1. Priority training topics based on gaps (ranked)
2. Target audience for each topic (IT, management, all staff, developers)
3. Recommended training format (online, hands-on, workshop)
4. Suggested training providers/resources
5. Training schedule recommendation
6. How each training topic maps to specific control gaps
7. KPIs to measure training effectiveness` }]
  });
}

// =====================================================================
// 16. EVIDENCE COLLECTION ASSISTANT
// =====================================================================
async function suggestEvidence({ controlId, organizationId, provider, model, schemaRetryHint = null }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code, f.name as framework_name
    FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE fc.id = $1
  `, [controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  const retryBlock = schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : '';

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'evidence'),
    messages: [{ role: 'user', content: `Suggest evidence artifacts for this control.${buildFewShotBlock('evidence_suggestion')}

Control: ${compactJSON(control.rows[0])}

Return a JSON object with:
- control_id, control_title, framework
- evidence_items: array of { title, description, collection_method, format, freshness_days, automation_possible, automation_hint, example_filename, sufficiency_criteria }
- collection_notes: string
- estimated_collection_hours: number${retryBlock}` }],
    feature: 'evidence_suggestion'
  });
}

// =====================================================================
// BONUS: CONTROL ANALYSIS (existing feature)
// =====================================================================
async function analyzeControl({ controlId, organizationId, provider, model }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code, f.name as framework_name,
      COALESCE(ci.status, 'not_started') as impl_status
    FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE fc.id = $2
  `, [organizationId, controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'controls'),
    messages: [{ role: 'user', content: `Analyze this control and provide implementation guidance.

Control: ${compactJSON(control.rows[0])}

Provide:
1. Plain-English explanation of what this control requires
2. Implementation approach for a mid-size organization
3. Technical vs procedural requirements
4. Estimated implementation effort
5. Key evidence artifacts needed
6. Related controls and dependencies` }]
  });
}

// =====================================================================
// BONUS: GENERATE TEST PROCEDURES
// =====================================================================
async function generateTestProcedures({ controlId, organizationId, provider, model, schemaRetryHint = null }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id WHERE fc.id = $1
  `, [controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'controls'),
    messages: [{ role: 'user', content: `Generate test procedures for this control.${buildFewShotBlock('test_procedures')}

Control: ${compactJSON(control.rows[0])}

Provide:
1. Test objective
2. Test steps (numbered, detailed)
3. Expected results for pass/fail
4. Sample sizes and frequency
5. Automation scripts where applicable
6. Evidence to collect during testing${schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : ''}` }],
    feature: 'test_procedures'
  });
}

// =====================================================================
// BONUS: ASSET RISK ANALYSIS
// =====================================================================
async function analyzeAssetRisk({ assetId, organizationId, provider, model }) {
  const asset = await pool.query(`
    SELECT a.*, ac.name as category_name, ac.code as category_code, e.name as environment_name
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.id = $1 AND a.organization_id = $2
  `, [assetId, organizationId]);

  if (asset.rows.length === 0) throw new Error('Asset not found');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'risk'),
    messages: [{ role: 'user', content: `Perform a risk analysis on this asset.

Asset: ${compactJSON(asset.rows[0])}

Provide:
1. Risk score (1-100) with justification
2. Threat vectors specific to this asset type
3. Vulnerability assessment areas
4. Compliance requirements (which frameworks apply)
5. Recommended security controls
6. Monitoring recommendations` }]
  });
}

// =====================================================================
// BONUS: POLICY GENERATOR
// =====================================================================
async function generatePolicy({ policyType, organizationId, provider, model }) {
  const frameworks = await pool.query(`
    SELECT f.code, f.name FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id WHERE of2.organization_id = $1
  `, [organizationId]);

  return chat({
    provider, model, organizationId, maxTokens: 8192,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'policy'),
    messages: [{ role: 'user', content: `Generate a comprehensive ${policyType} policy document.

Adopted Frameworks: ${JSON.stringify(frameworks.rows)}

Generate a complete, professional policy including:
1. Policy title, version, effective date placeholders
2. Purpose and scope
3. Policy statements (specific, actionable)
4. Roles and responsibilities
5. Procedures and standards
6. Compliance and enforcement
7. Related policies and references
8. Revision history template
Map requirements to the organization's adopted frameworks where applicable.` }]
  });
}

// =====================================================================
// AUDITOR AI: PBC REQUEST DRAFTING
// =====================================================================
async function generateAuditPbcDraft({
  organizationId,
  provider,
  model,
  requestContext,
  controlId,
  frameworkCode,
  dueDate,
  priority,
  templateStandard
}) {
  if (!requestContext || !String(requestContext).trim()) {
    throw new Error('requestContext is required');
  }

  let control = null;
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.control_id, fc.title, fc.description, f.code as framework_code, f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
      LIMIT 1
    `, [controlId]);
    control = controlResult.rows[0] || null;
  }

  const recentResults = await pool.query(`
    SELECT ar.status, ar.risk_level, ar.finding, ar.evidence_collected,
      ap.procedure_id, ap.title AS procedure_title, fc.control_id, f.code AS framework_code
    FROM assessment_results ar
    JOIN assessment_procedures ap ON ap.id = ar.assessment_procedure_id
    JOIN framework_controls fc ON fc.id = ap.framework_control_id
    JOIN frameworks f ON f.id = fc.framework_id
    WHERE ar.organization_id = $1
    ORDER BY COALESCE(ar.assessed_at, ar.updated_at, ar.created_at) DESC
    LIMIT 20
  `, [organizationId]);

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'You are helping an auditor draft request-for-evidence (PBC) items.', 'compact', null, 'audit'),
    messages: [{
      role: 'user',
      content: `Draft a high-quality PBC (Provided By Client) request that is auditor-ready.

Audit Request Context:
${requestContext}

Optional Metadata:
- frameworkCode: ${frameworkCode || 'not provided'}
- controlId: ${controlId || 'not provided'}
- dueDate: ${dueDate || 'not provided'}
- priority: ${priority || 'not provided'}

Template Standard (follow this structure and tone when provided):
${templateStandard || 'No custom template provided.'}

Control Context (if available):
${compactJSON(control)}

Recent Assessment Context:
${compactJSON(recentResults.rows)}

Return:
1. PBC request title
2. Exact artifacts requested (bulleted list)
3. Period covered and sampling expectations
4. Acceptance criteria (what makes evidence sufficient)
5. Follow-up questions if evidence is incomplete
6. A JSON block:
{
  "title": "...",
  "request_details": "...",
  "requested_artifacts": ["..."],
  "acceptance_criteria": ["..."],
  "suggested_due_date": "${dueDate || ''}",
  "priority": "${priority || 'medium'}"
}`
    }]
  });
}

// =====================================================================
// AUDITOR AI: WORKPAPER DRAFTING
// =====================================================================
async function generateAuditWorkpaperDraft({
  organizationId,
  provider,
  model,
  controlId,
  objective,
  procedurePerformed,
  evidenceSummary,
  testOutcome,
  templateStandard
}) {
  if (!objective || !String(objective).trim()) {
    throw new Error('objective is required');
  }

  let control = null;
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.control_id, fc.title, fc.description, f.code as framework_code, f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
      LIMIT 1
    `, [controlId]);
    control = controlResult.rows[0] || null;
  }

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'You are helping an auditor draft formal workpaper narratives.', 'compact', null, 'audit'),
    messages: [{
      role: 'user',
      content: `Draft an auditor workpaper narrative.

Control Context:
${compactJSON(control)}

Inputs:
- Objective: ${objective}
- Procedure Performed: ${procedurePerformed || 'not provided'}
- Evidence Summary: ${evidenceSummary || 'not provided'}
- Test Outcome: ${testOutcome || 'not provided'}

Template Standard (follow this structure and tone when provided):
${templateStandard || 'No custom template provided.'}

Return:
1. Workpaper title
2. Objective section
3. Scope and sampling section
4. Procedure performed (auditor-style narrative)
5. Results and exceptions
6. Conclusion with alignment to control intent
7. Reviewer checklist
8. A JSON block:
{
  "title": "...",
  "objective": "...",
  "procedure_performed": "...",
  "conclusion": "...",
  "status_recommendation": "draft|in_review|finalized"
}`
    }]
  });
}

// =====================================================================
// AUDITOR AI: FINDING DRAFTING
// =====================================================================
async function generateAuditFindingDraft({
  organizationId,
  provider,
  model,
  controlId,
  issueSummary,
  evidenceSummary,
  severityHint,
  recommendationScope,
  templateStandard,
  schemaRetryHint = null
}) {
  if (!issueSummary || !String(issueSummary).trim()) {
    throw new Error('issueSummary is required');
  }

  let control = null;
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.control_id, fc.title, fc.description, f.code as framework_code, f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
      LIMIT 1
    `, [controlId]);
    control = controlResult.rows[0] || null;
  }

  const peerFindings = await pool.query(`
    SELECT status, risk_level, finding
    FROM assessment_results
    WHERE organization_id = $1
      AND status = 'other_than_satisfied'
      AND finding IS NOT NULL
    ORDER BY COALESCE(assessed_at, updated_at, created_at) DESC
    LIMIT 10
  `, [organizationId]);

  const retryBlock = schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : '';

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'You are helping an auditor draft findings using observation/criteria/cause/effect format.', 'compact', null, 'audit'),
    messages: [{
      role: 'user',
      content: `Draft a formal audit finding.${buildFewShotBlock('finding')}

Control Context:
${compactJSON(control)}

Inputs:
- Issue Summary: ${issueSummary}
- Evidence Summary: ${evidenceSummary || 'not provided'}
- Severity Hint: ${severityHint || 'not provided'}
- Recommendation Scope: ${recommendationScope || 'not provided'}

Template Standard (follow this structure and tone when provided):
${templateStandard || 'No custom template provided.'}

Recent Comparable Findings:
${compactJSON(peerFindings.rows)}

Return a JSON object with:
{
  "title": "...",
  "severity": "low|medium|high|critical",
  "criteria": "...",
  "condition": "...",
  "cause": "...",
  "effect": "...",
  "recommendation": "...",
  "management_response_placeholder": "...",
  "related_controls": ["..."],
  "repeat_finding": false
}${retryBlock}`
    }]
  });
}

// ---------- Usage tracking ----------
/**
 * Log an AI call to ai_usage_log.
 * @param {string} organizationId
 * @param {string} userId
 * @param {string} feature
 * @param {string} provider
 * @param {string|null} model
 * @param {object} [opts] - Extended fields: success, errorMessage, tokensInput, tokensOutput,
 *                          resourceType, resourceId, ipAddress, durationMs, byokUsed
 */
async function logAIUsage(organizationId, userId, feature, provider, model, opts = {}) {
  const {
    success = true,
    errorMessage = null,
    tokensInput = null,
    tokensOutput = null,
    resourceType = null,
    resourceId = null,
    ipAddress = null,
    durationMs = null,
    byokUsed = false,
  } = opts;

  await pool.query(`
    INSERT INTO ai_usage_log
      (organization_id, user_id, feature, provider, model,
       success, error_message, tokens_input, tokens_output,
       resource_type, resource_id, ip_address, duration_ms, byok_used, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
  `, [organizationId, userId, feature, provider, model,
      success, errorMessage, tokensInput, tokensOutput,
      resourceType, resourceId, ipAddress, durationMs, byokUsed]);
}

// High-stakes features that warrant a full ai_decision_log entry
const HIGH_STAKES_FEATURES = new Set([
  'gap_analysis', 'compliance_forecast', 'remediation_playbook',
  'incident_response', 'executive_report', 'risk_heatmap', 'vendor_risk'
]);

// Map feature → primary regulatory framework for traceability
function inferRegulatoryFramework(feature) {
  switch (feature) {
    case 'gap_analysis':
    case 'compliance_forecast':
      return 'Multi-framework';
    case 'remediation_playbook':
    case 'incident_response':
      return 'NIST 800-53';
    case 'executive_report':
      return 'SOC 2';
    case 'risk_heatmap':
    case 'vendor_risk':
      return 'ISO 27001';
    default:
      return 'Multi-framework';
  }
}

/**
 * Lightweight heuristic bias detection on AI outputs.
 * Returns an array of flag objects: [{ type, severity, detail }]
 * Never throws — bias detection errors are swallowed.
 */
function detectBiasFlags(feature, outputText) {
  if (!outputText || typeof outputText !== 'string') return [];
  const flags = [];
  const text = outputText.toLowerCase();

  // Subjectivity signals in executive reports
  if (feature === 'executive_report') {
    const subjectiveTerms = ['significantly', 'extremely', 'very high', 'very low', 'clearly indicates'];
    for (const term of subjectiveTerms) {
      if (text.includes(term)) {
        flags.push({ type: 'subjectivity', severity: 'low', detail: `Output uses subjective qualifier "${term}" without quantitative basis.` });
        break;
      }
    }
  }

  // Vendor-specific naming without evidence in vendor risk
  if (feature === 'vendor_risk') {
    const vendorPattern = /\b(company|vendor|supplier|provider)\s+[A-Z][a-z]+\b/;
    if (vendorPattern.test(outputText)) {
      flags.push({ type: 'vendor_naming', severity: 'medium', detail: 'Output references specific named entities — verify findings are evidence-based, not assumption-based.' });
    }
  }

  // Recommendation inconsistency in remediation
  if (feature === 'remediation_playbook') {
    const frameworkCount = (text.match(/nist|iso|soc\s*2|hipaa|gdpr|pci/g) || []).length;
    if (frameworkCount > 4) {
      flags.push({ type: 'framework_inconsistency', severity: 'low', detail: `Output references ${frameworkCount} frameworks — verify recommendations are consistent across all.` });
    }
  }

  return flags;
}

/**
 * Write to ai_decision_log for high-stakes AI outputs.
 * Captures SHA-256 hashes of input and output for integrity verification.
 * @param {object} opts - { organizationId, feature, inputText, outputText, modelVersion, correlationId, sessionId, resourceType, resourceId }
 */
async function logAIDecision(organizationId, feature, inputText, outputText, opts = {}) {
  if (!HIGH_STAKES_FEATURES.has(feature)) return;
  try {
    const inputHash  = crypto.createHash('sha256').update(inputText  || '').digest('hex');
    const outputHash = crypto.createHash('sha256').update(outputText || '').digest('hex');
    const riskLevel  = ['incident_response', 'remediation_playbook'].includes(feature) ? 'high' : 'limited';
    const regulatoryFramework = inferRegulatoryFramework(feature);
    const biasFlags = detectBiasFlags(feature, outputText);

    // Ensure input/output are valid JSON before inserting into jsonb columns
    const safeInput  = (() => { try { JSON.parse(inputText  || '""'); return inputText  || '""'; } catch { return JSON.stringify({ text: inputText  || '' }); } })();
    const safeOutput = (() => { try { JSON.parse(outputText || '""'); return outputText || '""'; } catch { return JSON.stringify({ text: outputText || '' }); } })();

    await pool.query(`
      INSERT INTO ai_decision_log
        (organization_id, input_data, input_hash, output_data, output_hash,
         human_reviewed, risk_level, regulatory_framework, model_version,
         correlation_id, session_id, processing_timestamp, bias_flags, bias_reviewed,
         data_lineage)
      VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, false, $6, $7, $8, $9, $10, NOW(), $11::jsonb, false, $12)
    `, [
      organizationId,
      safeInput,
      inputHash,
      safeOutput,
      outputHash,
      riskLevel,
      regulatoryFramework,
      opts.modelVersion || null,
      opts.correlationId || null,
      opts.sessionId || null,
      JSON.stringify(biasFlags),
      opts.dataLineage || null
    ]);
  } catch (err) {
    // Non-critical — never block the response due to logging failure
    console.error('logAIDecision error:', err.message);
  }
}

async function getUsageCount(organizationId) {
  // Only count successful calls — failed attempts should not burn the monthly quota
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM ai_usage_log
    WHERE organization_id = $1
      AND created_at >= DATE_TRUNC('month', NOW())
      AND (success IS NULL OR success = true)
  `, [organizationId]);
  return parseInt(result.rows[0].count);
}

function getUsageLimit(tier) {
  return getAiUsageLimit(tier);
}

// ---------- Provider status ----------
function getProviderStatus(orgKeys = {}) {
  return {
    claude:  { available: !!orgKeys.claude, models: PROVIDERS.claude.models },
    openai:  { available: !!orgKeys.openai, models: PROVIDERS.openai.models },
    gemini:  { available: !!orgKeys.gemini, models: PROVIDERS.gemini.models },
    grok:    { available: !!orgKeys.grok, models: PROVIDERS.grok.models },
    groq:    { available: !!orgKeys.groq, models: PROVIDERS.groq.models },
    ollama:  { available: !!orgKeys.ollama, models: PROVIDERS.ollama.models }
  };
}

// =====================================================================
// TPRM: GENERATE VENDOR QUESTIONNAIRE
// =====================================================================
async function generateVendorQuestionnaire({ organizationId, vendorInfo, provider, model }) {
  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'risk'),
    messages: [{
      role: 'user',
      content: `Generate a security questionnaire for a third-party vendor to assess their security posture and compliance.

Vendor Information:
${compactJSON(vendorInfo)}

Create a comprehensive questionnaire with 15-20 questions covering:
1. Information Security Program (policies, ISMS, certifications)
2. Data Protection & Privacy (data handling, encryption, retention, GDPR/CCPA)
3. Access Control & Identity Management (MFA, PAM, least privilege)
4. Incident Response & Business Continuity (IR plan, RTO/RPO, BCP testing)
5. Vulnerability Management (patching, pen testing, vulnerability scanning)
6. Supply Chain & Subprocessors (fourth-party risk, subprocessor list)
7. Physical Security (data center controls, media disposal)

Return a JSON array of question objects. Each object must have:
- id: sequential string (e.g., "Q1", "Q2")
- category: one of the categories above
- question: the question text
- type: "yes_no", "text", "multiple_choice", or "rating_1_5"
- options: array of strings (only for multiple_choice type, otherwise omit)
- required: boolean
- guidance: brief guidance note for the vendor answering the question

Return ONLY the JSON array, no other text.`
    }]
  });
}

// =====================================================================
// TPRM: ANALYZE QUESTIONNAIRE RESPONSES
// =====================================================================
async function analyzeQuestionnaireResponses({ organizationId, vendorInfo, questions, responses, provider, model }) {
  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'risk'),
    messages: [{
      role: 'user',
      content: `Analyze the completed security questionnaire responses for this third-party vendor.

Vendor Information:
${compactJSON(vendorInfo)}

Questions and Responses:
${compactJSON({ questions, responses })}

Provide:
1. Overall security posture score (0-100) with justification
2. Risk rating: critical / high / medium / low
3. Key findings — both positive and negative
4. Compliance gaps identified
5. Recommended risk mitigations (specific, actionable)
6. Documentation or certifications that should be requested
7. Recommended re-assessment timeline
8. Whether this vendor should be approved, conditionally approved, or rejected

Format your response as structured analysis with clear sections.`
    }]
  });
}

// =====================================================================
// TPRM: ANALYZE VENDOR EVIDENCE (SBOM + DOCUMENTS)
// =====================================================================
const MAX_CONTENT_PREVIEW_LENGTH = 1500;

async function analyzeVendorEvidence({ organizationId, vendorInfo, questionnaireTitle, questions, responses, evidenceList, provider, model }) {
  // Build a concise summary of each evidence file for the prompt (avoid sending full file content for large files)
  const evidenceSummary = evidenceList.map((ev, i) => {
    const parts = [`[Evidence ${i + 1}] "${ev.original_filename}" (${Math.round(ev.file_size_bytes / 1024)} KB)`];
    if (ev.is_sbom && ev.sbom_summary) {
      let s = ev.sbom_summary;
      if (typeof s === 'string') {
        try { s = JSON.parse(s); } catch { s = {}; }
      }
      if (!s || typeof s !== 'object') s = {};
      parts.push(`  Type: SBOM (${s.format || 'unknown format'})`);
      parts.push(`  Components: ${s.component_count || 0}`);
      parts.push(`  Vulnerabilities found: ${s.vulnerability_count || 0}`);
      if (Array.isArray(s.top_vulnerabilities) && s.top_vulnerabilities.length > 0) {
        const vulnList = s.top_vulnerabilities.slice(0, 5).map(v => `${v.id} [${v.severity}]`).join(', ');
        parts.push(`  Top vulnerabilities: ${vulnList}`);
      }
      if (Array.isArray(s.components) && s.components.length > 0) {
        const sampleComponents = s.components.slice(0, 10).map(c => `${c.name}@${c.version || '?'}`).join(', ');
        parts.push(`  Sample components: ${sampleComponents}`);
      }
    } else {
      parts.push(`  Type: Document (${ev.mime_type || 'unknown'})`);
      if (ev.file_content && !ev.file_content.startsWith('base64:')) {
        const preview = ev.file_content.slice(0, MAX_CONTENT_PREVIEW_LENGTH).replace(/\s+/g, ' ').trim();
        if (preview.length > 50) {
          parts.push(`  Content preview: ${preview}${ev.file_content.length > MAX_CONTENT_PREVIEW_LENGTH ? '...' : ''}`);
        }
      }
    }
    return parts.join('\n');
  }).join('\n\n');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'evidence'),
    messages: [{
      role: 'user',
      content: `You are a third-party risk analyst. A vendor has submitted their security questionnaire responses AND evidence files for review.

Vendor Information:
${compactJSON(vendorInfo)}

Questionnaire: "${questionnaireTitle}"

Questionnaire Responses Summary:
${compactJSON({ questions: (questions || []).slice(0, 10), responses: responses || {} })}

Evidence Submitted (${evidenceList.length} file${evidenceList.length !== 1 ? 's' : ''}):
${evidenceSummary || '(No evidence provided)'}

Analyze the evidence in the context of the questionnaire responses. For each evidence file:
1. Does it corroborate or contradict the vendor's questionnaire answers?
2. For SBOMs: are there known vulnerabilities? Prohibited or high-risk licenses? Outdated components?
3. For documents (certs, reports): are they current? Do they satisfy the control areas asked about?

Then provide an overall evidence-based verification:
- Evidence quality score (0-100)
- Which questionnaire claims are VERIFIED by evidence
- Which claims are UNVERIFIED or CONTRADICTED
- Risk flags identified in the evidence (list with severity: critical/high/medium/low)
- Recommended follow-up requests or remediation actions
- Overall vendor trust assessment

Format your response with clear sections. Be specific and cite the evidence file names.`
    }]
  });
}

module.exports = {
  chat,
  chatStream,
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
  assessAuditReadiness,
  generateVendorQuestionnaire,
  analyzeQuestionnaireResponses,
  analyzeVendorEvidence,
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
  generateAuditPbcDraft,
  generateAuditWorkpaperDraft,
  generateAuditFindingDraft,
  logAIUsage,
  logAIDecision,
  getUsageCount,
  getUsageLimit,
  getProviderStatus,
  getOrgApiKey,
  getPlatformApiKey,
  resolveApiKey,
  getPlatformDefaultProvider,
  getAllOrgApiKeys,
  getAllPlatformApiKeys,
  invalidateApiKeyCache,
  invalidatePlatformApiKeyCache,
  invalidateAICache,
  cleanupAICache,
  withAITrackingContext,
  getAITrackingContext,
  getOrgDefaultProvider,
  getOrgDefaultModel,
  buildPersonalizedSystem,
  buildGrcSystem,
  PROMPT_PROFILES,
  PROVIDERS,
  TASK_PROFILES,
  FEATURE_TASK_PROFILE,
  resolveTaskModel,
  buildFewShotBlock,
  loadExemplars
};
