'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({ createRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/realtimeEventService', () => ({
  notificationNew: jest.fn(),
  notificationRead: jest.fn(),
  notificationReadAll: jest.fn()
}));

const pool = require('../../src/config/database');
const router = require('../../src/routes/notifications');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const caller = { id: 'u1', organization_id: 'org-1', permissions: ['notifications.write'] };
const base = { type: 'system', title: 'Hello', message: 'World' };

const post = async (body) => {
  const res = makeRes();
  await invokeRoute(router, 'post', '/', makeReq({ user: caller, body: { ...base, ...body } }), res);
  return res;
};
const inserts = () => pool.query.mock.calls.filter(([sql]) => /INSERT INTO notifications/.test(sql));

describe('POST /notifications link validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [{ id: 'n1' }] });
  });

  it.each(['javascript:alert(1)', 'https://evil.example.com', '//evil.example.com', '/\\evil.example.com'])(
    'rejects %s with 400 and stores nothing',
    async (link) => {
      const res = await post({ link });
      expect(res.statusCode).toBe(400);
      expect(inserts()).toHaveLength(0);
    }
  );

  it('stores an in-app relative path', async () => {
    const res = await post({ link: '/dashboard/poam/1' });
    expect(res.statusCode).toBe(201);
    expect(inserts()[0][1][5]).toBe('/dashboard/poam/1');
  });

  it('stores null when no link is given', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(201);
    expect(inserts()[0][1][5]).toBeNull();
  });
});

describe('createNotification link handling', () => {
  const { createNotification } = require('../../src/services/notificationService');

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('drops a link that is not an in-app path', async () => {
    await createNotification('org-1', null, 'system', 'T', 'M', 'javascript:alert(1)');
    expect(inserts()[0][1][5]).toBeNull();
  });

  it('keeps an in-app path', async () => {
    await createNotification('org-1', null, 'system', 'T', 'M', '/dashboard/poam/1');
    expect(inserts()[0][1][5]).toBe('/dashboard/poam/1');
  });
});
