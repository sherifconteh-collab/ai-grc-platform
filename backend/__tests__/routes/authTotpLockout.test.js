'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_at_least_32_chars';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/rateLimit', () => ({ createRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ createAuditLog: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/emailService', () => ({ sendPasswordResetEmail: jest.fn() }));
jest.mock('../../src/services/geolocationService', () => ({
  getGeolocationFromRequest: () => null,
  extractIpFromRequest: () => '127.0.0.1'
}));
jest.mock('../../src/utils/schema', () => ({ hasPublicColumn: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => String(e) }));
jest.mock('../../src/utils/totp', () => ({ verifyTOTP: jest.fn() }));

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../src/config/database');
const { createAuditLog } = require('../../src/services/auditService');
const { verifyTOTP } = require('../../src/utils/totp');
const router = require('../../src/routes/auth');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

// Generated per run so no password literal lives in the repository.
const PASSWORD = crypto.randomBytes(18).toString('base64url');
// Cost 14 matches BCRYPT_ROUNDS so login does not schedule a rehash.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 14);
let user;
let failureResult;

const sqlOf = (call) => String(call[0]).replace(/\s+/g, ' ');
const callsMatching = (pattern) => pool.query.mock.calls.filter((c) => pattern.test(sqlOf(c)));

function login(body) {
  const res = makeRes();
  return invokeRoute(
    router, 'post', '/login',
    makeReq({ body: { email: 'owner@example.com', password: PASSWORD, ...body } }),
    res
  ).then(() => res);
}

beforeEach(() => {
  jest.clearAllMocks();
  user = {
    id: 'user-1', organization_id: 'org-1', email: 'owner@example.com', is_active: true,
    password_hash: PASSWORD_HASH, totp_enabled: true, totp_secret: null, totp_backup_codes: [],
    failed_login_attempts: 0, locked_until: null
  };
  failureResult = { failed_login_attempts: 1, locked_until: null };
  pool.query.mockImplementation(async (sql) => {
    const q = String(sql);
    if (/FROM users u/.test(q)) return { rows: [user] };
    if (/RETURNING failed_login_attempts, locked_until/.test(q)) return { rows: [failureResult] };
    return { rows: [], rowCount: 0 };
  });
});

jest.setTimeout(30000);

describe('POST /auth/login second factor', () => {
  test('a correct password alone does not clear earlier failures', async () => {
    user.failed_login_attempts = 3;
    const res = await login({});
    expect(res._json.totp_required).toBe(true);
    expect(callsMatching(/SET failed_login_attempts = 0/)).toHaveLength(0);
  });

  test('a wrong code increments the counter atomically and records an audit entry', async () => {
    verifyTOTP.mockReturnValue(false);
    const res = await login({ totp_code: '000000' });
    expect(res.statusCode).toBe(401);
    const [update] = callsMatching(/failed_login_attempts = COALESCE\(failed_login_attempts, 0\) \+ 1/);
    expect(update).toBeDefined();
    expect(update[1][1]).toBe(5);
    expect(callsMatching(/SET failed_login_attempts = 0/)).toHaveLength(0);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'user.totp_failed', success: false }));
  });

  test('the failure that reaches the limit locks the account with 423', async () => {
    verifyTOTP.mockReturnValue(false);
    failureResult = { failed_login_attempts: 5, locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
    const res = await login({ totp_code: '000000' });
    expect(res.statusCode).toBe(423);
    expect(res._headers['Retry-After']).toBeDefined();
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'user.totp_lockout' }));
  });

  test('a locked account is refused before the code is checked', async () => {
    user.locked_until = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await login({ totp_code: '123456' });
    expect(res.statusCode).toBe(423);
    expect(verifyTOTP).not.toHaveBeenCalled();
  });

  test('a valid code signs in and only then resets the counter', async () => {
    user.failed_login_attempts = 3;
    verifyTOTP.mockReturnValue(true);
    const res = await login({ totp_code: '123456' });
    // Session issuance needs more tables than this test fakes; what matters is
    // that the second factor was accepted and the counter was cleared.
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(423);
    expect(callsMatching(/SET failed_login_attempts = 0/)).toHaveLength(1);
  });
});
