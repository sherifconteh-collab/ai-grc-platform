// @tier: community
//
// Guards against the defect class fixed by migration 150: a CREATE TABLE IF
// NOT EXISTS in one migration file silently shadowed by an earlier migration
// that declares the same table, leaving the second file's columns absent
// from every database this schema is ever built on. That produced four
// confirmed live "column does not exist" failures (SSO, SIEM, the job
// runner's retry path, and data-retention-policy creation) before this
// script existed. See 150_reconcile_shadowed_duplicate_tables.sql for detail.
//
// This intentionally does not flag every duplicate CREATE TABLE -- an
// identical second declaration, or one reconciled by a later
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS (the established pattern; see
// 125_fix_audit_engagement_schema_drift.sql and 075/072 in the sibling repo),
// is harmless and common in this migration history. It only fails when the
// shadowed definition declares a column the winning definition -- reconciled
// or not -- never ends up with, since that is the exact shape of column that
// silently never existed in any real database.
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function readColumnDefs(sql, table) {
  const re = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?(?:public\\.)?${table}"?\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
    'i'
  );
  const match = sql.match(re);
  if (!match) return null;

  const map = new Map();
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim().replace(/,\s*$/, '');
    if (!/^[a-z_]+\s/i.test(line)) continue;
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(line)) continue;
    map.set(line.split(/\s/)[0].toLowerCase(), line);
  }
  return map;
}

function findDrift() {
  const files = listMigrationFiles();
  const sources = new Map(files.map((f) => [f, fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')]));

  const createdBy = new Map(); // table -> [files, in migration order]
  const alteredIn = new Map(); // table -> Set(files that ADD COLUMN it)

  for (const file of files) {
    const sql = sources.get(file);

    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?:public\.)?([a-z_]+)"?\s*\(/gi)) {
      const table = m[1].toLowerCase();
      if (!createdBy.has(table)) createdBy.set(table, []);
      createdBy.get(table).push(file);
    }

    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(?:public\.)?([a-z_]+)"?([\s\S]*?);/gi)) {
      if (!/ADD\s+COLUMN/i.test(m[2])) continue;
      const table = m[1].toLowerCase();
      if (!alteredIn.has(table)) alteredIn.set(table, new Set());
      alteredIn.get(table).add(file);
    }
  }

  const drift = [];

  for (const [table, declaredIn] of createdBy) {
    if (declaredIn.length < 2) continue;

    const [winnerFile, ...shadowedFiles] = declaredIn;
    const alteredFiles = alteredIn.get(table) || new Set();
    const reconciled = shadowedFiles.some((shadowFile) =>
      [...alteredFiles].some((alterFile) => alterFile >= shadowFile)
    );
    if (reconciled) continue;

    const winnerCols = readColumnDefs(sources.get(winnerFile), table);
    if (!winnerCols) continue;

    for (const shadowFile of shadowedFiles) {
      const shadowCols = readColumnDefs(sources.get(shadowFile), table);
      if (!shadowCols) continue;

      const orphaned = [...shadowCols.keys()].filter((c) => !winnerCols.has(c));
      if (orphaned.length === 0) continue;

      drift.push({ table, winnerFile, shadowFile, orphaned, defs: orphaned.map((c) => shadowCols.get(c)) });
    }
  }

  return drift;
}

function main() {
  const drift = findDrift();

  if (drift.length === 0) {
    console.log('Migration schema drift check passed: no shadowed CREATE TABLE declares an orphaned column.');
    return;
  }

  console.log(`Migration schema drift check found ${drift.length} table(s) with columns that have never existed in any built database:\n`);
  for (const d of drift) {
    console.log(`- ${d.table}`);
    console.log(`    live definition: ${d.winnerFile}`);
    console.log(`    shadowed by:     ${d.shadowFile}`);
    for (const def of d.defs) console.log(`    orphaned column: ${def}`);
    console.log('');
  }
  console.log('Fix: add a new migration with ALTER TABLE ... ADD COLUMN IF NOT EXISTS for the');
  console.log('orphaned column(s), following 150_reconcile_shadowed_duplicate_tables.sql. Never');
  console.log('edit an already-numbered migration file -- that changes its checksum and fails');
  console.log('scripts/migrate-all.js on any database that already applied it.');
  process.exitCode = 1;
}

main();
