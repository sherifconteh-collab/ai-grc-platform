'use strict';

// Regression test for the evidence unlink handler: the delete must be scoped to
// the caller's organization, so ids belonging to another tenant match nothing.

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireTier: () => (req, res, next) => next()
}));
jest.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (req, res, next) => next()
}));
jest.mock('../../src/services/auditService', () => ({
  logFromRequest: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => String(e) }));
jest.mock('../../src/services/realtimeEventService', () => ({ evidenceUploaded: jest.fn() }));
jest.mock('../../src/services/orgRagService', () => ({}));
jest.mock('../../src/services/evidenceVersionService', () => ({}));

const pool = require('../../src/config/database');
const auditService = require('../../src/services/auditService');
const router = require('../../src/routes/evidence');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const EVIDENCE_ID = '11111111-1111-4111-8111-111111111111';
const CONTROL_ID = '22222222-2222-4222-8222-222222222222';
const PATH = '/:evidenceId/unlink/:controlId';

describe('DELETE /evidence/:evidenceId/unlink/:controlId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the delete to the caller organization', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });
    const req = makeReq({
      user: { id: 'user-1', organization_id: 'org-b' },
      params: { evidenceId: EVIDENCE_ID, controlId: CONTROL_ID }
    });
    const res = makeRes();
    await invokeRoute(router, 'delete', PATH, req, res);

    const [sql, values] = pool.query.mock.calls[0];
    expect(sql).toMatch(/organization_id = \$3/);
    expect(values).toEqual([EVIDENCE_ID, CONTROL_ID, 'org-b']);
    expect(res.statusCode).toBe(200);
    expect(auditService.logFromRequest).toHaveBeenCalledWith(
      req,
      expect.objectContaining({ eventType: 'evidence.unlinked', resourceId: EVIDENCE_ID })
    );
  });

  it("returns 404 and writes no audit entry when the link belongs to another organization", async () => {
    // The org-scoped DELETE matches no row for org B's caller against org A's link.
    pool.query.mockResolvedValue({ rowCount: 0 });
    const req = makeReq({
      user: { id: 'user-b', organization_id: 'org-b' },
      params: { evidenceId: EVIDENCE_ID, controlId: CONTROL_ID }
    });
    const res = makeRes();
    await invokeRoute(router, 'delete', PATH, req, res);

    expect(res.statusCode).toBe(404);
    expect(auditService.logFromRequest).not.toHaveBeenCalled();
  });

  it('rejects malformed ids without querying the database', async () => {
    const req = makeReq({ params: { evidenceId: 'not-a-uuid', controlId: CONTROL_ID } });
    const res = makeRes();
    await invokeRoute(router, 'delete', PATH, req, res);

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
