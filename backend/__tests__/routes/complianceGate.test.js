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

describe('GET /compliance/gate/export', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid format with 400', async () => {
    const req = makeReq({ query: { format: 'bogus' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate/export', req, res);

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects an invalid framework_id with 400', async () => {
    const req = makeReq({ query: { framework_id: 'not-a-uuid' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate/export', req, res);

    expect(res.statusCode).toBe(400);
  });

  it('returns a curl snippet by default with the org gate URL embedded', async () => {
    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate/export', req, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.data.format).toBe('curl');
    expect(res._json.data.snippet).toMatch(/curl --fail/);
    expect(res._json.data.gate_url).toMatch(/\/api\/v1\/compliance\/gate\?min_pct=80/);
  });

  it('returns a GitHub Actions snippet with the framework name embedded', async () => {
    pool.query.mockResolvedValue({ rows: [{ name: 'NIST 800-53' }] });

    const req = makeReq({
      query: { format: 'github_actions', framework_id: '11111111-1111-1111-1111-111111111111' }
    });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate/export', req, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.data.snippet).toMatch(/NIST 800-53/);
    expect(res._json.data.snippet).toMatch(/secrets\.CONTROLWEAVE_TOKEN/);
  });

  it('returns a GitLab CI snippet', async () => {
    const req = makeReq({ query: { format: 'gitlab_ci' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate/export', req, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.data.snippet).toMatch(/compliance_gate:/);
  });

  it('returns 404 when framework_id does not belong to the organization', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const req = makeReq({ query: { framework_id: '11111111-1111-1111-1111-111111111111' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/gate/export', req, res);

    expect(res.statusCode).toBe(404);
  });
});
