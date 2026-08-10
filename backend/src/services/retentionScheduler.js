// @tier: community
// Periodic sweep that actually runs retention enforcement.
//
// Ported from the sibling ControlWeaver-Pro repository, where this sweep has
// been running for some time. Without it, jobService.runRetentionCleanup() and
// runAuditLogRetention() exist and are correct, but nothing ever invokes them:
// the 'retention_cleanup' and 'audit_log_retention' job types only run if an
// operator enqueues them by hand. That made evidence retention -- and, once
// AU-11 landed, audit retention -- a capability rather than an enforced
// control. Modeled on services/reminderService.js's setInterval sweep pattern.
//
// Evidence and audit records are swept separately: they are different policy
// rows, the audit purge has to open and close the append-only window from
// migration 153, and a failure in one must not abort the other.
const pool = require('../config/database');
const { log } = require('../utils/logger');
const { runRetentionCleanup, runAuditLogRetention } = require('./jobService');

let schedulerHandle = null;

async function runRetentionSweep() {
  try {
    const orgsWithPolicy = await pool.query(
      `SELECT DISTINCT organization_id
         FROM data_retention_policies
        WHERE active = true
          AND auto_enforce = true
          AND resource_type = 'evidence'`
    );

    let totalRemoved = 0;
    for (const row of orgsWithPolicy.rows) {
      try {
        const result = await runRetentionCleanup({ organizationId: row.organization_id });
        totalRemoved += result.removed || 0;
      } catch (error) {
        log('error', 'retention.sweep.org_failed', {
          organizationId: row.organization_id,
          error: error.message
        });
      }
    }

    if (orgsWithPolicy.rows.length > 0) {
      log('info', 'retention.sweep.completed', {
        organizations: orgsWithPolicy.rows.length,
        removed: totalRemoved
      });
    }

    // AU-11: audit records.
    const orgsWithAuditPolicy = await pool.query(
      `SELECT DISTINCT organization_id
         FROM data_retention_policies
        WHERE active = true
          AND auto_enforce = true
          AND resource_type = 'audit_logs'`
    );

    let auditRemoved = 0;
    for (const row of orgsWithAuditPolicy.rows) {
      try {
        const result = await runAuditLogRetention({ organizationId: row.organization_id });
        auditRemoved += result.removed || 0;
      } catch (error) {
        log('error', 'retention.audit_sweep.org_failed', {
          organizationId: row.organization_id,
          error: error.message
        });
      }
    }

    if (orgsWithAuditPolicy.rows.length > 0) {
      log('info', 'retention.audit_sweep.completed', {
        organizations: orgsWithAuditPolicy.rows.length,
        removed: auditRemoved
      });
    }
  } catch (error) {
    log('error', 'retention.sweep.failed', { error: error.message });
  }
}

function startRetentionScheduler() {
  const enabled = (process.env.ENABLE_RETENTION_ENFORCEMENT || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    log('info', 'retention.scheduler.disabled');
    return () => {};
  }

  if (!pool.isConfigured) {
    log('info', 'retention.scheduler.skipped', { reason: 'database_not_configured' });
    return () => {};
  }

  const parsedInterval = Number(process.env.RETENTION_SWEEP_INTERVAL_HOURS);
  const intervalHours = Number.isFinite(parsedInterval) ? Math.max(1, parsedInterval) : 24;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  runRetentionSweep();
  schedulerHandle = setInterval(runRetentionSweep, intervalMs);

  log('info', 'retention.scheduler.started', { intervalHours });

  return () => {
    if (schedulerHandle) {
      clearInterval(schedulerHandle);
      schedulerHandle = null;
      log('info', 'retention.scheduler.stopped');
    }
  };
}

module.exports = {
  startRetentionScheduler,
  runRetentionSweep
};
