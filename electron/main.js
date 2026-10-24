'use strict';

/**
 * ControlWeave Desktop - Electron main process.
 *
 * The stack itself (database, migrations, API, interface) lives in
 * lib/stack.js and has no Electron dependency, so CI boots exactly the same
 * code with scripts/stack-smoke.js. This file only owns windows, menus,
 * the single-instance lock and the app lifecycle.
 *
 * The app runs in one of two modes (lib/connection.js): "local" runs that
 * stack on this computer; "server" opens the organization's ControlWeave
 * server, where each person signs in with their own account.
 *
 * Flags:
 *   --smoke-test               boot the full stack in a throwaway data folder,
 *                              sign in, shut down, exit 0 or 1. No windows.
 *                              With --server, check that server answers instead.
 *   --smoke-data-dir <dir>     data folder for --smoke-test (default: temp).
 *   --server <url>             always connect to this server (set by IT on the
 *                              shortcut; CONTROLWEAVE_SERVER_URL works too).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, session, shell } = require('electron');
const { createLogger } = require('./lib/log');
const { createStack, startStack, STEPS } = require('./lib/stack');
const { verifySignIn } = require('./lib/verify');
const { loadAdminCredentials, saveAdminCredentials } = require('./lib/secrets');
const backup = require('./lib/backup');
const { createMenuActions } = require('./lib/menuActions');
const connection = require('./lib/connection');
const { BUNDLED_MAJOR } = require('./lib/postgres');
const { initAutoUpdater, checkForUpdatesManual } = require('./updater');

const IS_SMOKE_TEST = process.argv.includes('--smoke-test');
const SMOKE_DEADLINE_MS = 8 * 60 * 1000;
const REPO_URL = 'https://github.com/sherifconteh-collab/ai-grc-platform';
const RESOURCES_ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');

let logger = null;
let stack = null;          // running stack: { frontendUrl, admin, stop, children }
let pending = null;        // stack still starting, so quit can stop it mid-start
let startupWindow = null;
let mainWindow = null;
let isQuitting = false;
let maintenance = false;   // a backup or restore holds the stack stopped
let quitAfterMaintenance = false;
let lastError = null;
let mode = null;           // { mode: 'local' } or { mode: 'server', origin }
let presetServer = null;   // server fixed by IT; the app then offers no switching
let presetError = null;
let connected = false;     // server mode: the server answered and the window may open

try {
  presetServer = connection.preset();
} catch (error) {
  presetError = error;
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

if (IS_SMOKE_TEST) {
  // Never touch the user's real data from a smoke test.
  const dir = argValue('--smoke-data-dir') || fs.mkdtempSync(path.join(os.tmpdir(), 'cw-smoke-'));
  app.setPath('userData', dir);
  process.env.CW_DESKTOP_LOG_STDOUT = '1';
} else if (!app.requestSingleInstanceLock()) {
  // A second launch (double-click while starting is common) must not start a
  // second stack on the same database and ports. The first instance focuses.
  app.exit(0);
}

function dataDir() {
  return app.getPath('userData');
}

function openSafeExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
  } catch (_) {
    // Ignore malformed URLs.
  }
}

/** Origin the main window shows: the local interface or the organization's server. */
function appOrigin() {
  if (mode && mode.mode === 'server') return connected ? mode.origin : null;
  return stack ? new URL(stack.frontendUrl).origin : null;
}

