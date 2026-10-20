'use strict';

/**
 * Desktop backups: a copy of the database files, uploaded files and the
 * install's secrets, taken while the database is stopped.
 *
 * A stopped PostgreSQL data directory is consistent on its own, so a plain
 * file copy is a complete backup without pg_dump (which the bundled
 * PostgreSQL does not include). The secrets are part of the backup on
 * purpose: encrypted columns and email lookups need the same encryption and
 * HMAC keys, so a database restored without them is unreadable. That makes
 * every backup as sensitive as the live data; directories are owner-only.
 *
 *   <dataDir>/backups/<YYYY-MM-DD>/        one per day, newest 7 kept
 *   <dataDir>/backups/pre-restore-<stamp>/ the data a restore replaced
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const FORMAT = 'controlweave-desktop-backup';
const FORMAT_VERSION = 1;
const KEEP_DAILY = 7;
const KEEP_PRE_RESTORE = 2;
const DAILY = /^\d{4}-\d{2}-\d{2}$/;
const PRE_RESTORE = /^pre-restore-/;

// Files in the data folder that a restore must bring back with the database.
const SECRET_FILES = ['db-credentials.json', 'jwt-secret', 'encryption-key', 'hmac-key', 'admin-credentials.json'];
// PostgreSQL configuration a restore never takes from a backup (see sanitise).
const PG_CONFIG_FILES = ['postgresql.conf', 'pg_hba.conf', 'pg_ident.conf'];
const PG_SKIP = new Set(['postmaster.pid', 'postmaster.opts']);
const GENERATED_CONFIG = {
  'postgresql.conf': "# Written by the ControlWeave desktop launcher during a restore.\ninclude_if_exists = 'controlweave.conf'\n",
  'pg_hba.conf': [
    '# Written by the ControlWeave desktop launcher during a restore.',
    'local   all   all                  scram-sha-256',
    'host    all   all   127.0.0.1/32   scram-sha-256',
    'host    all   all   ::1/128        scram-sha-256',
    '',
  ].join('\n'),
  'pg_ident.conf': '# Written by the ControlWeave desktop launcher during a restore.\n',
};

class BackupError extends Error {}

function backupsDir(dataDir) {
  return path.join(dataDir, 'backups');
}

function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function stamp(date = new Date()) {
  return `${localDate(date)}_${date.toTimeString().slice(0, 8).replace(/:/g, '')}`;
}

function makePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
}

/**
 * Windows: let the current user, not only the Administrators group, open the
 * restored database. Run elevated, this process creates files owned by
 * Administrators; pg_ctl starts PostgreSQL with a restricted token in which
 * that group is deny-only, so the server could not open global/pg_control.
 */
function grantCurrentUser(dir) {
  if (process.platform !== 'win32') return;
  const who = spawnSync('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' });
  const sid = /"(S-1-[\d-]+)"/.exec(who.stdout || '');
  const account = sid ? `*${sid[1]}` : process.env.USERNAME;
  const result = spawnSync('icacls', [dir, '/grant', `${account}:(OI)(CI)F`, '/T', '/Q'], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new BackupError(`The restored database could not be made accessible: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

/**
 * Windows: ignore whatever access rules the destination folder would pass on
 * and leave only the current user on `dir`. mkdir/chmod modes do nothing on
 * Windows, so without this an exported backup (which holds the encryption key
 * and JWT secret) is as readable as the share it lands on. `run` is injectable
 * so the command line can be tested without Windows.
 */
function restrictToCurrentUser(dir, run = spawnSync) {
  const who = run('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' });
  const sid = /"(S-1-[\d-]+)"/.exec((who && who.stdout) || '');
  if (!sid) throw new BackupError('The current Windows account could not be identified.');
  const result = run('icacls', [dir, '/inheritance:r', '/grant:r', `*${sid[1]}:(OI)(CI)F`, '/T', '/Q'], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new BackupError(`Access to the exported backup could not be restricted: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

/** True for a UNC path (a network share), which keeps its own access rules. */
function isNetworkPath(p) {
  return /^\\\\[^\\]/.test(String(p || ''));
}

/** Copy the restorable parts of a data folder (database stopped) into `dest`. */
function copyDataSet(dataDir, dest, manifest) {
  makePrivateDir(dest);
  const pgdata = path.join(dataDir, 'pgdata');
  if (!fs.existsSync(path.join(pgdata, 'PG_VERSION'))) {
    throw new BackupError('There is no database to back up yet.');
  }
  fs.cpSync(pgdata, path.join(dest, 'pgdata'), {
    recursive: true,
    filter: (src) => !PG_SKIP.has(path.basename(src)) || path.dirname(src) !== pgdata,
  });
  makePrivateDir(path.join(dest, 'pgdata'));
  const uploads = path.join(dataDir, 'uploads');
  if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dest, 'uploads'), { recursive: true });
  makePrivateDir(path.join(dest, 'secrets'));
  for (const name of SECRET_FILES) {
    const src = path.join(dataDir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, 'secrets', name));
  }
  const pgMajor = fs.readFileSync(path.join(pgdata, 'PG_VERSION'), 'utf8').trim();
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify({
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    pgMajor,
    ...manifest,
  }, null, 2));
}

