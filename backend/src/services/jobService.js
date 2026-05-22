// @tier: community
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const pool = require('../config/database');
const { processPendingWebhookDeliveries } = require('./webhookService');

async function enqueueJob({ organizationId = null, jobType, payload = {}, createdBy = null, runAfter = null }) {
  const result = await pool.query(
    `INSERT INTO platform_jobs (
       organization_id, job_type, payload, status, run_after, created_by
     )
     VALUES ($1, $2, $3::jsonb, 'queued', COALESCE($4, NOW()), $5)
     RETURNING *`,
    [organizationId, jobType, JSON.stringify(payload || {}), runAfter, createdBy]
  );
  return result.rows[0];
}

async function runRetentionCleanup({ organizationId }) {
  const policyResult = await pool.query(
    `SELECT id, retention_days
     FROM data_retention_policies
     WHERE organization_id = $1
       AND active = true
       AND auto_enforce = true
       AND resource_type = 'evidence'
     ORDER BY retention_days ASC`,
    [organizationId]
  );

  if (policyResult.rows.length === 0) {
    return { removed: 0, skipped: 0, reason: 'No active evidence retention policy.' };
  }

  const strictestDays = Math.min(...policyResult.rows.map((p) => Number(p.retention_days || 365)));

  const candidates = await pool.query(
    `SELECT e.id, e.file_path
     FROM evidence e
     WHERE e.organization_id = $1
       AND (
         e.retention_until < CURRENT_DATE
         OR e.created_at < NOW() - ($2 || ' days')::interval
       )`,
    [organizationId, String(strictestDays)]
  );

  let removed = 0;
  let skipped = 0;

  for (const row of candidates.rows) {
    const holdResult = await pool.query(
      `SELECT 1
       FROM legal_holds
       WHERE organization_id = $1
         AND active = true
         AND resource_type = 'evidence'
         AND (resource_id IS NULL OR resource_id = $2)
       LIMIT 1`,
      [organizationId, row.id]
    );

    if (holdResult.rows.length > 0) {
      skipped += 1;
      continue;
    }

    await pool.query(
      `DELETE FROM evidence
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, row.id]
    );

    if (row.file_path && fs.existsSync(row.file_path)) {
      try {
        fs.unlinkSync(row.file_path);
      } catch (error) {
        // Ignore file delete errors, DB record is removed.
      }
    }

    removed += 1;
  }

  return { removed, skipped, policy_days: strictestDays };
}

async function runJob(jobRow) {
  const payload = jobRow.payload || {};
  switch (jobRow.job_type) {
    case 'webhook_flush':
      return processPendingWebhookDeliveries({
        organizationId: jobRow.organization_id || payload.organizationId || null,
        limit: payload.limit || 50
      });
    case 'retention_cleanup':
      if (!jobRow.organization_id) {
        return { removed: 0, skipped: 0, reason: 'No organization_id on job.' };
      }
      return runRetentionCleanup({ organizationId: jobRow.organization_id });
    case 'integration_sync':
      return { synced: true, connector_id: payload.connectorId || null, mode: payload.mode || 'manual' };
    case 'evidence_auto_collect':
      if (!jobRow.organization_id) {
        return { noop: true, reason: 'No organization_id on job.' };
      }
      return runScheduledEvidenceCollection({ organizationId: jobRow.organization_id });
    default:
      return { noop: true, reason: `Unsupported job type: ${jobRow.job_type}` };
  }
}

async function runScheduledEvidenceCollection({ organizationId }) {
  const splunkService = require('./splunkService');

  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Atomically claim up to 20 due rules using FOR UPDATE SKIP LOCKED so that
  // concurrent job workers cannot process the same rule twice.
  const claimed = await pool.query(
    `WITH due AS (
       SELECT id FROM evidence_collection_rules
       WHERE organization_id = $1
         AND enabled = true
         AND schedule <> 'manual'
         AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT 20
       FOR UPDATE SKIP LOCKED
     )
     UPDATE evidence_collection_rules
     SET last_run_status = 'running',
         last_run_at     = NOW(),
         last_run_error  = NULL,
         updated_at      = NOW()
     FROM due
     WHERE evidence_collection_rules.id = due.id
     RETURNING evidence_collection_rules.*`,
    [organizationId]
  );

  let triggered = 0;
  let failed = 0;

  for (const rule of claimed.rows) {
    try {
      let evidenceId = null;
      let resultCount = 0;

      if (rule.source_type === 'splunk') {
        const settings = await splunkService.getOrgSplunkSettings(organizationId);
        if (!settings.baseUrl || !settings.apiToken) {
          throw new Error('Splunk not configured');
        }
        const sc = rule.source_config || {};
        const searchResult = await splunkService.runSearch(
          { baseUrl: settings.baseUrl, apiToken: settings.apiToken, defaultIndex: settings.defaultIndex },
          { search: sc.search, earliestTime: sc.earliest_time, latestTime: sc.latest_time, maxEvents: sc.max_events }
        );

        resultCount = searchResult.results.length;
        const evidencePayload = {
          auto_collected: true,
          rule_id: rule.id,
          rule_name: rule.name,
          source: 'splunk',
          imported_at: new Date().toISOString(),
          query: {
            search: searchResult.search,
            earliest_time: sc.earliest_time || '-24h@h',
            latest_time: sc.latest_time || 'now',
            sid: searchResult.sid
          },
          summary: { result_count: resultCount },
          results: searchResult.results
        };

        const fileBody = Buffer.from(JSON.stringify(evidencePayload, null, 2), 'utf8');
        const fileHash = createHash('sha256').update(fileBody).digest('hex');
        const safeName = String(rule.name || 'auto').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().substring(0, 80);
        const fileName = `${safeName}-${new Date().toISOString().split('T')[0]}.json`;
        const diskName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-auto.json`;
        const filePath = path.join(uploadsDir, diskName);
        fs.writeFileSync(filePath, fileBody);

        const retentionDays = Number(process.env.EVIDENCE_DEFAULT_RETENTION_DAYS || 365);
        const retentionDate = new Date();
        retentionDate.setDate(retentionDate.getDate() + Math.max(1, retentionDays));
        const retentionUntil = retentionDate.toISOString().split('T')[0];

        const ins = await pool.query(
          `INSERT INTO evidence (
             organization_id, uploaded_by, file_name, file_path, file_size, mime_type,
             description, tags, integrity_hash_sha256, evidence_version, retention_until,
             integrity_verified_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, NOW())
           RETURNING id`,
          [
            organizationId,
            rule.created_by,
            fileName,
            filePath,
            fileBody.length,
            'application/json',
            `Auto-collected from Splunk by rule "${rule.name}" (${resultCount} event${resultCount === 1 ? '' : 's'})`,
            Array.isArray(rule.tags) ? rule.tags : [],
            fileHash,
            retentionUntil
          ]
        );
        evidenceId = ins.rows[0].id;

        const controlIds = Array.isArray(rule.control_ids) ? rule.control_ids : [];
        if (controlIds.length > 0) {
          const validRows = await pool.query(
            'SELECT id FROM framework_controls WHERE id = ANY($1::uuid[])',
            [controlIds]
          );
          for (const row of validRows.rows) {
            await pool.query(
              `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
               VALUES ($1, $2, $3)
               ON CONFLICT DO NOTHING`,
              [evidenceId, row.id, `Auto-linked by rule "${rule.name}"`]
            );
          }
        }
      } else {
        throw new Error(`source_type "${rule.source_type}" not supported in scheduled collection`);
      }

      const nextRunAt = computeNextRunAt(rule.schedule);
      await pool.query(
        `UPDATE evidence_collection_rules
         SET last_run_status = 'success', last_run_error = NULL,
             last_evidence_id = $2, next_run_at = $3, updated_at = NOW()
         WHERE id = $1`,
        [rule.id, evidenceId, nextRunAt]
      );
      triggered++;
    } catch (err) {
      const nextRunAt = computeNextRunAt(rule.schedule);
      await pool.query(
        `UPDATE evidence_collection_rules
         SET last_run_status = 'error', last_run_error = $2, next_run_at = $3, updated_at = NOW()
         WHERE id = $1`,
        [rule.id, String(err.message || err).slice(0, 1000), nextRunAt]
      );
      failed++;
    }
  }

  return { triggered, failed, rules_processed: claimed.rows.length };
}

