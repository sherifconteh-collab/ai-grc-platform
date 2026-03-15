#!/usr/bin/env node
// @tier: community
/**
 * MCP Auth Status — display the current MCP authentication state.
 *
 * Usage:
 *   npm run mcp:status
 */

'use strict';

require('dotenv').config();

const {
  getJwtExpiryMs,
  getSessionFilePath,
  isJwtExpiring,
  normalizeApiBaseUrl,
  readSession
} = require('./mcp-auth-session');

const SESSION_FILE = getSessionFilePath(process.env);
const API_BASE = normalizeApiBaseUrl(process.env.GRC_API_BASE_URL || 'http://localhost:3001/api/v1');

async function main() {
  const session = readSession(SESSION_FILE);

  console.error('');
  console.error('='.repeat(60));
  console.error('  ControlWeave MCP — Auth Status');
  console.error('='.repeat(60));
  console.error(`  Session file: ${SESSION_FILE}`);
  console.error(`  API base:     ${API_BASE}`);
  console.error('');

  if (!session) {
    console.error('  Status: NOT AUTHENTICATED');
    console.error('');
    console.error('  Run "npm run mcp:login" to authenticate.');
    console.error('');
    process.exit(1);
  }

  // Token status
  const hasAccess = Boolean(session.accessToken);
  const hasRefresh = Boolean(session.refreshToken);
  const accessExpiry = hasAccess ? getJwtExpiryMs(session.accessToken) : null;
  const accessExpired = hasAccess && accessExpiry ? Date.now() >= accessExpiry : false;
  const accessExpiringSoon = hasAccess && !accessExpired && isJwtExpiring(session.accessToken, 300000);

  console.error(`  Status: ${hasAccess || hasRefresh ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
  console.error('');

  if (session.email) {
    console.error(`  Email:        ${session.email}`);
  }
  if (session.organizationName) {
    console.error(`  Organization: ${session.organizationName}`);
  }
  if (session.userId) {
    console.error(`  User ID:      ${session.userId}`);
  }
  if (session.organizationId) {
    console.error(`  Org ID:       ${session.organizationId}`);
  }

  console.error('');
  console.error(`  Access token:  ${hasAccess ? 'present' : 'missing'}`);
  if (accessExpiry) {
    const expiryDate = new Date(accessExpiry);
    console.error(`  Expires at:    ${expiryDate.toISOString()}`);
    if (accessExpired) {
      console.error('  ⚠  Access token is EXPIRED (will auto-refresh on next request)');
    } else if (accessExpiringSoon) {
      console.error('  ⚠  Access token expires within 5 minutes');
    }
  }
  console.error(`  Refresh token: ${hasRefresh ? 'present' : 'missing'}`);

  if (session.updatedAt) {
    console.error(`  Last updated:  ${session.updatedAt}`);
  }

  // Optional: verify token against live API
  if (hasAccess && !accessExpired) {
    console.error('');
    console.error('  Verifying against backend...');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (resp.ok) {
        const body = await resp.json();
        const user = body.data;
        if (user) {
          const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
          console.error(`  ✓ Verified: ${name || user.email} (${user.role})`);
        }
      } else {
        console.error(`  ⚠  Backend returned ${resp.status} — token may be invalid`);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('  ⚠  Backend did not respond within 10 seconds');
      } else {
        console.error(`  ⚠  Could not reach backend: ${err.message}`);
      }
    }
  }

  console.error('');
}

main().catch((err) => {
  console.error('  ✗ Unexpected error:', err.message);
  process.exit(1);
});
