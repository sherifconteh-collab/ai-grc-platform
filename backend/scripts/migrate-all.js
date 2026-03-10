// @tier: free
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../src/config/database');

const migrationsDir = path.join(__dirname, '../migrations');

function getChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function isRecoverableAlreadyAppliedError(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('already exists') ||
    message.includes('already a relation') ||
    message.includes('duplicate key value violates unique constraint') ||
    message.includes('duplicate_object') ||
    message.includes('already applied')
  );
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function runMigrations() {
  const client = await pool.connect();
  const baselineOnError = (process.env.MIGRATION_BASELINE_ON_ERROR || 'true').toLowerCase() === 'true';
  const allowChecksumDrift = (process.env.MIGRATION_ALLOW_CHECKSUM_DRIFT || 'true').toLowerCase() === 'true';

  try {
    await ensureMigrationsTable(client);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    for (const filename of files) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const checksum = getChecksum(sql);

      const existingResult = await client.query(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename]
      );

      if (existingResult.rows.length > 0) {
        const existingChecksum = existingResult.rows[0].checksum;
        if (existingChecksum !== checksum) {
          if (!allowChecksumDrift) {
            throw new Error(`Checksum mismatch for already-applied migration ${filename}.`);
          }

          console.warn(
            `WARN ${filename} checksum drift detected. Updating stored checksum to current file content.`
          );
          await client.query(
            'UPDATE schema_migrations SET checksum = $2, applied_at = NOW() WHERE filename = $1',
            [filename, checksum]
          );
          continue;
        }
        console.log(`SKIP ${filename} (already applied)`);
        continue;
      }

      console.log(`APPLY ${filename}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum]
        );
        await client.query('COMMIT');
        console.log(`OK   ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        if (baselineOnError && isRecoverableAlreadyAppliedError(error)) {
          console.warn(`WARN ${filename} appears already applied (${error.message}). Recording baseline.`);
          await client.query(
            'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
            [filename, checksum]
          );
          continue;
        }
        throw new Error(`Migration failed (${filename}): ${error.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    console.log('\nAll migrations complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration run failed:', error.message);
    process.exit(1);
  });