function computeNextRunAt(schedule) {
  const now = new Date();
  if (schedule === 'daily') { now.setDate(now.getDate() + 1); return now.toISOString(); }
  if (schedule === 'weekly') { now.setDate(now.getDate() + 7); return now.toISOString(); }
  if (schedule === 'monthly') { now.setMonth(now.getMonth() + 1); return now.toISOString(); }
  return null;
}

async function processPendingJobs({ organizationId = null, limit = 20 } = {}) {
  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const params = [];
  let where = `
    status = 'queued'
    AND run_after <= NOW()
  `;

  if (organizationId) {
    params.push(organizationId);
    where += ` AND organization_id = $${params.length}`;
  }

  params.push(boundedLimit);

  const jobsResult = await pool.query(
    `SELECT *
     FROM platform_jobs
     WHERE ${where}
     ORDER BY created_at ASC
     LIMIT $${params.length}`,
    params
  );

  let completed = 0;
  let failed = 0;
  const details = [];

  for (const job of jobsResult.rows) {
    await pool.query(
      `UPDATE platform_jobs
       SET status = 'running',
           attempts = attempts + 1,
           started_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [job.id]
    );

    try {
      const result = await runJob(job);
      await pool.query(
        `UPDATE platform_jobs
         SET status = 'completed',
             result = $2::jsonb,
             finished_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [job.id, JSON.stringify(result || {})]
      );
      completed += 1;
      details.push({ id: job.id, status: 'completed', result });
    } catch (error) {
      const maxAttempts = Number(job.max_attempts || 5);
      const nextStatus = Number(job.attempts || 0) + 1 >= maxAttempts ? 'failed' : 'queued';
      await pool.query(
        `UPDATE platform_jobs
         SET status = $2,
             error_message = $3,
             run_after = CASE WHEN $2 = 'queued' THEN NOW() + interval '5 minutes' ELSE run_after END,
             finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1`,
        [job.id, nextStatus, String(error.message || error).slice(0, 2000)]
      );
      failed += 1;
      details.push({ id: job.id, status: nextStatus, error: error.message });
    }
  }

  return {
    attempted: jobsResult.rows.length,
    completed,
    failed,
    details
  };
}

module.exports = {
  enqueueJob,
  processPendingJobs,
  runRetentionCleanup
};
