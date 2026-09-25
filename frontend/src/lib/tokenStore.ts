'use client';
// @tier: community
/**
 * In-memory access token store.
 *
 * Keeps the short-lived JWT access token out of localStorage to reduce the
 * XSS attack surface. Unlike localStorage, this module's value is not
 * accessible via storage APIs, so an attacker cannot trivially exfiltrate
 * the access token just by reading localStorage. Scripts running in the same
 * JavaScript context can still access this store or intercept requests, so
 * this is a hardening measure, not a complete defense against XSS.
 *
 * Trade-off: the token is lost on hard page refresh and must be rehydrated.
 * The refresh token is an HttpOnly cookie set by the API, so no script on the
 * page can read it; the AuthContext rehydrates by calling /auth/refresh, which
 * the browser authenticates with that cookie.
 *
 * localStorage holds only a non-secret hint that a session exists, and when it
 * ends, so a logged-out visitor does not trigger a pointless refresh call and
 * the demo-session timer can run.
 */

let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function clearAccessToken(): void {
  _accessToken = null;
}

const SESSION_HINT_KEY = 'cw_session';
const SESSION_EXPIRES_KEY = 'cw_session_expires_at';
// Refresh tokens stored by earlier releases; exchanged once for the cookie.
const LEGACY_REFRESH_KEY = 'refreshToken';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function markSession(expiresAt?: string | null): void {
  const store = storage();
  if (!store) return;
  store.setItem(SESSION_HINT_KEY, '1');
  if (expiresAt) store.setItem(SESSION_EXPIRES_KEY, expiresAt);
}

export function hasSessionHint(): boolean {
  const store = storage();
  return Boolean(store && (store.getItem(SESSION_HINT_KEY) === '1' || store.getItem(LEGACY_REFRESH_KEY)));
}

export function getSessionExpiresAt(): string | null {
  const store = storage();
  return store ? store.getItem(SESSION_EXPIRES_KEY) : null;
}

export const SESSION_EXPIRES_STORAGE_KEY = SESSION_EXPIRES_KEY;

/** A refresh token left in localStorage by an earlier release, removed as it is read. */
export function takeLegacyRefreshToken(): string | null {
  const store = storage();
  if (!store) return null;
  const token = store.getItem(LEGACY_REFRESH_KEY);
  if (token) store.removeItem(LEGACY_REFRESH_KEY);
  return token;
}

export function clearSession(): void {
  _accessToken = null;
  const store = storage();
  if (!store) return;
  store.removeItem(SESSION_HINT_KEY);
  store.removeItem(SESSION_EXPIRES_KEY);
  store.removeItem(LEGACY_REFRESH_KEY);
}
