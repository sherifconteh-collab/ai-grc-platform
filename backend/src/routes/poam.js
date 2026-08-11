// @tier: community
const express = require('express');
const PDFDocument = require('pdfkit');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const pool = require('../config/database');
const auditService = require('../services/auditService');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { requireSod } = require('../middleware/sod');
const { enqueueWebhookEvent } = require('../services/webhookService');
const { enqueueJob } = require('../services/jobService');
const { createNotification } = require('../services/notificationService');
const { toCsvDocument } = require('../utils/csv');
const { log, serializeError } = require('../utils/logger');
const {
  getAllFrameworkTypes,
  getFrameworkPoamTypes,
  createFrameworkApprovalRequest,
  getApprovalRequestWithContext,
  getAuditorGuidance
} = require('../services/frameworkPoamService');

// This router had no rate limiting at all, unlike its sibling
// poamMilestones.js. express-rate-limit is applied router-wide ahead of
// authenticate so a cheap IP-based bound is in place before any JWT
// verification or database lookup runs. CodeQL does not model this repo's own
// createRateLimiter, so the per-route limit on /export is invisible to
// js/missing-rate-limiting; this layer is what it can trace. Same budget as
// poamMilestones.js so the two halves of one feature share one rule.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }));

router.use(authenticate);

const ALLOWED_STATUS = ['open', 'in_progress', 'pending_review', 'pending_auditor_review', 'auditor_approved', 'auditor_rejected', 'closed', 'risk_accepted'];
const ALLOWED_PRIORITY = ['low', 'medium', 'high', 'critical'];
// 'risk' joins the set with migration 140: a POA&M can now be raised from a
// risk-register entry. 'audit_finding' and 'assessment' were declared here from
// the start but never written by any code path until poamGateService began
// raising items from findings and assessment procedures.
const ALLOWED_SOURCE_TYPE = ['manual', 'vulnerability', 'control', 'audit_finding', 'assessment', 'risk'];
const ALLOWED_REVIEW_OUTCOMES = ['approved', 'rejected', 'changes_requested'];

function parseDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function dueDateFromSeverity(severity) {
  const dt = new Date();
  const sev = String(severity || '').toLowerCase();
  if (sev === 'critical') dt.setDate(dt.getDate() + 14);
  else if (sev === 'high') dt.setDate(dt.getDate() + 30);
  else if (sev === 'medium') dt.setDate(dt.getDate() + 45);
  else dt.setDate(dt.getDate() + 60);
  return dt.toISOString().slice(0, 10);
}

async function emitPoamEvent(orgId, userId, eventType, payload) {
  await enqueueWebhookEvent({
    organizationId: orgId,
    eventType,
    payload
  }).catch(() => {});

  await enqueueJob({
    organizationId: orgId,
    jobType: 'webhook_flush',
    payload: { limit: 50 },
    createdBy: userId
  }).catch(() => {});
}

/**
 * Build the shared WHERE clause for the list and export routes.
 *
 * Extracted so the two cannot drift: an export that silently applies different
 * filters from the list the user was looking at is a compliance-reporting bug,
 * not a cosmetic one.
 */
function buildPoamFilters(orgId, query) {
  const { status, priority, source_type, controlId, vulnerabilityId, ownerId, riskId } = query;
  const where = ['p.organization_id = $1'];
  const params = [orgId];
  let idx = 2;

  if (status && ALLOWED_STATUS.includes(String(status))) {
    where.push(`p.status = $${idx}`);
    params.push(status);
    idx += 1;
  }
  if (priority && ALLOWED_PRIORITY.includes(String(priority))) {
    where.push(`p.priority = $${idx}`);
    params.push(priority);
    idx += 1;
  }
  if (source_type) {
    where.push(`p.source_type = $${idx}`);
    params.push(String(source_type));
    idx += 1;
  }
  if (controlId) {
    // Match the originating control OR any control linked through
    // poam_control_links (migration 141). Filtering on p.control_id alone made
    // a control's own page miss every POA&M that merely listed it among
    // several.
    where.push(`(p.control_id = $${idx} OR EXISTS (
      SELECT 1 FROM poam_control_links pcl
      WHERE pcl.poam_item_id = p.id
        AND pcl.organization_id = p.organization_id
        AND pcl.control_id = $${idx}
    ))`);
    params.push(controlId);
    idx += 1;
  }
  if (riskId) {
    where.push(`EXISTS (
      SELECT 1 FROM risk_poam_links rpl
      WHERE rpl.poam_item_id = p.id
        AND rpl.organization_id = p.organization_id
        AND rpl.risk_id = $${idx}
    )`);
    params.push(riskId);
    idx += 1;
  }
  if (vulnerabilityId) {
    where.push(`p.vulnerability_id = $${idx}`);
    params.push(vulnerabilityId);
    idx += 1;
  }
  if (ownerId) {
    where.push(`p.owner_id = $${idx}`);
    params.push(ownerId);
    idx += 1;
  }

  return { where, params, idx };
}

