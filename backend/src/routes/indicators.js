// @tier: community
/**
 * Indicators (KRI / KPI / KCI): definitions, thresholds, and the measurement
 * time series that tells an organization its risk assessment is going stale
 * before the incident rather than after it.
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
const indicatorService = require('../services/indicatorService');
const { nextReference } = require('../utils/referenceGenerator');

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'indicators', windowMs: 15 * 60 * 1000, max: 300 }));

const VALID_TYPES = ['kri', 'kpi', 'kci'];
const VALID_DIRECTIONS = ['lower_is_better', 'higher_is_better'];
const VALID_FREQUENCIES = [
  'daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'ad_hoc'
];
const MAX_LIMIT = 200;

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

function parseNumeric(value, label) {
  if (value === undefined || value === null || value === '') return { value: null };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { error: `${label} must be a number` };
  return { value: numeric };
}

/**
 * Optional links must belong to this organization. framework_controls is a
 * shared catalog table with no organization_id, so it is checked for existence
 * only — the other two are org-scoped.
 */
async function validateLinks(organizationId, { riskId, objectiveId, controlId }) {
  const checks = [];
  if (riskId) {
    checks.push(pool.query(
      'SELECT 1 FROM risks WHERE id = $1 AND organization_id = $2',
      [riskId, organizationId]
    ).then((r) => (r.rows.length === 0 ? 'Risk not found' : null)));
  }
  if (objectiveId) {
    checks.push(pool.query(
      'SELECT 1 FROM business_objectives WHERE id = $1 AND organization_id = $2',
      [objectiveId, organizationId]
    ).then((r) => (r.rows.length === 0 ? 'Objective not found' : null)));
  }
  if (controlId) {
    checks.push(pool.query(
      'SELECT 1 FROM framework_controls WHERE id = $1',
      [controlId]
    ).then((r) => (r.rows.length === 0 ? 'Control not found' : null)));
  }
  const results = await Promise.all(checks);
  return results.find(Boolean) || null;
}

