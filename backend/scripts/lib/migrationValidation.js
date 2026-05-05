// @tier: community
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Returns all numbered migration filenames in a directory, sorted numerically.
 * Includes both .sql and any other numbered files (so callers can detect unsupported types).
 */
function getNumberedMigrationEntries(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Validates a migrations directory before execution.
 * Returns:
 *   unsupportedFiles  — numbered files that are NOT .sql or .js (legacy Node runners)
 *   duplicateBodies   — pairs [fileA, fileB] whose trimmed SQL content is identical
 *   sqlFiles          — valid numbered .sql migration filenames
 */
function validateMigrationDirectory(dir) {
  const entries = getNumberedMigrationEntries(dir);

  const sqlFiles = entries.filter((f) => path.extname(f).toLowerCase() === '.sql');
  const unsupportedFiles = entries.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ext !== '.sql' && ext !== '.js';
  });

  // Detect duplicate SQL bodies by checksum
  const checksums = new Map();
  const duplicateBodies = [];

  for (const file of sqlFiles) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    const checksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    if (checksums.has(checksum)) {
      duplicateBodies.push([checksums.get(checksum), file]);
    } else {
      checksums.set(checksum, file);
    }
  }

  return { unsupportedFiles, duplicateBodies, sqlFiles };
}

module.exports = { getNumberedMigrationEntries, validateMigrationDirectory };
