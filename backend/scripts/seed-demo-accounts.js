// @tier: exclude
/**
 * seed-demo-accounts.js
 *
 * Creates one admin account per demo industry (see DEMO_ADMIN_ACCOUNTS in
 * lib/demo-account-config.js) plus the external audit firm account.
 * Idempotent — safe to run multiple times.
 *
 * Each account's legacy tier-addressed email (admin@enterprise.com and
 * friends) is also seeded as an admin in the same organization, so links and
 * screenshots that predate the industry roster still log in.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');
const { encrypt, hashForLookup } = require('../src/utils/encrypt');
const {
  DEMO_ADMIN_ACCOUNTS,
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

const ACCOUNTS = DEMO_ADMIN_ACCOUNTS;

async function upsertOrg(client, acct) {
  // Always anchor by canonical org name so demo tiers cannot collapse into a shared org.
  const existingOrg = await client.query(
    'SELECT id FROM organizations WHERE name = $1',
    [acct.orgName]
  );
  if (existingOrg.rows.length > 0) {
    const orgId = existingOrg.rows[0].id;
    await client.query(
      'UPDATE organizations SET tier = $1, billing_status = $2 WHERE id = $3',
      [acct.tier, acct.billingStatus, orgId]
    );
    return orgId;
  }

  // Create a new org
  const res = await client.query(
    `INSERT INTO organizations (name, tier, billing_status)
     VALUES ($1, $2, $3) RETURNING id`,
    [acct.orgName, acct.tier, acct.billingStatus]
  );
  return res.rows[0].id;
}

/**
 * Upserts one admin user into an organization and returns its id.
 *
 * users.email is field-level encrypted at rest (migrations/101_user_pii_encryption.sql);
 * email_hash is the deterministic HMAC-SHA-384 lookup/uniqueness key, since
 * encrypt() uses a random IV and never produces the same ciphertext twice.
 *
 * password_hash is only overwritten when DEMO_ACCOUNT_PASSWORD is explicitly
 * set, so re-seeding never silently resets a password someone rotated.
 */
async function upsertDemoUser(client, { orgId, email, firstName, lastName, passwordHash }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const passwordClause = HAS_EXPLICIT_PASSWORD_OVERRIDE
    ? 'password_hash = EXCLUDED.password_hash,'
    : '';

  const userRes = await client.query(
    `INSERT INTO users (organization_id, email, email_hash, password_hash, first_name, last_name, role, is_active, failed_login_attempts, locked_until)
     VALUES ($1, $2, $3, $4, $5, $6, 'admin', true, 0, NULL)
     ON CONFLICT (email_hash) DO UPDATE
       SET organization_id        = EXCLUDED.organization_id,
           ${passwordClause}
           first_name             = EXCLUDED.first_name,
           last_name              = EXCLUDED.last_name,
           role                   = 'admin',
           is_active              = true,
           failed_login_attempts  = 0,
           locked_until           = NULL
     RETURNING id`,
    [
      orgId,
      encrypt(normalizedEmail),
      hashForLookup(normalizedEmail),
      passwordHash,
      firstName,
      lastName
    ]
  );
  return userRes.rows[0].id;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('\n🌱 Seeding demo industry accounts...\n');
    const passwordHash = await bcrypt.hash(PASSWORD, DEMO_BCRYPT_COST);

    for (const acct of ACCOUNTS) {
      await client.query('BEGIN');
      try {
        const orgId = await upsertOrg(client, acct);

        const userId = await upsertDemoUser(client, {
          orgId,
          email: acct.email,
          firstName: acct.firstName,
          lastName: acct.lastName,
          passwordHash
        });

        // Legacy tier-addressed logins stay usable as separate admin users in
        // the same organization so older docs and bookmarks do not break.
        for (const aliasEmail of acct.aliasEmails || []) {
          await upsertDemoUser(client, {
            orgId,
            email: aliasEmail,
            firstName: acct.firstName,
            lastName: acct.lastName,
            passwordHash
          });
        }

        // Mark onboarding complete so login goes straight to dashboard
        await client.query(
          `INSERT INTO organization_profiles
             (organization_id, onboarding_completed, onboarding_completed_at, created_by, updated_by)
           VALUES ($1, true, NOW(), $2, $2)
           ON CONFLICT (organization_id) DO UPDATE
             SET onboarding_completed    = true,
                 onboarding_completed_at = COALESCE(organization_profiles.onboarding_completed_at, NOW()),
                 updated_by = EXCLUDED.updated_by`,
          [orgId, userId]
        );

        await client.query('COMMIT');
        const aliasNote = acct.aliasEmails?.length ? ` (alias: ${acct.aliasEmails.join(', ')})` : '';
        console.log(`  ✓ ${acct.industry.padEnd(32)} — ${acct.email}${aliasNote}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed for ${acct.email}: ${err.message}`);
      }
    }

    if (HAS_EXPLICIT_PASSWORD_OVERRIDE) {
      // Do not echo the credential: the operator supplied it and it is a secret at rest.
      console.log('\n  Account passwords reset to the value supplied via the DEMO_ACCOUNT_PASSWORD environment variable.');
    } else {
      console.log('\n  New accounts use the default demo password documented in this script\'s header comment.');
      console.log('  Existing account passwords were preserved (set DEMO_ACCOUNT_PASSWORD to rotate them).');
    }
    console.log('  Account lockouts cleared and is_active=true ensured for all accounts.');
    console.log('\n✅ Demo accounts ready.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
