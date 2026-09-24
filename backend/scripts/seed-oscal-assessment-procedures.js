#!/usr/bin/env node
// @tier: community
/**
 * Seed NIST SP 800-53A assessment procedures from the OSCAL catalog.
 *
 * The 714 enhancements imported into the catalog arrive with no assessment
 * procedures, so they can be tracked but not assessed -- which for a control
 * an auditor has to sign off on is most of the point missing.
 *
 * seed-assessment-procedures-summary.js would cover them, but only with a
 * generated one-line "Summary assessment guide for AU-6(3)" per control. The
 * real objectives are better and were available all along: NIST embeds the
 * 800-53A assessment data directly in the SP 800-53 Rev 5.2.0 OSCAL catalog --
 * 1,579 assessment-objective parts and 2,072 assessment-method parts,
 * including for every enhancement. The importer now extracts them, yielding
 * 2,931 procedures across all 1,014 controls, each with NIST's own objective
 * text and its own evidence list.
 *
 * Run after seed-frameworks.js (needs framework_controls rows) and before or
 * after the summary seeder -- the summary seeder only fills controls that have
 * no procedure at all, so running this first simply leaves it nothing to do
 * for 800-53.
 *
 * Idempotent: upserts on (framework_control_id, procedure_id).
 *
 * Usage: node scripts/seed-oscal-assessment-procedures.js
 */
const pool = require('../src/config/database');
const catalog = require('./lib/frameworks/nist_800_53.js');

async function seed() {
  const client = await pool.connect();
  let inserted = 0;
  let skippedControls = 0;

  try {
    await client.query('BEGIN');

    const { rows: fwRows } = await client.query(
      "SELECT id FROM frameworks WHERE code = 'nist_800_53' LIMIT 1"
    );
    if (fwRows.length === 0) {
      console.log('nist_800_53 framework not seeded; nothing to do.');
      await client.query('ROLLBACK');
      return;
    }
    const frameworkId = fwRows[0].id;

    const { rows: controlRows } = await client.query(
      'SELECT id, control_id FROM framework_controls WHERE framework_id = $1',
      [frameworkId]
    );
    const byControlId = new Map(controlRows.map((r) => [r.control_id, r.id]));

    for (const control of catalog.controls) {
      const frameworkControlId = byControlId.get(control.control_id);
      if (!frameworkControlId) {
        skippedControls++;
        continue;
      }

      const procedures = control.assessment_procedures || [];
      for (let i = 0; i < procedures.length; i++) {
        const proc = procedures[i];
        await client.query(
          `INSERT INTO assessment_procedures
             (framework_control_id, procedure_id, procedure_type, title, description,
              expected_evidence, assessment_method, depth, source_document, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (framework_control_id, procedure_id) DO UPDATE SET
             procedure_type = EXCLUDED.procedure_type,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             expected_evidence = EXCLUDED.expected_evidence,
             assessment_method = EXCLUDED.assessment_method,
             depth = EXCLUDED.depth,
             source_document = EXCLUDED.source_document,
             sort_order = EXCLUDED.sort_order,
             updated_at = NOW()`,
          [
            frameworkControlId,
            proc.procedure_id,
            proc.procedure_type,
            proc.title,
            proc.description,
            proc.expected_evidence,
            proc.assessment_method,
            proc.depth,
            proc.source_document,
            i + 1
          ]
        );
        inserted++;
      }
    }

    await client.query('COMMIT');
    console.log(`Seeded ${inserted} NIST SP 800-53A assessment procedures.`);
    if (skippedControls > 0) {
      // Not fatal, but it means the catalog module and the seeded framework
      // disagree -- almost always a stale seed rather than a bad catalog.
      console.warn(`  ${skippedControls} catalog controls had no matching framework_controls row; re-run seed-frameworks.js.`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('OSCAL assessment procedure seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
