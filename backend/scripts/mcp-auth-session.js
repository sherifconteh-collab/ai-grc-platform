#!/usr/bin/env node
// @tier: community
/**
 * MCP Auth Session — shared session persistence and JWT helpers.
 *
 * Used by mcp-server-secure.js (runtime), mcp-auth-login.js, mcp-auth-logout.js,
 * and mcp-auth-status.js.
 *
 * Session file is stored at ~/.controlweave/mcp-session.json by default.
 * Override with the MCP_SESSION_FILE environment variable.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────────

const DEFAULT_SESSION_DIR = path.join(os.homedir(), '.controlweave');
const DEFAULT_SESSION_FILE = path.join(DEFAULT_SESSION_DIR, 'mcp-session.json');

/**
 * Expand a leading `~` or `~/` to the current user's home directory.
 */
function expandTilde(p) {
  if (typeof p === 'string' && p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Return the absolute path to the session file.
 * Honors the MCP_SESSION_FILE env var if provided.
 * A leading `~` is expanded to the user's home directory.
 */
function getSessionFilePath(env) {
  const raw = (env && env.MCP_SESSION_FILE) || DEFAULT_SESSION_FILE;
  return expandTilde(raw);
}

// ── URL helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize API base URL by trimming trailing slashes and ensuring it does not
 * end with a double-slash.  Returns a string safe for use with new URL().
 */
function normalizeApiBaseUrl(raw) {
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

// ── JWT helpers (decode-only, no verification) ─────────────────────────────────

/**
 * Decode the payload portion of a JWT **without** verifying the signature.
 * Returns the parsed payload object, or null on any error.
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Return the expiry timestamp (in ms since epoch) from a JWT, or null.
 */
function getJwtExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000;
}

/**
 * Return true when the token will expire within `bufferMs` milliseconds.
 * Returns true (treat as expiring) when the token cannot be decoded.
 */
function isJwtExpiring(token, bufferMs = 60000) {
  const expiryMs = getJwtExpiryMs(token);
  if (!expiryMs) return true;
  return Date.now() + bufferMs >= expiryMs;
}

// ── Session file I/O ───────────────────────────────────────────────────────────

/**
 * Read and parse the session file.  Returns the session object or null.
 */
function readSession(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write a session object to disk.  Creates the parent directory with mode 0700
 * and writes the file with mode 0600 so only the current user can access it.
 * Explicitly sets permissions after writing to handle pre-existing files.
 */
function writeSession(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600
  });
  // Ensure permissions even if the file already existed with looser perms
  fs.chmodSync(filePath, 0o600);
}

/**
 * Delete the session file.  No-op if the file does not exist.
 */
function deleteSession(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore ENOENT
  }
}

// ── Token refresh ──────────────────────────────────────────────────────────────

/**
 * Exchange a refresh token for a new access token by calling the backend
 * POST /auth/refresh endpoint.
 *
 * @param {Object} opts
 * @param {string} opts.apiBaseUrl - e.g. http://localhost:3001/api/v1
 * @param {string} opts.refreshToken
 * @param {number} [opts.timeoutMs=30000]
 * @returns {Promise<string>} new access token
 */
async function refreshWithRefreshToken({ apiBaseUrl, refreshToken, timeoutMs = 30000 }) {
  const url = `${normalizeApiBaseUrl(apiBaseUrl)}/auth/refresh`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal
    });

    const body = await response.json();

    if (!response.ok || !body.success) {
      throw new Error(body.error || `Token refresh failed (${response.status})`);
    }

    return body.data.accessToken;
  } finally {
    clearTimeout(timer);
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  decodeJwtPayload,
  deleteSession,
  getJwtExpiryMs,
  getSessionFilePath,
  isJwtExpiring,
  normalizeApiBaseUrl,
  readSession,
  refreshWithRefreshToken,
  writeSession
};
