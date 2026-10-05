'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/config/security', () => ({ JWT_SECRET: 'x'.repeat(48), JWT_ALGORITHM: 'HS384' }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requireTier: () => (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));

const pool = require('../../src/config/database');
const auditService = require('../../src/services/auditService');
const router = require('../../src/routes/serviceAccounts');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const ORG = 'org-1';
const CALLER = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const SA_ID = '33333333-3333-4333-8333-333333333333';

function caller(permissions = ['service_accounts.write']) {
  return { id: CALLER, organization_id: ORG, permissions };
}

// Routes the mocked pool by SQL text so each test states only what differs.
function mockDb({ ownerInOrg = true, serviceAccount = null } = {}) {
  pool.query.mockImplementation(async (sql) => {
    if (/FROM users WHERE id = \$1 AND organization_id = \$2 AND is_active = true/.test(sql)) {
      return { rows: ownerInOrg ? [{ '?column?': 1 }] : [] };
    }
    if (/FROM service_accounts WHERE id = \$1 AND organization_id = \$2/.test(sql)) {
      return { rows: serviceAccount ? [serviceAccount] : [] };
    }
    if (/^\s*INSERT INTO service_accounts/.test(sql)) return { rows: [{ id: SA_ID }] };
    return { rows: [{ id: SA_ID }] };
  });
}

const writes = () => pool.query.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql));

describe('service account owner must belong to the caller organization', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects POST / with an owner outside the organization and writes nothing', async () => {
    mockDb({ ownerInOrg: false });
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({
      user: caller(),
      body: { account_name: 'ci', account_type: 'application', owner_id: OWNER }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(writes()).toHaveLength(0);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([OWNER, ORG]);
  });

  it('accepts POST / when the owner is an active user of the organization', async () => {
    mockDb({ ownerInOrg: true });
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({
      user: caller(),
      body: { account_name: 'ci', account_type: 'application', owner_id: OWNER }
    }), res);

    expect(res.statusCode).toBe(201);
    expect(writes()).toHaveLength(1);
  });

  it('rejects PUT /:id that reassigns the owner outside the organization', async () => {
    mockDb({ ownerInOrg: false, serviceAccount: { id: SA_ID } });
    const res = makeRes();
    await invokeRoute(router, 'put', '/:id', makeReq({
      user: caller(),
      params: { id: SA_ID },
      body: { owner_id: OWNER }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(writes()).toHaveLength(0);
  });
});

describe('POST /:id/generate-token', () => {
  const serviceAccount = { id: SA_ID, account_name: 'ci', owner_id: OWNER, scope: 'read-only', is_active: true };

  beforeEach(() => jest.clearAllMocks());

  it('refuses a caller who is neither the owner nor a user manager', async () => {
    mockDb({ serviceAccount });
    const res = makeRes();
    await invokeRoute(router, 'post', '/:id/generate-token', makeReq({ user: caller(), params: { id: SA_ID } }), res);

    expect(res.statusCode).toBe(403);
    expect(res._json.data).toBeUndefined();
    expect(writes()).toHaveLength(0);
    expect(auditService.logFromRequest).not.toHaveBeenCalled();
  });

  it('refuses when the stored owner is not an active user of the organization', async () => {
    mockDb({ serviceAccount, ownerInOrg: false });
    const res = makeRes();
    await invokeRoute(router, 'post', '/:id/generate-token', makeReq({
      user: caller(['service_accounts.write', 'users.manage']),
      params: { id: SA_ID }
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res._json.data).toBeUndefined();
    expect(writes()).toHaveLength(0);
  });

  it('issues a token to the owner and audit-logs it', async () => {
    mockDb({ serviceAccount });
    const res = makeRes();
    await invokeRoute(router, 'post', '/:id/generate-token', makeReq({
      user: { ...caller(), id: OWNER },
      params: { id: SA_ID }
    }), res);

    expect(res.statusCode).toBe(200);
    expect(typeof res._json.data.token).toBe('string');
    expect(auditService.logFromRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'service_account.token_generated',
      resourceId: SA_ID
    }));
  });

  it('lets a user manager issue a token for another owner in the organization', async () => {
    mockDb({ serviceAccount });
    const res = makeRes();
    await invokeRoute(router, 'post', '/:id/generate-token', makeReq({
      user: caller(['service_accounts.write', 'users.manage']),
      params: { id: SA_ID }
    }), res);

    expect(res.statusCode).toBe(200);
    expect(typeof res._json.data.token).toBe('string');
  });
});