// GET /api/v1/poam
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { limit, offset } = req.query;
    const { where, params, idx } = buildPoamFilters(orgId, req.query);

    const qLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const qOffset = Math.max(0, Number(offset) || 0);

    const rows = await pool.query(
      `SELECT
         p.*,
         fc.control_id AS control_code,
         fc.title AS control_title,
         f.code AS framework_code,
         vf.vulnerability_id,
         vf.severity AS vulnerability_severity,
         owner.email AS owner_email,
         creator.email AS created_by_email,
         counts.control_count,
         counts.risk_count,
         counts.milestone_count,
         counts.next_milestone_date
       FROM poam_items p
       LEFT JOIN framework_controls fc ON fc.id = p.control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN vulnerability_findings vf ON vf.id = p.vulnerability_id
       LEFT JOIN users owner ON owner.id = p.owner_id
       LEFT JOIN users creator ON creator.id = p.created_by
       -- LATERAL rather than three correlated subqueries in the SELECT list,
       -- per .claude/rules/database.md, and rather than joining the three link
       -- tables directly, which would inflate rows multiplicatively.
       LEFT JOIN LATERAL (
         SELECT
           (SELECT COUNT(*)::int FROM poam_control_links pcl
             WHERE pcl.poam_item_id = p.id AND pcl.organization_id = p.organization_id) AS control_count,
           (SELECT COUNT(*)::int FROM risk_poam_links rpl
             WHERE rpl.poam_item_id = p.id AND rpl.organization_id = p.organization_id) AS risk_count,
           (SELECT COUNT(*)::int FROM poam_milestones pm
             WHERE pm.poam_item_id = p.id AND pm.organization_id = p.organization_id) AS milestone_count,
           (SELECT MIN(pm.target_date) FROM poam_milestones pm
             WHERE pm.poam_item_id = p.id AND pm.organization_id = p.organization_id
               AND pm.status <> 'completed') AS next_milestone_date
       ) counts ON TRUE
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE p.priority
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         p.due_date NULLS LAST,
         p.created_at DESC
       LIMIT $${idx}
       OFFSET $${idx + 1}`,
      [...params, qLimit, qOffset]
    );

    const counts = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress','pending_review'))::int AS active,
         COUNT(*) FILTER (WHERE status = 'risk_accepted')::int AS risk_accepted,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('closed','risk_accepted'))::int AS overdue
       FROM poam_items p
       WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({
      success: true,
      data: {
        items: rows.rows,
        summary: counts.rows[0] || { total: 0, active: 0, risk_accepted: 0, overdue: 0 },
        pagination: { limit: qLimit, offset: qOffset }
      }
    });
  } catch (error) {
    log('error', 'poam.list_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch POA&M items' });
  }
});

// ---------------------------------------------------------------------------
// ROUTE ORDER MATTERS. Every literal path below must stay ABOVE `/:id`.
//
// Express matches in declaration order, so a `/poam/export` declared after
// `/poam/:id` never runs -- the request binds `id = "export"` and 404s as
// "POA&M item not found". `/framework-types` was declared near the bottom of
// this file and had exactly that bug: the entire multi-framework POA&M
// vocabulary (FISCAM CAP/NFR, ISO CAR/OFI, SOC 2 deficiency, HIPAA CAP, PCI
// RAV, NIST, FedRAMP) was unreachable, which is why nothing in the product
// ever offered a type picker.
// ---------------------------------------------------------------------------

// GET /api/v1/poam/framework-types
// The vocabulary that names remediation per framework. Defaults to the
// frameworks this organization has actually activated -- offering a SOC 2 shop
// a FISCAM Notice of Findings is noise, not flexibility.
router.get('/framework-types', requirePermission('controls.read'), async (req, res) => {
  try {
    const { framework_code, all } = req.query;

    if (framework_code) {
      const frameworkConfig = getFrameworkPoamTypes(framework_code);
      return res.json({ success: true, data: frameworkConfig ? frameworkConfig.types : [] });
    }

    const types = getAllFrameworkTypes();

    if (String(all) === 'true') {
      return res.json({ success: true, data: types });
    }

    const active = await pool.query(
      `SELECT DISTINCT f.code
       FROM frameworks f
       JOIN organization_frameworks orgf ON orgf.framework_id = f.id
       WHERE orgf.organization_id = $1 AND f.is_active = true`,
      [req.user.organization_id]
    );
    const activeCodes = new Set(active.rows.map((row) => String(row.code).toLowerCase()));

    // No activated frameworks yet (a brand-new org) falls back to the full set
    // rather than an empty picker the user cannot get past.
    const scoped = activeCodes.size === 0
      ? types
      : types.filter((type) => activeCodes.has(String(type.framework_code || '').toLowerCase()));

    res.json({ success: true, data: scoped.length > 0 ? scoped : types });
  } catch (error) {
    log('error', 'poam.framework_types_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch framework types' });
  }
});

