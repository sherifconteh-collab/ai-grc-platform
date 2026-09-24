#!/usr/bin/env node
// @tier: exclude
/**
 * seed-industry-demo-data.js
 *
 * Gives every demo organization in DEMO_ADMIN_ACCOUNTS a believable
 * compliance posture: its industry's frameworks are linked, and each of those
 * frameworks' controls gets an implementation row distributed to land near the
 * account's targetCompliance.
 *
 * The four original tier orgs (Meridian, BrightPath, Vanguard, NovaTech) have
 * their own richer seeders; this script only fills in controls that have no
 * implementation row yet, so it complements those instead of overwriting them.
 *
 * Run:
 *   npm run seed:demo:industries
 *   node scripts/seed-industry-demo-data.js --orgs=energy,retail
 */
require('dotenv').config();
const pool = require('../src/config/database');
const {
  DEMO_ADMIN_ACCOUNTS,
  aiFrameworksFor,
  aiGovernanceFrameworksFor
} = require('./lib/demo-account-config');

// Ordered so the cumulative share below reads as "best posture first".
const STATUS_LADDER = Object.freeze(['verified', 'implemented', 'in_progress', 'needs_review', 'not_started']);

function parseListArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => String(arg || '').startsWith(prefix));
  if (!raw) return null;
  return raw.slice(prefix.length).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

/**
 * Maps a control's position within its framework onto an implementation
 * status. Deterministic (index-based, not random) so re-running the seed on a
 * fresh database always produces the same demo numbers.
 *
 * `verified` and `implemented` are the two statuses the dashboard counts as
 * compliant, so together they make up exactly `target` of the controls.
 */
function statusForIndex(index, total, target) {
  const share = total > 0 ? index / total : 0;
  const compliant = Math.max(0, Math.min(1, target));
  const cutoffs = [
    compliant * 0.4,
    compliant,
    compliant + (1 - compliant) * 0.35,
    compliant + (1 - compliant) * 0.55
  ];
  const rank = cutoffs.findIndex((cutoff) => share < cutoff);
  return rank === -1 ? 'not_started' : STATUS_LADDER[rank];
}

async function resolveOrganization(client, account) {
  const result = await client.query('SELECT id FROM organizations WHERE name = $1', [account.orgName]);
  return result.rows[0]?.id || null;
}

async function linkFrameworks(client, orgId, frameworkCodes) {
  const result = await client.query(
    `INSERT INTO organization_frameworks (organization_id, framework_id)
     SELECT $1, f.id FROM frameworks f WHERE f.code = ANY($2::text[])
     ON CONFLICT (organization_id, framework_id) DO NOTHING
     RETURNING framework_id`,
    [orgId, frameworkCodes]
  );

  const known = await client.query('SELECT code FROM frameworks WHERE code = ANY($1::text[])', [frameworkCodes]);
  const foundCodes = new Set(known.rows.map((row) => row.code));
  const missing = frameworkCodes.filter((code) => !foundCodes.has(code));
  return { linked: result.rowCount, missing, resolved: foundCodes.size };
}

/**
 * Inserts one implementation row per not-yet-implemented control in the org's
 * frameworks. ON CONFLICT DO NOTHING keeps the richer tier seeders' rows.
 */
async function seedImplementations(client, orgId, frameworkCodes, target) {
  const controls = await client.query(
    `SELECT fc.id, f.code AS framework_code
     FROM framework_controls fc
     JOIN frameworks f ON f.id = fc.framework_id
     WHERE f.code = ANY($1::text[])
     ORDER BY f.code, fc.id`,
    [frameworkCodes]
  );

  const byFramework = new Map();
  for (const row of controls.rows) {
    if (!byFramework.has(row.framework_code)) byFramework.set(row.framework_code, []);
    byFramework.get(row.framework_code).push(row.id);
  }

  const controlIds = [];
  const statuses = [];
  for (const ids of byFramework.values()) {
    ids.forEach((controlId, index) => {
      controlIds.push(controlId);
      statuses.push(statusForIndex(index, ids.length, target));
    });
  }

  if (controlIds.length === 0) return 0;

  const inserted = await client.query(
    `INSERT INTO control_implementations (control_id, organization_id, status, implementation_notes)
     SELECT control_id, $1, status,
            'Seeded industry demo posture — replace with your own implementation narrative.'
     FROM UNNEST($2::uuid[], $3::text[]) AS t(control_id, status)
     ON CONFLICT (control_id, organization_id) DO NOTHING`,
    [orgId, controlIds, statuses]
  );

  return inserted.rowCount;
}

/**
 * Brings the organization's AI frameworks up to its target posture.
 *
 * Older tier seeders already linked some AI frameworks and left every control
 * at `not_started`, which seedImplementations() correctly skips — the result is
 * an AI framework showing 0%, which demos as an empty AI governance dashboard.
 * This promotes only rows that are still `not_started` AND carry no
 * implementation narrative, so hand-written or tier-seeded content is never
 * overwritten.
 */
