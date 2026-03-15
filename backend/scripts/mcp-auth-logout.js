#!/usr/bin/env node
// @tier: community
/**
 * MCP Auth Logout — remove the stored MCP session file.
 *
 * Usage:
 *   npm run mcp:logout
 */

'use strict';

require('dotenv').config();

const { deleteSession, getSessionFilePath, readSession } = require('./mcp-auth-session');

const SESSION_FILE = getSessionFilePath(process.env);

function main() {
  const existing = readSession(SESSION_FILE);

  if (!existing) {
    console.error('No active MCP session found.');
    return;
  }

  deleteSession(SESSION_FILE);

  console.error('');
  console.error('='.repeat(60));
  console.error('  ControlWeave MCP — Logged out');
  console.error('='.repeat(60));
  if (existing.email) {
    console.error(`  Previous user: ${existing.email}`);
  }
  console.error(`  Session file removed: ${SESSION_FILE}`);
  console.error('');
}

main();