// GET /api/v1/poam/export?format=csv|pdf
// Federal POA&M reporting needs the whole register in one file. Rate limited
// separately from the rest of the router because it streams every remediation
// record an organization has.
router.get('/export',
  createRateLimiter({ label: 'poam-export', windowMs: 60 * 1000, max: 10 }),
  requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'pdf'].includes(format)) {
      return res.status(400).json({ success: false, error: 'format must be csv or pdf' });
    }

    const { where, params } = buildPoamFilters(orgId, req.query);

    const rows = await pool.query(
      `SELECT
         p.*,
         fc.control_id AS control_code,
         f.code AS framework_code,
         owner.email AS owner_email,
         vf.vulnerability_id AS vulnerability_ref,
         rt.title AS treatment_title,
         agg.linked_controls,
         agg.linked_risks,
         agg.milestone_count,
         agg.next_milestone_date,
         -- Slippage is the whole reason scheduled_completion_date exists
         -- (migration 134): the gap between the original commitment and the
         -- current target is what federal reporting asks for.
         CASE
           WHEN p.scheduled_completion_date IS NOT NULL AND p.due_date IS NOT NULL
           THEN (p.due_date - p.scheduled_completion_date)
           ELSE NULL
         END AS slippage_days
       FROM poam_items p
       LEFT JOIN framework_controls fc ON fc.id = p.control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN users owner ON owner.id = p.owner_id
       LEFT JOIN vulnerability_findings vf ON vf.id = p.vulnerability_id
       LEFT JOIN risk_treatments rt ON rt.id = p.treatment_id
       LEFT JOIN LATERAL (
         SELECT
           (SELECT string_agg(DISTINCT lfc.control_id || ' (' || COALESCE(lf.code, '?') || ')', '; ')
              FROM poam_control_links pcl
              JOIN framework_controls lfc ON lfc.id = pcl.control_id
              LEFT JOIN frameworks lf ON lf.id = lfc.framework_id
             WHERE pcl.poam_item_id = p.id AND pcl.organization_id = p.organization_id) AS linked_controls,
           (SELECT string_agg(DISTINCT COALESCE(r.reference, r.title), '; ')
              FROM risk_poam_links rpl
              JOIN risks r ON r.id = rpl.risk_id
             WHERE rpl.poam_item_id = p.id AND rpl.organization_id = p.organization_id) AS linked_risks,
           (SELECT COUNT(*)::int FROM poam_milestones pm
             WHERE pm.poam_item_id = p.id AND pm.organization_id = p.organization_id) AS milestone_count,
           (SELECT MIN(pm.target_date) FROM poam_milestones pm
             WHERE pm.poam_item_id = p.id AND pm.organization_id = p.organization_id
               AND pm.status <> 'completed') AS next_milestone_date
       ) agg ON TRUE
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE p.priority
           WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4
         END,
         p.due_date NULLS LAST,
         p.created_at DESC
       LIMIT 5000`,
      params
    );

    await auditService.logFromRequest(req, {
      eventType: 'poam_exported',
      resourceType: 'poam',
      resourceId: null,
      details: { format, row_count: rows.rows.length }
    }).catch(() => {});

    const date = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const header = [
        'id', 'title', 'description', 'primary_control', 'framework', 'linked_controls',
        'framework_type', 'status', 'priority', 'owner', 'source_type', 'source_id',
        'scheduled_completion_date', 'due_date', 'slippage_days', 'resources_required',
        'remediation_plan', 'milestone_count', 'next_milestone_date', 'linked_risks',
        'risk_treatment', 'created_at', 'closed_at'
      ];
      const csvRows = rows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        primary_control: row.control_code,
        framework: row.framework_code,
        linked_controls: row.linked_controls,
        framework_type: row.framework_specific_type,
        status: row.status,
        priority: row.priority,
        owner: row.owner_email,
        source_type: row.source_type,
        source_id: row.source_id,
        scheduled_completion_date: row.scheduled_completion_date,
        due_date: row.due_date,
        slippage_days: row.slippage_days,
        resources_required: row.resources_required,
        remediation_plan: row.remediation_plan,
        milestone_count: row.milestone_count,
        next_milestone_date: row.next_milestone_date,
        linked_risks: row.linked_risks,
        risk_treatment: row.treatment_title,
        created_at: row.created_at,
        closed_at: row.closed_at
      }));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="poam-${date}.csv"`);
      return res.send(toCsvDocument(header, csvRows));
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="poam-${date}.pdf"`);

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(20).text('Plan of Action & Milestones', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#444444')
      .text(`${rows.rows.length} item(s)  |  Generated: ${date}`, { align: 'center' });
    doc.moveDown(1.5);

    if (rows.rows.length === 0) {
      doc.fontSize(11).fillColor('#000000').text('No POA&M items match the selected filters.');
    }

    rows.rows.forEach((row, index) => {
      if (index > 0) doc.moveDown(1);
      doc.fontSize(13).fillColor('#000000').text(`${index + 1}. ${row.title}`);
      doc.fontSize(10).fillColor('#444444');
      doc.text(`Status: ${row.status}   Priority: ${row.priority}   Owner: ${row.owner_email || 'unassigned'}`);
      doc.text(`Controls: ${row.linked_controls || row.control_code || 'none'}`);
      if (row.framework_specific_type) doc.text(`Type: ${row.framework_specific_type} (${row.framework_code || 'n/a'})`);
      doc.text(`Originally scheduled: ${row.scheduled_completion_date || 'not set'}   Current target: ${row.due_date || 'not set'}`
        + (row.slippage_days !== null && row.slippage_days !== undefined ? `   Slippage: ${row.slippage_days} day(s)` : ''));
      if (row.resources_required) doc.text(`Resources required: ${row.resources_required}`);
      doc.text(`Milestones: ${row.milestone_count || 0}`
        + (row.next_milestone_date ? `   Next target: ${row.next_milestone_date}` : ''));
      if (row.linked_risks) doc.text(`Risks: ${row.linked_risks}`);
      if (row.treatment_title) doc.text(`Risk treatment: ${row.treatment_title}`);
      if (row.remediation_plan) doc.text(`Remediation plan: ${row.remediation_plan}`);
    });

    doc.end();
  } catch (error) {
    log('error', 'poam.export_failed', { error: serializeError(error) });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to export POA&M items' });
    } else {
      res.end();
    }
  }
});

