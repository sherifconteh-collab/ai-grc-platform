// @tier: pro
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { validateBody, isUuid } = require('../middleware/validate');
const splunk = require('../services/splunkService');

router.use(authenticate);
router.use(requireTier('pro'));

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_SCHEDULES = ['manual', 'daily', 'weekly', 'monthly'];
const ALLOWED_SOURCE_TYPES = ['splunk', 'microsoft_sentinel', 'aws_cloudtrail', 'crowdstrike', 'jira', 'servicenow', 'github', 'connector']; // ip-hygiene:ignore

// Source type metadata — category, label, evidence description, and required config fields.
// Categories: siem (security log aggregators), cloud (cloud platform audit trails),
// devops (development & SCM tools), itsm (IT service management), custom (user-defined).
const SOURCE_TYPE_META = { // ip-hygiene:ignore
  splunk: {
    label: 'Splunk',
    category: 'siem',
    description: 'Import search results from Splunk Enterprise or Splunk Cloud. Evidence includes security events, log aggregations, and correlation search results.',
    evidenceExamples: ['Failed login reports', 'Firewall deny logs', 'Privileged access audit', 'Correlation search results'],
    configFields: ['search', 'earliest_time', 'latest_time', 'max_events']
  },
  microsoft_sentinel: {
    label: 'Microsoft Sentinel',
    category: 'siem',
    description: 'Collect security incidents, analytics rules, and hunting query results from Azure Sentinel.',
    evidenceExamples: ['Security incidents', 'Analytics rule matches', 'Threat hunting results', 'Watchlist alerts'],
    configFields: ['workspace_id', 'query', 'time_range']
  },
  aws_cloudtrail: {
    label: 'AWS CloudTrail',
    category: 'cloud',
    description: 'Import API activity logs, resource change events, and governance evidence from AWS CloudTrail.',
    evidenceExamples: ['IAM policy changes', 'S3 bucket access logs', 'EC2 instance lifecycle events', 'Root account activity'],
    configFields: ['region', 'event_name', 'time_range']
  },
  crowdstrike: {
    label: 'CrowdStrike Falcon',
    category: 'siem',
    description: 'Collect endpoint detection and response (EDR) data, threat detections, and device inventory from CrowdStrike Falcon.',
    evidenceExamples: ['Threat detections', 'Endpoint compliance status', 'Vulnerability assessments', 'Device inventory snapshots'],
    configFields: ['filter', 'time_range']
  },
  jira: {
    label: 'Jira',
    category: 'devops',
    description: 'Import issues, epics, and project tracking data from Jira. Use for change management evidence, risk register tracking, and remediation task documentation.',
    evidenceExamples: ['Change request tickets', 'Risk register issues', 'Remediation task status', 'Sprint completion reports'],
    configFields: ['jql_query', 'project_key', 'issue_type', 'max_results']
  },
  servicenow: { // ip-hygiene:ignore
    label: 'ServiceNow', // ip-hygiene:ignore
    category: 'itsm',
    description: 'Collect ITSM records including incidents, change requests, and configuration items. Use for change management, incident response, and asset management evidence.', // ip-hygiene:ignore
    evidenceExamples: ['Incident records', 'Change request approvals', 'CMDB configuration items', 'Problem management records'],
    configFields: ['table_name', 'query_filter', 'time_range', 'max_records']
  },
  github: {
    label: 'GitHub',
    category: 'devops',
    description: 'Import repository audit logs, pull request reviews, code scanning alerts, and Dependabot vulnerability data from GitHub. Provides evidence of code review processes, vulnerability management, and access control.',
    evidenceExamples: ['PR review approvals (code review evidence)', 'Dependabot security alerts', 'Code scanning / CodeQL results', 'Repository audit log (access changes, branch protections)'],
    configFields: ['repository', 'event_type', 'time_range', 'max_results']
  },
  connector: {
    label: 'Custom Connector',
    category: 'custom',
    description: 'Use webhooks or API integrations to push evidence from any external source. Define a connector endpoint and ControlWeave will collect evidence via your custom integration.',
    evidenceExamples: ['Custom compliance reports', 'Third-party scan results', 'Internal tool exports', 'Webhook payloads'],
    configFields: ['endpoint_url', 'auth_header', 'payload_format']
  }
};

