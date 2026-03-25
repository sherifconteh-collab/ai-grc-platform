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
 * The AuthContext reads the access token back from localStorage on mount
 * and calls setAccessToken() to repopulate this store.
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
