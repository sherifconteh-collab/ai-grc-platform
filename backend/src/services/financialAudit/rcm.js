'use strict';

/**
 * Risk-control matrix: input normalization, CSV import and listing.
 */

const pool = require('../../config/database');
const { parseCsvDocument } = require('../../utils/csv');

const PROCESSES = ['procure_to_pay', 'order_to_cash', 'record_to_report', 'hire_to_retire', 'treasury', 'fixed_assets', 'inventory', 'budget_execution', 'it_general', 'entity_level', 'other'];
const ASSERTIONS = ['existence_occurrence', 'completeness', 'rights_obligations', 'valuation_allocation', 'presentation_disclosure', 'accuracy', 'cutoff'];
const FREQUENCIES = ['annual', 'quarterly', 'monthly', 'weekly', 'daily', 'recurring', 'as_needed'];
const CONTROL_TYPES = ['manual', 'automated', 'it_dependent_manual'];
const NATURES = ['preventive', 'detective'];
const RISK_LEVELS = ['low', 'moderate', 'high'];
const STATUSES = ['draft', 'active', 'retired'];

const TEXT_FIELDS = { control_ref: 60, sub_process: 200, assessable_unit: 200, risk_ref: 60, risk_statement: 4000, control_description: 4000, system_name: 200 };
const ENUM_FIELDS = { process: PROCESSES, frequency: FREQUENCIES, control_type: CONTROL_TYPES, control_nature: NATURES, risk_level: RISK_LEVELS, status: STATUSES };
const REQUIRED = ['control_ref', 'process', 'risk_statement', 'control_description', 'frequency', 'control_type'];
const MAX_IMPORT_ROWS = 2000;

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'key'].includes(text)) return true;
  if (['no', 'n', 'false', '0', 'non-key', ''].includes(text)) return false;
  return undefined;
}

function toAssertions(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[;,|]/);
  return [...new Set(list.map((a) => String(a).trim().toLowerCase().replace(/[\s/-]+/g, '_')).filter(Boolean))];
}

/**
 * Validate an RCM payload. With partial=true only supplied fields are checked
 * (for PATCH). Returns { values, errors }.
 */
function normalizeRcm(body, { partial = false } = {}) {
  const input = body || {};
  const values = {};
  const errors = [];

  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (input[field] === undefined) continue;
    if (input[field] === null || input[field] === '') { values[field] = null; continue; }
    if (typeof input[field] !== 'string') { errors.push(`${field} must be text`); continue; }
    values[field] = input[field].trim().slice(0, max);
  }
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    if (input[field] === undefined || input[field] === '') continue;
    const value = String(input[field]).trim().toLowerCase();
    if (!allowed.includes(value)) errors.push(`${field} must be one of: ${allowed.join(', ')}`);
    else values[field] = value;
  }
  for (const field of ['key_control', 'fraud_risk']) {
    if (input[field] === undefined) continue;
    const value = toBool(input[field]);
    if (value === undefined) errors.push(`${field} must be yes or no`);
    else values[field] = value;
  }
  if (input.assertions !== undefined) {
    const list = toAssertions(input.assertions);
    const bad = list.filter((a) => !ASSERTIONS.includes(a));
    if (bad.length) errors.push(`Unknown assertions: ${bad.join(', ')}`);
    else values.assertions = list;
  }
  for (const field of ['framework_control_id', 'owner_user_id']) {
    if (input[field] === undefined) continue;
    values[field] = input[field] || null;
  }
  if (!partial) {
    const missing = REQUIRED.filter((f) => !values[f]);
    if (missing.length) errors.push(`Missing required fields: ${missing.join(', ')}`);
  }
  if (values.control_ref === null) errors.push('control_ref cannot be empty');
  return { values, errors };
}

const RCM_COLUMNS = ['control_ref', 'process', 'sub_process', 'assessable_unit', 'risk_ref', 'risk_statement', 'control_description', 'framework_control_id', 'assertions', 'frequency', 'control_type', 'control_nature', 'key_control', 'fraud_risk', 'risk_level', 'system_name', 'owner_user_id', 'status'];

