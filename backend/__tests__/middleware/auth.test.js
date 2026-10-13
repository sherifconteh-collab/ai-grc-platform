'use strict';

/**
 * Tests for middleware/auth.js
 * Covers: authenticate middleware, requirePermission, requireTier
 * Uses Jest module mocking to avoid real DB/JWT/service dependencies.
 */

const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

// Mock DB pool
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

// Mock subscriptionService
jest.mock('../../src/services/subscriptionService', () => ({
  expireOrganizationTrialIfNeeded: jest.fn().mockResolvedValue(false)
}));

// Mock encrypt (returns value as-is in tests)
jest.mock('../../src/utils/encrypt', () => ({
  ...jest.requireActual('../../src/utils/encrypt'),
  decrypt: jest.fn(v => v)
}));

const { authenticate, requirePermission, requireTier } = require('../../src/middleware/auth');
const pool = require('../../src/config/database');
const crypto = require('crypto');
const { hashToken } = require('../../src/utils/encrypt');

// Expose permissions by also mocking the role-permissions map returned from DB
function setupPoolForUser(userFields = {}) {
  pool.query.mockImplementation(async (sql) => {
    // hasOrgFeatureOverridesColumn check
    if (sql && sql.includes('information_schema.columns') && sql.includes('feature_overrides')) {
      return { rows: [{ column_name: 'feature_overrides' }] };
    }
    // Feature flags check
    if (sql && sql.includes('platform_settings')) {
      return { rows: [] };
    }
    // Main user query
    return {
      rows: [{
        id: 'user-uuid-1',
        organization_id: 'org-uuid-1',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'admin',
        is_active: true,
        is_platform_admin: false,
        organization_name: 'Test Org',
        organization_tier: 'enterprise',
        organization_billing_status: 'active',
        organization_trial_status: null,
        organization_trial_started_at: null,
        organization_trial_ends_at: null,
        feature_overrides: {},
        permissions: ['ai.use', 'controls.read', 'settings.manage'],
        ...userFields
      }]
    };
  });
}

function makeRes() {
  const res = {
    statusCode: 200,
    _json: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this._json = data; return this; }
  };
  return res;
}

function makeValidToken(payload = {}) {
  return jwt.sign(
    { userId: 'user-uuid-1', organizationId: 'org-uuid-1', ...payload },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'controlweave', audience: 'controlweave-api' }
  );
}

