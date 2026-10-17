'use strict';

/**
 * Bundled PostgreSQL, driven through its own initdb and pg_ctl binaries.
 *
 * The launcher used to go through the embedded-postgres wrapper, which
 * discarded initdb's error output, replaced the child environment, forced the
 * en_US.UTF-8 message locale (missing on many machines) and could not recover
 * a server left running by a crashed launch. pg_ctl does all of this itself:
 * it waits for readiness, detects a live server from its pid file, and stops
 * it cleanly.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { StartupError, runToCompletion } = require('./processes');

const BUNDLED_MAJOR = '17';
const CONF_INCLUDE = "include_if_exists = 'controlweave.conf'";

function platformPackageName() {
  const key = `${process.platform}-${process.arch}`;
  const supported = {
    'win32-x64': 'windows-x64',
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64',
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
  };
  if (!supported[key]) throw new StartupError(`This platform (${key}) has no bundled PostgreSQL.`);
  return supported[key];
}

function binaries(appRoot) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binDir = path.join(appRoot, 'node_modules', '@embedded-postgres', platformPackageName(), 'native', 'bin');
  return {
    binDir,
    initdb: path.join(binDir, `initdb${ext}`),
    pgCtl: path.join(binDir, `pg_ctl${ext}`),
    postgres: path.join(binDir, `postgres${ext}`),
  };
}

function assertBinaries(appRoot) {
  const bins = binaries(appRoot);
  const missing = [bins.initdb, bins.pgCtl, bins.postgres].filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new StartupError('The bundled PostgreSQL files are missing from this installation.', {
      step: 'postgres',
      hint: 'Reinstall ControlWeave. If antivirus software quarantined files, restore them or add an exclusion.',
      output: missing,
    });
  }
  return bins;
}

/** Environment for PostgreSQL binaries: inherited, with a fixed message locale. */
function pgEnv() {
  const env = { ...process.env, LC_MESSAGES: 'C', LANG: 'C' };
  delete env.PGDATA;
  delete env.PGPORT;
  delete env.PGHOST;
  return env;
}

function pgCtl(bins, args) {
  return spawnSync(bins.pgCtl, args, { env: pgEnv(), windowsHide: true, encoding: 'utf8', timeout: 60_000 });
}

/**
 * Inspect the data directory: 'missing' (initialise), 'ready' (use it), or
 * move an unusable leftover aside and report 'missing'.
 */
function inspectDataDir(dataDir, logger) {
  const versionFile = path.join(dataDir, 'PG_VERSION');
  if (fs.existsSync(versionFile)) {
    const major = fs.readFileSync(versionFile, 'utf8').trim();
    if (major !== BUNDLED_MAJOR) {
      throw new StartupError(
        `Your database was created by PostgreSQL ${major}, but this version of ControlWeave bundles PostgreSQL ${BUNDLED_MAJOR}.`,
        { step: 'postgres', hint: `Your data is untouched in ${dataDir}. Reinstall the previous ControlWeave version to export it.` }
      );
    }
    return 'ready';
  }
  if (!fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0) return 'missing';

  const aside = `${dataDir}-incomplete-${Date.now()}`;
  fs.renameSync(dataDir, aside);
  logger.log('warn', `Moved an incomplete database directory to ${aside}`);
  return 'missing';
}

