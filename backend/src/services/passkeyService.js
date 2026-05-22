// @tier: enterprise
'use strict';

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const pool = require('../config/database');
const { hashForLookup } = require('../utils/encrypt');
const { hasPublicColumn } = require('../utils/schema');

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'ControlWeave';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || `https://${RP_ID}`;
let passkeyEmailHashColumnAvailable = null;

async function hasPasskeyEmailHashColumn() {
  if (passkeyEmailHashColumnAvailable === null) {
    passkeyEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
  }

  return passkeyEmailHashColumnAvailable;
}

function buildFullName(user) {
  const composed = [user?.first_name, user?.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return composed || user?.full_name || user?.email || 'User';
}

// ─── challenge helpers ───────────────────────────────────────────────────────

async function saveChallenge(userId, challenge, type) {
  // clean up any stale challenges for this user + type first
  await pool.query(
    `DELETE FROM passkey_challenges WHERE user_id = $1 AND type = $2`,
    [userId, type]
  );
  await pool.query(
    `INSERT INTO passkey_challenges (user_id, challenge, type)
     VALUES ($1, $2, $3)`,
    [userId, challenge, type]
  );
}

async function consumeChallenge(userId, type) {
  const result = await pool.query(
    `DELETE FROM passkey_challenges
     WHERE user_id = $1 AND type = $2 AND expires_at > NOW()
     RETURNING challenge`,
    [userId, type]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].challenge;
}

// For authentication we store challenge keyed on a session token (no user_id yet)
async function saveChallengeAnon(challenge) {
  const result = await pool.query(
    `INSERT INTO passkey_challenges (user_id, challenge, type)
     VALUES (NULL, $1, 'authentication')
     RETURNING id`,
    [challenge]
  );
  return result.rows[0].id; // use as session token
}

async function consumeChallengeAnon(challengeId) {
  const result = await pool.query(
    `DELETE FROM passkey_challenges
     WHERE id = $1 AND type = 'authentication' AND expires_at > NOW()
     RETURNING challenge`,
    [challengeId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].challenge;
}

// ─── registration ────────────────────────────────────────────────────────────

async function getRegistrationOptions(user) {
  const existingPasskeys = await pool.query(
    `SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1`,
    [user.id]
  );

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(user.id, 'utf8'),
    userName: user.email,
    userDisplayName: buildFullName(user),
    excludeCredentials: existingPasskeys.rows.map((pk) => ({
      id: pk.credential_id,
      transports: pk.transports || [],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await saveChallenge(user.id, options.challenge, 'registration');
  return options;
}

async function verifyRegistration(user, response, passkeyName) {
  const expectedChallenge = await consumeChallenge(user.id, 'registration');
  if (!expectedChallenge) {
    throw Object.assign(new Error('No valid registration challenge found. Please try again.'), { statusCode: 400 });
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw Object.assign(new Error('Passkey registration verification failed.'), { statusCode: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await pool.query(
    `INSERT INTO user_passkeys
       (user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (credential_id) DO NOTHING`,
    [
      user.id,
      credential.id,
      Buffer.from(credential.publicKey).toString('base64url'),
      credential.counter,
      credentialDeviceType,
      credentialBackedUp,
      response.response.transports || [],
      passkeyName || 'Passkey',
    ]
  );

  return { verified: true };
}

// ─── authentication ──────────────────────────────────────────────────────────

async function getAuthenticationOptions(email) {
  let allowCredentials = [];
  let userId = null;

  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    let userResult;

    if (await hasPasskeyEmailHashColumn()) {
      const emailHash = hashForLookup(normalizedEmail);
      userResult = await pool.query(
        `SELECT u.id
         FROM users u
         WHERE u.email_hash = $1
           AND u.is_active = true
         LIMIT 1`,
        [emailHash]
      );

      if (userResult.rows.length === 0) {
        userResult = await pool.query(
          `SELECT u.id
           FROM users u
           WHERE u.email = $1
             AND u.email_hash IS NULL
             AND u.is_active = true
           LIMIT 1`,
          [normalizedEmail]
        );
      }
    } else {
      userResult = await pool.query(
        `SELECT u.id
         FROM users u
         WHERE u.email = $1
           AND u.is_active = true
         LIMIT 1`,
        [normalizedEmail]
      );
    }

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      const creds = await pool.query(
        `SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1`,
        [userId]
      );
      allowCredentials = creds.rows.map((c) => ({
        id: c.credential_id,
        transports: c.transports || [],
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials,
  });

  const challengeId = await saveChallengeAnon(options.challenge);
  return { options, challengeId };
}

async function verifyAuthentication(response, challengeId) {
  const expectedChallenge = await consumeChallengeAnon(challengeId);
  if (!expectedChallenge) {
    throw Object.assign(new Error('No valid authentication challenge found. Please try again.'), { statusCode: 400 });
  }

  // Look up the credential
  const credResult = await pool.query(
    `SELECT pk.*,
            u.id AS uid,
            u.email,
            TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
            u.role,
            u.organization_id,
            u.is_active
     FROM user_passkeys pk
     JOIN users u ON u.id = pk.user_id
     WHERE pk.credential_id = $1`,
    [response.id]
  );

  if (credResult.rows.length === 0) {
    throw Object.assign(new Error('Passkey not found.'), { statusCode: 401 });
  }

  const passkey = credResult.rows[0];
  if (!passkey.is_active) {
    throw Object.assign(new Error('Account is deactivated.'), { statusCode: 403 });
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: passkey.credential_id,
      publicKey: Buffer.from(passkey.public_key, 'base64url'),
      counter: Number(passkey.counter),
      transports: passkey.transports || [],
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw Object.assign(new Error('Passkey authentication failed.'), { statusCode: 401 });
  }

  // Update counter and last_used_at
  await pool.query(
    `UPDATE user_passkeys
     SET counter = $1, last_used_at = NOW()
     WHERE credential_id = $2`,
    [verification.authenticationInfo.newCounter, passkey.credential_id]
  );

  return {
    user: {
      id: passkey.uid,
      email: passkey.email,
      full_name: passkey.full_name,
      role: passkey.role,
      organization_id: passkey.organization_id,
    },
  };
}

// ─── passkey management ──────────────────────────────────────────────────────

async function listPasskeys(userId) {
  const result = await pool.query(
    `SELECT id, name, device_type, backed_up, transports, created_at, last_used_at
     FROM user_passkeys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function deletePasskey(userId, passkeyId) {
  const result = await pool.query(
    `DELETE FROM user_passkeys WHERE id = $1 AND user_id = $2 RETURNING id`,
    [passkeyId, userId]
  );
  return result.rowCount > 0;
}

async function renamePasskey(userId, passkeyId, name) {
  const result = await pool.query(
    `UPDATE user_passkeys SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id`,
    [name.slice(0, 255), passkeyId, userId]
  );
  return result.rowCount > 0;
}

module.exports = {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listPasskeys,
  deletePasskey,
  renamePasskey,
};
