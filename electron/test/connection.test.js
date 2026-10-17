'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const connection = require('../lib/connection');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cw-connection-test-'));
}

test('server addresses are reduced to an HTTPS origin', () => {
  assert.strictEqual(connection.normalizeServerUrl('grc.example.com'), 'https://grc.example.com');
  assert.strictEqual(connection.normalizeServerUrl(' https://grc.example.com/login?x=1 '), 'https://grc.example.com');
  assert.strictEqual(connection.normalizeServerUrl('https://grc.example.com:8443/'), 'https://grc.example.com:8443');
});

test('plain HTTP is refused except on this computer', () => {
  assert.throws(() => connection.normalizeServerUrl('http://grc.example.com'), /https/);
  assert.throws(() => connection.normalizeServerUrl('http://10.0.0.5:3000'), /https/);
  assert.strictEqual(connection.normalizeServerUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.strictEqual(connection.normalizeServerUrl('http://localhost:3000/'), 'http://localhost:3000');
});

test('empty, malformed, credentialed and non-web addresses are refused', () => {
  assert.throws(() => connection.normalizeServerUrl(''), connection.ConnectionError);
  assert.throws(() => connection.normalizeServerUrl('https://'), connection.ConnectionError);
  assert.throws(() => connection.normalizeServerUrl('https://me:secret@grc.example.com'), /password/);
  assert.throws(() => connection.normalizeServerUrl('file:///etc/passwd'), connection.ConnectionError);
  assert.throws(() => connection.normalizeServerUrl('javascript:alert(1)'), connection.ConnectionError);
});

test('the choice is saved and read back; a damaged file means ask again', () => {
  const dir = tempDir();
  assert.strictEqual(connection.load(dir), null);
  connection.save(dir, { mode: 'server', origin: 'https://grc.example.com/dashboard' });
  assert.deepStrictEqual(connection.load(dir), { mode: 'server', origin: 'https://grc.example.com' });
  connection.save(dir, { mode: 'local' });
  assert.deepStrictEqual(connection.load(dir), { mode: 'local' });
  fs.writeFileSync(path.join(dir, 'connection.json'), '{"mode":"server","origin":"http://evil.example.com"}');
  assert.strictEqual(connection.load(dir), null);
  fs.writeFileSync(path.join(dir, 'connection.json'), '{oops');
  assert.strictEqual(connection.load(dir), null);
});

test('IT can fix the server on the command line or in the environment', () => {
  assert.strictEqual(connection.preset({ argv: ['app', '--server=grc.example.com'], env: {} }), 'https://grc.example.com');
  assert.strictEqual(connection.preset({ argv: ['app', '--server', 'https://a.example.com'], env: {} }), 'https://a.example.com');
  assert.strictEqual(connection.preset({ argv: ['app'], env: { CONTROLWEAVE_SERVER_URL: 'b.example.com' } }), 'https://b.example.com');
  assert.strictEqual(connection.preset({ argv: ['app'], env: {} }), null);
  assert.throws(() => connection.preset({ argv: ['app', '--server=http://c.example.com'], env: {} }), /https/);
});

function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (typeof body === 'string') throw new SyntaxError('not json');
        return body;
      },
    };
  };
  return { impl, calls };
}

test('a ControlWeave server is recognized from its server-info answer', async () => {
  const { impl, calls } = fakeFetch(200, { success: true, data: { app: 'controlweave', version: '2026.10.1', registration: 'invite_only' } });
  const info = await connection.probeServer('https://grc.example.com', { fetchImpl: impl });
  assert.deepStrictEqual(info, { version: '2026.10.1', registration: 'invite_only' });
  assert.strictEqual(calls[0].url, 'https://grc.example.com/api/v1/auth/server-info');
  assert.strictEqual(calls[0].options.redirect, 'error');
});

test('other sites, old servers and unreachable addresses are explained', async () => {
  await assert.rejects(
    connection.probeServer('https://example.com', { fetchImpl: fakeFetch(404, '<html>').impl }),
    /not a ControlWeave server/
  );
  await assert.rejects(
    connection.probeServer('https://example.com', { fetchImpl: fakeFetch(200, { data: { app: 'other' } }).impl }),
    /not as a ControlWeave server/
  );
  await assert.rejects(
    connection.probeServer('https://example.com', { fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } }),
    /could not reach https:\/\/example.com \(getaddrinfo ENOTFOUND\)/
  );
  const hang = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await assert.rejects(
    connection.probeServer('https://example.com', { fetchImpl: hang, timeoutMs: 50 }),
    /no answer within/
  );
});
