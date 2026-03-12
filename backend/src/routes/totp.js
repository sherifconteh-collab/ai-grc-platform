// @tier: community  (TOTP/2FA is available to all subscription tiers)
'use strict';

/**
 * TOTP Two-Factor Authentication Routes
 *
 * Available to ALL tiers (Community, Pro, Enterprise, Gov Cloud).
 * Passkey authentication remains gated at Enterprise+ — TOTP fills the gap
 * for users on lower tiers who want stronger account security.
 *
 * Endpoints:
 *   GET  /api/v1/auth/totp/status          — check whether TOTP is enabled
 *   POST /api/v1/auth/totp/setup           — initiate setup; returns secret + otpauth URI
 *   POST /api/v1/auth/totp/verify          — confirm first code and activate TOTP
 *   POST /api/v1/auth/totp/disable         — disable TOTP (requires password re-auth)
 *   POST /api/v1/auth/totp/backup-codes    — regenerate backup codes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { generateTOTPSecret, verifyTOTP, buildOtpauthURI, generateBackupCodes } = require('../utils/totp');
const { validateBody, requireFields } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { encrypt, decrypt } = require('../utils/encrypt');

const totpLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  label: 'totp'
});

// ─── GET /status ─────────────────────────────────────────────────────────────

router.get('/status', totpLimiter, authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT totp_enabled, totp_verified_at FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.json({
      success: true,
      data: {
        totp_enabled: Boolean(user.totp_enabled),
        totp_verified_at: user.totp_verified_at || null
      }
    });
  } catch (error) {
    console.error('TOTP status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch TOTP status' });
  }
});

// ─── POST /setup ─────────────────────────────────────────────────────────────
// Generates a new TOTP secret and returns the otpauth URI. The secret is stored
// temporarily (not yet enabled) until the user verifies their first code.

router.post('/setup', totpLimiter, authenticate, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, email, totp_enabled FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.totp_enabled) {
      return res.status(409).json({
        success: false,
        error: 'TOTP is already enabled. Disable it first before setting up a new authenticator.'
      });
    }

    const secret = generateTOTPSecret();
    const otpauthUri = buildOtpauthURI(secret, user.email);

    // Store the unverified secret so /verify can confirm it.
    await pool.query(
      `UPDATE users SET totp_secret = $1, totp_enabled = false, totp_verified_at = NULL WHERE id = $2`,
      [encrypt(secret), user.id]
    );

    return res.json({
      success: true,
      message: 'Scan the QR code (or enter the secret manually) in your authenticator app, then call /verify with a valid code.',
      data: {
        otpauth_uri: otpauthUri,
        secret
      }
    });
  } catch (error) {
    console.error('TOTP setup error:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate TOTP setup' });
  }
});

// ─── POST /verify ─────────────────────────────────────────────────────────────
// Verifies the first TOTP code from the authenticator app and activates TOTP.
// Also generates and returns the initial set of backup codes.

router.post(
  '/verify',
  totpLimiter,
  authenticate,
  validateBody((body) => requireFields(body, ['code'])),
  async (req, res) => {
    try {
      const { code } = req.body;

      const userResult = await pool.query(
        `SELECT id, totp_secret, totp_enabled FROM users WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );
      const user = userResult.rows[0];
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      if (!user.totp_secret) {
        return res.status(400).json({
          success: false,
          error: 'No TOTP setup in progress. Call /setup first.'
        });
      }
      if (user.totp_enabled) {
        return res.status(409).json({
          success: false,
          error: 'TOTP is already enabled.'
        });
      }

      const decryptedSecret = user.totp_secret ? decrypt(user.totp_secret) : null;
      if (!verifyTOTP(decryptedSecret, code)) {
        return res.status(400).json({ success: false, error: 'Invalid TOTP code. Please try again.' });
      }

      // Generate backup codes (plain-text) and store their bcrypt hashes.
      const plainCodes = generateBackupCodes(8);
      const BCRYPT_ROUNDS = 10;
      const hashedCodes = await Promise.all(
        plainCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS))
      );

      await pool.query(
        `UPDATE users
         SET totp_enabled = true, totp_verified_at = NOW(), totp_backup_codes = $1
         WHERE id = $2`,
        [JSON.stringify(hashedCodes), user.id]
      );

      return res.json({
        success: true,
        message: 'TOTP two-factor authentication enabled successfully.',
        data: {
          backup_codes: plainCodes,
          backup_codes_note: 'Store these codes securely. Each code can only be used once.'
        }
      });
    } catch (error) {
      console.error('TOTP verify error:', error);
      return res.status(500).json({ success: false, error: 'Failed to verify TOTP code' });
    }
  }
);

// ─── POST /disable ─────────────────────────────────────────────────────────────
// Disables TOTP. Requires the current password as re-authentication.

router.post(
  '/disable',
  totpLimiter,
  authenticate,
  validateBody((body) => requireFields(body, ['password'])),
  async (req, res) => {
    try {
      const { password } = req.body;

      const userResult = await pool.query(
        `SELECT id, password_hash, totp_enabled FROM users WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );
      const user = userResult.rows[0];
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      if (!user.totp_enabled) {
        return res.status(400).json({ success: false, error: 'TOTP is not currently enabled.' });
      }

      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
      }

      await pool.query(
        `UPDATE users
         SET totp_enabled = false, totp_secret = NULL, totp_verified_at = NULL, totp_backup_codes = NULL
         WHERE id = $1`,
        [user.id]
      );

      return res.json({ success: true, message: 'TOTP two-factor authentication disabled.' });
    } catch (error) {
      console.error('TOTP disable error:', error);
      return res.status(500).json({ success: false, error: 'Failed to disable TOTP' });
    }
  }
);

// ─── POST /backup-codes ────────────────────────────────────────────────────────
// Regenerate backup codes. Invalidates all previous codes.

router.post(
  '/backup-codes',
  totpLimiter,
  authenticate,
  validateBody((body) => requireFields(body, ['password'])),
  async (req, res) => {
    try {
      const { password } = req.body;

      const userResult = await pool.query(
        `SELECT id, password_hash, totp_enabled FROM users WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );
      const user = userResult.rows[0];
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      if (!user.totp_enabled) {
        return res.status(400).json({ success: false, error: 'TOTP is not currently enabled.' });
      }

      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
      }

      const plainCodes = generateBackupCodes(8);
      const BCRYPT_ROUNDS = 10;
      const hashedCodes = await Promise.all(
        plainCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS))
      );

      await pool.query(
        `UPDATE users SET totp_backup_codes = $1 WHERE id = $2`,
        [JSON.stringify(hashedCodes), user.id]
      );

      return res.json({
        success: true,
        message: 'Backup codes regenerated. Previous codes are now invalid.',
        data: {
          backup_codes: plainCodes,
          backup_codes_note: 'Store these codes securely. Each code can only be used once.'
        }
      });
    } catch (error) {
      console.error('TOTP backup-codes error:', error);
      return res.status(500).json({ success: false, error: 'Failed to regenerate backup codes' });
    }
  }
);

module.exports = router;
