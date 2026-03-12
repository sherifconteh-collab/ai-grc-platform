// @tier: community
'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is required in production');
    }
    // In development/test, use a deterministic fallback so existing plain-text
    // values continue to work (they are detected and returned as-is by decrypt).
    return Buffer.from('dev-fallback-key-32bytes-padding!!', 'utf8').slice(0, 32);
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return buf;
}

/**
 * Encrypt a plaintext string.
 * Returns a JSON string: { iv, ciphertext, tag } — all base64-encoded.
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

/**
 * Decrypt a value produced by encrypt().
 * If the value is not valid encrypted JSON (e.g. a legacy plain-text key),
 * it is returned as-is so existing rows continue to work until re-encrypted.
 */
function decrypt(stored) {
  if (!stored) return stored;
  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    // Not JSON — treat as plain-text legacy value
    return stored;
  }
  if (!parsed.iv || !parsed.ciphertext || !parsed.tag) {
    // Partial or unexpected JSON — return as-is
    return stored;
  }
  const key = getKey();
  const iv = Buffer.from(parsed.iv, 'base64');
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Returns true if the stored value looks like an encrypted envelope.
 */
function isEncrypted(stored) {
  if (!stored) return false;
  try {
    const p = JSON.parse(stored);
    return !!(p.iv && p.ciphertext && p.tag);
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, isEncrypted };
