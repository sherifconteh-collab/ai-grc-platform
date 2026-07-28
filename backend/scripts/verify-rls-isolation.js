#!/usr/bin/env node
// @tier: community
/**
 * Verifies that the row-level security policies added by the access governance
 * RLS migration actually isolate organizations.
 *
 * Why this needs its own script rather than a Jest test: RLS can only be
 * observed over a real connection, and only as a role that is NOT exempt from
 * it. PostgreSQL unconditionally exempts roles carrying rolsuper or
 * rolbypassrls, and FORCE ROW LEVEL SECURITY only removes the table owner's
 * implicit exemption -- so a check run as the usual (often superuser) migration
 * role silently passes no matter what the policies say. This script therefore
 * creates a throwaway NOSUPERUSER NOBYPASSRLS role and re-connects as it.
 *
 * It asserts both halves of the policy contract:
 *   1. With app.org_id set, only that org's rows are visible.
 *   2. With app.org_id unset, rows stay visible -- the deliberate permissive
 *      default that lets existing pool.query() call sites keep working without
 *      withOrgContext(). Regressing this to deny-by-default would break most
 *      of the app, so it is a real assertion, not an oversight.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/verify-rls-isolation.js
 */
'use strict';

// Matches every other script in scripts/: pick up DATABASE_URL from .env so
// `npm run verify:rls` works locally, while CI keeps passing it explicitly.
require('dotenv').config();
const { Client } = require('pg');

const PROBE_ROLE = 'rls_probe_ci';
const PROBE_PASSWORD = process.env.RLS_PROBE_PASSWORD || require('crypto').randomBytes(18).toString('hex');

// Tables the access governance RLS migration protects, with the column that
// carries the tenant id. sod_rules additionally allows organization_id IS NULL
// (shared system rules), which is asserted separately below.
const PROTECTED_TABLES = [
  'sod_rules',
  'access_review_campaigns',
  'access_review_items',
  'rbac_documents'
];

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label} (${actual})`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label} — expected ${expected}, got ${actual}`);
  }
}

