'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_at_least_32_chars';

const mockUsers = {
  alice: { id: 'user-alice', organization_id: 'org-a', email: 'alice@acme.test' },
  bob: { id: 'user-bob', organization_id: 'org-b', email: 'bob@other.test' }
};

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/auth', () => require('./_httpHarness').mockAuthModule(mockUsers));
jest.mock('../../src/services/passkeyService', () => ({
  getRegistrationOptions: jest.fn(),
  verifyRegistration: jest.fn(),
  getAuthenticationOptions: jest.fn(),
  verifyAuthentication: jest.fn(),
  listPasskeys: jest.fn(),
  deletePasskey: jest.fn(),
  renamePasskey: jest.fn()
}));

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const passkey = require('../../src/services/passkeyService');
const { JWT_SECRET, JWT_ALGORITHM } = require('../../src/config/security');
const { hashToken } = require('../../src/utils/encrypt');
const router = require('../../src/routes/passkeys');
const { startApp } = require('./_httpHarness');

const PASSKEY_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_USER = {
  id: 'user-alice', organization_id: 'org-a', email: 'alice@acme.test', first_name: 'Alice', last_name: 'Ng',
  full_name: 'Alice Ng', org_name: 'Acme', role: 'user', is_active: true, is_platform_admin: false,
  password_hash: '$2a$14$secret-hash', totp_secret: 'JBSWY3DPEHPK3PXP'
};

const sqlOf = (call) => String(call[0]);
const callsMatching = (pattern) => pool.query.mock.calls.filter((c) => pattern.test(sqlOf(c)));

// Routes the mocked pool by SQL text.
function mockDb({ user = ACTIVE_USER } = {}) {
  pool.query.mockImplementation(async (sql) => {
    const q = String(sql);
    if (/FROM users u\s+LEFT JOIN organizations/.test(q)) return { rows: user ? [{ ...user }] : [] };
    return { rows: [], rowCount: 1 };
  });
}

