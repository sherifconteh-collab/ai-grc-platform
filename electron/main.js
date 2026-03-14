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
const EmbeddedPostgres = require('embedded-postgres');
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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Poll http://localhost:<port>/ until it responds (any status) or times out.
 */
function waitForServer(port, timeoutMs = STARTUP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
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
  child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.on('exit', (code, signal) => {
    console.log(`[${label}] exited — code=${code} signal=${signal}`);
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
    child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));

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

/**
 * Start the embedded PostgreSQL instance, initialise it on first run, and
 * ensure the 'controlweave' application database exists.
 *
 * @returns {Promise<string>} The DATABASE_URL to inject into the backend process.
 */
async function startEmbeddedPostgres() {
  const dataDir = path.join(app.getPath('userData'), 'pgdata');
  const creds = loadOrCreateCredentials();

  pgInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: creds.user,
    password: creds.password,
    port: EMBEDDED_PG_PORT,
    persistent: true,         // keep data between app restarts
  });

  // initialise() is a no-op when the data directory already exists
  await pgInstance.initialise();
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
      console.log('Created application database: controlweave');
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

  return { proc, ready: waitForServer(port) };
}

function startBackend(backendDir, databaseUrl) {
  const { proc, ready } = startServer('Backend', backendDir, path.join('src', 'server.js'), BACKEND_PORT, {
    // Allow the frontend origin so CORS is satisfied
    CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
    // Inject the embedded-postgres connection string so the backend never
    // needs an external DATABASE_URL in the environment or .env file.
    DATABASE_URL: databaseUrl,
  });
  backendProcess = proc;
  return ready;
}

function startFrontend() {
  const frontendDir = path.join(RESOURCES_ROOT, 'frontend-standalone');
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
  buildMenu();

  // Respond to renderer requests for the app version.
  ipcMain.handle('get-app-version', () => app.getVersion());

  try {
    console.log('Starting embedded PostgreSQL…');
    const databaseUrl = await startEmbeddedPostgres();
    console.log(`Embedded PostgreSQL ready on port ${EMBEDDED_PG_PORT}`);

    const backendDir = path.join(RESOURCES_ROOT, 'backend');

    console.log('Running database migrations…');
    await runMigrations(backendDir, databaseUrl);
    console.log('Database migrations complete');

    console.log('Starting backend server…');
    await startBackend(backendDir, databaseUrl);
    console.log(`Backend ready on port ${BACKEND_PORT}`);

    console.log('Starting frontend server…');
    await startFrontend();
    console.log(`Frontend ready on port ${FRONTEND_PORT}`);

    createWindow();

    // Initialise the auto-updater after the window is ready so status
    // events can be forwarded to the renderer.
    initAutoUpdater(mainWindow);
  } catch (err) {
    dialog.showErrorBox(
      'ControlWeave — Startup Error',
      [
        'Failed to start one or more internal servers.',
        '',
        err.message,
        '',
        'Please ensure:',
        '  • No other application is using ports 3000, 3001, or 5433',
        '  • You have write permission to the application data folder',
      ].join('\n')
    );
    app.quit();
  }
});

app.on('activate', () => {
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
