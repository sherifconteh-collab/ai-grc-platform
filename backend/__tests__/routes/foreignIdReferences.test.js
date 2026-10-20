'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_at_least_32_chars';

const ORG = '0000000a-0000-4000-8000-00000000000a';
const OWN_USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const FOREIGN_USER = 'bbbbbbbb-0000-4000-8000-000000000001';
const OWN_VULN = 'cccccccc-0000-4000-8000-000000000001';
const FOREIGN_VULN = 'dddddddd-0000-4000-8000-000000000001';
const OWN_ENV = 'ffffffff-0000-4000-8000-000000000001';
const FOREIGN_ENV = 'ffffffff-0000-4000-8000-000000000002';
const FOREIGN_TREATMENT = 'eeeeeeee-0000-4000-8000-000000000001';
const ITEM = '11111111-1111-4111-8111-111111111111';
const CONTROL = '22222222-2222-4222-8222-222222222222';
const IMPLEMENTATION = '33333333-3333-4333-8333-333333333333';
const WORK_ITEM = '44444444-4444-4444-8444-444444444444';

const mockUsers = {
  writer: {
    id: OWN_USER, organization_id: ORG,
    permissions: ['controls.read', 'controls.write', 'implementations.read', 'implementations.write', 'assets.read', 'assets.write']
  }
};

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/middleware/auth', () => require('./_httpHarness').mockAuthModule(mockUsers));
jest.mock('../../src/middleware/edition', () => ({ requireProEdition: () => (req, res, next) => next() }));
jest.mock('../../src/middleware/rateLimit', () => ({ createRateLimiter: () => (req, res, next) => next() }));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/webhookService', () => ({ enqueueWebhookEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/jobService', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => String(e) }));

const pool = require('../../src/config/database');
const poamRouter = require('../../src/routes/poam');
const exceptionsRouter = require('../../src/routes/exceptions');
const implementationsRouter = require('../../src/routes/implementations');
const vulnerabilitiesRouter = require('../../src/routes/vulnerabilities');
const cmdbRouter = require('../../src/routes/cmdb');
const { startApp } = require('./_httpHarness');

