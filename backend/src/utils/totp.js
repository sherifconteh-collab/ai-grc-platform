// @tier: community  (TOTP/2FA is available to all tiers)
'use strict';

/**
 * TOTP (Time-based One-Time Password) utility — RFC 6238 / RFC 4226
 *
 * Implemented with Node.js built-in `crypto` so no additional runtime
 * dependency is required.  Secrets are stored as Base32-encoded strings;
 * tokens are 6-digit numeric codes with a ±1 step tolerance window.
 */

const crypto = require('crypto');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // number of steps before/after to tolerate clock skew

/**
 * Encode a Buffer to a Base32 string.
 * @param {Buffer} buffer
 * @returns {string}
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decode a Base32 string to a Buffer.
 * @param {string} encoded
 * @returns {Buffer}
 */
function base32Decode(encoded) {
  const normalized = encoded.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const output = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < normalized.length; i++) {
    const idx = BASE32_CHARS.indexOf(normalized[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${normalized[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/**
 * Generate a cryptographically random TOTP secret (160-bit / 20 bytes, Base32-encoded).
 * @returns {string} Base32-encoded secret
 */
function generateTOTPSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Compute a single HOTP code for the given key and counter (RFC 4226).
 * @param {Buffer} key
 * @param {bigint} counter
 * @returns {string} zero-padded 6-digit code
 */
function computeHOTP(key, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, TOTP_DIGITS));
  return String(code).padStart(TOTP_DIGITS, '0');
}

/**
 * Verify a TOTP token against the provided Base32 secret.
 * Accepts codes within ±TOTP_WINDOW time-steps to tolerate clock skew.
 *
 * @param {string} secret  Base32-encoded TOTP secret
 * @param {string|number} token  The 6-digit code to verify
 * @returns {boolean}
 */
function verifyTOTP(secret, token) {
  const tokenStr = String(token).trim();
  if (!/^\d{6}$/.test(tokenStr)) {
    return false;
  }
  let key;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }
  const timeStep = BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS));
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    if (computeHOTP(key, timeStep + BigInt(delta)) === tokenStr) {
      return true;
    }
  }
  return false;
}

/**
 * Build an otpauth:// URI compatible with Google Authenticator, Authy, etc.
 *
 * @param {string} secret   Base32-encoded secret
 * @param {string} email    Account email (shown in the authenticator app)
 * @param {string} [issuer] App / brand name
 * @returns {string} otpauth URI
 */
function buildOtpauthURI(secret, email, issuer = 'ControlWeave') {
  const safeEmail = encodeURIComponent(email);
  const safeIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${safeIssuer}:${safeEmail}?secret=${secret}&issuer=${safeIssuer}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}&algorithm=SHA1`;
}

/**
 * Generate a set of one-time backup codes (plain-text, hex format).
 * The caller is responsible for hashing these before storing them.
 *
 * @param {number} [count=8]
 * @returns {string[]} Array of plain-text backup codes
 */
function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase()
  );
}

module.exports = {
  generateTOTPSecret,
  verifyTOTP,
  buildOtpauthURI,
  generateBackupCodes
};
