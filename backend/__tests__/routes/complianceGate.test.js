'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/complianceGate');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

describe('GET /compliance/gate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a min_pct outside 0-100 with 400', async () => {
    const req = makeReq({ query: { min_pct: '150' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate', req, res);

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 200 when every framework meets the threshold', async () => {
    pool.query.mockResolvedValue({
      rows: [{ framework_id: 'fw-1', framework_name: 'NIST 800-53', total_controls: 100, implemented: 90, compliance_pct: '90.00' }]
    });

    const req = makeReq({ query: { min_pct: '80' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate', req, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.data.pass).toBe(true);
  });

  it('returns 412 when a framework is under the threshold', async () => {
    pool.query.mockResolvedValue({
      rows: [{ framework_id: 'fw-1', framework_name: 'NIST 800-53', total_controls: 100, implemented: 50, compliance_pct: '50.00' }]
    });

    const req = makeReq({ query: { min_pct: '80' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate', req, res);

    expect(res.statusCode).toBe(412);
    expect(res._json.data.pass).toBe(false);
  });

  it('scopes the query to the caller organization', async () => {
    let capturedParams = [];
    pool.query.mockImplementation(async (sql, params) => {
      capturedParams = params;
      return { rows: [{ framework_id: 'fw-1', framework_name: 'X', total_controls: 1, implemented: 1, compliance_pct: '100.00' }] };
    });

    const req = makeReq({ user: { id: 'user-1', organization_id: 'org-77' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate', req, res);

    expect(capturedParams[0]).toBe('org-77');
  });

  it('returns 404 when the organization has no matching frameworks', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate', req, res);

    expect(res.statusCode).toBe(404);
  });
});
