// @tier: community
'use strict';

const pool = require('../src/config/database');
const { encrypt, decrypt, hashForLookup, isEncrypted } = require('../src/utils/encrypt');
const { hasPublicColumn } = require('../src/utils/schema');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function backfillEmailHashes() {
  const hasEmailHash = await hasPublicColumn('users', 'email_hash');
  if (!hasEmailHash) {
    throw new Error('users.email_hash column is missing. Apply migration 101_user_pii_encryption.sql first.');
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, email, email_hash
       FROM users
       WHERE email IS NOT NULL
       ORDER BY created_at ASC, id ASC`
    );

    const usersToBackfill = result.rows.filter((row) => !String(row.email_hash || '').trim());

    if (usersToBackfill.length === 0) {
      console.log('No users require email hash backfill.');
      return;
    }

    const seenEmails = new Map();
    for (const row of result.rows) {
      const plaintextEmail = normalizeEmail(decrypt(row.email));
      if (!plaintextEmail) {
        throw new Error(`User ${row.id} has an empty email value after normalization.`);
      }

      const existing = seenEmails.get(plaintextEmail);
      if (existing) {
        throw new Error(
          `Duplicate normalized email detected for ${plaintextEmail} (${existing} and ${row.id}). Run cleanup:dedupe-user-emails before backfill.`
        );
      }
      seenEmails.set(plaintextEmail, row.id);
    }

    await client.query('BEGIN');

    let updated = 0;
    for (const row of usersToBackfill) {
      const plaintextEmail = normalizeEmail(decrypt(row.email));
      const emailHash = hashForLookup(plaintextEmail);
      const storedEmail = isEncrypted(row.email) ? row.email : encrypt(plaintextEmail);

      await client.query(
        `UPDATE users
         SET email = $2,
             email_hash = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, storedEmail, emailHash]
      );
      updated += 1;
    }

    await client.query('COMMIT');
    console.log(`Backfilled encrypted email + email_hash for ${updated} user(s).`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors when the transaction never began or the connection is already aborted.
    }
    throw error;
  } finally {
    client.release();
  }
}

backfillEmailHashes()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Email hash backfill failed:', error.message);
    await pool.end();
    process.exit(1);
  });