// ---------------------------------------------------------------------------
// authenticate middleware
// ---------------------------------------------------------------------------
describe('authenticate middleware', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('rejects request with no Authorization header', async () => {
    const req = { headers: {}, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects request with malformed Bearer token', async () => {
    const req = { headers: { authorization: 'Bearer not.a.valid.jwt' }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects token signed with wrong secret', async () => {
    const badToken = jwt.sign({ userId: 'evil' }, 'wrong-secret', { algorithm: 'HS256' });
    const req = { headers: { authorization: `Bearer ${badToken}` }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'u1', organizationId: 'o1' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s', issuer: 'controlweave', audience: 'controlweave-api' }
    );
    const req = { headers: { authorization: `Bearer ${expiredToken}` }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() with valid token when user found in DB', async () => {
    setupPoolForUser();
    const token = makeValidToken();
    const req = { headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('test@example.com');
  });

  test('rejects when DB returns no user', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql && sql.includes('information_schema.columns')) return { rows: [{ column_name: 'feature_overrides' }] };
      return { rows: [] };
    });
    const token = makeValidToken();
    const req = { headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requirePermission middleware
// ---------------------------------------------------------------------------
describe('requirePermission', () => {
  test('calls next() when user has the required permission', () => {
    const req = { user: { permissions: ['controls.read', 'ai.use'] } };
    const res = makeRes();
    const next = jest.fn();
    requirePermission('controls.read')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns 403 when user lacks the required permission', () => {
    const req = { user: { permissions: ['controls.read'] } };
    const res = makeRes();
    const next = jest.fn();
    requirePermission('settings.manage')(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user has no permissions array', () => {
    const req = { user: {} };
    const res = makeRes();
    const next = jest.fn();
    requirePermission('any.permission')(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// requireTier middleware — open-source build: all tier gating is removed, so
// requireTier is a no-op that always allows the request through regardless of
// the organization's tier or the tier nominally required by the route.
// ---------------------------------------------------------------------------
describe('requireTier', () => {
  const tierTests = [
    { tier: 'enterprise', required: 'enterprise' },
    { tier: 'pro',        required: 'enterprise' },
    { tier: 'pro',        required: 'pro' },
    { tier: 'community',  required: 'pro' },
    { tier: 'govcloud',   required: 'enterprise' },
    { tier: 'enterprise', required: 'community' },
  ];

  tierTests.forEach(({ tier, required }) => {
    test(`${tier} user can access ${required}-tier feature (de-tiered build)`, () => {
      const req = { user: { organization_tier: tier } };
      const res = makeRes();
      const next = jest.fn();
      requireTier(required)(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// service account tokens (revocation, expiry, scope)
// ---------------------------------------------------------------------------
describe('authenticate: service account tokens', () => {
  const SA_ID = 'sa-uuid-1';

  function saToken(claims = {}) {
    return makeValidToken({ serviceAccountId: SA_ID, scope: 'read-only', type: 'service_account', ...claims });
  }

  // Routes the mocked pool by SQL text. `account` is the service_accounts row the
  // lookup returns (null = no row matched the WHERE clause).
  function setupPool({ account = { id: SA_ID, scope: 'read-only' }, lookupError = null } = {}) {
    const calls = [];
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('information_schema.columns')) return { rows: [{ column_name: 'feature_overrides' }] };
      if (sql.includes('platform_settings')) return { rows: [] };
      if (sql.includes('FROM service_accounts')) {
        calls.push({ sql, params });
        if (lookupError) throw lookupError;
        return { rows: account ? [account] : [] };
      }
      if (sql.includes('FROM users u')) {
        return { rows: [{
          id: 'user-uuid-1', organization_id: 'org-uuid-1', email: 'test@example.com', first_name: 'T', last_name: 'U',
          role: 'admin', is_active: true, is_platform_admin: false, organization_name: 'Org',
          organization_tier: 'enterprise', feature_overrides: {}
        }] };
      }
      return { rows: [] };
    });
    return calls;
  }

  async function run(token, method = 'GET') {
    const req = { headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1', method };
    const res = makeRes();
    const next = jest.fn();
    await authenticate(req, res, next);
    return { req, res, next };
  }

  beforeEach(() => { jest.clearAllMocks(); });

  test('admits a token whose row matches, scoped to the owner and organization', async () => {
    const calls = setupPool();
    const token = saToken();
    const { req, next } = await run(token);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.serviceAccount).toEqual({ id: SA_ID, scope: 'read-only' });
    expect(calls).toHaveLength(1);
    expect(calls[0].params.slice(0, 3)).toEqual([SA_ID, 'org-uuid-1', 'user-uuid-1']);
    expect(calls[0].sql).toMatch(/is_active = true/);
    expect(calls[0].sql).toMatch(/token_expires_at >= CURRENT_DATE/);
  });

  test('looks up by SHA-384 and by legacy SHA-256 of the presented token', async () => {
    const calls = setupPool();
    const token = saToken();
    await run(token);
    const candidates = calls[0].params[3];
    expect(candidates).toContain(hashToken(token));
    expect(candidates).toContain(crypto.createHash('sha256').update(token).digest('hex'));
    expect(hashToken(token)).toHaveLength(96);
  });

  test('rejects a revoked, regenerated, deactivated, deleted, reassigned or expired token (no row matches)', async () => {
    setupPool({ account: null });
    const { res, next, req } = await run(saToken());
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.serviceAccount).toBeUndefined();
  });

  test('fails closed when the lookup errors (revocation columns missing)', async () => {
    setupPool({ lookupError: new Error('column "token_hash" does not exist') });
    const { res, next } = await run(saToken());
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toBe('Invalid token');
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a service account token with no serviceAccountId claim', async () => {
    const calls = setupPool();
    const { res, next } = await run(makeValidToken({ type: 'service_account', scope: 'admin' }));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('read-only scope rejects %s with 403', async (method) => {
    setupPool();
    const { res, next } = await run(saToken(), method);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test.each(['GET', 'HEAD', 'OPTIONS'])('read-only scope allows %s', async (method) => {
    setupPool();
    const { next } = await run(saToken(), method);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('the current row scope applies even when the token claim predates it', async () => {
    setupPool({ account: { id: SA_ID, scope: 'read-only' } });
    const { res } = await run(saToken({ scope: 'full' }), 'POST');
    expect(res.statusCode).toBe(403);
  });

  test('the token claim applies even when the row scope was widened afterwards', async () => {
    setupPool({ account: { id: SA_ID, scope: 'full' } });
    const { res } = await run(saToken({ scope: 'read-only' }), 'POST');
    expect(res.statusCode).toBe(403);
  });

  test('a non-read-only scope may write', async () => {
    setupPool({ account: { id: SA_ID, scope: 'full' } });
    const { next } = await run(saToken({ scope: 'full' }), 'POST');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('ordinary user tokens never touch service_accounts', async () => {
    const calls = setupPool();
    const { next } = await run(makeValidToken());
    expect(next).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });
  test.each(['suspended', 'disabled', ' Suspended ', 'DISABLED'])('rejects a token whose account status is %j even while is_active is true', async (status) => {
    setupPool({ account: { id: SA_ID, scope: 'read-only', status } });
    const { res, next, req } = await run(saToken());
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toBe('Invalid token');
    expect(next).not.toHaveBeenCalled();
    expect(req.serviceAccount).toBeUndefined();
  });

  test.each(['active', null, undefined])('admits a token whose account status is %j', async (status) => {
    setupPool({ account: { id: SA_ID, scope: 'read-only', status } });
    const { next } = await run(saToken());
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('the lookup selects status so the check sees it', async () => {
    const calls = setupPool();
    await run(saToken());
    expect(calls[0].sql).toMatch(/SELECT[^;]*\bstatus\b[^;]*FROM service_accounts/);
  });

  test.each(['admin', 'write', 'read-write', 'readonly', 'Read-only access to logs', 'FULL ACCESS'])(
    'an unknown row scope %j is treated as read-only (default deny)',
    async (scope) => {
      setupPool({ account: { id: SA_ID, scope } });
      const { res, next } = await run(saToken({ scope: 'full' }), 'POST');
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  );

  test.each(['admin', 'write', 'Read-only access to logs'])('an unknown token claim scope %j is treated as read-only', async (claim) => {
    setupPool({ account: { id: SA_ID, scope: 'full' } });
    const { res, next } = await run(saToken({ scope: claim }), 'DELETE');
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('an unknown scope still allows safe methods, reported as read-only', async () => {
    setupPool({ account: { id: SA_ID, scope: 'admin' } });
    const { req, next } = await run(saToken({ scope: 'admin' }), 'GET');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.serviceAccount).toEqual({ id: SA_ID, scope: 'read-only' });
  });

  test('the full scope is matched case-insensitively and reported normalized', async () => {
    setupPool({ account: { id: SA_ID, scope: ' Full ' } });
    const { req, next } = await run(saToken({ scope: 'FULL' }), 'POST');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.serviceAccount).toEqual({ id: SA_ID, scope: 'full' });
  });
});
