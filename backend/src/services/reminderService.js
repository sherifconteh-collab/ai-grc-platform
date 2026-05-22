// @tier: pro
const pool = require('../config/database');
const { log } = require('../utils/logger');
const { expireAllTrials } = require('./subscriptionService');

let schedulerHandle = null;

async function createOrgNotificationOncePerDay({ organizationId, type, title, message, link = null }) {
  await pool.query(
    `INSERT INTO notifications (organization_id, user_id, type, title, message, link)
     SELECT $1::uuid, NULL::uuid, $2::varchar(50), $3::varchar(255), $4::text, $5::varchar(500)
     WHERE NOT EXISTS (
       SELECT 1
       FROM notifications
       WHERE organization_id = $1::uuid
         AND type = $2::varchar(50)
         AND title = $3::varchar(255)
         AND created_at::date = CURRENT_DATE
     )`,
    [organizationId, type, title, message, link]
  );
}

async function remindDueControlReviews() {
  const result = await pool.query(`
    SELECT ci.organization_id, COUNT(*) AS due_count
    FROM control_implementations ci
    WHERE ci.status IN ('implemented', 'satisfied_via_crosswalk')
      AND COALESCE(ci.implementation_date, ci.created_at::date) <= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY ci.organization_id
  `);

  for (const row of result.rows) {
    const dueCount = Number(row.due_count || 0);
    if (dueCount === 0) continue;

    await createOrgNotificationOncePerDay({
      organizationId: row.organization_id,
      type: 'control_due',
      title: 'Control Reviews Due',
      message: `${dueCount} control implementations are due for periodic review.`,
      link: '/dashboard/controls'
    });
  }
}

async function remindAssessmentPlans() {
  const result = await pool.query(`
    SELECT organization_id,
      COUNT(*) FILTER (WHERE status IN ('draft', 'in_progress') AND start_date <= CURRENT_DATE + INTERVAL '7 days') AS starting_soon,
      COUNT(*) FILTER (WHERE status IN ('draft', 'in_progress') AND end_date < CURRENT_DATE) AS overdue
    FROM assessment_plans
    GROUP BY organization_id
  `);

  for (const row of result.rows) {
    const startingSoon = Number(row.starting_soon || 0);
    const overdue = Number(row.overdue || 0);

    if (startingSoon > 0) {
      await createOrgNotificationOncePerDay({
        organizationId: row.organization_id,
        type: 'assessment_needed',
        title: 'Assessment Plans Starting Soon',
        message: `${startingSoon} assessment plan(s) start within the next 7 days.`,
        link: '/dashboard/assessments'
      });
    }

    if (overdue > 0) {
      await createOrgNotificationOncePerDay({
        organizationId: row.organization_id,
        type: 'assessment_needed',
        title: 'Overdue Assessment Plans',
        message: `${overdue} assessment plan(s) are overdue and need attention.`,
        link: '/dashboard/assessments'
      });
    }
  }
}

async function remindServiceAccountRotations() {
  const result = await pool.query(`
    SELECT organization_id,
      COUNT(*) FILTER (WHERE next_rotation_date <= CURRENT_DATE + INTERVAL '7 days') AS rotation_due,
      COUNT(*) FILTER (WHERE next_review_date <= CURRENT_DATE + INTERVAL '7 days') AS review_due
    FROM service_accounts
    WHERE is_active = true
    GROUP BY organization_id
  `);

  for (const row of result.rows) {
    const rotationDue = Number(row.rotation_due || 0);
    const reviewDue = Number(row.review_due || 0);

    if (rotationDue > 0) {
      await createOrgNotificationOncePerDay({
        organizationId: row.organization_id,
        type: 'control_due',
        title: 'Service Account Rotations Due',
        message: `${rotationDue} service account credential rotation(s) are due within 7 days.`,
        link: '/dashboard/assets'
      });
    }

    if (reviewDue > 0) {
      await createOrgNotificationOncePerDay({
        organizationId: row.organization_id,
        type: 'control_due',
        title: 'Service Account Reviews Due',
        message: `${reviewDue} service account review(s) are due within 7 days.`,
        link: '/dashboard/assets'
      });
    }
  }
}

async function remindTrialExpiringSoon() {
  const result = await pool.query(`
    SELECT id, tier, trial_ends_at
    FROM organizations
    WHERE trial_status = 'active'
      AND billing_status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW()
      AND trial_ends_at <= NOW() + INTERVAL '7 days'
  `);

  for (const row of result.rows) {
    await createOrgNotificationOncePerDay({
      organizationId: row.id,
      type: 'assessment_needed',
      title: 'Trial Ending Soon',
      message: `Your ${row.tier} trial ends on ${new Date(row.trial_ends_at).toLocaleDateString('en-US')}. You will move to Free unless upgraded.`,
      link: '/dashboard/settings'
    });
  }
}

async function runReminderSweep() {
  try {
    const expiredCount = await expireAllTrials();
    if (expiredCount > 0) {
      log('info', 'subscriptions.trials.expired', { count: expiredCount });
    }

    await remindDueControlReviews();
    await remindAssessmentPlans();
    await remindServiceAccountRotations();
    await remindTrialExpiringSoon();
    log('info', 'reminders.sweep.completed');
  } catch (error) {
    log('error', 'reminders.sweep.failed', { error: { message: error.message, code: error.code } });
  }
}

function startReminderScheduler() {
  const enabled = (process.env.ENABLE_REMINDERS || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    log('info', 'reminders.scheduler.disabled');
    return () => {};
  }

  if (!pool.isConfigured) {
    log('info', 'reminders.scheduler.skipped', { reason: 'database_not_configured' });
    return () => {};
  }

  const intervalMinutes = Number(process.env.REMINDER_INTERVAL_MINUTES || 60);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  runReminderSweep();
  schedulerHandle = setInterval(runReminderSweep, intervalMs);

  log('info', 'reminders.scheduler.started', { intervalMinutes: Math.max(1, intervalMinutes) });

  return () => {
    if (schedulerHandle) {
      clearInterval(schedulerHandle);
      schedulerHandle = null;
      log('info', 'reminders.scheduler.stopped');
    }
  };
}

module.exports = {
  startReminderScheduler,
  runReminderSweep
};