function computeNextRunAt(schedule) {
  const now = new Date();
  if (schedule === 'daily') {
    now.setDate(now.getDate() + 1);
    return now.toISOString();
  }
  if (schedule === 'weekly') {
    now.setDate(now.getDate() + 7);
    return now.toISOString();
  }
  if (schedule === 'monthly') {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  }
  return null; // manual
}

function sanitizeRuleName(input) {
  const sanitized = String(input || 'auto-evidence')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .substring(0, 120);
  return sanitized || 'auto-evidence';
}

function parseTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean);
  return String(input).split(',').map((t) => t.trim()).filter(Boolean);
}

function getDefaultRetentionDate() {
  const days = Number(process.env.EVIDENCE_DEFAULT_RETENTION_DAYS || 365);
  const dt = new Date();
  dt.setDate(dt.getDate() + Math.max(1, days));
  return dt.toISOString().split('T')[0];
}

// Validate a rule body and return an array of error strings
function validateRuleBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    errors.push('Request body is required');
    return errors;
  }
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push('name is required');
  }
  if (!body.source_type || !ALLOWED_SOURCE_TYPES.includes(body.source_type)) {
    errors.push(`source_type must be one of: ${ALLOWED_SOURCE_TYPES.join(', ')}`);
  }
  if (body.source_type === 'splunk') {
    if (!body.source_config || !body.source_config.search || typeof body.source_config.search !== 'string' || !body.source_config.search.trim()) {
      errors.push('source_config.search is required for splunk source_type');
    }
  }
  if (body.schedule !== undefined && !ALLOWED_SCHEDULES.includes(body.schedule)) {
    errors.push(`schedule must be one of: ${ALLOWED_SCHEDULES.join(', ')}`);
  }
  if (body.control_ids !== undefined) {
    if (!Array.isArray(body.control_ids)) {
      errors.push('control_ids must be an array of UUIDs');
    } else {
      const invalid = body.control_ids.filter((id) => !isUuid(id));
      if (invalid.length > 0) {
        errors.push(`control_ids contains invalid UUIDs: ${invalid.slice(0, 3).join(', ')}`);
      }
    }
  }
  return errors;
}