// GET /api/v1/poam/:id
router.get('/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const itemResult = await pool.query(
      `SELECT p.*,
              fc.control_id AS control_code,
              fc.title AS control_title,
              f.code AS framework_code,
              vf.vulnerability_id,
              vf.title AS vulnerability_title,
              vf.severity AS vulnerability_severity
       FROM poam_items p
       LEFT JOIN framework_controls fc ON fc.id = p.control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN vulnerability_findings vf ON vf.id = p.vulnerability_id
       WHERE p.organization_id = $1 AND p.id = $2
       LIMIT 1`,
      [orgId, id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const [updatesResult, controlsResult, risksResult] = await Promise.all([
      pool.query(
        `SELECT pu.*,
                u.email AS changed_by_email
         FROM poam_item_updates pu
         LEFT JOIN users u ON u.id = pu.changed_by
         WHERE pu.organization_id = $1 AND pu.poam_item_id = $2
         ORDER BY pu.created_at DESC`,
        [orgId, id]
      ),
      // Every linked control, not just the originating one. Before migration
      // 141 a POA&M could only ever name a single control.
      pool.query(
        `SELECT pcl.control_id,
                pcl.notes,
                fc.control_id AS control_code,
                fc.title AS control_title,
                f.code AS framework_code,
                f.name AS framework_name
         FROM poam_control_links pcl
         JOIN framework_controls fc ON fc.id = pcl.control_id
         LEFT JOIN frameworks f ON f.id = fc.framework_id
         WHERE pcl.organization_id = $1 AND pcl.poam_item_id = $2
         ORDER BY fc.control_id`,
        [orgId, id]
      ),
      pool.query(
        `SELECT rpl.risk_id,
                r.reference AS risk_reference,
                r.title AS risk_title,
                r.status AS risk_status,
                r.residual_score
         FROM risk_poam_links rpl
         JOIN risks r ON r.id = rpl.risk_id
         WHERE rpl.organization_id = $1 AND rpl.poam_item_id = $2
         ORDER BY r.residual_score DESC NULLS LAST`,
        [orgId, id]
      )
    ]);

    res.json({
      success: true,
      data: {
        item: itemResult.rows[0],
        updates: updatesResult.rows,
        controls: controlsResult.rows,
        risks: risksResult.rows
      }
    });
  } catch (error) {
    log('error', 'poam.detail_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch POA&M item' });
  }
});

// POST /api/v1/poam/:id/controls
// Link an additional control. The originating control stays in
// poam_items.control_id; this is how an item covering several controls is
// expressed (migration 141).
router.post('/:id/controls', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamItemId = req.params.id;
    const { control_id: controlId, notes } = req.body || {};

    if (!controlId) {
      return res.status(400).json({ success: false, error: 'control_id is required' });
    }

    const owns = await pool.query(
      'SELECT id FROM poam_items WHERE organization_id = $1 AND id = $2 LIMIT 1',
      [orgId, poamItemId]
    );
    if (owns.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    // framework_controls is a shared catalog with no organization_id, so the
    // org scope comes from the POA&M above plus the org-scoped unique key.
    const control = await pool.query(
      'SELECT id FROM framework_controls WHERE id = $1 LIMIT 1',
      [controlId]
    );
    if (control.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control not found' });
    }

    const inserted = await pool.query(
      `INSERT INTO poam_control_links (organization_id, poam_item_id, control_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT poam_control_links_unique DO NOTHING
       RETURNING *`,
      [orgId, poamItemId, controlId, notes ? String(notes) : null, req.user.id]
    );

    await auditService.logFromRequest(req, {
      eventType: 'poam_control_linked',
      resourceType: 'poam',
      resourceId: poamItemId,
      details: { control_id: controlId }
    }).catch(() => {});

    // DO NOTHING returns no row when the link already existed; that is still a
    // success from the caller's point of view.
    res.status(inserted.rows.length > 0 ? 201 : 200).json({
      success: true,
      data: inserted.rows[0] || { poam_item_id: poamItemId, control_id: controlId, already_linked: true }
    });
  } catch (error) {
    log('error', 'poam.link_control_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to link control' });
  }
});

// DELETE /api/v1/poam/:id/controls/:controlId
router.delete('/:id/controls/:controlId', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { rowCount } = await pool.query(
      `DELETE FROM poam_control_links
       WHERE organization_id = $1 AND poam_item_id = $2 AND control_id = $3`,
      [orgId, req.params.id, req.params.controlId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    await auditService.logFromRequest(req, {
      eventType: 'poam_control_unlinked',
      resourceType: 'poam',
      resourceId: req.params.id,
      details: { control_id: req.params.controlId }
    }).catch(() => {});

    res.json({ success: true, data: { poam_item_id: req.params.id, control_id: req.params.controlId } });
  } catch (error) {
    log('error', 'poam.unlink_control_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to unlink control' });
  }
});

