'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/benchmarks');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

describe('GET /benchmarks/frameworks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('suppresses aggregates and marks insufficient_data when fewer than 5 orgs participate', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        framework_id: 'fw-1',
        framework_name: 'NIST 800-53',
        own_pct: '72.50',
        n: 3,
        avg_pct: '65.00',
        median_pct: '68.00',
        percentile_rank: '80'
      }]
    });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/frameworks', req, res);

    expect(res.statusCode).toBe(200);
    const row = res._json.data[0];
    expect(row.insufficient_data).toBe(true);
    expect(row.average_pct).toBeUndefined();
    expect(row.own_pct).toBe(72.5);
  });

  it('returns full aggregates when the k-anonymity threshold is met', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        framework_id: 'fw-1',
        framework_name: 'NIST 800-53',
        own_pct: '72.50',
        n: 8,
        avg_pct: '65.00',
        median_pct: '68.00',
        percentile_rank: '80'
      }]
    });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/frameworks', req, res);

    const row = res._json.data[0];
    expect(row.insufficient_data).toBeUndefined();
    expect(row.participants).toBe(8);
    expect(row.average_pct).toBe(65);
  });

  it('never projects org-identifying columns and excludes opted-out orgs', async () => {
    let capturedSql = '';
    pool.query.mockImplementation(async (sql) => {
      capturedSql = sql;
      return { rows: [] };
    });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/frameworks', req, res);

    expect(capturedSql).not.toMatch(/organization_id\s+AS/i);
    expect(capturedSql).not.toMatch(/o\.name/i);
    expect(capturedSql).toMatch(/opt_out/);
  });
});
