'use strict';

/**
 * The desktop stack: bundled PostgreSQL, migrations, the Express backend and
 * the Next.js frontend, started in order and stopped in reverse.
 *
 * This module has no Electron dependency. Electron's main process drives it
 * for real users, and scripts/stack-smoke.js drives it from plain Node in CI,
 * so the exact code users run is what CI boots on every pull request.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const postgres = require('./postgres');
const orphans = require('./orphans');
const { pickPort, isPortFree } = require('./ports');
const { loadServiceSecrets, loadAdminCredentials, saveAdminCredentials } = require('./secrets');
const { StartupError, sleep, spawnChild, runToCompletion, waitForHttp, stopChild } = require('./processes');

// The frontend bundle proxies /api/v1 to this port; it is fixed at build time
// (frontend/next.config.ts BACKEND_ORIGIN), so it cannot move at runtime.
const BACKEND_PORT = 3001;
const PREFERRED_FRONTEND_PORT = 3000;
const PREFERRED_DB_PORT = 5433;
const DB_NAME = 'controlweave';
const ADMIN_TIMEOUT_MS = 90_000;

const STEPS = [
  { id: 'database', label: 'Starting the local database' },
  { id: 'migrations', label: 'Preparing the database schema' },
  { id: 'backend', label: 'Starting the API server' },
  { id: 'admin', label: 'Checking the administrator account' },
  { id: 'frontend', label: 'Starting the interface' },
];

/** Where the backend and frontend live: packaged resources, or the repo in development. */
function resolveLayout(resourcesRoot, isPackaged) {
  const backendDir = path.join(resourcesRoot, 'backend');
  const frontendDir = isPackaged
    ? path.join(resourcesRoot, 'frontend-standalone')
    : path.join(resourcesRoot, 'frontend', 'build', 'standalone');
  return { backendDir, frontendDir };
}

function assertLayout({ backendDir, frontendDir }, isPackaged) {
  const required = [
    path.join(backendDir, 'src', 'server.js'),
    path.join(backendDir, 'scripts', 'migrate-all.js'),
    path.join(backendDir, 'node_modules', 'express', 'package.json'),
    path.join(frontendDir, 'server.js'),
  ];
  const missing = required.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new StartupError('Application files are missing from this installation.', {
      step: 'files',
      hint: isPackaged
        ? 'Reinstall ControlWeave. If antivirus software quarantined files, restore them or add an exclusion.'
        : 'Install backend and frontend dependencies and run "npm run build" in frontend/ first.',
      output: missing,
    });
  }
}

/** In development the standalone build lacks static assets; copy them in. */
function syncDevAssets(resourcesRoot, frontendDir) {
  const pairs = [
    [path.join(resourcesRoot, 'frontend', 'build', 'static'), path.join(frontendDir, 'build', 'static')],
    [path.join(resourcesRoot, 'frontend', 'public'), path.join(frontendDir, 'public')],
  ];
  for (const [from, to] of pairs) {
    // Next.js asset names are content-hashed, so copying only missing files is enough.
    if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
  }
}

async function ensureDatabase(creds, port) {
  const client = new Client({ host: '127.0.0.1', port, user: creds.user, password: creds.password, database: 'postgres' });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (rows.length === 0) await client.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await client.end();
  }
}

/**
 * Resolve once the backend reports the platform admin was created or updated.
 * These are stable event names from ensurePlatformAdmin() in backend/src/server.js.
 */
function watchAdminProvisioning() {
  let settle;
  const outcome = new Promise((resolve) => { settle = resolve; });
  const onLine = (line) => {
    if (!line.startsWith('{')) return;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_) {
      return;
    }
    if (entry.message === 'platform.admin.provisioned' || entry.message === 'platform.admin.updated') {
      settle({ ok: true });
    } else if (entry.message === 'platform.admin.provision_failed' || entry.message === 'startup.admin_seed_error') {
      settle({ ok: false, error: entry.error || entry.message });
    }
  };
  return { onLine, outcome };
}

