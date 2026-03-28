'use strict';

/**
 * ControlWeave Desktop — Electron Main Process
 *
 * Responsibilities:
 *  1. Start an embedded PostgreSQL server (no external DB required)
 *  2. Run database migrations (idempotent, safe on every launch)
 *  3. Spawn the Node.js backend server (Express, port 3001)
 *  4. Spawn the Next.js frontend server (port 3000)
 *  5. Wait for both servers to be ready, then open a BrowserWindow
 *  6. Gracefully shut down child processes and PostgreSQL on quit
 */

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const embeddedPostgresModule = require('embedded-postgres');
if (!embeddedPostgresModule) {
  throw new Error('Failed to load embedded-postgres module — ensure the dependency is installed.');
}
const EmbeddedPostgres = embeddedPostgresModule.default || embeddedPostgresModule;
const { initAutoUpdater, checkForUpdatesManual } = require('./updater');

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;
// Port for the embedded PostgreSQL instance.  Use 5433 to avoid clashing with
// any system-wide PostgreSQL that might be running on the default 5432.
const EMBEDDED_PG_PORT = 5433;
const STARTUP_TIMEOUT_MS = 60_000; // 60 s — embedded PG init + migrations need headroom on slower machines
const POLL_INTERVAL_MS = 500;
const BACKEND_HEALTH_PATH = '/health';
const FRONTEND_HEALTH_PATH = '/health';
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');
const MIN_JWT_SECRET_LENGTH = 32;
const JWT_SECRET_BYTES = 48;
const GROUP_OTHER_PERMISSIONS_MASK = 0o077;

// When packaged, electron bundles node alongside the app.  process.execPath is
// the electron binary itself, which *is* a Node.js runtime, so we can use it
// to run plain .js scripts without an external Node installation.
const NODE_BINARY = process.execPath;

// Resources root differs between development (repo root) and production.
const RESOURCES_ROOT = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..');

// ──────────────────────────────────────────────────────────────────────────────
// Globals
// ──────────────────────────────────────────────────────────────────────────────
let mainWindow = null;
let backendProcess = null;
let frontendProcess = null;
let pgInstance = null;     // EmbeddedPostgres instance
let isQuitting = false;    // guard against double-quit loop during async cleanup
let startupLogPath = null;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Poll http://localhost:<port><requestPath> until it responds (any status) or times out.
 */
function waitForHttpEndpoint(port, requestPath = '/', timeoutMs = STARTUP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const req = http.get({ host: '127.0.0.1', port, path: requestPath }, (res) => {
        res.resume(); // drain the response body to release the socket
        resolve();
      });
      req.setTimeout(1000);
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Server on port ${port} did not start within ${timeoutMs / 1000}s`));
        } else {
          setTimeout(attempt, POLL_INTERVAL_MS);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Server on port ${port} did not start within ${timeoutMs / 1000}s`));
        } else {
          setTimeout(attempt, POLL_INTERVAL_MS);
        }
      });
    }

    attempt();
  });
}

function appendStartupLog(line) {
  if (!startupLogPath) return;
  try {
    fs.appendFileSync(startupLogPath, `${new Date().toISOString()} ${line}\n`);
  } catch (error) {
    console.error('[WARN] Failed to write startup log:', error && error.message ? error.message : error);
  }
}

