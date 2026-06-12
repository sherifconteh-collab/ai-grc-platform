/**
 * Provider chat execution, fallback chain construction, and retry utilities.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * The logic here is identical to the original inline definitions; only the
 * location has changed.
 */

'use strict';

const {
  GEMINI_API_BASE,
  VALID_PROVIDERS,
  getDefaultModelForProvider,
} = require('./keyResolution');

const PROVIDER_FALLBACK_ORDER = ['claude', 'openai', 'grok', 'gemini', 'groq', 'ollama'];

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

module.exports = {
  PROVIDER_FALLBACK_ORDER,
  AI_MAX_RETRIES,
  AI_RETRY_BASE_DELAY_MS,
  buildProviderAttemptChain,
  isRetryableProviderError,
  buildNoKeyError,
  executeProviderChat,
  sleep,
};
