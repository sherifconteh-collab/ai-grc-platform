#!/usr/bin/env node
// @tier: community
/**
 * Verify the audit_logs hash chain (NIST AU-9(3)).
 *
 * The append-only triggers make audit_logs tamper-resistant, but the
 * application owns the table and can disable them -- the AU-11 retention purge
 * legitimately does. The hash chain added in the accompanying migration is
 * what makes an illegitimate use of that window detectable. This script is how
 * you actually look.
 *
 * For each organization it walks the chain oldest-first and recomputes each
 * record's digest from the same canonical payload the database trigger uses,
 * reporting three distinct outcomes rather than a single pass/fail:
 *
 *   - ALTERED    a record's own hash does not match its contents. Someone
 *                edited the row after it was written.
 *   - BROKEN     a record's prev_hash does not match its predecessor's hash,
 *                and no retention purge explains it. Records were removed or
 *                reordered.
 *   - EXPECTED   a discontinuity that coincides with an audit.retention_purge
 *                record carrying a matching chain_boundary_hash. Legitimate.
 *
 * Rows written before the chain migration carry NULL hashes. They are counted
 * and reported as the pre-chain segment rather than silently skipped -- the
 * chain vouches for nothing before its start, and saying so is the point.
 *
 * Usage:
 *   node scripts/verify-audit-chain.js               # all organizations
 *   node scripts/verify-audit-chain.js --org <uuid>  # one organization
 *   node scripts/verify-audit-chain.js --json        # machine-readable
 *
 * Exit codes: 0 clean, 1 integrity failure found, 2 could not run.
 */
const crypto = require('crypto');
const pool = require('../src/config/database');

const BATCH = 1000;

