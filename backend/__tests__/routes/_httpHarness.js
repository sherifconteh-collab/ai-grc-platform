'use strict';

/**
 * Serves one router over a real, in-process HTTP socket so a test exercises
 * the router-level middleware order (authenticate, the add-on gate, the
 * per-route permission) as well as the handlers. No database is involved:
 * each test file mocks `config/database`.
 *
 * Callers authenticate with `Authorization: Bearer <key>`, where <key> names an
 * entry of the `users` map given to `mockAuthModule()`. A request with no header
 * or an unknown key is answered 401 by the stand-in `authenticate`.
 */

const express = require('express');

/**
 * Factory for `jest.mock('../../src/middleware/auth', ...)`. `authenticate`
 * resolves the bearer key to a user (401 otherwise). `requirePermission` is
 * enforced for real: 403 unless the user holds the permission or `*`.
 * `requireTier` is the legacy no-op.
 */
function mockAuthModule(users) {
  const authenticate = (req, res, next) => {
    const key = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const user = users[key];
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    return next();
  };
  const requirePermission = (permission) => (req, res, next) => {
    const held = (req.user && req.user.permissions) || [];
    if (held.includes('*') || held.includes(permission)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
  // Legacy plan middleware: a documented no-op, still imported by a few routers.
  const requireTier = () => (req, res, next) => next();
  return { authenticate, requirePermission, requireTier };
}

async function startApp(router, mountPath = '/') {
  const app = express();
  app.use(express.json({ limit: '30mb' }));
  app.use(mountPath, router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { as, body, headers: extraHeaders } = {}) {
    const headers = { ...(extraHeaders || {}) };
    if (as) headers.Authorization = `Bearer ${as}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON (CSV export) */ }
    return { status: response.status, json, text, headers: response.headers, cookies: response.headers.getSetCookie() };
  }

  return { call, close: () => new Promise((resolve) => server.close(resolve)) };
}

module.exports = { mockAuthModule, startApp };
