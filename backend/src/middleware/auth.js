const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// ---------------------------------------------------------------------------
// Community-edition role → permission mapping (fallback when RBAC tables
// such as user_roles, roles, role_permissions, permissions do not exist).
// ---------------------------------------------------------------------------
const ROLE_PERMISSIONS = {
  admin: ['*'],
  isse: [
    'controls.*', 'assessments.*', 'frameworks.*', 'implementations.*',
    'ai.*', 'policies.*', 'poam.*', 'audit.read'
  ],
  auditor: ['*.read', 'assessments.write'],
  read_only: ['*.read']
};

/**
 * Check whether a single granted pattern covers the requested permission.
 * Supports exact match, wildcard-all ('*'), resource wildcard ('controls.*'),
 * and action wildcard ('*.read').
 */
function permissionMatches(granted, requested) {
  if (granted === '*') return true;
  if (granted === requested) return true;

  const [gResource, gAction] = granted.split('.');
  const [rResource, rAction] = requested.split('.');

  if (gResource === '*' && gAction === rAction) return true;
  if (gAction === '*' && gResource === rResource) return true;

  return false;
}

function roleHasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['read_only'] || [];
  return perms.some(p => permissionMatches(p, permission));
}

// Cache flag so we only probe the DB once per process lifetime.
let _rbacTablesExist = null;

async function rbacTablesExist() {
  if (_rbacTablesExist !== null) return _rbacTablesExist;
  try {
    await pool.query(
      `SELECT 1 FROM user_roles
       JOIN roles ON roles.id = user_roles.role_id
       JOIN role_permissions ON role_permissions.role_id = roles.id
       JOIN permissions ON permissions.id = role_permissions.permission_id
       LIMIT 0`
    );
    _rbacTablesExist = true;
  } catch {
    _rbacTablesExist = false;
  }
  return _rbacTablesExist;
}

// ---------------------------------------------------------------------------
// authenticate – JWT verification, sets req.user
// ---------------------------------------------------------------------------
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'access') {
      return res.status(401).json({ success: false, error: 'Invalid token type' });
    }

    const result = await pool.query(
      'SELECT id, email, organization_id, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'User not found or inactive' });
    }

    const user = result.rows[0];
    req.user = {
      id: user.id,
      email: user.email,
      organization_id: user.organization_id,
      role: user.role,
      organizationId: user.organization_id
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    next(error);
  }
};

// Backward-compatible alias
const authenticateToken = authenticate;

// ---------------------------------------------------------------------------
// requirePermission – checks a single 'resource.action' permission string
// ---------------------------------------------------------------------------
const requirePermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const organizationId = req.user.organizationId;

      if (await rbacTablesExist()) {
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

        if (result.rows[0].has_permission) return next();
      }

      // Fallback to role-based mapping
      if (roleHasPermission(req.user.role, requiredPermission)) return next();

      return res.status(403).json({
        success: false,
        error: `Forbidden: You don't have permission to ${requiredPermission}`
      });
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

// ---------------------------------------------------------------------------
// requireAnyPermission – passes if user has ANY of the listed permissions
// ---------------------------------------------------------------------------
const requireAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const organizationId = req.user.organizationId;

      if (await rbacTablesExist()) {
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

        if (result.rows[0].has_permission) return next();
      }

      // Fallback to role-based mapping
      if (permissions.some(p => roleHasPermission(req.user.role, p))) return next();

      return res.status(403).json({
        success: false,
        error: "Forbidden: You don't have any of the required permissions"
      });
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

// ---------------------------------------------------------------------------
// requireAllPermissions – passes only if user has ALL listed permissions
// ---------------------------------------------------------------------------
const requireAllPermissions = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const organizationId = req.user.organizationId;

      if (await rbacTablesExist()) {
        const result = await pool.query(`
          SELECT ARRAY_AGG(DISTINCT p.name) as user_permissions
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1
          AND (r.organization_id = $2 OR r.is_system_role = TRUE)
        `, [userId, organizationId]);

        const userPerms = result.rows[0].user_permissions || [];
        if (permissions.every(p => userPerms.includes(p))) return next();
      }

      // Fallback to role-based mapping
      if (permissions.every(p => roleHasPermission(req.user.role, p))) return next();

      return res.status(403).json({
        success: false,
        error: `Forbidden: You need all of these permissions: ${permissions.join(', ')}`
      });
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

// ---------------------------------------------------------------------------
// requireRole – backward-compatible role check
// ---------------------------------------------------------------------------
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
};

// ---------------------------------------------------------------------------
// requireTier – community edition stub (always passes)
// ---------------------------------------------------------------------------
const requireTier = (_tier) => {
  return (_req, _res, next) => next();
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
const getUserPermissions = async (userId, organizationId) => {
  if (await rbacTablesExist()) {
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
  }
  return [];
};

const hasRole = async (userId, roleName, organizationId) => {
  if (await rbacTablesExist()) {
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
  }
  return false;
};

module.exports = {
  authenticate,
  authenticateToken,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireRole,
  requireTier,
  getUserPermissions,
  hasRole
};
