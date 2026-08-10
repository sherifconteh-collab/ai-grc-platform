#!/usr/bin/env node
// @tier: community
/**
 * Crosswalk coverage for NIST 800-53 control enhancements.
 *
 * The 714 enhancements imported from the OSCAL catalog arrive with no
 * crosswalk mappings at all. Every existing crosswalk lookup is an exact
 * composite match on (framework_id, control_id), so 'AU-2' never matches
 * 'AU-2(3)' -- nothing broke, but nothing covers them either. An assessor
 * looking at AU-6(3) sees no relationship to anything, in a product whose
 * whole premise is crosswalk intelligence.
 *
 * THE IMPORTANT CONSTRAINT, and the reason this script is careful rather than
 * generous:
 *
 * Auto-credit fires when mapping_type IN ('equivalent','exact') AND
 * similarity_score >= 90 (routes/controls.js), or on a score of exactly 100
 * regardless of type. So a mapping written at those values does not merely
 * describe a relationship -- it silently marks the target control satisfied.
 *
 * Inheriting a parent's cross-framework mappings at 'equivalent'/>=90 would
 * therefore assert that ISO 27001 A.8.16 *satisfies* AU-6(3), purely because
 * A.8.16 maps to AU-6. An enhancement is strictly narrower than the control it
 * enhances; that inference is false. Writing it would manufacture compliance
 * the organization has not earned, which is the same defect as a deployment
 * guide claiming controls it does not implement.
 *
 * So every mapping this script writes uses mapping_type = 'related', which
 * never auto-satisfies on either credit path. These are for traceability: an
 * assessor can see what an enhancement relates to, and the crosswalk UI shows
 * it, but no percentage moves. The percentage problem is solved separately and
 * correctly by baseline scoping.
 *
 * Two sources, neither invented:
 *   1. Intra-800-53, from the OSCAL rel="related" links -- NIST's own
 *      statements about which controls relate to which.
 *   2. Cross-framework, by inheriting the mappings already recorded for an
 *      enhancement's parent, at a reduced score to reflect that the
 *      relationship is inherited rather than directly asserted.
 *
 * Run AFTER seed-frameworks.js: that script opens with an unconditional
 * DELETE FROM control_mappings, so anything written before it is discarded.
 *
 * Usage:
 *   node scripts/seed-enhancement-crosswalks.js
 *   STRICT_SEEDING=true node scripts/seed-enhancement-crosswalks.js
 */
const pool = require('../src/config/database');
const catalog = require('./lib/frameworks/nist_800_53.js');

const STRICT = String(process.env.STRICT_SEEDING || '').toLowerCase() === 'true'
  || process.argv.includes('--strict');

// Never 'equivalent', never >= 90 on an equivalent type, never exactly 100.
// See the header. These are deliberately below the auto-credit threshold as
// well as being the wrong type for it -- belt and braces, because the
// threshold is org-configurable and someone could lower it.
const MAPPING_TYPE = 'related';
const INTRA_CATALOG_SCORE = 75;   // NIST's own "related" assertion
const INHERITED_PARENT_SCORE = 60; // inherited, weaker still

// similarity_score has DEFAULT 80 on the column. Omitting it would produce
// rows that look mapped, sit permanently below the credit threshold, and give
// no indication that a score was never actually chosen -- migrations 086/087
// already left 63 such rows behind. Always write it explicitly.

async function loadControlIndex(client) {
  const { rows } = await client.query(
    `SELECT fc.id, fc.control_id, fc.is_enhancement, fc.parent_control_id, f.code AS framework_code
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id`
  );
  const byFrameworkAndId = new Map();
  const byUuid = new Map();
  for (const r of rows) {
    byFrameworkAndId.set(`${r.framework_code}::${r.control_id}`, r);
    byUuid.set(r.id, r);
  }
  return { rows, byFrameworkAndId, byUuid };
}

