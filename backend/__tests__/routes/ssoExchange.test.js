'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_at_least_32_chars';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireTier: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next()
}));
// openid-client is ESM-only in this edition; the exchange route never touches it.
jest.mock('../../src/services/ssoService', () => ({}));
jest.mock('../../src/services/secondFactorService', () => ({ verifyTotpOrBackupCode: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const { verifyTotpOrBackupCode } = require('../../src/services/secondFactorService');
const router = require('../../src/routes/sso');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const PENDING_USER = {
  user_id: 'user-1',
  auth_method: 'social:google',
  is_active: true,
  organization_id: 'org-1',
  totp_enabled: false,
  totp_secret: null,
  totp_backup_codes: null
};

function sqlOf(call) {
  return String(call[0]).replace(/\s+/g, ' ');
}

describe('POST /sso/exchange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unknown or expired code', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    await invokeRoute(router, 'post', '/exchange', makeReq({ body: { code: 'nope' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('issues HS384 tokens and consumes the code', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [PENDING_USER] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/exchange', makeReq({ body: { code: 'good-code' } }), res);

    expect(res.statusCode).toBe(200);
    const { accessToken, refreshToken } = res._json.data;
    expect(jwt.decode(accessToken, { complete: true }).header.alg).toBe('HS384');
    expect(refreshToken).toEqual(expect.any(String));
    expect(sqlOf(pool.query.mock.calls[1])).toContain('DELETE FROM sso_handoff_codes');
    // The raw code is never stored or queried -- only its hash.
    expect(pool.query.mock.calls[0][1]).not.toContain('good-code');
  });

  it('requires TOTP before releasing tokens and does not consume the code', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...PENDING_USER, totp_enabled: true }] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/exchange', makeReq({ body: { code: 'good-code' } }), res);

    expect(res._json).toEqual(expect.objectContaining({ totp_required: true }));
    expect(res._json.data).toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('burns the code on a wrong TOTP so guesses cannot be retried', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...PENDING_USER, totp_enabled: true }] })
      .mockResolvedValueOnce({ rows: [] });
    verifyTotpOrBackupCode.mockResolvedValueOnce(false);

    const res = makeRes();
    await invokeRoute(router, 'post', '/exchange', makeReq({ body: { code: 'good-code', totp_code: '000000' } }), res);

    expect(res.statusCode).toBe(401);
    expect(sqlOf(pool.query.mock.calls[1])).toBe('DELETE FROM sso_handoff_codes WHERE code_hash = $1');
  });

  it('rejects a deactivated account', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...PENDING_USER, is_active: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await invokeRoute(router, 'post', '/exchange', makeReq({ body: { code: 'good-code' } }), res);

    expect(res.statusCode).toBe(401);
    expect(res._json.data).toBeUndefined();
  });
});
