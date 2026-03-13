'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Auto-update notification banner for the ControlWeave desktop app.
 *
 * When running inside Electron, `window.electronAPI` is available and exposes
 * IPC methods for checking, downloading, and installing updates from the
 * online ControlWeave GitHub Releases.  In a regular browser this component
 * renders nothing.
 */

type BannerState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
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
    if (!api) return;              // not running in Electron — skip

    const unsubscribe = api.onUpdateStatus((data) => {
      switch (data.status) {
        case 'checking':
          setState({ kind: 'checking' });
          break;
        case 'available':
          setState({ kind: 'available', version: data.version ?? 'unknown' });
          setDismissed(false);     // re-show if a new version appears
          break;
        case 'not-available':
          setState({ kind: 'idle' });
          break;
        case 'downloading':
          setState({ kind: 'downloading', percent: data.percent ?? 0 });
          break;
        case 'downloaded':
          setState({ kind: 'downloaded', version: data.version ?? 'unknown' });
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
  if (!isElectron) return null;           // not in Electron
  if (state.kind === 'idle') return null;
  if (state.kind === 'checking') return null;
  if (dismissed) return null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="relative z-50 w-full px-4 py-2.5 text-sm flex items-center justify-between gap-4"
      style={bannerStyle(state.kind)}>

      <span className="flex items-center gap-2">
        {state.kind === 'available' && (
          <>🔔 A new version of ControlWeave is available: <strong>v{state.version}</strong></>
        )}
        {state.kind === 'downloading' && (
          <>⬇️ Downloading update… {state.percent}%</>
        )}
        {state.kind === 'downloaded' && (
          <>✅ Update to <strong>v{state.version}</strong> is ready to install</>
        )}
        {state.kind === 'error' && (
          <>⚠️ Update check failed: {state.message}</>
        )}
      </span>

      <span className="flex items-center gap-2 shrink-0">
        {state.kind === 'available' && (
          <button onClick={handleDownload}
            className="px-3 py-1 rounded bg-white/90 text-purple-700 font-medium hover:bg-white transition">
            Download Update
          </button>
        )}
        {state.kind === 'downloading' && (
          <span className="inline-block w-32 h-2 rounded-full bg-white/30 overflow-hidden">
            <span className="block h-full bg-white rounded-full transition-all"
              style={{ width: `${state.percent}%` }} />
          </span>
        )}
        {state.kind === 'downloaded' && (
          <button onClick={handleInstall}
            className="px-3 py-1 rounded bg-white/90 text-green-700 font-medium hover:bg-white transition">
            Restart &amp; Install
          </button>
        )}
        {state.kind === 'error' && (
          <button onClick={handleCheckAgain}
            className="px-3 py-1 rounded bg-white/90 text-amber-700 font-medium hover:bg-white transition">
            Retry
          </button>
        )}
        <button onClick={() => setDismissed(true)}
          className="ml-1 opacity-70 hover:opacity-100 transition"
          aria-label="Dismiss">✕</button>
      </span>
    </div>
  );
}

/** Inline styles for the banner background by state. */
function bannerStyle(kind: BannerState['kind']): React.CSSProperties {
  const base: React.CSSProperties = { color: '#fff' };
  switch (kind) {
    case 'available':   return { ...base, background: '#7c3aed' };  // purple-600
    case 'downloading': return { ...base, background: '#6d28d9' };  // purple-700
    case 'downloaded':  return { ...base, background: '#059669' };  // emerald-600
    case 'error':       return { ...base, background: '#d97706' };  // amber-600
    default:            return base;
  }
}
