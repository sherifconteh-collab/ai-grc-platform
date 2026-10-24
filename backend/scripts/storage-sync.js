#!/usr/bin/env node
'use strict';

/**
 * Copy files that already exist in the local uploads directory to object
 * storage. Run once after switching STORAGE_DRIVER to s3 so evidence uploaded
 * before the switch survives the next redeploy.
 *
 *   node scripts/storage-sync.js            upload every local file
 *   node scripts/storage-sync.js --dry-run  list what would be uploaded
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../src/config/paths');
const storageService = require('../src/services/storageService');

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.isFile() && !entry.name.startsWith('.') ? [full] : [];
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const info = storageService.describe();
  if (info.driver !== 's3') {
    process.stderr.write('STORAGE_DRIVER is not s3 (set S3_BUCKET); nothing to sync.\n');
    process.exit(1);
  }
  const files = listFiles(UPLOADS_DIR);
  process.stdout.write(`${files.length} file(s) in ${UPLOADS_DIR} -> ${info.location}\n`);
  let failed = 0;
  for (const file of files) {
    if (dryRun) { process.stdout.write(`would upload ${path.relative(UPLOADS_DIR, file)}\n`); continue; }
    try {
      await storageService.persist(file);
    } catch (error) {
      failed += 1;
      process.stderr.write(`failed ${path.relative(UPLOADS_DIR, file)}: ${error.message}\n`);
    }
  }
  process.stdout.write(dryRun ? 'Dry run complete.\n' : `Uploaded ${files.length - failed}, failed ${failed}.\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
