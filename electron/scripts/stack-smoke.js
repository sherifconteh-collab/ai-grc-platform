'use strict';

/**
 * Boot the desktop stack from plain Node, without Electron, and prove it
 * works: first launch on an empty data directory, sign in, stop, then a
 * second launch on the same data, sign in again, stop.
 *
 * This runs the same lib/stack.js the desktop app runs. CI runs it on every
 * pull request that touches the backend, frontend or launcher, so a change
 * that would break the installed app fails review instead of a release.
 *
 *   node scripts/stack-smoke.js [--data-dir <dir>] [--keep]
 *
 * Needs backend and frontend dependencies installed, the frontend built
 * (npm run build in frontend/), and electron dependencies installed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger } = require('../lib/log');
const { startStack } = require('../lib/stack');
const { verifySignIn } = require('../lib/verify');

const HARD_DEADLINE_MS = 10 * 60 * 1000;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

async function launch(label, options) {
  const started = Date.now();
  const stack = await startStack({
    ...options,
    onStep: (id, status) => {
      if (status !== 'active') console.log(`  ${label}: ${id} ${status}`);
    },
  });
  console.log(`  ${label}: running at ${stack.frontendUrl} after ${((Date.now() - started) / 1000).toFixed(1)}s`);
  try {
    await verifySignIn(stack);
    console.log(`  ${label}: signed in as ${stack.admin.email}`);
  } finally {
    await stack.stop();
  }
}

async function main() {
  const keep = process.argv.includes('--keep');
  const dataDir = arg('--data-dir') || fs.mkdtempSync(path.join(os.tmpdir(), 'cw-desktop-smoke-'));
  const repoRoot = path.resolve(__dirname, '..', '..');
  const logger = createLogger(path.join(dataDir, 'logs'));
  const options = {
    dataDir,
    appRoot: path.resolve(__dirname, '..'),
    resourcesRoot: repoRoot,
    isPackaged: false,
    nodeBinary: process.execPath,
    logger,
  };

  console.log(`Desktop stack smoke test (data: ${dataDir})`);
  try {
    await launch('first launch', options);
    await launch('second launch', options);
    console.log('PASS');
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    if (error.hint) console.error(`hint: ${error.hint}`);
    for (const line of error.output || []) console.error(`  | ${line}`);
    console.error(`full log: ${logger.filePath}`);
    process.exitCode = 1;
  } finally {
    if (!keep && process.exitCode !== 1) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

const deadline = setTimeout(() => {
  console.error(`FAIL: smoke test exceeded ${HARD_DEADLINE_MS / 60000} minutes`);
  process.exit(1);
}, HARD_DEADLINE_MS);
deadline.unref();

main().then(() => process.exit(process.exitCode || 0));
