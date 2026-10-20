'use strict';

/**
 * Checks that an id supplied in a request body refers to a row in the caller's
 * own organization, before the id is written into another record. Without
 * this, a tenant can link its records to another tenant's users or rows, and
 * any join that returns the referenced row's name leaks it back.
 */

const pool = require('../config/database');
const { isUuid } = require('../middleware/validate');

// Only tables that carry organization_id. The table name is interpolated into
// SQL, so it is looked up here and never taken from a caller-supplied string.
const ORG_TABLES = Object.freeze({
  vulnerability_findings: 'vulnerability_findings',
  risk_treatments: 'risk_treatments',
  environments: 'environments'
});

/** True for an empty value (nothing to check) or an active user of the organization. */
async function ensureOrgUser(organizationId, userId) {
  if (userId === undefined || userId === null || userId === '') return true;
  if (!isUuid(String(userId))) return false;
  const result = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND is_active = true LIMIT 1',
    [userId, organizationId]
  );
  return result.rows.length > 0;
}

/** True for an empty value or a row of `table` that belongs to the organization. */
async function ensureOrgRow(table, organizationId, rowId) {
  const tableName = ORG_TABLES[table];
  if (!tableName) throw new Error(`ensureOrgRow: table ${table} is not allowed`);
  if (rowId === undefined || rowId === null || rowId === '') return true;
  if (!isUuid(String(rowId))) return false;
  const result = await pool.query(
    `SELECT 1 FROM ${tableName} WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [rowId, organizationId]
  );
  return result.rows.length > 0;
}

module.exports = { ensureOrgUser, ensureOrgRow };
