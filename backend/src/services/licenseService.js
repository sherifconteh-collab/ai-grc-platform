// @tier: community
'use strict';

/**
 * Perpetual License Service
 *
 * Validates offline license keys for customers who purchase ControlWeave
 * as a one-time perpetual license (like buying Office vs. subscribing to 365).
 *
 * License keys are RS256-signed JWTs issued by ControlWeave sales.
 * The public key is embedded at build time or set via CONTROLWEAVE_LICENSE_PUBKEY.
 * No network call is required — validation is fully offline.
 *
 * JWT payload schema:
 *   {
 *     sub: <organization-id or org-name>,
 *     iss: "controlweave",
 *     aud: "controlweave-license",
 *     tier: "community" | "pro" | "enterprise" | "govcloud",
 *     seats: <max-users | -1 for unlimited>,
 *     features: [...optional feature keys...],
 *     maintenance_until: "2027-03-11",   // optional maintenance expiry
 *     iat: <issued-at>,
 *     exp: <optional hard-expiry — omit for true perpetual>
 *   }
 *
 * Flow:
 *   1. Customer purchases perpetual license via sales@controlweave.com
 *   2. Sales generates a signed JWT and delivers it as a license key
 *   3. Customer sets LICENSE_KEY=<jwt> in their .env
 *   4. On startup, this service validates the key and returns the entitlements
 *   5. edition.js reads the result to set the effective tier
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { promisify } = require('util');
const { log } = require('../utils/logger');

// ── Public key for license verification ──
// In production this should be set via CONTROLWEAVE_LICENSE_PUBKEY env var.
// The corresponding private key is held only by ControlWeave sales/ops.
//
// For community self-hosted deployments that generated their own license via
// POST /api/v1/license/generate-community, the generated public key is loaded
// from the DB at startup and stored in _localPublicKey as a fallback.
const LICENSE_PUBKEY = process.env.CONTROLWEAVE_LICENSE_PUBKEY || null;

// Fallback public key for self-generated community licenses.
// Set by setLocalPublicKey() when loading from the database on startup.
let _localPublicKey = null;

const VALID_TIERS = new Set(['community', 'pro', 'enterprise', 'govcloud']);

/**
 * Set a locally-generated public key for verifying self-signed community licenses.
 * Called at startup when loading a generated license from the database.
 *
 * @param {string|null} pem - PEM-encoded RSA public key, or null to clear
 */
function setLocalPublicKey(pem) {
  _localPublicKey = pem || null;
}

/**
 * Validate a license key string and return entitlements.
 *
 * @param {string} licenseKey - The JWT license key
 * @param {string|null} [overridePubKey] - Optional public key to use for verification.
 *   Falls back to: CONTROLWEAVE_LICENSE_PUBKEY env var → locally-generated key.
 * @returns {{ valid: boolean, tier?: string, seats?: number, licensee?: string,
 *             maintenanceUntil?: string, features?: string[], error?: string }}
 */
function validateLicenseKey(licenseKey, overridePubKey = null) {
  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim().length === 0) {
    return { valid: false, error: 'No license key provided' };
  }

  const pubKey = overridePubKey || LICENSE_PUBKEY || _localPublicKey;

  if (!pubKey) {
    return { valid: false, error: 'License verification public key not configured (CONTROLWEAVE_LICENSE_PUBKEY)' };
  }

  try {
    const payload = jwt.verify(licenseKey.trim(), pubKey, {
      algorithms: ['RS256', 'ES256'],
      issuer: 'controlweave',
      audience: 'controlweave-license'
    });

    // Validate tier
    const tier = String(payload.tier || '').toLowerCase();
    if (!VALID_TIERS.has(tier)) {
      return { valid: false, error: `Invalid license tier: ${tier}` };
    }

    // Validate seats
    const seats = typeof payload.seats === 'number' ? payload.seats : -1;

    // Maintenance window (optional — perpetual licenses work forever,
    // but maintenance_until controls access to updates/support)
    const maintenanceUntil = payload.maintenance_until || null;

    return {
      valid: true,
      tier,
      seats,
      licensee: payload.sub || 'unknown',
      maintenanceUntil,
      features: Array.isArray(payload.features) ? payload.features : []
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'License key has expired' };
    }
    if (err.name === 'JsonWebTokenError') {
      return { valid: false, error: `Invalid license key: ${err.message}` };
    }
    return { valid: false, error: `License validation failed: ${err.message}` };
  }
}

/**
 * Read LICENSE_KEY from env and validate on startup.
 * Returns the entitlements or null if no key / invalid key.
 */
function loadLicenseFromEnv() {
  const key = process.env.LICENSE_KEY || process.env.CONTROLWEAVE_LICENSE_KEY || '';
  if (!key.trim()) {
    return null; // No perpetual license configured — use subscription model
  }

  const result = validateLicenseKey(key);
  if (result.valid) {
    log('info', 'license.perpetual.loaded', {
      licensee: result.licensee,
      tier: result.tier,
      seats: result.seats,
      maintenanceUntil: result.maintenanceUntil
    });
  } else {
    log('warn', 'license.perpetual.invalid', { error: result.error });
  }
  return result;
}

