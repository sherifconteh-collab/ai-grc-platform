import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, getUserPermissions } from '../middleware/rbac.js';

const router = express.Router();

/**
 * GET /api/v1/roles
 * Get all roles for the organization
 */
router.get('/', authenticateToken, requirePermission('users.read'), async (req, res) => {
  try {
    const organizationId = req.user.organizationId;

    const result = await pool.query(`
      SELECT
        r.id,
        r.name,
        r.description,
        r.is_system_role,
        r.created_at,
        (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) as user_count,
        ARRAY_AGG(
          json_build_object(
            'id', p.id,
            'name', p.name,
            'resource', p.resource,
            'action', p.action,
            'description', p.description
          ) ORDER BY p.resource, p.action
        ) FILTER (WHERE p.id IS NOT NULL) as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = $1 OR r.is_system_role = TRUE
      GROUP BY r.id
      ORDER BY r.is_system_role DESC, r.name
    `, [organizationId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roles'
    });
  }
});

/**
 * POST /api/v1/roles
 * Create a custom role
 */
router.post('/', authenticateToken, requirePermission('users.assign_roles'), async (req, res) => {
  try {
    const { name, description, permissionIds } = req.body;
    const organizationId = req.user.organizationId;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Role name is required'
      });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create role
      const roleResult = await client.query(`
        INSERT INTO roles (organization_id, name, description, is_system_role)
        VALUES ($1, $2, $3, FALSE)
        RETURNING *
      `, [organizationId, name, description]);

      const roleId = roleResult.rows[0].id;

      // Assign permissions
      if (permissionIds && permissionIds.length > 0) {
        const permissionValues = permissionIds.map((permId, i) =>
          `($1, $${i + 2})`
        ).join(', ');

        await client.query(`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ${permissionValues}
        `, [roleId, ...permissionIds]);
      }

      // Log action
      await client.query(`
        INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [req.user.id, 'create_role', 'role', roleId, req.ip, req.headers['user-agent']]);

      await client.query('COMMIT');

      res.json({
        success: true,
        data: roleResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create role'
    });
  }
});

/**
 * PUT /api/v1/roles/:roleId
 * Update a custom role
 */
router.put('/:roleId', authenticateToken, requirePermission('users.assign_roles'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, description, permissionIds } = req.body;
    const organizationId = req.user.organizationId;

    // Check if role exists and belongs to organization
    const roleCheck = await pool.query(
      'SELECT is_system_role FROM roles WHERE id = $1 AND organization_id = $2',
      [roleId, organizationId]
    );

    if (roleCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    if (roleCheck.rows[0].is_system_role) {
      return res.status(403).json({
        success: false,
        error: 'Cannot modify system roles'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update role
      if (name || description) {
        await client.query(`
          UPDATE roles
          SET
            name = COALESCE($1, name),
            description = COALESCE($2, description),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [name, description, roleId]);
      }

      // Update permissions
      if (permissionIds) {
        // Remove old permissions
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

        // Add new permissions
        if (permissionIds.length > 0) {
          const permissionValues = permissionIds.map((permId, i) =>
            `($1, $${i + 2})`
          ).join(', ');

          await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES ${permissionValues}
          `, [roleId, ...permissionIds]);
        }
      }

      // Log action
      await client.query(`
        INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [req.user.id, 'update_role', 'role', roleId, req.ip, req.headers['user-agent']]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Role updated successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update role'
    });
  }
});

/**
 * DELETE /api/v1/roles/:roleId
 * Delete a custom role
 */
router.delete('/:roleId', authenticateToken, requirePermission('users.assign_roles'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const organizationId = req.user.organizationId;

    // Check if role exists and is not a system role
    const roleCheck = await pool.query(
      'SELECT is_system_role FROM roles WHERE id = $1 AND organization_id = $2',
      [roleId, organizationId]
    );

    if (roleCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Role not found'
      });
    }

    if (roleCheck.rows[0].is_system_role) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete system roles'
      });
    }

    // Check if role is assigned to any users
    const userCount = await pool.query(
      'SELECT COUNT(*) FROM user_roles WHERE role_id = $1',
      [roleId]
    );

    if (parseInt(userCount.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete role that is assigned to users'
      });
    }

    // Delete role (cascade will handle role_permissions)
    await pool.query('DELETE FROM roles WHERE id = $1', [roleId]);

    // Log action
    await pool.query(`
      INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [req.user.id, 'delete_role', 'role', roleId, req.ip, req.headers['user-agent']]);

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete role'
    });
  }
});

/**
 * GET /api/v1/roles/permissions
 * Get all available permissions
 */
router.get('/permissions/all', authenticateToken, requirePermission('users.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        resource,
        action,
        description
      FROM permissions
      ORDER BY resource, action
    `);

    // Group by resource
    const grouped = result.rows.reduce((acc, perm) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push(perm);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        all: result.rows,
        grouped
      }
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch permissions'
    });
  }
});

/**
 * POST /api/v1/roles/assign
 * Assign role(s) to a user
 */
router.post('/assign', authenticateToken, requirePermission('users.assign_roles'), async (req, res) => {
  try {
    const { userId, roleIds } = req.body;
    const organizationId = req.user.organizationId;

    if (!userId || !roleIds || roleIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User ID and role IDs are required'
      });
    }

    // Verify user belongs to organization
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found in your organization'
      });
    }

    // Assign roles
    const values = roleIds.map((roleId, i) =>
      `($1, $${i + 2}, $${roleIds.length + 2})`
    ).join(', ');

    await pool.query(`
      INSERT INTO user_roles (user_id, role_id, assigned_by)
      VALUES ${values}
      ON CONFLICT (user_id, role_id) DO NOTHING
    `, [userId, ...roleIds, req.user.id]);

    // Log action
    await pool.query(`
      INSERT INTO auth_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      req.user.id,
      'assign_roles',
      'user',
      userId,
      req.ip,
      req.headers['user-agent'],
      JSON.stringify({ roleIds })
    ]);

    res.json({
      success: true,
      message: 'Roles assigned successfully'
    });
  } catch (error) {
    console.error('Assign roles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign roles'
    });
  }
});

/**
 * GET /api/v1/roles/user/:userId
 * Get roles for a specific user
 */
router.get('/user/:userId', authenticateToken, requirePermission('users.read'), async (req, res) => {
  try {
    const { userId } = req.params;
    const organizationId = req.user.organizationId;

    const result = await pool.query(`
      SELECT
        r.id,
        r.name,
        r.description,
        r.is_system_role,
        ur.assigned_at,
        (SELECT full_name FROM users WHERE id = ur.assigned_by) as assigned_by_name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      AND (r.organization_id = $2 OR r.is_system_role = TRUE)
      ORDER BY r.is_system_role DESC, r.name
    `, [userId, organizationId]);

    // Get all permissions for this user
    const permissions = await getUserPermissions(userId, organizationId);

    res.json({
      success: true,
      data: {
        roles: result.rows,
        permissions
      }
    });
  } catch (error) {
    console.error('Get user roles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user roles'
    });
  }
});

export default router;
