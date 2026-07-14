// @tier: community
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { JWT_SECRET, JWT_VERIFY_OPTIONS } = require('../config/security');
const { decrypt } = require('../utils/encrypt');
const {
  TIER_LEVELS,
  normalizeTier,
  tierLevel,
  canUseCmdb,
  getCmdbAssetLimit
} = require('../config/tierPolicy');
const { expireOrganizationTrialIfNeeded } = require('../services/subscriptionService');

// In-memory cache for global feature flags (refreshed every 60s)
let _featureFlagsCache = { data: null, ts: 0 };
let _hasOrgFeatureOverridesColumn = null;

const PLATFORM_OWNER_EMAILS = new Set(
  String(process.env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const ROLE_FALLBACK_PERMISSIONS = new Map([
  ['admin', ['*']],
  ['auditor', [
    'dashboard.read',
    'frameworks.read',
    'organizations.read',
    'users.read',
    'controls.read',
    'implementations.read',
    'evidence.read',
    'assets.read',
    'environments.read',
    'service_accounts.read',
    'audit.read',
    'audit.write',
    'reports.read',
    'assessments.read',
    'assessments.write',
    'notifications.read',
    'ai.use',
    'ai.read',
    'compliance.read',
    'compliance.manage'
  ]],
  ['user', [
    'dashboard.read',
    'frameworks.read',
    'organizations.read',
    'controls.read',
    'controls.write',
    'implementations.read',
    'implementations.write',
    'evidence.read',
    'evidence.write',
    'assets.read',
    'assets.write',
    'environments.read',
    'environments.write',
    'service_accounts.read',
    'service_accounts.write',
    'assessments.read',
    'assessments.write',
    'notifications.read',
    'notifications.write',
    'ai.use',
    'ai.read',
    'ai.write',
    'reports.read',
    'reports.manage',
    'compliance.read',
    'compliance.manage'
  ]]
]);

function getRoleFallbackPermissions(roleName) {
  return ROLE_FALLBACK_PERMISSIONS.get(roleName) || ROLE_FALLBACK_PERMISSIONS.get('user');
}

function resolveEffectiveTier(featureOverrides, organizationTier) {
  const override = typeof featureOverrides?.tier_override === 'string'
    ? normalizeTier(featureOverrides.tier_override)
    : null;

  if (override && Object.prototype.hasOwnProperty.call(TIER_LEVELS, override)) {
    return override;
  }

  return normalizeTier(organizationTier || 'community');
}

function toFeatureFlagMap(flags) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
    return new Map();
  }

  return new Map(Object.entries(flags));
}