// Rows that exist: one user, one vulnerability and one environment in ORG.
// Every other id is "foreign": the organization-scoped lookup finds nothing.
function installFakeDb() {
  pool.query.mockImplementation(async (sql, params = []) => {
    const q = String(sql);
    const own = (id) => (params[0] === id && params[1] === ORG ? [{ '?column?': 1 }] : []);
    if (/FROM users WHERE id = \$1 AND organization_id = \$2/.test(q)) return { rows: own(OWN_USER) };
    if (/FROM vulnerability_findings WHERE id = \$1 AND organization_id = \$2/.test(q)) return { rows: own(OWN_VULN) };
    if (/FROM environments WHERE id = \$1 AND organization_id = \$2/.test(q)) return { rows: own(OWN_ENV) };
    if (/FROM risk_treatments WHERE id = \$1 AND organization_id = \$2/.test(q)) return { rows: [] };
    if (/FROM asset_categories/.test(q)) return { rows: [{ id: 'cat-1' }] };
    if (/FROM vulnerability_control_work_items vw/.test(q)) return { rows: [{ id: WORK_ITEM, action_status: 'open', control_effect: 'none' }] };
    if (/^\s*SELECT \*\s+FROM poam_items/.test(q)) return { rows: [{ id: ITEM, organization_id: ORG, status: 'open', priority: 'medium' }] };
    if (/FROM control_exceptions\s+WHERE organization_id = \$1 AND id = \$2/.test(q)) return { rows: [{ id: ITEM, status: 'pending' }] };
    if (/^\s*(INSERT|UPDATE)/.test(q)) return { rows: [{ id: ITEM, status: 'open', priority: 'medium', source_type: 'manual', title: 't' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
}

const WRITE_TARGETS = 'poam_items|control_exceptions|control_implementations|vulnerability_control_work_items|assets';
const writes = () => pool.query.mock.calls.filter(([sql]) =>
  new RegExp(`^\\s*(INSERT INTO|UPDATE) (${WRITE_TARGETS})\\b`).test(String(sql)));
const allSql = () => pool.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ')).join('\n');

describe('ids supplied in a request must belong to the caller organization', () => {
  let poam;
  let exceptions;
  let implementations;
  let vulnerabilities;
  let cmdb;
  beforeAll(async () => {
    poam = await startApp(poamRouter, '/poam');
    exceptions = await startApp(exceptionsRouter, '/exceptions');
    implementations = await startApp(implementationsRouter, '/implementations');
    vulnerabilities = await startApp(vulnerabilitiesRouter, '/vulnerabilities');
    cmdb = await startApp(cmdbRouter, '/cmdb');
  });
  afterAll(async () => {
    await Promise.all([poam.close(), exceptions.close(), implementations.close(), vulnerabilities.close(), cmdb.close()]);
  });
  beforeEach(() => { jest.clearAllMocks(); installFakeDb(); });

  test('POA&M create refuses a foreign owner and a foreign vulnerability', async () => {
    const base = { title: 'Patch it' };
    expect((await poam.call('POST', '/poam', { as: 'writer', body: { ...base, owner_id: FOREIGN_USER } })).status).toBe(400);
    expect((await poam.call('POST', '/poam', { as: 'writer', body: { ...base, vulnerability_id: FOREIGN_VULN } })).status).toBe(400);
    expect((await poam.call('POST', '/poam', { as: 'writer', body: { ...base, owner_id: 'not-a-uuid' } })).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('POA&M create accepts own owner and vulnerability', async () => {
    const res = await poam.call('POST', '/poam', { as: 'writer', body: { title: 'Patch it', owner_id: OWN_USER, vulnerability_id: OWN_VULN } });
    expect(res.status).toBe(201);
  });

  test('POA&M update refuses a foreign owner and a foreign treatment', async () => {
    expect((await poam.call('PATCH', `/poam/${ITEM}`, { as: 'writer', body: { owner_id: FOREIGN_USER } })).status).toBe(400);
    expect((await poam.call('PATCH', `/poam/${ITEM}`, { as: 'writer', body: { treatment_id: FOREIGN_TREATMENT } })).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('exception create and update refuse a foreign owner', async () => {
    const created = await exceptions.call('POST', '/exceptions', {
      as: 'writer', body: { control_id: CONTROL, title: 'T', reason: 'R', owner_id: FOREIGN_USER }
    });
    expect(created.status).toBe(400);
    const updated = await exceptions.call('PATCH', `/exceptions/${ITEM}`, { as: 'writer', body: { owner_id: FOREIGN_USER } });
    expect(updated.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('control assignment refuses a foreign assignee and accepts an own one', async () => {
    const foreign = await implementations.call('PATCH', `/implementations/${IMPLEMENTATION}/assign`, { as: 'writer', body: { assignedTo: FOREIGN_USER } });
    expect(foreign.status).toBe(400);
    expect(writes()).toHaveLength(0);
    const own = await implementations.call('PATCH', `/implementations/${IMPLEMENTATION}/assign`, { as: 'writer', body: { assignedTo: OWN_USER } });
    expect(own.status).toBe(200);
  });

  test('vulnerability workflow item refuses a foreign owner', async () => {
    const path = `/vulnerabilities/${ITEM}/workflow/${WORK_ITEM}`;
    expect((await vulnerabilities.call('PATCH', path, { as: 'writer', body: { ownerId: FOREIGN_USER } })).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('asset create and update refuse foreign owners and environments', async () => {
    const created = await cmdb.call('POST', '/cmdb/hardware', { as: 'writer', body: { name: 'srv', owner_id: FOREIGN_USER } });
    expect(created.status).toBe(400);
    const createdEnv = await cmdb.call('POST', '/cmdb/hardware', { as: 'writer', body: { name: 'srv', environment_id: FOREIGN_ENV } });
    expect(createdEnv.status).toBe(400);
    for (const field of ['owner_id', 'custodian_id', 'business_owner_id']) {
      const res = await cmdb.call('PUT', `/cmdb/hardware/${ITEM}`, { as: 'writer', body: { [field]: FOREIGN_USER } });
      expect(res.status).toBe(400);
    }
    const env = await cmdb.call('PUT', `/cmdb/hardware/${ITEM}`, { as: 'writer', body: { environment_id: FOREIGN_ENV } });
    expect(env.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test('asset create and update accept own references', async () => {
    const created = await cmdb.call('POST', '/cmdb/hardware', { as: 'writer', body: { name: 'srv', owner_id: OWN_USER, environment_id: OWN_ENV } });
    expect(created.status).toBe(201);
    const updated = await cmdb.call('PUT', `/cmdb/hardware/${ITEM}`, { as: 'writer', body: { custodian_id: OWN_USER, environment_id: OWN_ENV } });
    expect(updated.status).toBe(200);
  });

  test('joined user and row names are filtered by organization', async () => {
    await poam.call('GET', '/poam', { as: 'writer' });
    await poam.call('GET', `/poam/${ITEM}`, { as: 'writer' });
    await implementations.call('GET', `/implementations/${IMPLEMENTATION}`, { as: 'writer' });
    await cmdb.call('GET', '/cmdb/hardware', { as: 'writer' });
    const sql = allSql();
    expect(sql).toMatch(/LEFT JOIN users owner ON owner\.id = p\.owner_id AND owner\.organization_id = p\.organization_id/);
    expect(sql).toMatch(/LEFT JOIN vulnerability_findings vf ON vf\.id = p\.vulnerability_id AND vf\.organization_id = p\.organization_id/);
    expect(sql).toMatch(/LEFT JOIN users u ON u\.id = ci\.assigned_to AND u\.organization_id = ci\.organization_id/);
    expect(sql).toMatch(/LEFT JOIN users u ON u\.id = a\.owner_id AND u\.organization_id = a\.organization_id/);
    expect(sql).toMatch(/LEFT JOIN environments e ON e\.id = a\.environment_id AND e\.organization_id = a\.organization_id/);
  });
});