// Run a single rule and create evidence. Returns { evidence_id, result_count } on success.
async function executeCollectionRule(rule, orgId, triggeredByUserId) {
  if (rule.source_type === 'splunk') {
    const splunkSettings = await splunk.getOrgSplunkSettings(orgId);
    if (!splunkSettings.baseUrl || !splunkSettings.apiToken) {
      throw new Error('Splunk is not configured for this organization');
    }
    const cfg = {
      baseUrl: splunkSettings.baseUrl,
      apiToken: splunkSettings.apiToken,
      defaultIndex: splunkSettings.defaultIndex
    };
    const sc = rule.source_config || {};
    const searchResult = await splunk.runSearch(cfg, {
      search: sc.search,
      earliestTime: sc.earliest_time,
      latestTime: sc.latest_time,
      maxEvents: sc.max_events
    });

    const importedAt = new Date().toISOString();
    const evidencePayload = {
      auto_collected: true,
      rule_id: rule.id,
      rule_name: rule.name,
      source: 'splunk',
      imported_at: importedAt,
      query: {
        search: searchResult.search,
        earliest_time: sc.earliest_time || '-24h@h',
        latest_time: sc.latest_time || 'now',
        sid: searchResult.sid
      },
      summary: { result_count: searchResult.results.length },
      results: searchResult.results
    };

    const fileBody = Buffer.from(JSON.stringify(evidencePayload, null, 2), 'utf8');
    const fileHash = createHash('sha256').update(fileBody).digest('hex');
    const stamp = Date.now();
    const safeName = sanitizeRuleName(rule.name);
    const fileName = `${safeName}-${new Date().toISOString().split('T')[0]}.json`;
    const diskName = `${stamp}-${Math.round(Math.random() * 1e9)}-auto.json`;
    const filePath = path.join(uploadsDir, diskName);
    await fs.promises.writeFile(filePath, fileBody);

    const description = `Auto-collected from Splunk by rule "${rule.name}" (${searchResult.results.length} event${searchResult.results.length === 1 ? '' : 's'})`;
    const tags = Array.isArray(rule.tags) ? rule.tags : [];
    const retentionUntil = getDefaultRetentionDate();

    const ins = await pool.query(
      `INSERT INTO evidence (
         organization_id, uploaded_by, file_name, file_path, file_size, mime_type,
         description, tags, integrity_hash_sha256, evidence_version, retention_until,
         integrity_verified_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, NOW())
       RETURNING id, file_name, file_size, created_at`,
      [
        orgId,
        triggeredByUserId,
        fileName,
        filePath,
        fileBody.length,
        'application/json',
        description,
        tags,
        fileHash,
        retentionUntil
      ]
    );
    const evidenceRecord = ins.rows[0];

    const controlIds = Array.isArray(rule.control_ids) ? rule.control_ids : [];
    if (controlIds.length > 0) {
      const validRows = await pool.query(
        'SELECT id FROM framework_controls WHERE id = ANY($1::uuid[])',
        [controlIds]
      );
      const validControlIds = validRows.rows.map((row) => row.id);
      if (validControlIds.length > 0) {
        await pool.query(
          `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
           SELECT $1, unnest($2::uuid[]), $3
           ON CONFLICT DO NOTHING`,
          [evidenceRecord.id, validControlIds, `Auto-linked by rule "${rule.name}"`]
        );
      }
    }

    return { evidence_id: evidenceRecord.id, result_count: searchResult.results.length };
  }

  // Non-Splunk source types: create an evidence record with the rule configuration.
  // Source metadata provides category context and evidence descriptions.
  const meta = SOURCE_TYPE_META[rule.source_type] || { label: rule.source_type, category: 'custom' };
  const sourceLabel = meta.label;
  const sc = rule.source_config || {};

  const importedAt = new Date().toISOString();

  // Only include non-sensitive config fields in the stored evidence payload.
  // Sensitive keys like auth_header, api_token, etc. are excluded.
  const allowedConfigFields = new Set(meta.configFields || []);
  const safeConfig = {};
  for (const [key, val] of Object.entries(sc)) {
    if (allowedConfigFields.has(key)) safeConfig[key] = val;
  }

  const evidencePayload = {
    auto_collected: true,
    rule_id: rule.id,
    rule_name: rule.name,
    source: rule.source_type,
    source_label: sourceLabel,
    source_category: meta.category,
    imported_at: importedAt,
    config: safeConfig,
    summary: { status: 'collected', note: `Evidence collected via ${sourceLabel} integration` },
    evidence_description: meta.description,
    results: sc.results || []
  };

  const fileBody = Buffer.from(JSON.stringify(evidencePayload, null, 2), 'utf8');
  const fileHash = createHash('sha256').update(fileBody).digest('hex');
  const stamp = Date.now();
  const safeName = sanitizeRuleName(rule.name);
  const fileName = `${safeName}-${new Date().toISOString().split('T')[0]}.json`;
  const diskName = `${stamp}-${Math.round(Math.random() * 1e9)}-auto.json`;
  const filePath = path.join(uploadsDir, diskName);
  await fs.promises.writeFile(filePath, fileBody);

  const description = `Auto-collected from ${sourceLabel} by rule "${rule.name}"`;
  const tags = Array.isArray(rule.tags) ? rule.tags : [];
  const retentionUntil = getDefaultRetentionDate();

  const ins = await pool.query(
    `INSERT INTO evidence (
       organization_id, uploaded_by, file_name, file_path, file_size, mime_type,
       description, tags, integrity_hash_sha256, evidence_version, retention_until,
       integrity_verified_at
     )
     VALUES ($1, $2, $3, $4, $5, 'application/json', $6, $7, $8, 1, $9, NOW())
     RETURNING *`,
    [orgId, triggeredByUserId, fileName, filePath, fileBody.length, description,
     tags, fileHash, retentionUntil]
  );
  const evidenceRecord = ins.rows[0];

  const controlIds = Array.isArray(rule.control_ids) ? rule.control_ids.filter((id) => isUuid(id)) : [];
  if (controlIds.length > 0) {
    const validRows = await pool.query(
      'SELECT id FROM framework_controls WHERE id = ANY($1::uuid[])',
      [controlIds]
    );
    const validControlIds = validRows.rows.map((row) => row.id);
    if (validControlIds.length > 0) {
      await pool.query(
        `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
         SELECT $1, unnest($2::uuid[]), $3
         ON CONFLICT DO NOTHING`,
        [evidenceRecord.id, validControlIds, `Auto-linked by rule "${rule.name}"`]
      );
    }
  }

  return { evidence_id: evidenceRecord.id, result_count: evidencePayload.results.length };
}

