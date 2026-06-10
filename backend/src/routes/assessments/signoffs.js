// @tier: community
/**
 * Engagement sign-offs, sign-off readiness checklist, and the customer
 * validation package (JSON and PDF).
 *
 * Extracted verbatim from routes/assessments.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/assessments.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');
const {
  VALID_SIGNOFF_TYPES,
  VALID_SIGNOFF_STATUSES,
  normalizeNullableText,
  renderTemplate,
  getDefaultAuditTemplate,
  assertEngagementAccess,
  ensureOrgUser,
  buildValidationChecklist,
  logAuditEvent,
} = require('./_shared');

// ============================================================
// GET /api/v1/assessments/engagements/:id/signoffs
// List engagement sign-offs
// ============================================================
router.get('/engagements/:id/signoffs', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const rows = await pool.query(
      `SELECT s.*,
        CONCAT(u.first_name, ' ', u.last_name) AS signed_by_name
       FROM audit_signoffs s
       LEFT JOIN users u ON u.id = s.signed_by
       WHERE s.organization_id = $1 AND s.engagement_id = $2
       ORDER BY s.signed_at DESC`,
      [req.user.organization_id, engagement.id]
    );

    res.json({ success: true, data: rows.rows });
  } catch (error) {
    log('error', 'list_engagement_signoffs_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list sign-offs' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements/:id/signoffs
// Create engagement sign-off
// ============================================================
router.post('/engagements/:id/signoffs', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const { signoff_type, status = 'approved', comments = null, signed_by = null } = req.body || {};
    if (!signoff_type) {
      return res.status(400).json({ success: false, error: 'signoff_type is required' });
    }
    if (!VALID_SIGNOFF_TYPES.includes(String(signoff_type))) {
      return res.status(400).json({ success: false, error: `signoff_type must be one of: ${VALID_SIGNOFF_TYPES.join(', ')}` });
    }
    if (!VALID_SIGNOFF_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_SIGNOFF_STATUSES.join(', ')}` });
    }
    if (String(signoff_type) === 'auditor_firm_recommendation' && !normalizeNullableText(comments)) {
      return res.status(400).json({
        success: false,
        error: 'comments are required for auditor_firm_recommendation sign-off'
      });
    }
    if (!(await ensureOrgUser(req.user.organization_id, signed_by || req.user.id))) {
      return res.status(400).json({ success: false, error: 'signed_by must reference an active user in this organization' });
    }

    const inserted = await pool.query(
      `INSERT INTO audit_signoffs (
         organization_id, engagement_id, signoff_type, status, comments, signed_by
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.organization_id,
        engagement.id,
        String(signoff_type),
        String(status),
        comments ? String(comments) : null,
        signed_by || req.user.id
      ]
    );

    await logAuditEvent(req, 'audit_signoff_recorded', 'audit_signoff', inserted.rows[0].id, {
      engagement_id: engagement.id,
      signoff_type: inserted.rows[0].signoff_type,
      status: inserted.rows[0].status
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    log('error', 'create_engagement_signoff_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to create sign-off' });
  }
});

// ============================================================
// GET /api/v1/assessments/engagements/:id/signoff-readiness
// Returns checklist of required approvals and completion state
// ============================================================
router.get('/engagements/:id/signoff-readiness', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const [signoffRows, findingsRows, workpaperRows, pbcRows] = await Promise.all([
      pool.query(
        `SELECT s.*, CONCAT(u.first_name, ' ', u.last_name) AS signed_by_name
         FROM audit_signoffs s
         LEFT JOIN users u ON u.id = s.signed_by
         WHERE s.organization_id = $1 AND s.engagement_id = $2
         ORDER BY s.signed_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_findings,
           COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'remediating'))::int AS open_findings
         FROM audit_findings
         WHERE organization_id = $1 AND engagement_id = $2`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_workpapers,
           COUNT(*) FILTER (WHERE status = 'finalized')::int AS finalized_workpapers
         FROM audit_workpapers
         WHERE organization_id = $1 AND engagement_id = $2`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_pbc,
           COUNT(*) FILTER (WHERE status IN ('accepted', 'closed'))::int AS resolved_pbc
         FROM audit_pbc_requests
         WHERE organization_id = $1 AND engagement_id = $2`,
        [req.user.organization_id, engagement.id]
      )
    ]);

    const checklist = buildValidationChecklist(signoffRows.rows);
    const approvalsReady = checklist.every((item) => item.approved);
    const openFindings = findingsRows.rows[0]?.open_findings || 0;
    const readiness = {
      approvals_ready: approvalsReady,
      evidence_ready: (workpaperRows.rows[0]?.finalized_workpapers || 0) > 0,
      findings_resolved: openFindings === 0,
      ready_for_validation_package: approvalsReady && openFindings === 0
    };

    res.json({
      success: true,
      data: {
        checklist,
        readiness,
        metrics: {
          pbc: pbcRows.rows[0] || { total_pbc: 0, resolved_pbc: 0 },
          workpapers: workpaperRows.rows[0] || { total_workpapers: 0, finalized_workpapers: 0 },
          findings: findingsRows.rows[0] || { total_findings: 0, open_findings: 0 }
        }
      }
    });
  } catch (error) {
    log('error', 'signoff_readiness_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to compute sign-off readiness' });
  }
});

// ============================================================
// GET /api/v1/assessments/engagements/:id/validation-package
// JSON payload for customer validation package
// ============================================================
router.get('/engagements/:id/validation-package', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const [engagementRows, pbcRows, workpaperRows, findingsRows, signoffRows, orgRows] = await Promise.all([
      pool.query(
        `SELECT ae.*
         FROM audit_engagements ae
         WHERE ae.organization_id = $1 AND ae.id = $2
         LIMIT 1`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT id, title, status, priority, due_date, assessment_procedure_id, created_at, updated_at
         FROM audit_pbc_requests
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY due_date NULLS LAST, created_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT id, title, status, control_id, assessment_procedure_id, updated_at
         FROM audit_workpapers
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY updated_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT id, title, status, severity, recommendation, management_response, due_date, updated_at
         FROM audit_findings
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY
           CASE severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             ELSE 4
           END,
           created_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT s.*, CONCAT(u.first_name, ' ', u.last_name) AS signed_by_name
         FROM audit_signoffs s
         LEFT JOIN users u ON u.id = s.signed_by
         WHERE s.organization_id = $1 AND s.engagement_id = $2
         ORDER BY s.signed_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT id, name
         FROM organizations
         WHERE id = $1
         LIMIT 1`,
        [req.user.organization_id]
      )
    ]);

    const signoffChecklist = buildValidationChecklist(signoffRows.rows);
    const approvedChecklist = signoffChecklist.every((item) => item.approved);

    const recommendationSignoff = signoffRows.rows.find((row) => (
      String(row.signoff_type) === 'auditor_firm_recommendation'
      && String(row.status) === 'approved'
      && normalizeNullableText(row.comments)
    ));
    const openFindings = findingsRows.rows.filter((row) => ['open', 'accepted', 'remediating'].includes(String(row.status)));
    const finalRecommendation = recommendationSignoff?.comments
      || (openFindings.length === 0
        ? 'No open findings remain. Control testing indicates implementation is operating as expected for assessed scope.'
        : `Open findings remain (${openFindings.length}). Customer should complete remediation and provide updated evidence before final reliance.`);

    const packageData = {
      generated_at: new Date().toISOString(),
      organization: orgRows.rows[0] || { id: req.user.organization_id, name: req.user.organization_name || 'Organization' },
      engagement: engagementRows.rows[0] || engagement,
      pbc_requests: pbcRows.rows,
      workpapers: workpaperRows.rows,
      findings: findingsRows.rows,
      signoffs: signoffRows.rows,
      signoff_checklist: signoffChecklist,
      readiness: {
        approvals_ready: approvedChecklist,
        open_findings: openFindings.length,
        ready_for_customer_validation: approvedChecklist && openFindings.length === 0
      },
      final_recommendation: finalRecommendation
    };

    res.json({ success: true, data: packageData });
  } catch (error) {
    log('error', 'validation_package_build_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to build validation package' });
  }
});

// ============================================================
// GET /api/v1/assessments/engagements/:id/validation-package/pdf
// Download PDF validation package for customer handoff
// ============================================================
router.get('/engagements/:id/validation-package/pdf', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const [packageRes, reportTemplate] = await Promise.all([
      pool.query(
        `SELECT
           ae.name AS engagement_name,
           ae.engagement_type,
           ae.status AS engagement_status,
           ae.scope,
           ae.period_start,
           ae.period_end,
           org.name AS organization_name
         FROM audit_engagements ae
         JOIN organizations org ON org.id = ae.organization_id
         WHERE ae.organization_id = $1 AND ae.id = $2
         LIMIT 1`,
        [req.user.organization_id, engagement.id]
      ),
      getDefaultAuditTemplate(req.user.organization_id, req.user.id, 'engagement_report')
    ]);
    const packageMeta = packageRes.rows[0];
    if (!packageMeta) {
      return res.status(404).json({ success: false, error: 'Engagement not found' });
    }

    const [pbcRows, workpaperRows, findingsRows, signoffRows] = await Promise.all([
      pool.query(
        `SELECT title, status, priority, due_date
         FROM audit_pbc_requests
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY due_date NULLS LAST, created_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT title, status, updated_at
         FROM audit_workpapers
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY updated_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT title, status, severity, recommendation
         FROM audit_findings
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY
           CASE severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             ELSE 4
           END,
           created_at DESC`,
        [req.user.organization_id, engagement.id]
      ),
      pool.query(
        `SELECT s.*, CONCAT(u.first_name, ' ', u.last_name) AS signed_by_name
         FROM audit_signoffs s
         LEFT JOIN users u ON u.id = s.signed_by
         WHERE s.organization_id = $1 AND s.engagement_id = $2
         ORDER BY s.signed_at DESC`,
        [req.user.organization_id, engagement.id]
      )
    ]);

    const checklist = buildValidationChecklist(signoffRows.rows);
    const recommendationSignoff = signoffRows.rows.find((row) => (
      String(row.signoff_type) === 'auditor_firm_recommendation'
      && String(row.status) === 'approved'
      && normalizeNullableText(row.comments)
    ));
    const openFindings = findingsRows.rows.filter((row) => ['open', 'accepted', 'remediating'].includes(String(row.status)));
    const finalRecommendation = recommendationSignoff?.comments
      || (openFindings.length === 0
        ? 'No open findings remain. Control testing indicates implementation is operating as expected for assessed scope.'
        : `Open findings remain (${openFindings.length}). Customer should complete remediation and provide updated evidence before final reliance.`);

    const reportTemplateBody = reportTemplate
      ? renderTemplate(reportTemplate.template_content, {
          organization_name: packageMeta.organization_name,
          engagement_name: packageMeta.engagement_name,
          engagement_type: packageMeta.engagement_type,
          engagement_status: packageMeta.engagement_status,
          open_findings: openFindings.length,
          total_findings: findingsRows.rows.length,
          total_pbc: pbcRows.rows.length,
          finalized_workpapers: workpaperRows.rows.filter((row) => row.status === 'finalized').length,
          final_recommendation: finalRecommendation
        })
      : null;

    const dateTag = new Date().toISOString().split('T')[0];
    const safeEngagementName = String(packageMeta.engagement_name || 'engagement')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'engagement';

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="validation-package-${safeEngagementName}-${dateTag}.pdf"`);
    doc.pipe(res);

    doc.fontSize(26).fillColor('#111827').text('Customer Validation Package', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).fillColor('#4b5563').text(`Generated ${new Date().toLocaleString('en-US')}`);
    doc.moveDown(0.8);

    doc.fontSize(13).fillColor('#111827').text(`Organization: ${packageMeta.organization_name}`);
    doc.fontSize(13).text(`Engagement: ${packageMeta.engagement_name}`);
    doc.fontSize(11).fillColor('#4b5563').text(`Type: ${String(packageMeta.engagement_type || '').replace(/_/g, ' ')}`);
    doc.fontSize(11).text(`Status: ${String(packageMeta.engagement_status || '').replace(/_/g, ' ')}`);
    if (packageMeta.period_start || packageMeta.period_end) {
      doc.fontSize(11).text(`Period: ${packageMeta.period_start || 'N/A'} to ${packageMeta.period_end || 'N/A'}`);
    }
    if (packageMeta.scope) {
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#374151').text(`Scope: ${packageMeta.scope}`);
    }

    doc.moveDown(0.8);
    doc.fontSize(16).fillColor('#111827').text('Sign-off Checklist');
    doc.moveDown(0.3);
    checklist.forEach((item) => {
      const icon = item.approved ? '[x]' : '[ ]';
      const signer = item.latest?.signed_by_name ? ` by ${item.latest.signed_by_name}` : '';
      const signedAt = item.latest?.signed_at ? ` on ${new Date(item.latest.signed_at).toLocaleDateString('en-US')}` : '';
      doc.fontSize(10).fillColor(item.approved ? '#065f46' : '#92400e')
        .text(`${icon} ${item.label}${signer}${signedAt}`);
    });

    doc.moveDown(0.8);
    doc.fontSize(16).fillColor('#111827').text('Evidence & Findings Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#374151').text(`PBC Requests: ${pbcRows.rows.length}`);
    doc.text(`Workpapers: ${workpaperRows.rows.length} (${workpaperRows.rows.filter((row) => row.status === 'finalized').length} finalized)`);
    doc.text(`Findings: ${findingsRows.rows.length} (${openFindings.length} open)`);

    if (findingsRows.rows.length > 0) {
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#111827').text('Top Findings');
      findingsRows.rows.slice(0, 8).forEach((row) => {
        const line = `- [${String(row.severity || '').toUpperCase()}] ${row.title} (${String(row.status || '').replace(/_/g, ' ')})`;
        doc.fontSize(9).fillColor('#374151').text(line);
      });
    }

    doc.moveDown(0.8);
    doc.fontSize(16).fillColor('#111827').text('Final Recommendation');
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#374151').text(finalRecommendation || 'No recommendation provided.');

    if (reportTemplateBody) {
      doc.addPage();
      doc.fontSize(16).fillColor('#111827').text('Auditor Firm Standard Template Output');
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#374151').text(reportTemplateBody);
    }

    doc.end();
  } catch (error) {
    log('error', 'validation_package_pdf_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to generate validation package PDF' });
  }
});

module.exports = router;
