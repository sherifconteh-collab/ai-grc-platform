'use strict';

const pool = require('../config/database');

const columnPresenceCache = new Map();

function getCacheKey(tableName, columnName) {
  return `${tableName}:${columnName}`;
}

async function hasPublicColumn(tableName, columnName) {
  const cacheKey = getCacheKey(tableName, columnName);
  if (columnPresenceCache.has(cacheKey)) {
    return columnPresenceCache.get(cacheKey);
  }

  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
       LIMIT 1`,
      [tableName, columnName]
    );

    const present = result.rows.length > 0;
    columnPresenceCache.set(cacheKey, present);
    return present;
  } catch (_error) {
    columnPresenceCache.set(cacheKey, false);
    return false;
  }
}

module.exports = {
  hasPublicColumn
};
