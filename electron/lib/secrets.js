'use strict';

/**
 * Per-install secrets, generated on first launch and kept in the data
 * directory with owner-only permissions. Nothing here is ever regenerated on
 * a later launch unless the file is missing or unreadable: a JWT secret or
 * encryption key that changed between launches would sign every user out
 * and make encrypted columns unreadable.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GROUP_OTHER_MASK = 0o077;
const ADMIN_EMAIL = 'admin@controlweave.local';

function writePrivate(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function readPrivate(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const stats = fs.statSync(filePath);
    if (process.platform !== 'win32' && (stats.mode & GROUP_OTHER_MASK) !== 0) {
      fs.chmodSync(filePath, 0o600);
    }
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_) {
    return null;
  }
}

/** Load a hex secret of exactly `bytes` bytes, or create one. */
function loadOrCreateHex(dataDir, fileName, bytes) {
  const filePath = path.join(dataDir, fileName);
  const existing = readPrivate(filePath);
  if (existing && /^[0-9a-f]+$/i.test(existing) && existing.length === bytes * 2) {
    return existing;
  }
  const secret = crypto.randomBytes(bytes).toString('hex');
  writePrivate(filePath, `${secret}\n`);
  return secret;
}

function loadOrCreateJson(dataDir, fileName, isValid, create) {
  const filePath = path.join(dataDir, fileName);
  const raw = readPrivate(filePath);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isValid(parsed)) return parsed;
    } catch (_) {
      // Corrupt file: fall through and regenerate.
    }
  }
  const value = create();
  writePrivate(filePath, JSON.stringify(value, null, 2));
  return value;
}

function loadServiceSecrets(dataDir) {
  // jwt-secret, encryption-key and hmac-key keep the file names the previous
  // launcher used, so existing installs keep their sessions and encrypted data.
  // The old jwt-secret was 48 random bytes as hex; accept any >= 32 chars.
  const jwtPath = path.join(dataDir, 'jwt-secret');
  let jwtSecret = readPrivate(jwtPath);
  if (!jwtSecret || jwtSecret.length < 32) {
    jwtSecret = crypto.randomBytes(48).toString('hex');
    writePrivate(jwtPath, `${jwtSecret}\n`);
  }

  const db = loadOrCreateJson(
    dataDir,
    'db-credentials.json',
    (v) => v && typeof v.user === 'string' && typeof v.password === 'string' && v.password.length >= 16,
    () => ({ user: 'postgres', password: crypto.randomBytes(16).toString('hex') })
  );

  return {
    jwtSecret,
    encryptionKey: loadOrCreateHex(dataDir, 'encryption-key', 32),
    hmacKey: loadOrCreateHex(dataDir, 'hmac-key', 48),
    db,
  };
}

function generatePassword() {
  // Satisfies the backend password policy (upper, lower, digit, symbol, length).
  return `Cw-${crypto.randomBytes(12).toString('base64url')}-9a`;
}

/**
 * The first-run administrator account. `provisioned` turns true once the
 * backend confirms it set this password; from then on the launcher stops
 * sending it, so a password the user later changes in the app is never reset.
 */
function loadAdminCredentials(dataDir) {
  return loadOrCreateJson(
    dataDir,
    'admin-credentials.json',
    (v) => v && typeof v.email === 'string' && typeof v.password === 'string',
    () => ({ email: ADMIN_EMAIL, password: generatePassword(), provisioned: false, shownToUser: false })
  );
}

function saveAdminCredentials(dataDir, creds) {
  writePrivate(path.join(dataDir, 'admin-credentials.json'), JSON.stringify(creds, null, 2));
}

module.exports = {
  ADMIN_EMAIL,
  loadServiceSecrets,
  loadAdminCredentials,
  saveAdminCredentials,
};