async function insertMapping(client, sourceId, targetId, score, note) {
  if (sourceId === targetId) return false;
  // Existing seeds dedupe in application code because migration 001 created
  // control_mappings with no uniqueness constraint. Match that, checking both
  // directions, since the credit query reads the table bidirectionally.
  const existing = await client.query(
    `SELECT id FROM control_mappings
      WHERE (source_control_id = $1 AND target_control_id = $2)
         OR (source_control_id = $2 AND target_control_id = $1)
      LIMIT 1`,
    [sourceId, targetId]
  );
  if (existing.rows.length > 0) return false;

  await client.query(
    `INSERT INTO control_mappings
       (source_control_id, target_control_id, mapping_type, similarity_score, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [sourceId, targetId, MAPPING_TYPE, score, note]
  );
  return true;
}

async function seed() {
  const client = await pool.connect();
  const unresolved = [];
  let intra = 0;
  let inherited = 0;

  try {
    await client.query('BEGIN');
    const index = await loadControlIndex(client);

    const enhancements = index.rows.filter(
      (r) => r.is_enhancement && r.framework_code === 'nist_800_53'
    );
    if (enhancements.length === 0) {
      console.log('No 800-53 enhancements found. Run seed-frameworks.js first.');
      await client.query('ROLLBACK');
      return;
    }

    // 1) Intra-catalog, from NIST's own rel="related" links.
    const catalogById = new Map(catalog.controls.map((c) => [c.control_id, c]));
    for (const enh of enhancements) {
      const source = catalogById.get(enh.control_id);
      if (!source) continue;
      for (const relatedId of source.related_controls || []) {
        const target = index.byFrameworkAndId.get(`nist_800_53::${relatedId}`);
        if (!target) {
          unresolved.push(`nist_800_53/${enh.control_id} -> ${relatedId} (target not seeded)`);
          continue;
        }
        if (await insertMapping(client, enh.id, target.id, INTRA_CATALOG_SCORE,
          `NIST OSCAL rel="related" from ${enh.control_id}`)) intra++;
      }
    }

    // 2) Cross-framework, inherited from the parent's existing mappings.
    for (const enh of enhancements) {
      if (!enh.parent_control_id) continue;
      const { rows: parentMappings } = await client.query(
        `SELECT CASE WHEN cm.source_control_id = $1 THEN cm.target_control_id
                     ELSE cm.source_control_id END AS other_id
           FROM control_mappings cm
          WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
            AND cm.source_control_id <> cm.target_control_id`,
        [enh.parent_control_id]
      );

      const parent = index.byUuid.get(enh.parent_control_id);
      for (const { other_id: otherId } of parentMappings) {
        const other = index.byUuid.get(otherId);
        // Only inherit mappings that leave 800-53. An inherited intra-catalog
        // mapping would duplicate what pass 1 already sourced from NIST
        // directly, at a weaker score and with worse provenance.
        if (!other || other.framework_code === 'nist_800_53') continue;
        if (await insertMapping(client, enh.id, other.id, INHERITED_PARENT_SCORE,
          `Inherited from parent ${parent ? parent.control_id : '?'}; enhancement is narrower than its parent, so this is traceability only`)) inherited++;
      }
    }

    if (unresolved.length && STRICT) {
      console.error(`\n${unresolved.length} unresolved mapping targets:`);
      for (const u of unresolved.slice(0, 40)) console.error(`  ${u}`);
      throw new Error('STRICT_SEEDING: unresolved mapping targets');
    }

    // Guard the invariant this whole script is built around, before commit.
    const { rows: [bad] } = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM control_mappings
        WHERE notes LIKE 'NIST OSCAL rel=%' OR notes LIKE 'Inherited from parent%'
          AND (LOWER(mapping_type) IN ('equivalent', 'exact') OR similarity_score >= 90)`
    );
    if (bad.n > 0) {
      throw new Error(`${bad.n} enhancement mappings would auto-credit; refusing to commit`);
    }

    await client.query('COMMIT');
    console.log(`Enhancement crosswalks seeded.`);
    console.log(`  intra-800-53 (NIST rel="related"): ${intra}`);
    console.log(`  inherited cross-framework:         ${inherited}`);
    console.log(`  unresolved targets:                ${unresolved.length}${STRICT ? '' : ' (non-strict; re-run with --strict to fail on these)'}`);
    console.log(`  all written as mapping_type='${MAPPING_TYPE}' -- none auto-credit.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Enhancement crosswalk seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