function nodeEnv(extra) {
  const env = { ...process.env, NODE_ENV: 'production', ...extra };
  // Children run on the Electron binary, which only behaves as plain Node with this set.
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

function backendEnv(ctx) {
  const { secrets, admin, databaseUrl, frontendUrl } = ctx;
  return nodeEnv({
    PORT: String(BACKEND_PORT),
    HOST: '127.0.0.1',
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: frontendUrl,
    FRONTEND_URL: frontendUrl,
    JWT_SECRET: secrets.jwtSecret,
    ENCRYPTION_KEY: secrets.encryptionKey,
    HMAC_KEY: secrets.hmacKey,
    // The install directory is read-only and replaced on update.
    UPLOADS_DIR: path.join(ctx.dataDir, 'uploads'),
    // Files live in the data folder, which is backed up with the database.
    // The desktop app never uses object storage, whatever the environment says.
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DURABLE: 'true',
    // Lets the backend point desktop users at the app's own backups.
    CONTROLWEAVE_DESKTOP: 'true',
    PLATFORM_ADMIN_EMAIL: admin.email,
    // Only until the backend confirms it; afterwards the user owns the password.
    ...(admin.provisioned ? {} : { PLATFORM_ADMIN_PASSWORD: admin.password }),
    PLATFORM_ADMIN_FIRST_NAME: 'Platform',
    PLATFORM_ADMIN_LAST_NAME: 'Admin',
    PLATFORM_ADMIN_ORG: 'ControlWeave Desktop',
  });
}

async function awaitAdmin(ctx, watcher, backend) {
  const result = await Promise.race([
    watcher.outcome,
    backend.exited.then(() => ({ ok: false, error: 'the API server stopped' })),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'timed out' }), ADMIN_TIMEOUT_MS)),
  ]);
  if (!result.ok) {
    throw new StartupError(`The administrator account could not be set up (${result.error}).`, {
      step: 'admin',
      output: ctx.logger.tail('backend', 25),
    });
  }
  if (!ctx.admin.provisioned) {
    ctx.admin.provisioned = true;
    saveAdminCredentials(ctx.dataDir, ctx.admin);
  }
}

/** Pre-flight: files present, secrets loaded, leftovers stopped, ports chosen. */
async function prepare(opts) {
  const { dataDir, resourcesRoot, isPackaged, logger } = opts;
  const layout = resolveLayout(resourcesRoot, isPackaged);
  assertLayout(layout, isPackaged);
  if (!isPackaged) syncDevAssets(resourcesRoot, layout.frontendDir);
  fs.mkdirSync(dataDir, { recursive: true });
  if (orphans.reap(dataDir, logger) > 0) {
    // A killed process can hold its port for a moment after it exits.
    for (let i = 0; i < 20 && !(await isPortFree(BACKEND_PORT)); i++) await sleep(250);
  }

  if (!(await isPortFree(BACKEND_PORT))) {
    throw new StartupError(`Port ${BACKEND_PORT} is already in use by another program.`, {
      step: 'backend',
      hint: `ControlWeave needs port ${BACKEND_PORT}. Close the program using it (often another local web server), then retry.`,
    });
  }
  const frontendPort = await pickPort(PREFERRED_FRONTEND_PORT);
  return {
    ...opts,
    layout,
    secrets: loadServiceSecrets(dataDir),
    admin: loadAdminCredentials(dataDir),
    dbPort: await pickPort(PREFERRED_DB_PORT),
    frontendPort,
    frontendUrl: `http://localhost:${frontendPort}`,
  };
}

/**
 * Create a stack. `start()` brings everything up and resolves with
 * { frontendUrl, backendUrl, admin, dataDir }; `stop()` may be called at any
 * time, including mid-start, and stops whatever is already running.
 * `onStep(stepId, status)` reports progress for the UI.
 */