describe('passkey routes', () => {
  let app;
  beforeAll(async () => { app = await startApp(router, '/auth/passkey'); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    jest.resetAllMocks();
    mockDb();
    passkey.verifyAuthentication.mockResolvedValue({ user: { id: ACTIVE_USER.id } });
  });

  const call = (method, path, opts) => app.call(method, `/auth/passkey${path}`, opts);
  const verify = (body = { response: { id: 'cred' }, challengeId: 'chal-1' }) => call('POST', '/auth/verify', { body });

  describe('management routes require a signed-in user and act only on that user', () => {
    const MANAGEMENT = [
      ['GET', '/register/options'],
      ['POST', '/register/verify'],
      ['GET', '/list'],
      ['DELETE', `/${PASSKEY_ID}`],
      ['PATCH', `/${PASSKEY_ID}/rename`]
    ];

    it.each(MANAGEMENT)('%s %s answers 401 without a token and calls no service', async (method, path) => {
      const res = await call(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : { response: {}, name: 'x' } });
      expect(res.status).toBe(401);
      for (const fn of Object.values(passkey)) expect(fn).not.toHaveBeenCalled();
    });

    it('lists, renames and deletes with the caller id, never an id from the request', async () => {
      passkey.listPasskeys.mockResolvedValue([{ id: PASSKEY_ID, name: 'Laptop' }]);
      passkey.renamePasskey.mockResolvedValue(true);
      passkey.deletePasskey.mockResolvedValue(true);

      expect((await call('GET', '/list', { as: 'alice' })).json.data).toEqual([{ id: PASSKEY_ID, name: 'Laptop' }]);
      expect(passkey.listPasskeys).toHaveBeenCalledWith('user-alice');
      expect((await call('PATCH', `/${PASSKEY_ID}/rename`, { as: 'alice', body: { name: 'Work laptop', user_id: 'user-bob' } })).status).toBe(200);
      expect(passkey.renamePasskey).toHaveBeenCalledWith('user-alice', PASSKEY_ID, 'Work laptop');
      expect((await call('DELETE', `/${PASSKEY_ID}`, { as: 'alice' })).json.data).toEqual({ deleted: true });
      expect(passkey.deletePasskey).toHaveBeenCalledWith('user-alice', PASSKEY_ID);
    });

    it("answers 404 when another user's passkey id is deleted or renamed", async () => {
      passkey.deletePasskey.mockResolvedValue(false);
      passkey.renamePasskey.mockResolvedValue(false);
      const del = await call('DELETE', `/${PASSKEY_ID}`, { as: 'bob' });
      const ren = await call('PATCH', `/${PASSKEY_ID}/rename`, { as: 'bob', body: { name: 'mine now' } });
      expect([del.status, ren.status]).toEqual([404, 404]);
      expect(passkey.deletePasskey).toHaveBeenCalledWith('user-bob', PASSKEY_ID);
      expect(passkey.renamePasskey).toHaveBeenCalledWith('user-bob', PASSKEY_ID, 'mine now');
    });

    it('requires the registration response and the new name', async () => {
      expect((await call('POST', '/register/verify', { as: 'alice', body: { name: 'Key' } })).status).toBe(400);
      expect((await call('PATCH', `/${PASSKEY_ID}/rename`, { as: 'alice', body: {} })).status).toBe(400);
      expect(passkey.verifyRegistration).not.toHaveBeenCalled();
      expect(passkey.renamePasskey).not.toHaveBeenCalled();
    });

    it('keeps service error text out of the response and honors a service status code', async () => {
      passkey.getRegistrationOptions.mockRejectedValue(Object.assign(new Error('relation "user_passkeys" does not exist'), { statusCode: 429 }));
      passkey.listPasskeys.mockRejectedValue(new Error('connection refused 10.0.0.5'));
      const options = await call('GET', '/register/options', { as: 'alice' });
      const list = await call('GET', '/list', { as: 'alice' });
      expect(options.status).toBe(429);
      expect(list.status).toBe(500);
      expect(JSON.stringify([options.json, list.json])).not.toMatch(/relation|10\.0\.0\.5/);
    });
  });

  describe('POST /auth/options (public)', () => {
    it('passes the email to the service and returns the challenge', async () => {
      passkey.getAuthenticationOptions.mockResolvedValue({ options: { challenge: 'abc' }, challengeId: 'chal-1' });
      const res = await call('POST', '/auth/options', { body: { email: 'alice@acme.test' } });
      expect(res.status).toBe(200);
      expect(res.json.data).toEqual({ options: { challenge: 'abc' }, challengeId: 'chal-1' });
      expect(passkey.getAuthenticationOptions).toHaveBeenCalledWith('alice@acme.test');
    });

    it('answers a generic error when the service fails', async () => {
      passkey.getAuthenticationOptions.mockRejectedValue(new Error('SELECT * FROM users failed'));
      const res = await call('POST', '/auth/options', { body: {} });
      expect(res.status).toBe(500);
      expect(res.json.error).not.toMatch(/SELECT/);
    });
  });

  describe('POST /auth/verify', () => {
    it('requires the assertion and the challenge id before verifying anything', async () => {
      expect((await verify({ challengeId: 'chal-1' })).status).toBe(400);
      expect((await verify({ response: { id: 'cred' } })).status).toBe(400);
      expect(passkey.verifyAuthentication).not.toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('issues a pinned-algorithm access token and stores only a hash of the refresh token', async () => {
      const res = await verify();
      expect(res.status).toBe(200);
      const { accessToken, refreshToken, sessionExpiresAt, user } = res.json.data;

      const access = jwt.verify(accessToken, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
      expect(access.userId).toBe(ACTIVE_USER.id);
      const refresh = jwt.verify(refreshToken, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
      expect(refresh).toMatchObject({ userId: ACTIVE_USER.id, type: 'refresh' });
      expect(refresh.jti).toMatch(/^[0-9a-f]{32}$/);
      expect(sessionExpiresAt).toBeTruthy();

      const [, params] = callsMatching(/^\s*INSERT INTO sessions/)[0];
      expect(params[0]).toBe(ACTIVE_USER.id);
      expect(params[1]).toBe(hashToken(refreshToken));
      expect(params[1]).not.toBe(refreshToken);
      expect(user).toEqual({ id: ACTIVE_USER.id, email: 'alice@acme.test', full_name: 'Alice Ng', role: 'user', organization_id: 'org-a', org_name: 'Acme' });
      expect(JSON.stringify(res.json)).not.toMatch(/password_hash|totp_secret|secret-hash/);
    });

    it('gives each sign-in its own refresh token', async () => {
      const first = await verify();
      const second = await verify();
      expect(first.json.data.refreshToken).not.toBe(second.json.data.refreshToken);
    });

    it('hands the web app its refresh token only in an HttpOnly cookie, never in the body', async () => {
      const res = await call('POST', '/auth/verify', {
        headers: { 'X-CW-Client': 'web' },
        body: { response: { id: 'cred' }, challengeId: 'chal-1' }
      });
      expect(res.status).toBe(200);
      expect(res.json.data.refreshToken).toBeUndefined();
      expect(res.json.data.accessToken).toBeTruthy();
      expect(res.cookies).toHaveLength(1);
      expect(res.cookies[0]).toMatch(/^cw_refresh=/);
      expect(res.cookies[0]).toMatch(/HttpOnly/i);
      expect(res.cookies[0]).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('refuses a disabled account before issuing any token or session', async () => {
      mockDb({ user: { ...ACTIVE_USER, is_active: false } });
      const res = await verify();
      expect(res.status).toBe(401);
      expect(res.json.error).toBe('Account is disabled');
      expect(callsMatching(/^\s*INSERT INTO sessions/)).toHaveLength(0);
      expect(res.json.data).toBeUndefined();
    });

    it('refuses an assertion for a user that no longer exists', async () => {
      mockDb({ user: null });
      const res = await verify();
      expect(res.status).toBe(401);
      expect(callsMatching(/^\s*INSERT INTO sessions/)).toHaveLength(0);
    });

    it('relays a failed assertion with the service status and a generic message', async () => {
      passkey.verifyAuthentication.mockRejectedValue(Object.assign(new Error('Counter 4 is not greater than stored 9 for credential Zm9v'), { statusCode: 401 }));
      const res = await verify();
      expect(res.status).toBe(401);
      expect(res.json).toEqual({ error: 'Passkey authentication verification failed' });
      expect(pool.query).not.toHaveBeenCalled();
    });
  });
});