// POST /api/v1/poam
router.post('/', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      title,
      description,
      source_type = 'manual',
      source_id = null,
      vulnerability_id = null,
      control_id = null,
      owner_id = null,
      status = 'open',
      priority = 'medium',
      due_date = null,
      remediation_plan = null,
      risk_acceptance_expires_at = null
    } = req.body || {};

    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'title is required (min 3 chars)' });
    }
    if (!ALLOWED_SOURCE_TYPE.includes(String(source_type))) {
      return res.status(400).json({ success: false, error: `source_type must be one of: ${ALLOWED_SOURCE_TYPE.join(', ')}` });
    }
    if (!ALLOWED_STATUS.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (!ALLOWED_PRIORITY.includes(String(priority))) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${ALLOWED_PRIORITY.join(', ')}` });
    }

    const itemResult = await pool.query(
      `INSERT INTO poam_items (
         organization_id, title, description, source_type, source_id, vulnerability_id, control_id,
         owner_id, status, priority, due_date, remediation_plan, risk_acceptance_expires_at, created_by,
         resources_required, scheduled_completion_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         -- Default the original commitment to the first due_date given, so
         -- slippage is measurable even when the caller does not set it. Both
         -- operands are cast explicitly: COALESCE over two untyped parameters
         -- does not resolve against the target column's type.
         COALESCE($16::date, $11::date))
       RETURNING *`,
      [
        orgId,
        title,
        description || null,
        source_type,
        source_id,
        vulnerability_id,
        control_id,
        owner_id,
        status,
        priority,
        parseDate(due_date),
        remediation_plan,
        parseDate(risk_acceptance_expires_at),
        req.user.id,
        typeof req.body.resources_required === 'string' ? req.body.resources_required : null,
        parseDate(req.body.scheduled_completion_date)
      ]
    );

    const item = itemResult.rows[0];

    // Mirror the originating control into the link table so the many-to-many
    // view is complete no matter which path created the item.
    if (control_id) {
      await pool.query(
        `INSERT INTO poam_control_links (organization_id, poam_item_id, control_id, notes, created_by)
         VALUES ($1, $2, $3, 'Originating control', $4)
         ON CONFLICT ON CONSTRAINT poam_control_links_unique DO NOTHING`,
        [orgId, item.id, control_id, req.user.id]
      );
    }

    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, NULL, $4, $5)`,
      [orgId, item.id, 'POA&M item created', item.status, req.user.id]
    );

    await auditService.logFromRequest(req, {
      eventType: 'poam_item_created',
      resourceType: 'poam',
      resourceId: item.id,
      details: { title: item.title, source_type: item.source_type, priority: item.priority }
    });

    await emitPoamEvent(orgId, req.user.id, 'poam.item.created', {
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority
    });

    // Notify org admins of new POA&M item
    await createNotification(
      orgId,
      null, // broadcast
      'system',
      'New POA&M Item Created',
      `"${item.title}" (${item.priority} priority) has been added to your POA&M.`,
      `/dashboard/poam/${item.id}`
    );

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    log('error', 'poam.create_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to create POA&M item' });
  }
});

