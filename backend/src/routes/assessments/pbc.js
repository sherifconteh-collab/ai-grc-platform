// @tier: community
/**
 * PBC (Prepared by Client) requests for an engagement: auto-create from
 * procedures, AI draft, list, create, and update.
 *
 * Extracted verbatim from routes/assessments.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/assessments.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const llm = require('../../services/llmService');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');
const {
  VALID_PBC_PRIORITIES,
  VALID_PBC_STATUSES,
  toInt,
  normalizeNullableText,
  normalizeAiResponseToText,
  extractJsonObject,
  renderTemplate,
  getDefaultAuditTemplate,
  assertEngagementAccess,
  assertEngagementChildAccess,
  ensureOrgUser,
  resolveEngagementFrameworkCodes,
  assertProcedureAllowedForEngagement,
  logAuditEvent,
} = require('./_shared');

// ============================================================
// POST /api/v1/assessments/engagements/:id/pbc/auto-create
// Auto-create procedure-linked PBC requests from selected procedures
// ============================================================
router.post('/engagements/:id/pbc/auto-create', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const {
      procedure_ids = [],
      due_date = null,
      priority = 'medium',
      status = 'open',
      request_context = null
    } = req.body || {};

    const normalizedProcedureIds = Array.from(
      new Set((Array.isArray(procedure_ids) ? procedure_ids : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))
    );
    if (normalizedProcedureIds.length === 0) {
      return res.status(400).json({ success: false, error: 'procedure_ids must include at least one procedure id' });
    }
    if (normalizedProcedureIds.length > 50) {
      return res.status(400).json({ success: false, error: 'procedure_ids max length is 50' });
    }
    if (!VALID_PBC_PRIORITIES.includes(String(priority))) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${VALID_PBC_PRIORITIES.join(', ')}` });
    }
    if (!VALID_PBC_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_PBC_STATUSES.join(', ')}` });
    }

    const frameworkCodes = await resolveEngagementFrameworkCodes(req.user.organization_id, engagement);
    const procedureRows = await pool.query(
      `SELECT
        ap.id,
        ap.procedure_id,
        ap.procedure_type,
        ap.title,
        ap.description,
        ap.expected_evidence,
        fc.control_id,
        fc.title AS control_title,
        f.code AS framework_code
      FROM assessment_procedures ap
      JOIN framework_controls fc ON fc.id = ap.framework_control_id
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE ap.id = ANY($1::uuid[])`,
      [normalizedProcedureIds]
    );

    if (procedureRows.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No matching procedures found' });
    }

    if (frameworkCodes.length > 0) {
      const outsideScope = procedureRows.rows.find((row) => !frameworkCodes.includes(String(row.framework_code)));
      if (outsideScope) {
        return res.status(400).json({
          success: false,
          error: `Procedure ${outsideScope.procedure_id || outsideScope.id} is outside engagement framework scope`
        });
      }
    }

    const existingRows = await pool.query(
      `SELECT assessment_procedure_id
       FROM audit_pbc_requests
       WHERE organization_id = $1
         AND engagement_id = $2
         AND assessment_procedure_id = ANY($3::uuid[])
         AND status IN ('open', 'in_progress', 'submitted', 'accepted')`,
      [req.user.organization_id, engagement.id, normalizedProcedureIds]
    );
    const existingSet = new Set(existingRows.rows.map((row) => String(row.assessment_procedure_id)));
    const pbcTemplate = await getDefaultAuditTemplate(req.user.organization_id, req.user.id, 'pbc');

    const created = [];
    const skipped = [];
    for (const procedure of procedureRows.rows) {
      if (existingSet.has(String(procedure.id))) {
        skipped.push({
          procedure_id: procedure.id,
          reason: 'active_pbc_already_exists'
        });
        continue;
      }

      const title = `[${procedure.control_id}] ${procedure.title}`.slice(0, 255);
      const defaultDetails = [
        `Assessment Procedure: ${procedure.procedure_id || procedure.id}`,
        `Framework: ${String(procedure.framework_code || '').toUpperCase()}`,
        `Control: ${procedure.control_id} - ${procedure.control_title}`,
        `Procedure Type: ${procedure.procedure_type}`,
        '',
        'Requested Evidence',
        procedure.expected_evidence || 'Provide artifacts and screenshots demonstrating control design and operating effectiveness.',
        '',
        'Procedure Context',
        procedure.description || 'No additional description provided.',
        request_context ? `\nAuditor Context\n${String(request_context).trim()}` : null
      ].filter(Boolean).join('\n');
      const details = pbcTemplate
        ? renderTemplate(pbcTemplate.template_content, {
            procedure_id: procedure.procedure_id || procedure.id,
            procedure_code: procedure.procedure_id || procedure.id,
            procedure_title: procedure.title || '',
            framework_code: String(procedure.framework_code || '').toUpperCase(),
            control_id: procedure.control_id || '',
            control_title: procedure.control_title || '',
            procedure_type: procedure.procedure_type || '',
            expected_evidence: procedure.expected_evidence || '',
            procedure_description: procedure.description || '',
            request_context: request_context ? String(request_context).trim() : '',
            due_date: due_date || '',
            priority: String(priority)
          }) || defaultDetails
        : defaultDetails;

      const inserted = await pool.query(
        `INSERT INTO audit_pbc_requests (
           organization_id, engagement_id, title, request_details, priority, status,
           due_date, assigned_to, response_notes, created_by, assessment_procedure_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9)
         RETURNING *`,
        [
          req.user.organization_id,
          engagement.id,
          title,
          details,
          String(priority),
          String(status),
          due_date || null,
          req.user.id,
          procedure.id
        ]
      );
      created.push(inserted.rows[0]);
    }

    await logAuditEvent(req, 'audit_pbc_auto_created', 'audit_engagement', engagement.id, {
      requested_count: normalizedProcedureIds.length,
      created_count: created.length,
      skipped_count: skipped.length
    });

    res.status(201).json({
      success: true,
      data: {
        created,
        skipped,
        summary: {
          requested: normalizedProcedureIds.length,
          created: created.length,
          skipped: skipped.length
        }
      }
    });
  } catch (error) {
    log('error', 'auto_create_engagement_pbc_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to auto-create PBC requests' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements/:id/pbc/ai-draft
// AI-generate a PBC draft and optionally persist
// ============================================================
router.post(
  '/engagements/:id/pbc/ai-draft',
  requirePermission('assessments.write'),
  requirePermission('ai.use'),
  async (req, res) => {
    try {
      const engagement = await assertEngagementAccess(req, res);
      if (!engagement) return;

      const {
        assessment_procedure_id = null,
        request_context = null,
        due_date = null,
        priority = 'medium',
        provider = null,
        model = null,
        persist_draft = false
      } = req.body || {};

      if (!VALID_PBC_PRIORITIES.includes(String(priority))) {
        return res.status(400).json({ success: false, error: `priority must be one of: ${VALID_PBC_PRIORITIES.join(', ')}` });
      }

      const procedureCheck = await assertProcedureAllowedForEngagement(
        req.user.organization_id,
        engagement,
        assessment_procedure_id
      );
      if (procedureCheck.error) {
        return res.status(procedureCheck.error.status).json({ success: false, error: procedureCheck.error.message });
      }

      const resolvedRequestContext = normalizeNullableText(request_context)
        || normalizeNullableText(procedureCheck.procedure?.description)
        || normalizeNullableText(procedureCheck.procedure?.title);
      if (!resolvedRequestContext) {
        return res.status(400).json({
          success: false,
          error: 'request_context is required when no assessment_procedure_id with context is provided'
        });
      }

      const pbcTemplate = await getDefaultAuditTemplate(req.user.organization_id, req.user.id, 'pbc');
      const templateStandard = pbcTemplate
        ? renderTemplate(pbcTemplate.template_content, {
            procedure_id: procedureCheck.procedure?.procedure_id || '',
            procedure_title: procedureCheck.procedure?.title || '',
            framework_code: String(procedureCheck.procedure?.framework_code || '').toUpperCase(),
            control_id: procedureCheck.procedure?.control_id || '',
            control_title: procedureCheck.procedure?.control_title || '',
            expected_evidence: procedureCheck.procedure?.expected_evidence || '',
            request_context: resolvedRequestContext,
            due_date: due_date || '',
            priority: String(priority)
          })
        : null;

      const aiResult = await llm.generateAuditPbcDraft({
        organizationId: req.user.organization_id,
        provider: provider || undefined,
        model: model || undefined,
        requestContext: resolvedRequestContext,
        controlId: procedureCheck.derivedControlId || undefined,
        frameworkCode: procedureCheck.procedure?.framework_code || undefined,
        dueDate: due_date || undefined,
        priority: String(priority),
        templateStandard: templateStandard || undefined
      });
      await llm.logAIUsage(
        req.user.organization_id,
        req.user.id,
        'audit_pbc_draft',
        provider || 'default',
        model || null
      ).catch(() => {});

      const rawText = normalizeAiResponseToText(aiResult);
      const parsed = extractJsonObject(rawText) || {};
      const draft = {
        title: normalizeNullableText(parsed.title)
          || `[${procedureCheck.procedure?.control_id || 'Control'}] Evidence Request`.slice(0, 255),
        request_details: normalizeNullableText(parsed.request_details) || resolvedRequestContext,
        priority: VALID_PBC_PRIORITIES.includes(String(parsed.priority || '').toLowerCase())
          ? String(parsed.priority).toLowerCase()
          : String(priority),
        due_date: normalizeNullableText(parsed.suggested_due_date) || due_date || null,
        raw_ai_text: rawText
      };

      let persistedPbc = null;
      if (persist_draft) {
        const inserted = await pool.query(
          `INSERT INTO audit_pbc_requests (
             organization_id, engagement_id, title, request_details, priority, status,
             due_date, assigned_to, response_notes, created_by, assessment_procedure_id
           )
           VALUES ($1, $2, $3, $4, $5, 'open', $6, NULL, NULL, $7, $8)
           RETURNING *`,
          [
            req.user.organization_id,
            engagement.id,
            draft.title,
            draft.request_details,
            draft.priority,
            draft.due_date || null,
            req.user.id,
            procedureCheck.procedure ? procedureCheck.procedure.id : null
          ]
        );
        persistedPbc = inserted.rows[0];
      }

      await logAuditEvent(req, 'audit_pbc_ai_drafted', 'audit_engagement', engagement.id, {
        persisted: Boolean(persistedPbc),
        assessment_procedure_id: procedureCheck.procedure?.id || null
      });

      res.json({
        success: true,
        data: {
          draft,
          persisted_pbc: persistedPbc
        }
      });
    } catch (error) {
      log('error', 'ai_pbc_draft_error', { error: error?.message || String(error) });
      res.status(500).json({ success: false, error: 'Failed to generate AI PBC draft' });
    }
  }
);

// ============================================================
// GET /api/v1/assessments/engagements/:id/pbc
// List PBC requests for an engagement
// ============================================================
router.get('/engagements/:id/pbc', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const { status, priority, limit = 100, offset = 0 } = req.query;
    let query = `
      SELECT p.*,
        CONCAT(assign.first_name, ' ', assign.last_name) AS assigned_to_name,
        CONCAT(creator.first_name, ' ', creator.last_name) AS created_by_name,
        ap.procedure_id AS assessment_procedure_code,
        ap.title AS assessment_procedure_title,
        fc.control_id AS assessment_control_id,
        f.code AS assessment_framework_code
      FROM audit_pbc_requests p
      LEFT JOIN users assign ON assign.id = p.assigned_to
      LEFT JOIN users creator ON creator.id = p.created_by
      LEFT JOIN assessment_procedures ap ON ap.id = p.assessment_procedure_id
      LEFT JOIN framework_controls fc ON fc.id = ap.framework_control_id
      LEFT JOIN frameworks f ON f.id = fc.framework_id
      WHERE p.organization_id = $1 AND p.engagement_id = $2
    `;
    const params = [req.user.organization_id, engagement.id];
    let idx = 3;

    if (status) {
      query += ` AND p.status = $${idx++}`;
      params.push(String(status));
    }
    if (priority) {
      query += ` AND p.priority = $${idx++}`;
      params.push(String(priority));
    }

    query += ` ORDER BY p.due_date NULLS LAST, p.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(toInt(limit, 100), toInt(offset, 0));

    const rows = await pool.query(query, params);
    res.json({ success: true, data: rows.rows });
  } catch (error) {
    log('error', 'list_engagement_pbc_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list PBC requests' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements/:id/pbc
// Create PBC request
// ============================================================
router.post('/engagements/:id/pbc', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const {
      title,
      request_details,
      priority = 'medium',
      status = 'open',
      due_date = null,
      assigned_to = null,
      response_notes = null,
      assessment_procedure_id = null
    } = req.body || {};

    if (!title || !request_details) {
      return res.status(400).json({ success: false, error: 'title and request_details are required' });
    }
    if (!VALID_PBC_PRIORITIES.includes(String(priority))) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${VALID_PBC_PRIORITIES.join(', ')}` });
    }
    if (!VALID_PBC_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_PBC_STATUSES.join(', ')}` });
    }
    if (assigned_to && !(await ensureOrgUser(req.user.organization_id, assigned_to))) {
      return res.status(400).json({ success: false, error: 'assigned_to must reference an active user in this organization' });
    }
    const procedureCheck = await assertProcedureAllowedForEngagement(
      req.user.organization_id,
      engagement,
      assessment_procedure_id
    );
    if (procedureCheck.error) {
      return res.status(procedureCheck.error.status).json({ success: false, error: procedureCheck.error.message });
    }

    const inserted = await pool.query(
      `INSERT INTO audit_pbc_requests (
         organization_id, engagement_id, title, request_details, priority, status,
         due_date, assigned_to, response_notes, created_by, assessment_procedure_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.user.organization_id,
        engagement.id,
        String(title).trim(),
        String(request_details).trim(),
        String(priority),
        String(status),
        due_date || null,
        assigned_to || null,
        response_notes ? String(response_notes) : null,
        req.user.id,
        procedureCheck.procedure ? procedureCheck.procedure.id : null
      ]
    );

    await logAuditEvent(req, 'audit_pbc_created', 'audit_pbc_request', inserted.rows[0].id, {
      engagement_id: engagement.id,
      priority: inserted.rows[0].priority
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    log('error', 'create_engagement_pbc_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to create PBC request' });
  }
});

// ============================================================
// PATCH /api/v1/assessments/engagements/:id/pbc/:pbcId
// Update PBC request
// ============================================================
router.patch('/engagements/:id/pbc/:pbcId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const access = await assertEngagementChildAccess(req, res, 'audit_pbc_requests', 'pbcId', 'PBC request not found');
    if (!access) return;

    const {
      title,
      request_details,
      priority,
      status,
      due_date,
      assigned_to,
      response_notes,
      assessment_procedure_id
    } = req.body || {};

    if (priority && !VALID_PBC_PRIORITIES.includes(String(priority))) {
      return res.status(400).json({ success: false, error: `priority must be one of: ${VALID_PBC_PRIORITIES.join(', ')}` });
    }
    if (status && !VALID_PBC_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_PBC_STATUSES.join(', ')}` });
    }
    if (assigned_to !== undefined && !(await ensureOrgUser(req.user.organization_id, assigned_to))) {
      return res.status(400).json({ success: false, error: 'assigned_to must reference an active user in this organization' });
    }
    if (assessment_procedure_id !== undefined) {
      const procedureCheck = await assertProcedureAllowedForEngagement(
        req.user.organization_id,
        access.engagement,
        assessment_procedure_id
      );
      if (procedureCheck.error) {
        return res.status(procedureCheck.error.status).json({ success: false, error: procedureCheck.error.message });
      }
    }

    const updates = [];
    const params = [req.user.organization_id, access.engagement.id, access.childId];
    let idx = 4;
    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      params.push(title ? String(title).trim() : null);
    }
    if (request_details !== undefined) {
      updates.push(`request_details = $${idx++}`);
      params.push(request_details ? String(request_details).trim() : null);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      params.push(String(priority));
    }
    if (status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(String(status));
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${idx++}`);
      params.push(due_date || null);
    }
    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${idx++}`);
      params.push(assigned_to || null);
    }
    if (response_notes !== undefined) {
      updates.push(`response_notes = $${idx++}`);
      params.push(response_notes ? String(response_notes) : null);
    }
    if (assessment_procedure_id !== undefined) {
      const procedureCheck = await assertProcedureAllowedForEngagement(
        req.user.organization_id,
        access.engagement,
        assessment_procedure_id
      );
      updates.push(`assessment_procedure_id = $${idx++}`);
      params.push(procedureCheck.procedure ? procedureCheck.procedure.id : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    if (status && ['accepted', 'rejected', 'closed'].includes(String(status))) {
      updates.push(`resolved_at = NOW()`);
    }
    updates.push(`updated_at = NOW()`);

    const updated = await pool.query(
      `UPDATE audit_pbc_requests
       SET ${updates.join(', ')}
       WHERE organization_id = $1 AND engagement_id = $2 AND id = $3
       RETURNING *`,
      params
    );

    await logAuditEvent(req, 'audit_pbc_updated', 'audit_pbc_request', access.childId, {
      engagement_id: access.engagement.id,
      updated_fields: Object.keys(req.body || {})
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    log('error', 'update_engagement_pbc_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to update PBC request' });
  }
});

module.exports = router;
