'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_at_least_32_chars';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/rateLimit', () => ({ createRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ createAuditLog: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/emailService', () => ({ sendPasswordResetEmail: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const { JWT_SECRET, JWT_ALGORITHM } = require('../../src/config/security');
const router = require('../../src/routes/auth');
const refreshCookie = require('../../src/utils/refreshCookie');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

function refreshTokenFor(userId) {
  return jwt.sign({ userId, type: 'refresh', jti: crypto.randomBytes(16).toString('hex') }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '7d' });
}

function cookieRes() {
  const res = makeRes();
  res.cookies = {};
  res.cleared = [];
  res.cookie = (name, value, options) => { res.cookies[name] = { value, options }; return res; };
  res.clearCookie = (name, options) => { res.cleared.push({ name, options }); return res; };
  return res;
}

function webReq({ cookie, body, origin = 'http://localhost:3000', client = 'web' } = {}) {
  const req = makeReq({ body: body || {} });
  req.headers = {
    ...(client ? { 'x-cw-client': client } : {}),
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie: `other=1; cw_refresh=${encodeURIComponent(cookie)}` } : {})
  };
  return req;
}

function sessionFound() {
  pool.query
    .mockResolvedValueOnce({ rows: [{ id: 'sess-1', refresh_token: 'stored-hash', is_active: true }] })
    .mockResolvedValueOnce({ rows: [{ id: 'sess-1' }] });
}

describe('refresh token cookie (web app)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refreshes from the HttpOnly cookie and rotates it without exposing the token in the body', async () => {
    sessionFound();
    const res = cookieRes();
    await invokeRoute(router, 'post', '/refresh', webReq({ cookie: refreshTokenFor('user-1') }), res);
    expect(res.statusCode).toBe(200);
    expect(res._json.data.accessToken).toEqual(expect.any(String));
    expect(res._json.data.refreshToken).toBeUndefined();
    const set = res.cookies[refreshCookie.COOKIE_NAME];
    expect(set.value).toEqual(expect.any(String));
    expect(set.options).toMatchObject({ httpOnly: true, path: '/api/v1/auth' });
    expect(set.options.maxAge).toBeGreaterThan(0);
  });

  it('refuses the cookie without the web-client header (cross-site form or script)', async () => {
    const res = cookieRes();
    await invokeRoute(router, 'post', '/refresh', webReq({ cookie: refreshTokenFor('user-1'), client: null }), res);
    expect(res.statusCode).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('refuses the cookie from an origin outside CORS_ORIGIN', async () => {
    const res = cookieRes();
    await invokeRoute(router, 'post', '/refresh', webReq({ cookie: refreshTokenFor('user-1'), origin: 'https://evil.example' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('moves a web client that still holds a body token onto the cookie', async () => {
    sessionFound();
    const res = cookieRes();
    await invokeRoute(router, 'post', '/refresh', webReq({ body: { refreshToken: refreshTokenFor('user-1') } }), res);
    expect(res.statusCode).toBe(200);
    expect(res._json.data.refreshToken).toBeUndefined();
    expect(res.cookies[refreshCookie.COOKIE_NAME]).toBeDefined();
  });

  it('keeps the JSON body transport for API clients that do not send the header', async () => {
    sessionFound();
    const res = cookieRes();
    const req = makeReq({ body: { refreshToken: refreshTokenFor('user-1') } });
    await invokeRoute(router, 'post', '/refresh', req, res);
    expect(res.statusCode).toBe(200);
    expect(res._json.data.refreshToken).toEqual(expect.any(String));
    expect(res.cookies[refreshCookie.COOKIE_NAME]).toBeUndefined();
  });

  it('asks for a token when neither body nor cookie carries one', async () => {
    const res = cookieRes();
    await invokeRoute(router, 'post', '/refresh', webReq(), res);
    expect(res.statusCode).toBe(400);
  });

  it('uses SameSite=None; Secure in production so a separate API domain still works', () => {
    const req = webReq();
    req.secure = true;
    const res = cookieRes();
    refreshCookie.deliverRefreshToken(req, res, refreshTokenFor('user-1'));
    expect(res.cookies[refreshCookie.COOKIE_NAME].options).toMatchObject({ sameSite: 'none', secure: true, httpOnly: true });
  });
});