function parseArgs(argv) {
  const args = { org: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--org') args.org = argv[++i];
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

/**
 * Mirror of the audit_log_canonical_payload() SQL function. The column order
 * is load-bearing and must stay identical to the migration -- if the two ever
 * disagree, every record reads as ALTERED.
 */
function canonicalPayload(row) {
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  return [
    s(row.id),
    s(row.organization_id),
    s(row.user_id),
    s(row.event_type),
    s(row.resource_type),
    s(row.resource_id),
    // Mirror COALESCE(rec.details::text, '') exactly. Keying off row.details
    // instead would diverge for a JSON null: pg parses jsonb 'null' to JS
    // null, but details::text is the string 'null' -- and every record
    // would then read as ALTERED.
    row.details_text === null || row.details_text === undefined ? '' : row.details_text,
    s(row.ip_address),
    s(row.user_agent),
    s(row.success),
    s(row.failure_reason),
    s(row.outcome),
    s(row.actor_name),
    s(row.source_system),
    s(row.request_id),
    s(row.created_at_canonical)
  ].join('|');
}

function computeHash(row, prevHash) {
  return crypto
    .createHash('sha384')
    .update(`${canonicalPayload(row)}|${prevHash || 'GENESIS'}`)
    .digest('hex');
}

async function loadPurgeBoundaries(orgId) {
  const { rows } = await pool.query(
    `SELECT details->>'chain_boundary_hash' AS boundary_hash, created_at
       FROM audit_logs
      WHERE organization_id = $1
        AND event_type = 'audit.retention_purge'
        AND details->>'chain_boundary_hash' IS NOT NULL`,
    [orgId]
  );
  return new Set(rows.map((r) => r.boundary_hash));
}

async function verifyOrganization(orgId) {
  const boundaries = await loadPurgeBoundaries(orgId);
  const result = {
    organization_id: orgId,
    checked: 0,
    pre_chain: 0,
    altered: [],
    broken: [],
    expected_breaks: 0,
    chain_start: null
  };

  let lastCreatedAt = null;
  let lastId = null;
  let expectedPrev = null;
  let first = true;

  for (;;) {
    const params = [orgId];
    let sql = `
      SELECT id, organization_id, user_id, event_type, resource_type, resource_id,
             details, details::text AS details_text, ip_address, user_agent,
             success, failure_reason, outcome, actor_name, source_system,
             request_id, created_at, prev_hash, record_hash,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS created_at_canonical
        FROM audit_logs
       WHERE organization_id = $1
         AND record_hash IS NOT NULL
    `;
    if (lastCreatedAt !== null) {
      sql += ' AND (created_at, id) > ($2, $3)';
      params.push(lastCreatedAt, lastId);
    }
    sql += ` ORDER BY created_at ASC, id ASC LIMIT ${BATCH}`;

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (first) {
        result.chain_start = { id: row.id, created_at: row.created_at };
        expectedPrev = row.prev_hash;
        first = false;
      }

      if (row.prev_hash !== expectedPrev) {
        // A break. Legitimate only if a purge recorded this exact boundary.
        if (row.prev_hash && boundaries.has(row.prev_hash)) {
          result.expected_breaks++;
        } else {
          result.broken.push({
            id: row.id,
            created_at: row.created_at,
            expected_prev: expectedPrev,
            found_prev: row.prev_hash
          });
        }
      }

      const recomputed = computeHash(row, row.prev_hash);
      if (recomputed !== row.record_hash) {
        result.altered.push({
          id: row.id,
          created_at: row.created_at,
          event_type: row.event_type,
          stored: row.record_hash,
          recomputed
        });
      }

      expectedPrev = row.record_hash;
      result.checked++;
    }

    lastCreatedAt = rows[rows.length - 1].created_at;
    lastId = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  const { rows: [pre] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_logs
      WHERE organization_id = $1 AND record_hash IS NULL`,
    [orgId]
  );
  result.pre_chain = pre.n;

  return result;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!pool.isConfigured) {
    console.error('DATABASE_URL is not configured.');
    process.exit(2);
  }

  let orgIds;
  if (args.org) {
    orgIds = [args.org];
  } else {
    const { rows } = await pool.query(
      'SELECT DISTINCT organization_id FROM audit_logs WHERE organization_id IS NOT NULL'
    );
    orgIds = rows.map((r) => r.organization_id);
  }

  const results = [];
  for (const orgId of orgIds) {
    results.push(await verifyOrganization(orgId));
  }

  const totalAltered = results.reduce((n, r) => n + r.altered.length, 0);
  const totalBroken = results.reduce((n, r) => n + r.broken.length, 0);

  if (args.json) {
    console.log(JSON.stringify({ results, totalAltered, totalBroken }, null, 2));
  } else {
    for (const r of results) {
      console.log(`\norganization ${r.organization_id}`);
      console.log(`  chained records:    ${r.checked}`);
      console.log(`  pre-chain records:  ${r.pre_chain}  (written before the chain migration -- not vouched for)`);
      console.log(`  chain starts at:    ${r.chain_start ? `${r.chain_start.id} (${r.chain_start.created_at})` : 'n/a'}`);
      console.log(`  expected breaks:    ${r.expected_breaks}  (explained by retention purges)`);
      if (r.altered.length) {
        console.log(`  ALTERED: ${r.altered.length}`);
        for (const a of r.altered.slice(0, 20)) {
          console.log(`    ${a.id} ${a.created_at} ${a.event_type}`);
        }
      }
      if (r.broken.length) {
        console.log(`  BROKEN: ${r.broken.length}`);
        for (const b of r.broken.slice(0, 20)) {
          console.log(`    ${b.id} ${b.created_at} expected prev ${b.expected_prev} found ${b.found_prev}`);
        }
      }
      if (!r.altered.length && !r.broken.length) {
        console.log('  OK -- chain intact');
      }
    }
    console.log(`\ntotal altered: ${totalAltered}   total unexplained breaks: ${totalBroken}`);
  }

  await pool.end();
  process.exit(totalAltered > 0 || totalBroken > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-audit-chain failed:', err.message);
  process.exit(2);
});
