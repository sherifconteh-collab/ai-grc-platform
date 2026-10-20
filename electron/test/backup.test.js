'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const backup = require('../lib/backup');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cw-backup-test-'));
}

/** A data folder shaped like a real one, with `label` stamped into each part. */
function fakeDataDir(label, dir = tempDir()) {
  const pg = path.join(dir, 'pgdata');
  fs.mkdirSync(path.join(pg, 'base'), { recursive: true });
  fs.writeFileSync(path.join(pg, 'PG_VERSION'), '17\n');
  fs.writeFileSync(path.join(pg, 'base', 'table'), `rows from ${label}`);
  fs.writeFileSync(path.join(pg, 'postgresql.conf'), `# ${label} config\n`);
  fs.writeFileSync(path.join(pg, 'pg_hba.conf'), `# ${label} hba\n`);
  fs.writeFileSync(path.join(pg, 'pg_ident.conf'), `# ${label} ident\n`);
  fs.writeFileSync(path.join(pg, 'postmaster.pid'), '12345\n');
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'uploads', 'evidence.pdf'), `evidence from ${label}`);
  for (const name of ['db-credentials.json', 'jwt-secret', 'encryption-key', 'hmac-key', 'admin-credentials.json']) {
    fs.writeFileSync(path.join(dir, name), `${name} of ${label}`);
  }
  return dir;
}

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

test('a backup copies the database, uploads and secrets, but not the lock file', () => {
  const dir = fakeDataDir('original');
  const out = backup.createBackup(dir, { appVersion: '1.2.3' });
  assert.strictEqual(read(out, 'pgdata', 'base', 'table'), 'rows from original');
  assert.strictEqual(read(out, 'uploads', 'evidence.pdf'), 'evidence from original');
  assert.strictEqual(read(out, 'secrets', 'encryption-key'), 'encryption-key of original');
  assert.ok(!fs.existsSync(path.join(out, 'pgdata', 'postmaster.pid')));
  const manifest = JSON.parse(read(out, 'manifest.json'));
  assert.strictEqual(manifest.pgMajor, '17');
  assert.strictEqual(manifest.appVersion, '1.2.3');
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(out).mode & 0o777, 0o700, 'backups hold keys; owner-only');
  }
});

test('one backup per day, and only the newest seven days are kept', () => {
  const dir = fakeDataDir('original');
  for (let day = 1; day <= 9; day++) {
    backup.createBackup(dir, { now: new Date(2026, 0, day, 12) });
  }
  fs.writeFileSync(path.join(dir, 'pgdata', 'base', 'table'), 'rows later that day');
  backup.createBackup(dir, { now: new Date(2026, 0, 9, 18) });
  const names = backup.listBackups(dir).map((b) => b.name);
  assert.strictEqual(names.length, backup.KEEP_DAILY);
  assert.strictEqual(names[0], '2026-01-09');
  assert.strictEqual(names[names.length - 1], '2026-01-03');
  assert.strictEqual(read(dir, 'backups', '2026-01-09', 'pgdata', 'base', 'table'), 'rows later that day');
});

test('restore replaces data and secrets, and keeps the replaced data aside', () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const dir = fakeDataDir('current');
  const aside = backup.restoreBackup(dir, source, { bundledMajor: '17' });
  assert.strictEqual(read(dir, 'pgdata', 'base', 'table'), 'rows from backup');
  assert.strictEqual(read(dir, 'uploads', 'evidence.pdf'), 'evidence from backup');
  assert.strictEqual(read(dir, 'hmac-key'), 'hmac-key of backup');
  assert.strictEqual(read(aside, 'pgdata', 'base', 'table'), 'rows from current');
  assert.strictEqual(read(aside, 'secrets', 'hmac-key'), 'hmac-key of current');
  assert.ok(backup.readBackup(aside, '17'), 'the set-aside data is itself restorable');
});

test('restore never takes server configuration from the backup', () => {
  const tampered = fakeDataDir('backup');
  const pg = path.join(tampered, 'pgdata');
  fs.writeFileSync(path.join(pg, 'postgresql.conf'), "archive_mode = on\narchive_command = 'evil'\n");
  fs.writeFileSync(path.join(pg, 'postgresql.auto.conf'), "shared_preload_libraries = 'evil'\n");
  fs.writeFileSync(path.join(pg, 'recovery.signal'), '');
  const source = backup.createBackup(tampered);

  // Onto an existing install: its own configuration is kept.
  const dir = fakeDataDir('current');
  backup.restoreBackup(dir, source, { bundledMajor: '17' });
  assert.strictEqual(read(dir, 'pgdata', 'postgresql.conf'), '# current config\n');
  assert.strictEqual(read(dir, 'pgdata', 'pg_hba.conf'), '# current hba\n');
  assert.doesNotMatch(read(dir, 'pgdata', 'postgresql.auto.conf'), /evil/);
  assert.ok(!fs.existsSync(path.join(dir, 'pgdata', 'recovery.signal')));
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(path.join(dir, 'pgdata')).mode & 0o777, 0o700, 'PostgreSQL refuses a readable data directory');
  }

  // Onto a new computer with no install yet: minimal generated files.
  const fresh = tempDir();
  assert.strictEqual(backup.restoreBackup(fresh, source, { bundledMajor: '17' }), null);
  assert.doesNotMatch(read(fresh, 'pgdata', 'postgresql.conf'), /evil|archive/);
  assert.match(read(fresh, 'pgdata', 'postgresql.conf'), /include_if_exists = 'controlweave\.conf'/);
  assert.match(read(fresh, 'pgdata', 'pg_hba.conf'), /127\.0\.0\.1\/32\s+scram-sha-256/);
});