async function hasOrgFeatureOverridesColumn() {
  if (_hasOrgFeatureOverridesColumn !== null) {
    return _hasOrgFeatureOverridesColumn;
  }

  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'organizations'
         AND column_name = 'feature_overrides'
       LIMIT 1`
    );
    _hasOrgFeatureOverridesColumn = result.rows.length > 0;
  } catch (_error) {
    _hasOrgFeatureOverridesColumn = false;
  }

  return _hasOrgFeatureOverridesColumn;
}

/**
 * Authenticate JWT token and attach user/org to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);

      const includeFeatureOverrides = await hasOrgFeatureOverridesColumn();
      const featureOverridesSelect = includeFeatureOverrides
        ? `COALESCE(o.feature_overrides, '{}'::jsonb) as feature_overrides`
        : `'{}'::jsonb as feature_overrides`;

      // Fetch user and organization details (including feature_overrides when available)
      const userResult = await pool.query(`
        SELECT
          u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
          COALESCE(u.is_platform_admin, false) AS is_platform_admin,
          u.organization_id,
          o.name as organization_name, o.tier as organization_tier,
          o.billing_status as organization_billing_status,
          o.trial_status as organization_trial_status,
          o.trial_started_at as organization_trial_started_at,
          o.trial_ends_at as organization_trial_ends_at,
          ${featureOverridesSelect}
        FROM users u
        LEFT JOIN organizations o ON u.organization_id = o.id
        WHERE u.id = $1
      `, [decoded.userId]);

      if (userResult.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'User not found or inactive' });
      }

      req.user = userResult.rows[0];
      req.user.email = decrypt(req.user.email);

      if (!Boolean(req.user.is_platform_admin) && !req.user.is_active) {
        return res.status(401).json({ success: false, error: 'User not found or inactive' });
      }

      if (!Boolean(req.user.is_platform_admin) && !req.user.organization_id) {
        return res.status(401).json({ success: false, error: 'User organization is missing' });
      }

      // Open source: no trial expiry demotion

      // Load global feature flags from platform_settings (cached 60s)
      let globalFeatureFlags = {};
      try {
        const now = Date.now();
        if (!_featureFlagsCache.data || (now - _featureFlagsCache.ts) > 60000) {
          const flagsResult = await pool.query(
            `SELECT setting_value FROM platform_settings WHERE setting_key = 'feature_flags' LIMIT 1`
          );
          let parsed = {};
          if (flagsResult.rows.length > 0 && flagsResult.rows[0].setting_value) {
            parsed = typeof flagsResult.rows[0].setting_value === 'string'
              ? JSON.parse(flagsResult.rows[0].setting_value)
              : flagsResult.rows[0].setting_value;
            if (!parsed || typeof parsed !== 'object') parsed = {};
          }
          _featureFlagsCache = { data: parsed, ts: now };
        }
        globalFeatureFlags = _featureFlagsCache.data;
      } catch (_flagErr) {
        // Non-fatal — proceed with empty flags
      }
      req.user.global_feature_flags = globalFeatureFlags;

      // Resolve effective tier (tier_override from feature_overrides takes precedence)
      const featureOverrides = typeof req.user.feature_overrides === 'string'
        ? JSON.parse(req.user.feature_overrides)
        : (req.user.feature_overrides || {});
      req.user.feature_overrides = featureOverrides;

      const effectiveTier = resolveEffectiveTier(featureOverrides, req.user.organization_tier);
      req.user.effective_tier = effectiveTier;
      // Also update organization_tier so existing requireTier()/checkTierLimit() helpers
      // respect the override server-side
      req.user.organization_tier = effectiveTier;

      try {
        const roleNamesResult = await pool.query(`
          SELECT r.name
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1
        `, [req.user.id]);

        const permissionResult = await pool.query(`
          SELECT DISTINCT p.name
          FROM user_roles ur
          JOIN role_permissions rp ON rp.role_id = ur.role_id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = $1
        `, [req.user.id]);

        // The legacy-role fallback is a true fallback: it only applies when the
        // user has zero rows in role_permissions (accounts never migrated onto
        // the roles/user_roles system). When real role_permissions rows exist,
        // they are used exclusively — unconditionally unioning the fallback on
        // top defeats any custom role that intentionally restricts below the
        // legacy-role floor (e.g. an auditor_observer role that strips
        // assessments.write would silently get it back via the 'auditor'
        // fallback if this stayed unconditional).
        const resolvedPermissions = permissionResult.rows.length > 0
          ? new Set(permissionResult.rows.map((row) => row.name))
          : new Set(getRoleFallbackPermissions(req.user.role));

        if (req.user.role === 'admin') {
          resolvedPermissions.add('*');
        }

        const resolvedRoles = new Set([
          req.user.role,
          ...roleNamesResult.rows.map((row) => row.name)
        ]);

        req.user.roles = Array.from(resolvedRoles);
        req.user.permissions = Array.from(resolvedPermissions);
      } catch (authzError) {
        // Roles/permissions may not exist yet in bootstrap states.
        const fallbackPermissions = getRoleFallbackPermissions(req.user.role);
        req.user.roles = [req.user.role];
        req.user.permissions = req.user.role === 'admin'
          ? ['*']
          : fallbackPermissions;
      }

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Token expired' });
      }
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
};

/**
 * Require minimum tier level for access
 */
const requireTier = (_minTier) => {
  return (_req, _res, next) => next();
};

/**
 * Check if feature is available for user's tier
 */
const checkTierLimit = (_req, _res, next) => next();

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

function isPlatformOwner(req) {
  if (Boolean(req.user?.is_platform_admin)) return true;
  if (PLATFORM_OWNER_EMAILS.size === 0) return false;
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  return PLATFORM_OWNER_EMAILS.has(userEmail);
}

const requirePlatformOwner = (req, res, next) => {
  if (!isPlatformOwner(req)) {
    return res.status(403).json({
      success: false,
      error: 'Platform owner access required'
    });
  }
  next();
};

function hasPermission(req, permissionName) {
  const permissions = req.user?.permissions || [];
  return permissions.includes('*') || permissions.includes(permissionName);
}

const requirePermission = (permissionName) => {
  return (req, res, next) => {
    if (!hasPermission(req, permissionName)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        requiredPermission: permissionName
      });
    }
    next();
  };
};

const requireAnyPermission = (permissionNames) => {
  return (req, res, next) => {
    const allowed = permissionNames.some((permissionName) => hasPermission(req, permissionName));
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        requiredAnyOf: permissionNames
      });
    }
    next();
  };
};

/**
 * Check if a named feature is enabled for the current request.
 * Resolution priority (evaluated in this order):
 *   1. Per-org force ON override → enabled
 *   2. Global flag OFF → blocked (if no per-org force ON)
 *   3. Per-org force OFF override → disabled
 *   4. Default → enabled
 */
function isFeatureEnabled(req, featureName) {
  const globalFlags = toFeatureFlagMap(req.user?.global_feature_flags);
  const orgFeatures = toFeatureFlagMap(req.user?.feature_overrides?.features);

  // Per-org override beats global (force-on wins even if global is off)
  if (orgFeatures.get(featureName) === true) return true;

  // Global OFF blocks everyone without an org override
  if (globalFlags.get(featureName) === false) return false;

  // Per-org force OFF
  if (orgFeatures.get(featureName) === false) return false;

  return true;
}

/** Invalidate the in-memory feature flags cache (called when admin updates flags). */
function invalidateFeatureFlagsCache() {
  _featureFlagsCache = { data: null, ts: 0 };
}

module.exports = {
  authenticate,
  requireTier,
  checkTierLimit,
  requireAdmin,
  isPlatformOwner,
  requirePlatformOwner,
  requirePermission,
  requireAnyPermission,
  isFeatureEnabled,
  invalidateFeatureFlagsCache,
  TIER_LEVELS
};
