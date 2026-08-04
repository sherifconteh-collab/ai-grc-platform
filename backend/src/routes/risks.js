// @tier: community
/**
 * Risk register: risks, their assessments, treatments, reviews, acceptance,
 * and linkage to controls, assets and objectives.
 *
 * Replaces a README claim with an implementation. What existed before was
 * `risk_scores` — one computed posture number per organization — which is a
 * metric, not a register.
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
const riskService = require('../services/riskRegisterService');

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'risks', windowMs: 15 * 60 * 1000, max: 300 }));

const VALID_CATEGORIES = [
  'strategic', 'operational', 'financial', 'compliance', 'cyber', 'privacy',
  'third_party', 'legal', 'reputational', 'environmental', 'health_safety',
  'technology', 'ai', 'other'
];
const VALID_STATUSES = [
  'identified', 'assessed', 'treatment_planned', 'treated', 'accepted',
  'monitoring', 'closed'
];
const VALID_STRATEGIES = ['avoid', 'mitigate', 'transfer', 'accept'];
const VALID_TREATMENT_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled', 'overdue'];
const VALID_REVIEW_OUTCOMES = ['unchanged', 'reassessed', 'escalated', 'de_escalated', 'closed'];
const VALID_EFFECTIVENESS = ['not_assessed', 'ineffective', 'partially_effective', 'effective'];

// Why a document is evidence for a risk. The same document can support
// different risks for different reasons, so the reason belongs on the link
// rather than on the evidence. Mirrors the CHECK constraint in migration 149.
const VALID_EVIDENCE_RELEVANCE = ['assessment', 'treatment', 'monitoring', 'acceptance'];
const MAX_LIMIT = 200;

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Likelihood and impact are 1-5. Anything else is rejected rather than clamped:
 * silently turning a 9 into a 5 produces a register whose numbers nobody can
 * reconcile against what they entered.
 */
function validateScale(value, label) {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    return `${label} must be an integer between 1 and 5`;
  }
  return null;
}

async function orgUserExists(organizationId, userId) {
  if (!userId) return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND organization_id = $2',
    [userId, organizationId]
  );
  return rows.length > 0;
}

async function departmentInOrg(organizationId, departmentId) {
  if (!departmentId) return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM departments WHERE id = $1 AND organization_id = $2',
    [departmentId, organizationId]
  );
  return rows.length > 0;
}

async function riskInOrg(organizationId, riskId) {
  const { rows } = await pool.query(
    'SELECT id FROM risks WHERE id = $1 AND organization_id = $2',
    [riskId, organizationId]
  );
  return rows.length > 0;
}

