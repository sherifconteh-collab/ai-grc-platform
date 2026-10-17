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

/** Menu: stop what runs now (backing up local data first) and ask again. */
async function changeConnection() {
  if (presetServer || maintenance || launching || connecting) return;
  const local = mode && mode.mode === 'local';
  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    title: 'Change connection',
    message: local ? 'Connect to your organization\'s server instead?' : 'Stop using this server?',
    detail: local
      ? 'ControlWeave stops the database on this computer and backs it up first. Your local data stays on this computer, and you can switch back to it at any time.'
      : `ControlWeave closes ${mode.origin}. You can connect to it again at any time.`,
    buttons: ['Continue', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  maintenance = true;
  try {
    await createStartupWindow();
    if (mainWindow) mainWindow.destroy();
    connected = false;
    if (stack) {
      const running = stack;
      stack = null;
      sendStartup({ type: 'notice', text: 'Stopping and backing up your data...' });
      backupAfterStop(await running.stop());
    }
  } catch (error) {
    if (logger) logger.log('warn', `Stopping for a connection change: ${error.message}`);
  } finally {
    maintenance = false;
  }
  if (quitAfterMaintenance) app.quit();
  else showChooser();
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
// Backups
// ---------------------------------------------------------------------------

/** Daily backup after the database has stopped cleanly. Never blocks quitting on failure. */
function backupAfterStop(result) {
  if (!result || !result.databaseStopped) return null;
  try {
    const dir = backup.createBackup(dataDir(), { appVersion: app.getVersion() });
    if (logger) logger.log('info', `Backup saved to ${dir}`);
    return dir;
  } catch (error) {
    if (logger) logger.log('warn', `Backup failed: ${error.message}`);
    return null;
  }
}

/**
 * Stop the stack, run `work` while the database is down, then start again.
 * The startup window shows `notice` meanwhile and the restarted progress after.
 */
async function withStackStopped(notice, work) {
  if (!stack || maintenance) return;
  maintenance = true;
  const running = stack;
  stack = null;
  try {
    // Open the startup window first: closing the last window quits the app.
    await createStartupWindow();
    if (mainWindow) mainWindow.destroy();
    sendStartup({ type: 'notice', text: notice });
    const result = await running.stop();
    if (!result.databaseStopped) throw new Error('The database did not stop, so it was left untouched.');
    await work();
  } catch (error) {
    if (logger) logger.log('error', `${notice} failed: ${error.message}`);
    await dialog.showMessageBox(startupWindow || undefined, {
      type: 'error',
      title: 'ControlWeave',
      message: `${notice.replace(/\.+$/, '')} failed`,
      detail: error.message,
    });
  } finally {
    maintenance = false;
    if (quitAfterMaintenance) app.quit();
    else startLocal();
  }
}

function backUpNow() {
  return withStackStopped('Backing up your data...', async () => {
    const dir = backup.createBackup(dataDir(), { appVersion: app.getVersion() });
    await dialog.showMessageBox(startupWindow || undefined, {
      type: 'info',
      title: 'Backup saved',
      message: 'Your data is backed up.',
      detail: `${dir}\n\nUse File > Export Latest Backup to copy it to another disk.`,
    });
  });
}

async function exportLatestBackup() {
  const [latest] = backup.listBackups(dataDir());
  if (!latest) {
    await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: 'No backup yet',
      message: 'There is no backup to export yet.',
      detail: 'ControlWeave backs up when you quit. Use File > Back Up Now to make one immediately.',
    });
    return;
  }
  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'warning',
    title: 'Export backup',
    message: `Export the backup from ${latest.name}?`,
    detail: 'The backup holds all of this installation\'s data, for every account, together with the keys that decrypt it and the first-run administrator password. Store it only somewhere as protected as this computer.',
    buttons: ['Choose Folder...', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'Export ControlWeave backup to',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return;
  try {
    const dest = backup.exportBackup(latest.dir, filePaths[0]);
    await dialog.showMessageBox(mainWindow || undefined, { type: 'info', title: 'Backup exported', message: 'Backup exported.', detail: dest });
  } catch (error) {
    await dialog.showMessageBox(mainWindow || undefined, { type: 'error', title: 'Export failed', message: 'The backup could not be exported.', detail: error.message });
  }
}

async function restoreFromBackup() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'Choose a ControlWeave backup folder',
    defaultPath: backup.backupsDir(dataDir()),
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return;
  const source = filePaths[0];
  let manifest;
  try {
    manifest = backup.readBackup(source, BUNDLED_MAJOR);
  } catch (error) {
    await dialog.showMessageBox(mainWindow || undefined, { type: 'error', title: 'Not a usable backup', message: 'This folder cannot be restored.', detail: error.message });
    return;
  }
  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'warning',
    title: 'Restore backup',
    message: `Replace all data in this installation with the backup from ${new Date(manifest.createdAt).toLocaleString()}?`,
    detail: 'This replaces the data of every account in this installation, and ControlWeave restarts. Your current data is kept in the backups folder (pre-restore), so the restore can be undone.',
    buttons: ['Restore', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  await withStackStopped('Restoring your backup...', async () => {
    backup.restoreBackup(dataDir(), source, { bundledMajor: BUNDLED_MAJOR });
  });
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function showSignInDetails() {
  const admin = loadAdminCredentials(dataDir());
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: 'First-run sign-in details',
    message: 'The administrator account created on first launch',
    detail: `Email: ${admin.email}\nInitial password: ${admin.password}\n\nIf you changed the password inside ControlWeave, use your new password instead.`,
    buttons: ['Copy password', 'Close'],
    defaultId: 1,
  }).then(({ response }) => {
    if (response === 0) clipboard.writeText(admin.password);
  });
}

function buildMenu() {
  const viewItems = [
    { role: 'reload' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (!app.isPackaged) viewItems.push({ role: 'toggleDevTools' });

  const local = !mode || mode.mode === 'local';
  const fileItems = local ? [
    { label: 'Back Up Now', click: () => backUpNow() },
    { label: 'Export Latest Backup...', click: () => exportLatestBackup() },
    { label: 'Restore from Backup...', click: () => restoreFromBackup() },
    { label: 'Open Backups Folder', click: () => shell.openPath(backup.backupsDir(dataDir())) },
    { type: 'separator' },
  ] : [];
  if (!presetServer && mode) {
    fileItems.push(
      { label: local ? 'Connect to a Server...' : 'Change Connection...', click: () => changeConnection() },
      { type: 'separator' }
    );
  }
  const helpLocal = local ? [{ label: 'Show First-Run Sign-In Details', click: showSignInDetails }] : [];

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [...fileItems, { role: process.platform === 'darwin' ? 'close' : 'quit' }],
    },
    { role: 'editMenu' },
    { label: 'View', submenu: viewItems },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates...', click: () => checkForUpdatesManual() },
        { type: 'separator' },
        ...helpLocal,
        { label: 'Open Logs Folder', click: () => shell.openPath(path.join(dataDir(), 'logs')) },
        { type: 'separator' },
        { label: 'Documentation', click: () => openSafeExternal(REPO_URL) },
        { label: 'Report Issue', click: () => openSafeExternal(`${REPO_URL}/issues`) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