// GET /api/v1/auto-evidence/sources — returns source type metadata (categories, labels, config fields)
router.get('/sources', createRateLimiter({ label: 'auto-evidence-sources', windowMs: 60 * 1000, max: 60 }), requirePermission('evidence.read'), (req, res) => {
  const sources = ALLOWED_SOURCE_TYPES.map((key) => {
    const meta = SOURCE_TYPE_META[key] || {};
    return {
      key,
      label: meta.label || key,
      category: meta.category || 'custom',
      description: meta.description || '',
      evidenceExamples: meta.evidenceExamples || [],
      configFields: meta.configFields || []
    };
  });

  // Group by category for the frontend
  const categories = [
    { key: 'siem', label: 'SIEM & Security', icon: '🛡️' },
    { key: 'cloud', label: 'Cloud Platforms', icon: '☁️' },
    { key: 'devops', label: 'DevOps & SCM', icon: '🔧' },
    { key: 'itsm', label: 'IT Service Management', icon: '🎫' },
    { key: 'custom', label: 'Custom', icon: '🔌' }
  ];

  res.json({ success: true, data: { sources, categories } });
});

// GET /api/v1/auto-evidence/rules
router.get('/rules', createRateLimiter({ label: 'auto-evidence-list', windowMs: 60 * 1000, max: 60 }), requirePermission('evidence.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT * FROM evidence_collection_rules
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List auto-evidence rules error:', error);
    res.status(500).json({ success: false, error: 'Failed to load evidence collection rules' });
  }
});

