'use strict';

// #359: mcp-server-secure.js must serve every tool in mcp-tool-registry.js
// (it used to hand-code 21 of 54), each through the authenticating wrapper.

const path = require('path');
const { spawn } = require('child_process');
const { getTools } = require('../../scripts/mcp-tool-registry');

const SERVER = path.join(__dirname, '../../scripts/mcp-server-secure.js');
const EXPECTED_TOOL_COUNT = 54;

function listToolsFromServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        GRC_API_BASE_URL: 'http://127.0.0.1:9/api/v1',
        MCP_SESSION_FILE: path.join(__dirname, 'does-not-exist.json'),
        MCP_ENABLE_AUDIT_LOG: 'false'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let buffer = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('MCP server did not answer tools/list')); }, 8000);
    child.on('error', reject);
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (const line of buffer.split('\n')) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch (_) { continue; }
        if (msg.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
        } else if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          resolve(msg.result.tools);
        }
      }
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'jest', version: '0' } }
    }) + '\n');
  });
}

describe('MCP tool registry', () => {
  const tools = getTools();

  it('defines the documented number of uniquely named tools', () => {
    expect(tools).toHaveLength(EXPECTED_TOOL_COUNT);
    expect(new Set(tools.map((t) => t.name)).size).toBe(EXPECTED_TOOL_COUNT);
  });

  it('exempts only grc_health from authentication', () => {
    expect(tools.filter((t) => t.noAuth).map((t) => t.name)).toEqual(['grc_health']);
  });

  it('reaches the backend only through the injected apiRequest (organization scoping stays server side)', () => {
    for (const tool of tools.filter((t) => !t.noAuth)) {
      const src = tool.handler.toString();
      expect({ name: tool.name, direct: /fetch\(|process\.env|require\(/.test(src) }).toEqual({ name: tool.name, direct: false });
    }
  });

  it('resolves the organization for every tool that accepts organization_id', () => {
    for (const tool of tools.filter((t) => Object.prototype.hasOwnProperty.call(t.inputSchema, 'organization_id'))) {
      expect({ name: tool.name, resolves: /resolveOrganizationId/.test(tool.handler.toString()) })
        .toEqual({ name: tool.name, resolves: true });
    }
  });

  it('is served in full by mcp-server-secure.js', async () => {
    const served = await listToolsFromServer();
    expect(served.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  }, 15000);

  it('matches the tool count advertised by the frontend and README', () => {
    const fs = require('fs');
    const stats = fs.readFileSync(path.join(__dirname, '../../../frontend/src/lib/platformStats.ts'), 'utf8');
    expect(stats).toMatch(new RegExp(`MCP_TOOLS_COUNT = ${EXPECTED_TOOL_COUNT};`));
    const readme = fs.readFileSync(path.join(__dirname, '../../../README.md'), 'utf8');
    expect(readme).toContain(`exposes ${EXPECTED_TOOL_COUNT} tools`);
  });
});