function logStartup(level, message) {
  const line = `[${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  appendStartupLog(line);
}

function logStartupError(message, error) {
  const detail = error && error.stack ? error.stack : (error && error.message ? error.message : String(error));
  logStartup('error', `${message}: ${detail}`);
}

function pipeProcessOutput(label, chunk, isError = false) {
  const text = chunk.toString();
  const prefixed = `[${label}] ${text}`;
  if (isError) {
    process.stderr.write(prefixed);
  } else {
    process.stdout.write(prefixed);
  }

  const normalized = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of normalized) {
    if (!line) continue;
    appendStartupLog(`[${label}] ${line}`);
  }
}

function setupStartupLogging() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  startupLogPath = path.join(logsDir, 'startup.log');
  appendStartupLog('============================================================');
  appendStartupLog(`Desktop startup initiated${IS_SMOKE_TEST ? ' (smoke-test mode)' : ''}`);
  appendStartupLog('============================================================');
}

/**
 * Open a URL in the system browser.
 * Only http: and https: schemes are permitted to prevent a compromised renderer
 * from opening file:, javascript:, or other dangerous URI schemes.
 */
function openSafeExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') {
      shell.openExternal(url).catch((err) => {
        console.error(`Failed to open external URL: ${err.message}`);
      });
    }
  } catch (_) {
    // ignore malformed URLs
  }
}

/**
 * Spawn a Node.js child process and pipe its stdio to the Electron console.
 */
function spawnNode(scriptPath, cwd, env = {}) {
  const child = spawn(NODE_BINARY, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      // Required so process.execPath (the Electron binary) behaves as a plain
      // Node.js runtime instead of launching another Electron window.
      ELECTRON_RUN_AS_NODE: '1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const label = path.basename(cwd);
  child.stdout.on('data', (d) => pipeProcessOutput(label, d));
  child.stderr.on('data', (d) => pipeProcessOutput(label, d, true));
  child.on('exit', (code, signal) => {
    logStartup('info', `[${label}] exited — code=${code} signal=${signal}`);
  });

  return child;
}

/**
 * Run a Node.js script to completion and return a Promise that resolves when
 * the script exits with code 0, or rejects when it exits with a non-zero code.
 * Unlike spawnNode(), this is intended for one-shot scripts (e.g. migrations)
 * rather than long-running servers.
 */
function runNodeScriptToCompletion(scriptPath, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE_BINARY, [scriptPath], {
      cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const label = path.basename(scriptPath, '.js');
    child.stdout.on('data', (d) => pipeProcessOutput(label, d));
    child.stderr.on('data', (d) => pipeProcessOutput(label, d, true));

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Embedded PostgreSQL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Load stored DB credentials from disk, or generate and persist fresh ones.
 * Credentials are kept in a JSON file inside app.getPath('userData') so they
 * survive app restarts without being stored in environment variables.
 */
function loadOrCreateCredentials() {
  const credFile = path.join(app.getPath('userData'), 'db-credentials.json');

  if (fs.existsSync(credFile)) {
    try {
      return JSON.parse(fs.readFileSync(credFile, 'utf8'));
    } catch (_) {
      // File was corrupt — fall through to regenerate
    }
  }

  const creds = {
    user: 'postgres',
    // 16 random bytes = 32 hex chars; 128 bits of entropy — more than enough
    // for a local-only loopback database connection.
    password: crypto.randomBytes(16).toString('hex'),
  };

  // mode 0o600: owner read/write only — credentials are sensitive
  fs.writeFileSync(credFile, JSON.stringify(creds, null, 2), { mode: 0o600 });
  return creds;
}

function loadOrCreateJwtSecret() {
  const secretFile = path.join(app.getPath('userData'), 'jwt-secret');

  if (fs.existsSync(secretFile)) {
    try {
      const stats = fs.statSync(secretFile);
      if ((stats.mode & GROUP_OTHER_PERMISSIONS_MASK) !== 0) {
        logStartup('warn', `Desktop JWT secret at ${secretFile} has permissions broader than 0600; tightening them.`);
        fs.chmodSync(secretFile, 0o600);
      }
      const secret = fs.readFileSync(secretFile, 'utf8').trim();
      if (secret.length >= MIN_JWT_SECRET_LENGTH) {
        return secret;
      }
      logStartup('warn', `Desktop JWT secret at ${secretFile} is invalid; regenerating it.`);
    } catch (error) {
      logStartup('warn', `Desktop JWT secret at ${secretFile} could not be read (${error.message}); regenerating it.`);
    }
  }

  const secret = crypto.randomBytes(JWT_SECRET_BYTES).toString('hex');
  fs.writeFileSync(secretFile, `${secret}\n`, { mode: 0o600 });
  // Ensure permissions are tightened even if the mode flag was ignored on overwrite
  fs.chmodSync(secretFile, 0o600);
  return secret;
}

function getMaxFileMtime(dirPath) {
  let maxMtime = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        maxMtime = Math.max(maxMtime, getMaxFileMtime(fullPath));
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        maxMtime = Math.max(maxMtime, stat.mtimeMs);
      }
    }
  } catch (err) {
    // Directory may not exist yet on first run; other errors are logged for debugging
    if (err.code !== 'ENOENT') {
      console.warn(`getMaxFileMtime: unexpected error reading ${dirPath}: ${err.message}`);
    }
  }
  return maxMtime;
}

function syncLocalStandaloneAssets(frontendDir) {
  const sourceBuildIdPath = path.join(RESOURCES_ROOT, 'frontend', 'build', 'BUILD_ID');
  const sourcePublicDir = path.join(RESOURCES_ROOT, 'frontend', 'public');
  const standaloneBuildDir = path.join(frontendDir, 'build');
  const staticTargetDir = path.join(standaloneBuildDir, 'static');
  const publicTargetDir = path.join(frontendDir, 'public');
  const markerFile = path.join(frontendDir, '.asset-sync-marker');
  const sourceBuildId = fs.readFileSync(sourceBuildIdPath, 'utf8').trim();
  // Use max file mtime recursively for reliable change detection
  const publicMtime = String(Math.trunc(getMaxFileMtime(sourcePublicDir)));
  const markerValue = `${sourceBuildId}:${publicMtime}`;
  const currentMarker = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : '';

  if (
    currentMarker === markerValue &&
    fs.existsSync(staticTargetDir) &&
    fs.existsSync(publicTargetDir)
  ) {
    return;
  }

  fs.cpSync(path.join(RESOURCES_ROOT, 'frontend', 'build', 'static'), staticTargetDir, {
    recursive: true,
    force: true,
  });
  fs.cpSync(sourcePublicDir, publicTargetDir, {
    recursive: true,
    force: true,
  });
  fs.writeFileSync(markerFile, `${markerValue}\n`);
}

/**
 * Start the embedded PostgreSQL instance, initialise it on first run, and
 * ensure the 'controlweave' application database exists.
 *
 * @returns {Promise<string>} The DATABASE_URL to inject into the backend process.
 */
function getCorruptDataDirPath(dataDir) {
  const suffix = crypto.randomBytes(6).toString('hex');
  const corruptDir = `${dataDir}-corrupt-${suffix}`;

  if (fs.existsSync(corruptDir)) {
    throw new Error(`Unable to allocate a backup directory for invalid embedded PostgreSQL data at ${dataDir}`);
  }

  return corruptDir;
}

function shouldInitialiseEmbeddedPostgres(dataDir) {
  const versionFile = path.join(dataDir, 'PG_VERSION');

  if (fs.existsSync(versionFile)) {
    return false;
  }

  if (!fs.existsSync(dataDir)) {
    return true;
  }

  let entries;
  try {
    entries = fs.readdirSync(dataDir);
  } catch (err) {
    throw new Error(`Unable to read embedded PostgreSQL data directory ${dataDir}: ${err.message}`);
  }

  if (entries.length === 0) {
    return true;
  }

  const corruptDir = getCorruptDataDirPath(dataDir);
  try {
    fs.renameSync(dataDir, corruptDir);
  } catch (err) {
    throw new Error(
      `Unable to move invalid embedded PostgreSQL data directory from ${dataDir} to ${corruptDir}: ${err.message}`
    );
  }
  logStartup('warn', `Moved invalid embedded PostgreSQL data directory to ${corruptDir}`);
  return true;
}

async function startEmbeddedPostgres() {
  const dataDir = path.join(app.getPath('userData'), 'pgdata');
  const creds = loadOrCreateCredentials();
  const shouldInitialise = shouldInitialiseEmbeddedPostgres(dataDir);

  pgInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: creds.user,
    password: creds.password,
    port: EMBEDDED_PG_PORT,
    persistent: true,         // keep data between app restarts
  });

  if (shouldInitialise) {
    await pgInstance.initialise();
  }
  await pgInstance.start();

  // Ensure the application database exists (first-run setup)
  const client = pgInstance.getPgClient();
  await client.connect();
  try {
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'controlweave'"
    );
    if (res.rows.length === 0) {
      await client.query('CREATE DATABASE controlweave');
      logStartup('info', 'Created application database: controlweave');
    }
  } finally {
    await client.end();
  }

  // URL-encode the password in case it contains special characters
  const encodedPassword = encodeURIComponent(creds.password);
  return `postgresql://${creds.user}:${encodedPassword}@127.0.0.1:${EMBEDDED_PG_PORT}/controlweave`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Server startup
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run all pending database migrations against the embedded PostgreSQL instance.
 * Uses backend/scripts/migrate-all.js which is idempotent — already-applied
 * migrations are skipped, so this is safe to call on every app launch.
 */
async function runMigrations(backendDir, databaseUrl) {
  const migrateScript = path.join(backendDir, 'scripts', 'migrate-all.js');

  if (!fs.existsSync(migrateScript)) {
    throw new Error(`Migration script not found: ${migrateScript}`);
  }

  await runNodeScriptToCompletion(migrateScript, backendDir, {
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
  });
}

/**
 * Common logic for spawning a bundled server and waiting for it to be ready.
 * Returns the child process so the caller can track it for graceful shutdown.
 */
function startServer(label, dirPath, scriptRelPath, port, extraEnv = {}) {
  const serverScript = path.join(dirPath, scriptRelPath);

  if (!fs.existsSync(serverScript)) {
    throw new Error(`${label} entry point not found: ${serverScript}`);
  }

  const proc = spawnNode(serverScript, dirPath, {
    NODE_ENV: 'production',
    PORT: String(port),
    ...extraEnv,
  });

  return { proc, ready: waitForHttpEndpoint(port) };
}

function startBackend(backendDir, databaseUrl) {
  // Generate a random password for the default platform admin to avoid
  // shipping a known credential that is reachable on the network.
  const generatedPassword = `CW-${crypto.randomBytes(12).toString('base64url')}!1`;
  const jwtSecret = loadOrCreateJwtSecret();

  const { proc, ready } = startServer('Backend', backendDir, path.join('src', 'server.js'), BACKEND_PORT, {
    // Allow the frontend origin so CORS is satisfied
    CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
    // Inject the embedded-postgres connection string so the backend never
    // needs an external DATABASE_URL in the environment or .env file.
    DATABASE_URL: databaseUrl,
    // Bind to loopback only — never expose the desktop backend on the LAN
    HOST: '127.0.0.1',
    // Frontend URL for CORS and email links
    FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
    // Auto-provision a platform admin on first desktop launch so the user
    // can sign in immediately without running any CLI seed scripts.
    JWT_SECRET: jwtSecret,
    PLATFORM_ADMIN_EMAIL: process.env.PLATFORM_ADMIN_EMAIL || 'admin@controlweave.local',
    PLATFORM_ADMIN_PASSWORD: process.env.PLATFORM_ADMIN_PASSWORD || generatedPassword,
    PLATFORM_ADMIN_FIRST_NAME: process.env.PLATFORM_ADMIN_FIRST_NAME || 'Platform',
    PLATFORM_ADMIN_LAST_NAME: process.env.PLATFORM_ADMIN_LAST_NAME || 'Admin',
    PLATFORM_ADMIN_ORG: process.env.PLATFORM_ADMIN_ORG || 'ControlWeave Desktop',
  });
  backendProcess = proc;
  return ready;
}

function startFrontend() {
  const frontendDir = app.isPackaged
    ? path.join(RESOURCES_ROOT, 'frontend-standalone')
    : path.join(RESOURCES_ROOT, 'frontend', 'build', 'standalone');

  if (!app.isPackaged) {
    syncLocalStandaloneAssets(frontendDir);
  }

  const { proc, ready } = startServer('Frontend', frontendDir, 'server.js', FRONTEND_PORT, {
    HOSTNAME: '127.0.0.1',
    // Tell the Next.js rewrite where the backend lives
    BACKEND_ORIGIN: `http://localhost:${BACKEND_PORT}`,
  });
  frontendProcess = proc;
  return ready;
}

// ──────────────────────────────────────────────────────────────────────────────
// Window creation
// ──────────────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'ControlWeave — AI GRC Platform',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false, // shown only after ready-to-show
  });

  mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in the system browser instead of a new Electron window.
  // openSafeExternal() validates the scheme so only http:/https: URLs are opened.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    openSafeExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => checkForUpdatesManual(),
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => openSafeExternal('https://github.com/sherifconteh-collab/ai-grc-platform'),
        },
        {
          label: 'Report Issue',
          click: () =>
            openSafeExternal(
              'https://github.com/sherifconteh-collab/ai-grc-platform/issues'
            ),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupStartupLogging();
  logStartup('info', `Startup logging enabled at ${startupLogPath}`);
  buildMenu();

  // Respond to renderer requests for the app version.
  ipcMain.handle('get-app-version', () => app.getVersion());

  try {
    // ── Smoke-test fast path ────────────────────────────────────────────────
    // When launched with --smoke-test (CI build verification), validate that
    // all critical bundled resources are present and exit immediately.  This
    // avoids downloading / initialising embedded PostgreSQL and starting
    // backend & frontend servers, which can easily exceed the CI timeout.
    if (IS_SMOKE_TEST) {
      logStartup('info', 'Smoke-test mode: validating bundled resources…');

      const backendDir = path.join(RESOURCES_ROOT, 'backend');
      const frontendDir = app.isPackaged
        ? path.join(RESOURCES_ROOT, 'frontend-standalone')
        : path.join(RESOURCES_ROOT, 'frontend', 'build', 'standalone');

      const criticalPaths = [
        path.join(backendDir, 'src', 'server.js'),
        path.join(backendDir, 'scripts', 'migrate-all.js'),
        path.join(backendDir, 'node_modules'),
        path.join(frontendDir, 'server.js'),
      ];

      const missing = criticalPaths.filter((p) => !fs.existsSync(p));
      if (missing.length > 0) {
        throw new Error(`Missing bundled resources:\n  ${missing.join('\n  ')}`);
      }

      logStartup('info', 'All critical resources present — smoke test passed');
      process.exitCode = 0;
      app.quit();
      return;
    }

    // ── Normal startup ──────────────────────────────────────────────────────
    logStartup('info', 'Starting embedded PostgreSQL…');
    const databaseUrl = await startEmbeddedPostgres();
    logStartup('info', `Embedded PostgreSQL ready on port ${EMBEDDED_PG_PORT}`);

    const backendDir = path.join(RESOURCES_ROOT, 'backend');

    logStartup('info', 'Running database migrations…');
    await runMigrations(backendDir, databaseUrl);
    logStartup('info', 'Database migrations complete');

    logStartup('info', 'Starting backend server…');
    await startBackend(backendDir, databaseUrl);
    logStartup('info', `Backend ready on port ${BACKEND_PORT}`);

    logStartup('info', 'Starting frontend server…');
    await startFrontend();
    logStartup('info', `Frontend ready on port ${FRONTEND_PORT}`);

    createWindow();

    // Initialise the auto-updater after the window is ready so status
    // events can be forwarded to the renderer.
    initAutoUpdater(mainWindow);
  } catch (err) {
    logStartupError('Desktop startup failed', err);
    process.exitCode = 1;
    if (!IS_SMOKE_TEST) {
      dialog.showErrorBox(
        'ControlWeave — Startup Error',
        [
          'Failed to start one or more internal servers.',
          '',
          err.message,
          '',
          `Startup log: ${startupLogPath || 'Unavailable'}`,
          '',
          'Please ensure:',
          '  • No other application is using ports 3000, 3001, or 5433',
          '  • You have write permission to the application data folder',
        ].join('\n')
      );
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (IS_SMOKE_TEST) return;
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function killChildProcesses() {
  [backendProcess, frontendProcess].forEach((child) => {
    if (child && !child.killed) {
      try {
        child.kill(); // defaults to SIGTERM on Unix, forceful kill on Windows
      } catch (_) {
        // ignore
      }
    }
  });
}

// before-quit fires before the app exits.  We prevent the default quit,
// perform async cleanup (stop embedded PG), then re-trigger app.quit().
// The isQuitting flag prevents infinite recursion.
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();

  killChildProcesses();

  if (pgInstance) {
    try {
      await pgInstance.stop();
    } catch (_) {
      // ignore — we are shutting down regardless
    }
    pgInstance = null;
  }

  app.quit(); // re-trigger; isQuitting is now true so this path is skipped
});

// Synchronous best-effort cleanup for process.exit (no async possible here).
process.on('exit', killChildProcesses);
