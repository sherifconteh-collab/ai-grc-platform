#!/usr/bin/env node
// @tier: free
/**
 * ControlWeave MCP Server
 *
 * This file has been consolidated into mcp-server-secure.js which is now the
 * single MCP server with OWASP security, rate limiting, audit logging, and
 * dynamic tool loading from mcp-tool-registry.js.
 *
 * This wrapper exists for backward compatibility — it starts the secure server.
 */

require('./mcp-server-secure');