test('restore refuses folders that are not complete, compatible backups', () => {
  const dir = fakeDataDir('current');
  assert.throws(() => backup.restoreBackup(dir, tempDir(), { bundledMajor: '17' }), backup.BackupError);

  const noKeys = backup.createBackup(fakeDataDir('backup'));
  fs.rmSync(path.join(noKeys, 'secrets', 'encryption-key'));
  assert.throws(() => backup.restoreBackup(dir, noKeys, { bundledMajor: '17' }), /encryption-key/);

  const otherMajor = backup.createBackup(fakeDataDir('backup'));
  fs.writeFileSync(path.join(otherMajor, 'pgdata', 'PG_VERSION'), '16\n');
  assert.throws(() => backup.restoreBackup(dir, otherMajor, { bundledMajor: '17' }), /PostgreSQL 16/);

  assert.strictEqual(read(dir, 'pgdata', 'base', 'table'), 'rows from current', 'a refused restore changes nothing');
});

test('export copies a backup without overwriting an earlier export', () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const target = tempDir();
  const first = backup.exportBackup(source, target);
  const second = backup.exportBackup(source, target);
  assert.notStrictEqual(first, second);
  assert.ok(backup.readBackup(first, '17'));
  assert.ok(backup.readBackup(second, '17'));
});

/** A stand-in for spawnSync that records each command and answers like Windows would. */
function fakeWindowsRunner({ icaclsStatus = 0 } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === 'whoami') return { status: 0, stdout: '"DESKTOP\\\\alex","S-1-5-21-111-222-333-1001"\n' };
    return { status: icaclsStatus, stdout: '', stderr: icaclsStatus === 0 ? '' : 'The volume does not support ACLs.' };
  };
  return { run, calls };
}

test('on Windows an export is restricted to the current user with icacls', () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const { run, calls } = fakeWindowsRunner();
  const dest = backup.exportBackup(source, tempDir(), { platform: 'win32', run });
  const icacls = calls.find((c) => c.command === 'icacls');
  assert.ok(icacls, 'icacls is run on the exported folder');
  assert.strictEqual(icacls.args[0], dest);
  assert.ok(icacls.args.includes('/inheritance:r'), 'inherited rules from the destination are dropped');
  assert.ok(icacls.args.includes('/grant:r'));
  assert.ok(!icacls.args.includes('/T'), 'applied to the folder only; /T would strip the children\'s inherited rules');
  assert.ok(icacls.args.includes('*S-1-5-21-111-222-333-1001:(OI)(CI)F'), 'only the current user SID is granted');
  assert.ok(fs.existsSync(path.join(dest, 'manifest.json')));
});

test('on Windows an export that cannot be restricted is removed and refused', () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const target = tempDir();
  const { run } = fakeWindowsRunner({ icaclsStatus: 5 });
  assert.throws(() => backup.exportBackup(source, target, { platform: 'win32', run }), /could not be restricted.*not exported/s);
  assert.deepStrictEqual(fs.readdirSync(target), [], 'no unprotected copy of the keys is left behind');
});

test('on Windows an export is refused when the account cannot be identified', () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const target = tempDir();
  const run = () => ({ status: 1, stdout: '' });
  assert.throws(() => backup.exportBackup(source, target, { platform: 'win32', run }), /account could not be identified/);
  assert.deepStrictEqual(fs.readdirSync(target), []);
});

test('other platforms do not call icacls', () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const { run, calls } = fakeWindowsRunner();
  backup.exportBackup(source, tempDir(), { platform: 'linux', run });
  assert.strictEqual(calls.length, 0);
});

test('network paths are recognized', () => {
  assert.strictEqual(backup.isNetworkPath('\\\\fileserver\\backups'), true);
  assert.strictEqual(backup.isNetworkPath('D:\\backups'), false);
  assert.strictEqual(backup.isNetworkPath('/mnt/backups'), false);
  assert.strictEqual(backup.isNetworkPath(''), false);
});

test('on Windows the real icacls leaves an export readable by the current user', { skip: process.platform !== 'win32' }, () => {
  const source = backup.createBackup(fakeDataDir('backup'));
  const dest = backup.exportBackup(source, tempDir());
  assert.ok(backup.readBackup(dest, '17'), 'the manifest reads back after the ACL change');
  assert.strictEqual(read(dest, 'secrets', 'encryption-key'), 'encryption-key of backup');
  assert.strictEqual(read(dest, 'pgdata', 'base', 'table'), 'rows from backup');
});
