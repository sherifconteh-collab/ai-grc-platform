// @tier: community
'use strict';

const pool = require('../src/config/database');
const { decrypt, encrypt, hashForLookup } = require('../src/utils/encrypt');
const { hasPublicColumn } = require('../src/utils/schema');

const TOMBSTONE_DOMAIN = 'controlweave.invalid';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildReplacementEmail(userId) {
  const compactId = String(userId || '').replace(/-/g, '').slice(0, 12) || 'user';
  return `duplicate+${compactId}@${TOMBSTONE_DOMAIN}`;
}

function sortUsersForPrimary(a, b) {
  if (Boolean(a.is_active) !== Boolean(b.is_active)) {
    return a.is_active ? -1 : 1;
  }

  const aCreatedAt = new Date(a.created_at).getTime();
  const bCreatedAt = new Date(b.created_at).getTime();
  if (aCreatedAt !== bCreatedAt) {
    return aCreatedAt - bCreatedAt;
  }

  return String(a.id).localeCompare(String(b.id));
}

async function dedupeUsersByEmail() {
  const hasEmailHash = await hasPublicColumn('users', 'email_hash');
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, email, is_active, created_at
       FROM users
       WHERE email IS NOT NULL
       ORDER BY created_at ASC, id ASC`
    );

    const groups = new Map();
    for (const row of result.rows) {
      const normalizedEmail = normalizeEmail(decrypt(row.email));
      if (!normalizedEmail) {
        continue;
      }

      const bucket = groups.get(normalizedEmail) || [];
      bucket.push(row);
      groups.set(normalizedEmail, bucket);
    }

    const duplicateGroups = Array.from(groups.entries())
      .map(([email, rows]) => [email, rows.slice().sort(sortUsersForPrimary)])
      .filter(([, rows]) => rows.length > 1);

    if (duplicateGroups.length === 0) {
      console.log('No duplicate normalized user emails found.');
      return;
    }

    await client.query('BEGIN');

    let updated = 0;
    for (const [normalizedEmail, rows] of duplicateGroups) {
      const [primaryUser, ...duplicates] = rows;
      console.log(`Keeping ${normalizedEmail} on user ${primaryUser.id}; rewriting ${duplicates.length} duplicate(s).`);

      for (const duplicateUser of duplicates) {
        const replacementEmail = buildReplacementEmail(duplicateUser.id);
        const replacementHash = hasEmailHash ? hashForLookup(replacementEmail) : null;
        const storedReplacementEmail = hasEmailHash ? encrypt(replacementEmail) : replacementEmail;

        if (hasEmailHash) {
          await client.query(
            `UPDATE users
             SET email = $2,
                 email_hash = $3,
                 updated_at = NOW()
             WHERE id = $1`,
            [duplicateUser.id, storedReplacementEmail, replacementHash]
          );
        } else {
          await client.query(
            `UPDATE users
             SET email = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [duplicateUser.id, storedReplacementEmail]
          );
        }
        updated += 1;
      }
    }

    await client.query('COMMIT');
    console.log(`Rewrote ${updated} duplicate user email(s).`);
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

dedupeUsersByEmail()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Duplicate user email cleanup failed:', error.message);
    await pool.end();
    process.exit(1);
  });
