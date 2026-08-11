// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { decrypt } = require('../utils/encrypt');
const splunk = require('../services/splunkService');
const dynamicFieldsService = require('../services/dynamicAuditFieldsService');
const { createRateLimiter } = require('../middleware/rateLimit');
const { decodeCursor, nextCursorFrom } = require('../utils/keysetPagination');
const rateLimit = require('express-rate-limit');
const auditService = require('../services/auditService');
const { log, serializeError } = require('../utils/logger');

const auditWriteLimiter = createRateLimiter({
  label: 'audit-log-write',
  windowMs: 60 * 1000,
  max: 60
});

// Valid values for audit_logs.outcome, per the column comment set in
// migration 048. The legacy boolean audit_logs.success is derived from this
// rather than accepted independently: the two describe the same fact, and
// letting a caller set them separately allowed a record asserting
// success = true alongside outcome = 'failure'. 'partial' maps to
// success = false -- a partially completed action is not a success, and for
// an audit record under-claiming is the safer direction.
const AUDIT_OUTCOMES = ['success', 'failure', 'partial'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// express-rate-limit applied router-wide, ahead of authenticate, so a cheap
// IP-based bound is in place before authenticate's own DB/JWT work runs, and
// so static analysis (CodeQL) can trace a recognized rate-limiting
// middleware covering every route below — the Redis-backed auditWriteLimiter
// above remains the real per-org production control on the write route.
// Matches the pattern already established in trustCenter.js.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

router.use(authenticate);

// Shared filter builder for the audit read paths. GET /logs and GET /export
// must agree on what a given filter set selects -- an export that quietly
// returns a different population than the screen the auditor was looking at
// is worse than no export. Appends to `params` and returns the next
// placeholder index; every value is parameterized.
function buildAuditFilterClause(query, params, startIdx) {
  const { userId, eventType, resourceType, resourceId, startDate, endDate,
    findingKey, vulnerabilityId, source, outcome } = query;
  let clause = '';
  let idx = startIdx;
  const add = (sql, value) => {
    clause += ` AND ${sql.replace('$$', `$${idx}`)}`;
    params.push(value);
    idx++;
  };

  if (userId) add('al.user_id = $$', userId);
  if (eventType) add('al.event_type = $$', eventType);
  if (resourceType) add('al.resource_type = $$', String(resourceType));
  if (resourceId) add('al.resource_id::text = $$', String(resourceId));
  if (startDate) add('al.created_at >= $$', startDate);
  if (endDate) add('al.created_at <= $$', endDate);
  if (findingKey) add("al.details->>'finding_key' = $$", String(findingKey));
  if (vulnerabilityId) add("al.details->>'vulnerability_id' = $$", String(vulnerabilityId));
  if (source) add("al.details->>'source' = $$", String(source));
  // Not offered by GET /logs before this change: an assessor reviewing AU-6
  // findings almost always wants the failures on their own.
  if (outcome) add('al.outcome = $$', String(outcome));

  return { clause, nextIdx: idx };
}

// RFC 4180 escaping. A leading =, +, - or @ is prefixed with a single quote so
// spreadsheet software does not evaluate an audit value as a formula.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /audit/logs
router.get('/logs', requirePermission('audit.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      userId,
      eventType,
      resourceType,
      resourceId,
      startDate,
      endDate,
      findingKey,
      vulnerabilityId,
      source,
      limit,
      offset,
      cursor
    } = req.query;
    const normalizedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const normalizedOffset = Math.max(0, parseInt(offset, 10) || 0);
    // Keyset pagination: pass cursor=<next_cursor from a previous response>
    // for O(1) page turns on deep audit history. OFFSET remains supported.
    const keyset = cursor ? decodeCursor(cursor) : null;
    if (cursor && !keyset) {
      return res.status(400).json({ success: false, error: 'Invalid cursor' });
    }

    let query = `
      SELECT al.id, al.event_type, al.resource_type, al.resource_id, al.details,
             al.ip_address, al.user_agent, al.success, al.failure_reason, al.created_at,
             al.session_id, al.authentication_method, al.sso_provider, al.siem_forwarded,
             al.outcome, al.request_id, al.actor_name, al.source_system,
             u.first_name || ' ' || u.last_name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.organization_id = $1
    `;
    const params = [orgId];
    let idx = 2;

    const filters = buildAuditFilterClause(req.query, params, idx);
    query += filters.clause;
    idx = filters.nextIdx;

    if (keyset) {
      query += ` AND (al.created_at, al.id) < ($${idx}, $${idx + 1})`;
      params.push(keyset.createdAt, keyset.id);
      idx += 2;
      query += ' ORDER BY al.created_at DESC, al.id DESC';
      query += ` LIMIT $${idx}`;
      params.push(normalizedLimit);
    } else {
      query += ' ORDER BY al.created_at DESC, al.id DESC';
      query += ` LIMIT $${idx}`;
      params.push(normalizedLimit);
      idx++;
      query += ` OFFSET $${idx}`;
      params.push(normalizedOffset);
    }

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM audit_logs al WHERE al.organization_id = $1';
    const countParams = [orgId];
    let countIdx = 2;

    if (userId) {
      countQuery += ` AND al.user_id = $${countIdx}`;
      countParams.push(userId);
      countIdx++;
    }
    if (eventType) {
      countQuery += ` AND al.event_type = $${countIdx}`;
      countParams.push(eventType);
      countIdx++;
    }
    if (resourceType) {
      countQuery += ` AND al.resource_type = $${countIdx}`;
      countParams.push(String(resourceType));
      countIdx++;
    }
    if (resourceId) {
      countQuery += ` AND al.resource_id::text = $${countIdx}`;
      countParams.push(String(resourceId));
      countIdx++;
    }
    if (startDate) {
      countQuery += ` AND al.created_at >= $${countIdx}`;
      countParams.push(startDate);
      countIdx++;
    }
    if (endDate) {
      countQuery += ` AND al.created_at <= $${countIdx}`;
      countParams.push(endDate);
      countIdx++;
    }
    if (findingKey) {
      countQuery += ` AND al.details->>'finding_key' = $${countIdx}`;
      countParams.push(String(findingKey));
      countIdx++;
    }
    if (vulnerabilityId) {
      countQuery += ` AND al.details->>'vulnerability_id' = $${countIdx}`;
      countParams.push(String(vulnerabilityId));
      countIdx++;
    }
    if (source) {
      countQuery += ` AND al.details->>'source' = $${countIdx}`;
      countParams.push(String(source));
      countIdx++;
    }

    // Cursor mode skips the full COUNT(*) — that scan is exactly the cost
    // keyset pagination exists to avoid on deep audit history.
    const countResult = keyset ? null : await pool.query(countQuery, countParams);

    // Get custom field values for the audit logs
    const auditLogIds = result.rows.map(row => row.id);
    const customFields = auditLogIds.length > 0 
      ? await dynamicFieldsService.getCustomFieldValues(auditLogIds)
      : {};

    // Merge custom fields into the audit log entries
    const logsWithCustomFields = result.rows.map(log => ({
      ...log,
      user_email: log.user_email ? decrypt(log.user_email) : null,
      custom_fields: customFields[log.id] || {}
    }));

    res.json({
      success: true,
      data: logsWithCustomFields,
      logs: logsWithCustomFields,
      pagination: keyset
        ? {
            limit: normalizedLimit,
            next_cursor: nextCursorFrom(result.rows, normalizedLimit)
          }
        : {
            total: parseInt(countResult.rows[0].count),
            limit: normalizedLimit,
            offset: normalizedOffset,
            next_cursor: nextCursorFrom(result.rows, normalizedLimit)
          }
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to load audit logs' });
  }
});

// POST /audit/logs — create an audit log entry (used by MCP agents and integrations)
router.post('/logs', auditWriteLimiter, requirePermission('audit.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const { event_type, resource_type, resource_id, details, outcome, source_system } = req.body;

    if (!event_type || typeof event_type !== 'string' || event_type.length > 100) {
      return res.status(400).json({ success: false, error: 'event_type is required (string, max 100 chars).' });
    }

    const resolvedOutcome = outcome || 'success';
    if (!AUDIT_OUTCOMES.includes(resolvedOutcome)) {
      return res.status(400).json({
        success: false,
        error: `outcome must be one of: ${AUDIT_OUTCOMES.join(', ')}.`
      });
    }

    // resource_id is a UUID column -- reject a malformed value here rather than
    // letting the driver raise and surface as an opaque 500.
    if (resource_id && !UUID_PATTERN.test(String(resource_id))) {
      return res.status(400).json({ success: false, error: 'resource_id must be a UUID.' });
    }

    // Parse details — accept string (JSON) or object
    let parsedDetails = {};
    if (details) {
      if (typeof details === 'string') {
        try { parsedDetails = JSON.parse(details); } catch { parsedDetails = { text: details }; }
      } else {
        parsedDetails = details;
      }
    }

    const result = await auditService.logFromRequest(req, {
      eventType: event_type,
      resourceType: resource_type || null,
      resourceId: resource_id || null,
      details: parsedDetails,
      success: resolvedOutcome === 'success',
      sourceSystem: source_system || 'mcp_agent'
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Audit log create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create audit log entry' });
  }
});

// GET /audit/export — AU-7 (Audit Record Reduction and Report Generation)
//
// Auditors previously had no way to take audit records out of the platform;
// the only options were paging the API by hand or going to the database.
// Accepts the same filters as GET /logs and streams the result so a
// multi-year export does not have to be held in memory. Rows are written in
// keyset batches rather than one unbounded query for the same reason.
router.get('/export', requirePermission('audit.read'), async (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) {
    return res.status(400).json({ success: false, error: "format must be 'csv' or 'json'." });
  }

  const COLUMNS = [
    'id', 'created_at', 'event_type', 'outcome', 'success', 'failure_reason',
    'actor_name', 'user_email', 'user_id', 'organization_id',
    'resource_type', 'resource_id', 'ip_address', 'user_agent',
    'request_id', 'source_system', 'authentication_method', 'sso_provider',
    'siem_forwarded', 'details'
  ];
  const BATCH = 1000;

  try {
    const orgId = req.user.organization_id;
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.${format}"`);

    if (format === 'csv') {
      res.write(COLUMNS.join(',') + '\n');
    } else {
      res.write('[');
    }

    let lastCreatedAt = null;
    let lastId = null;
    let wrote = 0;

    for (;;) {
      const params = [orgId];
      let idx = 2;
      let sql = `
        SELECT al.id, al.created_at, al.event_type, al.outcome, al.success,
               al.failure_reason, al.actor_name, al.user_id, al.organization_id,
               al.resource_type, al.resource_id, al.ip_address, al.user_agent,
               al.request_id, al.source_system, al.authentication_method,
               al.sso_provider, al.siem_forwarded, al.details,
               u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.organization_id = $1
      `;
      const filters = buildAuditFilterClause(req.query, params, idx);
      sql += filters.clause;
      idx = filters.nextIdx;

      if (lastCreatedAt !== null) {
        sql += ` AND (al.created_at, al.id) > ($${idx}, $${idx + 1})`;
        params.push(lastCreatedAt, lastId);
        idx += 2;
      }

      sql += ` ORDER BY al.created_at ASC, al.id ASC LIMIT ${BATCH}`;

      const { rows } = await pool.query(sql, params);
      if (rows.length === 0) break;

      for (const row of rows) {
        // Stored encrypted; decrypt for the export the same way GET /logs does.
        row.user_email = row.user_email ? decrypt(row.user_email) : null;
        if (format === 'csv') {
          res.write(COLUMNS.map((c) => csvCell(row[c])).join(',') + '\n');
        } else {
          res.write((wrote === 0 ? '' : ',') + JSON.stringify(row));
        }
        wrote++;
      }

      lastCreatedAt = rows[rows.length - 1].created_at;
      lastId = rows[rows.length - 1].id;
      if (rows.length < BATCH) break;
    }

    if (format === 'json') res.write(']');
    res.end();

    // The export itself is an auditable read of the audit trail (AU-6/AU-9).
    auditService.logFromRequest(req, {
      eventType: 'audit.exported',
      resourceType: 'audit_log',
      details: { format, row_count: wrote, filters: req.query }
    }).catch((err) => log('error', 'audit.write_failed',
      { eventType: 'audit.exported', error: serializeError(err) }));
  } catch (error) {
    log('error', 'audit.export_failed', { error: serializeError(error) });
    // Headers are already sent once streaming has begun, so the only honest
    // signal left is to break the stream rather than end it cleanly and hand
    // the auditor a silently truncated file.
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to export audit log' });
  }
});

// GET /audit/stats
router.get('/stats', requirePermission('audit.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [orgId];
    let idx = 2;

    if (startDate) {
      dateFilter += ` AND created_at >= $${idx}`;
      params.push(startDate);
      idx++;
    }
    if (endDate) {
      dateFilter += ` AND created_at <= $${idx}`;
      params.push(endDate);
      idx++;
    }

    const result = await pool.query(`
      SELECT event_type, COUNT(*) as count
      FROM audit_logs
      WHERE organization_id = $1 ${dateFilter}
      GROUP BY event_type
      ORDER BY count DESC
    `, params);

    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_logs WHERE organization_id = $1 ${dateFilter}`,
      params
    );

    res.json({
      success: true,
      data: {
        eventBreakdown: result.rows,
        totalEvents: parseInt(totalResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Audit stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load audit stats' });
  }
});

// GET /audit/splunk/live
router.get('/splunk/live', requirePermission('audit.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const settings = await splunk.getOrgSplunkSettings(orgId);
    const configured = Boolean(settings.baseUrl && settings.apiToken);

    if (!configured) {
      return res.json({
        success: true,
        data: {
          configured: false,
          message: 'Splunk integration is not configured for this organization.',
          results: [],
          result_count: 0
        }
      });
    }

    const maxEvents = Math.max(1, Math.min(200, Number(req.query.maxEvents) || 50));
    const search = String(req.query.search || process.env.SPLUNK_AUDIT_LIVE_DEFAULT_SEARCH || 'index=_audit OR sourcetype=audit OR tag=audit').trim();
    const earliestTime = req.query.earliestTime || '-24h@h';
    const latestTime = req.query.latestTime || 'now';

    const result = await splunk.runSearch({
      baseUrl: settings.baseUrl,
      apiToken: settings.apiToken,
      defaultIndex: settings.defaultIndex
    }, {
      search,
      earliestTime,
      latestTime,
      maxEvents
    });

    res.json({
      success: true,
      data: {
        configured: true,
        sid: result.sid,
        search: result.search,
        earliest_time: earliestTime,
        latest_time: latestTime,
        result_count: result.results.length,
        results: result.results
      }
    });
  } catch (error) {
    console.error('Splunk live audit error:', error);
    res.status(502).json({
      success: false,
      error: 'Failed to fetch live Splunk audit events'
    });
  }
});

// GET /audit/event-types
router.get('/event-types', requirePermission('audit.read'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT event_type FROM audit_logs WHERE organization_id = $1 ORDER BY event_type',
      [req.user.organization_id]
    );
    const eventTypes = result.rows.map(r => r.event_type);
    res.json({ success: true, data: eventTypes, eventTypes });
  } catch (error) {
    console.error('Event types error:', error);
    res.status(500).json({ success: false, error: 'Failed to load event types' });
  }
});

// GET /audit/user/:userId
router.get('/user/:userId', requirePermission('audit.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.id, al.event_type, al.resource_type, al.details, al.created_at, al.success
      FROM audit_logs al
      WHERE al.user_id = $1 AND al.organization_id = $2
      ORDER BY al.created_at DESC
      LIMIT 100
    `, [req.params.userId, req.user.organization_id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('User audit error:', error);
    res.status(500).json({ success: false, error: 'Failed to load user audit logs' });
  }
});

module.exports = router;
