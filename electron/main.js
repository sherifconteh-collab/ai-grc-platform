'use strict';

/**
 * ControlWeave Desktop - Electron main process.
 *
 * The stack itself (database, migrations, API, interface) lives in
 * lib/stack.js and has no Electron dependency, so CI boots exactly the same
 * code with scripts/stack-smoke.js. This file only owns windows, menus,
 * the single-instance lock and the app lifecycle.
 *
 * Flags:
 *   --smoke-test               boot the full stack in a throwaway data folder,
 *                              sign in, shut down, exit 0 or 1. No windows.
 *   --smoke-data-dir <dir>     data folder for --smoke-test (default: temp).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require('electron');
const { createLogger } = require('./lib/log');
const { createStack, startStack, STEPS } = require('./lib/stack');
const { verifySignIn } = require('./lib/verify');
const { loadAdminCredentials, saveAdminCredentials } = require('./lib/secrets');
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
let lastError = null;

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

function isAppUrl(url) {
  if (!stack) return false;
  try {
    return new URL(url).origin === new URL(stack.frontendUrl).origin;
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
    height: 520,
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
    return { version: app.getVersion(), steps: STEPS, logPath: logger ? logger.filePath : null };
  });
  ipcMain.handle('startup:retry', (event) => {
    if (fromStartupWindow(event)) launch();
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.destroy();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // The site root is the marketing homepage; an installed app opens at sign-in.
  mainWindow.loadURL(`${stack.frontendUrl}/login`);
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
      launch();
    });
  }
}

let launching = false;
async function launch() {
  if (launching || stack) return;
  launching = true;
  lastError = null;
  logger = createLogger(path.join(dataDir(), 'logs'));
  logger.log('info', `ControlWeave ${app.getVersion()} starting (${process.platform}-${process.arch}, packaged=${app.isPackaged})`);
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
    lastError = error;
    logger.log('error', formatErrorReport(error));
    sendStartup({
      type: 'error',
      message: error.message,
      hint: error.hint || null,
      output: (error.output || []).slice(-12),
      logPath: logger.filePath,
    });
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
  }
  // app.quit() is asynchronous and can leave helper processes holding the CI
  // step open; exit immediately with the result instead.
  app.exit(code);
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

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ role: process.platform === 'darwin' ? 'close' : 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: viewItems },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates...', click: () => checkForUpdatesManual() },
        { type: 'separator' },
        { label: 'Show First-Run Sign-In Details', click: showSignInDetails },
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
  registerStartupIpc();
  buildMenu();
  await createStartupWindow();
  launch();
});

app.on('activate', () => {
  if (IS_SMOKE_TEST) return;
  if (stack && !mainWindow) openMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || !stack) app.quit();
});

app.on('before-quit', (event) => {
  if (isQuitting || IS_SMOKE_TEST) return;
  isQuitting = true;
  const running = stack || pending;
  if (!running) return;
  event.preventDefault();
  stack = null;
  pending = null;
  running.stop()
    .catch((error) => logger && logger.log('warn', `Shutdown error: ${error.message}`))
    .finally(() => app.quit());
});
