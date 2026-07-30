// @tier: exclude
/**
 * seed-auditor-account.js
 *
 * Creates one auditor-role login per demo organization, derived from
 * DEMO_AUDITOR_ACCOUNTS so a newly added industry automatically gets a
 * matching auditor rather than silently having none.
 *
 * Idempotent — safe to run repeatedly. Requires the organizations to exist
 * already (run seed-demo-accounts.js first).
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');
const { encrypt, hashForLookup } = require('../src/utils/encrypt');
const {
  DEMO_AUDITOR_ACCOUNTS,
  DEFAULT_DEMO_PASSWORD,
  DEMO_BCRYPT_COST,
  resolveDemoAccountPassword
} = require('./lib/demo-account-config');

const PROVIDED_PASSWORD = String(process.env.DEMO_ACCOUNT_PASSWORD || '').trim();
const HAS_EXPLICIT_PASSWORD_OVERRIDE = PROVIDED_PASSWORD.length > 0;
const PASSWORD = resolveDemoAccountPassword(
  { value: PROVIDED_PASSWORD, label: 'DEMO_ACCOUNT_PASSWORD' },
  DEFAULT_DEMO_PASSWORD
);

/**
 * users.email is field-level encrypted at rest, so email_hash (deterministic
 * HMAC) is the only usable conflict target — inserting a plaintext email with
 * a NULL email_hash produces a row that the login lookup can never find.
 */
async function upsertAuditorUser(client, { orgId, email, firstName, lastName, passwordHash }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const passwordClause = HAS_EXPLICIT_PASSWORD_OVERRIDE
    ? 'password_hash = EXCLUDED.password_hash,'
    : '';

  await client.query(
    `INSERT INTO users (organization_id, email, email_hash, password_hash, first_name, last_name, role, is_active, failed_login_attempts, locked_until)
     VALUES ($1, $2, $3, $4, $5, $6, 'auditor', true, 0, NULL)
     ON CONFLICT (email_hash) DO UPDATE
       SET organization_id        = EXCLUDED.organization_id,
           ${passwordClause}
           first_name             = EXCLUDED.first_name,
           last_name              = EXCLUDED.last_name,
           role                   = 'auditor',
           is_active              = true,
           failed_login_attempts  = 0,
           locked_until           = NULL`,
    [
      orgId,
      encrypt(normalizedEmail),
      hashForLookup(normalizedEmail),
      passwordHash,
      firstName,
      lastName
    ]
  );
}

async function run() {
  const client = await pool.connect();
  let seeded = 0;
  try {
    console.log('\n🌱 Seeding auditor demo accounts...\n');
    const passwordHash = await bcrypt.hash(PASSWORD, DEMO_BCRYPT_COST);

    for (const acct of DEMO_AUDITOR_ACCOUNTS) {
      await client.query('BEGIN');
      try {
        const orgResult = await client.query(
          'SELECT id FROM organizations WHERE name = $1',
          [acct.orgName]
        );

        if (orgResult.rows.length === 0) {
          console.log(`  ✗ Organization not found: ${acct.orgName} (run seed:demo-accounts first)`);
          await client.query('ROLLBACK');
          continue;
        }

        const orgId = orgResult.rows[0].id;

        for (const address of [acct.email, ...(acct.aliasEmails || [])]) {
          await upsertAuditorUser(client, {
            orgId,
            email: address,
            firstName: acct.firstName,
            lastName: acct.lastName,
            passwordHash
          });
        }

        await client.query('COMMIT');
        seeded += 1;
        const aliasNote = acct.aliasEmails?.length ? ` (alias: ${acct.aliasEmails.join(', ')})` : '';
        console.log(`  ✓ auditor — ${acct.email}${aliasNote} (${acct.orgName})`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed for ${acct.email}: ${err.message}`);
      }
    }

    if (seeded === 0) {
      throw new Error('No auditor accounts were seeded — no demo organizations found.');
    }

    // Never echo the credential itself: when the operator supplies
    // DEMO_ACCOUNT_PASSWORD it is a secret at rest, and printing the built-in
    // default trains people to copy it out of CI logs.
    if (HAS_EXPLICIT_PASSWORD_OVERRIDE) {
      console.log('\n  Auditor account passwords reset to the value supplied via DEMO_ACCOUNT_PASSWORD.');
    } else {
      console.log('\n  New auditor accounts use the default demo password documented in the repository README.');
      console.log('  Existing auditor passwords were preserved (set DEMO_ACCOUNT_PASSWORD to rotate).');
    }
    console.log('\n✅ Auditor demo accounts ready.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(`\n❌ Auditor account seeding failed: ${error.message}\n`);
  process.exitCode = 1;
});
