// @tier: community
/**
 * License Route
 *
 * Provides endpoints for self-hosted community deployments to:
 *   - Query the current edition and license status
 *   - Activate a signed license key at runtime (upgrades in-process edition)
 *   - Check GitHub for available platform updates
 *
 * License keys are RS256/ES256-signed JWTs issued by ControlWeave sales.
 * Community tier keys confirm a legitimate community installation.
 * Pro/Enterprise/GovCloud keys unlock additional features immediately
 * without requiring a server restart (in-memory upgrade).
 *
 * Activated keys are automatically persisted to the server_license database
 * table so the upgrade survives restarts — no manual .env editing required.
 */

'use strict';

const axios = require('axios');
const path = require('path');
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission, requirePlatformOwner } = require('../middleware/auth');
const { log } = require('../utils/logger');
const {
  getEditionInfo,
  upgradeEdition,
  LICENSE_TIER_TO_EDITION
} = require('../middleware/edition');
const {
  validateLicenseKey,
  licenseFingerprint,
  saveLicenseToDb,
  loadLicenseKeyFromDb,
  generateCommunityKey,
  setLocalPublicKey
} = require('../services/licenseService');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');

const licenseRateLimiter = createRateLimiter({ label: 'license', windowMs: 60 * 1000, max: 10 });
// RSA key generation is CPU-intensive — apply a tighter limiter to the
// generate-community endpoint: 3 generations per hour per IP.
const licenseGenerateLimiter = createRateLimiter({ label: 'license-generate', windowMs: 60 * 60 * 1000, max: 3 });

// Explicit express-rate-limit instance for the update-check route so that
// static-analysis tools (CodeQL) recognise the rate-limiting middleware.
const updateCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});

// ─── Update-check cache ─────────────────────────────────────────────────────
// Avoid hammering GitHub's API — cache the result for a configurable interval.
// Default: 6 hours. Operators can adjust via UPDATE_CHECK_INTERVAL_HOURS.
const _rawUpdateIntervalHours = parseFloat(process.env.UPDATE_CHECK_INTERVAL_HOURS || '6');
const _sanitizedUpdateIntervalHours = Number.isFinite(_rawUpdateIntervalHours) ? _rawUpdateIntervalHours : 6;
const UPDATE_CHECK_CACHE_MS = Math.max(1, _sanitizedUpdateIntervalHours) * 60 * 60 * 1000;

let _updateCache = null; // { data, fetchedAt }

/**
 * Compare two semver strings.  Returns:
 *   -1  if a < b
 *    0  if a === b
 *    1  if a > b
 * Pre-release suffixes (e.g. '-beta.1') and build metadata (e.g. '+20130313')
 * are stripped before comparison so that '2.5.0-beta.1' compares equal to
 * '2.5.0' (both treated as the release version for update-check purposes).
 */
function compareSemver(a, b) {
  // Strip leading 'v', pre-release labels (-alpha, -beta.1, etc.), and build metadata (+...)
  const normalize = (v) =>
    String(v || '0')
      .replace(/^v/, '')
      .replace(/[-+].*$/, '')  // strip pre-release/build metadata
      .split('.')
      .map((n) => { const num = parseInt(n, 10); return Number.isNaN(num) ? 0 : num; });
  const pa = normalize(a);
  const pb = normalize(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * Fetch the latest release from the configured GitHub repository.
 * Returns null on any network or parse error (graceful degradation).
 *
 * Repository: UPDATE_CHECK_REPO env var (default: sherifconteh-collab/ai-grc-platform)
 */
async function fetchLatestGitHubRelease() {
  const repo = (process.env.UPDATE_CHECK_REPO || 'sherifconteh-collab/ai-grc-platform').trim();
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'ControlWeave-UpdateCheck/1.0',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 8000
    });
    const json = response.data;
    if (json && json.tag_name) {
      return {
        tagName: json.tag_name,
        name: json.name || json.tag_name,
        htmlUrl: json.html_url || `https://github.com/${repo}/releases/latest`,
        publishedAt: json.published_at || null,
        body: (json.body || '').slice(0, 500) // Brief excerpt only
      };
    }
    return null;
  } catch (error) {
    log('warn', 'license.update_check.github_fetch_failed', { error: error.message, repo });
    return null;
  }
}

/**
 * Return update check data, using the in-memory cache when fresh.
 * currentVersion: the installed package version (e.g. "2.4.3")
 * minVersion: from the active license JWT (may be null)
 */
async function getUpdateCheckData(currentVersion, minVersion) {
  const now = Date.now();
  if (_updateCache && (now - _updateCache.fetchedAt) < UPDATE_CHECK_CACHE_MS) {
    // Return cached data, but recompute flags against current version/license
    return buildUpdateResult(currentVersion, minVersion, _updateCache.release, _updateCache.fetchedAt);
  }

  const release = await fetchLatestGitHubRelease();
  _updateCache = { release, fetchedAt: now };
  return buildUpdateResult(currentVersion, minVersion, release, now);
}

