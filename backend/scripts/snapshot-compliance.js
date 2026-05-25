#!/usr/bin/env node
// Enqueue daily compliance snapshots for all orgs via the platform_jobs queue.
// Intended to be called by the backup scheduler or an external cron (0 2 * * *).
// Can also be run manually: node scripts/snapshot-compliance.js
'use strict';

const pool = require('../src/config/database');
const { enqueueJob } = require('../src/services/jobService');
const { log } = require('../src/utils/logger');

async function run() {
  try {
    await enqueueJob({
      organizationId: null,
      jobType: 'compliance_snapshot',
      payload: { triggered_by: 'snapshot-compliance-script', date: new Date().toISOString() }
    });
    log('info', 'compliance_snapshot.enqueued', { message: 'Compliance snapshot job enqueued for all orgs' });
    console.log('Compliance snapshot job enqueued.');
  } catch (err) {
    log('error', 'compliance_snapshot.enqueue_failed', { error: err.message });
    console.error('Failed to enqueue compliance snapshot:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