// POST /api/v1/poam/from-risk/:riskId
// Turn a register entry into remediation work. Mirrors
// from-vulnerability/:vulnerabilityId, and like it takes two path segments so
// it cannot collide with `/:id`.
router.post('/from-risk/:riskId', requirePermission('controls.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const riskId = req.params.riskId;
    const { treatment_id: treatmentId = null, control_id: controlId = null, title, due_date } = req.body || {};

    await client.query('BEGIN');

    const riskResult = await client.query(
      `SELECT id, reference, title, residual_score, treatment_strategy
       FROM risks
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, riskId]
    );
    if (riskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Risk not found' });
    }
    const risk = riskResult.rows[0];

    if (treatmentId) {
      const treatment = await client.query(
        'SELECT id FROM risk_treatments WHERE id = $1 AND organization_id = $2 AND risk_id = $3 LIMIT 1',
        [treatmentId, orgId, riskId]
      );
      if (treatment.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'treatment_id must reference a treatment on this risk' });
      }
    }

    // Residual score is 1-25 (likelihood x impact). Map it onto POA&M priority
    // so a critical risk does not produce a medium-priority remediation.
    const residual = Number(risk.residual_score) || 0;
    const priority = residual >= 20 ? 'critical' : residual >= 12 ? 'high' : residual >= 6 ? 'medium' : 'low';

    const created = await client.query(
      `INSERT INTO poam_items (
         organization_id, title, description, source_type, source_id, control_id,
         treatment_id, status, priority, due_date, created_by,
         scheduled_completion_date
       )
       VALUES ($1, $2, $3, 'risk', $4, $5, $6, 'open', $7, $8::date, $9, $8::date)
       RETURNING *`,
      [
        orgId,
        String(title || `Treat risk ${risk.reference || ''}: ${risk.title}`).trim(),
        `Raised from risk register entry ${risk.reference || risk.id}. Treatment strategy: ${risk.treatment_strategy || 'not set'}.`,
        riskId,
        controlId,
        treatmentId,
        priority,
        parseDate(due_date),
        req.user.id
      ]
    );
    const item = created.rows[0];

    await client.query(
      `INSERT INTO risk_poam_links (organization_id, risk_id, poam_item_id, notes, created_by)
       VALUES ($1, $2, $3, 'Created from risk', $4)
       ON CONFLICT ON CONSTRAINT risk_poam_links_unique DO NOTHING`,
      [orgId, riskId, item.id, req.user.id]
    );

    if (controlId) {
      await client.query(
        `INSERT INTO poam_control_links (organization_id, poam_item_id, control_id, notes, created_by)
         VALUES ($1, $2, $3, 'Originating control', $4)
         ON CONFLICT ON CONSTRAINT poam_control_links_unique DO NOTHING`,
        [orgId, item.id, controlId, req.user.id]
      );
    }

    await client.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, 'open', $4)`,
      [orgId, item.id, `Raised from risk ${risk.reference || risk.id}`, req.user.id]
    );

    await client.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'poam_item_created_from_risk', 'poam', $3, $4::jsonb, true)`,
      [orgId, req.user.id, item.id, JSON.stringify({ risk_id: riskId, treatment_id: treatmentId, priority })]
    );

    await client.query('COMMIT');

    await emitPoamEvent(orgId, req.user.id, 'poam.item.created', {
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority,
      risk_id: riskId
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'poam.create_from_risk_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to create POA&M from risk' });
  } finally {
    client.release();
  }
});

// POST /api/v1/poam/from-vulnerability/:vulnerabilityId
router.post('/from-vulnerability/:vulnerabilityId', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vulnerabilityId = req.params.vulnerabilityId;

    const findingResult = await pool.query(
      `SELECT id, vulnerability_id, title, severity, status, due_date
       FROM vulnerability_findings
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, vulnerabilityId]
    );
    if (findingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability finding not found' });
    }

    const finding = findingResult.rows[0];
    const defaultDue = finding.due_date || dueDateFromSeverity(finding.severity);

    const created = await pool.query(
      `INSERT INTO poam_items (
         organization_id, title, description, source_type, source_id, vulnerability_id,
         status, priority, due_date, created_by
       )
       VALUES (
         $1, $2, $3, 'vulnerability', $4, $4,
         'open', $5, $6, $7
       )
       RETURNING *`,
      [
        orgId,
        `Remediate ${finding.vulnerability_id || 'vulnerability finding'}`,
        finding.title || 'Vulnerability remediation required.',
        finding.id,
        String(finding.severity || '').toLowerCase() === 'critical' ? 'critical' : 'high',
        defaultDue,
        req.user.id
      ]
    );

    const item = created.rows[0];

    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, NULL, $4, $5)`,
      [orgId, item.id, `Auto-created from vulnerability ${finding.vulnerability_id || finding.id}`, item.status, req.user.id]
    );

    await auditService.logFromRequest(req, {
      eventType: 'poam_item_created_from_vulnerability',
      resourceType: 'poam',
      resourceId: item.id,
      details: { vulnerability_id: finding.id, vulnerability_key: finding.vulnerability_id }
    });

    await emitPoamEvent(orgId, req.user.id, 'poam.item.created_from_vulnerability', {
      id: item.id,
      vulnerability_id: finding.id
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    log('error', 'poam.create_from_vulnerability_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to create POA&M from vulnerability' });
  }
});

// PATCH /api/v1/poam/:id
router.patch('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const existingResult = await pool.query(
      `SELECT *
       FROM poam_items
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const existing = existingResult.rows[0];
    const patch = req.body || {};

    const nextStatus = patch.status !== undefined ? String(patch.status) : existing.status;
    const nextPriority = patch.priority !== undefined ? String(patch.priority) : existing.priority;
    if (!ALLOWED_STATUS.includes(nextStatus)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (!ALLOWED_PRIORITY.includes(nextPriority)) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${ALLOWED_PRIORITY.join(', ')}` });
    }

    const closedAt = ['closed', 'risk_accepted'].includes(nextStatus) ? new Date().toISOString() : null;

    const updatedResult = await pool.query(
      `UPDATE poam_items
       SET title = COALESCE($3, title),
           description = COALESCE($4, description),
           owner_id = COALESCE($5, owner_id),
           status = $6,
           priority = $7,
           due_date = COALESCE($8, due_date),
           remediation_plan = COALESCE($9, remediation_plan),
           closure_notes = COALESCE($10, closure_notes),
           risk_acceptance_expires_at = COALESCE($11, risk_acceptance_expires_at),
           resources_required = COALESCE($13, resources_required),
           treatment_id = COALESCE($15::uuid, treatment_id),
           -- Set once: this is the original commitment, and due_date carries the
           -- current target. Overwriting it would erase the slippage federal
           -- POA&M reporting exists to show (issue #569).
           scheduled_completion_date = COALESCE(scheduled_completion_date, $14::date),
           closed_at = CASE WHEN $6 IN ('closed','risk_accepted') THEN COALESCE(closed_at, $12::timestamp) ELSE NULL END,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        patch.title || null,
        patch.description || null,
        patch.owner_id || null,
        nextStatus,
        nextPriority,
        parseDate(patch.due_date),
        patch.remediation_plan || null,
        patch.closure_notes || null,
        parseDate(patch.risk_acceptance_expires_at),
        closedAt,
        typeof patch.resources_required === 'string' ? patch.resources_required : null,
        parseDate(patch.scheduled_completion_date),
        patch.treatment_id || null
      ]
    );

    const updated = updatedResult.rows[0];

    if (existing.status !== updated.status) {
      await pool.query(
        `INSERT INTO poam_item_updates (
           organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
         )
         VALUES ($1, $2, 'status_change', $3, $4, $5, $6)`,
        [orgId, id, patch.note || 'Status updated', existing.status, updated.status, req.user.id]
      );
    } else if (patch.note) {
      await pool.query(
        `INSERT INTO poam_item_updates (
           organization_id, poam_item_id, update_type, note, changed_by
         )
         VALUES ($1, $2, 'note', $3, $4)`,
        [orgId, id, patch.note, req.user.id]
      );
    }

    await auditService.logFromRequest(req, {
      eventType: 'poam_item_updated',
      resourceType: 'poam',
      resourceId: id,
      details: { old_status: existing.status, new_status: updated.status, priority: updated.priority }
    });

    await emitPoamEvent(orgId, req.user.id, 'poam.item.updated', {
      id: updated.id,
      old_status: existing.status,
      new_status: updated.status
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    log('error', 'poam.update_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to update POA&M item' });
  }
});