async function upsertRcm(executor, organizationId, userId, values) {
  const cols = RCM_COLUMNS.filter((c) => values[c] !== undefined);
  const params = [organizationId, userId, ...cols.map((c) => values[c])];
  const placeholders = cols.map((_, i) => `$${i + 3}`);
  const updates = cols.filter((c) => c !== 'control_ref').map((c) => `${c} = EXCLUDED.${c}`);
  const { rows } = await executor.query(
    `INSERT INTO rcm_entries (organization_id, created_by, ${cols.join(', ')})
     VALUES ($1, $2, ${placeholders.join(', ')})
     ON CONFLICT (organization_id, control_ref) DO UPDATE
       SET ${[...updates, 'updated_at = NOW()'].join(', ')}
     RETURNING *, (xmax = 0) AS inserted`,
    params
  );
  return rows[0];
}

/** Map framework_code + framework_control columns to framework_controls ids. */
async function resolveFrameworkControls(executor, rows) {
  const pairs = [...new Set(rows
    .filter((r) => r.framework_code && r.framework_control)
    .map((r) => `${r.framework_code.trim()}|${r.framework_control.trim()}`))];
  if (!pairs.length) return new Map();
  const { rows: found } = await executor.query(
    `SELECT f.code || '|' || fc.control_id AS key, fc.id
       FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id
      WHERE f.code || '|' || fc.control_id = ANY($1::text[])`,
    [pairs]
  );
  return new Map(found.map((r) => [r.key, r.id]));
}

/**
 * Import RCM rows from CSV text. Valid rows are upserted in one transaction;
 * invalid rows are reported with their line number and skipped.
 */
async function importCsv(organizationId, userId, csvText) {
  const { rows } = parseCsvDocument(csvText);
  if (!rows.length) return { created: 0, updated: 0, errors: [{ line: 1, error: 'No data rows found' }] };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { created: 0, updated: 0, errors: [{ line: 1, error: `At most ${MAX_IMPORT_ROWS} rows per import` }] };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fcMap = await resolveFrameworkControls(client, rows);
    let created = 0;
    let updated = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const key = row.framework_code && row.framework_control ? `${row.framework_code.trim()}|${row.framework_control.trim()}` : null;
      if (key && !fcMap.has(key)) {
        errors.push({ line: i + 2, error: `Unknown framework control ${row.framework_code.trim()} ${row.framework_control.trim()}` });
        continue;
      }
      const { values, errors: rowErrors } = normalizeRcm({ ...row, framework_control_id: key ? fcMap.get(key) : undefined, owner_user_id: undefined });
      if (rowErrors.length) { errors.push({ line: i + 2, error: rowErrors.join('; ') }); continue; }
      const saved = await upsertRcm(client, organizationId, userId, values);
      if (saved.inserted) created += 1; else updated += 1;
    }
    await client.query('COMMIT');
    return { created, updated, errors };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listRcm(organizationId, { process, keyOnly, search, status, limit = 100, offset = 0 }) {
  const where = ['r.organization_id = $1'];
  const params = [organizationId];
  if (process) { params.push(process); where.push(`r.process = $${params.length}`); }
  if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
  if (keyOnly) where.push('r.key_control = TRUE');
  if (search) {
    params.push(`%${String(search).replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(r.control_ref ILIKE $${params.length} OR r.control_description ILIKE $${params.length} OR r.risk_statement ILIKE $${params.length})`);
  }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT r.*, fc.control_id AS framework_control_code, f.code AS framework_code,
            TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS owner_name,
            lt.conclusion AS latest_conclusion, lt.test_type AS latest_test_type, lt.fiscal_year AS latest_fiscal_year,
            COUNT(*) OVER () AS total_count
       FROM rcm_entries r
       LEFT JOIN framework_controls fc ON fc.id = r.framework_control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN users u ON u.id = r.owner_user_id
       LEFT JOIN LATERAL (
         SELECT t.conclusion, t.test_type, t.fiscal_year FROM control_tests t
          WHERE t.rcm_entry_id = r.id AND t.organization_id = r.organization_id AND t.status = 'completed'
          ORDER BY t.completed_at DESC NULLS LAST LIMIT 1
       ) lt ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY r.process, r.control_ref
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

module.exports = {
  PROCESSES,
  ASSERTIONS,
  FREQUENCIES,
  CONTROL_TYPES,
  RISK_LEVELS,
  normalizeRcm,
  upsertRcm,
  importCsv,
  listRcm,
  RCM_COLUMNS
};