function buildUpdateResult(currentVersion, minVersion, release, fetchedAt) {
  const latestVersion = release ? release.tagName.replace(/^v/, '') : null;
  const updateAvailable = latestVersion
    ? compareSemver(currentVersion, latestVersion) < 0
    : false;

  // A license can embed min_version to signal a required minimum version.
  // If the current install is below min_version, the update is mandatory.
  const updateRequired = minVersion
    ? compareSemver(currentVersion, minVersion) < 0
    : false;

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    updateRequired,
    minVersionRequired: minVersion || null,
    releaseUrl: release ? release.htmlUrl : `https://github.com/${(process.env.UPDATE_CHECK_REPO || 'sherifconteh-collab/ai-grc-platform').trim()}/releases/latest`,
    releaseName: release ? release.name : null,
    releaseExcerpt: release ? release.body : null,
    publishedAt: release ? release.publishedAt : null,
    checkedAt: new Date(fetchedAt).toISOString(),
    source: release ? 'github' : 'unavailable'
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function writeLicenseAuditLog(orgId, userId, eventType, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
       VALUES ($1, $2, $3, 'license', $4::jsonb, true)`,
      [orgId, userId || null, eventType, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    // Audit log failures are non-fatal
    log('warn', 'license.audit_log.failed', { error: err.message });
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Apply rate limiting to all license endpoints
router.use(licenseRateLimiter);

/**
 * GET /api/v1/license
 * Return the current server edition and license status.
 * Includes whether a license is stored in the database.
 * Restricted to users with settings.manage permission.
 */
router.get('/', authenticate, requirePermission('settings.manage'), async (req, res) => {
  try {
    const info = getEditionInfo();
    const envKey = process.env.LICENSE_KEY || process.env.CONTROLWEAVE_LICENSE_KEY || '';
    const { licenseKey: dbKey } = await loadLicenseKeyFromDb(pool);
    const activeKey = envKey.trim() || dbKey || '';
    const fingerprint = activeKey ? licenseFingerprint(activeKey) : null;

    return res.json({
      success: true,
      data: {
        edition: info.edition,
        isCommunity: info.isCommunity,
        isPro: info.isPro,
        licenseFingerprint: fingerprint,
        persistedViaEnv: !!envKey.trim(),
        persistedViaDb: !!dbKey
      }
    });
  } catch (err) {
    log('error', 'license.info.failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve license information' });
  }
});

/**
 * GET /api/v1/license/update-check
 * Check whether a newer version of ControlWeave is available on GitHub.
 *
 * Compares the installed version (from package.json) against the latest
 * release published on the public GitHub repository. Results are cached for
 * UPDATE_CHECK_INTERVAL_HOURS (default 6 h) to stay within GitHub's rate limits.
 *
 * If the active license contains a `min_version` field, the response also
 * indicates when an update is required by that license.
 *
 * Requires: authenticated user with settings.manage permission.
 */
router.get('/update-check', updateCheckLimiter, authenticate, requirePermission('settings.manage'), async (req, res) => {
  try {
    // Read installed version from package.json (relative to this file)
    let currentVersion = '0.0.0';
    try {
      // Expected layout: backend/src/routes/license.js → backend/package.json
      // __dirname = backend/src/routes  →  ../.. = backend/
      const pkg = require(path.resolve(__dirname, '../../package.json'));
      currentVersion = pkg.version || '0.0.0';
    } catch {
      // Fallback — non-fatal
    }

    // Resolve active license to extract min_version if present
    let minVersion = null;
    try {
      const envKey = (process.env.LICENSE_KEY || process.env.CONTROLWEAVE_LICENSE_KEY || '').trim();
      const { licenseKey: dbKey } = await loadLicenseKeyFromDb(pool);
      const activeKey = envKey || dbKey || '';
      if (activeKey) {
        const licenseResult = validateLicenseKey(activeKey);
        if (licenseResult.valid && licenseResult.minVersion) {
          minVersion = licenseResult.minVersion;
        }
      }
    } catch {
      // Non-fatal — proceed without min_version
    }

    const result = await getUpdateCheckData(currentVersion, minVersion);

    return res.json({ success: true, data: result });
  } catch (err) {
    log('error', 'license.update_check.failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to check for updates' });
  }
});

/**
 * POST /api/v1/license/activate
 * Activate a signed license key for this self-hosted installation.
 *
 * - Community keys: confirm the installation is a licensed community deployment.
 * - Pro / Enterprise / GovCloud keys: immediately upgrade the in-process edition
 *   so features are available without restarting the server.
 *
 * The key is automatically saved to the server_license database table so the
 * upgrade persists across server restarts — no .env editing required.
 *
 * Requires: authenticated user with settings.manage permission.
 * Body: { licenseKey: string }
 */
router.post(
  '/activate',
  authenticate,
  requirePermission('settings.manage'),
  async (req, res) => {
    try {
      const { licenseKey } = req.body || {};

      if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'licenseKey is required' });
      }

      const licenseResult = validateLicenseKey(licenseKey.trim());

      if (!licenseResult || !licenseResult.valid) {
        return res
          .status(400)
          .json({ success: false, error: licenseResult?.error || 'Invalid or expired license key' });
      }

      const licenseTier = licenseResult.tier;
      const effectiveEdition = LICENSE_TIER_TO_EDITION[licenseTier] || 'community';
      const orgId = req.user?.organization_id;
      const userId = req.user?.id;

      // Upgrade the in-process edition so features are immediately available.
      upgradeEdition(effectiveEdition);

      // Persist the key to the database so the upgrade survives restarts.
      let persisted = false;
      try {
        await saveLicenseToDb(pool, licenseKey.trim(), licenseResult, userId);
        persisted = true;
        log('info', 'license.persisted_to_db', { tier: licenseTier });
      } catch (dbErr) {
        // Non-fatal: in-process upgrade already applied; log and continue.
        log('warn', 'license.db_persist_failed', { error: dbErr.message });
      }

      await writeLicenseAuditLog(orgId, userId, 'license_key_activated', {
        tier: licenseTier,
        edition: effectiveEdition,
        licensee: licenseResult.licensee || null,
        seats: licenseResult.seats === -1 ? 'unlimited' : licenseResult.seats,
        maintenance_until: licenseResult.maintenanceUntil || null
      });

      log('info', 'license.activate.completed', {
        orgId,
        tier: licenseTier,
        edition: effectiveEdition,
        licensee: licenseResult.licensee
      });

      const responseData = {
        edition: effectiveEdition,
        tier: licenseTier,
        licensee: licenseResult.licensee || null,
        seats: licenseResult.seats === -1 ? 'unlimited' : licenseResult.seats,
        maintenanceUntil: licenseResult.maintenanceUntil || null,
        persisted
      };
      if (!persisted) {
        responseData.warning = 'License activated in-process but database persistence failed. The license will be lost on server restart. Check database connectivity and retry activation.';
      }

      return res.json({
        success: true,
        message: `License activated. Server is now running in ${effectiveEdition.toUpperCase()} edition.`,
        data: responseData
      });
    } catch (err) {
      log('error', 'license.activate.failed', { error: err.message });
      return res.status(500).json({ success: false, error: 'Failed to activate license' });
    }
  }
);

/**
 * POST /api/v1/license/generate-community
 * Generate a self-signed community license key for this self-hosted installation.
 *
 * Intended for platform administrators of community-tier self-hosted deployments
 * who have not purchased a paid license. The community tier is free — no sales
 * contact required.
 *
 * This endpoint:
 *   1. Generates a fresh RSA-2048 keypair locally (private key is discarded).
 *   2. Signs a community-tier JWT license with the private key.
 *   3. Persists the license + public key to the server_license table.
 *   4. Upgrades the in-process edition to community immediately.
 *   5. Returns the generated license key (display once — not stored in plaintext
 *      anywhere else; the public key is persisted for re-validation on restart).
 *
 * Requires: authenticated platform owner (is_platform_admin = true).
 */
router.post(
  '/generate-community',
  licenseGenerateLimiter,
  authenticate,
  requirePlatformOwner,
  async (req, res) => {
    try {
      const orgId = req.user?.organization_id;
      const userId = req.user?.id;

      // Use the org name as the licensee if available, otherwise fall back to the
      // org ID so the fingerprint is identifiable in the admin panel.
      let licensee = `org-${orgId || 'community'}`;
      if (orgId) {
        try {
          const orgRow = await pool.query(
            'SELECT name FROM organizations WHERE id = $1 LIMIT 1',
            [orgId]
          );
          if (orgRow.rows[0]?.name) licensee = orgRow.rows[0].name;
        } catch (_) { /* non-fatal — use fallback */ }
      }

      const { licenseKey, publicKey } = await generateCommunityKey(licensee, -1);

      // Validate the freshly-generated key using its own public key to make sure
      // generation produced a correct JWT before we commit anything.
      const licenseResult = validateLicenseKey(licenseKey, publicKey);
      if (!licenseResult.valid) {
        log('error', 'license.generate_community.self_validation_failed', { error: licenseResult.error });
        return res.status(500).json({ success: false, error: 'Generated license failed self-validation — please try again' });
      }

      // Set in-process fallback public key so the new license validates immediately.
      setLocalPublicKey(publicKey);

      // Upgrade in-process edition.
      upgradeEdition('community');

      // Persist both the license key and public key to DB.
      await saveLicenseToDb(pool, licenseKey, licenseResult, userId, publicKey);

      await writeLicenseAuditLog(orgId, userId, 'license_key_generated', {
        tier: 'community',
        edition: 'community',
        licensee,
        seats: 'unlimited',
        generated: true
      });

      log('info', 'license.generate_community.completed', { orgId, licensee });

      return res.status(201).json({
        success: true,
        message: 'Community license generated and activated. Your server is licensed as a community installation.',
        data: {
          licenseKey,
          edition: 'community',
          tier: 'community',
          licensee,
          seats: 'unlimited',
          maintenanceUntil: licenseResult.maintenanceUntil || null,
          note: 'Store this key securely. It is not recoverable from the server — the public key is persisted for restart validation.'
        }
      });
    } catch (err) {
      log('error', 'license.generate_community.failed', { error: err.message });
      return res.status(500).json({ success: false, error: 'Failed to generate community license' });
    }
  }
);

module.exports = router;