// POST /api/v1/poam/:id/updates
router.post('/:id/updates', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const note = String(req.body?.note || '').trim();
    if (!note) {
      return res.status(400).json({ success: false, error: 'note is required' });
    }

    const exists = await pool.query(
      `SELECT id
       FROM poam_items
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (exists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const inserted = await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, changed_by
       )
       VALUES ($1, $2, 'note', $3, $4)
       RETURNING *`,
      [orgId, id, note, req.user.id]
    );

    await auditService.logFromRequest(req, {
      eventType: 'poam_item_note_added',
      resourceType: 'poam',
      resourceId: id,
      details: { note }
    });

    await emitPoamEvent(orgId, req.user.id, 'poam.item.note_added', { id, note });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    log('error', 'poam.add_note_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to add POA&M update note' });
  }
});

// POST /api/v1/poam/:id/submit-for-review
// Submit POA&M for auditor review (typically after control status change from NC to Compliant)
router.post('/:id/submit-for-review', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamId = req.params.id;
    const {
      control_id,
      previous_control_status,
      new_control_status,
      justification,
      supporting_evidence_ids = [],
      framework_specific_type,
      framework_specific_data = {}
    } = req.body || {};

    // Validate POA&M exists
    const poamResult = await pool.query(
      `SELECT id, status, title FROM poam_items WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, poamId]
    );
    if (poamResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const poam = poamResult.rows[0];

    // Validate that POA&M is in appropriate state for submission
    if (!['in_progress', 'pending_review'].includes(poam.status)) {
      return res.status(400).json({
        success: false,
        error: 'POA&M must be in "in_progress" or "pending_review" status to submit for auditor review'
      });
    }

    if (!justification || String(justification).trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Justification is required (minimum 10 characters)'
      });
    }

    // Create framework-specific approval request
    const approvalRequest = await createFrameworkApprovalRequest(
      orgId,
      req.user.id,
      poamId,
      control_id,
      {
        previous_control_status,
        new_control_status,
        justification,
        supporting_evidence_ids,
        framework_specific_type,
        framework_specific_data
      }
    );

    // Update POA&M status
    await pool.query(
      `UPDATE poam_items
       SET status = 'pending_auditor_review',
           review_status = 'pending_auditor_review',
           submitted_for_review_at = NOW(),
           submitted_by = $3,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [orgId, poamId, req.user.id]
    );

    // Add update record
    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, $4, 'pending_auditor_review', $5)`,
      [
        orgId,
        poamId,
        `Submitted for auditor review${framework_specific_type ? ` (${framework_specific_type})` : ''}`,
        poam.status,
        req.user.id
      ]
    );

    // Audit log
    await auditService.logFromRequest(req, {
      eventType: 'poam_submitted_for_review',
      resourceType: 'poam',
      resourceId: poamId,
      details: {
        title: poam.title,
        control_id,
        previous_status: poam.status,
        framework_specific_type,
        justification: justification.substring(0, 200)
      }
    });

    // Emit webhook event
    await emitPoamEvent(orgId, req.user.id, 'poam.submitted_for_review', {
      id: poamId,
      title: poam.title,
      approval_request_id: approvalRequest.id,
      framework_specific_type
    });

    // Notify auditors with audit.read permission
    await createNotification(
      orgId,
      null, // broadcast to auditors
      'system',
      'POA&M Submitted for Review',
      `"${poam.title}" has been submitted for auditor review${framework_specific_type ? ` (${framework_specific_type})` : ''}.`,
      `/dashboard/audit/poam/${poamId}`
    );

    res.status(201).json({
      success: true,
      data: {
        poam_id: poamId,
        approval_request: approvalRequest,
        message: 'POA&M submitted for auditor review successfully'
      }
    });
  } catch (error) {
    log('error', 'poam.submit_for_review_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to submit POA&M for review' });
  }
});

// POST /api/v1/poam/:id/review
// Auditor reviews and approves/rejects POA&M
router.post('/:id/review', requirePermission('audit.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamId = req.params.id;
    const { outcome, comments } = req.body || {};

    if (!outcome || !ALLOWED_REVIEW_OUTCOMES.includes(String(outcome))) {
      return res.status(400).json({
        success: false,
        error: `outcome must be one of: ${ALLOWED_REVIEW_OUTCOMES.join(', ')}`
      });
    }

    if (!comments || String(comments).trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Review comments are required (minimum 10 characters)'
      });
    }

    // Validate POA&M exists and is pending review
    const poamResult = await pool.query(
      `SELECT id, status, title, review_status, submitted_by FROM poam_items
       WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, poamId]
    );
    if (poamResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'POA&M item not found' });
    }

    const poam = poamResult.rows[0];

    if (poam.status !== 'pending_auditor_review') {
      return res.status(400).json({
        success: false,
        error: 'POA&M must be in "pending_auditor_review" status to review'
      });
    }

    // SOD: the user who submitted the POA&M cannot be the reviewer
    const sodError = requireSod(poam.submitted_by, req.user.id, 'submitter', 'auditor reviewer', req.user.permissions || []);
    if (sodError) {
      return res.status(403).json({ success: false, error: sodError });
    }

    // Determine new status based on outcome
    let newStatus = poam.status;
    let newReviewStatus = outcome;

    if (outcome === 'approved') {
      newStatus = 'auditor_approved';
      newReviewStatus = 'auditor_approved';
    } else if (outcome === 'rejected') {
      newStatus = 'auditor_rejected';
      newReviewStatus = 'auditor_rejected';
    } else if (outcome === 'changes_requested') {
      newStatus = 'in_progress';
      newReviewStatus = 'changes_requested';
    }

    // Update POA&M with review
    await pool.query(
      `UPDATE poam_items
       SET status = $3,
           review_status = $4,
           reviewed_at = NOW(),
           reviewed_by = $5,
           review_notes = $6,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [orgId, poamId, newStatus, newReviewStatus, req.user.id, comments]
    );

    // Update approval request
    await pool.query(
      `UPDATE poam_approval_requests
       SET reviewed_by = $3,
           reviewed_at = NOW(),
           review_outcome = $4,
           review_comments = $5,
           updated_at = NOW()
       WHERE organization_id = $1 AND poam_item_id = $2
         AND reviewed_at IS NULL
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [orgId, poamId, req.user.id, outcome, comments]
    );

    // Add update record
    await pool.query(
      `INSERT INTO poam_item_updates (
         organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
       )
       VALUES ($1, $2, 'status_change', $3, $4, $5, $6)`,
      [
        orgId,
        poamId,
        `Auditor review: ${outcome} - ${comments}`,
        poam.status,
        newStatus,
        req.user.id
      ]
    );

    // Audit log
    await auditService.logFromRequest(req, {
      eventType: 'poam_auditor_reviewed',
      resourceType: 'poam',
      resourceId: poamId,
      details: {
        title: poam.title,
        outcome,
        comments: comments.substring(0, 200)
      }
    });

    // Emit webhook event
    await emitPoamEvent(orgId, req.user.id, 'poam.auditor_reviewed', {
      id: poamId,
      title: poam.title,
      outcome
    });

    // Notify submitter
    const submitterResult = await pool.query(
      `SELECT submitted_by FROM poam_items WHERE id = $1 AND organization_id = $2`,
      [poamId, orgId]
    );
    if (submitterResult.rows.length > 0 && submitterResult.rows[0].submitted_by) {
      await createNotification(
        orgId,
        submitterResult.rows[0].submitted_by,
        'system',
        `POA&M Review ${outcome === 'approved' ? 'Approved' : outcome === 'rejected' ? 'Rejected' : 'Requires Changes'}`,
        `"${poam.title}" has been reviewed by an auditor. Status: ${outcome}`,
        `/dashboard/operations/poam/${poamId}`
      );
    }

    res.json({
      success: true,
      data: {
        poam_id: poamId,
        outcome,
        new_status: newStatus,
        message: `POA&M ${outcome} successfully`
      }
    });
  } catch (error) {
    log('error', 'poam.review_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to review POA&M' });
  }
});

