// @tier: exclude
/**
 * seed-demo-accounts.js
 *
 * Creates one admin account per tier so every tier can be demoed.
 * Idempotent — safe to run multiple times.
 *
 * Accounts created:
 *   admin@enterprise.com   / ControlWeave!2026  — enterprise tier
 *   admin@govcloud.com     / ControlWeave!2026  — govcloud tier
 *   admin@pro.com          / ControlWeave!2026  — pro tier
 *   admin@community.com    / ControlWeave!2026  — community tier
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');
const {
  DEMO_ADMIN_ACCOUNTS,
  DEFAULT_DEMO_PASSWORD,
  MIN_DEMO_PASSWORD_LENGTH,
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

async function run() {
  const client = await pool.connect();
  try {
    console.log('\n🌱 Seeding demo tier accounts...\n');
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    for (const acct of ACCOUNTS) {
      await client.query('BEGIN');
      try {
        const orgId = await upsertOrg(client, acct);

        // Upsert user (email is unique)
        // Always reset lockout state and ensure account is active.
        // Only update password_hash when DEMO_ACCOUNT_PASSWORD is explicitly provided.
        if (HAS_EXPLICIT_PASSWORD_OVERRIDE) {
          await client.query(
            `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_active, failed_login_attempts, locked_until)
             VALUES ($1, $2, $3, $4, $5, 'admin', true, 0, NULL)
             ON CONFLICT (email) DO UPDATE
               SET organization_id        = EXCLUDED.organization_id,
                   password_hash          = EXCLUDED.password_hash,
                   first_name             = EXCLUDED.first_name,
                   last_name              = EXCLUDED.last_name,
                   role                   = 'admin',
                   is_active              = true,
                   failed_login_attempts  = 0,
                   locked_until           = NULL`,
            [orgId, acct.email, passwordHash, acct.firstName, acct.lastName]
          );
        } else {
          await client.query(
            `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_active, failed_login_attempts, locked_until)
             VALUES ($1, $2, $3, $4, $5, 'admin', true, 0, NULL)
             ON CONFLICT (email) DO UPDATE
               SET organization_id        = EXCLUDED.organization_id,
                   first_name             = EXCLUDED.first_name,
                   last_name              = EXCLUDED.last_name,
                   role                   = 'admin',
                   is_active              = true,
                   failed_login_attempts  = 0,
                   locked_until           = NULL`,
            [orgId, acct.email, passwordHash, acct.firstName, acct.lastName]
          );
        }

        // Get user id for profile
        const userRes = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [acct.email]
        );
        const userId = userRes.rows[0].id;

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
        console.log(`  ✓ ${acct.tier.padEnd(12)} — ${acct.email}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed for ${acct.email}: ${err.message}`);
      }
    }

    if (HAS_EXPLICIT_PASSWORD_OVERRIDE) {
      console.log(`\n  Password for all accounts (reset): ${PASSWORD}`);
    } else {
      console.log(`\n  New accounts password: ${PASSWORD}`);
      console.log(`  Existing account passwords were preserved (set DEMO_ACCOUNT_PASSWORD env var to rotate; minimum ${MIN_DEMO_PASSWORD_LENGTH} characters).`);
    }
    console.log('  Account lockouts cleared and is_active=true ensured for all accounts.');
    console.log('\n✅ Demo accounts ready.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
