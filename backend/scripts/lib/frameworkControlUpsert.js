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

async function insertControl(client, frameworkId, ctrl) {
  await client.query(
    `INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [frameworkId, ctrl.control_id, ctrl.title, ctrl.description || null, ctrl.priority, ctrl.control_type]
  );
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

module.exports = { insertFramework, insertControl, addControlIfMissing };