function listDir(root, pattern) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((name) => pattern.test(name)).sort();
}

function prune(root, pattern, keep) {
  const names = listDir(root, pattern);
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
}

/**
 * Back up the data folder. Call only while the database is stopped.
 * One backup per day: a later one the same day replaces it.
 */
function createBackup(dataDir, { appVersion = null, now = new Date() } = {}) {
  const root = backupsDir(dataDir);
  makePrivateDir(root);
  const incoming = path.join(root, `.incoming-${crypto.randomBytes(4).toString('hex')}`);
  try {
    copyDataSet(dataDir, incoming, { appVersion, reason: 'daily' });
    const final = path.join(root, localDate(now));
    fs.rmSync(final, { recursive: true, force: true });
    fs.renameSync(incoming, final);
    prune(root, DAILY, KEEP_DAILY);
    return final;
  } finally {
    fs.rmSync(incoming, { recursive: true, force: true });
  }
}

/** Newest first: [{ dir, name, createdAt }]. */
function listBackups(dataDir) {
  const root = backupsDir(dataDir);
  return listDir(root, DAILY).reverse().map((name) => {
    const dir = path.join(root, name);
    let createdAt = null;
    try {
      createdAt = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).createdAt;
    } catch (_) {
      // Unreadable manifest; restore will refuse it.
    }
    return { dir, name, createdAt };
  });
}

/** Check a folder is a usable backup for this app; returns its manifest. */
function readBackup(dir, bundledMajor) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (_) {
    throw new BackupError('This folder is not a ControlWeave backup (no readable manifest.json).');
  }
  if (manifest.format !== FORMAT || manifest.version !== FORMAT_VERSION) {
    throw new BackupError('This folder is not a ControlWeave desktop backup, or was made by an unsupported version.');
  }
  const versionFile = path.join(dir, 'pgdata', 'PG_VERSION');
  if (!fs.existsSync(versionFile)) throw new BackupError('The backup has no database files.');
  const major = fs.readFileSync(versionFile, 'utf8').trim();
  if (String(major) !== String(bundledMajor)) {
    throw new BackupError(`The backup was made with PostgreSQL ${major}; this version of ControlWeave bundles PostgreSQL ${bundledMajor}.`);
  }
  for (const name of ['db-credentials.json', 'encryption-key', 'hmac-key']) {
    if (!fs.existsSync(path.join(dir, 'secrets', name))) {
      throw new BackupError(`The backup is incomplete: secrets/${name} is missing, so its encrypted data could not be read.`);
    }
  }
  return manifest;
}

/**
 * A backup can come from anywhere, and PostgreSQL configuration can run
 * commands (archive_command, restore_command, preload libraries). Keep this
 * install's own configuration files, clear ALTER SYSTEM overrides (read after
 * every other file) and drop recovery signals, so restoring cannot change
 * how the server is configured.
 */
