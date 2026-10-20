/**
 * Browser-side storage for AI conversation and result state.
 *
 * Copilot messages and cached AI answers can contain data built from what the
 * signed-in user's role may read. They are therefore keyed by user id, never
 * by organization alone (a second member of the organization on the same
 * browser must not see them), and removed from storage whenever the session is
 * cleared. Keep this file free of imports so it can be unit tested on its own.
 */

export const COPILOT_STORAGE_PREFIX = 'controlweave_copilot_messages';
export const AI_CACHE_PREFIX = 'controlweave_ai_cache';

// Keys written by earlier releases, which were keyed by organization id only.
const LEGACY_PREFIXES = ['audit-readiness-'];

const ALL_PREFIXES = [COPILOT_STORAGE_PREFIX, AI_CACHE_PREFIX, ...LEGACY_PREFIXES];

/** Storage key for one user's copilot conversation, or null when nobody is signed in. */
export function copilotStorageKey(userId: string | null | undefined): string | null {
  return userId ? `${COPILOT_STORAGE_PREFIX}:user:${userId}` : null;
}

/** Storage key for one user's cached AI answer for a feature. */
export function aiCacheKey(feature: string, userId: string | null | undefined): string {
  return `${AI_CACHE_PREFIX}:${feature}:user:${userId || 'anonymous'}`;
}

interface KeyedStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Removes every stored copilot conversation and cached AI answer, including legacy keys. */
export function clearAiLocalState(store: KeyedStorage | null): void {
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && ALL_PREFIXES.some((prefix) => key.startsWith(prefix))) doomed.push(key);
    }
    doomed.forEach((key) => store.removeItem(key));
  } catch {
    // Storage can be blocked or throw (private mode); nothing more to do.
  }
}
