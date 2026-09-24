// @tier: community
/**
 * Evidence version history (issue #570).
 *
 * `evidence.evidence_version` used to be an integer that went up while the row
 * was overwritten in place, so no prior version could be retrieved. This module
 * snapshots the row as it stood *before* each update into `evidence_versions`,
 * making the counter mean something.
 *
 * The live `evidence` row is always the current version. Snapshots are
 * immutable: nothing here updates or deletes them, so an auditor asking what a
 * control's evidence looked like at examination time has an answer that cannot
 * have been edited after the fact.
 */
const pool = require('../config/database');
const { log, serializeError } = require('../utils/logger');

/**
 * Copies the current evidence row into `evidence_versions` before the caller
 * overwrites it. Must be given a client inside a transaction so the snapshot
 * and the update either both land or neither does — a snapshot without its
 * update would duplicate the current version, and an update without its
 * snapshot loses history, which is the bug this fixes.
 *
 * Returns the version number that was archived, or null when the evidence row
 * does not exist or does not belong to the organization.
 */
async function snapshotCurrentVersion(client, { evidenceId, organizationId, actorUserId, changeNote }) {
  // Lock the row so a concurrent update cannot snapshot the same version twice.
  const current = await client.query(
    'SELECT * FROM evidence WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [evidenceId, organizationId]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  const versionNumber = Number(row.evidence_version) || 1;

  await client.query(
    `INSERT INTO evidence_versions (
       evidence_id, organization_id, version_number,
       file_name, file_path, file_size, mime_type, integrity_hash_sha256,
       description, tags, evidence_type, pii_classification, pii_types, data_sensitivity,
       superseded_by, change_note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (evidence_id, version_number) DO NOTHING`,
    [
      evidenceId, organizationId, versionNumber,
      row.file_name ?? null, row.file_path ?? null, row.file_size ?? null,
      row.mime_type ?? null, row.integrity_hash_sha256 ?? null,
      row.description ?? null, row.tags ?? null, row.evidence_type ?? null,
      row.pii_classification ?? null, row.pii_types ?? null, row.data_sensitivity ?? null,
      actorUserId || null, changeNote || null
    ]
  );

  return versionNumber;
}

/**
 * Version history for one evidence item, newest superseded version first. The
 * current version lives on the `evidence` row itself and is not repeated here.
 */
async function listVersions(organizationId, evidenceId) {
  const result = await pool.query(
    `SELECT ev.version_number,
            ev.file_name,
            ev.file_size,
            ev.mime_type,
            ev.integrity_hash_sha256,
            ev.description,
            ev.tags,
            ev.evidence_type,
            ev.pii_classification,
            ev.pii_types,
            ev.data_sensitivity,
            ev.change_note,
            ev.created_at,
            u.first_name || ' ' || u.last_name AS superseded_by_name
     FROM evidence_versions ev
     LEFT JOIN users u ON u.id = ev.superseded_by
     WHERE ev.organization_id = $1 AND ev.evidence_id = $2
     ORDER BY ev.version_number DESC`,
    [organizationId, evidenceId]
  );
  return result.rows;
}

/**
 * One archived version, for download. Org-scoped so a version id cannot be used
 * to read across tenants.
 */
async function getVersion(organizationId, evidenceId, versionNumber) {
  const result = await pool.query(
    `SELECT version_number, file_name, file_path, mime_type, integrity_hash_sha256
     FROM evidence_versions
     WHERE organization_id = $1 AND evidence_id = $2 AND version_number = $3`,
    [organizationId, evidenceId, versionNumber]
  );
  return result.rows[0] || null;
}

/**
 * Convenience wrapper for callers that are not already in a transaction:
 * snapshot, then apply `applyUpdate(client)`, atomically.
 */
async function withSnapshot({ evidenceId, organizationId, actorUserId, changeNote }, applyUpdate) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const versionNumber = await snapshotCurrentVersion(client, {
      evidenceId, organizationId, actorUserId, changeNote
    });
    if (versionNumber === null) {
      await client.query('ROLLBACK');
      return { notFound: true };
    }
    const result = await applyUpdate(client);
    await client.query('COMMIT');
    return { snapshotVersion: versionNumber, result };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'evidence.version_snapshot_failed', {
      organizationId, evidenceId, error: serializeError(error)
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  snapshotCurrentVersion,
  listVersions,
  getVersion,
  withSnapshot
};