function sanitise(pgdata, trustedConfigDir) {
  for (const name of PG_CONFIG_FILES) {
    const trusted = trustedConfigDir && path.join(trustedConfigDir, name);
    if (trusted && fs.existsSync(trusted)) {
      fs.copyFileSync(trusted, path.join(pgdata, name));
    } else {
      // No install of our own to copy from (restoring onto a new computer):
      // write minimal files. PostgreSQL defaults cover everything else, and
      // the launcher adds its own settings on start.
      fs.writeFileSync(path.join(pgdata, name), GENERATED_CONFIG[name]);
    }
  }
  fs.writeFileSync(path.join(pgdata, 'postgresql.auto.conf'),
    '# Do not edit this file manually!\n# It will be overwritten by the ALTER SYSTEM command.\n');
  for (const name of ['recovery.signal', 'standby.signal', 'postmaster.pid', 'controlweave.conf']) {
    fs.rmSync(path.join(pgdata, name), { force: true });
  }
}

/**
 * Replace this install's data with a backup. Call only while the stack is
 * stopped. The current data is moved to backups/pre-restore-<stamp> first,
 * so a restore can itself be undone. Returns that folder.
 */
function restoreBackup(dataDir, sourceDir, { bundledMajor }) {
  readBackup(sourceDir, bundledMajor);
  const pgdata = path.join(dataDir, 'pgdata');
  const resolvedSource = path.resolve(sourceDir);
  if (resolvedSource === path.resolve(dataDir) || resolvedSource.startsWith(`${path.resolve(pgdata)}${path.sep}`)) {
    throw new BackupError('Choose a backup folder, not the live data folder.');
  }

  const root = backupsDir(dataDir);
  makePrivateDir(root);
  const aside = path.join(root, `pre-restore-${stamp()}`);
  const hasCurrent = fs.existsSync(path.join(pgdata, 'PG_VERSION'));
  if (hasCurrent) copyDataSet(dataDir, aside, { reason: 'pre-restore' });

  // Stage the restored database next to the live one, then swap it in.
  const staged = path.join(dataDir, `.pgdata-restore-${crypto.randomBytes(4).toString('hex')}`);
  try {
    fs.cpSync(path.join(sourceDir, 'pgdata'), staged, { recursive: true });
    // PostgreSQL refuses to start on a data directory others can read.
    makePrivateDir(staged);
    grantCurrentUser(staged);
    sanitise(staged, hasCurrent ? pgdata : null);
    fs.rmSync(pgdata, { recursive: true, force: true });
    fs.renameSync(staged, pgdata);
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }

  const uploads = path.join(dataDir, 'uploads');
  fs.rmSync(uploads, { recursive: true, force: true });
  if (fs.existsSync(path.join(sourceDir, 'uploads'))) {
    fs.cpSync(path.join(sourceDir, 'uploads'), uploads, { recursive: true });
  }
  for (const name of SECRET_FILES) {
    const src = path.join(sourceDir, 'secrets', name);
    const dest = path.join(dataDir, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      if (process.platform !== 'win32') fs.chmodSync(dest, 0o600);
    }
  }
  prune(root, PRE_RESTORE, KEEP_PRE_RESTORE);
  return hasCurrent ? aside : null;
}

/** Copy a backup somewhere else (another disk, a network share). */
function exportBackup(backupDir, destParent, { platform = process.platform, run = spawnSync } = {}) {
  const base = `ControlWeave-backup-${path.basename(backupDir)}`;
  let dest = path.join(destParent, base);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(destParent, `${base}-${i}`);
  fs.cpSync(backupDir, dest, { recursive: true });
  if (platform !== 'win32') {
    fs.chmodSync(dest, 0o700);
    return dest;
  }
  // Fail closed: a copy holding the keys that could not be locked down (a
  // FAT/exFAT drive, a share without ACL support) is removed, not left behind.
  try {
    restrictToCurrentUser(dest, run);
  } catch (error) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new BackupError(`${error.message} The backup was not exported. Choose a folder on an NTFS drive.`);
  }
  return dest;
}

module.exports = {
  BackupError,
  backupsDir,
  createBackup,
  listBackups,
  readBackup,
  restoreBackup,
  exportBackup,
  restrictToCurrentUser,
  isNetworkPath,
  KEEP_DAILY,
};