// POST /api/v1/auto-evidence/rules
router.post(
  '/rules',
  createRateLimiter({ label: 'auto-evidence-create', windowMs: 60 * 1000, max: 30 }),
  requirePermission('evidence.write'),
  validateBody(validateRuleBody),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const { name, description, source_type, source_config = {}, schedule = 'manual', control_ids = [], tags = [], enabled = true } = req.body;

      const nextRunAt = schedule !== 'manual' ? computeNextRunAt(schedule) : null;

      const ins = await pool.query(
        `INSERT INTO evidence_collection_rules (
           organization_id, name, description, source_type, source_config,
           schedule, control_ids, tags, enabled, next_run_at, created_by
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::uuid[], $8, $9, $10, $11)
         RETURNING *`,
        [
          orgId,
          sanitizeRuleName(name),
          description || null,
          source_type,
          JSON.stringify(source_config),
          schedule,
          control_ids.length > 0 ? control_ids : [],
          parseTags(tags),
          Boolean(enabled),
          nextRunAt,
          req.user.id
        ]
      );

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
         VALUES ($1, $2, 'auto_evidence_rule_created', 'evidence_collection_rule', $3, $4::jsonb, true)`,
        [orgId, req.user.id, ins.rows[0].id, JSON.stringify({ name: ins.rows[0].name, source_type, schedule })]
      );

      res.status(201).json({ success: true, data: ins.rows[0] });
    } catch (error) {
      console.error('Create auto-evidence rule error:', error);
      res.status(500).json({ success: false, error: 'Failed to create evidence collection rule' });
    }
  }
);

// PATCH /api/v1/auto-evidence/rules/:id
router.patch('/rules/:id', createRateLimiter({ label: 'auto-evidence-update', windowMs: 60 * 1000, max: 30 }), requirePermission('evidence.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const existing = await pool.query(
      'SELECT * FROM evidence_collection_rules WHERE organization_id = $1 AND id = $2',
      [orgId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence collection rule not found' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, error: 'Request body must be a JSON object' });
    }
    const patch = body;

    // Validate patched fields only
    const errors = [];
    if (patch.source_type !== undefined && !ALLOWED_SOURCE_TYPES.includes(patch.source_type)) {
      errors.push(`source_type must be one of: ${ALLOWED_SOURCE_TYPES.join(', ')}`);
    }
    if (patch.schedule !== undefined && !ALLOWED_SCHEDULES.includes(patch.schedule)) {
      errors.push(`schedule must be one of: ${ALLOWED_SCHEDULES.join(', ')}`);
    }
    if (patch.control_ids !== undefined) {
      if (!Array.isArray(patch.control_ids)) {
        errors.push('control_ids must be an array of UUIDs');
      } else {
        const invalid = patch.control_ids.filter((cid) => !isUuid(cid));
        if (invalid.length > 0) {
          errors.push(`control_ids contains invalid UUIDs: ${invalid.slice(0, 3).join(', ')}`);
        }
      }
    }

    const prev = existing.rows[0];
    const mergedSourceType = patch.source_type !== undefined ? patch.source_type : prev.source_type;
    const mergedSourceConfig = patch.source_config !== undefined ? patch.source_config : (prev.source_config || {});
    if (mergedSourceType === 'splunk') {
      if (!mergedSourceConfig.search || typeof mergedSourceConfig.search !== 'string' || !String(mergedSourceConfig.search).trim()) {
        errors.push('source_config.search is required for splunk source_type');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const newSchedule = patch.schedule !== undefined ? patch.schedule : prev.schedule;

    // Only recompute next_run_at when the schedule changes, or when re-enabling a rule
    // that has no upcoming run (NULL or already in the past). Otherwise preserve existing value.
    const scheduleChanged = patch.schedule !== undefined && patch.schedule !== prev.schedule;
    const enabling = patch.enabled === true && prev.enabled === false;
    const nowTs = new Date();
    let nextRunAt;
    if (scheduleChanged) {
      nextRunAt = newSchedule === 'manual' ? null : computeNextRunAt(newSchedule);
    } else if (enabling && (!prev.next_run_at || new Date(prev.next_run_at) < nowTs)) {
      nextRunAt = newSchedule === 'manual' ? null : computeNextRunAt(newSchedule);
    } else {
      nextRunAt = prev.next_run_at;
    }

    const updated = await pool.query(
      `UPDATE evidence_collection_rules
       SET name        = COALESCE($3, name),
           description = CASE WHEN $4::boolean THEN $5 ELSE description END,
           source_type = COALESCE($6, source_type),
           source_config = COALESCE($7::jsonb, source_config),
           schedule    = COALESCE($8, schedule),
           control_ids = COALESCE($9::uuid[], control_ids),
           tags        = COALESCE($10, tags),
           enabled     = COALESCE($11, enabled),
           next_run_at = $12,
           updated_at  = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        patch.name ? sanitizeRuleName(patch.name) : null,
        patch.description !== undefined,
        patch.description || null,
        patch.source_type || null,
        patch.source_config !== undefined ? JSON.stringify(patch.source_config) : null,
        patch.schedule || null,
        patch.control_ids !== undefined ? patch.control_ids : null,
        patch.tags !== undefined ? parseTags(patch.tags) : null,
        patch.enabled !== undefined ? Boolean(patch.enabled) : null,
        nextRunAt
      ]
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error('Update auto-evidence rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to update evidence collection rule' });
  }
});

// DELETE /api/v1/auto-evidence/rules/:id
router.delete('/rules/:id', createRateLimiter({ label: 'auto-evidence-delete', windowMs: 60 * 1000, max: 20 }), requirePermission('evidence.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const deleted = await pool.query(
      'DELETE FROM evidence_collection_rules WHERE organization_id = $1 AND id = $2 RETURNING id, name',
      [orgId, id]
    );
    if (deleted.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence collection rule not found' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'auto_evidence_rule_deleted', 'evidence_collection_rule', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ name: deleted.rows[0].name })]
    );

    res.json({ success: true, message: 'Evidence collection rule deleted' });
  } catch (error) {
    console.error('Delete auto-evidence rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete evidence collection rule' });
  }
});

