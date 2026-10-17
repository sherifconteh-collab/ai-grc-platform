'use strict';

/**
 * Preload for the startup window only. The main app window uses preload.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('startup', {
  info: () => ipcRenderer.invoke('startup:info'),
  retry: () => ipcRenderer.invoke('startup:retry'),
  openLogs: () => ipcRenderer.invoke('startup:open-logs'),
  copy: (what) => ipcRenderer.invoke('startup:copy', what),
  continue: () => ipcRenderer.invoke('startup:continue'),
  chooseLocal: () => ipcRenderer.invoke('startup:choose-local'),
  chooseServer: (url) => ipcRenderer.invoke('startup:choose-server', url),
  changeConnection: () => ipcRenderer.invoke('startup:change-connection'),
  quit: () => ipcRenderer.invoke('startup:quit'),
  onEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('startup:event', handler);
    return () => ipcRenderer.removeListener('startup:event', handler);
  },
});
