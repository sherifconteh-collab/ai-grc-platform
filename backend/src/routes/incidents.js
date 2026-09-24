// @tier: community
/**
 * Incident management: reporting, the NIST SP 800-61 response lifecycle, the
 * response timeline, breach notification clocks, and linkage to risks,
 * controls and assets.
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { isUuid, isNonEmptyString, sanitizeText } = require('../middleware/validate');
const { log, serializeError } = require('../utils/logger');
const auditService = require('../services/auditService');
const incidentService = require('../services/incidentService');

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'incidents', windowMs: 15 * 60 * 1000, max: 300 }));

const VALID_CATEGORIES = [
  'security', 'privacy', 'availability', 'integrity', 'compliance',
  'third_party', 'physical', 'fraud', 'safety', 'ai', 'other'
];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = [
  'new', 'triaged', 'investigating', 'contained', 'eradicated',
  'recovered', 'closed', 'false_positive'
];
const VALID_TIMELINE_TYPES = [
  'detection', 'triage', 'analysis', 'containment', 'eradication',
  'recovery', 'communication', 'notification', 'status_change', 'evidence', 'note'
];
const VALID_ASSET_IMPACTS = ['none', 'degraded', 'unavailable', 'compromised', 'destroyed'];
const VALID_RISK_RELATIONSHIPS = ['materialized', 'related', 'identified_new_risk'];
const VALID_CONTROL_RELATIONSHIPS = ['failed', 'detected', 'contained', 'related'];
const MAX_LIMIT = 200;

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

async function orgUserExists(organizationId, userId) {
  if (!userId) return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND organization_id = $2',
    [userId, organizationId]
  );
  return rows.length > 0;
}

async function incidentInOrg(organizationId, incidentId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM incidents WHERE id = $1 AND organization_id = $2',
    [incidentId, organizationId]
  );
  return rows.length > 0;
}

// GET /api/v1/incidents/metrics — declared before /:id
router.get('/metrics', requirePermission('incidents.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const [counts, durations] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status NOT IN ('closed', 'false_positive'))::int AS open,
           COUNT(*) FILTER (WHERE severity = 'critical'
                              AND status NOT IN ('closed', 'false_positive'))::int AS open_critical,
           COUNT(*) FILTER (WHERE is_breach)::int AS breaches,
           COUNT(*) FILTER (WHERE regulatory_notification_required
                              AND regulator_notified_at IS NULL
                              AND notification_deadline < now())::int AS notifications_overdue,
           COUNT(*) FILTER (WHERE detected_at > now() - interval '30 days')::int AS last_30_days
         FROM incidents WHERE organization_id = $1`,
        [orgId]
      ),
      // Averages computed in SQL over closed incidents only: including open
      // ones would report an improving mean-time-to-contain simply because the
      // slow incidents have not finished yet.
      pool.query(
        `SELECT
           ROUND(AVG(EXTRACT(EPOCH FROM (triaged_at   - detected_at)) / 3600)::numeric, 2)
             AS avg_hours_to_triage,
           ROUND(AVG(EXTRACT(EPOCH FROM (contained_at - detected_at)) / 3600)::numeric, 2)
             AS avg_hours_to_contain,
           ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at  - detected_at)) / 3600)::numeric, 2)
             AS avg_hours_to_resolve
         FROM incidents
         WHERE organization_id = $1 AND status = 'closed'`,
        [orgId]
      )
    ]);

    res.json({
      success: true,
      data: { counts: counts.rows[0], durations: durations.rows[0] }
    });
  } catch (error) {
    log('error', 'incidents.metrics_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/incidents
router.get('/', requirePermission('incidents.read'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const { category, severity, status, departmentId, ownerUserId } = req.query;
    const openOnly = req.query.openOnly === 'true';
    const breachesOnly = req.query.breachesOnly === 'true';

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (departmentId && !isUuid(departmentId)) {
      return res.status(400).json({ error: 'departmentId must be a valid id' });
    }
    if (ownerUserId && !isUuid(ownerUserId)) {
      return res.status(400).json({ error: 'ownerUserId must be a valid id' });
    }

    const filters = [
      req.user.organization_id,
      category || null,
      severity || null,
      status || null,
      departmentId || null,
      ownerUserId || null,
      openOnly,
      breachesOnly
    ];

    const { rows } = await pool.query(
      `SELECT i.*,
              d.name AS department_name,
              u.first_name AS owner_first_name,
              u.last_name  AS owner_last_name
       FROM incidents i
       LEFT JOIN departments d ON d.id = i.department_id
       LEFT JOIN users u ON u.id = i.owner_user_id
       WHERE i.organization_id = $1
         AND ($2::text IS NULL OR i.category = $2)
         AND ($3::text IS NULL OR i.severity = $3)
         AND ($4::text IS NULL OR i.status = $4)
         AND ($5::uuid IS NULL OR i.department_id = $5)
         AND ($6::uuid IS NULL OR i.owner_user_id = $6)
         AND (NOT $7::boolean OR i.status NOT IN ('closed', 'false_positive'))
         AND (NOT $8::boolean OR i.is_breach = true)
       ORDER BY i.detected_at DESC
       LIMIT $9 OFFSET $10`,
      [...filters, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM incidents i
       WHERE i.organization_id = $1
         AND ($2::text IS NULL OR i.category = $2)
         AND ($3::text IS NULL OR i.severity = $3)
         AND ($4::text IS NULL OR i.status = $4)
         AND ($5::uuid IS NULL OR i.department_id = $5)
         AND ($6::uuid IS NULL OR i.owner_user_id = $6)
         AND (NOT $7::boolean OR i.status NOT IN ('closed', 'false_positive'))
         AND (NOT $8::boolean OR i.is_breach = true)`,
      filters
    );

    res.json({
      success: true,
      data: rows.map(incidentService.decorateIncident),
      pagination: { page, limit, total: countRows[0].total }
    });
  } catch (error) {
    log('error', 'incidents.list_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/incidents/:id — incident with timeline and links
router.get('/:id', requirePermission('incidents.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }
    const orgId = req.user.organization_id;

    const { rows } = await pool.query(
      `SELECT i.*, d.name AS department_name
       FROM incidents i
       LEFT JOIN departments d ON d.id = i.department_id
       WHERE i.id = $1 AND i.organization_id = $2`,
      [req.params.id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const [timeline, risks, controls, assets] = await Promise.all([
      pool.query(
        `SELECT t.*, u.first_name, u.last_name
         FROM incident_timeline t
         LEFT JOIN users u ON u.id = t.recorded_by
         WHERE t.incident_id = $1 AND t.organization_id = $2
         ORDER BY t.occurred_at, t.recorded_at`,
        [req.params.id, orgId]
      ),
      pool.query(
        `SELECT l.id, l.risk_id, l.relationship, r.reference, r.title, r.residual_score
         FROM incident_risk_links l
         JOIN risks r ON r.id = l.risk_id
         WHERE l.incident_id = $1 AND l.organization_id = $2`,
        [req.params.id, orgId]
      ),
      pool.query(
        `SELECT l.id, l.control_id, l.relationship, l.notes,
                fc.control_id AS control_ref, fc.title AS control_title,
                f.name AS framework_name
         FROM incident_control_links l
         JOIN framework_controls fc ON fc.id = l.control_id
         LEFT JOIN frameworks f ON f.id = fc.framework_id
         WHERE l.incident_id = $1 AND l.organization_id = $2`,
        [req.params.id, orgId]
      ),
      pool.query(
        // assets is the CMDB table: its type lives in asset_categories via
        // category_id, not in a column on assets itself.
        `SELECT l.id, l.asset_id, l.impact, a.name AS asset_name,
                a.criticality, ac.name AS asset_category
         FROM incident_asset_links l
         JOIN assets a ON a.id = l.asset_id
         LEFT JOIN asset_categories ac ON ac.id = a.category_id
         WHERE l.incident_id = $1 AND l.organization_id = $2`,
        [req.params.id, orgId]
      )
    ]);

    res.json({
      success: true,
      data: {
        ...incidentService.decorateIncident(rows[0]),
        timeline: timeline.rows,
        risks: risks.rows,
        controls: controls.rows,
        assets: assets.rows
      }
    });
  } catch (error) {
    log('error', 'incidents.get_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/incidents — report an incident
router.post('/', requirePermission('incidents.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const {
      reference, title, description, category, severity, detectionSource,
      occurredAt, detectedAt, ownerUserId, departmentId, impactSummary,
      isBreach, affectedRecordCount, affectedDataTypes,
      regulatoryNotificationRequired, notificationDeadline, tags
    } = body;

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }
    if (ownerUserId && !isUuid(ownerUserId)) {
      return res.status(400).json({ error: 'ownerUserId must be a valid id' });
    }
    if (!(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }
    if (affectedRecordCount !== undefined && affectedRecordCount !== null) {
      const count = Number(affectedRecordCount);
      if (!Number.isInteger(count) || count < 0) {
        return res.status(400).json({ error: 'affectedRecordCount must be a non-negative integer' });
      }
    }

    await client.query('BEGIN');
    const resolvedReference = await incidentService.resolveReference(
      client, req.user.organization_id, reference
    );

    const { rows } = await client.query(
      `INSERT INTO incidents
         (organization_id, reference, title, description, category, severity,
          detection_source, occurred_at, detected_at, reporter_user_id,
          owner_user_id, department_id, impact_summary, is_breach,
          affected_record_count, affected_data_types,
          regulatory_notification_required, notification_deadline, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz,
               COALESCE($9::timestamptz, now()), $10, $11, $12, $13, $14, $15, $16,
               $17, $18::timestamptz, $19, $20)
       RETURNING *`,
      [
        req.user.organization_id,
        resolvedReference,
        sanitizeText(title).trim(),
        description ? sanitizeText(description) : null,
        category || 'other',
        severity || 'medium',
        detectionSource ? sanitizeText(detectionSource) : null,
        occurredAt || null,
        detectedAt || null,
        req.user.id,
        ownerUserId || null,
        departmentId || null,
        impactSummary ? sanitizeText(impactSummary) : null,
        Boolean(isBreach),
        affectedRecordCount ?? null,
        Array.isArray(affectedDataTypes)
          ? affectedDataTypes.map((type) => sanitizeText(String(type)))
          : null,
        Boolean(regulatoryNotificationRequired),
        notificationDeadline || null,
        Array.isArray(tags) ? tags.map((tag) => sanitizeText(String(tag))) : null,
        req.user.id
      ]
    );

    // The first timeline entry is written by the system rather than left to the
    // reporter: an incident whose timeline starts at containment has lost the
    // detection record, and that is the entry an investigator reads first.
    await client.query(
      `INSERT INTO incident_timeline
         (organization_id, incident_id, entry_type, occurred_at, recorded_by, summary, detail)
       VALUES ($1, $2, 'detection', $3::timestamptz, $4, $5, $6)`,
      [
        req.user.organization_id,
        rows[0].id,
        rows[0].detected_at,
        req.user.id,
        'Incident reported',
        detectionSource ? `Detection source: ${sanitizeText(detectionSource)}` : null
      ]
    );

    await client.query('COMMIT');

    auditService.logFromRequest(req, {
      eventType: 'incident.reported',
      resourceType: 'incident',
      resourceId: rows[0].id,
      details: {
        reference: rows[0].reference,
        severity: rows[0].severity,
        category: rows[0].category,
        isBreach: rows[0].is_breach
      },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: incidentService.decorateIncident(rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An incident with that reference already exists' });
    }
    log('error', 'incidents.create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/v1/incidents/:id
//
// Deliberately does not accept `status`: lifecycle changes go through
// POST /:id/status so the phase timestamp and timeline entry cannot be skipped.
router.put('/:id', requirePermission('incidents.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }
    const {
      title, description, category, severity, ownerUserId, departmentId,
      impactSummary, rootCause, lessonsLearned, isBreach, affectedRecordCount,
      affectedDataTypes, regulatoryNotificationRequired, notificationDeadline,
      estimatedCost, tags
    } = req.body || {};

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }
    if (ownerUserId && !(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }

    const { rows } = await pool.query(
      `UPDATE incidents SET
         title           = COALESCE($3, title),
         description     = COALESCE($4, description),
         category        = COALESCE($5, category),
         severity        = COALESCE($6, severity),
         owner_user_id   = CASE WHEN $7::boolean THEN $8::uuid ELSE owner_user_id END,
         department_id   = CASE WHEN $9::boolean THEN $10::uuid ELSE department_id END,
         impact_summary  = COALESCE($11, impact_summary),
         root_cause      = COALESCE($12, root_cause),
         lessons_learned = COALESCE($13, lessons_learned),
         is_breach       = COALESCE($14::boolean, is_breach),
         affected_record_count = COALESCE($15::integer, affected_record_count),
         affected_data_types   = COALESCE($16::text[], affected_data_types),
         regulatory_notification_required =
           COALESCE($17::boolean, regulatory_notification_required),
         notification_deadline = COALESCE($18::timestamptz, notification_deadline),
         estimated_cost  = COALESCE($19::numeric, estimated_cost),
         tags            = COALESCE($20::text[], tags),
         updated_at      = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        title ? sanitizeText(title).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        category || null,
        severity || null,
        ownerUserId !== undefined,
        ownerUserId || null,
        departmentId !== undefined,
        departmentId || null,
        impactSummary !== undefined && impactSummary !== null ? sanitizeText(impactSummary) : null,
        rootCause !== undefined && rootCause !== null ? sanitizeText(rootCause) : null,
        lessonsLearned !== undefined && lessonsLearned !== null ? sanitizeText(lessonsLearned) : null,
        isBreach === undefined ? null : Boolean(isBreach),
        affectedRecordCount ?? null,
        Array.isArray(affectedDataTypes)
          ? affectedDataTypes.map((type) => sanitizeText(String(type)))
          : null,
        regulatoryNotificationRequired === undefined
          ? null
          : Boolean(regulatoryNotificationRequired),
        notificationDeadline || null,
        estimatedCost ?? null,
        Array.isArray(tags) ? tags.map((tag) => sanitizeText(String(tag))) : null
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'incident.updated',
      resourceType: 'incident',
      resourceId: rows[0].id,
      details: { reference: rows[0].reference, severity: rows[0].severity },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: incidentService.decorateIncident(rows[0]) });
  } catch (error) {
    log('error', 'incidents.update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/incidents/:id/status — advance the response lifecycle
router.post('/:id/status', requirePermission('incidents.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }
    const { status, note } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    await client.query('BEGIN');
    const result = await incidentService.applyStatusChange(client, {
      organizationId: req.user.organization_id,
      incidentId: req.params.id,
      toStatus: status,
      actorUserId: req.user.id,
      note: note ? sanitizeText(note) : null
    });

    if (result.notFound) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found' });
    }
    if (result.invalidTransition) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Cannot move an incident from '${result.fromStatus}' to '${status}'`,
        allowed: result.allowed
      });
    }
    await client.query('COMMIT');

    auditService.logFromRequest(req, {
      eventType: 'incident.status_changed',
      resourceType: 'incident',
      resourceId: req.params.id,
      details: { from: result.fromStatus, to: status },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: incidentService.decorateIncident(result.incident) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'incidents.status_change_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/v1/incidents/:id/notify — record that a regulator was notified
router.post('/:id/notify', requirePermission('incidents.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }
    const { audience, notifiedAt, detail } = req.body || {};
    if (!['regulator', 'data_subjects'].includes(audience)) {
      return res.status(400).json({ error: "audience must be 'regulator' or 'data_subjects'" });
    }

    // Two literal statements rather than an interpolated column name.
    const query = audience === 'regulator'
      ? `UPDATE incidents SET regulator_notified_at = COALESCE($3::timestamptz, now()),
           updated_at = now()
         WHERE id = $1 AND organization_id = $2 RETURNING *`
      : `UPDATE incidents SET data_subjects_notified_at = COALESCE($3::timestamptz, now()),
           updated_at = now()
         WHERE id = $1 AND organization_id = $2 RETURNING *`;

    const { rows } = await pool.query(query, [
      req.params.id, req.user.organization_id, notifiedAt || null
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    await pool.query(
      `INSERT INTO incident_timeline
         (organization_id, incident_id, entry_type, recorded_by, summary, detail)
       VALUES ($1, $2, 'notification', $3, $4, $5)`,
      [
        req.user.organization_id,
        req.params.id,
        req.user.id,
        audience === 'regulator' ? 'Regulator notified' : 'Data subjects notified',
        detail ? sanitizeText(detail) : null
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'incident.notification_recorded',
      resourceType: 'incident',
      resourceId: req.params.id,
      details: {
        audience,
        metDeadline: incidentService.notificationStatus(rows[0]).met_deadline
      },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: incidentService.decorateIncident(rows[0]) });
  } catch (error) {
    log('error', 'incidents.notify_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/incidents/:id/timeline
router.post('/:id/timeline', requirePermission('incidents.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }
    const { entryType, summary, detail, occurredAt } = req.body || {};
    if (!isNonEmptyString(summary)) {
      return res.status(400).json({ error: 'summary is required' });
    }
    if (entryType && !VALID_TIMELINE_TYPES.includes(entryType)) {
      return res.status(400).json({ error: `entryType must be one of: ${VALID_TIMELINE_TYPES.join(', ')}` });
    }
    if (!(await incidentInOrg(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO incident_timeline
         (organization_id, incident_id, entry_type, occurred_at, recorded_by, summary, detail)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5, $6, $7)
       RETURNING *`,
      [
        req.user.organization_id,
        req.params.id,
        entryType || 'note',
        occurredAt || null,
        req.user.id,
        sanitizeText(summary).trim(),
        detail ? sanitizeText(detail) : null
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'incidents.timeline_create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Link handling. Statements are literals selected by route, never assembled.
const LINK_KINDS = {
  risks: {
    insert: `INSERT INTO incident_risk_links
               (organization_id, incident_id, risk_id, relationship, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ON CONSTRAINT incident_risk_links_unique DO UPDATE
               SET relationship = EXCLUDED.relationship
             RETURNING *`,
    exists: 'SELECT 1 FROM risks WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM incident_risk_links
             WHERE organization_id = $1 AND incident_id = $2 AND risk_id = $3`,
    bodyKey: 'riskId',
    relationships: VALID_RISK_RELATIONSHIPS,
    defaultRelationship: 'materialized',
    orgScopedTarget: true,
    eventType: 'incident.risk_linked'
  },
  controls: {
    insert: `INSERT INTO incident_control_links
               (organization_id, incident_id, control_id, relationship, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ON CONSTRAINT incident_control_links_unique DO UPDATE
               SET relationship = EXCLUDED.relationship
             RETURNING *`,
    exists: 'SELECT 1 FROM framework_controls WHERE id = $1',
    delete: `DELETE FROM incident_control_links
             WHERE organization_id = $1 AND incident_id = $2 AND control_id = $3`,
    bodyKey: 'controlId',
    relationships: VALID_CONTROL_RELATIONSHIPS,
    defaultRelationship: 'failed',
    orgScopedTarget: false,
    eventType: 'incident.control_linked'
  },
  assets: {
    insert: `INSERT INTO incident_asset_links
               (organization_id, incident_id, asset_id, impact, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ON CONSTRAINT incident_asset_links_unique DO UPDATE
               SET impact = EXCLUDED.impact
             RETURNING *`,
    exists: 'SELECT 1 FROM assets WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM incident_asset_links
             WHERE organization_id = $1 AND incident_id = $2 AND asset_id = $3`,
    bodyKey: 'assetId',
    relationships: VALID_ASSET_IMPACTS,
    defaultRelationship: 'degraded',
    orgScopedTarget: true,
    eventType: 'incident.asset_linked'
  }
};

async function handleLink(req, res, kindKey) {
  const kind = LINK_KINDS[kindKey];
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident id' });
    }
    const body = req.body || {};
    const targetId = body[kind.bodyKey];
    if (!isUuid(targetId)) {
      return res.status(400).json({ error: `${kind.bodyKey} must be a valid id` });
    }
    // 'relationship' for risks and controls, 'impact' for assets: one field
    // with two names on the wire, validated against the kind's own vocabulary.
    const qualifier = body.relationship || body.impact || kind.defaultRelationship;
    if (!kind.relationships.includes(qualifier)) {
      return res.status(400).json({ error: `Must be one of: ${kind.relationships.join(', ')}` });
    }
    if (!(await incidentInOrg(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const existsParams = kind.orgScopedTarget
      ? [targetId, req.user.organization_id]
      : [targetId];
    const { rows: exists } = await pool.query(kind.exists, existsParams);
    if (exists.length === 0) {
      return res.status(404).json({ error: 'Link target not found' });
    }

    const { rows } = await pool.query(kind.insert, [
      req.user.organization_id, req.params.id, targetId, qualifier, req.user.id
    ]);

    auditService.logFromRequest(req, {
      eventType: kind.eventType,
      resourceType: 'incident',
      resourceId: req.params.id,
      details: { targetId, qualifier },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'incidents.link_failed', { kind: kindKey, error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleUnlink(req, res, kindKey) {
  const kind = LINK_KINDS[kindKey];
  try {
    if (!isUuid(req.params.id) || !isUuid(req.params.targetId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { rowCount } = await pool.query(kind.delete, [
      req.user.organization_id, req.params.id, req.params.targetId
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    res.json({ success: true, data: { incidentId: req.params.id, targetId: req.params.targetId } });
  } catch (error) {
    log('error', 'incidents.unlink_failed', { kind: kindKey, error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/:id/risks', requirePermission('incidents.write'), (req, res) => handleLink(req, res, 'risks'));
router.delete('/:id/risks/:targetId', requirePermission('incidents.write'), (req, res) => handleUnlink(req, res, 'risks'));
router.post('/:id/controls', requirePermission('incidents.write'), (req, res) => handleLink(req, res, 'controls'));
router.delete('/:id/controls/:targetId', requirePermission('incidents.write'), (req, res) => handleUnlink(req, res, 'controls'));
router.post('/:id/assets', requirePermission('incidents.write'), (req, res) => handleLink(req, res, 'assets'));
router.delete('/:id/assets/:targetId', requirePermission('incidents.write'), (req, res) => handleUnlink(req, res, 'assets'));

module.exports = router;
