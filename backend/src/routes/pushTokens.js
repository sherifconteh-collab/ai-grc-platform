// @tier: community
'use strict';

/**
 * Push Token Route
 *
 * Manages APNs (iOS) and FCM (Android) device push tokens for mobile apps.
 * Tokens are registered on app launch and removed on logout so the push
 * service only holds valid, active tokens.
 *
 * Routes:
 *   POST   /api/v1/push-tokens          Register or refresh a device token
 *   DELETE /api/v1/push-tokens/:token   Remove a token on logout / uninstall
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { log } = require('../utils/logger');

const VALID_PLATFORMS = new Set(['ios', 'android']);

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/push-tokens
 * Register or refresh a device push token for the authenticated user.
 * Body: { token: string, platform: 'ios' | 'android' }
 */
router.post('/', async (req, res) => {
  try {
    const { token, platform } = req.body || {};

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'token is required' });
    }
    if (!platform || !VALID_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: 'platform must be ios or android' });
    }

    const cleanToken = token.trim();
    const orgId = req.user.organization_id;
    const userId = req.user.id;

    // Upsert on token uniqueness — reassigns the token to the current user/org so
    // a device that switches accounts only receives pushes for the active account.
    await pool.query(
      `INSERT INTO device_push_tokens (organization_id, user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (token) DO UPDATE
         SET user_id         = EXCLUDED.user_id,
             organization_id = EXCLUDED.organization_id,
             platform        = EXCLUDED.platform,
             updated_at      = now()`,
      [orgId, userId, cleanToken, platform]
    );

    log('info', 'push_tokens.registered', { userId, platform });
    return res.status(201).json({ success: true });
  } catch (err) {
    log('error', 'push_tokens.register.failed', { userId, platform, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/push-tokens/:token
 * Remove a device token on logout or app uninstall.
 * Only removes tokens belonging to the authenticated user.
 */
router.delete('/:token', async (req, res) => {
  try {
    const token = decodeURIComponent(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    await pool.query(
      'DELETE FROM device_push_tokens WHERE user_id = $1 AND token = $2',
      [req.user.id, token]
    );

    return res.json({ success: true });
  } catch (err) {
    log('error', 'push_tokens.delete.failed', { userId: req.user.id, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
