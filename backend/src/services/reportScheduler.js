// @tier: community
// Periodic sweep that actually fires due scheduled_reports rows. Without
// this, scheduled_reports had real CRUD + a job-runner function
// (jobService.runScheduledReport) but nothing ever called it on a
// schedule -- the "daily/weekly/monthly/quarterly" fields were inert.
// Modeled on services/reminderService.js's setInterval sweep pattern.
const pool = require('../config/database');
const { log } = require('../utils/logger');
const { runScheduledReport } = require('./jobService');

let schedulerHandle = null;
let isSweeping = false;

async function runDueReportsSweep() {
  // Same-instance overlap guard: a slow SMTP send or PDF generation can
  // make one sweep outlast the interval; without this a second setInterval
  // tick would start processing the same rows again before the first
  // sweep's claim below has bumped their next_run_at.
  if (isSweeping) return;
  isSweeping = true;
  try {
    // Atomically claim due rows with FOR UPDATE SKIP LOCKED (same pattern
    // as jobService.js's evidence_collection_rules claim) so that a second
    // process instance running this same sweep concurrently skips rows
    // already locked here, instead of both sending the same report email.
    // The claim bumps next_run_at forward as a placeholder; runScheduledReport
    // overwrites it with the real schedule-derived value once it completes.
    const claimed = await pool.query(
      `WITH due AS (
         SELECT id FROM scheduled_reports
         WHERE is_active = true
           AND (next_run_at IS NULL OR next_run_at <= NOW())
         FOR UPDATE SKIP LOCKED
       )
       UPDATE scheduled_reports
       SET next_run_at = NOW() + INTERVAL '1 hour'
       FROM due
       WHERE scheduled_reports.id = due.id
       RETURNING scheduled_reports.id, scheduled_reports.organization_id`
    );

    for (const row of claimed.rows) {
      try {
        const result = await runScheduledReport({
          scheduledReportId: row.id,
          organizationId: row.organization_id
        });
        log('info', 'scheduled_reports.sweep.report_run', {
          scheduledReportId: row.id,
          delivered: result.delivered
        });
      } catch (error) {
        log('error', 'scheduled_reports.sweep.report_failed', {
          scheduledReportId: row.id,
          error: error.message
        });
      }
    }

    if (claimed.rows.length > 0) {
      log('info', 'scheduled_reports.sweep.completed', { count: claimed.rows.length });
    }
  } catch (error) {
    log('error', 'scheduled_reports.sweep.failed', { error: error.message });
  } finally {
    isSweeping = false;
  }
}

function startReportScheduler() {
  const enabled = (process.env.ENABLE_SCHEDULED_REPORTS || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    log('info', 'scheduled_reports.scheduler.disabled');
    return () => {};
  }

  if (!pool.isConfigured) {
    log('info', 'scheduled_reports.scheduler.skipped', { reason: 'database_not_configured' });
    return () => {};
  }

  const parsedInterval = Number(process.env.SCHEDULED_REPORTS_INTERVAL_MINUTES);
  const intervalMinutes = Number.isFinite(parsedInterval) ? Math.max(1, parsedInterval) : 15;
  const intervalMs = intervalMinutes * 60 * 1000;

  runDueReportsSweep();
  schedulerHandle = setInterval(runDueReportsSweep, intervalMs);

  log('info', 'scheduled_reports.scheduler.started', { intervalMinutes });

  return () => {
    if (schedulerHandle) {
      clearInterval(schedulerHandle);
      schedulerHandle = null;
      log('info', 'scheduled_reports.scheduler.stopped');
    }
  };
}

module.exports = {
  startReportScheduler,
  runDueReportsSweep
};
