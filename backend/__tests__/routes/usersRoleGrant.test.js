'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next()
}));
jest.mock('../../src/services/auditService', () => ({ logFromRequest: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/auditorRoleTemplates', () => ({ ensureAuditorSubroles: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/schema', () => ({ hasPublicColumn: jest.fn().mockResolvedValue(false) }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/users');
const { assertMayAssignRoles, assertMayModifyUser } = require('../../src/utils/roleGrantGuard');
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

const ORG = '99999999-9999-4999-8999-999999999999';
const CALLER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const ADMIN_ROLE = '33333333-3333-4333-8333-333333333333';
const MANAGER_ROLE = '44444444-4444-4444-8444-444444444444';
const READER_ROLE = '55555555-5555-4555-8555-555555555555';
const FOREIGN_ROLE = '66666666-6666-4666-8666-666666666666';
const USER_SYSTEM_ROLE = '77777777-7777-4777-8777-777777777777';

const ROLES = {
  [ADMIN_ROLE]: { id: ADMIN_ROLE, name: 'admin', is_system_role: true, permissions: ['*', 'users.manage'] },
  [MANAGER_ROLE]: { id: MANAGER_ROLE, name: 'people_manager', is_system_role: false, permissions: ['users.manage'] },
  [READER_ROLE]: { id: READER_ROLE, name: 'reader', is_system_role: false, permissions: ['controls.read'] }
};

const nonAdmin = () => ({ id: CALLER, organization_id: ORG, role: 'user', permissions: ['users.manage', 'controls.read'] });
const admin = () => ({ id: CALLER, organization_id: ORG, role: 'admin', permissions: ['*'] });

let client;
let targetRole;

function sqlMock(sql, params) {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
  if (/FROM roles r\s+LEFT JOIN role_permissions/.test(sql)) {
    return { rows: params[0].filter((id) => ROLES[id]).map((id) => ROLES[id]) };
  }
  if (/SELECT id::text AS id\s+FROM roles/.test(sql)) {
    // validateAssignableRoleIds: FOREIGN_ROLE belongs to another organization.
    return { rows: params[0].filter((id) => id !== FOREIGN_ROLE).map((id) => ({ id })) };
  }
  if (/SELECT id\s+FROM roles\s+WHERE is_system_role = true/.test(sql)) return { rows: [{ id: USER_SYSTEM_ROLE }] };
  if (/SELECT id, role\s+FROM users/.test(sql)) return { rows: [{ id: TARGET, role: targetRole }] };
  if (/^\s*INSERT INTO users/.test(sql)) return { rows: [{ id: TARGET, role: params[params.length - 2], is_active: true }] };
  if (/^\s*UPDATE users/.test(sql)) return { rows: [{ id: TARGET, role: targetRole, is_active: true }] };
  if (/INSERT INTO organization_invites/.test(sql)) return { rows: [{ id: 'invite-1', email: 'a@b.co' }] };
  return { rows: [] };
}

const statements = () => client.query.mock.calls.map(([sql]) => String(sql).trim());
const ran = (pattern) => statements().some((sql) => pattern.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  targetRole = 'user';
  client = { query: jest.fn(async (sql, params) => sqlMock(sql, params)), release: jest.fn() };
  pool.connect.mockResolvedValue(client);
  pool.query.mockImplementation(async (sql, params) => sqlMock(sql, params));
});

const createBody = (extra = {}) => ({
  email: 'new.user@example.com',
  password: 'Str0ng!Passw0rd#2026',
  full_name: 'New User',
  ...extra
});

describe('POST /users role-grant guard', () => {
  it('refuses a users.manage non-admin creating an admin', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({ user: nonAdmin(), body: createBody({ primary_role: 'admin' }) }), res);
    expect(res.statusCode).toBe(403);
    expect(ran(/^ROLLBACK/)).toBe(true);
    expect(ran(/^COMMIT/)).toBe(false);
    expect(ran(/^INSERT INTO users/)).toBe(false);
  });

  it('refuses role_ids that include the system admin role', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({ user: nonAdmin(), body: createBody({ role_ids: [ADMIN_ROLE] }) }), res);
    expect(res.statusCode).toBe(403);
    expect(ran(/^COMMIT/)).toBe(false);
  });

  it('refuses a custom role that carries users.manage', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({ user: nonAdmin(), body: createBody({ role_ids: [MANAGER_ROLE] }) }), res);
    expect(res.statusCode).toBe(403);
  });

  it('lets a non-admin create an ordinary user with a role they already hold the permissions of', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({ user: nonAdmin(), body: createBody({ role_ids: [READER_ROLE] }) }), res);
    expect(res.statusCode).toBe(201);
    expect(ran(/^COMMIT/)).toBe(true);
  });

  it('still lets an admin create an admin', async () => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/', makeReq({ user: admin(), body: createBody({ primary_role: 'admin', role_ids: [ADMIN_ROLE] }) }), res);
    expect(res.statusCode).toBe(201);
  });
});

