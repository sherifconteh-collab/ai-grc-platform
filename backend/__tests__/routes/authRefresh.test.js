'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_at_least_32_chars';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next()
}));
jest.mock('../../src/services/auditService', () => ({ createAuditLog: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/emailService', () => ({ sendPasswordResetEmail: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const { createAuditLog } = require('../../src/services/auditService');
const { JWT_SECRET, JWT_ALGORITHM } = require('../../src/config/security');
const router = require('../../src/routes/auth');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

function refreshTokenFor(userId) {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '7d' });
}

function sqlOf(call) {
  return String(call[0]).replace(/\s+/g, ' ');
}

describe('POST /auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rotates the token and records the previous hash', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1', refresh_token: 'stored-hash', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1' }] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/refresh', makeReq({ body: { refreshToken: refreshTokenFor('user-1') } }), res);

    expect(res.statusCode).toBe(200);
    expect(res._json.data.refreshToken).toEqual(expect.any(String));
    const rotate = pool.query.mock.calls[1];
    expect(sqlOf(rotate)).toContain('SET previous_refresh_token = refresh_token');
    // Compare-and-swap on the hash that was read.
    expect(rotate[1][3]).toBe('stored-hash');
  });

  it('never matches a stored plaintext token', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const token = refreshTokenFor('user-1');
    const res = makeRes();
    await invokeRoute(router, 'post', '/refresh', makeReq({ body: { refreshToken: token } }), res);

    expect(res.statusCode).toBe(401);
    const lookupParams = pool.query.mock.calls[0][1];
    expect(lookupParams.flat()).not.toContain(token);
  });

  it('revokes the session when a rotated token is replayed after the grace window', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sess-1', rotated_at: new Date(Date.now() - 5 * 60 * 1000), organization_id: 'org-1' }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/refresh', makeReq({ body: { refreshToken: refreshTokenFor('user-1') } }), res);

    expect(res.statusCode).toBe(401);
    expect(sqlOf(pool.query.mock.calls[2])).toBe('DELETE FROM sessions WHERE id = $1');
    expect(pool.query.mock.calls[2][1]).toEqual(['sess-1']);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'user.refresh_token_reuse' }));
  });

  it('does not revoke on a replay inside the concurrent-refresh grace window', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1', rotated_at: new Date(), organization_id: 'org-1' }] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/refresh', makeReq({ body: { refreshToken: refreshTokenFor('user-1') } }), res);

    expect(res.statusCode).toBe(401);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects refresh for a deactivated user and clears their sessions', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1', refresh_token: 'stored-hash', is_active: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/refresh', makeReq({ body: { refreshToken: refreshTokenFor('user-1') } }), res);

    expect(res.statusCode).toBe(401);
    expect(sqlOf(pool.query.mock.calls[1])).toBe('DELETE FROM sessions WHERE user_id = $1');
  });
});
