#!/usr/bin/env node
// @tier: community
/**
 * MCP Auth Logout — revoke the stored MCP session on the server, then remove
 * the local session file.
 *
 * Usage:
 *   npm run mcp:logout             # revoke server side, then delete the file
 *   npm run mcp:logout -- --force  # delete the file even if the API cannot be reached
 *
 * POST /auth/logout deletes the user's refresh sessions, so a copied
 * mcp-session.json stops working. If the API cannot be reached the local file
 * is KEPT (so you can retry) and the command exits non-zero, unless --force
 * is given, in which case the file is removed and the exit code is still
 * non-zero to make clear the server session was not revoked.
 */

'use strict';

const {
  deleteSession,
  getSessionFilePath,
  isJwtExpiring,
  normalizeApiBaseUrl,
  readSession,
  refreshWithRefreshToken
} = require('./mcp-auth-session');

const REVOKED = 'revoked';
const ALREADY_INVALID = 'already_invalid';
const UNREACHABLE = 'unreachable';
const REJECTED = 'rejected';

/**
 * Call POST /auth/logout with the stored token.
 * Returns { outcome, detail }. Never throws.
 */
async function revokeRemoteSession(session, { env = process.env, timeoutMs } = {}) {
  const apiBase = normalizeApiBaseUrl(
    env.GRC_API_BASE_URL || session.apiBaseUrl || 'http://localhost:3001/api/v1'
  );
  const timeout = timeoutMs || parseInt(env.MCP_REQUEST_TIMEOUT_MS || '30000', 10);

  if (!session.accessToken && !session.refreshToken) {
    return { outcome: ALREADY_INVALID, detail: 'Session file holds no tokens.' };
  }

  let accessToken = session.accessToken;
  try {
    // The logout route requires a valid access token; renew an expired one first.
    if ((!accessToken || isJwtExpiring(accessToken, 0)) && session.refreshToken) {
      try {
        accessToken = await refreshWithRefreshToken({
          apiBaseUrl: apiBase,
          refreshToken: session.refreshToken,
          timeoutMs: timeout
        });
      } catch (err) {
        if (err && (err.name === 'AbortError' || err.cause || err instanceof TypeError)) throw err;
        return { outcome: ALREADY_INVALID, detail: `Refresh token no longer accepted (${err.message}).` };
      }
    }
    if (!accessToken) {
      return { outcome: ALREADY_INVALID, detail: 'No usable access token to authorize logout.' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) return { outcome: REVOKED, detail: 'Server session revoked.' };
    if (response.status === 401) {
      return { outcome: ALREADY_INVALID, detail: 'Server no longer accepts this token (HTTP 401).' };
    }
    return { outcome: REJECTED, detail: `API returned HTTP ${response.status}.` };
  } catch (err) {
    const detail = err && err.name === 'AbortError'
      ? `API did not respond within ${timeout} ms.`
      : `Could not reach API at ${apiBase}: ${err && err.message ? err.message : err}`;
    return { outcome: UNREACHABLE, detail };
  }
}

/**
 * Run logout. Returns the process exit code.
 */
async function logout({ env = process.env, argv = [], out = (line) => console.error(line) } = {}) {
  const sessionFile = getSessionFilePath(env);
  const force = argv.includes('--force');
  const existing = readSession(sessionFile);

  if (!existing) {
    out('No active MCP session found.');
    return 0;
  }

  const { outcome, detail } = await revokeRemoteSession(existing, { env });
  const serverClean = outcome === REVOKED || outcome === ALREADY_INVALID;

  if (!serverClean && !force) {
    out('');
    out('  ✗ Logout NOT completed: the server session was not revoked.');
    out(`    ${detail}`);
    out(`    The local session file was kept so you can retry: ${sessionFile}`);
    out('    Re-run "npm run mcp:logout" when the API is reachable, or use');
    out('    "npm run mcp:logout -- --force" to delete the file anyway (the refresh');
    out('    token then stays valid server side until it expires).');
    out('');
    return 1;
  }

  deleteSession(sessionFile);

  out('');
  out('='.repeat(60));
  out('  ControlWeave MCP — Logged out');
  out('='.repeat(60));
  if (existing.email) out(`  Previous user: ${existing.email}`);
  out(`  Session file removed: ${sessionFile}`);
  if (serverClean) {
    out(`  Server session: ${detail}`);
    out('');
    return 0;
  }
  out(`  ⚠  Server session NOT revoked (--force): ${detail}`);
  out('     The refresh token stays valid server side until it expires.');
  out('');
  return 1;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  logout({ argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('  ✗ Unexpected error:', err.message);
      process.exit(1);
    });
}

module.exports = { logout, revokeRemoteSession };
