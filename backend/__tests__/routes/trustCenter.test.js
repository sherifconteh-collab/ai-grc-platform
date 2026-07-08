'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/trustCenter');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const VALID_TOKEN = 'a'.repeat(64);

describe('GET /trust-center/public/:token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 for a malformed token without querying the database', async () => {
    const req = makeReq({ params: { token: 'not-a-real-token' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/public/:token', req, res);

    expect(res.statusCode).toBe(404);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown or disabled token', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const req = makeReq({ params: { token: VALID_TOKEN } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/public/:token', req, res);

    expect(res.statusCode).toBe(404);
  });

  it('only returns whitelisted fields, gated by section toggles', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM trust_center_configs')) {
        return {
          rows: [{
            organization_id: 'org-1',
            organization_name: 'Acme Org',
            display_name: null,
            description: 'We take security seriously.',
            contact_email: 'security@acme.test',
            show_frameworks: false,
            show_compliance_scores: false,
            show_authorizations: true,
            published_at: '2026-01-01T00:00:00.000Z'
          }]
        };
      }
      if (sql.includes('FROM rmf_authorization_decisions')) {
        return { rows: [{ count: 2 }] };
      }
      return { rows: [] };
    });

    const req = makeReq({ params: { token: VALID_TOKEN } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/public/:token', req, res);

    expect(res.statusCode).toBe(200);
    const data = res._json.data;
    expect(data.display_name).toBe('Acme Org');
    expect(data.active_authorizations).toBe(2);
    expect(data.frameworks).toBeUndefined();
    expect(data.compliance_scores).toBeUndefined();
    expect(Object.keys(data).sort()).toEqual(
      ['active_authorizations', 'contact_email', 'description', 'display_name', 'published_at'].sort()
    );
  });
});

describe('POST /trust-center/config/regenerate-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues a new 64-character hex token', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM trust_center_configs')) {
        return { rows: [{ organization_id: 'org-1', public_token: 'old-token' }] };
      }
      if (sql.includes('UPDATE trust_center_configs')) {
        return { rows: [{ organization_id: 'org-1', public_token: 'new-token-value' }] };
      }
      return { rows: [] };
    });

    const req = makeReq();
    const res = makeRes();
    await invokeRoute(router, 'post', '/config/regenerate-token', req, res);

    expect(res.statusCode).toBe(200);
    const updateCall = pool.query.mock.calls.find(([sql]) => sql.includes('UPDATE trust_center_configs'));
    const newToken = updateCall[1][1];
    expect(newToken).toMatch(/^[0-9a-f]{64}$/);
  });
});
