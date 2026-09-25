'use strict';

// Regression tests for the integrity fixes: connector runs and auto-evidence
// rules must never record results that no external system produced, and TPRM
// writes must not be reachable with a read-only permission.

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: (perm) => {
    const mw = (req, res, next) => next();
    mw.permission = perm;
    return mw;
  },
  requireTier: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next()
}));
jest.mock('../../src/services/auditService', () => ({
  logFromRequest: jest.fn().mockResolvedValue(),
  createAuditLog: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/services/webhookService', () => ({ enqueueWebhookEvent: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/jobService', () => ({ enqueueJob: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/dynamicConfigService', () => ({ getConfigValue: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/services/qualysService', () => ({ syncFindings: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const qualys = require('../../src/services/qualysService');
const integrationsHub = require('../../src/routes/integrationsHub');
const autoEvidence = require('../../src/routes/autoEvidenceCollection');
const tprm = require('../../src/routes/tprm');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

function sqlOf(call) {
  return String(call[0]).replace(/\s+/g, ' ');
}

describe('POST /integrations-hub/connectors/:id/run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses connectors without a real client and records no run', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'c1', connector_type: 'acas', connector_config: {}, auth_config: {} }] });

    const res = makeRes();
    await invokeRoute(integrationsHub, 'post', '/connectors/:id/run', makeReq({ params: { id: 'c1' } }), res);

    expect(res.statusCode).toBe(422);
    expect(res._json.code).toBe('connector_sync_unavailable');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('records the real finding count from a supported connector', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', connector_type: 'qualys_vmdr', connector_config: { baseUrl: 'https://q' }, auth_config: {} }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'success' }] })
      .mockResolvedValueOnce({ rows: [] });
    qualys.syncFindings.mockResolvedValueOnce({ findings: [{ severity: 'high' }, { severity: 'high' }, { severity: 'low' }] });

    const res = makeRes();
    await invokeRoute(integrationsHub, 'post', '/connectors/:id/run', makeReq({ params: { id: 'c1' } }), res);

    expect(res.statusCode).toBe(200);
    const summary = JSON.parse(pool.query.mock.calls[2][1][2]);
    expect(summary.findings_retrieved).toBe(3);
    expect(summary.by_severity).toEqual({ high: 2, low: 1 });
  });

  it('marks the run failed and the connector in error when the external call fails', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', connector_type: 'qualys_vmdr', connector_config: {}, auth_config: {} }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'failed' }] })
      .mockResolvedValueOnce({ rows: [] });
    qualys.syncFindings.mockResolvedValueOnce({ error: 'ECONNREFUSED', findings: [] });

    const res = makeRes();
    await invokeRoute(integrationsHub, 'post', '/connectors/:id/run', makeReq({ params: { id: 'c1' } }), res);

    expect(res.statusCode).toBe(502);
    expect(pool.query.mock.calls[2][1][1]).toBe('failed');
    expect(pool.query.mock.calls[3][1][1]).toBe('error');
  });
});

describe('POST /auto-evidence/rules/:id/run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates no evidence for a source without a collector', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'Jira tickets', source_type: 'jira', schedule: 'manual', source_config: { results: [{ fake: true }] } }] })
      .mockResolvedValue({ rows: [] });

    const res = makeRes();
    await invokeRoute(autoEvidence, 'post', '/rules/:id/run', makeReq({ params: { id: 'r1' } }), res);

    expect(res.statusCode).toBe(422);
    expect(res._json.error).toMatch(/not available yet/);
    const inserts = pool.query.mock.calls.filter((call) => sqlOf(call).includes('INSERT INTO evidence'));
    expect(inserts).toHaveLength(0);
  });
});

describe('TPRM route permissions', () => {
  it('requires tprm.write on every mutating route and tprm.read on reads', () => {
    const routes = tprm.stack.filter((layer) => layer.route);
    expect(routes.length).toBeGreaterThan(0);
    for (const layer of routes) {
      const methods = Object.keys(layer.route.methods);
      const perms = layer.route.stack.map((s) => s.handle.permission).filter(Boolean);
      const expected = methods.includes('get') ? 'tprm.read' : 'tprm.write';
      expect({ path: layer.route.path, methods, perms }).toEqual({ path: layer.route.path, methods, perms: [expected] });
    }
  });
});
