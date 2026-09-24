'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/cyberResilience');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

function makeClient(queryImpl) {
  return { query: jest.fn(queryImpl), release: jest.fn() };
}

describe('GET /resilience/plans/:id/tests (org isolation)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 for a plan belonging to another organization', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const req = makeReq({ params: { id: 'plan-other-org' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/plans/:id/tests', req, res);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /resilience/plans (validation)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid plan_type', async () => {
    const req = makeReq({ body: { plan_type: 'bogus', title: 'X' } });
    const res = makeRes();
    await invokeRoute(router, 'post', '/plans', req, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toMatch(/plan_type/);
  });

  it('rejects an invalid status', async () => {
    const req = makeReq({
      body: {
        plan_type: 'business_continuity', title: 'X', status: 'bogus',
        rto_target_hours: 4, rpo_target_hours: 1
      }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/plans', req, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toMatch(/status/);
  });
});

describe('POST /resilience/plans/:id/tests (validation + next_test_due)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid test_type', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM resilience_plans')) return { rows: [{ id: 'plan-1' }] };
      return { rows: [] };
    }));

    const req = makeReq({
      params: { id: 'plan-1' },
      body: { test_type: 'bogus', scenario: 'Ransomware drill', outcome: 'passed' }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/plans/:id/tests', req, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid outcome', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM resilience_plans')) return { rows: [{ id: 'plan-1' }] };
      return { rows: [] };
    }));

    const req = makeReq({
      params: { id: 'plan-1' },
      body: { test_type: 'tabletop', scenario: 'Ransomware drill', outcome: 'bogus' }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/plans/:id/tests', req, res);

    expect(res.statusCode).toBe(400);
  });

  it('auto-computes next_test_due one year after the test date', async () => {
    let updateParams = null;
    pool.connect.mockResolvedValue(makeClient(async (sql, params) => {
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM resilience_plans')) return { rows: [{ id: 'plan-1' }] };
      if (sql.includes('INSERT INTO resilience_tests')) {
        return { rows: [{ id: 'test-1' }] };
      }
      if (sql.includes('UPDATE resilience_plans')) {
        updateParams = params;
        return { rows: [] };
      }
      return { rows: [] };
    }));

    const req = makeReq({
      params: { id: 'plan-1' },
      body: {
        test_type: 'tabletop', scenario: 'Ransomware drill', outcome: 'passed',
        test_date: '2026-01-01', actual_rto_hours: 4, actual_rpo_hours: 1
      }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/plans/:id/tests', req, res);

    expect(res.statusCode).toBe(201);
    // params: [planId, orgId, testDate, nextTestDue, userId]
    expect(updateParams[2]).toBe('2026-01-01');
    expect(updateParams[3]).toBe('2027-01-01');
  });
});

describe('GET /resilience/score', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all four components and clamps to 0 with no plans or systems', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM organization_systems')) {
        return { rows: [{ total_systems: 0, covered_systems: 0 }] };
      }
      if (sql.includes('FROM resilience_plans') && sql.includes('total_plans')) {
        return { rows: [{ total_plans: 0, tested_recently: 0 }] };
      }
      if (sql.includes('plans_with_tests')) {
        return { rows: [{ plans_with_tests: 0, plans_meeting_targets: 0 }] };
      }
      if (sql.includes('FROM backup_logs')) {
        return { rows: [{ total_backups: 0, successful_backups: 0 }] };
      }
      return { rows: [] };
    });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/score', req, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.data.overall_score).toBe(0);
    expect(Object.keys(res._json.data.components).sort()).toEqual(
      ['backup_health', 'plan_coverage', 'rto_rpo_attainment', 'test_cadence'].sort()
    );
  });

  it('computes a full score when all components have data', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM organization_systems')) {
        return { rows: [{ total_systems: 4, covered_systems: 2 }] };
      }
      if (sql.includes('FROM resilience_plans') && sql.includes('total_plans')) {
        return { rows: [{ total_plans: 2, tested_recently: 1 }] };
      }
      if (sql.includes('plans_with_tests')) {
        return { rows: [{ plans_with_tests: 2, plans_meeting_targets: 1 }] };
      }
      if (sql.includes('FROM backup_logs')) {
        return { rows: [{ total_backups: 10, successful_backups: 9 }] };
      }
      return { rows: [] };
    });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'get', '/score', req, res);

    expect(res.statusCode).toBe(200);
    const { components, overall_score: overallScore } = res._json.data;
    expect(components.plan_coverage.score).toBe(50);
    expect(components.test_cadence.score).toBe(50);
    expect(components.rto_rpo_attainment.score).toBe(50);
    expect(components.backup_health.score).toBe(90);
    expect(overallScore).toBeGreaterThan(0);
    expect(overallScore).toBeLessThanOrEqual(100);
  });
});