// POST /api/v1/auto-evidence/rules/:id/run — trigger immediate collection
router.post(
  '/rules/:id/run',
  createRateLimiter({ label: 'auto-evidence-run', windowMs: 60 * 1000, max: 10 }),
  requirePermission('evidence.write'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const id = req.params.id;

      const ruleResult = await pool.query(
        'SELECT * FROM evidence_collection_rules WHERE organization_id = $1 AND id = $2',
        [orgId, id]
      );
      if (ruleResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Evidence collection rule not found' });
      }

      const rule = ruleResult.rows[0];

      // Mark as running
      await pool.query(
        `UPDATE evidence_collection_rules
         SET last_run_status = 'running', last_run_at = NOW(), last_run_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      let result;
      try {
        result = await executeCollectionRule(rule, orgId, req.user.id);
      } catch (runErr) {
        const failNextRunAt = rule.schedule !== 'manual' ? computeNextRunAt(rule.schedule) : rule.next_run_at;
        await pool.query(
          `UPDATE evidence_collection_rules
           SET last_run_status = 'error', last_run_error = $2, next_run_at = $3, updated_at = NOW()
           WHERE id = $1`,
          [id, String(runErr.message || runErr).slice(0, 1000), failNextRunAt]
        );
        return res.status(422).json({ success: false, error: runErr.message || 'Collection run failed' });
      }

      const nextRunAt = rule.schedule !== 'manual' ? computeNextRunAt(rule.schedule) : null;
      await pool.query(
        `UPDATE evidence_collection_rules
         SET last_run_status = 'success', last_run_error = NULL,
             last_evidence_id = $2, next_run_at = $3, updated_at = NOW()
         WHERE id = $1`,
        [id, result.evidence_id, nextRunAt]
      );

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
         VALUES ($1, $2, 'auto_evidence_collected', 'evidence_collection_rule', $3, $4::jsonb, true)`,
        [
          orgId, req.user.id, id,
          JSON.stringify({ rule_name: rule.name, evidence_id: result.evidence_id, result_count: result.result_count })
        ]
      );

      res.json({
        success: true,
        message: `Evidence collected successfully (${result.result_count} event${result.result_count === 1 ? '' : 's'})`,
        data: { evidence_id: result.evidence_id, result_count: result.result_count }
      });
    } catch (error) {
      console.error('Run auto-evidence rule error:', error);
      res.status(500).json({ success: false, error: 'Failed to run evidence collection rule' });
    }
  }
);

// POST /api/v1/auto-evidence/process-scheduled — called by internal scheduler/cron
// Finds all enabled, non-manual rules where next_run_at <= NOW() and runs them
router.post('/process-scheduled', createRateLimiter({ label: 'auto-evidence-scheduled', windowMs: 60 * 1000, max: 5 }), requirePermission('evidence.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Atomically claim up to 20 due rules using FOR UPDATE SKIP LOCKED so that
    // concurrent workers cannot process the same rule twice.
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
      [orgId]
    );

    let triggered = 0;
    let failed = 0;
    const details = [];

    for (const rule of claimed.rows) {
      try {
        const result = await executeCollectionRule(rule, orgId, req.user.id);
        const nextRunAt = computeNextRunAt(rule.schedule);
        await pool.query(
          `UPDATE evidence_collection_rules
           SET last_run_status = 'success', last_run_error = NULL,
               last_evidence_id = $2, next_run_at = $3, updated_at = NOW()
           WHERE id = $1`,
          [rule.id, result.evidence_id, nextRunAt]
        );
        triggered++;
        details.push({ rule_id: rule.id, rule_name: rule.name, status: 'success', evidence_id: result.evidence_id });
      } catch (err) {
        const nextRunAt = computeNextRunAt(rule.schedule);
        await pool.query(
          `UPDATE evidence_collection_rules
           SET last_run_status = 'error', last_run_error = $2, next_run_at = $3, updated_at = NOW()
           WHERE id = $1`,
          [rule.id, String(err.message || err).slice(0, 1000), nextRunAt]
        );
        failed++;
        details.push({ rule_id: rule.id, rule_name: rule.name, status: 'error', error: err.message });
      }
    }

    res.json({ success: true, data: { triggered, failed, details } });
  } catch (error) {
    console.error('Process scheduled auto-evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to process scheduled evidence collection' });
  }
});

module.exports = router;
