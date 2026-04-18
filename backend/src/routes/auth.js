// @tier: community
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createHash, randomBytes } = require('crypto');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { validateBody, requireFields, sanitizeInput, isUuid } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { JWT_SECRET, SECURITY_CONFIG } = require('../config/security');

// ---------------------------------------------------------------------------
// Security constants — raised in v3.0.0
// ---------------------------------------------------------------------------
// bcrypt cost factor for new password hashes. Existing hashes at lower cost
// continue to verify successfully; on a successful login we re-hash lazily
// so the user is silently upgraded to the new cost.
const BCRYPT_COST = 14;

// JWT verification is pinned to HS256 only. Tokens signed with any other
// algorithm are rejected (defends against algorithm-confusion attacks).
const JWT_VERIFY_OPTIONS = Object.freeze({ algorithms: ['HS256'] });

/**
 * Returns the bcrypt cost embedded in a hash string, or null if it cannot be
 * determined. bcrypt hashes have the form `$2a$<cost>$...`.
 */
function getBcryptCost(hash) {
  if (typeof hash !== 'string') return null;
  const m = /^\$2[abxy]\$(\d{2})\$/.exec(hash);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * If the stored hash is below the current BCRYPT_COST, transparently re-hash
 * the password and update the user's row. Errors are swallowed so an upgrade
 * failure can never block a legitimate login.
 */
async function maybeUpgradePasswordHash(userId, plaintext, currentHash) {
  try {
    const cost = getBcryptCost(currentHash);
    if (cost !== null && cost >= BCRYPT_COST) return;
    const newHash = await bcrypt.hash(plaintext, BCRYPT_COST);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
  } catch (_e) {
    // intentional no-op: upgrade is best-effort
  }
}
let getTrialSeedData = () => ({
  tier: 'community',
  billingStatus: 'community',
  trialSourceTier: 'community',
  trialDays: 0,
  trialStatus: 'none'
});
let expireOrganizationTrialIfNeeded = async () => false;
let ensureOrgFrameworks = async () => {};
try {
  ({
    getTrialSeedData,
    expireOrganizationTrialIfNeeded,
    ensureOrgFrameworks
  } = require('../services/subscriptionService'));
} catch (_err) {
  // Optional in the public/community repo.
}
const { sendPasswordResetEmail } = require('../services/emailService');
let getGeolocationFromRequest = () => ({});
let extractIpFromRequest = (req) => {
  if (!req) return null;
  const xForwardedFor = req.headers && req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.length > 0) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
};
try {
  ({ getGeolocationFromRequest, extractIpFromRequest } = require('../services/geolocationService'));
} catch (_err) {
  // Optional in the public/community repo.
}
const { createAuditLog } = require('../services/auditService');
const { isDemoEmail } = require('../../scripts/lib/demo-account-config');
const { verifyTOTP } = require('../utils/totp');
const { decrypt, encrypt, hashForLookup } = require('../utils/encrypt');
const { log } = require('../utils/logger');
const { hasPublicColumn } = require('../utils/schema');
const {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPLEXITY_ERROR_MESSAGE,
  hasRequiredPasswordComplexity
} = require('../utils/passwordPolicy');

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const DEMO_SESSION_EXPIRY = process.env.JWT_DEMO_SESSION_EXPIRY || '8h';
const ALLOWED_INITIAL_ROLES = new Set(['admin', 'auditor', 'user']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_REGISTER_FRAMEWORK_CODES = 20;
const NIST_800_53_FRAMEWORK_CODE = 'nist_800_53';
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
const AUTH_TOTP_COLUMNS = ['totp_enabled', 'totp_secret', 'totp_backup_codes'];
let loggedMissingAuthTotpColumns = false;
// email_hash column availability — checked once per process lifetime for backward compat
let authEmailHashColumnAvailable = null;

function getIpRateLimitKey(req) {
  return ipKeyGenerator(extractIpFromRequest(req) || 'unknown');
}

const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  label: 'auth-forgot-password'
});
const resetPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  label: 'auth-reset-password'
});
const myOrgsLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  label: 'auth-my-organizations',
  keyGenerator: (req) => req.user?.id || req.ip
});
const switchOrgLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  label: 'auth-switch-organization',
  keyGenerator: (req) => req.user?.id || req.ip
});

// Broad rate limiter applied via router.use() so that CodeQL can statically
// verify that every route in this file is rate-limited.  Per-route limiters
// below impose stricter limits on sensitive endpoints.
const authBroadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIpRateLimitKey,
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});
router.use(authBroadLimiter);

// Explicit express-rate-limit instances for stricter per-endpoint limits on
// sensitive auth routes.
const authRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIpRateLimitKey,
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});
const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIpRateLimitKey,
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});
const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIpRateLimitKey,
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});
const authGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getIpRateLimitKey,
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});

const VALID_INFORMATION_TYPES = new Set([
  'pii',
  'phi',
  'pci',
  'cui',
  'fci',
  'financial',
  'operational',
  'ip',
  'public',
  'internal',
  'confidential',
  'restricted'
]);

function normalizeFrameworkCodes(rawValue) {
  if (!Array.isArray(rawValue)) return [];
  const normalized = rawValue
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized)).slice(0, MAX_REGISTER_FRAMEWORK_CODES);
}

