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
jest.mock('../../src/utils/encrypt', () => ({ decrypt: jest.fn(v => v) }));

const { authenticate, requirePermission, requireTier } = require('../../src/middleware/auth');
const pool = require('../../src/config/database');

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
