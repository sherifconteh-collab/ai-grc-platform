import pool from '../config/database.js';

/**
 * RBAC Middleware - Check if user has required permission
 *
 * Usage:
 *   router.get('/controls', authenticateToken, requirePermission('controls.read'), getAllControls);
 *   router.post('/controls', authenticateToken, requirePermission('controls.write'), createControl);
 */
export const requirePermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const organizationId = req.user.organizationId;

      // Check if user has the required permission through their roles
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1
          AND (r.organization_id = $2 OR r.is_system_role = TRUE)
          AND p.name = $3
        ) as has_permission
      `, [userId, organizationId, requiredPermission]);

      const hasPermission = result.rows[0].has_permission;

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: You don't have permission to ${requiredPermission}`
        });
      }

      next();
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if user has ANY of the listed permissions
 */
export const requireAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const organizationId = req.user.organizationId;

      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1
          AND (r.organization_id = $2 OR r.is_system_role = TRUE)
          AND p.name = ANY($3)
        ) as has_permission
      `, [userId, organizationId, permissions]);

      const hasPermission = result.rows[0].has_permission;

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: You don't have any of the required permissions`
        });
      }

      next();
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if user has ALL of the listed permissions
 */
export const requireAllPermissions = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const organizationId = req.user.organizationId;

      // Get all permissions user has
      const result = await pool.query(`
        SELECT ARRAY_AGG(DISTINCT p.name) as user_permissions
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1
        AND (r.organization_id = $2 OR r.is_system_role = TRUE)
      `, [userId, organizationId]);

      const userPermissions = result.rows[0].user_permissions || [];
      const hasAllPermissions = permissions.every(p => userPermissions.includes(p));

      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: You need all of these permissions: ${permissions.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
};

/**
 * Get all permissions for a user (useful for frontend to show/hide UI elements)
 */
export const getUserPermissions = async (userId, organizationId) => {
  const result = await pool.query(`
    SELECT ARRAY_AGG(DISTINCT p.name) as permissions
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = $1
    AND (r.organization_id = $2 OR r.is_system_role = TRUE)
  `, [userId, organizationId]);

  return result.rows[0].permissions || [];
};

/**
 * Check if user has a specific role
 */
export const hasRole = async (userId, roleName, organizationId) => {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      AND r.name = $2
      AND (r.organization_id = $3 OR r.is_system_role = TRUE)
    ) as has_role
  `, [userId, roleName, organizationId]);

  return result.rows[0].has_role;
};
