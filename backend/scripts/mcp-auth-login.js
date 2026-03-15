#!/usr/bin/env node
// @tier: community
/**
 * MCP Auth Login — interactive CLI for authenticating the MCP server.
 *
 * Usage:
 *   npm run mcp:login                       # interactive prompts
 *   MCP_LOGIN_EMAIL=a@b.com MCP_LOGIN_PASSWORD=secret npm run mcp:login  # non-interactive
 *
 * On success the JWT tokens are persisted to ~/.controlweave/mcp-session.json
 * (or the path given by MCP_SESSION_FILE).
 */

'use strict';

require('dotenv').config();

const readline = require('readline');
const {
  getJwtExpiryMs,
  getSessionFilePath,
  normalizeApiBaseUrl,
  writeSession
} = require('./mcp-auth-session');

// ── Configuration ──────────────────────────────────────────────────────────────

const API_BASE = normalizeApiBaseUrl(process.env.GRC_API_BASE_URL || 'http://localhost:3001/api/v1');
const SESSION_FILE = getSessionFilePath(process.env);
const TIMEOUT_MS = parseInt(process.env.MCP_REQUEST_TIMEOUT_MS || '30000', 10);

// ── Helpers ────────────────────────────────────────────────────────────────────

function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stderr });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

/**
 * Prompt for a password without echoing input.
 * Falls back to a normal prompt when stdin is not a TTY (e.g. piped input).
 */
function askPassword(rl, question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      rl.question(question, (answer) => resolve(answer.trim()));
      return;
    }
    process.stderr.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    let password = '';
    const onData = (ch) => {
      const c = ch.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.setRawMode(wasRaw);
        stdin.removeListener('data', onData);
        stdin.pause();
        process.stderr.write('\n');
        resolve(password);
      } else if (c === '\u007F' || c === '\b') {
        password = password.slice(0, -1);
      } else if (c === '\u0003') {
        // Ctrl-C
        process.exit(130);
      } else {
        password += c;
      }
    };
    stdin.on('data', onData);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.error('');
  console.error('='.repeat(60));
  console.error('  ControlWeave MCP — Login');
  console.error('='.repeat(60));
  console.error(`  API: ${API_BASE}`);
  console.error('');

  // Collect credentials — env vars or interactive prompts
  let email = process.env.MCP_LOGIN_EMAIL || '';
  let password = process.env.MCP_LOGIN_PASSWORD || '';
  let totpCode = '';
  let rl;

  if (!email || !password) {
    rl = createInterface();
  }

  if (!email) {
    email = await ask(rl, '  Email: ');
  }
  if (!password) {
    password = await askPassword(rl, '  Password: ');
  }

  if (!email || !password) {
    console.error('  ✗ Email and password are required.');
    process.exit(1);
  }

  // ── First login attempt ────────────────────────────────────────────────────
  let data = await doLogin(email, password, totpCode);

  // Handle TOTP challenge
  if (data && data.totp_required) {
    if (!rl) rl = createInterface();
    console.error('');
    console.error('  Two-factor authentication is enabled.');
    totpCode = await ask(rl, '  Authenticator code: ');
    data = await doLogin(email, password, totpCode);
  }

  if (rl) rl.close();

  if (!data || !data.tokens) {
    console.error('  ✗ Login failed — no tokens received.');
    process.exit(1);
  }

  // ── Persist session ────────────────────────────────────────────────────────
  const { accessToken, refreshToken } = data.tokens;
  const accessTokenExpiresAt = (() => {
    const ms = getJwtExpiryMs(accessToken);
    return ms ? new Date(ms).toISOString() : null;
  })();

  const session = {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    apiBaseUrl: API_BASE,
    email: data.user?.email || email,
    userId: data.user?.id || null,
    organizationId: data.organization?.id || null,
    organizationName: data.organization?.name || null,
    updatedAt: new Date().toISOString()
  };

  writeSession(SESSION_FILE, session);

  console.error('');
  console.error('  ✓ Login successful!');
  console.error(`  Session saved to ${SESSION_FILE}`);
  console.error('');
  if (data.user) {
    console.error(`  User:         ${data.user.full_name || data.user.email}`);
  }
  if (data.organization) {
    console.error(`  Organization: ${data.organization.name || 'N/A'}`);
  }
  if (accessTokenExpiresAt) {
    console.error(`  Token expires: ${accessTokenExpiresAt}`);
  }
  console.error('');
  console.error('  You can now start the MCP server:');
  console.error('    npm run mcp');
  console.error('');
}

// ── Login request ──────────────────────────────────────────────────────────────

async function doLogin(email, password, totpCode) {
  const url = `${API_BASE}/auth/login`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = { email, password };
  if (totpCode) body.totp_code = totpCode;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const result = await response.json();

    if (result.totp_required) {
      return result;
    }

    if (!response.ok || !result.success) {
      console.error(`  ✗ ${result.error || 'Login failed'}`);
      process.exit(1);
    }

    return result.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`  ✗ Request timed out after ${TIMEOUT_MS}ms.`);
    } else if (error.cause?.code === 'ECONNREFUSED') {
      console.error(`  ✗ Cannot connect to ${API_BASE}.`);
      console.error('    Is the ControlWeave backend running?');
    } else {
      console.error(`  ✗ ${error.message}`);
    }
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error('  ✗ Unexpected error:', err.message);
  process.exit(1);
});