describe('PATCH /users/:userId role-grant guard', () => {
  const patch = async (user, body, userId = TARGET) => {
    const res = makeRes();
    await invokeRoute(router, 'patch', '/:userId', makeReq({ user, params: { userId }, body }), res);
    return res;
  };

  it('refuses role_ids carrying the admin role from a non-admin', async () => {
    const res = await patch(nonAdmin(), { role_ids: [ADMIN_ROLE] });
    expect(res.statusCode).toBe(403);
    expect(ran(/^COMMIT/)).toBe(false);
  });

  it('refuses a non-admin changing their own role_ids', async () => {
    const res = await patch(nonAdmin(), { role_ids: [READER_ROLE] }, CALLER);
    expect(res.statusCode).toBe(403);
    expect(ran(/^COMMIT/)).toBe(false);
  });

  it('refuses a non-admin reactivating or deactivating an admin account', async () => {
    targetRole = 'admin';
    const res = await patch(nonAdmin(), { is_active: true });
    expect(res.statusCode).toBe(403);
    expect(ran(/^UPDATE users/)).toBe(false);
  });

  it('still lets an admin assign the admin role through role_ids', async () => {
    const res = await patch(admin(), { role_ids: [ADMIN_ROLE] });
    expect(res.statusCode).toBe(200);
    expect(ran(/^COMMIT/)).toBe(true);
  });

  it('keeps user_organizations.role in step when an admin changes primary_role', async () => {
    targetRole = 'admin';
    const res = await patch(admin(), { primary_role: 'user' });
    expect(res.statusCode).toBe(200);
    const call = client.query.mock.calls.find(([sql]) => /UPDATE user_organizations SET role/.test(sql));
    expect(call).toBeDefined();
    expect(call[1]).toEqual(['user', TARGET, ORG]);
    expect(ran(/^COMMIT/)).toBe(true);
  });
});

describe('POST /users/invite role-grant guard', () => {
  const invite = async (user, body) => {
    const res = makeRes();
    await invokeRoute(router, 'post', '/invite', makeReq({ user, body: { email: 'invitee@example.com', ...body } }), res);
    return res;
  };
  const inserted = () => pool.query.mock.calls.some(([sql]) => /INSERT INTO organization_invites/.test(sql));

  it('refuses an admin invite from a non-admin and stores nothing', async () => {
    const res = await invite(nonAdmin(), { primary_role: 'admin' });
    expect(res.statusCode).toBe(403);
    expect(inserted()).toBe(false);
  });

  it('refuses a privileged role_id from a non-admin', async () => {
    const res = await invite(nonAdmin(), { role_ids: [MANAGER_ROLE] });
    expect(res.statusCode).toBe(403);
    expect(inserted()).toBe(false);
  });

  it('rejects role_ids outside the organization', async () => {
    const res = await invite(admin(), { role_ids: [FOREIGN_ROLE] });
    expect(res.statusCode).toBe(400);
    expect(inserted()).toBe(false);
  });

  it('rejects malformed role_ids', async () => {
    const res = await invite(admin(), { role_ids: ['not-a-uuid'] });
    expect(res.statusCode).toBe(400);
    expect(inserted()).toBe(false);
  });

  it('lets an admin invite an admin', async () => {
    const res = await invite(admin(), { primary_role: 'admin' });
    expect(res.statusCode).toBe(201);
    expect(inserted()).toBe(true);
  });
});

describe('roleGrantGuard helpers', () => {
  it('passes admins and wildcard holders without querying', async () => {
    const q = { query: jest.fn() };
    await assertMayAssignRoles(q, { user: admin() }, { primaryRole: 'admin', roleIds: [ADMIN_ROLE] });
    await assertMayAssignRoles(q, { user: { id: CALLER, organization_id: ORG, role: 'user', permissions: ['*'] } }, { roleIds: [ADMIN_ROLE] });
    expect(q.query).not.toHaveBeenCalled();
  });

  it('refuses a role holding a permission the caller lacks', async () => {
    ROLES[READER_ROLE].permissions = ['controls.read', 'evidence.write'];
    try {
      await expect(assertMayAssignRoles(client, { user: nonAdmin() }, { roleIds: [READER_ROLE] }))
        .rejects.toMatchObject({ statusCode: 403 });
    } finally {
      ROLES[READER_ROLE].permissions = ['controls.read'];
    }
  });

  it('assertMayModifyUser blocks only non-admins acting on an admin', () => {
    expect(() => assertMayModifyUser({ user: nonAdmin() }, 'admin')).toThrow(/admin/i);
    expect(() => assertMayModifyUser({ user: nonAdmin() }, 'user')).not.toThrow();
    expect(() => assertMayModifyUser({ user: admin() }, 'admin')).not.toThrow();
  });
});
