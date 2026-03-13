// @tier: community
'use strict';

/**
 * License Routes
 *
 * GET  /api/v1/license          – Return current license status (admin only)
 * POST /api/v1/license/activate – Validate and activate a license key (admin only)
 * DELETE /api/v1/license        – Remove the active license key (admin only)
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { log } = require('../utils/logger');
const {
  parseLicenseKey,
  loadLicenseFromEnv,
  loadLicenseFromDb,
  storeLicenseInDb,
  removeLicenseFromDb,
  getActiveLicense,
  setActiveLicense,
  clearActiveLicense,
} = require('../services/licenseService');
const {
  upgradeEdition,
  getEditionInfo,
  LICENSE_TIER_TO_EDITION,
  BOOT_EDITION,
} = require('../middleware/edition');

// Rate limiter for all license endpoints to prevent abuse
const licenseReadLimiter = createRateLimiter({
  label: 'license-read',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
});

// Rate limiter for license activation and removal — lower limits to prevent brute-forcing
const licenseActionLimiter = createRateLimiter({
  label: 'license-action',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
});

// Apply rate limiting first (before authentication) then restrict to admin role.
// Rate limiting before authenticate prevents unauthenticated brute-force probing.
router.use(licenseReadLimiter);
router.use(authenticate);
router.use(requireRole(['admin']));

/**
 * GET /api/v1/license
 * Returns the current license and edition status.
 */
router.get('/', async (req, res) => {
  try {
    // Determine license source accurately:
    // 1. Env-var license (set at process start via LICENSE_KEY)
    // 2. In-memory cache (set when a license was activated via API)
    // 3. DB fallback (lazy-loaded below)
    let license = null;
    let source = 'database';

    const envLicense = loadLicenseFromEnv();
    if (envLicense && envLicense.valid) {
      license = envLicense;
      source = 'env';
    } else {
      license = getActiveLicense();
      if (!license || !license.valid) {
        license = await loadLicenseFromDb();
      }
    }

    const edition = getEditionInfo();

    if (!license || !license.valid) {
      return res.json({
        success: true,
        data: {
          licensed: false,
          edition: edition.edition,
          isPro: edition.isPro,
          isCommunity: edition.isCommunity,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        licensed: true,
        source,
        licensee: license.licensee,
        tier: license.tier,
        seats: license.seats,
        issuedAt: license.issuedAt,
        expiresAt: license.expiresAt,
        edition: edition.edition,
        isPro: edition.isPro,
        isCommunity: edition.isCommunity,
      },
    });
  } catch (error) {
    log('error', 'license.status.error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, error: 'Failed to retrieve license status' });
  }
});

/**
 * POST /api/v1/license/activate
 * Validates the provided license key, persists it to the database, and
 * immediately upgrades the server's in-process edition.
 *
 * Body: { licenseKey: string }
 */
router.post('/activate', licenseActionLimiter, async (req, res) => {
  const { licenseKey } = req.body || {};

  if (!licenseKey || typeof licenseKey !== 'string' || !licenseKey.trim()) {
    return res.status(400).json({
      success: false,
      error: 'licenseKey is required',
    });
  }

  const key = licenseKey.trim();
  const license = parseLicenseKey(key);

  if (!license.valid) {
    log('warn', 'license.activate.invalid', {
      userId: req.user?.id,
      error: license.error,
    });
    return res.status(422).json({
      success: false,
      error: license.error || 'Invalid license key',
    });
  }

  try {
    // Persist to DB for survival across restarts
    await storeLicenseInDb(key, req.user?.id || null);

    // Update in-memory cache so the GET /license endpoint reflects the new license
    // without needing to mutate process.env
    setActiveLicense({ ...license, raw: key, source: 'database' });

    // Upgrade the in-process edition immediately
    const effectiveEdition = LICENSE_TIER_TO_EDITION[license.tier] || 'pro';
    upgradeEdition(effectiveEdition);

    log('info', 'license.activated', {
      userId: req.user?.id,
      licensee: license.licensee,
      tier: license.tier,
      seats: license.seats,
      expiresAt: license.expiresAt,
      edition: effectiveEdition,
    });

    const edition = getEditionInfo();

    return res.json({
      success: true,
      message: 'License activated successfully',
      data: {
        licensee: license.licensee,
        tier: license.tier,
        seats: license.seats,
        expiresAt: license.expiresAt,
        edition: edition.edition,
        isPro: edition.isPro,
      },
    });
  } catch (error) {
    log('error', 'license.activate.error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, error: 'Failed to activate license' });
  }
});

/**
 * DELETE /api/v1/license
 * Removes the active license key and reverts to the EDITION env-var default.
 */
router.delete('/', licenseActionLimiter, async (req, res) => {
  try {
    const removed = await removeLicenseFromDb();

    // Clear the in-memory cache
    clearActiveLicense();

    // Revert to the boot-time edition (the EDITION env-var value captured at startup,
    // before any runtime license upgrades mutated process.env.EDITION).
    upgradeEdition(BOOT_EDITION);

    log('info', 'license.removed', {
      userId: req.user?.id,
      wasStored: removed,
      revertedTo: BOOT_EDITION,
    });

    const edition = getEditionInfo();

    return res.json({
      success: true,
      message: removed ? 'License removed successfully' : 'No active license found',
      data: {
        edition: edition.edition,
        isPro: edition.isPro,
        isCommunity: edition.isCommunity,
      },
    });
  } catch (error) {
    log('error', 'license.remove.error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, error: 'Failed to remove license' });
  }
});

module.exports = router;