function isAppUrl(url) {
  const origin = appOrigin();
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Startup window
// ---------------------------------------------------------------------------

function sendStartup(event) {
  if (startupWindow && !startupWindow.isDestroyed()) startupWindow.webContents.send('startup:event', event);
}

function createStartupWindow() {
  startupWindow = new BrowserWindow({
    width: 560,
    height: 620,
    resizable: false,
    maximizable: false,
    title: 'ControlWeave',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'startup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  startupWindow.setMenuBarVisibility(false);
  startupWindow.loadFile(path.join(__dirname, 'startup.html'));
  startupWindow.once('ready-to-show', () => startupWindow.show());
  startupWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  startupWindow.on('closed', () => {
    startupWindow = null;
    if (!mainWindow && !isQuitting) app.quit();
  });
  return new Promise((resolve) => startupWindow.webContents.once('did-finish-load', resolve));
}

function fromStartupWindow(event) {
  return startupWindow && event.sender === startupWindow.webContents;
}

function registerStartupIpc() {
  ipcMain.handle('startup:info', (event) => {
    if (!fromStartupWindow(event)) return null;
    return { version: app.getVersion(), steps: STEPS, logPath: logger ? logger.filePath : null, canSwitch: !presetServer };
  });
  ipcMain.handle('startup:retry', (event) => {
    if (fromStartupWindow(event)) start();
  });
  ipcMain.handle('startup:choose-local', (event) => {
    if (!fromStartupWindow(event) || presetServer || busy()) return;
    mode = connection.save(dataDir(), { mode: 'local' });
    buildMenu();
    start();
  });
  ipcMain.handle('startup:choose-server', async (event, input) => {
    if (!fromStartupWindow(event) || presetServer || busy()) return { error: 'ControlWeave is busy; try again in a moment.' };
    let origin;
    try {
      origin = connection.normalizeServerUrl(input);
      await probe(origin);
    } catch (error) {
      if (!(error instanceof connection.ConnectionError)) return { error: `Could not connect: ${error.message}` };
      return { error: error.hint ? `${error.message} ${error.hint}` : error.message };
    }
    mode = connection.save(dataDir(), { mode: 'server', origin });
    buildMenu();
    start();
    return { ok: true };
  });
  ipcMain.handle('startup:change-connection', (event) => {
    if (fromStartupWindow(event) && !presetServer) showChooser();
  });
  ipcMain.handle('startup:open-logs', (event) => {
    if (fromStartupWindow(event) && logger) shell.openPath(logger.logsDir);
  });
  ipcMain.handle('startup:copy', (event, what) => {
    if (!fromStartupWindow(event)) return;
    const admin = loadAdminCredentials(dataDir());
    const values = {
      email: admin.email,
      password: admin.password,
      details: lastError ? formatErrorReport(lastError) : '',
    };
    if (Object.prototype.hasOwnProperty.call(values, what)) clipboard.writeText(values[what]);
  });
  ipcMain.handle('startup:continue', (event) => {
    if (!fromStartupWindow(event) || !stack) return;
    const admin = loadAdminCredentials(dataDir());
    saveAdminCredentials(dataDir(), { ...admin, shownToUser: true });
    openMainWindow();
  });
  ipcMain.handle('startup:quit', (event) => {
    if (fromStartupWindow(event)) app.quit();
  });
}

function formatErrorReport(error) {
  return [
    `ControlWeave ${app.getVersion()} on ${process.platform}-${process.arch}`,
    `Step: ${error.step || 'unknown'}`,
    `Error: ${error.message}`,
    error.hint ? `Hint: ${error.hint}` : null,
    '',
    ...(error.output || []),
    '',
    `Log: ${logger ? logger.filePath : 'unavailable'}`,
  ].filter((line) => line !== null).join('\n');
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function openMainWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'ControlWeave',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    openSafeExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openSafeExternal(url);
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    // -3 is a navigation the app itself replaced; anything else on the main
    // frame of a server window means the server did not answer.
    if (isMainFrame && code !== -3 && mode && mode.mode === 'server') lostServer(description);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.destroy();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // The site root is the marketing homepage; an installed app opens at sign-in.
  mainWindow.loadURL(`${appOrigin()}/login`);
  initAutoUpdater(mainWindow);
}

// ---------------------------------------------------------------------------
// Stack lifecycle
// ---------------------------------------------------------------------------

/** If the API or interface dies while the app is open, offer a restart. */
function watchForCrashes(running) {
  for (const child of running.children) {
    child.exited.then(async ({ code }) => {
      if (isQuitting || stack !== running || running.crashed) return;
      running.crashed = true;
      logger.log('error', `A server process exited unexpectedly (code ${code}).`);
      const { response } = await dialog.showMessageBox(mainWindow || undefined, {
        type: 'error',
        title: 'ControlWeave stopped',
        message: 'Part of ControlWeave stopped unexpectedly.',
        detail: `Your data is safe. Restart to continue.\n\nLog: ${logger.filePath}`,
        buttons: ['Restart', 'Quit'],
        defaultId: 0,
      });
      if (response !== 0) {
        app.quit();
        return;
      }
      const old = stack;
      stack = null;
      await old.stop();
      // Open the startup window first: closing the last window quits the app.
      await createStartupWindow();
      if (mainWindow) mainWindow.destroy();
      start();
    });
  }
}

function busy() {
  return launching || connecting || maintenance || Boolean(stack) || connected;
}

/** Decide how this installation runs (saved choice, IT preset, or ask), then run it. */
function start() {
  if (busy()) return;
  logger = createLogger(path.join(dataDir(), 'logs'));
  logger.log('info', `ControlWeave ${app.getVersion()} starting (${process.platform}-${process.arch}, packaged=${app.isPackaged})`);
  if (presetError) {
    showStartupError(presetError, 'The server address set for this installation (--server or CONTROLWEAVE_SERVER_URL) is not valid. Ask your IT department to correct it.');
    return;
  }
  if (presetServer) mode = { mode: 'server', origin: presetServer };
  else if (!mode) mode = connection.load(dataDir());
  // Installations from before the choice existed already hold local data.
  if (!mode && fs.existsSync(path.join(dataDir(), 'pgdata', 'PG_VERSION'))) {
    mode = connection.save(dataDir(), { mode: 'local' });
  }
  buildMenu();
  if (!mode) showChooser();
  else if (mode.mode === 'server') connectServer();
  else startLocal();
}

function showChooser() {
  sendStartup({ type: 'choose', current: mode });
}

function showStartupError(error, hint) {
  lastError = error;
  logger.log('error', formatErrorReport(error));
  sendStartup({
    type: 'error',
    message: error.message,
    hint: hint || error.hint || null,
    output: (error.output || []).slice(-12),
    logPath: logger.filePath,
    canChangeConnection: !presetServer && !presetError,
  });
}

function probe(origin) {
  // net.fetch uses the system proxy and certificate store, which company
  // networks and internal certificate authorities usually need.
  return connection.probeServer(origin, { fetchImpl: (url, options) => net.fetch(url, options) });
}

let connecting = false;
async function connectServer() {
  connecting = true;
  lastError = null;
  sendStartup({ type: 'notice', text: `Connecting to ${mode.origin}...` });
  try {
    const info = await probe(mode.origin);
    logger.log('info', `Connected to ${mode.origin} (server version ${info.version || 'unknown'}, registration ${info.registration || 'unknown'})`);
    connected = true;
    openMainWindow();
  } catch (error) {
    showStartupError(error, presetServer
      ? 'Your IT department set this installation to use this server. Check your network or VPN connection, or contact them if it stays unreachable.'
      : 'Check your network or VPN connection and try again, or change the connection to use a different address.');
  } finally {
    connecting = false;
  }
}

/** The server stopped answering while the app was open: back to the startup window. */
async function lostServer(description) {
  if (!connected || isQuitting) return;
  connected = false;
  logger.log('warn', `Lost the connection to ${mode.origin}: ${description}`);
  await createStartupWindow();
  if (mainWindow) mainWindow.destroy();
  start();
}

let launching = false;
async function startLocal() {
  if (launching || stack) return;
  launching = true;
  lastError = null;
  sendStartup({ type: 'reset' });

  try {
    pending = createStack({
      dataDir: dataDir(),
      appRoot: __dirname,
      resourcesRoot: RESOURCES_ROOT,
      isPackaged: app.isPackaged,
      nodeBinary: process.execPath,
      logger,
      onStep: (id, status) => sendStartup({ type: 'step', id, status }),
    });
    const info = await pending.start();
    stack = { ...info, stop: pending.stop, children: pending.children };
    logger.log('info', `Ready at ${stack.frontendUrl}`);
    watchForCrashes(stack);

    if (!stack.admin.shownToUser) {
      sendStartup({ type: 'first-run', email: stack.admin.email, password: stack.admin.password });
    } else {
      openMainWindow();
    }
  } catch (error) {
    showStartupError(error);
  } finally {
    pending = null;
    launching = false;
  }
}

async function runSmokeTest() {
  const deadline = setTimeout(() => {
    process.stderr.write(`Smoke test exceeded ${SMOKE_DEADLINE_MS / 60000} minutes\n`);
    app.exit(1);
  }, SMOKE_DEADLINE_MS);

  logger = createLogger(path.join(dataDir(), 'logs'));
  let code = 0;
  let running = null;
  try {
    if (presetError) throw presetError;
    if (presetServer) {
      const info = await probe(presetServer);
      logger.log('info', `Smoke test passed: ${presetServer} answered as a ControlWeave server (version ${info.version || 'unknown'}).`);
      return;
    }
    running = await startStack({
      dataDir: dataDir(),
      appRoot: __dirname,
      resourcesRoot: RESOURCES_ROOT,
      isPackaged: app.isPackaged,
      nodeBinary: process.execPath,
      logger,
    });
    await verifySignIn(running);
    logger.log('info', 'Smoke test passed: stack started and the administrator signed in.');
  } catch (error) {
    code = 1;
    logger.log('error', `Smoke test failed: ${error.message}`);
    for (const line of error.output || []) logger.log('error', `  | ${line}`);
  } finally {
    if (running) await running.stop();
    clearTimeout(deadline);
    // app.quit() is asynchronous and can leave helper processes holding the CI
    // step open; exit immediately with the result instead.
    app.exit(code);
  }
}

// ---------------------------------------------------------------------------
// Menu and backups
// ---------------------------------------------------------------------------

// The File and Help menu actions live in lib/menuActions.js so a test can call
// them with the dialogs stubbed. `state` is a live view of the variables above.
const state = {
  get stack() { return stack; }, set stack(v) { stack = v; },
  get maintenance() { return maintenance; }, set maintenance(v) { maintenance = v; },
  get launching() { return launching; },
  get connecting() { return connecting; },
  get connected() { return connected; }, set connected(v) { connected = v; },
  get mode() { return mode; },
  get presetServer() { return presetServer; },
  get quitAfterMaintenance() { return quitAfterMaintenance; },
};

const menuActions = createMenuActions({
  state,
  app,
  dialog,
  shell,
  clipboard,
  backup,
  bundledMajor: BUNDLED_MAJOR,
  dataDir,
  logger: () => logger,
  loadAdminCredentials,
  getMainWindow: () => mainWindow,
  getStartupWindow: () => startupWindow,
  createStartupWindow,
  sendStartup,
  destroyMainWindow: () => { if (mainWindow) mainWindow.destroy(); },
  startLocal,
  showChooser,
  checkForUpdates: checkForUpdatesManual,
  openExternal: openSafeExternal,
  repoUrl: REPO_URL,
  isPackaged: app.isPackaged,
  platform: process.platform,
});
const { backupAfterStop } = menuActions;

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuActions.buildMenuTemplate()));
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  const win = mainWindow || startupWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  if (IS_SMOKE_TEST) {
    await runSmokeTest();
    return;
  }
  if (process.platform === 'win32') app.setAppUserModelId('com.controlweave.desktop');
  ipcMain.handle('get-app-version', () => app.getVersion());
  // In server mode the window shows a remote site: grant it only what the
  // interface uses (desktop notifications, copy buttons), and nothing else.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const allowed = permission === 'notifications' || permission === 'clipboard-sanitized-write';
    callback(allowed && isAppUrl((details && details.requestingUrl) || contents.getURL()));
  });
  registerStartupIpc();
  buildMenu();
  await createStartupWindow();
  start();
});

app.on('activate', () => {
  if (IS_SMOKE_TEST) return;
  if ((stack || connected) && !mainWindow) openMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || (!stack && !connected)) app.quit();
});

app.on('before-quit', (event) => {
  if (IS_SMOKE_TEST) return;
  if (maintenance) {
    // Never exit halfway through copying a backup or a restore.
    event.preventDefault();
    quitAfterMaintenance = true;
    return;
  }
  if (isQuitting) return;
  isQuitting = true;
  const running = stack || pending;
  if (!running) return;
  event.preventDefault();
  // Back up only a stack that finished starting, never one stopped mid-start.
  const fullyStarted = running === stack;
  stack = null;
  pending = null;
  running.stop()
    .then((result) => { if (fullyStarted) backupAfterStop(result); })
    .catch((error) => logger && logger.log('warn', `Shutdown error: ${error.message}`))
    .finally(() => app.quit());
});
