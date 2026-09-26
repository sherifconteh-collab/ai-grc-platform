// @tier: community
'use strict';

const { AsyncLocalStorage } = require('async_hooks');

/**
 * Per-request audit context. The baseline audit middleware opens a context for
 * each API request; createAuditLog marks it when a handler writes its own,
 * more specific audit event, so the baseline does not add a duplicate.
 */
const storage = new AsyncLocalStorage();

// fn receives the context object so callers can read it from callbacks (such
// as a response 'finish' listener) that may run outside the request's async
// context.
function runWithAuditContext(fn) {
  const store = { audited: false };
  return storage.run(store, () => fn(store));
}

function markRequestAudited() {
  const store = storage.getStore();
  if (store) store.audited = true;
}

function wasRequestAudited() {
  const store = storage.getStore();
  return Boolean(store && store.audited);
}

module.exports = { runWithAuditContext, markRequestAudited, wasRequestAudited };
