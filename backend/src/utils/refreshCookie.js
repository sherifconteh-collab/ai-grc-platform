// @tier: community
'use strict';

/**
 * Refresh-token transport for the web app.
 *
 * The browser keeps the refresh token in an HttpOnly cookie, so script on the
 * page (an XSS payload included) can never read or exfiltrate it; only the
 * short-lived access token lives in memory. The web app marks its requests
 * with the X-CW-Client: web header. That header is what opts a request into
 * the cookie, and it is also the CSRF guard: a cross-site page cannot send a
 * custom header without a CORS preflight, which only CORS_ORIGIN origins pass.
 * A presented Origin must also be one of those origins.
 *
 * Clients that do not send the header (API scripts, the QA self-test) keep
 * receiving the refresh token in the JSON body and sending it back there.
 * A token that arrived in the cookie is only ever returned in the cookie.
 */

const jwt = require('jsonwebtoken');
const { SECURITY_CONFIG } = require('../config/security');

const COOKIE_NAME = 'cw_refresh';
const COOKIE_PATH = '/api/v1/auth';
const CLIENT_HEADER = 'x-cw-client';

function header(req, name) {
  const value = (req.headers || {})[name];
  return Array.isArray(value) ? value[0] : value;
}

function isWebClient(req) {
  return String(header(req, CLIENT_HEADER) || '').toLowerCase() === 'web';
}

function originAllowed(req) {
  const origin = header(req, 'origin');
  if (!origin) return true;
  const origins = SECURITY_CONFIG.corsOrigins;
  return origins.includes(origin) || (!SECURITY_CONFIG.isProduction && origins.includes('*'));
}

function cookieOptions(req, maxAgeMs) {
  const secure = SECURITY_CONFIG.isProduction || req.secure;
  const configured = String(process.env.REFRESH_COOKIE_SAMESITE || '').toLowerCase();
  // The frontend and API are often on different sites (separate Railway
  // domains), which needs SameSite=None; that requires Secure.
  const sameSite = ['strict', 'lax', 'none'].includes(configured) ? configured : (secure ? 'none' : 'lax');
  return {
    httpOnly: true,
    secure: sameSite === 'none' ? true : secure,
    sameSite,
    path: COOKIE_PATH,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {})
  };
}

function expiresAt(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  return decoded && decoded.exp ? new Date(decoded.exp * 1000) : null;
}

/**
 * Hand a new refresh token to the client: in the cookie for the web app (the
 * return value is then undefined, so it is left out of the JSON body), in the
 * body for everyone else. `viaCookie` forces the cookie when the token being
 * replaced came from it.
 */
function deliverRefreshToken(req, res, refreshToken, { viaCookie = false } = {}) {
  if (!viaCookie && !isWebClient(req)) return refreshToken;
  const expiry = expiresAt(refreshToken);
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions(req, expiry ? Math.max(0, expiry.getTime() - Date.now()) : undefined));
  return undefined;
}

function readCookie(req) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim()) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * The refresh token a request presents: { token, fromCookie }, or
 * { error } when a cookie is presented without the CSRF guard.
 */
function readRefreshToken(req) {
  const fromBody = req.body && typeof req.body.refreshToken === 'string' ? req.body.refreshToken : null;
  if (fromBody) return { token: fromBody, fromCookie: false };
  const fromCookie = readCookie(req);
  if (!fromCookie) return { token: null, fromCookie: false };
  if (!isWebClient(req) || !originAllowed(req)) return { token: null, fromCookie: true, error: 'Cross-site refresh refused' };
  return { token: fromCookie, fromCookie: true };
}

function clearRefreshCookie(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(req));
}

module.exports = { COOKIE_NAME, COOKIE_PATH, deliverRefreshToken, readRefreshToken, clearRefreshCookie, isWebClient, expiresAt };
