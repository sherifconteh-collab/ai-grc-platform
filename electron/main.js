'use strict';

/**
 * ControlWeave Desktop — Electron Main Process
 *
 * Responsibilities:
 *  1. Spawn the Node.js backend server (Express, port 3001)
 *  2. Spawn the Next.js frontend server (port 3000)
 *  3. Wait for both servers to be ready, then open a BrowserWindow
 *  4. Gracefully shut down child processes on quit
 */

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;
const STARTUP_TIMEOUT_MS = 60_000; // 60 s to let servers start
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

// ──────────────────────────────────────────────────────────────────────────────
// Server startup
// ──────────────────────────────────────────────────────────────────────────────

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

function startBackend() {
  const backendDir = path.join(RESOURCES_ROOT, 'backend');
  const { proc, ready } = startServer('Backend', backendDir, path.join('src', 'server.js'), BACKEND_PORT, {
    // Allow the frontend origin so CORS is satisfied
    CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
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
    console.log('Starting backend server…');
    await startBackend();
    console.log(`Backend ready on port ${BACKEND_PORT}`);

    console.log('Starting frontend server…');
    await startFrontend();
    console.log(`Frontend ready on port ${FRONTEND_PORT}`);

    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'ControlWeave — Startup Error',
      [
        'Failed to start one or more internal servers.',
        '',
        err.message,
        '',
        'Please ensure:',
        '  • PostgreSQL is running and accessible',
        '  • The DATABASE_URL environment variable is set (or a .env file exists)',
        '  • No other application is using ports 3000 or 3001',
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

function killChildren() {
  [backendProcess, frontendProcess].forEach((child) => {
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch (_) {
        // ignore
      }
    }
  });
}

app.on('before-quit', killChildren);
process.on('exit', killChildren);
