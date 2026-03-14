'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Auto-update notification banner for the ControlWeave desktop app.
 *
 * When running inside Electron, `window.electronAPI` is available and exposes
 * IPC methods for checking, downloading, and installing updates from the
 * online ControlWeave GitHub Releases.
 *
 * Flow:
 *  1. App auto-checks GitHub Releases on startup (auto-download is ON).
 *  2. If a new version is found, download starts immediately.
 *  3. Banner shows progress bar during download.
 *  4. When ready, a prominent green banner with "Restart & Update" appears.
 *
 * In a regular browser this component renders nothing.
 */

type BannerState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number; version?: string }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string };

export default function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  // Detect Electron environment on mount (client-side only).
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  // Listen for status events pushed from the Electron main process.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api = window.electronAPI;
    if (!api) return;

    const unsubscribe = api.onUpdateStatus((data) => {
      switch (data.status) {
        case 'checking':
          setState({ kind: 'checking' });
          break;
        case 'available':
          setState({ kind: 'available', version: data.version ?? 'unknown' });
          setDismissed(false);
          break;
        case 'not-available':
          setState({ kind: 'idle' });
          break;
        case 'downloading':
          setState((prev) => ({
            kind: 'downloading',
            percent: data.percent ?? 0,
            version: prev.kind === 'available' ? prev.version : undefined,
          }));
          setDismissed(false);
          break;
        case 'downloaded':
          setState({ kind: 'downloaded', version: data.version ?? 'unknown' });
          setDismissed(false);
          break;
        case 'error':
          setState({ kind: 'error', message: data.message ?? 'Unknown error' });
          break;
      }
    });

    return unsubscribe;
  }, []);

  const handleDownload = useCallback(() => {
    window.electronAPI?.downloadUpdate();
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI?.installUpdate();
  }, []);

  const handleCheckAgain = useCallback(() => {
    setState({ kind: 'checking' });
    window.electronAPI?.checkForUpdates();
  }, []);

  // ── Nothing to show ─────────────────────────────────────────────────────
  if (!isElectron) return null;
  if (state.kind === 'idle') return null;
  if (state.kind === 'checking') return null;
  if (dismissed) return null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="relative z-50 w-full px-5 py-3 text-sm flex items-center justify-between gap-4 shadow-md"
      style={bannerStyle(state.kind)}
    >
      {/* Left: status message */}
      <span className="flex items-center gap-2 font-medium">
        {state.kind === 'available' && (
          <>
            <span className="text-lg">🔔</span>
            A new version of ControlWeave is available: <strong>v{state.version}</strong>
          </>
        )}
        {state.kind === 'downloading' && (
          <>
            <span className="text-lg">⬇️</span>
            Downloading update{state.version ? ` v${state.version}` : ''}… {state.percent}%
          </>
        )}
        {state.kind === 'downloaded' && (
          <>
            <span className="text-lg">✅</span>
            Update to <strong>v{state.version}</strong> is ready — restart to finish installing
          </>
        )}
        {state.kind === 'error' && (
          <>
            <span className="text-lg">⚠️</span>
            Update check failed: {state.message}
          </>
        )}
      </span>

      {/* Right: action buttons */}
      <span className="flex items-center gap-3 shrink-0">
        {state.kind === 'available' && (
          <button
            onClick={handleDownload}
            className="px-5 py-2 rounded-lg bg-white text-purple-700 font-semibold text-sm shadow hover:bg-purple-50 active:scale-95 transition-all cursor-pointer"
          >
            ⬇️ Download Now
          </button>
        )}

        {state.kind === 'downloading' && (
          <div className="flex items-center gap-3">
            <span className="inline-block w-40 h-2.5 rounded-full bg-white/30 overflow-hidden">
              <span
                className="block h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${state.percent}%` }}
              />
            </span>
            <span className="text-white/80 text-xs font-mono">{state.percent}%</span>
          </div>
        )}

        {state.kind === 'downloaded' && (
          <button
            onClick={handleInstall}
            className="px-6 py-2.5 rounded-lg bg-white text-green-700 font-bold text-sm shadow-lg hover:bg-green-50 active:scale-95 transition-all cursor-pointer motion-safe:animate-pulse"
          >
            🔄 Restart &amp; Update
          </button>
        )}

        {state.kind === 'error' && (
          <button
            onClick={handleCheckAgain}
            className="px-5 py-2 rounded-lg bg-white text-amber-700 font-semibold text-sm shadow hover:bg-amber-50 active:scale-95 transition-all cursor-pointer"
          >
            🔁 Retry
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="ml-1 p-1 rounded-full opacity-70 hover:opacity-100 hover:bg-white/20 transition"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </span>
    </div>
  );
}

/** Inline styles for the banner background by state. */
function bannerStyle(kind: BannerState['kind']): React.CSSProperties {
  const base: React.CSSProperties = { color: '#fff' };
  switch (kind) {
    case 'available':
      return { ...base, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' };
    case 'downloading':
      return { ...base, background: 'linear-gradient(135deg, #6d28d9, #4c1d95)' };
    case 'downloaded':
      return { ...base, background: 'linear-gradient(135deg, #059669, #047857)' };
    case 'error':
      return { ...base, background: 'linear-gradient(135deg, #d97706, #b45309)' };
    default:
      return base;
  }
}
