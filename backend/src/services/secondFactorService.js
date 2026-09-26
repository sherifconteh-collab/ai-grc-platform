'use strict';

const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { decrypt } = require('../utils/encrypt');
const { verifyTOTP } = require('../utils/totp');

/**
 * Verifies a TOTP code, falling back to a single-use backup code. A matched
 * backup code is consumed. Shared by password login and the SSO handoff
 * exchange so that neither path can issue tokens past an enabled second
 * factor.
 *
 * @param {{ id: string, totp_secret: string|null, totp_backup_codes: string[]|null }} user
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function verifyTotpOrBackupCode(user, code) {
  const submitted = String(code || '').trim();
  if (!submitted) return false;

  const totpSecret = user.totp_secret ? decrypt(user.totp_secret) : null;
  if (verifyTOTP(totpSecret, submitted)) return true;

  const backupHashes = Array.isArray(user.totp_backup_codes) ? user.totp_backup_codes : [];
  for (let i = 0; i < backupHashes.length; i++) {
    if (await bcrypt.compare(submitted, backupHashes[i])) {
      const remaining = [...backupHashes.slice(0, i), ...backupHashes.slice(i + 1)];
      await pool.query(
        'UPDATE users SET totp_backup_codes = $1 WHERE id = $2',
        [JSON.stringify(remaining), user.id]
      );
      return true;
    }
  }
  return false;
}

module.exports = { verifyTotpOrBackupCode };
