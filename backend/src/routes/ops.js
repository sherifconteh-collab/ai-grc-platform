// @tier: free
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { enqueueJob, processPendingJobs, runRetentionCleanup } = require('../services/jobService');
const { processPendingWebhookDeliveries } = require('../services/webhookService');

router.use(authenticate);
router.use(requirePermission('settings.manage'));

// GET /api/v1/ops/overview
// High-level operational visibility for admins (usage + queue health + recent failures).
router.get('/overview', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const [
      usersResult,
      activityResult,
      findingsResult,
      poamResult,
      jobResult,
      webhookResult,
      topEventsResult,
      recentFailuresResult
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE is_active = true)::int AS active_users,
            COUNT(*)::int AS total_users
          FROM users
          WHERE organization_id = $1
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS events_24h,
            COUNT(*) FILTER (
              WHERE created_at >= NOW() - INTERVAL '24 hours'
                AND (success = false OR failure_reason IS NOT NULL)
            )::int AS failures_24h,
            COUNT(DISTINCT user_id) FILTER (
              WHERE created_at >= NOW() - INTERVAL '7 days'
                AND user_id IS NOT NULL
            )::int AS active_users_7d
          FROM audit_logs
          WHERE organization_id = $1
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::int AS open_vulnerabilities,
            COUNT(*) FILTER (WHERE status = 'remediated')::int AS remediated_vulnerabilities
          FROM vulnerability_findings
          WHERE organization_id = $1
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'pending_review'))::int AS active_poam_items
          FROM poam_items
          WHERE organization_id = $1
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT status, COUNT(*)::int AS count
          FROM platform_jobs
          WHERE organization_id = $1
          GROUP BY status
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT delivery_status, COUNT(*)::int AS count
          FROM webhook_deliveries
          WHERE organization_id = $1
          GROUP BY delivery_status
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT event_type, COUNT(*)::int AS count
          FROM audit_logs
          WHERE organization_id = $1
            AND created_at >= NOW() - INTERVAL '7 days'
          GROUP BY event_type
          ORDER BY count DESC, event_type ASC
          LIMIT 12
        `,
        [orgId]
      ),
      pool.query(
        `
          SELECT
            al.id,
            al.event_type,
            al.resource_type,
            al.failure_reason,
            al.details,
            al.created_at,
            COALESCE(u.first_name || ' ' || u.last_name, 'System') AS actor_name
          FROM audit_logs al
          LEFT JOIN users u ON u.id = al.user_id
          WHERE al.organization_id = $1
            AND (al.success = false OR al.failure_reason IS NOT NULL)
          ORDER BY al.created_at DESC
          LIMIT 20
        `,
        [orgId]
      )
    ]);

    const users = usersResult.rows[0] || { active_users: 0, total_users: 0 };
    const activity = activityResult.rows[0] || { events_24h: 0, failures_24h: 0, active_users_7d: 0 };
    const findings = findingsResult.rows[0] || { open_vulnerabilities: 0, remediated_vulnerabilities: 0 };
    const poam = poamResult.rows[0] || { active_poam_items: 0 };

    const jobsByStatus = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0
    };
    for (const row of jobResult.rows) {
      jobsByStatus[row.status] = Number(row.count || 0);
    }

    const webhooksByStatus = {
      pending: 0,
      delivered: 0,
      failed: 0
    };
    for (const row of webhookResult.rows) {
      webhooksByStatus[row.delivery_status] = Number(row.count || 0);
    }

    const openIssueCount =
      Number(activity.failures_24h || 0)
      + Number(findings.open_vulnerabilities || 0)
      + Number(poam.active_poam_items || 0)
      + Number(jobsByStatus.failed || 0)
      + Number(webhooksByStatus.failed || 0);

    res.json({
      success: true,
      data: {
        summary: {
          total_users: Number(users.total_users || 0),
          active_users: Number(users.active_users || 0),
          active_users_7d: Number(activity.active_users_7d || 0),
          events_24h: Number(activity.events_24h || 0),
          failures_24h: Number(activity.failures_24h || 0),
          open_vulnerabilities: Number(findings.open_vulnerabilities || 0),
          active_poam_items: Number(poam.active_poam_items || 0),
          open_issue_count: openIssueCount
        },
        jobs: jobsByStatus,
        webhooks: webhooksByStatus,
        top_events_7d: topEventsResult.rows.map((row) => ({
          event_type: row.event_type,
          count: Number(row.count || 0)
        })),
        recent_failures: recentFailuresResult.rows
      }
    });
  } catch (error) {
    console.error('Ops overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to load operations overview' });
  }
});

// GET /api/v1/ops/jobs
router.get('/jobs', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));

    const params = [orgId];
    let where = 'organization_id = $1';
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit);

    const result = await pool.query(
      `SELECT *
       FROM platform_jobs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Ops list jobs error:', error);
    res.status(500).json({ success: false, error: 'Failed to list ops jobs' });
  }
});

// POST /api/v1/ops/jobs
router.post('/jobs', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { job_type, payload = {}, run_after = null } = req.body || {};
    if (!job_type) {
      return res.status(400).json({ success: false, error: 'job_type is required' });
    }

    const runAfterDate = run_after ? new Date(run_after) : null;
    if (run_after && Number.isNaN(runAfterDate?.getTime())) {
      return res.status(400).json({ success: false, error: 'run_after must be a valid date' });
    }

    const inserted = await enqueueJob({
      organizationId: orgId,
      jobType: job_type,
      payload,
      createdBy: req.user.id,
      runAfter: runAfterDate ? runAfterDate.toISOString() : null
    });

    res.status(201).json({ success: true, data: inserted });
  } catch (error) {
    console.error('Ops enqueue job error:', error);
    res.status(500).json({ success: false, error: 'Failed to enqueue ops job' });
  }
});

// POST /api/v1/ops/jobs/process
router.post('/jobs/process', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit) || 20));
    const result = await processPendingJobs({
      organizationId: orgId,
      limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Ops process jobs error:', error);
    res.status(500).json({ success: false, error: 'Failed to process pending jobs' });
  }
});

// POST /api/v1/ops/retention/run
router.post('/retention/run', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await runRetentionCleanup({ organizationId: orgId });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Ops retention run error:', error);
    res.status(500).json({ success: false, error: 'Failed to run retention cleanup' });
  }
});

// POST /api/v1/ops/webhooks/process
router.post('/webhooks/process', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.max(1, Math.min(200, Number(req.body?.limit) || 50));
    const result = await processPendingWebhookDeliveries({
      organizationId: orgId,
      limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Ops webhook process error:', error);
    res.status(500).json({ success: false, error: 'Failed to process webhook deliveries' });
  }
});

module.exports = router;
