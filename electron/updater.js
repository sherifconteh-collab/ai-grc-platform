'use strict';

/**
 * ControlWeave Desktop — Auto-Updater
 *
 * Uses electron-updater to check the online ControlWeave GitHub Releases for
 * new versions.  Downloads are manual (autoDownload: false) so the user stays
 * in control.  Status events are forwarded to the renderer via IPC so the UI
 * can display update notifications.
 */

const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

let mainWindow = null;

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

  // ── Configuration ────────────────────────────────────────────────────────
  autoUpdater.autoDownload = false;           // let the user decide
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
  });

  // ── IPC handlers (renderer → main) ──────────────────────────────────────
  ipcMain.handle('check-for-updates', async () => {
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
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    // quitAndInstall(isSilent, isForceRunAfter)
    autoUpdater.quitAndInstall(false, true);
  });

  // ── Background check on startup ─────────────────────────────────────────
  // Wait 10 seconds so the main window has fully loaded before checking.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — network may not be available at launch.
    });
  }, 10_000);
}

module.exports = { initAutoUpdater };
