import pool from '../config/database.js';

/**
 * Role Service - Handles role initialization and management
 */

// Default role definitions with their permissions
const DEFAULT_ROLES = {
  admin: {
    name: 'Admin',
    description: 'Full access to all features and settings',
    isSystemRole: true,
    permissions: [
      'controls.read', 'controls.write', 'controls.delete', 'controls.approve', 'controls.assign',
      'evidence.read', 'evidence.upload', 'evidence.delete', 'evidence.link',
      'frameworks.read', 'frameworks.select',
      'users.read', 'users.write', 'users.delete', 'users.assign_roles',
      'audit.read', 'audit.export',
      'dashboard.read',
      'settings.read', 'settings.write'
    ]
  },
  auditor: {
    name: 'Auditor',
    description: 'Read-only access with audit log export capabilities',
    isSystemRole: true,
    permissions: [
      'controls.read',
      'evidence.read',
      'frameworks.read',
      'users.read',
      'audit.read', 'audit.export',
      'dashboard.read',
      'settings.read'
    ]
  },
  implementer: {
    name: 'Implementer',
    description: 'Can manage controls and upload evidence',
    isSystemRole: true,
    permissions: [
      'controls.read', 'controls.write',
      'evidence.read', 'evidence.upload', 'evidence.link',
      'frameworks.read',
      'dashboard.read'
    ]
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access to dashboards and controls',
    isSystemRole: true,
    permissions: [
      'controls.read',
      'evidence.read',
      'frameworks.read',
      'dashboard.read'
    ]
  }
};

/**
 * Initialize default roles for a new organization
 * @param {string} organizationId - The organization UUID
 * @param {string} adminUserId - The admin user UUID who should get the Admin role
 */
export const initializeOrganizationRoles = async (organizationId, adminUserId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get all permission IDs
    const permissionsResult = await client.query('SELECT id, name FROM permissions');
    const permissionMap = {};
    permissionsResult.rows.forEach(p => {
      permissionMap[p.name] = p.id;
    });

    // Create each default role
    for (const [roleKey, roleDef] of Object.entries(DEFAULT_ROLES)) {
      // Create the role
      const roleResult = await client.query(`
        INSERT INTO roles (organization_id, name, description, is_system_role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (organization_id, name) DO UPDATE SET
          description = EXCLUDED.description,
          is_system_role = EXCLUDED.is_system_role
        RETURNING id
      `, [organizationId, roleDef.name, roleDef.description, roleDef.isSystemRole]);

      const roleId = roleResult.rows[0].id;

      // Assign permissions to the role
      for (const permName of roleDef.permissions) {
        const permId = permissionMap[permName];
        if (permId) {
          await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES ($1, $2)
            ON CONFLICT (role_id, permission_id) DO NOTHING
          `, [roleId, permId]);
        }
      }

      // If this is the Admin role and we have an admin user, assign it
      if (roleKey === 'admin' && adminUserId) {
        await client.query(`
          INSERT INTO user_roles (user_id, role_id, assigned_by)
          VALUES ($1, $2, $1)
          ON CONFLICT (user_id, role_id) DO NOTHING
        `, [adminUserId, roleId]);
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing organization roles:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Assign a role to a user
 * @param {string} userId - The user UUID
 * @param {string} roleName - The role name (e.g., 'Admin', 'Viewer')
 * @param {string} organizationId - The organization UUID
 * @param {string} assignedBy - The user who is assigning the role
 */
export const assignRoleToUser = async (userId, roleName, organizationId, assignedBy) => {
  const roleResult = await pool.query(`
    SELECT id FROM roles
    WHERE name = $1 AND organization_id = $2
  `, [roleName, organizationId]);

  if (roleResult.rows.length === 0) {
    throw new Error(`Role '${roleName}' not found for organization`);
  }

  await pool.query(`
    INSERT INTO user_roles (user_id, role_id, assigned_by)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, role_id) DO NOTHING
  `, [userId, roleResult.rows[0].id, assignedBy]);
};

/**
 * Get all roles for a user
 * @param {string} userId - The user UUID
 * @param {string} organizationId - The organization UUID
 */
export const getUserRoles = async (userId, organizationId) => {
  const result = await pool.query(`
    SELECT
      r.id,
      r.name,
      r.description,
      r.is_system_role
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1 AND r.organization_id = $2
  `, [userId, organizationId]);

  return result.rows;
};

/**
 * Get all permissions for a user (from all their roles)
 * @param {string} userId - The user UUID
 * @param {string} organizationId - The organization UUID
 */
export const getUserPermissions = async (userId, organizationId) => {
  const result = await pool.query(`
    SELECT DISTINCT p.name
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = $1 AND r.organization_id = $2
  `, [userId, organizationId]);

  return result.rows.map(r => r.name);
};

export default {
  initializeOrganizationRoles,
  assignRoleToUser,
  getUserRoles,
  getUserPermissions
};
