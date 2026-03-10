// @tier: free
const pool = require('../config/database');

function toSafeDomain(input) {
  return String(input || '').trim().toLowerCase();
}

function toSafeKey(input) {
  return String(input || '').trim().toLowerCase();
}

async function getDomainConfig(organizationId, domain) {
  const safeDomain = toSafeDomain(domain);
  if (!safeDomain) return {};

  const result = await pool.query(
    `SELECT organization_id, config_key, config_value
     FROM dynamic_config_entries
     WHERE config_domain = $1
       AND is_active = true
       AND (organization_id IS NULL OR organization_id = $2)
     ORDER BY organization_id NULLS FIRST`,
    [safeDomain, organizationId || null]
  );

  const merged = {};
  for (const row of result.rows) {
    merged[row.config_key] = row.config_value;
  }
  return merged;
}

async function getConfigValue(organizationId, domain, key, fallback = null) {
  const safeDomain = toSafeDomain(domain);
  const safeKey = toSafeKey(key);
  if (!safeDomain || !safeKey) return fallback;

  const orgResult = organizationId
    ? await pool.query(
      `SELECT config_value
       FROM dynamic_config_entries
       WHERE organization_id = $1
         AND config_domain = $2
         AND config_key = $3
         AND is_active = true
       LIMIT 1`,
      [organizationId, safeDomain, safeKey]
    )
    : { rows: [] };

  if (orgResult.rows.length > 0) {
    return orgResult.rows[0].config_value;
  }

  const globalResult = await pool.query(
    `SELECT config_value
     FROM dynamic_config_entries
     WHERE organization_id IS NULL
       AND config_domain = $1
       AND config_key = $2
       AND is_active = true
     LIMIT 1`,
    [safeDomain, safeKey]
  );

  if (globalResult.rows.length > 0) {
    return globalResult.rows[0].config_value;
  }
  return fallback;
}

async function upsertConfig({ organizationId = null, domain, key, value, updatedBy = null, isActive = true }) {
  const safeDomain = toSafeDomain(domain);
  const safeKey = toSafeKey(key);
  if (!safeDomain || !safeKey) {
    throw new Error('domain and key are required');
  }

  if (organizationId) {
    const result = await pool.query(
      `INSERT INTO dynamic_config_entries (
         organization_id, config_domain, config_key, config_value, is_active, updated_by, updated_at
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
       ON CONFLICT (organization_id, config_domain, config_key)
       DO UPDATE SET
         config_value = EXCLUDED.config_value,
         is_active = EXCLUDED.is_active,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [organizationId, safeDomain, safeKey, JSON.stringify(value ?? {}), isActive, updatedBy]
    );
    return result.rows[0];
  }

  // Global entries cannot rely on UNIQUE with NULL org id, so do an explicit update/insert.
  const updateResult = await pool.query(
    `UPDATE dynamic_config_entries
     SET config_value = $1::jsonb,
         is_active = $2,
         updated_by = $3,
         updated_at = NOW()
     WHERE organization_id IS NULL
       AND config_domain = $4
       AND config_key = $5
     RETURNING *`,
    [JSON.stringify(value ?? {}), isActive, updatedBy, safeDomain, safeKey]
  );

  if (updateResult.rows.length > 0) {
    return updateResult.rows[0];
  }

  const insertResult = await pool.query(
    `INSERT INTO dynamic_config_entries (
       organization_id, config_domain, config_key, config_value, is_active, updated_by, updated_at
     )
     VALUES (NULL, $1, $2, $3::jsonb, $4, $5, NOW())
     RETURNING *`,
    [safeDomain, safeKey, JSON.stringify(value ?? {}), isActive, updatedBy]
  );
  return insertResult.rows[0];
}

async function deleteConfig({ organizationId = null, domain, key }) {
  const safeDomain = toSafeDomain(domain);
  const safeKey = toSafeKey(key);
  if (!safeDomain || !safeKey) {
    throw new Error('domain and key are required');
  }

  if (organizationId) {
    const result = await pool.query(
      `DELETE FROM dynamic_config_entries
       WHERE organization_id = $1 AND config_domain = $2 AND config_key = $3
       RETURNING id`,
      [organizationId, safeDomain, safeKey]
    );
    return result.rowCount;
  }

  const result = await pool.query(
    `DELETE FROM dynamic_config_entries
     WHERE organization_id IS NULL AND config_domain = $1 AND config_key = $2
     RETURNING id`,
    [safeDomain, safeKey]
  );
  return result.rowCount;
}

module.exports = {
  getDomainConfig,
  getConfigValue,
  upsertConfig,
  deleteConfig
};
