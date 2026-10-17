'use strict';

/**
 * How this installation is used:
 *
 *   local   the app runs its own database and servers; one person, one computer.
 *   server  the app is a window onto the organization's ControlWeave server;
 *           each person signs in with their own account and the server's
 *           administrators manage them.
 *
 * The choice is saved in <dataDir>/connection.json. IT can fix the server for
 * a deployment with `--server=<url>` on the shortcut or the
 * CONTROLWEAVE_SERVER_URL environment variable; that preset wins and the app
 * then offers no way to switch.
 */

const fs = require('fs');
const path = require('path');

const FILE = 'connection.json';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

class ConnectionError extends Error {}

/**
 * Turn what someone typed into a server origin. HTTPS only, except loopback:
 * over plain HTTP the server's secure sign-in cookie is never sent back, and
 * compliance data would cross the network unencrypted.
 */
function normalizeServerUrl(input) {
  const text = String(input || '').trim();
  if (!text) throw new ConnectionError('Enter your organization\'s ControlWeave address.');
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch (_) {
    throw new ConnectionError(`"${text}" is not a web address.`);
  }
  if (url.username || url.password) throw new ConnectionError('Leave the user name and password out of the address.');
  if (url.protocol === 'http:' && !LOOPBACK.has(url.hostname)) {
    throw new ConnectionError('The address must start with https://. Ask your administrator for the secure address.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConnectionError('The address must start with https://.');
  }
  return url.origin;
}

/**
 * Check `origin` is a ControlWeave server. `fetchImpl` is injected so the
 * Electron main process can pass net.fetch (system proxy settings and the
 * operating system's certificate store, which company servers often need).
 */
async function probeServer(origin, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${origin}/api/v1/auth/server-info`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'error',
    });
  } catch (error) {
    const detail = controller.signal.aborted ? `no answer within ${timeoutMs / 1000}s` : error.message;
    const unreachable = new ConnectionError(`ControlWeave could not reach ${origin} (${detail}).`);
    unreachable.hint = 'Check the address and your network or VPN connection.';
    throw unreachable;
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    // Not JSON; reported below.
  }
  if (!response.ok || !body || !body.data || body.data.app !== 'controlweave') {
    throw new ConnectionError(
      response.status === 404
        ? `${origin} answered, but it is not a ControlWeave server, or it runs a version too old for the desktop app.`
        : `${origin} answered, but not as a ControlWeave server (HTTP ${response.status}).`
    );
  }
  return { version: body.data.version || null, registration: body.data.registration || null };
}

function load(dataDir) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8'));
    if (value && value.mode === 'local') return { mode: 'local' };
    if (value && value.mode === 'server') return { mode: 'server', origin: normalizeServerUrl(value.origin) };
  } catch (_) {
    // Missing or unreadable: the app asks again.
  }
  return null;
}

function save(dataDir, connection) {
  fs.mkdirSync(dataDir, { recursive: true });
  const value = connection.mode === 'server'
    ? { mode: 'server', origin: normalizeServerUrl(connection.origin) }
    : { mode: 'local' };
  fs.writeFileSync(path.join(dataDir, FILE), JSON.stringify(value, null, 2));
  return value;
}

/** A server fixed by IT on the command line or in the environment, or null. */
function preset({ argv = process.argv, env = process.env } = {}) {
  let raw = null;
  const i = argv.findIndex((a) => a === '--server' || a.startsWith('--server='));
  if (i !== -1) raw = argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
  if (!raw && env.CONTROLWEAVE_SERVER_URL) raw = env.CONTROLWEAVE_SERVER_URL;
  return raw ? normalizeServerUrl(raw) : null;
}

module.exports = { ConnectionError, normalizeServerUrl, probeServer, load, save, preset };
