'use strict';

/**
 * Shared helpers for invoking Express route handlers directly (no supertest,
 * no real DB — pool.query/connect are mocked by each test file).
 */

function findRouteHandlers(router, method, path) {
  const layer = router.stack.find(
    l => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map(s => s.handle);
}

async function invokeRoute(router, method, path, req, res) {
  const handlers = findRouteHandlers(router, method, path);
  for (const handler of handlers) {
    let nextCalled = false;
    let nextErr;
    // eslint-disable-next-line no-await-in-loop
    await handler(req, res, (err) => {
      nextCalled = true;
      nextErr = err;
    });
    if (nextErr) throw nextErr;
    if (!nextCalled) break; // handler sent a response; stop the chain
  }
}

function makeReq({ user, params, body, query } = {}) {
  return {
    user: user || { id: 'user-1', organization_id: 'org-1' },
    params: params || {},
    body: body || {},
    query: query || {},
    ip: '127.0.0.1',
    headers: {}
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    _json: null,
    _sent: null,
    _headers: {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this._json = data; return this; },
    send(data) { this._sent = data; return this; },
    setHeader(name, value) { this._headers[name] = value; return this; },
    end() { return this; }
  };
  return res;
}

module.exports = { findRouteHandlers, invokeRoute, makeReq, makeRes };