// GET /api/v1/risks/summary — register-level counts. Declared before /:id so
// 'summary' is not parsed as a risk id.
router.get('/summary', requirePermission('risks.read'), async (req, res) => {
  try {
    const summary = await riskService.getSummary(req.user.organization_id);
    res.json({ success: true, data: summary });
  } catch (error) {
    log('error', 'risks.summary_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/risks/heat-map — 5x5 residual matrix
router.get('/heat-map', requirePermission('risks.read'), async (req, res) => {
  try {
    const heatMap = await riskService.getHeatMap(req.user.organization_id);
    res.json({ success: true, data: heatMap });
  } catch (error) {
    log('error', 'risks.heat_map_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/risks
router.get('/', requirePermission('risks.read'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePaging(req.query);
    const { category, status, departmentId, ownerUserId, minResidualScore } = req.query;
    const reviewOverdue = req.query.reviewOverdue === 'true';

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
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

    const minScore = minResidualScore === undefined ? null : Number(minResidualScore);
    if (minScore !== null && (!Number.isFinite(minScore) || minScore < 1 || minScore > 25)) {
      return res.status(400).json({ error: 'minResidualScore must be between 1 and 25' });
    }

    const filters = [
      req.user.organization_id,
      category || null,
      status || null,
      departmentId || null,
      ownerUserId || null,
      minScore,
      reviewOverdue
    ];

    const { rows } = await pool.query(
      `SELECT r.*,
              d.name AS department_name,
              u.first_name AS owner_first_name,
              u.last_name  AS owner_last_name,
              COALESCE(t.open_treatments, 0) AS open_treatment_count,
              COALESCE(c.control_count, 0)   AS linked_control_count
       FROM risks r
       LEFT JOIN departments d ON d.id = r.department_id
       LEFT JOIN users u ON u.id = r.owner_user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS open_treatments FROM risk_treatments rt
         WHERE rt.risk_id = r.id AND rt.status NOT IN ('completed', 'cancelled')
       ) t ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS control_count FROM risk_control_links rcl
         WHERE rcl.risk_id = r.id
       ) c ON true
       WHERE r.organization_id = $1
         AND ($2::text IS NULL OR r.category = $2)
         AND ($3::text IS NULL OR r.status = $3)
         AND ($4::uuid IS NULL OR r.department_id = $4)
         AND ($5::uuid IS NULL OR r.owner_user_id = $5)
         AND ($6::int  IS NULL OR r.residual_score >= $6)
         AND (NOT $7::boolean OR (r.next_review_date < CURRENT_DATE AND r.status <> 'closed'))
       ORDER BY r.residual_score DESC NULLS LAST, r.created_at DESC
       LIMIT $8 OFFSET $9`,
      [...filters, limit, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM risks r
       WHERE r.organization_id = $1
         AND ($2::text IS NULL OR r.category = $2)
         AND ($3::text IS NULL OR r.status = $3)
         AND ($4::uuid IS NULL OR r.department_id = $4)
         AND ($5::uuid IS NULL OR r.owner_user_id = $5)
         AND ($6::int  IS NULL OR r.residual_score >= $6)
         AND (NOT $7::boolean OR (r.next_review_date < CURRENT_DATE AND r.status <> 'closed'))`,
      filters
    );

    res.json({
      success: true,
      data: rows.map(riskService.decorateRisk),
      pagination: { page, limit, total: countRows[0].total }
    });
  } catch (error) {
    log('error', 'risks.list_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/risks/:id — risk with treatments, links and review history
router.get('/:id', requirePermission('risks.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const orgId = req.user.organization_id;

    const { rows } = await pool.query(
      `SELECT r.*, d.name AS department_name
       FROM risks r
       LEFT JOIN departments d ON d.id = r.department_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [req.params.id, orgId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const [treatments, controls, assets, objectives, reviews, poams, vendors, evidence] = await Promise.all([
      pool.query(
        `SELECT * FROM risk_treatments
         WHERE risk_id = $1 AND organization_id = $2
         ORDER BY due_date NULLS LAST, created_at`,
        [req.params.id, orgId]
      ),
      pool.query(
        `SELECT rcl.id, rcl.control_id, rcl.effectiveness, rcl.notes,
                fc.control_id AS control_ref, fc.title AS control_title,
                f.name AS framework_name
         FROM risk_control_links rcl
         JOIN framework_controls fc ON fc.id = rcl.control_id
         LEFT JOIN frameworks f ON f.id = fc.framework_id
         WHERE rcl.risk_id = $1 AND rcl.organization_id = $2
         ORDER BY f.name, fc.control_id`,
        [req.params.id, orgId]
      ),
      pool.query(
        // assets is the CMDB table: its type lives in asset_categories via
        // category_id, not in a column on assets itself.
        `SELECT ral.id, ral.asset_id, a.name AS asset_name,
                a.criticality, ac.name AS asset_category
         FROM risk_asset_links ral
         JOIN assets a ON a.id = ral.asset_id
         LEFT JOIN asset_categories ac ON ac.id = a.category_id
         WHERE ral.risk_id = $1 AND ral.organization_id = $2
         ORDER BY a.name`,
        [req.params.id, orgId]
      ),
      pool.query(
        `SELECT rol.id, rol.objective_id, o.reference, o.title, o.category
         FROM risk_objective_links rol
         JOIN business_objectives o ON o.id = rol.objective_id
         WHERE rol.risk_id = $1 AND rol.organization_id = $2
         ORDER BY o.reference`,
        [req.params.id, orgId]
      ),
      pool.query(
        `SELECT rr.*, u.first_name, u.last_name
         FROM risk_reviews rr
         LEFT JOIN users u ON u.id = rr.reviewed_by
         WHERE rr.risk_id = $1 AND rr.organization_id = $2
         ORDER BY rr.reviewed_at DESC
         LIMIT 50`,
        [req.params.id, orgId]
      ),
      // What is actually being done about this risk. The register recorded the
      // treatment decision but had no link to the remediation work until
      // migration 146.
      pool.query(
        `SELECT rpl.id, rpl.poam_item_id, rpl.notes,
                p.title, p.status, p.priority, p.due_date,
                p.scheduled_completion_date, p.treatment_id,
                owner.email AS owner_email
         FROM risk_poam_links rpl
         JOIN poam_items p ON p.id = rpl.poam_item_id
         LEFT JOIN users owner ON owner.id = p.owner_id
         WHERE rpl.risk_id = $1 AND rpl.organization_id = $2
         ORDER BY
           CASE p.priority
             WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4
           END,
           p.due_date NULLS LAST`,
        [req.params.id, orgId]
      ),
      // Third parties, added by migration 148. risk_tier is the vendor's static
      // onboarding classification and is returned alongside the link so the two
      // can be compared -- a "low" tier vendor carrying a critical risk is
      // exactly the disagreement worth surfacing.
      pool.query(
        // This repo's column is vendor_name; the sibling repo's is name.
        // Aliased to `name` so the response shape stays identical across both.
        `SELECT rvl.id, rvl.vendor_id, rvl.notes,
                v.vendor_name AS name, v.vendor_type, v.risk_tier, v.review_status,
                v.data_access_level
         FROM risk_vendor_links rvl
         JOIN tprm_vendors v ON v.id = rvl.vendor_id
         WHERE rvl.risk_id = $1 AND rvl.organization_id = $2
         ORDER BY
           CASE v.risk_tier
             WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4
           END,
           v.vendor_name`,
        [req.params.id, orgId]
      ),
      // Evidence, added by migration 149. pii_classification travels with the
      // row because a risk file is somewhere people export from, and knowing a
      // document is 'high' before attaching it to a report matters.
      //
      // This repo's evidence table dates expiry with `retention_until`
      // (migration 012), not the `expires_at` the sibling repo uses -- here
      // `expires_at` belongs to legal_holds and would not resolve.
      pool.query(
        `SELECT rel.id, rel.evidence_id, rel.relevance, rel.notes,
                e.file_name, e.description, e.evidence_type,
                e.pii_classification, e.retention_until,
                e.created_at AS uploaded_at
         FROM risk_evidence_links rel
         JOIN evidence e ON e.id = rel.evidence_id
         WHERE rel.risk_id = $1 AND rel.organization_id = $2
         ORDER BY
           CASE rel.relevance
             WHEN 'assessment' THEN 1 WHEN 'treatment' THEN 2
             WHEN 'monitoring' THEN 3 ELSE 4
           END,
           e.created_at DESC`,
        [req.params.id, orgId]
      )
    ]);

    // Remediation being finished is a prompt to reassess, not a reassessment.
    // Deliberately does not touch residual_score: migration 140 stores inherent
    // and residual separately so an assessor can see what the controls actually
    // did, and a score that moves on its own destroys that evidence.
    const openPoams = poams.rows.filter(
      (row) => !['closed', 'risk_accepted', 'auditor_approved'].includes(String(row.status))
    );
    const remediationComplete = poams.rows.length > 0 && openPoams.length === 0;

    res.json({
      success: true,
      data: {
        ...riskService.decorateRisk(rows[0]),
        treatments: treatments.rows,
        controls: controls.rows,
        assets: assets.rows,
        objectives: objectives.rows,
        reviews: reviews.rows,
        poams: poams.rows,
        vendors: vendors.rows,
        evidence: evidence.rows,
        remediation_complete: remediationComplete,
        review_due: remediationComplete || (
          rows[0].next_review_date !== null
          && new Date(rows[0].next_review_date) <= new Date()
        )
      }
    });
  } catch (error) {
    log('error', 'risks.get_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/risks
router.post('/', requirePermission('risks.write'), async (req, res) => {
  try {
    const body = req.body || {};
    const {
      reference, title, description, category, threatSource, vulnerability,
      inherentLikelihood, inherentImpact, residualLikelihood, residualImpact,
      treatmentStrategy, status, ownerUserId, departmentId, identifiedDate,
      nextReviewDate, tags
    } = body;

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (treatmentStrategy && !VALID_STRATEGIES.includes(treatmentStrategy)) {
      return res.status(400).json({ error: `treatmentStrategy must be one of: ${VALID_STRATEGIES.join(', ')}` });
    }

    const scaleErrors = [
      validateScale(inherentLikelihood, 'inherentLikelihood'),
      validateScale(inherentImpact, 'inherentImpact'),
      validateScale(residualLikelihood, 'residualLikelihood'),
      validateScale(residualImpact, 'residualImpact')
    ].filter(Boolean);
    if (scaleErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: scaleErrors });
    }

    if (ownerUserId && !isUuid(ownerUserId)) {
      return res.status(400).json({ error: 'ownerUserId must be a valid id' });
    }
    if (departmentId && !isUuid(departmentId)) {
      return res.status(400).json({ error: 'departmentId must be a valid id' });
    }
    if (!(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }
    if (!(await departmentInOrg(req.user.organization_id, departmentId))) {
      return res.status(400).json({ error: 'Department not found' });
    }

    const resolvedReference = await riskService.resolveReference(
      pool, req.user.organization_id, reference
    );

    const { rows } = await pool.query(
      `INSERT INTO risks
         (organization_id, reference, title, description, category, threat_source,
          vulnerability, inherent_likelihood, inherent_impact, residual_likelihood,
          residual_impact, treatment_strategy, status, owner_user_id, department_id,
          identified_date, next_review_date, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               COALESCE($16::date, CURRENT_DATE), $17::date, $18, $19)
       RETURNING *`,
      [
        req.user.organization_id,
        resolvedReference,
        sanitizeText(title).trim(),
        description ? sanitizeText(description) : null,
        category || 'operational',
        threatSource ? sanitizeText(threatSource) : null,
        vulnerability ? sanitizeText(vulnerability) : null,
        inherentLikelihood ?? null,
        inherentImpact ?? null,
        residualLikelihood ?? null,
        residualImpact ?? null,
        treatmentStrategy || null,
        status || 'identified',
        ownerUserId || null,
        departmentId || null,
        identifiedDate || null,
        nextReviewDate || null,
        Array.isArray(tags) ? tags.map((tag) => sanitizeText(String(tag))) : null,
        req.user.id
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'risk.created',
      resourceType: 'risk',
      resourceId: rows[0].id,
      details: {
        reference: rows[0].reference,
        category: rows[0].category,
        inherentScore: rows[0].inherent_score,
        residualScore: rows[0].residual_score
      },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: riskService.decorateRisk(rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A risk with that reference already exists' });
    }
    log('error', 'risks.create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/risks/:id
router.put('/:id', requirePermission('risks.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const body = req.body || {};
    const {
      title, description, category, threatSource, vulnerability,
      inherentLikelihood, inherentImpact, residualLikelihood, residualImpact,
      treatmentStrategy, status, ownerUserId, departmentId, nextReviewDate,
      closureRationale, tags
    } = body;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (treatmentStrategy && !VALID_STRATEGIES.includes(treatmentStrategy)) {
      return res.status(400).json({ error: `treatmentStrategy must be one of: ${VALID_STRATEGIES.join(', ')}` });
    }

    const scaleErrors = [
      validateScale(inherentLikelihood, 'inherentLikelihood'),
      validateScale(inherentImpact, 'inherentImpact'),
      validateScale(residualLikelihood, 'residualLikelihood'),
      validateScale(residualImpact, 'residualImpact')
    ].filter(Boolean);
    if (scaleErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: scaleErrors });
    }

    if (ownerUserId && !(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }
    if (departmentId && !(await departmentInOrg(req.user.organization_id, departmentId))) {
      return res.status(400).json({ error: 'Department not found' });
    }

    // closed_at is stamped by the transition to 'closed' rather than accepted
    // from the client, so the closure date is always when the system saw it.
    const { rows } = await pool.query(
      `UPDATE risks SET
         title               = COALESCE($3, title),
         description         = COALESCE($4, description),
         category            = COALESCE($5, category),
         threat_source       = COALESCE($6, threat_source),
         vulnerability       = COALESCE($7, vulnerability),
         inherent_likelihood = COALESCE($8::smallint, inherent_likelihood),
         inherent_impact     = COALESCE($9::smallint, inherent_impact),
         residual_likelihood = COALESCE($10::smallint, residual_likelihood),
         residual_impact     = COALESCE($11::smallint, residual_impact),
         treatment_strategy  = COALESCE($12, treatment_strategy),
         status              = COALESCE($13, status),
         owner_user_id       = CASE WHEN $14::boolean THEN $15::uuid ELSE owner_user_id END,
         department_id       = CASE WHEN $16::boolean THEN $17::uuid ELSE department_id END,
         next_review_date    = COALESCE($18::date, next_review_date),
         closure_rationale   = COALESCE($19, closure_rationale),
         tags                = COALESCE($20::text[], tags),
         closed_at           = CASE WHEN $13 = 'closed' AND closed_at IS NULL
                                    THEN now() ELSE closed_at END,
         updated_at          = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        title ? sanitizeText(title).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        category || null,
        threatSource !== undefined && threatSource !== null ? sanitizeText(threatSource) : null,
        vulnerability !== undefined && vulnerability !== null ? sanitizeText(vulnerability) : null,
        inherentLikelihood ?? null,
        inherentImpact ?? null,
        residualLikelihood ?? null,
        residualImpact ?? null,
        treatmentStrategy || null,
        status || null,
        ownerUserId !== undefined,
        ownerUserId || null,
        departmentId !== undefined,
        departmentId || null,
        nextReviewDate || null,
        closureRationale ? sanitizeText(closureRationale) : null,
        Array.isArray(tags) ? tags.map((tag) => sanitizeText(String(tag))) : null
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'risk.updated',
      resourceType: 'risk',
      resourceId: rows[0].id,
      details: {
        reference: rows[0].reference,
        status: rows[0].status,
        residualScore: rows[0].residual_score
      },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: riskService.decorateRisk(rows[0]) });
  } catch (error) {
    log('error', 'risks.update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/risks/:id/accept — record a named acceptance decision
router.post('/:id/accept', requirePermission('risks.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const { rationale, acceptedUntil } = req.body || {};
    if (!isNonEmptyString(rationale)) {
      // An acceptance without a stated reason is the finding an assessor
      // writes up, so the API declines to record one.
      return res.status(400).json({ error: 'rationale is required to accept a risk' });
    }

    const { rows } = await pool.query(
      `UPDATE risks SET
         status               = 'accepted',
         accepted_by          = $3,
         accepted_at          = now(),
         acceptance_rationale = $4,
         accepted_until       = $5::date,
         updated_at           = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.organization_id,
        req.user.id,
        sanitizeText(rationale),
        acceptedUntil || null
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'risk.accepted',
      resourceType: 'risk',
      resourceId: rows[0].id,
      details: {
        reference: rows[0].reference,
        residualScore: rows[0].residual_score,
        acceptedUntil: rows[0].accepted_until
      },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: riskService.decorateRisk(rows[0]) });
  } catch (error) {
    log('error', 'risks.accept_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/risks/:id/reviews — record a periodic review
router.post('/:id/reviews', requirePermission('risks.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const { outcome, notes, nextReviewDate } = req.body || {};
    if (outcome && !VALID_REVIEW_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be one of: ${VALID_REVIEW_OUTCOMES.join(', ')}` });
    }

    await client.query('BEGIN');
    const review = await riskService.recordReview(client, {
      organizationId: req.user.organization_id,
      riskId: req.params.id,
      reviewedBy: req.user.id,
      outcome: outcome || 'unchanged',
      notes: notes ? sanitizeText(notes) : null,
      nextReviewDate: nextReviewDate || null
    });

    if (!review) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Risk not found' });
    }
    await client.query('COMMIT');

    auditService.logFromRequest(req, {
      eventType: 'risk.reviewed',
      resourceType: 'risk',
      resourceId: req.params.id,
      details: { outcome: review.outcome },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'risks.review_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/v1/risks/:id/treatments
router.post('/:id/treatments', requirePermission('risks.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const {
      title, description, treatmentType, status, ownerUserId, dueDate,
      targetResidualScore, estimatedCost
    } = req.body || {};

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (treatmentType && !VALID_STRATEGIES.includes(treatmentType)) {
      return res.status(400).json({ error: `treatmentType must be one of: ${VALID_STRATEGIES.join(', ')}` });
    }
    if (status && !VALID_TREATMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_TREATMENT_STATUSES.join(', ')}` });
    }
    if (targetResidualScore !== undefined && targetResidualScore !== null) {
      const target = Number(targetResidualScore);
      if (!Number.isInteger(target) || target < 1 || target > 25) {
        return res.status(400).json({ error: 'targetResidualScore must be an integer between 1 and 25' });
      }
    }
    if (ownerUserId && !(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }
    if (!(await riskInOrg(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO risk_treatments
         (organization_id, risk_id, title, description, treatment_type, status,
          owner_user_id, due_date, target_residual_score, estimated_cost, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11)
       RETURNING *`,
      [
        req.user.organization_id,
        req.params.id,
        sanitizeText(title).trim(),
        description ? sanitizeText(description) : null,
        treatmentType || 'mitigate',
        status || 'planned',
        ownerUserId || null,
        dueDate || null,
        targetResidualScore ?? null,
        estimatedCost ?? null,
        req.user.id
      ]
    );

    auditService.logFromRequest(req, {
      eventType: 'risk.treatment_created',
      resourceType: 'risk_treatment',
      resourceId: rows[0].id,
      details: { riskId: req.params.id, treatmentType: rows[0].treatment_type },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'risks.treatment_create_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/risks/:id/treatments/:treatmentId
router.put('/:id/treatments/:treatmentId', requirePermission('risks.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !isUuid(req.params.treatmentId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { title, description, status, ownerUserId, dueDate, progressPercent, actualCost } = req.body || {};

    if (status && !VALID_TREATMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_TREATMENT_STATUSES.join(', ')}` });
    }
    if (progressPercent !== undefined && progressPercent !== null) {
      const progress = Number(progressPercent);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        return res.status(400).json({ error: 'progressPercent must be an integer between 0 and 100' });
      }
    }
    if (ownerUserId && !(await orgUserExists(req.user.organization_id, ownerUserId))) {
      return res.status(400).json({ error: 'Owner must be a member of your organization' });
    }

    // started_at and completed_at are stamped from the status transition, so a
    // treatment cannot claim to have been completed at a date of the client's
    // choosing.
    const { rows } = await pool.query(
      `UPDATE risk_treatments SET
         title            = COALESCE($4, title),
         description      = COALESCE($5, description),
         status           = COALESCE($6, status),
         owner_user_id    = CASE WHEN $7::boolean THEN $8::uuid ELSE owner_user_id END,
         due_date         = COALESCE($9::date, due_date),
         progress_percent = COALESCE($10::smallint, progress_percent),
         actual_cost      = COALESCE($11::numeric, actual_cost),
         started_at       = CASE WHEN $6 = 'in_progress' AND started_at IS NULL
                                 THEN now() ELSE started_at END,
         completed_at     = CASE WHEN $6 = 'completed' AND completed_at IS NULL
                                 THEN now() ELSE completed_at END,
         updated_at       = now()
       WHERE id = $3 AND risk_id = $2 AND organization_id = $1
       RETURNING *`,
      [
        req.user.organization_id,
        req.params.id,
        req.params.treatmentId,
        title ? sanitizeText(title).trim() : null,
        description !== undefined && description !== null ? sanitizeText(description) : null,
        status || null,
        ownerUserId !== undefined,
        ownerUserId || null,
        dueDate || null,
        progressPercent ?? null,
        actualCost ?? null
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Treatment not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'risk.treatment_updated',
      resourceType: 'risk_treatment',
      resourceId: rows[0].id,
      details: { riskId: req.params.id, status: rows[0].status },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    log('error', 'risks.treatment_update_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Link handling. The three link types share a shape, so they share one helper —
 * but the target table is chosen from a closed map keyed by the route, never
 * from request input, so no part of the statement is caller-influenced.
 */
const LINK_KINDS = {
  controls: {
    insert: `INSERT INTO risk_control_links
               (organization_id, risk_id, control_id, effectiveness, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT ON CONSTRAINT risk_control_links_unique DO UPDATE
               SET effectiveness = EXCLUDED.effectiveness, notes = EXCLUDED.notes
             RETURNING *`,
    exists: 'SELECT 1 FROM framework_controls WHERE id = $1',
    delete: `DELETE FROM risk_control_links
             WHERE organization_id = $1 AND risk_id = $2 AND control_id = $3`,
    bodyKey: 'controlId',
    eventType: 'risk.control_linked'
  },
  assets: {
    insert: `INSERT INTO risk_asset_links (organization_id, risk_id, asset_id, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ON CONSTRAINT risk_asset_links_unique DO NOTHING
             RETURNING *`,
    exists: 'SELECT 1 FROM assets WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM risk_asset_links
             WHERE organization_id = $1 AND risk_id = $2 AND asset_id = $3`,
    bodyKey: 'assetId',
    eventType: 'risk.asset_linked'
  },
  objectives: {
    insert: `INSERT INTO risk_objective_links (organization_id, risk_id, objective_id, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ON CONSTRAINT risk_objective_links_unique DO NOTHING
             RETURNING *`,
    exists: 'SELECT 1 FROM business_objectives WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM risk_objective_links
             WHERE organization_id = $1 AND risk_id = $2 AND objective_id = $3`,
    bodyKey: 'objectiveId',
    eventType: 'risk.objective_linked'
  },
  // Migration 136 tied risks to controls (what treats them), assets (what is
  // exposed) and objectives (what is threatened) -- but not to the remediation
  // work itself. Added by migration 146.
  poam: {
    insert: `INSERT INTO risk_poam_links (organization_id, risk_id, poam_item_id, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ON CONSTRAINT risk_poam_links_unique DO NOTHING
             RETURNING *`,
    exists: 'SELECT 1 FROM poam_items WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM risk_poam_links
             WHERE organization_id = $1 AND risk_id = $2 AND poam_item_id = $3`,
    bodyKey: 'poamItemId',
    eventType: 'risk.poam_linked'
  },
  // Third parties were the remaining gap. tprm_vendors carries a risk_tier,
  // but that is a static classification set at onboarding -- "this is a
  // critical supplier" -- not a scored, reviewed risk with a likelihood, an
  // impact and a treatment. Added by migration 148 so vendor concentration is
  // visible to the register, and register entries are visible during a vendor
  // review.
  vendors: {
    insert: `INSERT INTO risk_vendor_links (organization_id, risk_id, vendor_id, notes, created_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ON CONSTRAINT risk_vendor_links_unique DO UPDATE
               SET notes = EXCLUDED.notes
             RETURNING *`,
    exists: 'SELECT 1 FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM risk_vendor_links
             WHERE organization_id = $1 AND risk_id = $2 AND vendor_id = $3`,
    bodyKey: 'vendorId',
    eventType: 'risk.vendor_linked'
  },
  // Evidence, added by migration 149 -- the last unconnected edge. Evidence
  // could already be linked to controls (migration 009/014), so a risk's
  // evidence was only reachable transitively: via its controls, and only when
  // those controls happened to have evidence. "Show me this risk is under
  // management" is a different question from "show me these controls exist",
  // and this link answers it directly.
  evidence: {
    insert: `INSERT INTO risk_evidence_links
               (organization_id, risk_id, evidence_id, relevance, notes, created_by)
             VALUES ($1, $2, $3, COALESCE($4, 'monitoring'), $5, $6)
             ON CONFLICT ON CONSTRAINT risk_evidence_links_unique DO UPDATE
               SET relevance = EXCLUDED.relevance, notes = EXCLUDED.notes
             RETURNING *`,
    exists: 'SELECT 1 FROM evidence WHERE id = $1 AND organization_id = $2',
    delete: `DELETE FROM risk_evidence_links
             WHERE organization_id = $1 AND risk_id = $2 AND evidence_id = $3`,
    bodyKey: 'evidenceId',
    eventType: 'risk.evidence_linked'
  }
};

// Control links carry effectiveness and notes; asset and objective links do
// not. Parameter lists are built per kind rather than padded with unreferenced
// placeholders — PostgreSQL cannot infer a type for a bound parameter the
// statement never mentions and rejects the whole statement.
function linkInsertParams(kindKey, { organizationId, riskId, targetId, effectiveness, relevance, notes, userId }) {
  if (kindKey === 'controls') {
    return [organizationId, riskId, targetId, effectiveness, notes, userId];
  }
  if (kindKey === 'vendors') {
    return [organizationId, riskId, targetId, notes, userId];
  }
  if (kindKey === 'evidence') {
    return [organizationId, riskId, targetId, relevance, notes, userId];
  }
  return [organizationId, riskId, targetId, userId];
}

async function handleLink(req, res, kindKey) {
  const kind = LINK_KINDS[kindKey];
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const targetId = (req.body || {})[kind.bodyKey];
    if (!isUuid(targetId)) {
      return res.status(400).json({ error: `${kind.bodyKey} must be a valid id` });
    }
    const { effectiveness, relevance, notes } = req.body || {};
    if (effectiveness && !VALID_EFFECTIVENESS.includes(effectiveness)) {
      return res.status(400).json({ error: `effectiveness must be one of: ${VALID_EFFECTIVENESS.join(', ')}` });
    }
    // Validated here as well as by the CHECK constraint, so a bad value comes
    // back as a 400 naming the options rather than a 500 from Postgres.
    if (relevance && !VALID_EVIDENCE_RELEVANCE.includes(relevance)) {
      return res.status(400).json({ error: `relevance must be one of: ${VALID_EVIDENCE_RELEVANCE.join(', ')}` });
    }
    if (!(await riskInOrg(req.user.organization_id, req.params.id))) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    // framework_controls are shared catalog rows and carry no organization_id,
    // so its existence check takes one parameter; the org-scoped tables take
    // two. Both queries are literals from the map above.
    const existsParams = kindKey === 'controls'
      ? [targetId]
      : [targetId, req.user.organization_id];
    const { rows: exists } = await pool.query(kind.exists, existsParams);
    if (exists.length === 0) {
      return res.status(404).json({ error: 'Link target not found' });
    }

    const { rows } = await pool.query(kind.insert, linkInsertParams(kindKey, {
      organizationId: req.user.organization_id,
      riskId: req.params.id,
      targetId,
      effectiveness: effectiveness || null,
      relevance: relevance || null,
      notes: notes ? sanitizeText(notes) : null,
      userId: req.user.id
    }));

    auditService.logFromRequest(req, {
      eventType: kind.eventType,
      resourceType: 'risk',
      resourceId: req.params.id,
      details: { targetId },
      success: true
    }).catch(() => {});

    // DO NOTHING returns no row when the link already existed; that is still a
    // success from the caller's point of view.
    res.status(rows.length > 0 ? 201 : 200).json({
      success: true,
      data: rows[0] || { risk_id: req.params.id, target_id: targetId, already_linked: true }
    });
  } catch (error) {
    log('error', 'risks.link_failed', { kind: kindKey, error: serializeError(error) });
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
    res.json({ success: true, data: { riskId: req.params.id, targetId: req.params.targetId } });
  } catch (error) {
    log('error', 'risks.unlink_failed', { kind: kindKey, error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/:id/controls', requirePermission('risks.write'), (req, res) => handleLink(req, res, 'controls'));
router.delete('/:id/controls/:targetId', requirePermission('risks.write'), (req, res) => handleUnlink(req, res, 'controls'));
router.post('/:id/assets', requirePermission('risks.write'), (req, res) => handleLink(req, res, 'assets'));
router.delete('/:id/assets/:targetId', requirePermission('risks.write'), (req, res) => handleUnlink(req, res, 'assets'));
router.post('/:id/objectives', requirePermission('risks.write'), (req, res) => handleLink(req, res, 'objectives'));
router.delete('/:id/objectives/:targetId', requirePermission('risks.write'), (req, res) => handleUnlink(req, res, 'objectives'));
router.post('/:id/poam', requirePermission('risks.write'), (req, res) => handleLink(req, res, 'poam'));
router.delete('/:id/poam/:targetId', requirePermission('risks.write'), (req, res) => handleUnlink(req, res, 'poam'));
router.post('/:id/vendors', requirePermission('risks.write'), (req, res) => handleLink(req, res, 'vendors'));
router.delete('/:id/vendors/:targetId', requirePermission('risks.write'), (req, res) => handleUnlink(req, res, 'vendors'));
router.post('/:id/evidence', requirePermission('risks.write'), (req, res) => handleLink(req, res, 'evidence'));
router.delete('/:id/evidence/:targetId', requirePermission('risks.write'), (req, res) => handleUnlink(req, res, 'evidence'));

// DELETE /api/v1/risks/:id
router.delete('/:id', requirePermission('risks.write'), async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid risk id' });
    }
    const { rows } = await pool.query(
      'DELETE FROM risks WHERE id = $1 AND organization_id = $2 RETURNING reference',
      [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'risk.deleted',
      resourceType: 'risk',
      resourceId: req.params.id,
      details: { reference: rows[0].reference },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    log('error', 'risks.delete_failed', { error: serializeError(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
