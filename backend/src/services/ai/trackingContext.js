/**
 * AsyncLocalStorage-based tracking context for AI provider attempts.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * The single aiTrackingStorage instance lives here; chatCore records
 * attempts/success into it and routes read it via withAITrackingContext.
 */

'use strict';

const { AsyncLocalStorage } = require('async_hooks');

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

module.exports = {
  withAITrackingContext,
  getAITrackingContext,
  recordAIAttempt,
  markAISuccess,
};
