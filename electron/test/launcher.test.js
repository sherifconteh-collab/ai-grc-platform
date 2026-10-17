'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const secrets = require('../lib/secrets');
const postgres = require('../lib/postgres');
const orphans = require('../lib/orphans');
const { watchAdminProvisioning } = require('../lib/stack');
const { spawnChild, waitForHttp, StartupError } = require('../lib/processes');
const { createLogger } = require('../lib/log');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cw-launcher-test-'));
}

const quietLogger = () => createLogger(path.join(tempDir(), 'logs'));

test('service secrets are generated once and reused on later launches', () => {
  const dir = tempDir();
  const first = secrets.loadServiceSecrets(dir);
  const second = secrets.loadServiceSecrets(dir);
  assert.deepStrictEqual(second, first);
  assert.strictEqual(first.encryptionKey.length, 64);
  assert.strictEqual(first.hmacKey.length, 96);
  assert.ok(first.jwtSecret.length >= 32);
});

test('an existing jwt-secret from the previous launcher is kept', () => {
  const dir = tempDir();
  const legacy = 'f'.repeat(96);
  fs.writeFileSync(path.join(dir, 'jwt-secret'), `${legacy}\n`);
  assert.strictEqual(secrets.loadServiceSecrets(dir).jwtSecret, legacy);
});

test('a corrupt credentials file is regenerated instead of crashing', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'db-credentials.json'), '{not json');
  const { db } = secrets.loadServiceSecrets(dir);
  assert.strictEqual(db.user, 'postgres');
  assert.ok(db.password.length >= 16);
});

test('admin credentials keep the same password and remember provisioning', () => {
  const dir = tempDir();
  const created = secrets.loadAdminCredentials(dir);
  assert.strictEqual(created.email, secrets.ADMIN_EMAIL);
  assert.strictEqual(created.provisioned, false);
  secrets.saveAdminCredentials(dir, { ...created, provisioned: true });
  const reloaded = secrets.loadAdminCredentials(dir);
  assert.strictEqual(reloaded.password, created.password);
  assert.strictEqual(reloaded.provisioned, true);
});

test('admin provisioning is read from the backend log events', async () => {
  const ok = watchAdminProvisioning();
  ok.onLine('not json');
  ok.onLine(JSON.stringify({ message: 'server.started' }));
  ok.onLine(JSON.stringify({ message: 'platform.admin.provisioned' }));
  assert.deepStrictEqual(await ok.outcome, { ok: true });

  const failed = watchAdminProvisioning();
  failed.onLine(JSON.stringify({ message: 'startup.admin_seed_error', error: 'hashForLookup is not defined' }));
  assert.deepStrictEqual(await failed.outcome, { ok: false, error: 'hashForLookup is not defined' });
});

test('data directory: missing or empty means initialise', () => {
  const dir = tempDir();
  const logger = quietLogger();
  assert.strictEqual(postgres.inspectDataDir(path.join(dir, 'pgdata'), logger), 'missing');
  fs.mkdirSync(path.join(dir, 'empty'));
  assert.strictEqual(postgres.inspectDataDir(path.join(dir, 'empty'), logger), 'missing');
});

test('data directory: a half-created leftover is moved aside, not deleted', () => {
  const dir = tempDir();
  const dataDir = path.join(dir, 'pgdata');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'postgresql.conf'), '');
  assert.strictEqual(postgres.inspectDataDir(dataDir, quietLogger()), 'missing');
  assert.ok(!fs.existsSync(dataDir));
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith('pgdata-incomplete-')));
});

test('data directory: another PostgreSQL major version is refused untouched', () => {
  const dataDir = path.join(tempDir(), 'pgdata');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '15\n');
  assert.throws(() => postgres.inspectDataDir(dataDir, quietLogger()), StartupError);
  assert.ok(fs.existsSync(path.join(dataDir, 'PG_VERSION')));
});

test('server config include is added once and the port is rewritten each launch', () => {
  const dataDir = tempDir();
  fs.writeFileSync(path.join(dataDir, 'postgresql.conf'), "lc_messages = 'en_US.UTF-8'\n");
  postgres.writeConfig(dataDir, 5433);
  postgres.writeConfig(dataDir, 5544);
  const main = fs.readFileSync(path.join(dataDir, 'postgresql.conf'), 'utf8');
  assert.strictEqual(main.split("include_if_exists = 'controlweave.conf'").length, 2);
  const ours = fs.readFileSync(path.join(dataDir, 'controlweave.conf'), 'utf8');
  assert.match(ours, /^port = 5544$/m);
  assert.match(ours, /^listen_addresses = '127\.0\.0\.1'$/m);
});

test('a child that dies during startup fails the wait immediately with its output', async () => {
  const logger = quietLogger();
  const child = spawnChild(process.execPath, ['-e', 'console.error("boom: missing module"); process.exit(3)'], {
    env: process.env,
    logger,
    source: 'backend',
  });
  const started = Date.now();
  await assert.rejects(
    waitForHttp(child, { port: 1, path: '/health', timeoutMs: 60_000, logger, source: 'backend' }),
    (error) => error instanceof StartupError && /exit code 3/.test(error.message) && error.output.some((l) => l.includes('boom'))
  );
  assert.ok(Date.now() - started < 10_000, 'should not wait for the timeout');
});

test('orphan cleanup stops a recorded live process and ignores stale entries', async () => {
  const dir = tempDir();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await new Promise((resolve) => child.once('spawn', resolve));
  const exited = new Promise((resolve) => child.once('exit', resolve));

  orphans.record(dir, [
    { pid: child.pid, executable: process.execPath, source: 'backend', startedAt: orphans.startTime(child.pid) },
    // A PID that is not running, and one recorded with the wrong start time.
    { pid: 2 ** 22 - 3, executable: process.execPath, source: 'frontend', startedAt: 'Mon Jan  1 00:00:00 2001' },
    { pid: process.pid, executable: path.join(path.dirname(process.execPath), 'other.exe'), source: 'frontend', startedAt: 'Mon Jan  1 00:00:00 2001' },
  ]);

  assert.strictEqual(orphans.reap(dir, quietLogger()), 1);
  await exited;
  assert.ok(!fs.existsSync(path.join(dir, 'running-processes.json')));
});
