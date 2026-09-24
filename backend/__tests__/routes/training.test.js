'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/training');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const GLOBAL_TEMPLATE = {
  id: 'template-1',
  organization_id: null,
  title: 'Built-in scenario',
  steps: '[{"title":"Step 1"},{"title":"Step 2"}]'
};

describe('PUT /training/scenarios/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when attempting to modify a global template', async () => {
    pool.query.mockResolvedValue({ rows: [GLOBAL_TEMPLATE] });

    const req = makeReq({ params: { id: 'template-1' }, body: { title: 'Hacked' } });
    const res = makeRes();
    await invokeRoute(router, 'put', '/scenarios/:id', req, res);

    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /training/scenarios/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when attempting to delete a global template', async () => {
    pool.query.mockResolvedValue({ rows: [GLOBAL_TEMPLATE] });

    const req = makeReq({ params: { id: 'template-1' } });
    const res = makeRes();
    await invokeRoute(router, 'delete', '/scenarios/:id', req, res);

    expect(res.statusCode).toBe(403);
  });
});

describe('GET /training/scenarios', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the query to the caller org plus global templates', async () => {
    let capturedSql = '';
    let capturedParams = [];
    pool.query.mockImplementation(async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    });

    const req = makeReq({ user: { id: 'user-1', organization_id: 'org-9' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/scenarios', req, res);

    expect(res.statusCode).toBe(200);
    expect(capturedSql).toMatch(/organization_id IS NULL/);
    expect(capturedParams[0]).toBe('org-9');
  });
});

describe('POST /training/scenarios/:id/progress', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets completed_at only when every step is marked complete', async () => {
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM training_scenarios')) return { rows: [GLOBAL_TEMPLATE] };
      if (sql.includes('INSERT INTO training_scenario_progress')) {
        // params: [orgId, scenarioId, userId, completedStepsJson, isComplete]
        expect(params[4]).toBe(true);
        return { rows: [{ completed_steps: params[3], completed_at: '2026-01-01' }] };
      }
      return { rows: [] };
    });

    const req = makeReq({
      params: { id: 'template-1' },
      body: { completed_steps: [0, 1] }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/scenarios/:id/progress', req, res);

    expect(res.statusCode).toBe(200);
  });

  it('leaves completed_at unset when only some steps are complete', async () => {
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM training_scenarios')) return { rows: [GLOBAL_TEMPLATE] };
      if (sql.includes('INSERT INTO training_scenario_progress')) {
        expect(params[4]).toBe(false);
        return { rows: [{ completed_steps: params[3] }] };
      }
      return { rows: [] };
    });

    const req = makeReq({
      params: { id: 'template-1' },
      body: { completed_steps: [0] }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/scenarios/:id/progress', req, res);

    expect(res.statusCode).toBe(200);
  });
});
