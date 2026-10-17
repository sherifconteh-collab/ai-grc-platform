// @tier: community
// Cross-instance coordination for background jobs.
//
// Every backend instance starts the same schedulers. claimJobRun() lets one
// of them run a job per interval: it moves the job's row in scheduler_leases
// forward only when the last start is older than minIntervalMs, measured on
// the database clock so instance clock skew does not matter. The claim is a
// single statement, so two instances racing for it cannot both win.
const os = require('os');
const pool = require('../config/database');
const { log } = require('../utils/logger');

const HOLDER = `${os.hostname()}:${process.pid}`;

async function claimJobRun(jobName, minIntervalMs) {
  try {
    const result = await pool.query(
      `INSERT INTO scheduler_leases (job_name, last_started_at, holder)
       VALUES ($1, NOW(), $3)
       ON CONFLICT (job_name) DO UPDATE
         SET last_started_at = NOW(), holder = EXCLUDED.holder
         WHERE scheduler_leases.last_started_at < NOW() - ($2::bigint * INTERVAL '1 millisecond')
       RETURNING job_name`,
      [jobName, Math.max(0, Math.floor(minIntervalMs)), HOLDER]
    );
    return result.rowCount === 1;
  } catch (error) {
    if (error.code === '42P01') {
      // Migration 165 not applied yet: run as before, uncoordinated.
      log('warn', 'scheduler.lease.table_missing', { job: jobName });
      return true;
    }
    if (error.code === '25006') {
      // Read-only database (a standby site): leave the job to the primary.
      return false;
    }
    log('warn', 'scheduler.lease.claim_failed', { job: jobName, error: error.message, code: error.code });
    return false;
  }
}

module.exports = { claimJobRun };
