'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({ authenticate: (req, res, next) => next() }));
jest.mock('../../src/middleware/rateLimit', () => ({ createOrgRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/search');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

function userWith(permissions) {
  return { id: 'user-1', organization_id: 'org-1', permissions };
}

describe('GET /search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('does not query for fewer than two characters', async () => {
    const res = makeRes();
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['*']), query: { q: 'a' } }), res);
    expect(res._json.data.results).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('searches only the record types the caller can read', async () => {
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['tprm.read']), query: { q: 'acme' } }), makeRes());
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toMatch(/FROM tprm_vendors/);
  });

  it('scopes every query to the organization and escapes LIKE wildcards', async () => {
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['*']), query: { q: '100%_a' } }), makeRes());
    expect(pool.query).toHaveBeenCalledTimes(7);
    for (const [sql, params] of pool.query.mock.calls) {
      expect(sql).toMatch(/organization_id = \$1/);
      expect(params[0]).toBe('org-1');
      expect(params[1]).toBe('%100\\%\\_a%');
      // Postgres rejects unused bind parameters; only the control query uses the compact id.
      expect(params).toHaveLength(sql.includes('$4') ? 4 : 3);
    }
  });

  it('matches control ids without punctuation (ac2 finds AC-2)', async () => {
    pool.query.mockImplementation((sql) => (sql.includes('framework_controls')
      ? Promise.resolve({ rows: [{ id: 'fc-1', ref: 'AC-2', title: 'Account Management', context: 'NIST SP 800-53 Rev 5' }] })
      : Promise.resolve({ rows: [] })));
    const res = makeRes();
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['controls.read']), query: { q: 'ac2' } }), res);
    const controlCall = pool.query.mock.calls.find(([sql]) => sql.includes('framework_controls'));
    expect(controlCall[1][3]).toBe('ac2');
    expect(res._json.data.results).toEqual([expect.objectContaining({ type: 'control', ref: 'AC-2' })]);
  });

  it('rejects overly long queries', async () => {
    const res = makeRes();
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['*']), query: { q: 'x'.repeat(101) } }), res);
    expect(res.statusCode).toBe(400);
  });
});
