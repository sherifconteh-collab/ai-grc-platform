'use strict';

process.env.NODE_ENV = 'test';

const ORG_PARENT = '0000000a-0000-4000-8000-00000000000a';
const ORG_OTHER = '0000000b-0000-4000-8000-00000000000b';
const CHILD = 'cccccccc-0000-4000-8000-0000000000c1';
const DELEGATE_USER = 'dddddddd-0000-4000-8000-0000000000d1';
const mockUsers = {
  readerParent: { id: 'aaaaaaaa-0000-4000-8000-000000000001', organization_id: ORG_PARENT, permissions: ['organizations.read'] },
  readerOther: { id: 'bbbbbbbb-0000-4000-8000-000000000001', organization_id: ORG_OTHER, permissions: ['organizations.read'] },
  nobody: { id: 'aaaaaaaa-0000-4000-8000-000000000003', organization_id: ORG_PARENT, permissions: [] }
};

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  ...require('./_httpHarness').mockAuthModule(mockUsers),
  requireAnyPermission: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next(),
  createOrgRateLimiter: () => (req, res, next) => next(),
  rateLimit: () => (req, res, next) => next()
}));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/llmService', () => ({}));
jest.mock('exceljs', () => ({}));

const pool = require('../../src/config/database');
const router = require('../../src/routes/organizations');
const { startApp } = require('./_httpHarness');

describe('GET /organizations/children/:childId/delegates', () => {
  let app;
  beforeAll(async () => { app = await startApp(router, '/organizations'); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockImplementation(async (sql, params = []) => {
      const q = String(sql);
      if (/FROM organizations WHERE id = \$1 AND parent_org_id = \$2/.test(q)) {
        return { rows: params[0] === CHILD && params[1] === ORG_PARENT ? [{ id: CHILD }] : [] };
      }
      if (/FROM org_delegated_admins d/.test(q)) {
        return { rows: [{ user_id: DELEGATE_USER, email: 'delegate@example.com', granted_at: 'now', expires_at: null }] };
      }
      return { rows: [] };
    });
  });

  const get = (id, as) => app.call('GET', `/organizations/children/${id}/delegates`, { as });

  it('answers 401 without a token and never reaches the database', async () => {
    expect((await get(CHILD)).status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('answers 403 without organizations.read', async () => {
    expect((await get(CHILD, 'nobody')).status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('lists the delegates of a child of the caller organization, scoped by parent and child', async () => {
    const res = await get(CHILD, 'readerParent');
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([{ user_id: DELEGATE_USER, email: 'delegate@example.com', granted_at: 'now', expires_at: null }]);
    const [sql, params] = pool.query.mock.calls.find(([q]) => /FROM org_delegated_admins d/.test(q));
    expect(sql).toMatch(/d\.parent_org_id = \$1 AND d\.child_org_id = \$2/);
    expect(sql).toMatch(/LIMIT/);
    expect(params).toEqual([ORG_PARENT, CHILD]);
  });

  it('refuses a caller whose organization is not the parent: 403, delegates never queried', async () => {
    const res = await get(CHILD, 'readerOther');
    expect(res.status).toBe(403);
    expect(pool.query.mock.calls.some(([q]) => /org_delegated_admins/.test(q))).toBe(false);
  });

  it('rejects a malformed child id before any query', async () => {
    expect((await get('not-a-uuid', 'readerParent')).status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
