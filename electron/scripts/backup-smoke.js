'use strict';

/**
 * Prove a desktop backup restores onto a new computer: real stack, real
 * bundled PostgreSQL, from plain Node (no Electron).
 *
 *   1. boot, sign in, add a database record and an uploaded file
 *   2. stop and back up, as quitting the app does
 *   3. delete everything except the backups (the computer is lost)
 *   4. boot a fresh install (new keys, new administrator password), stop
 *   5. restore, boot, sign in with the ORIGINAL password, find the record
 *      and the file
 *
 *   node scripts/backup-smoke.js [--data-dir <dir>]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const { createLogger } = require('../lib/log');
const { startStack } = require('../lib/stack');
const { verifySignIn } = require('../lib/verify');
const backup = require('../lib/backup');
const { BUNDLED_MAJOR } = require('../lib/postgres');

const HARD_DEADLINE_MS = 15 * 60 * 1000;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

/** Connect to the running bundled database using the install's own credentials. */
async function dbQuery(dataDir, sql, params) {
  const creds = JSON.parse(fs.readFileSync(path.join(dataDir, 'db-credentials.json'), 'utf8'));
  const conf = fs.readFileSync(path.join(dataDir, 'pgdata', 'controlweave.conf'), 'utf8');
  const port = Number(/^port = (\d+)$/m.exec(conf)[1]);
  const client = new Client({ host: '127.0.0.1', port, user: creds.user, password: creds.password, database: 'controlweave' });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}

function step(text) {
  console.log(`  ${text}`);
}

async function main() {
  const dataDir = arg('--data-dir') || fs.mkdtempSync(path.join(os.tmpdir(), 'cw-backup-smoke-'));
  const logger = createLogger(path.join(dataDir, 'logs'));
  const options = {
    dataDir,
    appRoot: path.resolve(__dirname, '..'),
    resourcesRoot: path.resolve(__dirname, '..', '..'),
    isPackaged: false,
    nodeBinary: process.execPath,
    logger,
  };
  const marker = `backup-smoke-${crypto.randomBytes(6).toString('hex')}`;
  console.log(`Desktop backup smoke test (data: ${dataDir})`);

  let stack = await startStack(options);
  await verifySignIn(stack);
  const originalPassword = stack.admin.password;
  await dbQuery(dataDir, 'INSERT INTO organizations (name) VALUES ($1)', [marker]);
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'uploads', `${marker}.txt`), marker);
  const stopped = await stack.stop();
  if (!stopped.databaseStopped) throw new Error('the database did not report a clean stop');
  const saved = backup.createBackup(dataDir, { appVersion: 'smoke' });
  step(`1-2. record and file written, backup saved to ${path.basename(saved)}`);

  for (const name of fs.readdirSync(dataDir)) {
    if (name !== 'backups' && name !== 'logs') fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
  }
  stack = await startStack(options);
  if (stack.admin.password === originalPassword) throw new Error('the fresh install unexpectedly reused the old password');
  await stack.stop();
  step('3-4. data deleted, fresh install booted with new keys');

  const aside = backup.restoreBackup(dataDir, saved, { bundledMajor: BUNDLED_MAJOR });
  stack = await startStack(options);
  try {
    if (stack.admin.password !== originalPassword) throw new Error('restore did not bring back the administrator credentials');
    await verifySignIn(stack);
    const rows = await dbQuery(dataDir, 'SELECT 1 FROM organizations WHERE name = $1', [marker]);
    if (rows.length !== 1) throw new Error('the database record is missing after restore');
    if (fs.readFileSync(path.join(dataDir, 'uploads', `${marker}.txt`), 'utf8') !== marker) {
      throw new Error('the uploaded file is missing after restore');
    }
    step(`5. restored (fresh install kept in ${path.basename(aside)}), signed in with the original password, record and file present`);
  } finally {
    await stack.stop();
  }
  console.log('PASS');
}

const deadline = setTimeout(() => {
  console.error(`FAIL: backup smoke test exceeded ${HARD_DEADLINE_MS / 60000} minutes`);
  process.exit(1);
}, HARD_DEADLINE_MS);
deadline.unref();

main().then(() => process.exit(0), (error) => {
  console.error(`FAIL: ${error.message}`);
  if (error.hint) console.error(`hint: ${error.hint}`);
  for (const line of error.output || []) console.error(`  | ${line}`);
  process.exit(1);
});
