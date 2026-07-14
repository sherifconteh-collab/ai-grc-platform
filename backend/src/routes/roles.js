// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');
const { ensureAuditorSubroles } = require('../services/auditorRoleTemplates');
const auditService = require('../services/auditService');

router.use(authenticate);

// A caller can never grant a permission (directly, or via a role they assign)
// that they don't already hold themselves — otherwise roles.manage alone lets
// a non-admin mint or assign an over-privileged role and self-escalate.
function findDisallowedPermissions(req, permissionNames) {
  const callerPermissions = req.user.permissions || [];
  if (callerPermissions.includes('*')) return [];
  return permissionNames.filter((name) => !callerPermissions.includes(name));
}

// GET /roles
router.get('/', requirePermission('roles.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(`
      SELECT r.id, r.name, r.description, r.is_system_role, r.created_at,
             COALESCE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.id IS NOT NULL), '{}') as permissions,
             COUNT(DISTINCT p.id)::int as permission_count,
             COUNT(DISTINCT ru.id)::int as user_count
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      LEFT JOIN user_roles ur ON ur.role_id = r.id
      LEFT JOIN users ru ON ru.id = ur.user_id AND ru.organization_id = $1
      WHERE r.organization_id = $1 OR r.is_system_role = true
      GROUP BY r.id
      ORDER BY r.is_system_role DESC, r.name
    `, [orgId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Roles error:', error);
    res.status(500).json({ success: false, error: 'Failed to load roles' });
  }
});

// POST /roles
router.post('/', requirePermission('roles.manage'), validateBody((body) => {
  const errors = requireFields(body, ['name']);
  if (body.permissions && !Array.isArray(body.permissions)) {
    errors.push('permissions must be an array');
  }
  return errors;
}), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    if (permissions && permissions.length > 0) {
      const disallowed = findDisallowedPermissions(req, permissions);
      if (disallowed.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'Cannot grant permissions you do not hold',
          disallowedPermissions: disallowed
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const roleResult = await client.query(
        'INSERT INTO roles (organization_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [req.user.organization_id, name, description || null]
      );
      const role = roleResult.rows[0];

      if (permissions && permissions.length > 0) {
        for (const permName of permissions) {
          const perm = await client.query('SELECT id FROM permissions WHERE name = $1', [permName]);
          if (perm.rows.length > 0) {
            await client.query(
              'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [role.id, perm.rows[0].id]
            );
          }
        }
      }

      await client.query('COMMIT');

      auditService.logFromRequest(req, {
        eventType: 'role.created',
        resourceType: 'role',
        resourceId: role.id,
        details: { name: role.name, permissions: permissions || [] },
        success: true
      }).catch(() => {});

      res.status(201).json({ success: true, data: role });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ success: false, error: 'Failed to create role' });
  }
});

// PUT /roles/:roleId
router.put('/:roleId', requirePermission('roles.manage'), validateBody((body) => {
  const errors = [];
  if (body.permissions && !Array.isArray(body.permissions)) {
    errors.push('permissions must be an array');
  }
  return errors;
}), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    if (permissions) {
      const disallowed = findDisallowedPermissions(req, permissions);
      if (disallowed.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'Cannot grant permissions you do not hold',
          disallowedPermissions: disallowed
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description)
        WHERE id = $3 AND organization_id = $4 AND is_system_role = false RETURNING *
      `, [name, description, req.params.roleId, req.user.organization_id]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Role not found' });
      }

      if (permissions) {
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [req.params.roleId]);
        for (const permName of permissions) {
          const perm = await client.query('SELECT id FROM permissions WHERE name = $1', [permName]);
          if (perm.rows.length > 0) {
            await client.query(
              'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
              [req.params.roleId, perm.rows[0].id]
            );
          }
        }
      }

      await client.query('COMMIT');

      auditService.logFromRequest(req, {
        eventType: 'role.updated',
        resourceType: 'role',
        resourceId: result.rows[0].id,
        details: { name: result.rows[0].name, permissions: permissions || undefined },
        success: true
      }).catch(() => {});

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

// DELETE /roles/:roleId
router.delete('/:roleId', requirePermission('roles.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM roles WHERE id = $1 AND organization_id = $2 AND is_system_role = false RETURNING id',
      [req.params.roleId, req.user.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Role not found or cannot be deleted' });
    }

    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete role' });
  }
});

