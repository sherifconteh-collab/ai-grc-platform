// @tier: community
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../src/config/database');

const migrationsDir = path.join(__dirname, '../migrations');
const DESKTOP_RECONCILE_FILENAME = '100_desktop_schema_reconcile.sql';

function sanitizeSqlForNonUtf8Server(sql) {
  const replacements = new Map([
    ['\u2010', '-'],
    ['\u2011', '-'],
    ['\u2012', '-'],
    ['\u2013', '-'],
    ['\u2014', '-'],
    ['\u2015', '-'],
    ['\u2018', "'"],
    ['\u2019', "'"],
    ['\u201c', '"'],
    ['\u201d', '"'],
    ['\u2022', '*'],
    ['\u2026', '...'],
    ['\u2192', '->'],
    ['\u2212', '-'],
    ['\u00a0', ' '],
    ['\ufeff', ''],
  ]);

  const replaced = sql.replace(/[\u00a0\u2010-\u2015\u2018\u2019\u201c\u201d\u2022\u2026\u2192\u2212\ufeff]/g, (char) => replacements.get(char) || char);
  return replaced.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
}

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
  const reconcileFirst = (process.env.DESKTOP_SCHEMA_RECONCILE_FIRST || 'false').toLowerCase() === 'true';

  try {
    await ensureMigrationsTable(client);
    const encodingResult = await client.query('SHOW SERVER_ENCODING');
    const serverEncoding = String(encodingResult.rows[0]?.server_encoding || '').toUpperCase();
    const requiresAsciiSql = serverEncoding !== 'UTF8';

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b));

    const orderedFiles = reconcileFirst && files.includes(DESKTOP_RECONCILE_FILENAME)
      ? [DESKTOP_RECONCILE_FILENAME, ...files.filter((file) => file !== DESKTOP_RECONCILE_FILENAME)]
      : files;

    if (orderedFiles.length === 0) {
      console.log('No migration files found.');
      return;
    }

    for (const filename of orderedFiles) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const sqlToExecute = requiresAsciiSql ? sanitizeSqlForNonUtf8Server(sql) : sql;
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
        if (requiresAsciiSql && sqlToExecute !== sql) {
          console.warn(`WARN ${filename} contained non-ASCII characters; sanitizing SQL for server encoding ${serverEncoding}.`);
        }
        await client.query(sqlToExecute);
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
