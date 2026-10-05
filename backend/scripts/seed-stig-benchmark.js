// @tier: community
'use strict';

/**
 * Seeds a STIG framework produced by scripts/import-stig-xccdf.js and
 * crosswalks it to NIST SP 800-53 Rev 5 through its CCIs.
 *
 *   node scripts/seed-stig-benchmark.js <code>
 *
 * Replaces the framework's controls wholesale, so re-running it against a
 * newer import is safe for the catalog but drops implementations recorded
 * against removed rules. The framework modules live in
 * lib/frameworks/supplemental/ and are not part of the default catalog seed.
 */

require('dotenv').config({ quiet: true });
const path = require('path');
const { Pool } = require('pg');
const { replaceFrameworkControls, insertCciCrosswalks } = require('./lib/frameworks/stigSeedHelpers');

async function main() {
  const code = process.argv[2];
  if (!code || !/^[a-z0-9_]+$/.test(code)) {
    console.error('usage: node scripts/seed-stig-benchmark.js <code>');
    process.exit(1);
  }
  const framework = require(path.join(__dirname, 'lib', 'frameworks', 'supplemental', `${code}.js`));
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const frameworkId = await replaceFrameworkControls(client, framework, framework.name);
    const { inserted, missing } = await insertCciCrosswalks(client, frameworkId, framework.controls);
    await client.query('COMMIT');
    console.log(`Crosswalks to NIST SP 800-53 Rev 5: ${inserted} inserted.`);
    if (missing.length) console.log(`800-53 controls not in the catalog (skipped): ${missing.join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Seeding ${code} failed:`, error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
