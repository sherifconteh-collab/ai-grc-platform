// @tier: community
/**
 * Compliance obligations register: what the organization is bound to, by whom,
 * by when, which controls demonstrate it, and the per-period attestation
 * history an auditor samples.
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
const obligationService = require('../services/obligationService');

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'obligations', windowMs: 15 * 60 * 1000, max: 200 }));

const VALID_SOURCE_TYPES = [
  'regulation', 'statute', 'contract', 'standard', 'certification',
  'internal_policy', 'customer_commitment', 'court_order', 'other'
];
const VALID_STATUSES = ['draft', 'active', 'superseded', 'retired'];
const VALID_COMPLIANCE_STATUSES = [
  'not_assessed', 'compliant', 'partially_compliant', 'non_compliant', 'not_applicable'
];
const VALID_CRITICALITIES = ['low', 'medium', 'high', 'critical'];
const VALID_FREQUENCIES = [
  'daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial'
];
const VALID_ATTESTATION_OUTCOMES = ['met', 'partially_met', 'not_met', 'not_applicable', 'waived'];
const MAX_LIMIT = 200;

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

async function obligationInOrg(organizationId, obligationId) {
  const { rows } = await pool.query(
    'SELECT * FROM compliance_obligations WHERE id = $1 AND organization_id = $2',
    [obligationId, organizationId]
  );
  return rows[0] || null;
}

// GET /api/v1/obligations/summary — declared before /:id
router.get('/summary', requirePermission('obligations.read'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE compliance_status = 'non_compliant')::int AS non_compliant,
         COUNT(*) FILTER (WHERE compliance_status = 'not_assessed')::int AS not_assessed,
         COUNT(*) FILTER (WHERE status = 'active' AND next_due_date < CURRENT_DATE)::int
           AS overdue,
         COUNT(*) FILTER (WHERE status = 'active'
                            AND next_due_date BETWEEN CURRENT_DATE
                                AND CURRENT_DATE + INTERVAL '30 days')::int AS due_soon,
         COUNT(*) FILTER (WHERE criticality = 'critical' AND status = 'active')::int
           AS critical_active
       FROM compliance_obligations
       WHERE organization_id = $1`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'obligations.summary_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/obligations
router.get('/', requirePermission('obligations.read'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const { sourceType, status, complianceStatus, criticality, departmentId, jurisdiction } = req.query;
    const overdueOnly = req.query.overdueOnly === 'true';

    if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
      return res.status(400).json({ error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (complianceStatus && !VALID_COMPLIANCE_STATUSES.includes(complianceStatus)) {
      return res.status(400).json({ error: `complianceStatus must be one of: ${VALID_COMPLIANCE_STATUSES.join(', ')}` });
    }
    if (criticality && !VALID_CRITICALITIES.includes(criticality)) {
      return res.status(400).json({ error: `criticality must be one of: ${VALID_CRITICALITIES.join(', ')}` });
    }
    if (departmentId && !isUuid(departmentId)) {
      return res.status(400).json({ error: 'departmentId must be a valid id' });
    }

    const filters = [
      req.user.organization_id,
      sourceType || null,
      status || null,
      complianceStatus || null,
      criticality || null,
      departmentId || null,
      jurisdiction ? sanitizeText(jurisdiction) : null,
      overdueOnly
    ];

    const { rows } = await pool.query(
      `SELECT o.*,
              d.name AS department_name,
              u.first_name AS owner_first_name,
              u.last_name  AS owner_last_name,
              COALESCE(links.control_count, 0) AS linked_control_count
       FROM compliance_obligations o
       LEFT JOIN departments d ON d.id = o.department_id
       LEFT JOIN users u ON u.id = o.owner_user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS control_count FROM obligation_control_links ocl
         WHERE ocl.obligation_id = o.id
       ) links ON true
       WHERE o.organization_id = $1
         AND ($2::text IS NULL OR o.source_type = $2)
         AND ($3::text IS NULL OR o.status = $3)
         AND ($4::text IS NULL OR o.compliance_status = $4)
         AND ($5::text IS NULL OR o.criticality = $5)
         AND ($6::uuid IS NULL OR o.department_id = $6)
         AND ($7::text IS NULL OR o.jurisdiction = $7)
         AND (NOT $8::boolean OR (o.next_due_date < CURRENT_DATE AND o.status = 'active'))
       ORDER BY o.next_due_date NULLS LAST, o.created_at DESC
       LIMIT $9 OFFSET $10`,
      [...filters, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM compliance_obligations o
       WHERE o.organization_id = $1
         AND ($2::text IS NULL OR o.source_type = $2)
         AND ($3::text IS NULL OR o.status = $3)
         AND ($4::text IS NULL OR o.compliance_status = $4)
         AND ($5::text IS NULL OR o.criticality = $5)
         AND ($6::uuid IS NULL OR o.department_id = $6)
         AND ($7::text IS NULL OR o.jurisdiction = $7)
         AND (NOT $8::boolean OR (o.next_due_date < CURRENT_DATE AND o.status = 'active'))`,
      filters
    );

    res.json({
      success: true,
      data: rows.map((row) => obligationService.decorateObligation(row)),
      pagination: { page, limit, total: countRows[0].total }
    });
  } catch (error) {
    log('error', 'obligations.list_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/obligations/:id
router.get('/:id', requirePermission('obligations.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid obligation id' });
    }
    const orgId = req.user.organization_id;

    const { rows } = await pool.query(
      `SELECT o.*, d.name AS department_name, f.name AS framework_name
       FROM compliance_obligations o
       LEFT JOIN departments d ON d.id = o.department_id
       LEFT JOIN frameworks f ON f.id = o.framework_id
       WHERE o.id = $1 AND o.organization_id = $2`,
      [req.params.id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Obligation not found' });
    }

    const [controls, attestations] = await Promise.all([
      pool.query(
        `SELECT ocl.id, ocl.control_id, ocl.notes,
                fc.control_id AS control_ref, fc.title AS control_title,
                f.name AS framework_name
         FROM obligation_control_links ocl
         JOIN framework_controls fc ON fc.id = ocl.control_id
         LEFT JOIN frameworks f ON f.id = fc.framework_id
         WHERE ocl.obligation_id = $1 AND ocl.organization_id = $2
         ORDER BY f.name, fc.control_id`,
        [req.params.id, orgId]
      ),
      pool.query(
        `SELECT a.*, u.first_name, u.last_name
         FROM obligation_attestations a
         LEFT JOIN users u ON u.id = a.attested_by
         WHERE a.obligation_id = $1 AND a.organization_id = $2
         ORDER BY a.attested_at DESC
         LIMIT 100`,
        [req.params.id, orgId]
      )
    ]);

    res.json({
      success: true,
      data: {
        ...obligationService.decorateObligation(rows[0]),
        controls: controls.rows,
        attestations: attestations.rows
      }
    });
  } catch (error) {
    log('error', 'obligations.get_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/obligations
router.post('/', requirePermission('obligations.write'), async (req, res) => {
  try {
    const {
      reference, title, description, sourceType, sourceName, citation,
      jurisdiction, frameworkId, ownerUserId, departmentId, status,
      criticality, frequency, effectiveDate, nextDueDate, penaltyDescription, tags
    } = req.body || {};

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
      return res.status(400).json({ error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (criticality && !VALID_CRITICALITIES.includes(criticality)) {
      return res.status(400).json({ error: `criticality must be one of: ${VALID_CRITICALITIES.join(', ')}` });
    }
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
    }
    if (ownerUserId && !isUuid(ownerUserId)) {
      return res.status(400).json({ error: 'ownerUserId must be a valid id' });
    }

    const resolvedReference = await obligationService.resolveReference(
      pool, req.user.organization_id, reference
    );

    // A recurring obligation created without an explicit first due date gets
    // one derived from its frequency, so it enters the calendar rather than
    // sitting with a null date that no overdue query will ever surface.
    const derivedDueDate = nextDueDate
      || (frequency
        ? obligationService.advanceDueDate(frequency, effectiveDate || new Date())?.toISOString().slice(0, 10)
        : null);

    const { rows } = await pool.query(
      `INSERT INTO compliance_obligations
         (organization_id, reference, title, description, source_type, source_name,
          citation, jurisdiction, framework_id, owner_user_id, department_id,
          status, criticality, frequency, effective_date, next_due_date,
          penalty_description, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15::date, $16::date, $17, $18, $19)
       RETURNING *`,
      [
        req.user.organization_id,
        resolvedReference,
        sanitizeText(title).trim(),
        description ? sanitizeText(description) : null,
        sourceType || 'regulation',
        sourceName ? sanitizeText(sourceName) : null,
        citation ? sanitizeText(citation) : null,
        jurisdiction ? sanitizeText(jurisdiction) : null,
        frameworkId && isUuid(frameworkId) ? frameworkId : null,
        ownerUserId || null,
        departmentId && isUuid(departmentId) ? departmentId : null,
        status || 'active',
        criticality || 'medium',
        frequency || null,
        effectiveDate || null,
        derivedDueDate || null,
        penaltyDescription ? sanitizeText(penaltyDescription) : null,
        Array.isArray(tags) ? tags.map((tag) => sanitizeText(String(tag))) : null,
        req.user.id
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'obligation.created',
      resourceType: 'compliance_obligation',
      resourceId: rows[0].id,
      details: {
        reference: rows[0].reference,
        sourceType: rows[0].source_type,
        criticality: rows[0].criticality
      },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: obligationService.decorateObligation(rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An obligation with that reference already exists' });
    }
    log('error', 'obligations.create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/obligations/:id
router.put('/:id', requirePermission('obligations.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid obligation id' });
    }
    const {
      title, description, sourceName, citation, jurisdiction, ownerUserId,
      departmentId, status, complianceStatus, criticality, frequency,
      nextDueDate, penaltyDescription, tags
    } = req.body || {};

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (complianceStatus && !VALID_COMPLIANCE_STATUSES.includes(complianceStatus)) {
      return res.status(400).json({ error: `complianceStatus must be one of: ${VALID_COMPLIANCE_STATUSES.join(', ')}` });
    }
    if (criticality && !VALID_CRITICALITIES.includes(criticality)) {
      return res.status(400).json({ error: `criticality must be one of: ${VALID_CRITICALITIES.join(', ')}` });
    }
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
    }

    const { rows } = await pool.query(
      `UPDATE compliance_obligations SET
         title               = COALESCE($3, title),
         description         = COALESCE($4, description),
         source_name         = COALESCE($5, source_name),
         citation            = COALESCE($6, citation),
         jurisdiction        = COALESCE($7, jurisdiction),
         owner_user_id       = CASE WHEN $8::boolean THEN $9::uuid ELSE owner_user_id END,
         department_id       = CASE WHEN $10::boolean THEN $11::uuid ELSE department_id END,
         status              = COALESCE($12, status),
         compliance_status   = COALESCE($13, compliance_status),
         criticality         = COALESCE($14, criticality),
         frequency           = COALESCE($15, frequency),
         next_due_date       = COALESCE($16::date, next_due_date),
         penalty_description = COALESCE($17, penalty_description),
         tags                = COALESCE($18::text[], tags),
         updated_at          = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        title ? sanitizeText(title).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        sourceName !== undefined && sourceName !== null ? sanitizeText(sourceName) : null,
        citation !== undefined && citation !== null ? sanitizeText(citation) : null,
        jurisdiction !== undefined && jurisdiction !== null ? sanitizeText(jurisdiction) : null,
        ownerUserId !== undefined,
        ownerUserId || null,
        departmentId !== undefined,
        departmentId || null,
        status || null,
        complianceStatus || null,
        criticality || null,
        frequency || null,
        nextDueDate || null,
        penaltyDescription !== undefined && penaltyDescription !== null
          ? sanitizeText(penaltyDescription) : null,
        Array.isArray(tags) ? tags.map((tag) => sanitizeText(String(tag))) : null
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Obligation not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'obligation.updated',
      resourceType: 'compliance_obligation',
      resourceId: rows[0].id,
      details: { reference: rows[0].reference, complianceStatus: rows[0].compliance_status },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: obligationService.decorateObligation(rows[0]) });
  } catch (error) {
    log('error', 'obligations.update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/obligations/:id/attestations — attest for a period and roll the
// due date forward.
router.post('/:id/attestations', requirePermission('obligations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid obligation id' });
    }
    const { outcome, notes, periodStart, periodEnd, evidenceId } = req.body || {};
    if (!VALID_ATTESTATION_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be one of: ${VALID_ATTESTATION_OUTCOMES.join(', ')}` });
    }
    if (evidenceId && !isUuid(evidenceId)) {
      return res.status(400).json({ error: 'evidenceId must be a valid id' });
    }

    await client.query('BEGIN');
    const { rows: obligationRows } = await client.query(
      `SELECT * FROM compliance_obligations
       WHERE id = $1 AND organization_id = $2
       FOR UPDATE`,
      [req.params.id, req.user.organization_id]
    );
    if (obligationRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Obligation not found' });
    }
    const obligation = obligationRows[0];

    // Evidence must be this organization's. Without the check an attestation
    // could cite another tenant's evidence record by id.
    if (evidenceId) {
      const { rows: evidenceRows } = await client.query(
        'SELECT 1 FROM evidence WHERE id = $1 AND organization_id = $2',
        [evidenceId, req.user.organization_id]
      );
      if (evidenceRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Evidence not found' });
      }
    }

    const { rows: attestationRows } = await client.query(
      `INSERT INTO obligation_attestations
         (organization_id, obligation_id, period_start, period_end, due_date,
          outcome, notes, evidence_id, attested_by)
       VALUES ($1, $2, $3::date, $4::date, $5::date, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.organization_id,
        req.params.id,
        periodStart || null,
        periodEnd || null,
        obligation.next_due_date,
        outcome,
        notes ? sanitizeText(notes) : null,
        evidenceId || null,
        req.user.id
      ]
    );

    const advanced = obligationService.advanceDueDate(
      obligation.frequency, obligation.next_due_date
    );
    const newComplianceStatus = obligationService.complianceStatusForOutcome(outcome);

    const { rows: updatedRows } = await client.query(
      `UPDATE compliance_obligations SET
         last_attested_at  = now(),
         compliance_status = COALESCE($3, compliance_status),
         next_due_date     = COALESCE($4::date, next_due_date),
         updated_at        = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        newComplianceStatus,
        advanced ? advanced.toISOString().slice(0, 10) : null
      ]
    );

    await client.query('COMMIT');

    auditService.logFromRequest(req, {
      eventType: 'obligation.attested',
      resourceType: 'compliance_obligation',
      resourceId: req.params.id,
      details: {
        reference: obligation.reference,
        outcome,
        nextDueDate: updatedRows[0].next_due_date
      },
      success: true
    }).catch(() => {});

    res.status(201).json({
      success: true,
      data: {
        attestation: attestationRows[0],
        obligation: obligationService.decorateObligation(updatedRows[0])
      }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'obligations.attest_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/v1/obligations/:id/controls
router.post('/:id/controls', requirePermission('obligations.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid obligation id' });
    }
    const { controlId, notes } = req.body || {};
    if (!isUuid(controlId)) {
      return res.status(400).json({ error: 'controlId must be a valid id' });
    }
    if (!(await obligationInOrg(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ error: 'Obligation not found' });
    }

    const { rows: controlRows } = await pool.query(
      'SELECT 1 FROM framework_controls WHERE id = $1',
      [controlId]
    );
    if (controlRows.length === 0) {
      return res.status(404).json({ error: 'Control not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO obligation_control_links
         (organization_id, obligation_id, control_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT obligation_control_links_unique DO UPDATE
         SET notes = EXCLUDED.notes
       RETURNING *`,
      [
        req.user.organization_id,
        req.params.id,
        controlId,
        notes ? sanitizeText(notes) : null,
        req.user.id
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'obligations.link_control_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/obligations/:id/controls/:controlId
router.delete('/:id/controls/:controlId', requirePermission('obligations.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !isUuid(req.params.controlId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM obligation_control_links
       WHERE organization_id = $1 AND obligation_id = $2 AND control_id = $3`,
      [req.user.organization_id, req.params.id, req.params.controlId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    res.json({ success: true, data: { obligationId: req.params.id, controlId: req.params.controlId } });
  } catch (error) {
    log('error', 'obligations.unlink_control_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/obligations/:id
router.delete('/:id', requirePermission('obligations.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid obligation id' });
    }
    const { rows } = await pool.query(
      'DELETE FROM compliance_obligations WHERE id = $1 AND organization_id = $2 RETURNING reference',
      [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Obligation not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'obligation.deleted',
      resourceType: 'compliance_obligation',
      resourceId: req.params.id,
      details: { reference: rows[0].reference },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    log('error', 'obligations.delete_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