async function initialise(bins, dataDir, creds, logger) {
  // initdb must create the data directory itself. Run from an administrator
  // account on Windows, it restarts with a restricted token that cannot change
  // permissions on a directory the full-rights process created ("could not
  // change permissions of directory"). inspectDataDir() only reports
  // 'missing' for an absent or empty directory, so removing it loses nothing.
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  const pwFile = path.join(path.dirname(dataDir), `.pg-init-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(pwFile, `${creds.password}\n`, { mode: 0o600 });
  try {
    await runToCompletion(bins.initdb, [
      `--pgdata=${dataDir}`,
      `--username=${creds.user}`,
      `--pwfile=${pwFile}`,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      // The C locale exists everywhere; a system locale with non-ASCII
      // characters in its name breaks initdb on Windows.
      '--locale=C',
    ], { env: pgEnv(), logger, source: 'initdb' });
  } catch (error) {
    // Leave no half-initialised directory behind for the next launch to trip on.
    fs.rmSync(dataDir, { recursive: true, force: true });
    error.hint = 'Make sure the ControlWeave data folder is writable and not inside a synced folder (OneDrive, Dropbox).';
    throw error;
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

/** Point the server at our per-launch settings. Safe to run on every start. */
function writeConfig(dataDir, port) {
  const mainConf = path.join(dataDir, 'postgresql.conf');
  const contents = fs.readFileSync(mainConf, 'utf8');
  if (!contents.includes(CONF_INCLUDE)) {
    fs.appendFileSync(mainConf, `\n# Desktop launcher settings\n${CONF_INCLUDE}\n`);
  }
  fs.writeFileSync(path.join(dataDir, 'controlweave.conf'), [
    '# Written by the ControlWeave desktop launcher on every start.',
    "listen_addresses = '127.0.0.1'",
    `port = ${port}`,
    "unix_socket_directories = ''",
    // Databases created by the old launcher ask for en_US.UTF-8 messages,
    // which is not installed everywhere.
    "lc_messages = 'C'",
    'max_connections = 50',
    '',
  ].join('\n'));
}

/**
 * A server still running from a launch that crashed holds the data directory.
 * The single-instance lock means it cannot belong to a live app, so stop it.
 */
function stopOrphan(bins, dataDir, logger) {
  const status = pgCtl(bins, ['status', '-D', dataDir]);
  if (status.status === 0) {
    logger.log('warn', 'A database server from an earlier session is still running; stopping it.');
    const stop = pgCtl(bins, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30']);
    if (stop.status !== 0) pgCtl(bins, ['stop', '-D', dataDir, '-m', 'immediate', '-w', '-t', '30']);
    return;
  }
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    // pg_ctl says nothing is running; on Windows a reused PID can still make
    // postgres refuse to start over a stale lock file.
    fs.rmSync(pidFile, { force: true });
    logger.log('warn', 'Removed a stale database lock file left by an earlier session.');
  }
}

async function start({ appRoot, dataDir, port, creds, logsDir, logger }) {
  const bins = assertBinaries(appRoot);
  const state = inspectDataDir(dataDir, logger);
  if (state === 'missing') {
    logger.log('info', 'Creating the local database (first launch)');
    await initialise(bins, dataDir, creds, logger);
  } else {
    stopOrphan(bins, dataDir, logger);
  }
  writeConfig(dataDir, port);

  const serverLog = path.join(logsDir, 'postgres.log');
  try {
    await runToCompletion(bins.pgCtl, ['start', '-D', dataDir, '-l', serverLog, '-w', '-t', '90'], {
      env: pgEnv(),
      logger,
      source: 'pg_ctl',
    });
  } catch (error) {
    let serverTail = [];
    try {
      serverTail = fs.readFileSync(serverLog, 'utf8').trim().split(/\r?\n/).slice(-20);
    } catch (_) {
      // No server log yet.
    }
    error.message = 'The local database server did not start';
    error.output = [...error.output, ...serverTail];
    throw error;
  }

  return {
    created: state === 'missing',
    /** Resolves true once the server is down (its files are then safe to copy). */
    async stop() {
      const opts = { env: pgEnv(), logger, source: 'pg_ctl' };
      try {
        await runToCompletion(bins.pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '20'], opts);
        return true;
      } catch (_) {
        // An immediate stop leaves the files crash-consistent, which a copy may also take.
        return runToCompletion(bins.pgCtl, ['stop', '-D', dataDir, '-m', 'immediate', '-w', '-t', '10'], opts)
          .then(() => true, () => false);
      }
    },
  };
}

module.exports = { start, assertBinaries, binaries, inspectDataDir, writeConfig, BUNDLED_MAJOR };
