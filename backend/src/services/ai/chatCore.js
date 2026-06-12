/**
 * Core LLM chat pipeline: input sanitization, PII/PHI privacy controls,
 * provider fallback orchestration (chat + chatStream), compact JSON helper,
 * and the org-personalized system prompt builder.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * The logic here is identical to the original inline definitions; only the
 * location has changed.
 */

'use strict';

const { buildOrgContext, buildFrameworkGuardrails } = require('../orgContextService');
const { hasFeatureSchema } = require('../llmSchemas');
const aiSecurity = require('../../utils/aiSecurity');
const { buildGrcSystem, GRC_SYSTEM } = require('./prompts');
const { resolveTaskModel } = require('./providerConfig');
const {
  GEMINI_API_BASE,
  VALID_PROVIDERS,
  getClient,
  getDefaultModelForProvider,
  getOrgDefaultModel,
  resolveApiKey,
} = require('./keyResolution');
const { recordAIAttempt, markAISuccess } = require('./trackingContext');
const {
  AI_MAX_RETRIES,
  AI_RETRY_BASE_DELAY_MS,
  buildNoKeyError,
  buildProviderAttemptChain,
  executeProviderChat,
  isRetryableProviderError,
  sleep,
} = require('./providerExec');

let _orgRagService = null;
const buildRagContext = (...args) => {
  if (!_orgRagService) _orgRagService = require('../orgRagService');
  return _orgRagService.buildRagContext(...args);
};

// Set PHI_REDACT_ONLY=true to redact PHI inline instead of blocking the request.
// WARNING: PHI_REDACT_ONLY=true may not satisfy all HIPAA requirements — use only
// when routing exclusively to HIPAA-BAA-covered providers.
const PHI_REDACT_ONLY = process.env.PHI_REDACT_ONLY === 'true';

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

module.exports = {
  chat,
  chatStream,
  compactJSON,
  buildPersonalizedSystem,
};
