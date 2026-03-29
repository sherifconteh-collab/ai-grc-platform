'use strict';

/**
 * ControlWeave Desktop — Auto-Updater
 *
 * Uses electron-updater to check the online ControlWeave GitHub Releases for
 * new versions.  Downloads happen automatically (autoDownload: true) so the
 * user gets the latest version as soon as possible.  Status events are forwarded to the renderer via IPC so the UI
 * can display update notifications.
 */

const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { app, ipcMain, dialog } = require('electron');

let mainWindow = null;

/** Delay before the first automatic update check (ms). */
const STARTUP_UPDATE_CHECK_DELAY_MS = 10_000;

// Whether the current check was triggered explicitly by the user (menu click).
// When true, we show native dialogs for "no update" and "error" feedback.
let isManualCheck = false;
const UPDATE_UNAVAILABLE_MESSAGE = 'Automatic updates are not available for this build.';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Send an update-status event to the renderer process.
 * Silently no-ops if the window has been closed.
 */
function sendStatusToWindow(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', data);
  }
}

function canCheckForUpdates() {
  if (!app.isPackaged) {
    return false;
  }

  return fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Initialise the auto-updater.  Call once after the BrowserWindow is created.
 *
 * @param {Electron.BrowserWindow} win  The main application window.
 */
function initAutoUpdater(win) {
  mainWindow = win;

  // ── IPC handlers (renderer → main) ──────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
    if (!canCheckForUpdates()) {
      return { updateAvailable: false, skipped: true, reason: UPDATE_UNAVAILABLE_MESSAGE };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return { updateAvailable: false };
      return {
        updateAvailable: result.updateInfo.version !== autoUpdater.currentVersion.version,
        version: result.updateInfo.version,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    if (!canCheckForUpdates()) {
      return { error: UPDATE_UNAVAILABLE_MESSAGE };
    }

    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    if (!canCheckForUpdates()) {
      return { error: UPDATE_UNAVAILABLE_MESSAGE };
    }

    // quitAndInstall(isSilent, isForceRunAfter)
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  if (!canCheckForUpdates()) {
    console.log('[Updater] Skipping auto-update initialization because app-update.yml is not present for this build.');
    return;
  }

  // ── Configuration ────────────────────────────────────────────────────────
  autoUpdater.autoDownload = true;            // download immediately when found
  autoUpdater.autoInstallOnAppQuit = true;    // install silently on next quit
  autoUpdater.logger = console;

  // ── Lifecycle events → renderer IPC ──────────────────────────────────────
  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow({
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow({ status: 'not-available', version: info.version });
    if (isManualCheck) {
      isManualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates Available',
        message: `You're running the latest version (v${info.version}).`,
        buttons: ['OK'],
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatusToWindow({
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow({ status: 'error', message: err.message });
    if (isManualCheck) {
      isManualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Update Check Failed',
        message: `Could not check for updates.\n\n${err.message}`,
        buttons: ['OK'],
      });
    }
  });

  // ── Background check on startup ─────────────────────────────────────────
  // Wait so the main window has fully loaded before checking.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — network may not be available at launch.
    });
  }, STARTUP_UPDATE_CHECK_DELAY_MS);
}

/**
 * Trigger a manual update check from the application menu.
 * Shows native dialogs if no update is found or an error occurs.
 */
function checkForUpdatesManual() {
  if (!canCheckForUpdates()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Updates Unavailable',
        message: UPDATE_UNAVAILABLE_MESSAGE,
        detail: 'Install a packaged release build to enable automatic updates.',
        buttons: ['OK'],
      });
    }
    return;
  }

  isManualCheck = true;
  autoUpdater.checkForUpdates().catch((err) => {
    isManualCheck = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Update Check Failed',
        message: `Could not check for updates.\n\n${err.message}`,
        buttons: ['OK'],
      });
    }
  });
}

module.exports = { initAutoUpdater, checkForUpdatesManual };
