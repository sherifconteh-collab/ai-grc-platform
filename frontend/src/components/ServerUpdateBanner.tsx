'use client';

/**
 * Server Update Banner
 *
 * Web/server-deployment equivalent of the Electron-only UpdateBanner.
 *
 * Polls GET /api/v1/update-check on mount (and once per hour thereafter) to
 * detect whether a newer ControlWeave version has been published to GitHub.
 *
 * Feature model ("baked-in"):
 *   All feature code already ships in every build. Activating a license key
 *   unlocks pre-existing code paths with no download. An update delivers new
 *   features and bug-fixes by replacing the running binary / Docker image.
 *   Users update by pulling the latest tag — e.g.:
 *     docker pull ghcr.io/sherifconteh-collab/ai-grc-platform:latest
 *   or by running `git pull && npm run build` for source deployments.
 *
 * Dismiss behaviour:
 *   - Community edition: banner can be permanently dismissed (sessionStorage).
 *   - Licensed (paid) edition: `updateRequired` flag from the API causes the
 *     banner to re-appear after a 24-hour snooze (localStorage with timestamp).
 *     This surfaces update availability more prominently for paying customers
 *     without hard-blocking access.
 *
 * Only renders for admin users (role === 'admin' or isPlatformAdmin).
 * Renders nothing in Electron (handled by the dedicated UpdateBanner component).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateCheckAPI } from '@/lib/api';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // Re-check every hour
const SNOOZE_KEY       = 'cw_update_snooze_until';
const DISMISS_KEY      = 'cw_update_dismissed_version';
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  updateRequired: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  checkedAt: string;
  error: string | null;
}

function isSnoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || '0');
    return Date.now() < until;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DURATION_MS));
  } catch { /* ignore */ }
}

function isDismissed(version: string | null): boolean {
  if (!version) return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

function dismiss(version: string | null) {
  if (!version) return;
  try {
    sessionStorage.setItem(DISMISS_KEY, version);
  } catch { /* ignore */ }
}

export default function ServerUpdateBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only admins see this banner.
  const isAdmin = Boolean(user && (user.role === 'admin' || user.isPlatformAdmin));

  const fetchStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await updateCheckAPI.getStatus();
      const data: UpdateStatus = res.data?.data;
      if (data) {
        setStatus(data);
        setHidden(false); // reset so new data can re-show the banner
      }
    } catch {
      // Silently ignore — update checks are never mandatory.
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    // Detect Electron — the dedicated UpdateBanner handles that environment.
    if (typeof window !== 'undefined' && window.electronAPI) return;

    fetchStatus();

    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAdmin, fetchStatus]);

  // Nothing to show when no data, no update, or already hidden this session.
  if (!status || !status.available || hidden) return null;

  // Respect snooze / dismiss based on whether the update is required.
  if (status.updateRequired) {
    if (isSnoozed()) return null;
  } else {
    if (isDismissed(status.latestVersion)) return null;
  }

  const handleSnooze = () => {
    snooze();
    setHidden(true);
  };

  const handleDismiss = () => {
    dismiss(status.latestVersion);
    setHidden(true);
  };

  const releaseHref = status.releaseUrl || `https://github.com/sherifconteh-collab/ai-grc-platform/releases`;

  return (
    <div
      role="banner"
      aria-live="polite"
      className="w-full px-5 py-3 text-sm flex items-center justify-between gap-4 shadow-md"
      style={bannerStyle(status.updateRequired)}
    >
      {/* Left: message */}
      <span className="flex items-center gap-2 font-medium">
        <span className="text-base" aria-hidden="true">
          {status.updateRequired ? '🔔' : 'ℹ️'}
        </span>
        <span>
          {status.updateRequired ? (
            <>
              <strong>Update recommended:</strong>{' '}
              ControlWeave{' '}
              <strong>v{status.latestVersion}</strong>{' '}
              is available{status.releaseName ? ` — ${status.releaseName}` : ''}.{' '}
              Pull the latest build to receive all features covered by your license.
            </>
          ) : (
            <>
              ControlWeave{' '}
              <strong>v{status.latestVersion}</strong>{' '}
              is available{status.releaseName ? ` — ${status.releaseName}` : ''}.
            </>
          )}
        </span>
      </span>

      {/* Right: actions */}
      <span className="flex items-center gap-3 shrink-0">
        <a
          href={releaseHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 rounded-md bg-white font-semibold text-xs shadow hover:bg-gray-50 active:scale-95 transition-all"
          style={{ color: status.updateRequired ? '#7c3aed' : '#374151' }}
        >
          View Release ↗
        </a>

        {/* Licensed: snooze only (banner returns after 24 h) */}
        {status.updateRequired ? (
          <button
            onClick={handleSnooze}
            className="text-xs opacity-80 hover:opacity-100 underline cursor-pointer bg-transparent border-none"
            style={{ color: 'inherit' }}
          >
            Remind me tomorrow
          </button>
        ) : (
          /* Community: permanent dismiss for this session */
          <button
            onClick={handleDismiss}
            className="p-1 rounded-full opacity-70 hover:opacity-100 hover:bg-white/20 transition cursor-pointer bg-transparent border-none"
            aria-label="Dismiss update notification"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

function bannerStyle(updateRequired: boolean): React.CSSProperties {
  if (updateRequired) {
    // Prominent purple gradient for licensed installations.
    return { background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff' };
  }
  // Subtle blue-gray for community/info.
  return { background: 'linear-gradient(135deg, #1e40af, #1d4ed8)', color: '#fff' };
}