function parseConnection(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || 5432,
    database: parsed.pathname.replace(/^\//, ''),
    ssl: /sslmode=require/.test(parsed.search) ? { rejectUnauthorized: false } : undefined
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  // Skip cleanly rather than fail when the migration has not been applied --
  // this script is wired into the same job that runs migrations, but it should
  // not explode if pointed at an older schema.
  const { rows: presence } = await admin.query(
    `SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename = ANY($1::text[])`,
    [PROTECTED_TABLES]
  );
  if (presence[0].n !== PROTECTED_TABLES.length) {
    console.log(`Access governance tables not all present (${presence[0].n}/${PROTECTED_TABLES.length}) — skipping.`);
    await admin.end();
    return;
  }

  console.log('Row-Level Security isolation check\n');

  // 1. Every protected table must have RLS both enabled and forced, otherwise
  //    the owner role would bypass its own policy.
  const { rows: flags } = await admin.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = ANY($1::text[]) AND n.nspname = 'public'
     ORDER BY c.relname`,
    [PROTECTED_TABLES]
  );
  console.log('RLS flags:');
  for (const row of flags) {
    check(`${row.relname} rowsecurity+forced`, `${row.relrowsecurity}/${row.relforcerowsecurity}`, 'true/true');
  }

  const { rows: policies } = await admin.query(
    `SELECT tablename FROM pg_policies
     WHERE tablename = ANY($1::text[]) AND policyname = 'org_isolation'`,
    [PROTECTED_TABLES]
  );
  check('org_isolation policy on every table', policies.length, PROTECTED_TABLES.length);

  let probe;
  const orgA = '00000000-0000-4000-8000-0000000000aa';
  const orgB = '00000000-0000-4000-8000-0000000000bb';

  try {
    // 2. Seed two orgs and one sod_rules row each, plus a shared system rule.
    await admin.query('BEGIN');
    for (const [id, name] of [[orgA, 'RLS Probe Org A'], [orgB, 'RLS Probe Org B']]) {
      await admin.query(
        `INSERT INTO organizations (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [id, name]
      );
    }
    await admin.query(
      `INSERT INTO sod_rules (organization_id, name, description, conflicting_permissions, severity)
       VALUES ($1, 'rls probe rule A', 'probe', '["a.read","b.read"]'::jsonb, 'low'),
              ($2, 'rls probe rule B', 'probe', '["a.read","b.read"]'::jsonb, 'low')
       ON CONFLICT ON CONSTRAINT sod_rules_org_name_unique DO NOTHING`,
      [orgA, orgB]
    );
    await admin.query('COMMIT');

    // 3. Create the restricted probe role. NOSUPERUSER NOBYPASSRLS is the whole
    //    point: without it the policies are invisible and every check below
    //    would pass vacuously.
    await admin.query(`DROP ROLE IF EXISTS ${PROBE_ROLE}`);
    await admin.query(
      `CREATE ROLE ${PROBE_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${PROBE_PASSWORD}'`
    );
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}`);
    await admin.query(
      `GRANT SELECT ON ${PROTECTED_TABLES.map((t) => `public.${t}`).join(', ')} TO ${PROBE_ROLE}`
    );

    const { rows: roleFlags } = await admin.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      [PROBE_ROLE]
    );
    check('probe role is not RLS-exempt', `${roleFlags[0].rolsuper}/${roleFlags[0].rolbypassrls}`, 'false/false');

    probe = new Client({ ...parseConnection(databaseUrl), user: PROBE_ROLE, password: PROBE_PASSWORD });
    await probe.connect();

    // 4. Scoped to org A: A's rule visible, B's not.
    console.log('\nWith app.org_id = org A:');
    await probe.query('SELECT set_config($1, $2, false)', ['app.org_id', orgA]);
    const seesOwn = await probe.query(
      "SELECT COUNT(*)::int AS n FROM sod_rules WHERE name = 'rls probe rule A'"
    );
    check('own org row visible', seesOwn.rows[0].n, 1);
    const seesOther = await probe.query(
      "SELECT COUNT(*)::int AS n FROM sod_rules WHERE name = 'rls probe rule B'"
    );
    check('other org row hidden', seesOther.rows[0].n, 0);
    const seesSystem = await probe.query(
      'SELECT COUNT(*)::int AS n FROM sod_rules WHERE organization_id IS NULL'
    );
    check('shared system rules still visible', seesSystem.rows[0].n > 0, true);

    // 5. Symmetry: scoped to org B the visibility flips.
    console.log('\nWith app.org_id = org B:');
    await probe.query('SELECT set_config($1, $2, false)', ['app.org_id', orgB]);
    const bSeesB = await probe.query(
      "SELECT COUNT(*)::int AS n FROM sod_rules WHERE name = 'rls probe rule B'"
    );
    check('own org row visible', bSeesB.rows[0].n, 1);
    const bSeesA = await probe.query(
      "SELECT COUNT(*)::int AS n FROM sod_rules WHERE name = 'rls probe rule A'"
    );
    check('other org row hidden', bSeesA.rows[0].n, 0);

    // 6. Unset: permissive by design, so both rows come back. This is what lets
    //    the app's existing non-withOrgContext queries keep working.
    console.log('\nWith app.org_id unset (documented permissive default):');
    await probe.query("SELECT set_config('app.org_id', '', false)");
    const unscoped = await probe.query(
      "SELECT COUNT(*)::int AS n FROM sod_rules WHERE name IN ('rls probe rule A','rls probe rule B')"
    );
    check('both org rows visible when unscoped', unscoped.rows[0].n, 2);

    // 7. A malformed app.org_id must not error the query or leak rows.
    console.log('\nWith a malformed app.org_id:');
    await probe.query("SELECT set_config('app.org_id', 'not-a-uuid', false)");
    let malformedRejected = false;
    try {
      await probe.query('SELECT COUNT(*) FROM sod_rules');
    } catch {
      malformedRejected = true;
    }
    check('malformed value fails closed rather than leaking', malformedRejected, true);
  } finally {
    if (probe) await probe.end().catch(() => {});
    // Clean up in dependency order; the probe role must lose privileges first.
    await admin.query(
      `REVOKE ALL ON ${PROTECTED_TABLES.map((t) => `public.${t}`).join(', ')} FROM ${PROBE_ROLE}`
    ).catch(() => {});
    await admin.query(`REVOKE USAGE ON SCHEMA public FROM ${PROBE_ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${PROBE_ROLE}`).catch(() => {});
    await admin.query("DELETE FROM sod_rules WHERE name LIKE 'rls probe rule %'").catch(() => {});
    await admin.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [[orgA, orgB]]).catch(() => {});
    await admin.end().catch(() => {});
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('RLS verification error:', error.message);
  process.exit(1);
});
