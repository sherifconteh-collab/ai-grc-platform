'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({ authenticate: (req, res, next) => next() }));
jest.mock('../../src/middleware/rateLimit', () => ({ createOrgRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));

const pool = require('../../src/config/database');
const auditService = require('../../src/services/auditService');
const router = require('../../src/routes/myWork');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const ORG = 'org-1';
const ME = 'user-1';
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

function userWith(permissions) {
  return { id: ME, organization_id: ORG, permissions };
}

describe('GET /my-work', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('only queries the sources the caller has permission to read', async () => {
    const res = makeRes();
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['controls.read']) }), res);

    expect(res.statusCode).toBe(200);
    // controls.read covers controls and POA&M -- nothing else.
    expect(pool.query).toHaveBeenCalledTimes(2);
    const sql = pool.query.mock.calls.map((c) => c[0]).join('\n');
    expect(sql).toMatch(/control_implementations/);
    expect(sql).toMatch(/poam_items/);
    expect(sql).not.toMatch(/audit_pbc_requests|FROM risks|control_exceptions/);
  });

  it('scopes every source query to the caller organization and user', async () => {
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['*']) }), makeRes());

    expect(pool.query).toHaveBeenCalledTimes(6);
    for (const [sql, params] of pool.query.mock.calls) {
      expect(sql).toMatch(/organization_id = \$1/);
      expect(params[0]).toBe(ORG);
      expect(params[1]).toBe(ME);
    }
  });

  it('summarizes overdue, due-this-week and approval items and sorts by due date', async () => {
    const past = '2000-01-01';
    const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    pool.query.mockImplementation((sql) => {
      if (sql.includes('control_implementations')) return Promise.resolve({ rows: [{ id: 'ci-1', record_id: 'c-1', title: 'AC-2', due_date: soon }] });
      if (sql.includes("status = 'pending_auditor_review'")) return Promise.resolve({ rows: [{ id: 'p-9', record_id: 'p-9', title: 'Close MFA', due_date: null }] });
      if (sql.includes('FROM poam_items')) return Promise.resolve({ rows: [{ id: 'p-1', record_id: 'p-1', title: 'Old item', due_date: past }] });
      return Promise.resolve({ rows: [] });
    });

    const res = makeRes();
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['*']) }), res);

    const { items, summary } = res._json.data;
    expect(summary).toEqual({ total: 3, overdue: 1, due_this_week: 1, approvals: 1 });
    expect(items.map((i) => i.kind)).toEqual(['poam', 'control', 'poam_approval']);
    expect(items[0].id).toBe('poam:p-1');
  });

  it('returns a generic error when a source fails', async () => {
    pool.query.mockRejectedValue(new Error('relation does not exist'));
    const res = makeRes();
    await invokeRoute(router, 'get', '/', makeReq({ user: userWith(['*']) }), res);
    expect(res.statusCode).toBe(500);
    expect(res._json.error).toBe('Failed to load your work');
  });
});

describe('POST /my-work/requests/:id/respond', () => {
  const openRequest = { id: REQUEST_ID, engagement_id: 'e-1', status: 'open', assigned_to: ME };

  beforeEach(() => jest.clearAllMocks());

  it('rejects an id that is not a UUID before touching the database', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/requests/:id/respond', makeReq({ params: { id: 'nope' }, body: { response_notes: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('requires a response', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/requests/:id/respond', makeReq({ user: userWith([]), params: { id: REQUEST_ID }, body: { response_notes: '   ' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('lets the assignee respond without audit permissions, scoped to their organization, and audit-logs it', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [openRequest] })
      .mockResolvedValueOnce({ rows: [{ id: REQUEST_ID, status: 'submitted' }] });
    const req = makeReq({ user: userWith([]), params: { id: REQUEST_ID }, body: { response_notes: 'Export attached in Evidence' } });
    const res = makeRes();
    await invokeRoute(router, 'post', '/requests/:id/respond', req, res);

    expect(res.statusCode).toBe(200);
    expect(pool.query.mock.calls[0][1]).toEqual([REQUEST_ID, ORG]);
    const [updateSql, updateParams] = pool.query.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE audit_pbc_requests[\s\S]*organization_id = \$3/);
    expect(updateParams).toEqual(['Export attached in Evidence', REQUEST_ID, ORG]);
    expect(auditService.logFromRequest).toHaveBeenCalledWith(req, expect.objectContaining({ eventType: 'assessment.pbc_responded' }));
  });

  it('hides a request assigned to someone else from a user without audit read access', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...openRequest, assigned_to: 'someone-else' }] });
    const res = makeRes();
    await invokeRoute(router, 'post', '/requests/:id/respond', makeReq({ user: userWith([]), params: { id: REQUEST_ID }, body: { response_notes: 'x' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('forbids a reader who is not the assignee and cannot write assessments', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...openRequest, assigned_to: 'someone-else' }] });
    const res = makeRes();
    await invokeRoute(router, 'post', '/requests/:id/respond', makeReq({ user: userWith(['assessments.read']), params: { id: REQUEST_ID }, body: { response_notes: 'x' } }), res);
    expect(res.statusCode).toBe(403);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('refuses to reopen a closed request', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...openRequest, status: 'accepted' }] });
    const res = makeRes();
    await invokeRoute(router, 'post', '/requests/:id/respond', makeReq({ user: userWith([]), params: { id: REQUEST_ID }, body: { response_notes: 'x' } }), res);
    expect(res.statusCode).toBe(409);
  });
});
