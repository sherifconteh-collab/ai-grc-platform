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

async function runDueReportsSweep() {
  try {
    const due = await pool.query(
      `SELECT id, organization_id
         FROM scheduled_reports
        WHERE is_active = true
          AND (next_run_at IS NULL OR next_run_at <= NOW())`
    );

    for (const row of due.rows) {
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

    if (due.rows.length > 0) {
      log('info', 'scheduled_reports.sweep.completed', { count: due.rows.length });
    }
  } catch (error) {
    log('error', 'scheduled_reports.sweep.failed', { error: error.message });
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
