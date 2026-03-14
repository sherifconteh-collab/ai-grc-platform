'use strict';

/**
 * Electron Preload Script
 *
 * Runs in the renderer process with contextIsolation enabled.
 * Expose only a minimal, explicitly-defined API surface to the web content.
 * Never enable nodeIntegration — keep the renderer sandboxed.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a small set of safe APIs to the renderer.
// Expand this object carefully if more IPC channels are needed in the future.
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Returns the application version string.
   * The renderer can display this in an "About" dialog if needed.
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ── Auto-update API ─────────────────────────────────────────────────────
  /** Trigger a manual check for updates. */
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  /** Begin downloading an available update. */
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  /** Quit and install the downloaded update. */
  installUpdate: () => ipcRenderer.invoke('install-update'),
  /**
   * Subscribe to update-status events from the main process.
   * Returns an unsubscribe function so the caller can clean up.
   */
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});
