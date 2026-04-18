// @tier: community
//
// /api/v1/push-tokens — mobile device push token lifecycle management.
//
// Used by the iOS (APNs) and Android (FCM) companion apps to register and
// unregister device tokens. Uniqueness is enforced on `token` alone (see
// migration 104) so that re-registration of a token under a different account
// reassigns ownership rather than creating a duplicate row, which would allow
// cross-account push delivery on shared devices.

'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const pool = require('../config/database');

router.use(authenticate);

const pushTokenWriteLimiter = createOrgRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  label: 'push-tokens-write',
});

const ALLOWED_PLATFORMS = new Set(['ios', 'android']);

function _validateRegisterBody(body) {
  const missing = requireFields(body, ['token', 'platform']);
  if (missing) return missing;
  if (!ALLOWED_PLATFORMS.has(String(body.platform).toLowerCase())) {
    return 'platform must be one of: ios, android';
  }
  if (typeof body.token !== 'string' || body.token.length < 8 || body.token.length > 4096) {
    return 'token must be a string between 8 and 4096 characters';
  }
  return null;
}

// POST /api/v1/push-tokens — register or refresh a device push token.
router.post('/', pushTokenWriteLimiter, validateBody(_validateRegisterBody), async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId = req.user.organization_id;
    const { token, platform, app_version, device_model, locale } = req.body;
    const platformNorm = String(platform).toLowerCase();

    // UPSERT on unique token: if the token was previously registered under a
    // different user, ownership is reassigned (intentional, prevents stale
    // cross-account push delivery on shared devices).
    const result = await pool.query(
      `INSERT INTO device_push_tokens
         (user_id, organization_id, platform, token, app_version, device_model, locale,
          created_at, updated_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
       ON CONFLICT (token) DO UPDATE SET
         user_id         = EXCLUDED.user_id,
         organization_id = EXCLUDED.organization_id,
         platform        = EXCLUDED.platform,
         app_version     = EXCLUDED.app_version,
         device_model    = EXCLUDED.device_model,
         locale          = EXCLUDED.locale,
         updated_at      = NOW(),
         last_seen_at    = NOW()
       RETURNING id, user_id, platform, created_at, updated_at`,
      [userId, orgId, platformNorm, token, app_version || null, device_model || null, locale || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('push-tokens POST error:', err);
    res.status(500).json({ success: false, error: 'Failed to register push token' });
  }
});

// DELETE /api/v1/push-tokens/:token — unregister a device push token.
// Only the current owner can delete; tokens owned by other users return 404
// so we don't leak existence information.
router.delete('/:token', pushTokenWriteLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.params;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'token path parameter required' });
    }
    const result = await pool.query(
      'DELETE FROM device_push_tokens WHERE token = $1 AND user_id = $2 RETURNING id',
      [token, userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Push token not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('push-tokens DELETE error:', err);
    res.status(500).json({ success: false, error: 'Failed to unregister push token' });
  }
});

module.exports = router;
