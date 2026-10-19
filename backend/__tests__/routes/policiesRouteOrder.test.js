'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.user = { id: 'u1', organization_id: 'org-1', permissions: ['*'] }; next(); },
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({ createOrgRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));

const http = require('http');
const express = require('express');
const pool = require('../../src/config/database');
const router = require('../../src/routes/policies');

describe('GET /policies/uploads is not swallowed by GET /policies/:id', () => {
  let server;
  let base;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/policies', router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/policies`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('lists uploads instead of casting "uploads" to a uuid', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (/::uuid|id = \$2/.test(sql) && /organization_policies p/.test(sql)) throw new Error('invalid input syntax for type uuid');
      return { rows: [] };
    });
    const response = await fetch(`${base}/uploads`);
    expect(response.status).toBe(200);
    const sqls = pool.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => /FROM organization_policies p/.test(sql) && /p\.id = \$2/.test(sql))).toBe(false);
  });

  it('still serves a real policy id', async () => {
    const response = await fetch(`${base}/11111111-1111-4111-8111-111111111111`);
    expect(response.status).toBe(404);
    expect(pool.query).toHaveBeenCalled();
  });
});