function normalizeInformationTypes(rawValue) {
  if (!Array.isArray(rawValue)) return [];
  const normalized = Array.from(
    new Set(
      rawValue
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    )
  );
  const invalid = normalized.filter((entry) => !VALID_INFORMATION_TYPES.has(entry));
  if (invalid.length > 0) {
    const error = new Error(`Unknown information_types values: ${invalid.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

async function assignUserRole(client, userId, userRoleName) {
  const roleLookup = await client.query(
    `SELECT id
     FROM roles
     WHERE name = $1
       AND is_system_role = true
     LIMIT 1`,
    [userRoleName]
  );

  if (roleLookup.rows.length === 0) {
    return;
  }

  await client.query(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, roleLookup.rows[0].id]
  );
}

/**
 * Parse a jsonwebtoken/ms-style duration string (for example 15m, 7 days, 1.5h)
 * into whole seconds. Invalid values fail fast so operators notice config
 * problems instead of silently getting a different expiry window.
 *
 * @param {string|number} value
 * @param {string} label
 * @returns {number}
 */
function parseDurationToSeconds(value, label) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }

  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d*\.?\d+)\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)$/i);
  if (!match) {
    throw new Error(
      `[auth] Invalid ${label}="${normalized}". Use a positive jsonwebtoken/ms-style duration such as "15m", "1.5h", or "7 days".`
    );
  }

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const millisecondsPerUnit = {
    ms: 1,
    msec: 1,
    msecs: 1,
    millisecond: 1,
    milliseconds: 1,
    s: 1000,
    sec: 1000,
    secs: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    mins: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hrs: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    y: 365.25 * 24 * 60 * 60 * 1000,
    yr: 365.25 * 24 * 60 * 60 * 1000,
    yrs: 365.25 * 24 * 60 * 60 * 1000,
    year: 365.25 * 24 * 60 * 60 * 1000,
    years: 365.25 * 24 * 60 * 60 * 1000
  };

  const totalMilliseconds = amount * millisecondsPerUnit[unit];
  if (!Number.isFinite(totalMilliseconds) || totalMilliseconds <= 0) {
    throw new Error(
      `[auth] Invalid ${label}="${normalized}". Duration must resolve to a positive time span.`
    );
  }

  return Math.max(1, Math.floor(totalMilliseconds / 1000));
}

const ACCESS_EXPIRY_SECONDS = parseDurationToSeconds(ACCESS_EXPIRY, 'JWT_ACCESS_EXPIRY');
const REFRESH_EXPIRY_SECONDS = parseDurationToSeconds(REFRESH_EXPIRY, 'JWT_REFRESH_EXPIRY');
const DEMO_SESSION_EXPIRY_SECONDS = parseDurationToSeconds(DEMO_SESSION_EXPIRY, 'JWT_DEMO_SESSION_EXPIRY');

/**
 * Resolve the absolute session expiration timestamp used for the current login.
 *
 * @param {boolean} isDemoAccount
 * @param {string|null} sessionExpiresAt
 * @returns {string}
 */
function resolveSessionExpiryTimestamp(isDemoAccount, sessionExpiresAt = null) {
  if (sessionExpiresAt) {
    return sessionExpiresAt;
  }

  const durationSeconds = isDemoAccount ? DEMO_SESSION_EXPIRY_SECONDS : REFRESH_EXPIRY_SECONDS;
  return new Date(Date.now() + durationSeconds * 1000).toISOString();
}

/**
 * Build an access token for the user.
 * Demo tokens include the absolute session cutoff and are capped to the
 * remaining session lifetime so refresh cannot extend the demo window.
 *
 * @param {string} userId
 * @param {string|null} sessionExpiresAt
 * @returns {string}
 */
function buildAccessToken(userId, sessionExpiresAt = null) {
  const payload = { userId, type: 'access' };
  let expiresIn = ACCESS_EXPIRY_SECONDS;

  if (sessionExpiresAt) {
    payload.session_expires_at = sessionExpiresAt;
    const remainingSeconds = Math.floor((new Date(sessionExpiresAt).getTime() - Date.now()) / 1000);
    if (remainingSeconds <= 0) {
      throw new Error('Demo session expired');
    }
    expiresIn = Math.max(1, Math.min(ACCESS_EXPIRY_SECONDS, remainingSeconds));
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Generate access and refresh tokens with demo-aware expiry handling.
 * Returns the tokens plus the absolute session expiration timestamp used to
 * persist the corresponding session row.
 *
 * @param {string} userId
 * @param {{ isDemoAccount?: boolean, sessionExpiresAt?: string|null }} options
 * @returns {{ accessToken: string, refreshToken: string, sessionExpiresAt: string }}
 */
function generateSessionTokens(userId, { isDemoAccount = false, sessionExpiresAt = null } = {}) {
  const resolvedSessionExpiresAt = resolveSessionExpiryTimestamp(isDemoAccount, sessionExpiresAt);

  const accessToken = buildAccessToken(userId, isDemoAccount ? resolvedSessionExpiresAt : null);
  const refreshPayload = { userId, type: 'refresh' };
  const refreshExpiresIn = isDemoAccount
    ? Math.max(1, Math.floor((new Date(resolvedSessionExpiresAt).getTime() - Date.now()) / 1000))
    : REFRESH_EXPIRY_SECONDS;

  if (isDemoAccount) {
    refreshPayload.session_expires_at = resolvedSessionExpiresAt;
  }

  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, { expiresIn: refreshExpiresIn });
  return { accessToken, refreshToken, sessionExpiresAt: resolvedSessionExpiresAt };
}

function hashRefreshToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function hashPasswordResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || '').trim());
}

function trimToLength(value, maxLength) {
  const normalized = String(value || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function deriveOrganizationName({ organizationName, fullName, email, role }) {
  const provided = trimToLength(organizationName, 255);
  if (provided.length > 0) {
    return provided;
  }

  const fullNameBase = String(fullName || '').trim();
  const emailLocalPart = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9._-]+/g, ' ')
    .trim();
  const identity = fullNameBase || emailLocalPart || 'New';

  if (role === 'auditor') {
    return trimToLength(`${identity} Auditor Workspace`, 255);
  }

  return trimToLength(`${identity} Workspace`, 255);
}

async function getUserByEmail(email) {
  // Check email_hash column availability once per process lifecycle
  if (authEmailHashColumnAvailable === null) {
    authEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
    if (!authEmailHashColumnAvailable) {
      log('warn', 'auth.email_hash_column_missing', {
        message: 'email_hash column not present — email field-level encryption inactive. Apply migration 101 to enable.'
      });
    }
  }

  const totpColumnChecks = await Promise.all(
    AUTH_TOTP_COLUMNS.map(async (columnName) => [columnName, await hasPublicColumn('users', columnName)])
  );
  const missingTotpColumns = totpColumnChecks
    .filter(([, present]) => !present)
    .map(([columnName]) => columnName);

  if (missingTotpColumns.length > 0 && !loggedMissingAuthTotpColumns) {
    loggedMissingAuthTotpColumns = true;
    log('warn', 'auth.totp_columns_missing', {
      missingColumns: missingTotpColumns,
      message: 'Skipping TOTP enforcement until the latest database migrations are applied.'
    });
  }

  const totpSelect = missingTotpColumns.length === 0
    ? `COALESCE(u.totp_enabled, false) as totp_enabled,
            u.totp_secret,
            u.totp_backup_codes`
    : `false as totp_enabled,
            NULL::text as totp_secret,
            NULL::jsonb as totp_backup_codes`;

  const selectCols = `u.id, u.email, u.password_hash, u.first_name, u.last_name, u.role, u.is_active,
            u.failed_login_attempts, u.locked_until,
            COALESCE(u.is_platform_admin, false) as is_platform_admin,
            u.organization_id, o.name as organization_name, o.tier as organization_tier,
            o.billing_status as organization_billing_status,
            o.trial_status as organization_trial_status,
            o.trial_started_at as organization_trial_started_at,
            o.trial_ends_at as organization_trial_ends_at,
            COALESCE(op.onboarding_completed, false) as onboarding_completed,
            ${totpSelect}`;

  const joins = `FROM users u
     LEFT JOIN organizations o ON u.organization_id = o.id
     LEFT JOIN organization_profiles op ON op.organization_id = o.id`;

  let user = null;
  let needsHashBackfill = false;

  if (authEmailHashColumnAvailable) {
    const emailHash = hashForLookup(email);
    // Primary lookup: by HMAC hash (encrypted rows)
    const hashResult = await pool.query(
      `SELECT ${selectCols} ${joins} WHERE u.email_hash = $1`,
      [emailHash]
    );
    if (hashResult.rows.length > 0) {
      user = hashResult.rows[0];
    } else {
      // Fallback: plain-text email for rows not yet migrated (email_hash IS NULL)
      const plainResult = await pool.query(
        `SELECT ${selectCols} ${joins} WHERE LOWER(u.email) = $1 AND u.email_hash IS NULL`,
        [email]
      );
      if (plainResult.rows.length > 0) {
        user = plainResult.rows[0];
        needsHashBackfill = true;
      }
    }

    if (user) {
      // Lazy backfill: encrypt email column AND set email_hash so future lookups use the fast path
      if (needsHashBackfill) {
        await pool.query(
          'UPDATE users SET email = $1, email_hash = $2 WHERE id = $3',
          [encrypt(email), emailHash, user.id]
        ).catch((err) => log('warn', 'auth.email_hash_backfill_failed', { userId: user.id, error: err.message }));
      }
      // Decrypt email field (gracefully handles legacy plain-text values)
      user.email = decrypt(user.email);
    }
  } else {
    // Migration 101 not yet applied — plain-text lookup
    const result = await pool.query(
      `SELECT ${selectCols} ${joins} WHERE LOWER(u.email) = $1`,
      [email]
    );
    user = result.rows[0] || null;
  }

  return user;
}

async function getUserById(userId) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
            COALESCE(u.is_platform_admin, false) as is_platform_admin,
            u.organization_id, o.name as organization_name, o.tier as organization_tier,
            o.billing_status as organization_billing_status,
            o.trial_status as organization_trial_status,
            o.trial_started_at as organization_trial_started_at,
            o.trial_ends_at as organization_trial_ends_at,
            COALESCE(op.onboarding_completed, false) as onboarding_completed
     FROM users u
     LEFT JOIN organizations o ON u.organization_id = o.id
     LEFT JOIN organization_profiles op ON op.organization_id = o.id
     WHERE u.id = $1`,
    [userId]
  );

  const user = result.rows[0] || null;
  if (user) {
    user.email = decrypt(user.email);
  }
  return user;
}

async function resolveFrameworkIdsByCode(client, frameworkCodes) {
  if (!Array.isArray(frameworkCodes) || frameworkCodes.length === 0) {
    return [];
  }

  const result = await client.query(
    `SELECT id, code
     FROM frameworks
     WHERE is_active = true
       AND code = ANY($1::text[])`,
    [frameworkCodes]
  );

  const foundCodes = new Set(result.rows.map((row) => String(row.code || '').toLowerCase()));
  const missingCodes = frameworkCodes.filter((code) => !foundCodes.has(code));
  if (missingCodes.length > 0) {
    console.warn(`[auth.register] Ignoring unknown framework codes during signup: ${missingCodes.join(', ')}`);
  }

  return result.rows.map((row) => row.id);
}

// POST /auth/register
router.post('/register', authRegisterLimiter, validateBody((body) => requireFields(body, ['email', 'password', 'full_name'])), async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      organization_name,
      initial_role,
      initialRole,
      framework_codes,
      frameworkCodes,
      information_types,
      informationTypes
    } = req.body;
    const selectedRole = sanitizeInput(String(initial_role || initialRole || 'admin').toLowerCase());
    const normalizedEmail = sanitizeInput(String(email || '').trim().toLowerCase());
    const normalizedFullName = sanitizeInput(String(full_name || '').trim());
    const selectedFrameworkCodes = normalizeFrameworkCodes(framework_codes || frameworkCodes);
    const selectedInformationTypes = normalizeInformationTypes(information_types || informationTypes);

    if (!ALLOWED_INITIAL_ROLES.has(selectedRole)) {
      return res.status(400).json({
        success: false,
        error: 'initial_role must be one of: admin, auditor, user'
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }

    // Prevent self-registration with demo account domains
    if (isDemoEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Registration is not available for this email domain' });
    }

    if (!normalizedFullName) {
      return res.status(400).json({ success: false, error: 'Full name is required' });
    }

    if (String(password || '').length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      });
    }

    if (selectedFrameworkCodes.includes(NIST_800_53_FRAMEWORK_CODE) && selectedInformationTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NIST 800-53 registration requires at least one information type selection'
      });
    }

    // Check existing user (use email_hash for encrypted-email lookup when available,
    // with fallback to plain-text email for unmigrated rows)
    if (authEmailHashColumnAvailable === null) {
      authEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
    }
    const emailHash = authEmailHashColumnAvailable === false
      ? null
      : hashForLookup(normalizedEmail);
    if (emailHash) {
      // Check by hash first, then also check for unmigrated plain-text rows
      const existingByHash = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
      if (existingByHash.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
      const existingByPlain = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND email_hash IS NULL', [normalizedEmail]);
      if (existingByPlain.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
    } else {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const nameParts = normalizedFullName.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    const resolvedOrganizationName = deriveOrganizationName({
      organizationName: organization_name,
      fullName: normalizedFullName,
      email: normalizedEmail,
      role: selectedRole
    });

    const trialSeed = getTrialSeedData();

    // Get geolocation from IP for data sovereignty tracking
    const geo = getGeolocationFromRequest(req);
    const countryCode = geo?.country_code || null;
    const region = geo?.region || null;

    // Create org + user in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orgResult = await client.query(
        `INSERT INTO organizations (
           name, tier, billing_status, trial_source_tier,
           trial_started_at, trial_ends_at, trial_status, paid_tier,
           country_code, region
         )
         VALUES (
           $1, $2, $3, $4,
           NOW(), NOW() + ($5::text || ' days')::interval, $6, NULL,
           $7, $8
         )
         RETURNING
           id, name, tier, billing_status, trial_status, trial_started_at, trial_ends_at`,
        [
          resolvedOrganizationName,
          trialSeed.tier,
          trialSeed.billingStatus,
          trialSeed.trialSourceTier,
          trialSeed.trialDays,
          trialSeed.trialStatus,
          countryCode,
          region
        ]
      );
      const org = orgResult.rows[0];

      const storedEmail = emailHash ? encrypt(normalizedEmail) : normalizedEmail;
      const insertCols = emailHash
        ? 'organization_id, email, email_hash, password_hash, first_name, last_name, role, country_code, region'
        : 'organization_id, email, password_hash, first_name, last_name, role, country_code, region';
      const insertVals = emailHash
        ? [org.id, storedEmail, emailHash, passwordHash, firstName, lastName, selectedRole, countryCode, region]
        : [org.id, normalizedEmail, passwordHash, firstName, lastName, selectedRole, countryCode, region];
      const insertPlaceholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
      const userResult = await client.query(
        `INSERT INTO users (${insertCols})
         VALUES (${insertPlaceholders}) RETURNING id, email, first_name, last_name, role`,
        insertVals
      );
      const user = userResult.rows[0];
      // Always expose the plain-text email to the rest of the register handler
      user.email = normalizedEmail;

      // Record multi-org membership (idempotent)
      await client.query(
        `INSERT INTO user_organizations (user_id, organization_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [user.id, org.id, selectedRole]
      ).catch((e) => {
        // 42P01 = undefined_table — safe to ignore during first deploy before migration runs
        if (e.code === '42P01') return;
        log('error', 'auth.register.user_organizations_insert_failed', { error: e.message, code: e.code });
      });

      if (selectedFrameworkCodes.length > 0) {
        const frameworkIds = await resolveFrameworkIdsByCode(client, selectedFrameworkCodes);
        for (const frameworkId of frameworkIds) {
          await client.query(
            `INSERT INTO organization_frameworks (organization_id, framework_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [org.id, frameworkId]
          );
        }
      }

      const onboardingCompletedOnRegister = selectedRole !== 'admin';
      await client.query(
        `INSERT INTO organization_profiles (
           organization_id,
           data_sensitivity_types,
           onboarding_completed,
           onboarding_completed_at,
           created_by,
           updated_by,
           created_at,
           updated_at
         )
         VALUES (
           $1,
           $2::text[],
           $3,
           CASE WHEN $3 THEN NOW() ELSE NULL END,
           $4,
           $4,
           NOW(),
           NOW()
         )
         ON CONFLICT (organization_id) DO UPDATE SET
           data_sensitivity_types = CASE
             WHEN COALESCE(array_length(EXCLUDED.data_sensitivity_types, 1), 0) > 0
               THEN EXCLUDED.data_sensitivity_types
             ELSE organization_profiles.data_sensitivity_types
           END,
           onboarding_completed = organization_profiles.onboarding_completed OR EXCLUDED.onboarding_completed,
           onboarding_completed_at = CASE
             WHEN organization_profiles.onboarding_completed_at IS NOT NULL THEN organization_profiles.onboarding_completed_at
             WHEN organization_profiles.onboarding_completed OR EXCLUDED.onboarding_completed THEN NOW()
             ELSE NULL
           END,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [org.id, selectedInformationTypes, onboardingCompletedOnRegister, user.id]
      );

      await assignUserRole(client, user.id, selectedRole).catch(() => {});

      const isDemoAccount = isDemoEmail(user.email);
      const { accessToken, refreshToken, sessionExpiresAt } = generateSessionTokens(user.id, { isDemoAccount });

      // Store session
      await client.query(
        'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashRefreshToken(refreshToken), sessionExpiresAt]
      );

      await client.query('COMMIT');

      // Log registration event with geolocation for compliance
      createAuditLog({
        organizationId: org.id,
        userId: user.id,
        eventType: 'user.registered',
        resourceType: 'user',
        resourceId: user.id,
        details: {
          email: user.email,
          role: user.role,
          country_code: countryCode,
          region: region,
          organization_name: org.name
        },
        ipAddress: extractIpFromRequest(req),
        userAgent: req.headers['user-agent'],
        success: true,
        authenticationMethod: 'password'
      }).catch(err => console.error('Audit log error:', err));

      // Ensure all seeded frameworks the org is entitled to are adopted.
      // Fire-and-forget — does not block the registration response.
      ensureOrgFrameworks(org.id, org.tier).catch(err => console.error('ensureOrgFrameworks error:', err));

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: `${user.first_name} ${user.last_name}`.trim(),
            role: user.role,
            organization_id: org.id,
            is_demo_account: isDemoAccount
          },
          organization: {
            id: org.id,
            name: org.name,
            tier: org.tier,
            billing_status: org.billing_status,
            trial_status: org.trial_status,
            trial_started_at: org.trial_started_at,
            trial_ends_at: org.trial_ends_at,
            onboarding_completed: selectedRole !== 'admin',
            framework_codes: selectedFrameworkCodes,
            information_types: selectedInformationTypes
          },
          tokens: { accessToken, refreshToken }
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Register error:', error);
    const statusCode = Number(error.statusCode) || 500;
    const message = statusCode === 500 ? 'Registration failed' : String(error.message || 'Registration failed');
    res.status(statusCode).json({ success: false, error: message });
  }
});

// POST /auth/login
router.post('/login', authLoginLimiter, validateBody((body) => requireFields(body, ['email', 'password'])), async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = sanitizeInput(String(email || '').trim().toLowerCase());

    if (!isValidEmail(normalizedEmail)) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    let user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isPlatformAdmin = Boolean(user.is_platform_admin);
    const isDemoAccount = isDemoEmail(normalizedEmail);

    if (!isPlatformAdmin && !user.is_active) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }

    // Check account lockout — exempt platform admins and shared demo accounts
    const { lockoutMaxAttempts, lockoutDurationMs } = SECURITY_CONFIG;
    const lockoutExempt = isPlatformAdmin || isDemoAccount;
    if (!lockoutExempt && user.locked_until && new Date(user.locked_until) > new Date()) {
      const retryAfterSeconds = Math.ceil((new Date(user.locked_until) - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(423).json({
        success: false,
        error: 'Account temporarily locked due to too many failed login attempts',
        retryAfterSeconds
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      if (!lockoutExempt) {
        const newAttempts = (user.failed_login_attempts || 0) + 1;
        const shouldLock = newAttempts >= lockoutMaxAttempts;
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = $1,
               locked_until = CASE WHEN $2 THEN NOW() + ($3::bigint * INTERVAL '1 millisecond') ELSE locked_until END
           WHERE id = $4`,
          [newAttempts, shouldLock, lockoutDurationMs, user.id]
        );
      }
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Lazily upgrade legacy password hashes to current BCRYPT_COST. Best-effort.
    maybeUpgradePasswordHash(user.id, password, user.password_hash);

    // Reset lockout on successful password check and update region
    const geo = getGeolocationFromRequest(req);
    const countryCode = geo?.country_code || null;
    const region = geo?.region || null;
    
    if (user.failed_login_attempts > 0 || user.locked_until || countryCode) {
      await pool.query(
        `UPDATE users 
         SET failed_login_attempts = 0, 
             locked_until = NULL,
             country_code = COALESCE($2, country_code),
             region = COALESCE($3, region)
         WHERE id = $1`,
        [user.id, countryCode, region]
      );
    }

    if (!isPlatformAdmin && user.organization_id) {
      const trialExpired = await expireOrganizationTrialIfNeeded({
        organizationId: user.organization_id,
        actorUserId: user.id
      });
      if (trialExpired) {
        const refreshedUser = await getUserByEmail(normalizedEmail);
        if (refreshedUser) {
          user = refreshedUser;
        }
      }
    }

    // ─── TOTP verification ──────────────────────────────────────────────────
    // If the user has TOTP enabled, require a valid code before issuing tokens.
    // Platform admins and shared demo accounts are exempt.
    if (user.totp_enabled && !isPlatformAdmin && !isDemoAccount) {
      const { totp_code: totpCode } = req.body;
      if (!totpCode) {
        return res.status(200).json({
          success: false,
          totp_required: true,
          message: 'Enter the 6-digit code from your authenticator app to complete sign-in.'
        });
      }

      const totpSecret = user.totp_secret ? decrypt(user.totp_secret) : null;
      let totpValid = verifyTOTP(totpSecret, totpCode);

      if (!totpValid && Array.isArray(user.totp_backup_codes) && user.totp_backup_codes.length > 0) {
        const backupHashes = user.totp_backup_codes;
        let matchedIndex = -1;
        for (let i = 0; i < backupHashes.length; i++) {
          if (await bcrypt.compare(String(totpCode).trim(), backupHashes[i])) {
            matchedIndex = i;
            break;
          }
        }
        if (matchedIndex !== -1) {
          backupHashes.splice(matchedIndex, 1);
          await pool.query(
            `UPDATE users SET totp_backup_codes = $1 WHERE id = $2`,
            [JSON.stringify(backupHashes), user.id]
          );
          totpValid = true;
        }
      }

      if (!totpValid) {
        return res.status(401).json({ success: false, error: 'Invalid authenticator code. Please try again.' });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const { accessToken, refreshToken, sessionExpiresAt } = generateSessionTokens(user.id, { isDemoAccount });

    // Demo accounts are shared by many sales prospects who rarely log out.
    // Prune expired sessions before inserting to prevent table bloat.
    if (isDemoAccount) {
      await pool.query(
        'DELETE FROM sessions WHERE user_id = $1 AND expires_at < NOW()',
        [user.id]
      );
    }

    await pool.query(
      'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashRefreshToken(refreshToken), sessionExpiresAt]
    );

    // Log successful login with geolocation for compliance
    createAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      eventType: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      details: {
        email: user.email,
        country_code: countryCode,
        region: region
      },
      ipAddress: extractIpFromRequest(req),
      userAgent: req.headers['user-agent'],
      success: true,
      authenticationMethod: 'password'
    }).catch(err => console.error('Audit log error:', err));

    // Ensure all seeded frameworks the org is entitled to are adopted.
    // Fire-and-forget — does not block the login response.
    if (user.organization_id && user.organization_tier) {
      ensureOrgFrameworks(user.organization_id, user.organization_tier).catch(err => console.error('ensureOrgFrameworks error:', err));
    }

    res.json({
      success: true,
      data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: `${user.first_name} ${user.last_name}`.trim(),
            role: user.role,
            is_platform_admin: Boolean(user.is_platform_admin),
            organization_id: user.organization_id,
            is_demo_account: isDemoAccount
          },
        organization: {
          id: user.organization_id,
          name: user.organization_name,
          tier: user.organization_tier,
          billing_status: user.organization_billing_status,
          trial_status: user.organization_trial_status,
          trial_started_at: user.organization_trial_started_at,
          trial_ends_at: user.organization_trial_ends_at,
          onboarding_completed: Boolean(user.onboarding_completed)
        },
        tokens: { accessToken, refreshToken }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const email = sanitizeInput(String(req.body?.email || '').trim().toLowerCase());
    if (!isValidEmail(email)) {
      return res.json({ success: true, message: 'If an account exists, a password reset link has been sent.' });
    }

    // Shared demo accounts are used by multiple sales prospects simultaneously.
    // Block password resets to prevent one user from locking everyone else out.
    if (isDemoEmail(email)) {
      return res.json({ success: true, message: 'If an account exists, a password reset link has been sent.' });
    }

    // Ensure column availability is known before building query
    if (authEmailHashColumnAvailable === null) {
      authEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
    }
    const fpEmailHash = authEmailHashColumnAvailable !== false ? hashForLookup(email) : null;
    const fpQuery = fpEmailHash
      ? `SELECT id, email, first_name, last_name, is_active, organization_id FROM users WHERE email_hash = $1 LIMIT 1`
      : `SELECT id, email, first_name, last_name, is_active, organization_id FROM users WHERE LOWER(email) = $1 LIMIT 1`;
    let userResult = await pool.query(fpQuery, [fpEmailHash ?? email]);
    // Fallback for rows not yet migrated (email_hash IS NULL)
    if (userResult.rows.length === 0 && fpEmailHash) {
      userResult = await pool.query(
        `SELECT id, email, first_name, last_name, is_active, organization_id FROM users WHERE LOWER(email) = $1 AND email_hash IS NULL LIMIT 1`,
        [email]
      );
    }

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      return res.json({ success: true, message: 'If an account exists, a password reset link has been sent.' });
    }

    const user = userResult.rows[0];
    user.email = decrypt(user.email); // decrypt if stored as ciphertext
    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = hashPasswordResetToken(resetToken);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval)`,
      [user.id, tokenHash, PASSWORD_RESET_TOKEN_TTL_MINUTES]
    );

    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendBaseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
    await sendPasswordResetEmail({
      email: user.email,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      resetLink,
      orgId: user.organization_id || null
    }).catch((error) => {
      console.warn('Failed to send password reset email:', error.message);
    });

    return res.json({ success: true, message: 'If an account exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process forgot password request' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', resetPasswordLimiter, validateBody((body) => requireFields(body, ['token', 'password'])), async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const tokenHash = hashPasswordResetToken(token);
    const tokenResult = await pool.query(
      `SELECT prt.id, prt.user_id, u.email AS user_email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const resetTokenRow = tokenResult.rows[0];

    // Block password reset for shared demo accounts
    if (isDemoEmail(resetTokenRow.user_email)) {
      return res.status(403).json({ success: false, error: 'Password reset is not available for demo accounts' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             failed_login_attempts = 0,
             locked_until = NULL
         WHERE id = $2`,
        [passwordHash, resetTokenRow.user_id]
      );
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [resetTokenRow.id]
      );
      await client.query(
        'DELETE FROM sessions WHERE user_id = $1',
        [resetTokenRow.user_id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// POST /auth/refresh
router.post('/refresh', authRefreshLimiter, validateBody((body) => requireFields(body, ['refreshToken'])), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const decoded = jwt.verify(refreshToken, JWT_SECRET, JWT_VERIFY_OPTIONS);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, error: 'Invalid token type' });
    }

    const demoSessionExpiresAt = typeof decoded.session_expires_at === 'string'
      ? decoded.session_expires_at
      : null;
    if (demoSessionExpiresAt) {
      const remainingSeconds = Math.floor((new Date(demoSessionExpiresAt).getTime() - Date.now()) / 1000);
      if (remainingSeconds <= 0) {
        return res.status(401).json({ success: false, error: 'Demo session expired' });
      }
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);

    const session = await pool.query(
      `SELECT id, refresh_token
       FROM sessions
       WHERE user_id = $1
         AND expires_at > NOW()
         AND (refresh_token = $2 OR refresh_token = $3)`,
      [decoded.userId, refreshTokenHash, refreshToken]
    );

    if (session.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    // Backward compatibility for older plaintext refresh tokens.
    if (session.rows[0].refresh_token !== refreshTokenHash) {
      await pool.query(
        'UPDATE sessions SET refresh_token = $1 WHERE id = $2',
        [refreshTokenHash, session.rows[0].id]
      );
    }

    const accessToken = buildAccessToken(decoded.userId, demoSessionExpiresAt);

    res.json({ success: true, data: { accessToken } });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(401).json({ success: false, error: 'Token refresh failed' });
  }
});

// POST /auth/logout
router.post('/logout', authGeneralLimiter, authenticate, async (req, res) => {
  try {
    // Demo accounts are shared — only delete the caller's session, not all sessions
    if (isDemoEmail(req.user.email)) {
      const refreshToken = req.body?.refreshToken;
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'refreshToken is required for demo account logout'
        });
      }

      await pool.query(
        'DELETE FROM sessions WHERE user_id = $1 AND refresh_token = $2',
        [req.user.id, hashRefreshToken(refreshToken)]
      );
    } else {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
    }
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// GET /auth/me
router.get('/me', authGeneralLimiter, authenticate, async (req, res) => {
  try {
    await expireOrganizationTrialIfNeeded({
      organizationId: req.user.organization_id,
      actorUserId: req.user.id
    });

    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Values were hydrated by authenticate middleware (with fallback).
    const roles = req.user.roles || [user.role];
    const permissions = req.user.permissions || (user.role === 'admin' ? ['*'] : []);

    // Fetch selected framework codes so the frontend can gate RMF visibility
    let frameworkCodes = [];
    try {
      const fwResult = await pool.query(
        `SELECT f.code FROM organization_frameworks ofw
         JOIN frameworks f ON f.id = ofw.framework_id
         WHERE ofw.organization_id = $1`,
        [user.organization_id]
      );
      frameworkCodes = fwResult.rows.map(r => String(r.code || '').toLowerCase()).filter(Boolean);
    } catch (_fwErr) {
      // Non-critical — continue without framework codes
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: `${user.first_name} ${user.last_name}`.trim(),
        role: user.role,
        is_platform_admin: Boolean(user.is_platform_admin),
        is_demo_account: isDemoEmail(user.email),
        organization: {
          id: user.organization_id,
          name: user.organization_name,
          tier: user.organization_tier,
          effective_tier: req.user.effective_tier || user.organization_tier,
          billing_status: user.organization_billing_status,
          trial_status: user.organization_trial_status,
          trial_started_at: user.organization_trial_started_at,
          trial_ends_at: user.organization_trial_ends_at,
          onboarding_completed: Boolean(user.onboarding_completed),
          feature_overrides: req.user.feature_overrides || {},
          global_feature_flags: req.user.global_feature_flags || {},
          framework_codes: frameworkCodes
        },
        onboarding_required: !Boolean(user.onboarding_completed),
        roles,
        permissions
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// =========================================================================
// INVITE ACCEPTANCE — Unauthenticated endpoint for invited users
// =========================================================================

// ---------- GET /auth/invite/:token ----------
// Validate invite token and return pre-configured details (no auth required)
router.get('/invite/:token', authGeneralLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pool.query(`
      SELECT oi.id, oi.email, oi.primary_role, oi.role_ids, oi.status, oi.expires_at,
             o.name AS organization_name, o.tier AS organization_tier,
             CONCAT(u.first_name, ' ', u.last_name) AS invited_by_name
      FROM organization_invites oi
      JOIN organizations o ON o.id = oi.organization_id
      LEFT JOIN users u ON u.id = oi.invited_by
      WHERE oi.invite_token = $1
      LIMIT 1
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invite not found' });
    }

    const invite = result.rows[0];

    if (invite.status !== 'pending') {
      return res.status(410).json({ success: false, error: 'This invite has already been used or revoked' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This invite has expired' });
    }

    // Resolve role names for display
    let roleNames = [];
    if (invite.role_ids && invite.role_ids.length > 0) {
      const rolesResult = await pool.query(
        `SELECT name FROM roles WHERE id = ANY($1::uuid[])`,
        [invite.role_ids]
      );
      roleNames = rolesResult.rows.map((r) => r.name);
    }

    res.json({
      success: true,
      data: {
        email: invite.email,
        primary_role: invite.primary_role,
        role_names: roleNames,
        organization_name: invite.organization_name,
        organization_tier: invite.organization_tier,
        invited_by_name: invite.invited_by_name
      }
    });
  } catch (err) {
    console.error('Validate invite error:', err);
    res.status(500).json({ success: false, error: 'Failed to validate invite' });
  }
});

// ---------- POST /auth/accept-invite ----------
// Invited user completes signup with minimal info (name + password)
router.post('/accept-invite', authRegisterLimiter, validateBody((body) => {
  const errors = [];
  if (!body.token || typeof body.token !== 'string') errors.push('token is required');
  if (!body.full_name || typeof body.full_name !== 'string' || body.full_name.trim().length < 2) {
    errors.push('full_name is required (minimum 2 characters)');
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`password is required (minimum ${MIN_PASSWORD_LENGTH} characters)`);
  } else if (!hasRequiredPasswordComplexity(body.password)) {
    errors.push(PASSWORD_COMPLEXITY_ERROR_MESSAGE);
  }
  return errors;
}), async (req, res) => {
  try {
    const { token, full_name, password } = req.body;
    const normalizedFullName = sanitizeInput(String(full_name).trim());

    // Look up invite
    const inviteResult = await pool.query(`
      SELECT oi.id, oi.organization_id, oi.email, oi.primary_role, oi.role_ids,
             oi.status, oi.expires_at
      FROM organization_invites oi
      WHERE oi.invite_token = $1
      LIMIT 1
    `, [token]);

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invite not found' });
    }

    const invite = inviteResult.rows[0];

    if (invite.status !== 'pending') {
      return res.status(410).json({ success: false, error: 'This invite has already been used or revoked' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'This invite has expired' });
    }

    // Check email not already registered (use email_hash for encrypted-email lookup when available,
    // with fallback to plain-text email for unmigrated rows)
    const inviteEmailNorm = invite.email.toLowerCase();
    if (authEmailHashColumnAvailable === null) {
      authEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
    }
    const inviteEmailHash = authEmailHashColumnAvailable !== false ? hashForLookup(inviteEmailNorm) : null;
    if (inviteEmailHash) {
      const existingByHash = await pool.query('SELECT id FROM users WHERE email_hash = $1', [inviteEmailHash]);
      if (existingByHash.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
      const existingByPlain = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND email_hash IS NULL', [inviteEmailNorm]);
      if (existingByPlain.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
    } else {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [inviteEmailNorm]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const nameParts = normalizedFullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user in the invite's organization
      const inviteStoredEmail = inviteEmailHash ? encrypt(inviteEmailNorm) : invite.email;
      const inviteInsertCols = inviteEmailHash
        ? 'organization_id, email, email_hash, password_hash, first_name, last_name, role'
        : 'organization_id, email, password_hash, first_name, last_name, role';
      const inviteInsertVals = inviteEmailHash
        ? [invite.organization_id, inviteStoredEmail, inviteEmailHash, passwordHash, firstName, lastName, invite.primary_role]
        : [invite.organization_id, invite.email, passwordHash, firstName, lastName, invite.primary_role];
      const inviteInsertPlaceholders = inviteInsertVals.map((_, i) => `$${i + 1}`).join(', ');
      const userResult = await client.query(
        `INSERT INTO users (${inviteInsertCols})
         VALUES (${inviteInsertPlaceholders}) RETURNING id, email, first_name, last_name, role`,
        inviteInsertVals
      );
      const user = userResult.rows[0];
      // Always expose plain-text email downstream
      user.email = inviteEmailNorm;

      // Record multi-org membership
      await client.query(
        `INSERT INTO user_organizations (user_id, organization_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [user.id, invite.organization_id, invite.primary_role]
      ).catch((e) => {
        if (e.code === '42P01') return;
        log('error', 'auth.invite.user_organizations_insert_failed', { error: e.message, code: e.code });
      });

      // Assign system role
      await assignUserRole(client, user.id, invite.primary_role).catch(() => {});

      // Assign pre-configured custom roles
      if (invite.role_ids && invite.role_ids.length > 0) {
        for (const roleId of invite.role_ids) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user.id, roleId]
          ).catch(() => {});
        }
      }

      // Mark invite as accepted
      await client.query(
        `UPDATE organization_invites SET status = 'accepted', accepted_at = NOW()
         WHERE id = $1`,
        [invite.id]
      );

      // Generate tokens
      const isDemoAccount = isDemoEmail(user.email);
      const { accessToken, refreshToken, sessionExpiresAt } = generateSessionTokens(user.id, { isDemoAccount });
      await client.query(
        'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashRefreshToken(refreshToken), sessionExpiresAt]
      );

      await client.query('COMMIT');

      // Get org info for response
      const orgResult = await pool.query(
        'SELECT id, name, tier FROM organizations WHERE id = $1', [invite.organization_id]
      );
      const org = orgResult.rows[0] || {};

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: `${user.first_name} ${user.last_name}`.trim(),
            role: user.role,
            organization_id: invite.organization_id,
            is_demo_account: isDemoAccount
          },
          organization: {
            id: org.id,
            name: org.name,
            tier: org.tier,
            onboarding_completed: true
          },
          tokens: { accessToken, refreshToken }
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Accept invite error:', error);
    const statusCode = Number(error.statusCode) || 500;
    const message = statusCode === 500 ? 'Failed to accept invite' : String(error.message || 'Failed to accept invite');
    res.status(statusCode).json({ success: false, error: message });
  }
});

// =========================================================================
// MULTI-ORGANIZATION — list orgs the authenticated user belongs to
// =========================================================================

// GET /auth/my-organizations
router.get('/my-organizations', authenticate, myOrgsLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         o.id,
         o.name,
         o.tier,
         o.billing_status,
         uo.role,
         uo.joined_at,
         (o.id = $2) AS is_active
       FROM user_organizations uo
       JOIN organizations o ON o.id = uo.organization_id
       WHERE uo.user_id = $1
       ORDER BY uo.joined_at ASC`,
      [req.user.id, req.user.organization_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'auth.my_organizations_failed', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: 'Failed to list organizations' });
  }
});

// =========================================================================
// MULTI-ORGANIZATION — switch the caller's active organization
// =========================================================================

// POST /auth/switch-organization/:orgId
router.post('/switch-organization/:orgId', authenticate, switchOrgLimiter, async (req, res) => {
  const { orgId } = req.params;

  if (!isUuid(orgId)) {
    return res.status(400).json({ success: false, error: 'Invalid organization ID' });
  }

  try {
    // Verify membership (read-only, outside transaction)
    const membership = await pool.query(
      `SELECT role FROM user_organizations
       WHERE user_id = $1 AND organization_id = $2
       LIMIT 1`,
      [req.user.id, orgId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'You are not a member of that organization' });
    }

    // Issue new tokens so every subsequent request carries the new org context
    const isDemoAccount = isDemoEmail(req.user.email);
    const { accessToken, refreshToken: newRefreshToken, sessionExpiresAt } =
      generateSessionTokens(req.user.id, { isDemoAccount });

    // Wrap user update + session rotation in a transaction to avoid
    // inconsistent state if any step fails.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update active org and set the role the user holds in the target org
      const memberRole = membership.rows[0].role;
      await client.query(
        `UPDATE users SET organization_id = $1, role = $2, updated_at = NOW() WHERE id = $3`,
        [orgId, memberRole, req.user.id]
      );

      // Replace only the caller's current session (identified by the refresh
      // token sent in the request body).  If no token is supplied, insert a
      // new session without removing others — this avoids logging the user
      // out of other devices or shared demo accounts.
      const currentRefreshToken = req.body?.refreshToken;
      if (currentRefreshToken) {
        await client.query(
          'DELETE FROM sessions WHERE user_id = $1 AND refresh_token = $2',
          [req.user.id, hashRefreshToken(currentRefreshToken)]
        );
      }

      await client.query(
        'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [req.user.id, hashRefreshToken(newRefreshToken), sessionExpiresAt]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Fetch new org details for the response
    const orgResult = await pool.query(
      `SELECT id, name, tier, billing_status FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId]
    );
    const org = orgResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        organization: { id: org.id, name: org.name, tier: org.tier, billing_status: org.billing_status },
        tokens: { accessToken, refreshToken: newRefreshToken }
      }
    });
  } catch (error) {
    log('error', 'auth.switch_organization_failed', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: 'Failed to switch organization' });
  }
});

module.exports = router;
