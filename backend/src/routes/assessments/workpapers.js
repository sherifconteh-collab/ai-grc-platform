// @tier: community
/**
 * Audit workpapers for an engagement: AI draft, list, create, and update
 * (including preparer/reviewer separation-of-duties checks).
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
const { requireSod } = require('../../middleware/sod');
const { log } = require('../../utils/logger');
const {
  VALID_WORKPAPER_STATUSES,
  toInt,
  normalizeNullableText,
  normalizeAiResponseToText,
  extractJsonObject,
  renderTemplate,
  getDefaultAuditTemplate,
  assertEngagementAccess,
  assertEngagementChildAccess,
  ensureOrgUser,
  assertProcedureAllowedForEngagement,
  logAuditEvent,
} = require('./_shared');

// ============================================================
// POST /api/v1/assessments/engagements/:id/workpapers/ai-draft
// AI-generate a workpaper draft from auditor inputs/procedure context
// ============================================================
router.post(
  '/engagements/:id/workpapers/ai-draft',
  requirePermission('assessments.write'),
  requirePermission('ai.use'),
  async (req, res) => {
    try {
      const engagement = await assertEngagementAccess(req, res);
      if (!engagement) return;

      const {
        assessment_procedure_id = null,
        control_id = null,
        objective = null,
        procedure_performed = null,
        evidence_summary = null,
        test_outcome = null,
        provider = null,
        model = null,
        persist_draft = false
      } = req.body || {};

      const procedureCheck = await assertProcedureAllowedForEngagement(
        req.user.organization_id,
        engagement,
        assessment_procedure_id
      );
      if (procedureCheck.error) {
        return res.status(procedureCheck.error.status).json({ success: false, error: procedureCheck.error.message });
      }
      const resolvedControlId = control_id || procedureCheck.derivedControlId || null;
      const resolvedObjective = normalizeNullableText(objective)
        || normalizeNullableText(procedureCheck.procedure?.title)
        || 'Assess control design and operating effectiveness';

      if (!resolvedObjective) {
        return res.status(400).json({ success: false, error: 'objective is required when no assessment_procedure_id is provided' });
      }

      const workpaperTemplate = await getDefaultAuditTemplate(req.user.organization_id, req.user.id, 'workpaper');
      const templateStandard = workpaperTemplate
        ? renderTemplate(workpaperTemplate.template_content, {
            control_id: procedureCheck.procedure?.control_id || '',
            control_title: procedureCheck.procedure?.control_title || '',
            procedure_id: procedureCheck.procedure?.procedure_id || '',
            procedure_title: procedureCheck.procedure?.title || '',
            objective: resolvedObjective,
            procedure_performed: normalizeNullableText(procedure_performed) || '',
            evidence_summary: normalizeNullableText(evidence_summary) || '',
            test_outcome: normalizeNullableText(test_outcome) || ''
          })
        : null;

      const aiResult = await llm.generateAuditWorkpaperDraft({
        organizationId: req.user.organization_id,
        provider: provider || undefined,
        model: model || undefined,
        controlId: resolvedControlId || undefined,
        objective: resolvedObjective,
        procedurePerformed: normalizeNullableText(procedure_performed) || undefined,
        evidenceSummary: normalizeNullableText(evidence_summary) || undefined,
        testOutcome: normalizeNullableText(test_outcome) || undefined,
        templateStandard: templateStandard || undefined
      });
      await llm.logAIUsage(
        req.user.organization_id,
        req.user.id,
        'audit_workpaper_draft',
        provider || 'default',
        model || null
      ).catch(() => {});

      const rawText = normalizeAiResponseToText(aiResult);
      const parsed = extractJsonObject(rawText) || {};

      const draft = {
        title: normalizeNullableText(parsed.title)
          || `[${procedureCheck.procedure?.control_id || 'Control'}] ${resolvedObjective}`.slice(0, 255),
        objective: normalizeNullableText(parsed.objective) || resolvedObjective,
        procedure_performed: normalizeNullableText(parsed.procedure_performed) || normalizeNullableText(procedure_performed),
        conclusion: normalizeNullableText(parsed.conclusion),
        status_recommendation: VALID_WORKPAPER_STATUSES.includes(String(parsed.status_recommendation))
          ? String(parsed.status_recommendation)
          : 'draft',
        raw_ai_text: rawText
      };

      let persistedWorkpaper = null;
      if (persist_draft) {
        const inserted = await pool.query(
          `INSERT INTO audit_workpapers (
             organization_id, engagement_id, control_id, assessment_procedure_id, title,
             objective, procedure_performed, conclusion, status, prepared_by, prepared_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           RETURNING *`,
          [
            req.user.organization_id,
            engagement.id,
            resolvedControlId,
            procedureCheck.procedure ? procedureCheck.procedure.id : null,
            draft.title,
            draft.objective,
            draft.procedure_performed,
            draft.conclusion,
            'draft',
            req.user.id
          ]
        );
        persistedWorkpaper = inserted.rows[0];
      }

      await logAuditEvent(req, 'audit_workpaper_ai_drafted', 'audit_engagement', engagement.id, {
        persisted: Boolean(persistedWorkpaper),
        assessment_procedure_id: procedureCheck.procedure?.id || null
      });

      res.json({
        success: true,
        data: {
          draft,
          persisted_workpaper: persistedWorkpaper
        }
      });
    } catch (error) {
      log('error', 'ai_workpaper_draft_error', { error: error?.message || String(error) });
      res.status(500).json({ success: false, error: 'Failed to generate AI workpaper draft' });
    }
  }
);

// ============================================================
// GET /api/v1/assessments/engagements/:id/workpapers
// List workpapers for an engagement
// ============================================================
router.get('/engagements/:id/workpapers', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const { status, limit = 100, offset = 0 } = req.query;
    let query = `
      SELECT w.*,
        fc.control_id AS control_ref,
        ap.procedure_id AS assessment_procedure_code,
        ap.title AS assessment_procedure_title,
        CONCAT(prep.first_name, ' ', prep.last_name) AS prepared_by_name,
        CONCAT(rev.first_name, ' ', rev.last_name) AS reviewed_by_name
      FROM audit_workpapers w
      LEFT JOIN framework_controls fc ON fc.id = w.control_id
      LEFT JOIN assessment_procedures ap ON ap.id = w.assessment_procedure_id
      LEFT JOIN users prep ON prep.id = w.prepared_by
      LEFT JOIN users rev ON rev.id = w.reviewed_by
      WHERE w.organization_id = $1 AND w.engagement_id = $2
    `;
    const params = [req.user.organization_id, engagement.id];
    let idx = 3;
    if (status) {
      query += ` AND w.status = $${idx++}`;
      params.push(String(status));
    }
    query += ` ORDER BY w.updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(toInt(limit, 100), toInt(offset, 0));

    const rows = await pool.query(query, params);
    res.json({ success: true, data: rows.rows });
  } catch (error) {
    log('error', 'list_engagement_workpapers_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list workpapers' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements/:id/workpapers
// Create workpaper
// ============================================================
router.post('/engagements/:id/workpapers', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const {
      control_id = null,
      assessment_procedure_id = null,
      title,
      objective = null,
      procedure_performed = null,
      conclusion = null,
      status = 'draft',
      prepared_by = null,
      reviewed_by = null,
      reviewer_notes = null
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (!VALID_WORKPAPER_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_WORKPAPER_STATUSES.join(', ')}` });
    }
    if (prepared_by && !(await ensureOrgUser(req.user.organization_id, prepared_by))) {
      return res.status(400).json({ success: false, error: 'prepared_by must reference an active user in this organization' });
    }
    if (reviewed_by && !(await ensureOrgUser(req.user.organization_id, reviewed_by))) {
      return res.status(400).json({ success: false, error: 'reviewed_by must reference an active user in this organization' });
    }
    // SOD: the workpaper preparer cannot also be the reviewer.
    // The insert defaults prepared_by to req.user.id when omitted, so always
    // resolve the effective value before comparing to prevent bypass.
    if (reviewed_by) {
      const effectivePreparedBy = prepared_by || req.user.id;
      const sodError = requireSod(effectivePreparedBy, reviewed_by, 'preparer', 'reviewer', req.user.permissions || []);
      if (sodError) {
        return res.status(403).json({ success: false, error: sodError });
      }
    }
    const procedureCheck = await assertProcedureAllowedForEngagement(
      req.user.organization_id,
      engagement,
      assessment_procedure_id
    );
    if (procedureCheck.error) {
      return res.status(procedureCheck.error.status).json({ success: false, error: procedureCheck.error.message });
    }
    const resolvedControlId = control_id || procedureCheck.derivedControlId || null;

    const inserted = await pool.query(
      `INSERT INTO audit_workpapers (
         organization_id, engagement_id, control_id, assessment_procedure_id, title, objective, procedure_performed, conclusion,
         status, prepared_by, reviewed_by, reviewer_notes, prepared_at, reviewed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
       RETURNING *`,
      [
        req.user.organization_id,
        engagement.id,
        resolvedControlId,
        procedureCheck.procedure ? procedureCheck.procedure.id : null,
        String(title).trim(),
        objective ? String(objective) : null,
        procedure_performed ? String(procedure_performed) : null,
        conclusion ? String(conclusion) : null,
        String(status),
        prepared_by || req.user.id,
        reviewed_by || null,
        reviewer_notes ? String(reviewer_notes) : null,
        String(status) === 'finalized' ? new Date().toISOString() : null
      ]
    );

    await logAuditEvent(req, 'audit_workpaper_created', 'audit_workpaper', inserted.rows[0].id, {
      engagement_id: engagement.id,
      status: inserted.rows[0].status
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    log('error', 'create_engagement_workpaper_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to create workpaper' });
  }
});

// ============================================================
// PATCH /api/v1/assessments/engagements/:id/workpapers/:workpaperId
// Update workpaper
// ============================================================
router.patch('/engagements/:id/workpapers/:workpaperId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const access = await assertEngagementChildAccess(req, res, 'audit_workpapers', 'workpaperId', 'Workpaper not found');
    if (!access) return;

    const {
      control_id,
      assessment_procedure_id,
      title,
      objective,
      procedure_performed,
      conclusion,
      status,
      prepared_by,
      reviewed_by,
      reviewer_notes
    } = req.body || {};

    if (status && !VALID_WORKPAPER_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_WORKPAPER_STATUSES.join(', ')}` });
    }
    if (prepared_by !== undefined && !(await ensureOrgUser(req.user.organization_id, prepared_by))) {
      return res.status(400).json({ success: false, error: 'prepared_by must reference an active user in this organization' });
    }
    if (reviewed_by !== undefined && !(await ensureOrgUser(req.user.organization_id, reviewed_by))) {
      return res.status(400).json({ success: false, error: 'reviewed_by must reference an active user in this organization' });
    }
    // SOD: the workpaper preparer cannot also be the reviewer.
    // When reviewed_by is being set, resolve the effective prepared_by (body → DB fallback).
    if (reviewed_by !== undefined && reviewed_by !== null) {
      let effectivePreparedBy = prepared_by !== undefined ? prepared_by : null;
      if (effectivePreparedBy === null) {
        const existing = await pool.query(
          'SELECT prepared_by FROM audit_workpapers WHERE id = $1 AND organization_id = $2 LIMIT 1',
          [access.childId, req.user.organization_id]
        );
        effectivePreparedBy = existing.rows[0]?.prepared_by || null;
      }
      if (effectivePreparedBy) {
        const sodError = requireSod(effectivePreparedBy, reviewed_by, 'preparer', 'reviewer', req.user.permissions || []);
        if (sodError) {
          return res.status(403).json({ success: false, error: sodError });
        }
      }
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
    if (control_id !== undefined) {
      updates.push(`control_id = $${idx++}`);
      params.push(control_id || null);
    }
    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      params.push(title ? String(title).trim() : null);
    }
    if (objective !== undefined) {
      updates.push(`objective = $${idx++}`);
      params.push(objective ? String(objective) : null);
    }
    if (procedure_performed !== undefined) {
      updates.push(`procedure_performed = $${idx++}`);
      params.push(procedure_performed ? String(procedure_performed) : null);
    }
    if (conclusion !== undefined) {
      updates.push(`conclusion = $${idx++}`);
      params.push(conclusion ? String(conclusion) : null);
    }
    if (status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(String(status));
    }
    if (prepared_by !== undefined) {
      updates.push(`prepared_by = $${idx++}`);
      params.push(prepared_by || null);
    }
    if (reviewed_by !== undefined) {
      updates.push(`reviewed_by = $${idx++}`);
      params.push(reviewed_by || null);
    }
    if (reviewer_notes !== undefined) {
      updates.push(`reviewer_notes = $${idx++}`);
      params.push(reviewer_notes ? String(reviewer_notes) : null);
    }
    if (assessment_procedure_id !== undefined) {
      const procedureCheck = await assertProcedureAllowedForEngagement(
        req.user.organization_id,
        access.engagement,
        assessment_procedure_id
      );
      updates.push(`assessment_procedure_id = $${idx++}`);
      params.push(procedureCheck.procedure ? procedureCheck.procedure.id : null);

      if (control_id === undefined && procedureCheck.derivedControlId) {
        updates.push(`control_id = $${idx++}`);
        params.push(procedureCheck.derivedControlId);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    if (status && String(status) === 'finalized') {
      updates.push('reviewed_at = NOW()');
    }
    updates.push('updated_at = NOW()');

    const updated = await pool.query(
      `UPDATE audit_workpapers
       SET ${updates.join(', ')}
       WHERE organization_id = $1 AND engagement_id = $2 AND id = $3
       RETURNING *`,
      params
    );

    await logAuditEvent(req, 'audit_workpaper_updated', 'audit_workpaper', access.childId, {
      engagement_id: access.engagement.id,
      updated_fields: Object.keys(req.body || {})
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    log('error', 'update_engagement_workpaper_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to update workpaper' });
  }
});

module.exports = router;