function createStack(opts) {
  const { logger, nodeBinary, onStep = () => {}, timeouts = {} } = opts;
  const children = [];
  let pg = null;
  let current = null;
  let stopped = false;

  const step = (id) => {
    if (stopped) throw new StartupError('Startup was cancelled.', { step: current });
    if (current) onStep(current, 'done');
    current = id;
    onStep(id, 'active');
    logger.log('info', STEPS.find((s) => s.id === id).label);
  };

  const track = (child, source, ctx) => {
    child.source = source;
    children.push(child);
    child.startedAt = orphans.startTime(child.pid);
    orphans.record(ctx.dataDir, children.map((c) => ({ pid: c.pid, executable: nodeBinary, source: c.source, startedAt: c.startedAt })));
    return child;
  };

  /** Resolves { databaseStopped } — true when the database was running and is now down. */
  async function stop() {
    stopped = true;
    for (const child of [...children].reverse()) await stopChild(child);
    let databaseStopped = false;
    if (pg) {
      const running = pg;
      pg = null;
      databaseStopped = await running.stop();
    }
    orphans.clear(opts.dataDir);
    return { databaseStopped };
  }

  async function boot() {
    const ctx = await prepare(opts);
    step('database');
    pg = await postgres.start({
      appRoot: ctx.appRoot,
      dataDir: path.join(ctx.dataDir, 'pgdata'),
      port: ctx.dbPort,
      creds: ctx.secrets.db,
      logsDir: logger.logsDir,
      logger,
    });
    await ensureDatabase(ctx.secrets.db, ctx.dbPort);
    ctx.databaseUrl = `postgresql://${ctx.secrets.db.user}:${encodeURIComponent(ctx.secrets.db.password)}@127.0.0.1:${ctx.dbPort}/${DB_NAME}`;

    step('migrations');
    await runToCompletion(nodeBinary, [path.join(ctx.layout.backendDir, 'scripts', 'migrate-all.js')], {
      cwd: ctx.layout.backendDir,
      env: nodeEnv({ DATABASE_URL: ctx.databaseUrl, DESKTOP_SCHEMA_RECONCILE_FIRST: 'true' }),
      logger,
      source: 'migrations',
    });

    step('backend');
    const watcher = watchAdminProvisioning();
    const backend = track(spawnChild(nodeBinary, [path.join(ctx.layout.backendDir, 'src', 'server.js')], {
      cwd: ctx.layout.backendDir, env: backendEnv(ctx), logger, source: 'backend', onLine: watcher.onLine,
    }), 'backend', ctx);
    await waitForHttp(backend, { port: BACKEND_PORT, path: '/health', timeoutMs: timeouts.backend || 120_000, logger, source: 'backend' });

    step('admin');
    await awaitAdmin(ctx, watcher, backend);

    step('frontend');
    const frontend = track(spawnChild(nodeBinary, [path.join(ctx.layout.frontendDir, 'server.js')], {
      cwd: ctx.layout.frontendDir,
      env: nodeEnv({ PORT: String(ctx.frontendPort), HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1' }),
      logger,
      source: 'frontend',
    }), 'frontend', ctx);
    await waitForHttp(frontend, { port: ctx.frontendPort, path: '/login', timeoutMs: timeouts.frontend || 90_000, logger, source: 'frontend' });
    onStep('frontend', 'done');
    return { frontendUrl: ctx.frontendUrl, backendUrl: `http://127.0.0.1:${BACKEND_PORT}`, admin: ctx.admin, dataDir: ctx.dataDir };
  }

  async function start() {
    try {
      return await boot();
    } catch (error) {
      if (current) onStep(current, 'failed');
      await stop();
      if (error instanceof StartupError) {
        if (!error.step) error.step = current;
        throw error;
      }
      throw new StartupError(error.message || String(error), { step: current, output: [String(error.stack || '')] });
    }
  }

  return { start, stop, children };
}

/** Convenience for callers that only need start-then-stop. */
async function startStack(opts) {
  const stack = createStack(opts);
  const info = await stack.start();
  return { ...info, stop: stack.stop, children: stack.children };
}

module.exports = { createStack, startStack, resolveLayout, watchAdminProvisioning, STEPS, BACKEND_PORT };
