'use strict';

/**
 * Role-grant guard.
 *
 * Every code path that sets a user's `primary_role`, assigns `role_ids`, or
 * creates an invite carrying either must go through this module. A caller who
 * holds `users.manage` but is not an admin may only hand out roles that are no
 * more powerful than their own permissions, and may never reach admin (or a
 * role holding users.manage / roles.manage / the wildcard) through a side door.
 */

const PRIVILEGED_PERMISSIONS = new Set(['*', 'users.manage', 'roles.manage']);

function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function isAdminCaller(req) {
  const user = req.user || {};
  return user.role === 'admin' || (user.permissions || []).includes('*');
}

/**
 * Throws a 403 error unless the caller may assign the given primary role and
 * role ids. Admins always pass. `client` is anything with a `query` method
 * (a pooled client inside a transaction, or the pool itself).
 *
 * @param {{query: Function}} client
 * @param {object} req Express request (needs req.user)
 * @param {{primaryRole?: string|null, roleIds?: string[]|null, targetUserId?: string|null}} grant
 */
async function assertMayAssignRoles(client, req, grant = {}) {
  if (isAdminCaller(req)) return;

  const primaryRole = grant.primaryRole ? String(grant.primaryRole).toLowerCase() : null;
  const roleIds = Array.isArray(grant.roleIds) ? Array.from(new Set(grant.roleIds)) : null;

  if (primaryRole === 'admin') {
    throw forbidden('Only an existing admin can grant the admin role');
  }
  if (roleIds !== null && grant.targetUserId && grant.targetUserId === req.user.id) {
    throw forbidden('You cannot change your own roles');
  }
  if (roleIds === null || roleIds.length === 0) return;

  const result = await client.query(
    `SELECT r.id::text AS id, r.name, r.is_system_role,
            COALESCE(ARRAY_AGG(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE r.id = ANY($1::uuid[])
       AND (r.organization_id = $2 OR r.is_system_role = true)
     GROUP BY r.id`,
    [roleIds, req.user.organization_id]
  );

  const callerPermissions = new Set(req.user.permissions || []);
  for (const role of result.rows) {
    const permissions = role.permissions || [];
    const isAdminRole = role.is_system_role === true && String(role.name).toLowerCase() === 'admin';
    if (isAdminRole || permissions.some((name) => PRIVILEGED_PERMISSIONS.has(name))) {
      throw forbidden('Only an existing admin can assign a role that carries user or role management');
    }
    if (permissions.some((name) => !callerPermissions.has(name))) {
      throw forbidden('Cannot assign a role holding permissions you do not hold');
    }
  }
}

/**
 * Throws a 403 error when a non-admin caller tries to modify an admin account
 * (deactivate, reactivate, rename, re-role).
 */
function assertMayModifyUser(req, targetRole) {
  if (isAdminCaller(req)) return;
  if (String(targetRole || '').toLowerCase() === 'admin') {
    throw forbidden('Only an existing admin can modify an admin account');
  }
}

module.exports = { assertMayAssignRoles, assertMayModifyUser, isAdminCaller, PRIVILEGED_PERMISSIONS };
