// @tier: community
/**
 * Shared framework/control persistence helpers used by seed-frameworks.js
 * (fresh delete+insert seeding) and seed-missing-controls.js (existence-check
 * backfill). Extracted in issue #218 to remove the previously duplicated
 * inline INSERT INTO framework_controls logic between the two scripts.
 */

async function insertFramework(client, fw) {
  const result = await client.query(
    `INSERT INTO frameworks (code, name, version, description, category, tier_required, is_active, framework_group)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id`,
    [fw.code, fw.name, fw.version, fw.description, fw.category, fw.tier_required, fw.framework_group || null]
  );
  return result.rows[0].id;
}

// Returns the new row's id so callers can resolve the control-id -> uuid map
// needed to wire enhancements to their parents in a second pass.
async function insertControl(client, frameworkId, ctrl) {
  const result = await client.query(
    `INSERT INTO framework_controls
       (framework_id, control_id, title, description, priority, control_type, is_enhancement)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [frameworkId, ctrl.control_id, ctrl.title, ctrl.description || null,
     ctrl.priority, ctrl.control_type, ctrl.is_enhancement === true]
  );
  return result.rows[0].id;
}

// Second pass over a framework's controls: resolve parent_control_id and record
// baseline membership. Separate from insertControl because an enhancement
// references its parent by control_id string, and that parent's uuid only
// exists once inserted -- and a parent is not guaranteed to sort before its
// children.
async function linkControlHierarchyAndBaselines(client, controls, controlIdToUuid, frameworkCode) {
  for (const ctrl of controls) {
    const selfUuid = controlIdToUuid.get(ctrl.control_id);
    if (!selfUuid) continue;

    if (ctrl.parent_control_id) {
      const parentUuid = controlIdToUuid.get(ctrl.parent_control_id);
      if (parentUuid) {
        await client.query(
          'UPDATE framework_controls SET parent_control_id = $1 WHERE id = $2',
          [parentUuid, selfUuid]
        );
      } else {
        // Loud rather than silent: an orphaned enhancement is invisible in the
        // UI hierarchy and means the generated catalog is inconsistent.
        console.warn(`  [WARN] ${frameworkCode}/${ctrl.control_id}: parent ${ctrl.parent_control_id} not found`);
      }
    }

    for (const baseline of ctrl.baselines || []) {
      await client.query(
        `INSERT INTO control_baselines (framework_control_id, baseline, baseline_source)
         VALUES ($1, $2, 'nist_800_53b')
         ON CONFLICT (framework_control_id, baseline, baseline_source) DO NOTHING`,
        [selfUuid, baseline]
      );
    }
  }
}

// Existence-check-then-insert, used where the caller can't assume a clean
// table (e.g. seed-missing-controls.js backfilling into an already-seeded
// framework). Returns true if a row was inserted, false if it already existed.
async function addControlIfMissing(client, frameworkId, ctrl) {
  const exists = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2',
    [frameworkId, ctrl.control_id]
  );
  if (exists.rows.length > 0) return false;
  await insertControl(client, frameworkId, ctrl);
  return true;
}

module.exports = { insertFramework, insertControl, addControlIfMissing, linkControlHierarchyAndBaselines };
