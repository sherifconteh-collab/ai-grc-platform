// @tier: enterprise
'use strict';

const express = require('express');
const router = express.Router();
const { createHash } = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticate, requireTier } = require('../middleware/auth');
const PASSKEY_TIER = 'enterprise'; // Passkeys available on Enterprise+
const passkey = require('../services/passkeyService');
const pool = require('../config/database');
const { JWT_SECRET } = require('../config/security');
const { validateBody, requireFields } = require('../middleware/validate');
const { decrypt } = require('../utils/encrypt');
const { resolveExpiryTimestampFromNow } = require('../utils/sessionExpiry');

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

function issueTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

function hashRefreshToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

// ─── Registration (requires existing login) ──────────────────────────────────

// GET /auth/passkey/register/options
router.get('/register/options', authenticate, requireTier(PASSKEY_TIER), async (req, res) => {
  try {
    const options = await passkey.getRegistrationOptions(req.user);
    return res.json({ data: options });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: 'Failed to generate passkey registration options' });
  }
});

// POST /auth/passkey/register/verify
router.post(
  '/register/verify',
  authenticate,
  requireTier(PASSKEY_TIER),
  validateBody((body) => requireFields(body, ['response'])),
  async (req, res) => {
    try {
      const { response, name } = req.body;
      const result = await passkey.verifyRegistration(req.user, response, name);
      return res.json({ data: result });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: 'Passkey registration verification failed' });
    }
  }
);

// ─── Authentication (public) ──────────────────────────────────────────────────

// POST /auth/passkey/auth/options
router.post('/auth/options', async (req, res) => {
  try {
    const { email } = req.body || {};
    const { options, challengeId } = await passkey.getAuthenticationOptions(email);
    return res.json({ data: { options, challengeId } });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: 'Failed to generate passkey authentication options' });
  }
});

// POST /auth/passkey/auth/verify
router.post(
  '/auth/verify',
  validateBody((body) => requireFields(body, ['response', 'challengeId'])),
  async (req, res) => {
    try {
      const { response, challengeId } = req.body;
      const { user } = await passkey.verifyAuthentication(response, challengeId);

      // Fetch full user details for token
      const userRow = await pool.query(
        `SELECT u.*,
                TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
                o.name AS org_name
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id = $1`,
        [user.id]
      );
      if (userRow.rows.length === 0) {
        return res.status(401).json({ error: 'User not found.' });
      }

      const fullUser = userRow.rows[0];
      const plainEmail = decrypt(fullUser.email);
      const { accessToken, refreshToken } = issueTokens(fullUser.id);
      const sessionExpiresAt = resolveExpiryTimestampFromNow(REFRESH_EXPIRY, 'JWT_REFRESH_EXPIRY');
      await pool.query(
        'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [fullUser.id, hashRefreshToken(refreshToken), sessionExpiresAt]
      );

      return res.json({
        data: {
          accessToken,
          refreshToken,
          user: {
            id: fullUser.id,
            email: plainEmail,
            full_name: fullUser.full_name,
            role: fullUser.role,
            organization_id: fullUser.organization_id,
            org_name: fullUser.org_name,
          },
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: 'Passkey authentication verification failed' });
    }
  }
);

// ─── Passkey Management (requires login) ─────────────────────────────────────

// GET /auth/passkey/list
router.get('/list', authenticate, requireTier(PASSKEY_TIER), async (req, res) => {
  try {
    const passkeys = await passkey.listPasskeys(req.user.id);
    return res.json({ data: passkeys });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list passkeys' });
  }
});

// DELETE /auth/passkey/:id
router.delete('/:id', authenticate, requireTier(PASSKEY_TIER), async (req, res) => {
  try {
    const deleted = await passkey.deletePasskey(req.user.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Passkey not found.' });
    return res.json({ data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete passkey' });
  }
});

// PATCH /auth/passkey/:id/rename
router.patch(
  '/:id/rename',
  authenticate,
  requireTier(PASSKEY_TIER),
  validateBody((body) => requireFields(body, ['name'])),
  async (req, res) => {
    try {
      const renamed = await passkey.renamePasskey(req.user.id, req.params.id, req.body.name);
      if (!renamed) return res.status(404).json({ error: 'Passkey not found.' });
      return res.json({ data: { renamed: true } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to rename passkey' });
    }
  }
);

module.exports = router;
