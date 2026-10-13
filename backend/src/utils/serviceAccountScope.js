'use strict';

/**
 * Service account token scopes. The set is closed: routes/serviceAccounts.js
 * rejects anything else on write, and middleware/auth.js treats any value it
 * does not recognize (including legacy free-text rows) as read-only, so an
 * unknown scope can never widen access.
 *
 *   read-only  GET, HEAD and OPTIONS only (the default when unset)
 *   full       any method, within the owner's own permissions
 */
const SERVICE_ACCOUNT_SCOPES = Object.freeze(['read-only', 'full']);

function normalizeScopeText(scope) {
  return String(scope).trim().toLowerCase();
}

/**
 * Validate a scope supplied on create or update.
 * Unset (undefined, null, empty or whitespace) is valid and yields null, which
 * is minted and enforced as read-only.
 *
 * @param {unknown} value
 * @returns {{ valid: boolean, scope: string|null }}
 */
function parseServiceAccountScope(value) {
  if (value === undefined || value === null) return { valid: true, scope: null };
  if (typeof value !== 'string') return { valid: false, scope: null };
  const text = normalizeScopeText(value);
  if (text === '') return { valid: true, scope: null };
  if (SERVICE_ACCOUNT_SCOPES.includes(text)) return { valid: true, scope: text };
  return { valid: false, scope: null };
}

/**
 * True only for the one scope that may use unsafe HTTP methods. Default-deny:
 * null, empty, non-string and unrecognized values are all read-only.
 *
 * @param {unknown} scope
 * @returns {boolean}
 */
function isWriteScope(scope) {
  return typeof scope === 'string' && normalizeScopeText(scope) === 'full';
}

module.exports = { SERVICE_ACCOUNT_SCOPES, parseServiceAccountScope, isWriteScope };