// GET /api/v1/poam/:id/approval-history
// Get approval request history for a POA&M
router.get('/:id/approval-history', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const poamId = req.params.id;

    const approvalHistory = await pool.query(
      `SELECT 
         par.*,
         fc.control_id AS control_code,
         fc.title AS control_title,
         submitter.email AS submitted_by_email,
         reviewer.email AS reviewed_by_email
       FROM poam_approval_requests par
       LEFT JOIN framework_controls fc ON fc.id = par.control_id
       LEFT JOIN users submitter ON submitter.id = par.submitted_by
       LEFT JOIN users reviewer ON reviewer.id = par.reviewed_by
       WHERE par.organization_id = $1 AND par.poam_item_id = $2
       ORDER BY par.submitted_at DESC`,
      [orgId, poamId]
    );

    res.json({
      success: true,
      data: approvalHistory.rows
    });
  } catch (error) {
    log('error', 'poam.approval_history_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch approval history' });
  }
});

// GET /api/v1/poam/auditor-guidance/:frameworkCode/:typeCode
// Get auditor guidance for a specific framework type
router.get('/auditor-guidance/:frameworkCode/:typeCode', requirePermission('audit.read'), async (req, res) => {
  try {
    const { frameworkCode, typeCode } = req.params;

    const guidance = getAuditorGuidance(frameworkCode, typeCode);
    
    if (!guidance) {
      return res.status(404).json({
        success: false,
        error: 'Framework type not found or guidance not available'
      });
    }

    res.json({
      success: true,
      data: guidance
    });
  } catch (error) {
    log('error', 'poam.auditor_guidance_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch auditor guidance' });
  }
});

// GET /api/v1/poam/approval-request/:id/context
// Get approval request with full framework context
router.get('/approval-request/:id/context', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const approvalRequestId = req.params.id;

    const request = await getApprovalRequestWithContext(approvalRequestId, orgId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Approval request not found'
      });
    }

    // Get auditor guidance if framework-specific type
    if (request.framework_code && request.framework_specific_type) {
      request.auditor_guidance = getAuditorGuidance(
        request.framework_code,
        request.framework_specific_type
      );
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    log('error', 'poam.approval_request_context_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch approval request context' });
  }
});

module.exports = router;