// GET /roles/permissions/all
router.get('/permissions/all', requirePermission('roles.manage'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM permissions ORDER BY resource, action');
    const grouped = result.rows.reduce((acc, permission) => {
      if (!acc[permission.resource]) {
        acc[permission.resource] = [];
      }

      acc[permission.resource].push({
        id: permission.id,
        name: permission.name,
        description: permission.description,
        action: permission.action,
        resource: permission.resource
      });
      return acc;
    }, {});

    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('Permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load permissions' });
  }
});

// GET /roles/:roleId
router.get('/:roleId', requirePermission('roles.manage'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const orgId = req.user.organization_id;

    const result = await pool.query(`
      SELECT r.id, r.name, r.description, r.is_system_role, r.created_at,
             COALESCE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.id IS NOT NULL), '{}') as permissions,
             COUNT(DISTINCT p.id)::int as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.id = $1 AND (r.organization_id = $2 OR r.is_system_role = true)
      GROUP BY r.id
    `, [roleId, orgId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ success: false, error: 'Failed to load role' });
  }
});

// POST /roles/bootstrap-auditor-subroles
router.post('/bootstrap-auditor-subroles', requirePermission('roles.manage'), async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const generatedRoles = await ensureAuditorSubroles(client, req.user.organization_id);
      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: {
          generated_roles: generatedRoles
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bootstrap auditor subroles error:', error);
    const statusCode = Number(error.statusCode) || 500;
    res.status(statusCode).json({ success: false, error: 'Failed to bootstrap auditor subroles' });
  }
});

// POST /roles/assign
router.post('/assign', requirePermission('roles.manage'), validateBody((body) => {
  const errors = requireFields(body, ['userId', 'roleIds']);
  if (body.userId && !isUuid(body.userId)) {
    errors.push('userId must be a valid UUID');
  }
  if (body.roleIds && !Array.isArray(body.roleIds)) {
    errors.push('roleIds must be an array');
  }
  if (Array.isArray(body.roleIds) && body.roleIds.some((id) => !isUuid(id))) {
    errors.push('roleIds must contain valid UUID values');
  }
  return errors;
}), async (req, res) => {
  try {
    const { userId, roleIds } = req.body;
    const uniqueRoleIds = Array.from(new Set(roleIds));

    if (!uniqueRoleIds.length) {
      return res.status(400).json({ success: false, error: 'roleIds must contain at least one role' });
    }

    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
      [userId, req.user.organization_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found in your organization' });
    }

    const validRoles = await pool.query(
      `SELECT id
       FROM roles
       WHERE id = ANY($1::uuid[])
         AND (organization_id = $2 OR is_system_role = true)`,
      [uniqueRoleIds, req.user.organization_id]
    );

    if (validRoles.rows.length !== uniqueRoleIds.length) {
      return res.status(400).json({ success: false, error: 'One or more roles are invalid for this organization' });
    }

    // A roles.manage holder cannot assign a role (including an existing
    // system role like admin) that grants permissions they don't already
    // hold themselves — otherwise assigning the admin role to yourself is a
    // one-call privilege escalation.
    const targetPermissionsResult = await pool.query(
      `SELECT DISTINCT p.name
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ANY($1::uuid[])`,
      [uniqueRoleIds]
    );
    const disallowed = findDisallowedPermissions(req, targetPermissionsResult.rows.map((row) => row.name));
    if (disallowed.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'Cannot assign a role that grants permissions you do not hold',
        disallowedPermissions: disallowed
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

      for (const roleId of uniqueRoleIds) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, roleId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    auditService.logFromRequest(req, {
      eventType: 'role.assigned',
      resourceType: 'user',
      resourceId: userId,
      details: { roleIds: uniqueRoleIds },
      success: true
    }).catch(() => {});

    res.json({ success: true, message: 'Roles assigned' });
  } catch (error) {
    console.error('Assign roles error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign roles' });
  }
});

// GET /roles/user/:userId
router.get('/user/:userId', requireAnyPermission(['roles.manage', 'users.read']), async (req, res) => {
  try {
    const permissions = req.user.permissions || [];
    const isPrivileged = permissions.includes('*') || permissions.includes('roles.manage') || permissions.includes('users.read');
    if (!isPrivileged && req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT r.id, r.name, r.description, r.is_system_role
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN users u ON u.id = ur.user_id
      WHERE ur.user_id = $1 AND u.organization_id = $2
      ORDER BY r.name
    `, [req.params.userId, req.user.organization_id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('User roles error:', error);
    res.status(500).json({ success: false, error: 'Failed to load user roles' });
  }
});

module.exports = router;