// GET /api/v1/indicators/summary — declared before /:id
router.get('/summary', requirePermission('indicators.read'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE is_active)::int AS active,
         COUNT(*) FILTER (WHERE is_active AND latest_breach_level = 'red')::int AS red,
         COUNT(*) FILTER (WHERE is_active AND latest_breach_level = 'amber')::int AS amber,
         COUNT(*) FILTER (WHERE is_active AND latest_breach_level = 'green')::int AS green,
         COUNT(*) FILTER (WHERE is_active AND latest_measured_at IS NULL)::int AS never_measured
       FROM indicators WHERE organization_id = $1`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'indicators.summary_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/indicators
router.get('/', requirePermission('indicators.read'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const { indicatorType, breachLevel, riskId, departmentId } = req.query;
    const activeOnly = req.query.activeOnly !== 'false';

    if (indicatorType && !VALID_TYPES.includes(indicatorType)) {
      return res.status(400).json({ error: `indicatorType must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (breachLevel && !indicatorService.BREACH_LEVELS.includes(breachLevel)) {
      return res.status(400).json({ error: `breachLevel must be one of: ${indicatorService.BREACH_LEVELS.join(', ')}` });
    }
    if (riskId && !isUuid(riskId)) {
      return res.status(400).json({ error: 'riskId must be a valid id' });
    }
    if (departmentId && !isUuid(departmentId)) {
      return res.status(400).json({ error: 'departmentId must be a valid id' });
    }

    const filters = [
      req.user.organization_id,
      indicatorType || null,
      breachLevel || null,
      riskId || null,
      departmentId || null,
      activeOnly
    ];

    const { rows } = await pool.query(
      `SELECT i.*,
              d.name AS department_name,
              r.reference AS risk_reference,
              o.reference AS objective_reference
       FROM indicators i
       LEFT JOIN departments d ON d.id = i.department_id
       LEFT JOIN risks r ON r.id = i.risk_id
       LEFT JOIN business_objectives o ON o.id = i.objective_id
       WHERE i.organization_id = $1
         AND ($2::text IS NULL OR i.indicator_type = $2)
         AND ($3::text IS NULL OR i.latest_breach_level = $3)
         AND ($4::uuid IS NULL OR i.risk_id = $4)
         AND ($5::uuid IS NULL OR i.department_id = $5)
         AND (NOT $6::boolean OR i.is_active = true)
       ORDER BY
         CASE i.latest_breach_level WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END,
         i.name
       LIMIT $7 OFFSET $8`,
      [...filters, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM indicators i
       WHERE i.organization_id = $1
         AND ($2::text IS NULL OR i.indicator_type = $2)
         AND ($3::text IS NULL OR i.latest_breach_level = $3)
         AND ($4::uuid IS NULL OR i.risk_id = $4)
         AND ($5::uuid IS NULL OR i.department_id = $5)
         AND (NOT $6::boolean OR i.is_active = true)`,
      filters
    );

    res.json({
      success: true,
      data: rows.map(indicatorService.decorateIndicator),
      pagination: { page, limit, total: countRows[0].total }
    });
  } catch (error) {
    log('error', 'indicators.list_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/indicators/:id — definition plus recent measurements and trend
router.get('/:id', requirePermission('indicators.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid indicator id' });
    }
    const limit = Math.min(500, Math.max(1, parseInt(req.query.measurementLimit, 10) || 100));

    const { rows } = await pool.query(
      `SELECT i.*, d.name AS department_name
       FROM indicators i
       LEFT JOIN departments d ON d.id = i.department_id
       WHERE i.id = $1 AND i.organization_id = $2`,
      [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Indicator not found' });
    }

    const { rows: measurements } = await pool.query(
      `SELECT * FROM indicator_measurements
       WHERE indicator_id = $1 AND organization_id = $2
       ORDER BY measured_at DESC
       LIMIT $3`,
      [req.params.id, req.user.organization_id, limit]
    );

    res.json({
      success: true,
      data: {
        ...indicatorService.decorateIndicator(rows[0]),
        measurements,
        trend: indicatorService.trend(
          measurements[0]?.value,
          measurements[1]?.value,
          rows[0].direction
        )
      }
    });
  } catch (error) {
    log('error', 'indicators.get_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/indicators
router.post('/', requirePermission('indicators.write'), async (req, res) => {
  try {
    const {
      reference, name, description, indicatorType, unit, targetValue,
      amberThreshold, redThreshold, direction, measurementFrequency,
      ownerUserId, departmentId, riskId, objectiveId, controlId, dataSource
    } = req.body || {};

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (indicatorType && !VALID_TYPES.includes(indicatorType)) {
      return res.status(400).json({ error: `indicatorType must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (direction && !VALID_DIRECTIONS.includes(direction)) {
      return res.status(400).json({ error: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}` });
    }
    if (measurementFrequency && !VALID_FREQUENCIES.includes(measurementFrequency)) {
      return res.status(400).json({ error: `measurementFrequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
    }

    const parsed = {
      target: parseNumeric(targetValue, 'targetValue'),
      amber: parseNumeric(amberThreshold, 'amberThreshold'),
      red: parseNumeric(redThreshold, 'redThreshold')
    };
    const numericError = Object.values(parsed).find((entry) => entry.error);
    if (numericError) {
      return res.status(400).json({ error: numericError.error });
    }

    const resolvedDirection = direction || 'lower_is_better';
    // A red threshold on the safe side of amber means the indicator can never
    // report red, which is a misconfiguration that looks like a healthy metric.
    if (parsed.amber.value !== null && parsed.red.value !== null) {
      const misordered = resolvedDirection === 'higher_is_better'
        ? parsed.red.value > parsed.amber.value
        : parsed.red.value < parsed.amber.value;
      if (misordered) {
        return res.status(400).json({
          error: resolvedDirection === 'higher_is_better'
            ? 'redThreshold must be at or below amberThreshold when higher values are better'
            : 'redThreshold must be at or above amberThreshold when lower values are better'
        });
      }
    }

    const linkError = await validateLinks(req.user.organization_id, { riskId, objectiveId, controlId });
    if (linkError) {
      return res.status(404).json({ error: linkError });
    }

    const resolvedReference = isNonEmptyString(reference)
      ? sanitizeText(reference).trim()
      : await nextReference(pool, 'indicator', req.user.organization_id);

    const { rows } = await pool.query(
      `INSERT INTO indicators
         (organization_id, reference, name, description, indicator_type, unit,
          target_value, amber_threshold, red_threshold, direction,
          measurement_frequency, owner_user_id, department_id, risk_id,
          objective_id, control_id, data_source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        req.user.organization_id,
        resolvedReference,
        sanitizeText(name).trim(),
        description ? sanitizeText(description) : null,
        indicatorType || 'kri',
        unit ? sanitizeText(unit).trim() : null,
        parsed.target.value,
        parsed.amber.value,
        parsed.red.value,
        resolvedDirection,
        measurementFrequency || 'monthly',
        ownerUserId && isUuid(ownerUserId) ? ownerUserId : null,
        departmentId && isUuid(departmentId) ? departmentId : null,
        riskId && isUuid(riskId) ? riskId : null,
        objectiveId && isUuid(objectiveId) ? objectiveId : null,
        controlId && isUuid(controlId) ? controlId : null,
        dataSource ? sanitizeText(dataSource) : null,
        req.user.id
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'indicator.created',
      resourceType: 'indicator',
      resourceId: rows[0].id,
      details: { name: rows[0].name, indicatorType: rows[0].indicator_type },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: indicatorService.decorateIndicator(rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An indicator with that name or reference already exists' });
    }
    log('error', 'indicators.create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/indicators/:id
//
// Changing a threshold does not reclassify stored measurements: past breach
// levels are historic fact. Only future readings use the new thresholds.
router.put('/:id', requirePermission('indicators.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid indicator id' });
    }
    const {
      name, description, unit, targetValue, amberThreshold, redThreshold,
      direction, measurementFrequency, ownerUserId, departmentId, dataSource, isActive
    } = req.body || {};

    if (direction && !VALID_DIRECTIONS.includes(direction)) {
      return res.status(400).json({ error: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}` });
    }
    if (measurementFrequency && !VALID_FREQUENCIES.includes(measurementFrequency)) {
      return res.status(400).json({ error: `measurementFrequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
    }

    const parsed = {
      target: parseNumeric(targetValue, 'targetValue'),
      amber: parseNumeric(amberThreshold, 'amberThreshold'),
      red: parseNumeric(redThreshold, 'redThreshold')
    };
    const numericError = Object.values(parsed).find((entry) => entry.error);
    if (numericError) {
      return res.status(400).json({ error: numericError.error });
    }

    const { rows } = await pool.query(
      `UPDATE indicators SET
         name                  = COALESCE($3, name),
         description           = COALESCE($4, description),
         unit                  = COALESCE($5, unit),
         target_value          = COALESCE($6::numeric, target_value),
         amber_threshold       = COALESCE($7::numeric, amber_threshold),
         red_threshold         = COALESCE($8::numeric, red_threshold),
         direction             = COALESCE($9, direction),
         measurement_frequency = COALESCE($10, measurement_frequency),
         owner_user_id         = CASE WHEN $11::boolean THEN $12::uuid ELSE owner_user_id END,
         department_id         = CASE WHEN $13::boolean THEN $14::uuid ELSE department_id END,
         data_source           = COALESCE($15, data_source),
         is_active             = COALESCE($16::boolean, is_active),
         updated_at            = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        name ? sanitizeText(name).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        unit !== undefined && unit !== null ? sanitizeText(unit).trim() : null,
        parsed.target.value,
        parsed.amber.value,
        parsed.red.value,
        direction || null,
        measurementFrequency || null,
        ownerUserId !== undefined,
        ownerUserId || null,
        departmentId !== undefined,
        departmentId || null,
        dataSource !== undefined && dataSource !== null ? sanitizeText(dataSource) : null,
        isActive === undefined ? null : Boolean(isActive)
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Indicator not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'indicator.updated',
      resourceType: 'indicator',
      resourceId: rows[0].id,
      details: { name: rows[0].name, isActive: rows[0].is_active },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: indicatorService.decorateIndicator(rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An indicator with that name already exists' });
    }
    log('error', 'indicators.update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/indicators/:id/measurements
router.post('/:id/measurements', requirePermission('indicators.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid indicator id' });
    }
    const { value, measuredAt, notes } = req.body || {};
    const parsedValue = parseNumeric(value, 'value');
    if (parsedValue.error || parsedValue.value === null) {
      return res.status(400).json({ error: parsedValue.error || 'value is required' });
    }

    await client.query('BEGIN');
    const measurement = await indicatorService.recordMeasurement(client, {
      organizationId: req.user.organization_id,
      indicatorId: req.params.id,
      value: parsedValue.value,
      measuredAt: measuredAt || null,
      notes: notes ? sanitizeText(notes) : null,
      recordedBy: req.user.id
    });

    if (!measurement) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Indicator not found' });
    }
    await client.query('COMMIT');

    // A breach is an audit-grade event: it is the moment the organization was
    // told its risk posture moved.
    if (measurement.breach_level !== 'green') {
      auditService.logFromRequest(req, {
        eventType: 'indicator.threshold_breached',
        resourceType: 'indicator',
        resourceId: req.params.id,
        details: { value: measurement.value, breachLevel: measurement.breach_level },
        success: true
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: measurement });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'indicators.measurement_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/v1/indicators/:id
router.delete('/:id', requirePermission('indicators.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid indicator id' });
    }
    const { rows } = await pool.query(
      'DELETE FROM indicators WHERE id = $1 AND organization_id = $2 RETURNING name',
      [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Indicator not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'indicator.deleted',
      resourceType: 'indicator',
      resourceId: req.params.id,
      details: { name: rows[0].name },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    log('error', 'indicators.delete_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
