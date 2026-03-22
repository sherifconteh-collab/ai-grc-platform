// @tier: community
'use strict';

/**
 * Update Check Route
 *
 * GET  /api/v1/update-check        — return cached (or live) update status
 * POST /api/v1/update-check/force  — bypass cache and re-query GitHub
 *
 * Both endpoints require authentication and the `settings.manage` permission
 * so only admins can trigger remote GitHub API calls.
 *
 * The update model is "baked-in":
 *   All feature code ships in every build. Activating a license key unlocks
 *   features already present in the binary. An update delivers new features
 *   and bug-fixes but does NOT download or swap out feature modules. Users
 *   update by pulling the latest Docker image / binary / git tag.
 */

const express = require('express');
const router  = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { checkForUpdates }                 = require('../services/updateCheckService');
const { log }                             = require('../utils/logger');
const { createRateLimiter }               = require('../middleware/rateLimit');

const updateCheckLimiter = createRateLimiter({
  label: 'update-check',
  windowMs: 10 * 60 * 1000, // 10-minute window
  max: 20                    // 20 requests per window per IP
});

// Tighter limit for forced (cache-bypass) checks.
const forceCheckLimiter = createRateLimiter({
  label: 'update-check-force',
  windowMs: 10 * 60 * 1000,
  max: 3
});

router.use(authenticate, requirePermission('settings.manage'));

/**
 * GET /api/v1/update-check
 *
 * Returns the cached update status (refreshes from GitHub if cache is stale).
 * Callers should poll no more often than the cache TTL (1 hour).
 */
router.get('/', updateCheckLimiter, async (req, res) => {
  try {
    const result = await checkForUpdates();
    return res.json({ success: true, data: result });
  } catch (err) {
    log('error', 'update_check.route.failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Update check failed' });
  }
});

/**
 * POST /api/v1/update-check/force
 *
 * Bypasses the in-memory cache and queries GitHub immediately.
 * Used after license activation to surface whether the newly-licensed
 * edition warrants an update.
 *
 * Applies a tighter rate limit: 3 forced checks per 10 minutes per IP.
 */
router.post('/force', forceCheckLimiter, async (req, res) => {
  try {
    const result = await checkForUpdates({ force: true });
    return res.json({ success: true, data: result });
  } catch (err) {
    log('error', 'update_check.force.failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Forced update check failed' });
  }
});

module.exports = router;