/**
 * Generate a fingerprint of the current license for display in admin panels.
 * Does NOT expose the full key.
 */
function licenseFingerprint(licenseKey) {
  if (!licenseKey) return null;
  const hash = crypto.createHash('sha256').update(licenseKey.trim()).digest('hex');
  return hash.substring(0, 12).toUpperCase();
}

/**
 * Persist an activated license key to the server_license database table.
 * Upserts — only one row (id = 1) ever exists.
 *
 * @param {object} pool - pg Pool instance
 * @param {string} licenseKey - The validated JWT license key
 * @param {{ tier, licensee, seats, maintenanceUntil }} licenseResult - Validated entitlements
 * @param {number|null} userId - The user who activated the license (for audit)
 * @param {string|null} [localPublicKey] - PEM public key for self-generated community licenses
 */
async function saveLicenseToDb(pool, licenseKey, licenseResult, userId, localPublicKey = null) {
  await pool.query(
    `INSERT INTO server_license
       (id, license_key, tier, licensee, seats, maintenance_until, activated_by_user_id, activated_at, local_public_key)
     VALUES (1, $1, $2, $3, $4, $5, $6, NOW(), $7)
     ON CONFLICT (id) DO UPDATE SET
       license_key          = EXCLUDED.license_key,
       tier                 = EXCLUDED.tier,
       licensee             = EXCLUDED.licensee,
       seats                = EXCLUDED.seats,
       maintenance_until    = EXCLUDED.maintenance_until,
       activated_by_user_id = EXCLUDED.activated_by_user_id,
       activated_at         = NOW(),
       local_public_key     = EXCLUDED.local_public_key`,
    [
      licenseKey.trim(),
      licenseResult.tier,
      licenseResult.licensee || null,
      typeof licenseResult.seats === 'number' ? licenseResult.seats : -1,
      licenseResult.maintenanceUntil || null,
      userId || null,
      localPublicKey || null
    ]
  );
}

/**
 * Load the persisted license key from the server_license database table.
 * Returns { licenseKey, localPublicKey }, or { licenseKey: null, localPublicKey: null }
 * if no key is stored or the table does not exist yet (fresh install).
 *
 * @param {object} pool - pg Pool instance
 * @returns {Promise<{ licenseKey: string|null, localPublicKey: string|null }>}
 */
async function loadLicenseKeyFromDb(pool) {
  try {
    const result = await pool.query(
      'SELECT license_key, local_public_key FROM server_license WHERE id = 1 LIMIT 1'
    );
    const row = result.rows[0] || {};
    return {
      licenseKey: row.license_key || null,
      localPublicKey: row.local_public_key || null
    };
  } catch (err) {
    // 42P01 = undefined_table — expected on fresh installs before migrations run.
    // 42703 = undefined_column — migration 097 (local_public_key) not yet applied.
    if (err.code === '42P01' || err.code === '42703') {
      return { licenseKey: null, localPublicKey: null };
    }
    // Any other DB error (connectivity, auth, etc.) should be surfaced.
    log('error', 'license.db_load_error', { error: err.message, code: err.code });
    throw err;
  }
}

/**
 * Generate a self-signed community license key and matching RSA public key.
 *
 * Used by self-hosted community deployments that haven't purchased a paid tier.
 * The community tier is free — there is no commercial key required. Generating
 * a local key records the installation as a licensed community deployment and
 * enables the license fingerprint display in admin panels.
 *
 * Returned:
 *   licenseKey    — RS256-signed JWT; pass to POST /api/v1/license/activate
 *   publicKey     — PEM RSA public key; stored in server_license.local_public_key
 *
 * The key pair is ephemeral — only the signed JWT and public key are persisted.
 * The private key is discarded after signing.
 *
 * @param {string} licensee - Org name or identifier for the licensee field
 * @param {number} [seats]  - Max users; -1 means unlimited (default)
 * @returns {Promise<{ licenseKey: string, publicKey: string }>}
 */
async function generateCommunityKey(licensee = 'community', seats = -1) {
  const generateKeyPair = promisify(crypto.generateKeyPair);

  const { privateKey, publicKey } = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Community licenses are perpetual — no exp claim so the JWT never hard-expires.
  // maintenance_until is 5 years from now; this only affects update entitlement
  // display, not access.
  const maintenanceUntil = new Date(Date.now() + 5 * 365.25 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);

  const payload = {
    sub: String(licensee).trim() || 'community',
    iss: 'controlweave',
    aud: 'controlweave-license',
    tier: 'community',
    seats: typeof seats === 'number' && seats !== 0 ? seats : -1,
    features: [],
    maintenance_until: maintenanceUntil,
    iat: Math.floor(Date.now() / 1000)
    // No exp — true perpetual
  };

  const licenseKey = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  return { licenseKey, publicKey };
}

module.exports = {
  validateLicenseKey,
  loadLicenseFromEnv,
  licenseFingerprint,
  saveLicenseToDb,
  loadLicenseKeyFromDb,
  generateCommunityKey,
  setLocalPublicKey,
  VALID_TIERS
};

