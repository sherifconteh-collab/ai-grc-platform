'use strict';

process.env.NODE_ENV = 'test';

const ORG_A = '0000000a-0000-4000-8000-00000000000a';
const ORG_B = '0000000b-0000-4000-8000-00000000000b';
const mockUsers = {
  writerA: { id: 'aaaaaaaa-0000-4000-8000-000000000001', organization_id: ORG_A, permissions: ['evidence.read', 'evidence.write'] },
  readerA: { id: 'aaaaaaaa-0000-4000-8000-000000000002', organization_id: ORG_A, permissions: ['evidence.read'] },
  writerB: { id: 'bbbbbbbb-0000-4000-8000-000000000001', organization_id: ORG_B, permissions: ['evidence.read', 'evidence.write'] },
  nobody: { id: 'aaaaaaaa-0000-4000-8000-000000000003', organization_id: ORG_A, permissions: [] }
};

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
// An existing directory, so the router's load-time mkdir is a no-op; nothing is written (storageService.writeFile is mocked below).
jest.mock('../../src/config/paths', () => ({ UPLOADS_DIR: require('os').tmpdir() }));
jest.mock('../../src/services/storageService', () => ({ writeFile: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/middleware/auth', () => require('./_httpHarness').mockAuthModule(mockUsers));
jest.mock('../../src/middleware/rateLimit', () => ({ createRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/llmService', () => ({}));
jest.mock('../../src/services/splunkService', () => ({ getOrgSplunkSettings: jest.fn(), runSearch: jest.fn() }));

const crypto = require('crypto');

const os = require('os');
const path = require('path');
const router = require('../../src/routes/pendingEvidence');
const { writeFile } = require('../../src/services/storageService');

const pool = require('../../src/config/database');
const auditService = require('../../src/services/auditService');
const { startApp } = require('./_httpHarness');

const PENDING_A = '11111111-1111-4111-8111-11111111111a';
const CONTROL_1 = '22222222-2222-4222-8222-222222222221';
const NEW_EVIDENCE = '33333333-3333-4333-8333-333333333333';
const RAW_PAYLOAD = { source: 'splunk', events: [{ user: 'jdoe', action: 'login' }] };

const state = { status: 'pending' };
const sqlOf = (call) => String(call[0]);
const callsMatching = (pattern) => pool.query.mock.calls.filter((c) => pattern.test(sqlOf(c)));

// One AI suggestion owned by ORG_A. The lookup honors the organization parameter.
function installFakeDb() {
  pool.query.mockImplementation(async (sql, params = []) => {
    const q = String(sql);
    if (/SELECT \* FROM pending_evidence WHERE id = \$1 AND organization_id = \$2/.test(q)) {
      return { rows: params[0] === PENDING_A && params[1] === ORG_A ? [{
        id: PENDING_A, organization_id: ORG_A, status: state.status, ai_title: 'Quarterly <login> review!', ai_description: 'Logins reviewed',
        source_type: 'splunk', raw_payload: RAW_PAYLOAD, suggested_controls: [CONTROL_1], suggested_tags: ['splunk']
      }] : [] };
    }
    if (/^\s*INSERT INTO evidence \(/.test(q)) return { rows: [{ id: NEW_EVIDENCE, file_name: params[2], file_size: params[4], created_at: 'now' }] };
    if (/FROM framework_controls WHERE id = ANY/.test(q)) return { rows: [{ id: CONTROL_1 }] };
    if (/GROUP BY status/.test(q)) return { rows: params[0] === ORG_A ? [{ status: 'pending', count: 3 }, { status: 'approved', count: 1 }] : [] };
    return { rows: [], rowCount: 0 };
  });
}

const ROUTES = router.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((method) => ({
  method: method.toUpperCase(),
  path: l.route.path.replace(':id', PENDING_A)
})));
const WRITES = ROUTES.filter((r) => r.method === 'POST');
const READS = ROUTES.filter((r) => r.method === 'GET');

describe('pendingEvidence routes (AI suggestions that need human approval)', () => {
  let app;
  beforeAll(async () => { app = await startApp(router, '/pending-evidence'); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    jest.clearAllMocks();
    state.status = 'pending';
    installFakeDb();
  });

  const call = (method, path, opts) => app.call(method, `/pending-evidence${path}`, opts);
  const approve = (as, body) => call('POST', `/${PENDING_A}/approve`, { as, body });
  const reject = (as, body) => call('POST', `/${PENDING_A}/reject`, { as, body });

  describe('authentication and permissions', () => {
    it('declares scan, approve, reject, list and stats', () => {
      expect(ROUTES.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
        'GET /', 'GET /stats', `POST /${PENDING_A}/approve`, `POST /${PENDING_A}/reject`, 'POST /scan'
      ].sort());
    });

    it.each(ROUTES.map((r) => [`${r.method} ${r.path}`, r]))('%s answers 401 without a token and never reaches the database', async (_name, r) => {
      const res = await call(r.method, r.path, { body: r.method === 'POST' ? {} : undefined });
      expect(res.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it.each(WRITES.map((r) => [`${r.method} ${r.path}`, r]))('%s answers 403 to a user who can only read evidence', async (_name, r) => {
      const res = await call(r.method, r.path, { as: 'readerA', body: {} });
      expect(res.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it.each(READS.map((r) => [`${r.method} ${r.path}`, r]))('%s answers 403 to a user without evidence.read', async (_name, r) => {
      const res = await call(r.method, r.path, { as: 'nobody' });
      expect(res.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('organization isolation', () => {
    it('lists and counts only the caller organization suggestions', async () => {
      await call('GET', '/', { as: 'writerB' });
      await call('GET', '/stats', { as: 'writerB' });
      for (const [sql, params] of pool.query.mock.calls) {
        expect(sql).toMatch(/organization_id = \$1/);
        expect(params[0]).toBe(ORG_B);
      }
      const stats = await call('GET', '/stats', { as: 'writerB' });
      expect(stats.json.data).toEqual({ pending: 0, approved: 0, rejected: 0 });
    });

    it('does not let org B approve org A suggestion: 404, no file, no evidence, no link', async () => {
      const res = await approve('writerB', { notes: 'mine' });
      expect(res.status).toBe(404);
      expect(writeFile).not.toHaveBeenCalled();
      expect(callsMatching(/^\s*(INSERT|UPDATE) /)).toHaveLength(0);
      expect(auditService.logFromRequest).not.toHaveBeenCalled();
      const [sql, params] = callsMatching(/FROM pending_evidence/)[0];
      expect(sql).toMatch(/WHERE id = \$1 AND organization_id = \$2/);
      expect(params).toEqual([PENDING_A, ORG_B]);
    });

    it('does not let org B reject org A suggestion', async () => {
      const res = await reject('writerB', { notes: 'nope' });
      expect(res.status).toBe(404);
      expect(callsMatching(/^\s*(INSERT|UPDATE) /)).toHaveLength(0);
      expect(auditService.logFromRequest).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects malformed ids before any query', async () => {
      const a = await call('POST', "/1'%20OR%20'1'='1/approve", { as: 'writerA', body: {} });
      const r = await call('POST', '/not-a-uuid/reject', { as: 'writerA', body: {} });
      expect([a.status, r.status]).toEqual([400, 400]);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('accepts only the known status filters', async () => {
      for (const status of ['pending', 'approved', 'rejected']) {
        expect((await call('GET', `/?status=${status}`, { as: 'readerA' })).status).toBe(200);
      }
      pool.query.mockClear();
      const bad = await call('GET', `/?status=${encodeURIComponent("pending' OR '1'='1")}`, { as: 'readerA' });
      expect(bad.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('uses the pending filter by default and bounds the page', async () => {
      await call('GET', '/', { as: 'readerA' });
      const [sql, params] = callsMatching(/FROM pending_evidence pe/)[0];
      expect(params).toEqual([ORG_A, 'pending']);
      expect(sql).toMatch(/LIMIT 100/);
    });

    it.each(['approved', 'rejected'])('refuses to approve or reject a suggestion that is already %s (no duplicate evidence)', async (status) => {
      state.status = status;
      const a = await approve('writerA', {});
      const r = await reject('writerA', {});
      expect([a.status, r.status]).toEqual([409, 409]);
      expect(writeFile).not.toHaveBeenCalled();
      expect(callsMatching(/^\s*(INSERT|UPDATE) /)).toHaveLength(0);
    });
  });

  describe('human review', () => {
    it('promotes a suggestion only on explicit approval, under the approving user and organization', async () => {
      const res = await approve('writerA', { notes: 'Checked against the SIEM' });
      expect(res.status).toBe(200);
      expect(res.json.data).toMatchObject({ pending_id: PENDING_A, evidence_id: NEW_EVIDENCE });

      const body = Buffer.from(JSON.stringify(RAW_PAYLOAD, null, 2), 'utf8');
      const [filePath, written, options] = writeFile.mock.calls[0];
      expect(path.dirname(filePath)).toBe(os.tmpdir());
      expect(path.basename(filePath)).toMatch(/^\d+-[0-9a-f]{16}-approved\.json$/);
      expect(written.equals(body)).toBe(true);
      expect(options).toEqual({ contentType: 'application/json' });

      const [, insert] = callsMatching(/^\s*INSERT INTO evidence \(/)[0];
      expect(insert[0]).toBe(ORG_A);
      expect(insert[1]).toBe(mockUsers.writerA.id);
      expect(insert[2]).toMatch(/^Quarterly login review-\d{4}-\d{2}-\d{2}\.json$/);
      expect(insert[2]).not.toMatch(/[<>!]/);
      expect(insert[8]).toBe(crypto.createHash('sha256').update(body).digest('hex'));

      const [linkSql, linkParams] = callsMatching(/^\s*INSERT INTO evidence_control_links/)[0];
      expect(linkSql).toMatch(/SELECT \$1, \$2, \$3, e\.organization_id FROM evidence e WHERE e\.id = \$1/);
      expect(linkParams[0]).toBe(NEW_EVIDENCE);
      expect(linkParams[1]).toBe(CONTROL_1);

      const [, update] = callsMatching(/^\s*UPDATE pending_evidence\s+SET status = 'approved'/)[0];
      expect(update).toEqual([PENDING_A, mockUsers.writerA.id, 'Checked against the SIEM', NEW_EVIDENCE]);
      expect(auditService.logFromRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        eventType: 'pending_evidence_approved', resourceId: PENDING_A
      }));
    });

    it('rejects a suggestion without creating any evidence and audits the decision', async () => {
      const res = await reject('writerA', { notes: 'False positive' });
      expect(res.status).toBe(200);
      expect(writeFile).not.toHaveBeenCalled();
      expect(callsMatching(/^\s*INSERT INTO evidence/)).toHaveLength(0);
      const [, update] = callsMatching(/^\s*UPDATE pending_evidence\s+SET status = 'rejected'/)[0];
      expect(update).toEqual([PENDING_A, mockUsers.writerA.id, 'False positive']);
      expect(auditService.logFromRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'pending_evidence_rejected' }));
    });

    it('treats a request with no JSON body as an approval or rejection without notes, and never fails after writing the evidence', async () => {
      const approved = await call('POST', `/${PENDING_A}/approve`, { as: 'writerA' });
      expect(approved.status).toBe(200);
      expect(callsMatching(/^\s*UPDATE pending_evidence\s+SET status = 'approved'/)[0][1][2]).toBeNull();

      pool.query.mockClear();
      const rejected = await call('POST', `/${PENDING_A}/reject`, { as: 'writerA' });
      expect(rejected.status).toBe(200);
      expect(callsMatching(/^\s*UPDATE pending_evidence\s+SET status = 'rejected'/)[0][1][2]).toBeNull();
    });

    it('answers a generic 500 that does not leak the database error', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      pool.query.mockRejectedValue(new Error('relation "pending_evidence" does not exist'));
      const res = await call('GET', '/', { as: 'readerA' });
      expect(res.status).toBe(500);
      expect(res.json).toEqual({ success: false, error: 'Failed to load pending evidence' });
    });
  });
});
