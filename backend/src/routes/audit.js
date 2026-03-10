// @tier: free
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
// Optional premium service — not available in community edition
let splunk;
try { splunk = require('../services/splunkService'); } catch (_) { splunk = null; }
const dynamicFieldsService = require('../services/dynamicAuditFieldsService');
const { createRateLimiter } = require('../middleware/rateLimit');

const auditReadLimiter = createRateLimiter({
  label: 'audit-log-read',
  windowMs: 60 * 1000,
  max: 120
});

const auditWriteLimiter = createRateLimiter({
  label: 'audit-log-write',
  windowMs: 60 * 1000,
  max: 60
});

router.use(authenticate);

// GET /audit/logs
router.get('/logs', auditReadLimiter, requirePermission('audit.read'), async (req, res) => {
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
      offset
    } = req.query;

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

    if (userId) {
      query += ` AND al.user_id = $${idx}`;
      params.push(userId);
      idx++;
    }
    if (eventType) {
      query += ` AND al.event_type = $${idx}`;
      params.push(eventType);
      idx++;
    }
    if (resourceType) {
      query += ` AND al.resource_type = $${idx}`;
      params.push(String(resourceType));
      idx++;
    }
    if (resourceId) {
      query += ` AND al.resource_id::text = $${idx}`;
      params.push(String(resourceId));
      idx++;
    }
    if (startDate) {
      query += ` AND al.created_at >= $${idx}`;
      params.push(startDate);
      idx++;
    }
    if (endDate) {
      query += ` AND al.created_at <= $${idx}`;
      params.push(endDate);
      idx++;
    }
    if (findingKey) {
      query += ` AND al.details->>'finding_key' = $${idx}`;
      params.push(String(findingKey));
      idx++;
    }
    if (vulnerabilityId) {
      query += ` AND al.details->>'vulnerability_id' = $${idx}`;
      params.push(String(vulnerabilityId));
      idx++;
    }
    if (source) {
      query += ` AND al.details->>'source' = $${idx}`;
      params.push(String(source));
      idx++;
    }

    query += ' ORDER BY al.created_at DESC';
    query += ` LIMIT $${idx}`;
    params.push(parseInt(limit) || 50);
    idx++;
    query += ` OFFSET $${idx}`;
    params.push(parseInt(offset) || 0);

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

    const countResult = await pool.query(countQuery, countParams);

    // Get custom field values for the audit logs
    const auditLogIds = result.rows.map(row => row.id);
    const customFields = auditLogIds.length > 0 
      ? await dynamicFieldsService.getCustomFieldValues(auditLogIds)
      : {};

    // Merge custom fields into the audit log entries
    const logsWithCustomFields = result.rows.map(log => ({
      ...log,
      custom_fields: customFields[log.id] || {}
    }));

    res.json({
      success: true,
      data: logsWithCustomFields,
      logs: logsWithCustomFields,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
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

    // Parse details — accept string (JSON) or object
    let parsedDetails = {};
    if (details) {
      if (typeof details === 'string') {
        try { parsedDetails = JSON.parse(details); } catch { parsedDetails = { text: details }; }
      } else {
        parsedDetails = details;
      }
    }

    const result = await pool.query(
      `INSERT INTO audit_logs
       (organization_id, user_id, event_type, resource_type, resource_id, details,
        ip_address, user_agent, success, outcome, source_system, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, true, $9, $10, NOW())
       RETURNING id, event_type, created_at`,
      [
        orgId,
        userId,
        event_type,
        resource_type || null,
        resource_id || null,
        JSON.stringify(parsedDetails),
        req.ip || null,
        req.headers['user-agent'] || null,
        outcome || 'success',
        source_system || 'mcp_agent'
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Audit log create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create audit log entry' });
  }
});

// GET /audit/stats
router.get('/stats', auditReadLimiter, requirePermission('audit.read'), async (req, res) => {
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
router.get('/splunk/live', auditReadLimiter, requirePermission('audit.read'), async (req, res) => {
  try {
    if (!splunk) {
      return res.json({
        success: true,
        data: {
          configured: false,
          message: 'Splunk integration is not available in this deployment.',
          results: [],
          result_count: 0
        }
      });
    }

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
router.get('/event-types', auditReadLimiter, requirePermission('audit.read'), async (req, res) => {
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
router.get('/user/:userId', auditReadLimiter, requirePermission('audit.read'), async (req, res) => {
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