async function promoteAiFrameworkPosture(client, orgId, aiFrameworkCodes, target) {
  if (aiFrameworkCodes.length === 0) return 0;

  const untouched = await client.query(
    `SELECT ci.control_id, f.code AS framework_code
     FROM control_implementations ci
     JOIN framework_controls fc ON fc.id = ci.control_id
     JOIN frameworks f ON f.id = fc.framework_id
     WHERE ci.organization_id = $1
       AND f.code = ANY($2::text[])
       AND ci.status = 'not_started'
       AND (ci.implementation_notes IS NULL OR ci.implementation_notes = '')
       AND (ci.implementation_narrative IS NULL OR ci.implementation_narrative = '')
     ORDER BY f.code, ci.control_id`,
    [orgId, aiFrameworkCodes]
  );

  if (untouched.rows.length === 0) return 0;

  const byFramework = new Map();
  for (const row of untouched.rows) {
    if (!byFramework.has(row.framework_code)) byFramework.set(row.framework_code, []);
    byFramework.get(row.framework_code).push(row.control_id);
  }

  const controlIds = [];
  const statuses = [];
  for (const ids of byFramework.values()) {
    ids.forEach((controlId, index) => {
      const status = statusForIndex(index, ids.length, target);
      if (status === 'not_started') return;
      controlIds.push(controlId);
      statuses.push(status);
    });
  }

  if (controlIds.length === 0) return 0;

  const updated = await client.query(
    `UPDATE control_implementations ci
     SET status = t.status,
         implementation_notes = 'Seeded AI governance demo posture — replace with your own implementation narrative.',
         updated_at = NOW()
     FROM UNNEST($2::uuid[], $3::text[]) AS t(control_id, status)
     WHERE ci.organization_id = $1 AND ci.control_id = t.control_id`,
    [orgId, controlIds, statuses]
  );

  return updated.rowCount;
}

async function seedAccount(client, account) {
  const orgId = await resolveOrganization(client, account);
  if (!orgId) {
    console.log(`  ✗ ${account.orgName} — organization not found (run seed:demo-accounts first)`);
    return false;
  }

  const { linked, missing, resolved } = await linkFrameworks(client, orgId, account.frameworks);

  // The two mirror repos ship slightly different framework catalogs, so an
  // individually missing code is a warning. An organization that resolves no
  // frameworks at all is a real failure — it would demo as an empty account.
  if (missing.length) {
    console.log(`    ! ${account.orgName}: framework code(s) not in this catalog, skipped: ${missing.join(', ')}`);
  }
  if (resolved === 0) {
    throw new Error(
      `${account.orgName} resolved none of its frameworks (${account.frameworks.join(', ')}). `
      + 'Run seed:frameworks first, or correct DEMO_ADMIN_ACCOUNTS.'
    );
  }

  // The config guard proves an AI governance framework is declared; this proves
  // one actually resolved against the catalog, so the AI governance assessment
  // is never empty for this organization.
  const missingSet = new Set(missing);
  const resolvedAi = aiFrameworksFor(account).filter((code) => !missingSet.has(code));
  const resolvedAiGovernance = aiGovernanceFrameworksFor(account).filter((code) => !missingSet.has(code));
  if (resolvedAiGovernance.length === 0) {
    throw new Error(
      `${account.orgName} resolved no AI governance framework. Declared: `
      + `${aiGovernanceFrameworksFor(account).join(', ') || 'none'}. Run seed:frameworks first.`
    );
  }

  const implementations = await seedImplementations(client, orgId, account.frameworks, account.targetCompliance);
  const promoted = await promoteAiFrameworkPosture(client, orgId, resolvedAi, account.targetCompliance);
  console.log(
    `  ✓ ${account.industry.padEnd(32)} ${account.orgName.padEnd(28)} `
    + `frameworks +${linked} implementations +${implementations} `
    + `AI: ${resolvedAi.join(', ')}${promoted ? ` (+${promoted} promoted)` : ''}`
  );
  return true;
}

function resolveAccounts() {
  const requested = parseListArg('orgs');
  if (!requested?.length) return DEMO_ADMIN_ACCOUNTS;

  const selected = DEMO_ADMIN_ACCOUNTS.filter((account) => requested.includes(account.industryKey));
  const unknown = requested.filter(
    (key) => !DEMO_ADMIN_ACCOUNTS.some((account) => account.industryKey === key)
  );
  if (unknown.length) {
    throw new Error(`Unknown industry key(s): ${unknown.join(', ')}`);
  }
  return selected;
}

async function run() {
  const accounts = resolveAccounts();
  const client = await pool.connect();
  let seeded = 0;

  try {
    console.log('\n🌱 Seeding industry demo compliance data...\n');
    for (const account of accounts) {
      await client.query('BEGIN');
      try {
        if (await seedAccount(client, account)) seeded += 1;
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    if (seeded === 0) {
      throw new Error('No demo organizations were seeded — run seed:demo-accounts first.');
    }
    console.log(`\n✅ Industry demo data ready for ${seeded} organization(s).\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(`\n❌ Industry demo seeding failed: ${error.message}\n`);
  process.exitCode = 1;
});
