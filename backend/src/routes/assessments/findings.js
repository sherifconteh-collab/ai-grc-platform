// @tier: community
/**
 * Audit findings for an engagement: AI draft, list, create, and update.
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
  VALID_FINDING_SEVERITIES,
  VALID_FINDING_STATUSES,
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
// POST /api/v1/assessments/engagements/:id/findings/ai-draft
// AI-generate a finding draft and optionally persist
// ============================================================
router.post(
  '/engagements/:id/findings/ai-draft',
  requirePermission('assessments.write'),
  requirePermission('ai.use'),
  async (req, res) => {
    try {
      const engagement = await assertEngagementAccess(req, res);
      if (!engagement) return;

      const {
        assessment_procedure_id = null,
        related_pbc_request_id = null,
        related_workpaper_id = null,
        issue_summary = null,
        evidence_summary = null,
        severity_hint = null,
        recommendation_scope = null,
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

      const resolvedIssueSummary = normalizeNullableText(issue_summary)
        || normalizeNullableText(procedureCheck.procedure?.description)
        || normalizeNullableText(procedureCheck.procedure?.title);
      if (!resolvedIssueSummary) {
        return res.status(400).json({
          success: false,
          error: 'issue_summary is required when no assessment_procedure_id with context is provided'
        });
      }

      const findingTemplate = await getDefaultAuditTemplate(req.user.organization_id, req.user.id, 'finding');
      const templateStandard = findingTemplate
        ? renderTemplate(findingTemplate.template_content, {
            control_id: procedureCheck.procedure?.control_id || '',
            control_title: procedureCheck.procedure?.control_title || '',
            procedure_id: procedureCheck.procedure?.procedure_id || '',
            issue_summary: resolvedIssueSummary,
            evidence_summary: normalizeNullableText(evidence_summary) || '',
            severity_hint: normalizeNullableText(severity_hint) || '',
            recommendation_scope: normalizeNullableText(recommendation_scope) || ''
          })
        : null;

      const aiResult = await llm.generateAuditFindingDraft({
        organizationId: req.user.organization_id,
        provider: provider || undefined,
        model: model || undefined,
        controlId: procedureCheck.derivedControlId || undefined,
        issueSummary: resolvedIssueSummary,
        evidenceSummary: normalizeNullableText(evidence_summary) || undefined,
        severityHint: normalizeNullableText(severity_hint) || undefined,
        recommendationScope: normalizeNullableText(recommendation_scope) || undefined,
        templateStandard: templateStandard || undefined
      });
      await llm.logAIUsage(
        req.user.organization_id,
        req.user.id,
        'audit_finding_draft',
        provider || 'default',
        model || null
      ).catch(() => {});

      const rawText = normalizeAiResponseToText(aiResult);
      const parsed = extractJsonObject(rawText) || {};

      const severityCandidate = String(parsed.severity || severity_hint || 'medium').toLowerCase();
      const draft = {
        title: normalizeNullableText(parsed.title)
          || `[${procedureCheck.procedure?.control_id || 'Control'}] Observation`.slice(0, 255),
        description: normalizeNullableText(parsed.description) || resolvedIssueSummary,
        severity: VALID_FINDING_SEVERITIES.includes(severityCandidate) ? severityCandidate : 'medium',
        recommendation: normalizeNullableText(parsed.recommendation) || normalizeNullableText(recommendation_scope),
        management_response_prompt: normalizeNullableText(parsed.management_response_prompt),
        raw_ai_text: rawText
      };

      let persistedFinding = null;
      if (persist_draft) {
        const inserted = await pool.query(
          `INSERT INTO audit_findings (
             organization_id, engagement_id, related_pbc_request_id, related_workpaper_id, control_id,
             title, description, severity, status, recommendation, management_response, owner_user_id, due_date, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, NULL, NULL, NULL, $10)
           RETURNING *`,
          [
            req.user.organization_id,
            engagement.id,
            related_pbc_request_id || null,
            related_workpaper_id || null,
            procedureCheck.derivedControlId || null,
            draft.title,
            draft.description,
            draft.severity,
            draft.recommendation || null,
            req.user.id
          ]
        );
        persistedFinding = inserted.rows[0];
      }

      await logAuditEvent(req, 'audit_finding_ai_drafted', 'audit_engagement', engagement.id, {
        persisted: Boolean(persistedFinding),
        assessment_procedure_id: procedureCheck.procedure?.id || null
      });

      res.json({
        success: true,
        data: {
          draft,
          persisted_finding: persistedFinding
        }
      });
    } catch (error) {
      log('error', 'ai_finding_draft_error', { error: error?.message || String(error) });
      res.status(500).json({ success: false, error: 'Failed to generate AI finding draft' });
    }
  }
);

// ============================================================
// GET /api/v1/assessments/engagements/:id/findings
// List findings for an engagement
// ============================================================
router.get('/engagements/:id/findings', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const { status, severity, limit = 100, offset = 0 } = req.query;
    let query = `
      SELECT f.*,
        fc.control_id AS control_ref,
        CONCAT(owner.first_name, ' ', owner.last_name) AS owner_name,
        CONCAT(creator.first_name, ' ', creator.last_name) AS created_by_name
      FROM audit_findings f
      LEFT JOIN framework_controls fc ON fc.id = f.control_id
      LEFT JOIN users owner ON owner.id = f.owner_user_id
      LEFT JOIN users creator ON creator.id = f.created_by
      WHERE f.organization_id = $1 AND f.engagement_id = $2
    `;
    const params = [req.user.organization_id, engagement.id];
    let idx = 3;
    if (status) {
      query += ` AND f.status = $${idx++}`;
      params.push(String(status));
    }
    if (severity) {
      query += ` AND f.severity = $${idx++}`;
      params.push(String(severity));
    }
    query += ` ORDER BY
      CASE f.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      f.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(toInt(limit, 100), toInt(offset, 0));

    const rows = await pool.query(query, params);
    res.json({ success: true, data: rows.rows });
  } catch (error) {
    log('error', 'list_engagement_findings_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list findings' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements/:id/findings
// Create finding
// ============================================================
router.post('/engagements/:id/findings', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const {
      related_pbc_request_id = null,
      related_workpaper_id = null,
      control_id = null,
      title,
      description,
      severity = 'medium',
      status = 'open',
      recommendation = null,
      management_response = null,
      owner_user_id = null,
      due_date = null
    } = req.body || {};

    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'title and description are required' });
    }
    if (!VALID_FINDING_SEVERITIES.includes(String(severity))) {
      return res.status(400).json({ success: false, error: `severity must be one of: ${VALID_FINDING_SEVERITIES.join(', ')}` });
    }
    if (!VALID_FINDING_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_FINDING_STATUSES.join(', ')}` });
    }
    if (owner_user_id && !(await ensureOrgUser(req.user.organization_id, owner_user_id))) {
      return res.status(400).json({ success: false, error: 'owner_user_id must reference an active user in this organization' });
    }

    const inserted = await pool.query(
      `INSERT INTO audit_findings (
         organization_id, engagement_id, related_pbc_request_id, related_workpaper_id, control_id,
         title, description, severity, status, recommendation, management_response,
         owner_user_id, due_date, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        req.user.organization_id,
        engagement.id,
        related_pbc_request_id || null,
        related_workpaper_id || null,
        control_id || null,
        String(title).trim(),
        String(description).trim(),
        String(severity),
        String(status),
        recommendation ? String(recommendation) : null,
        management_response ? String(management_response) : null,
        owner_user_id || null,
        due_date || null,
        req.user.id
      ]
    );

    await logAuditEvent(req, 'audit_finding_created', 'audit_finding', inserted.rows[0].id, {
      engagement_id: engagement.id,
      severity: inserted.rows[0].severity
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    log('error', 'create_engagement_finding_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to create finding' });
  }
});

// ============================================================
// PATCH /api/v1/assessments/engagements/:id/findings/:findingId
// Update finding
// ============================================================
router.patch('/engagements/:id/findings/:findingId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const access = await assertEngagementChildAccess(req, res, 'audit_findings', 'findingId', 'Finding not found');
    if (!access) return;

    const {
      related_pbc_request_id,
      related_workpaper_id,
      control_id,
      title,
      description,
      severity,
      status,
      recommendation,
      management_response,
      owner_user_id,
      due_date
    } = req.body || {};

    if (severity && !VALID_FINDING_SEVERITIES.includes(String(severity))) {
      return res.status(400).json({ success: false, error: `severity must be one of: ${VALID_FINDING_SEVERITIES.join(', ')}` });
    }
    if (status && !VALID_FINDING_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_FINDING_STATUSES.join(', ')}` });
    }
    if (owner_user_id !== undefined && !(await ensureOrgUser(req.user.organization_id, owner_user_id))) {
      return res.status(400).json({ success: false, error: 'owner_user_id must reference an active user in this organization' });
    }

    const updates = [];
    const params = [req.user.organization_id, access.engagement.id, access.childId];
    let idx = 4;
    if (related_pbc_request_id !== undefined) {
      updates.push(`related_pbc_request_id = $${idx++}`);
      params.push(related_pbc_request_id || null);
    }
    if (related_workpaper_id !== undefined) {
      updates.push(`related_workpaper_id = $${idx++}`);
      params.push(related_workpaper_id || null);
    }
    if (control_id !== undefined) {
      updates.push(`control_id = $${idx++}`);
      params.push(control_id || null);
    }
    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      params.push(title ? String(title).trim() : null);
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      params.push(description ? String(description).trim() : null);
    }
    if (severity !== undefined) {
      updates.push(`severity = $${idx++}`);
      params.push(String(severity));
    }
    if (status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(String(status));
    }
    if (recommendation !== undefined) {
      updates.push(`recommendation = $${idx++}`);
      params.push(recommendation ? String(recommendation) : null);
    }
    if (management_response !== undefined) {
      updates.push(`management_response = $${idx++}`);
      params.push(management_response ? String(management_response) : null);
    }
    if (owner_user_id !== undefined) {
      updates.push(`owner_user_id = $${idx++}`);
      params.push(owner_user_id || null);
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${idx++}`);
      params.push(due_date || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    if (status && String(status) === 'closed') {
      updates.push('closed_at = NOW()');
    }
    updates.push('updated_at = NOW()');

    const updated = await pool.query(
      `UPDATE audit_findings
       SET ${updates.join(', ')}
       WHERE organization_id = $1 AND engagement_id = $2 AND id = $3
       RETURNING *`,
      params
    );

    await logAuditEvent(req, 'audit_finding_updated', 'audit_finding', access.childId, {
      engagement_id: access.engagement.id,
      updated_fields: Object.keys(req.body || {})
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    log('error', 'update_engagement_finding_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to update finding' });
  }
});

module.exports = router;
