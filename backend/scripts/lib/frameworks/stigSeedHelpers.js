'use strict';

/**
 * Database helpers for the standalone STIG seeding script
 * (scripts/seed-stig-benchmark.js). The caller owns the transaction; these
 * helpers only issue statements on the client they are given. Ported from
 * ControlWeaver-Pro's scripts/lib/frameworks/seedHelpers.js.
 */

/**
 * Replace a framework's controls wholesale: create the framework row if it is
 * missing, otherwise delete its existing controls, then insert the module's
 * controls. This is the DISA STIG scripts' long-standing behavior.
 */
async function replaceFrameworkControls(client, framework, label) {
  const existingFramework = await client.query(
    'SELECT id FROM frameworks WHERE code = $1',
    [framework.code]
  );

  let frameworkId;
  if (existingFramework.rows.length > 0) {
    frameworkId = existingFramework.rows[0].id;
    console.log(`Framework ${framework.code} already exists with ID ${frameworkId}`);

    await client.query(
      'DELETE FROM framework_controls WHERE framework_id = $1',
      [frameworkId]
    );
    console.log('Deleted existing controls');
  } else {
    const frameworkResult = await client.query(
      `INSERT INTO frameworks (code, name, version, category, tier_required, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        framework.code,
        framework.name,
        framework.version,
        framework.category,
        framework.tier_required,
        framework.description
      ]
    );
    frameworkId = frameworkResult.rows[0].id;
    console.log(`Created framework ${framework.code} with ID ${frameworkId}`);
  }

  console.log(`Inserting ${framework.controls.length} controls...`);
  let insertedCount = 0;
  for (const control of framework.controls) {
    await client.query(
      `INSERT INTO framework_controls
       (framework_id, control_id, title, priority, control_type, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        frameworkId,
        control.control_id,
        control.title,
        control.priority,
        control.control_type,
        control.description || null
      ]
    );
    insertedCount++;
  }
  console.log(`Inserted ${insertedCount} controls for ${label} framework`);
  return frameworkId;
}

/**
 * Crosswalk each control of a STIG framework to the NIST SP 800-53 Rev 5
 * controls its CCIs reference (control.nist_800_53, set by
 * scripts/import-stig-xccdf.js). Mappings are 'related', not 'equivalent':
 * a STIG rule is one configuration check, not the whole control, so it must
 * not auto-credit the 800-53 control. Returns { inserted, missing }.
 */
async function insertCciCrosswalks(client, frameworkId, controls) {
  const nist = await client.query(
    `SELECT fc.id, fc.control_id FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
      WHERE f.code = 'nist_800_53'`
  );
  const nistIds = new Map(nist.rows.map((r) => [r.control_id, r.id]));
  if (nistIds.size === 0) return { inserted: 0, missing: [] };

  const own = await client.query(
    'SELECT id, control_id FROM framework_controls WHERE framework_id = $1',
    [frameworkId]
  );
  const ownIds = new Map(own.rows.map((r) => [r.control_id, r.id]));
  let inserted = 0;
  const missing = new Set();
  for (const control of controls) {
    const sourceId = ownIds.get(control.control_id);
    if (!sourceId) continue;
    for (const target of control.nist_800_53 || []) {
      const targetId = nistIds.get(target);
      if (!targetId) { missing.add(target); continue; }
      const result = await client.query(
        `INSERT INTO control_mappings (source_control_id, target_control_id, similarity_score, mapping_type)
         SELECT $1, $2, 85, 'related'
          WHERE NOT EXISTS (SELECT 1 FROM control_mappings WHERE source_control_id = $1 AND target_control_id = $2)`,
        [sourceId, targetId]
      );
      inserted += result.rowCount;
    }
  }
  return { inserted, missing: [...missing].sort() };
}

module.exports = { replaceFrameworkControls, insertCciCrosswalks };
