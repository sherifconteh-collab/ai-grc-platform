/**
 * Type declarations for the Electron preload API.
 *
 * When the app runs inside the ControlWeave desktop shell, the preload script
 * exposes `window.electronAPI`.  In a regular browser this property is
 * undefined — components should feature-detect before calling these methods.
 */

interface ElectronUpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string | null;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ updateAvailable?: boolean; version?: string; error?: string }>;
  downloadUpdate: () => Promise<{ success?: boolean; error?: string }>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (data: ElectronUpdateStatus) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
