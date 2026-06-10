// @tier: community
/**
 * Assessment procedures, results recording, stats, frameworks, and plans.
 *
 * Extracted verbatim from routes/assessments.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/assessments.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');

// ============================================================
// GET /api/v1/assessments/procedures
// List procedures with filters (by framework, control, type)
// ============================================================
router.get('/procedures', requirePermission('assessments.read'), async (req, res) => {
  try {
    const { framework_code, control_id, procedure_type, depth, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        ap.id,
        ap.procedure_id,
        ap.procedure_type,
        COALESCE(apo.title, ap.title) AS title,
        COALESCE(apo.description, ap.description) AS description,
        COALESCE(apo.expected_evidence, ap.expected_evidence) AS expected_evidence,
        ap.assessment_method,
        ap.depth,
        ap.frequency_guidance,
        COALESCE(apo.assessor_notes, ap.assessor_notes) AS assessor_notes,
        ap.source_document,
        ap.sort_order,
        fc.control_id,
        COALESCE(occ.title, fc.title) AS control_title,
        f.code AS framework_code,
        f.name AS framework_name,
        ar.status AS result_status,
        ar.assessed_at
      FROM assessment_procedures ap
      JOIN framework_controls fc ON ap.framework_control_id = fc.id
      JOIN frameworks f ON fc.framework_id = f.id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $1
       AND occ.framework_control_id = fc.id
      LEFT JOIN organization_assessment_procedure_overrides apo
        ON apo.organization_id = $1
       AND apo.assessment_procedure_id = ap.id
      LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap.id
        AND ar.organization_id = $1
      WHERE 1=1
    `;

    const params = [req.user.organization_id];
    let paramIdx = 2;

    if (framework_code) {
      query += ` AND f.code = $${paramIdx}`;
      params.push(framework_code);
      paramIdx++;
    }

    if (control_id) {
      query += ` AND fc.control_id = $${paramIdx}`;
      params.push(control_id);
      paramIdx++;
    }

    if (procedure_type) {
      query += ` AND ap.procedure_type = $${paramIdx}`;
      params.push(procedure_type);
      paramIdx++;
    }

    if (depth) {
      query += ` AND ap.depth = $${paramIdx}`;
      params.push(depth);
      paramIdx++;
    }

    if (search) {
      query += ` AND (ap.title ILIKE $${paramIdx} OR ap.description ILIKE $${paramIdx} OR fc.control_id ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY f.code, fc.control_id, ap.sort_order`;
    query += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM assessment_procedures ap
      JOIN framework_controls fc ON ap.framework_control_id = fc.id
      JOIN frameworks f ON fc.framework_id = f.id
      WHERE 1=1
    `;
    const countParams = [];
    let cIdx = 1;

    if (framework_code) {
      countQuery += ` AND f.code = $${cIdx}`;
      countParams.push(framework_code);
      cIdx++;
    }
    if (control_id) {
      countQuery += ` AND fc.control_id = $${cIdx}`;
      countParams.push(control_id);
      cIdx++;
    }
    if (procedure_type) {
      countQuery += ` AND ap.procedure_type = $${cIdx}`;
      countParams.push(procedure_type);
      cIdx++;
    }
    if (search) {
      countQuery += ` AND (ap.title ILIKE $${cIdx} OR ap.description ILIKE $${cIdx} OR fc.control_id ILIKE $${cIdx})`;
      countParams.push(`%${search}%`);
      cIdx++;
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        procedures: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    log('error', 'get_procedures_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch assessment procedures' });
  }
});

// ============================================================
// GET /api/v1/assessments/procedures/by-control/:controlId
// Get all procedures for a specific framework_control UUID
// ============================================================
router.get('/procedures/by-control/:controlId', requirePermission('assessments.read'), async (req, res) => {
  try {
    const { controlId } = req.params;

    const result = await pool.query(`
      SELECT
        ap.id,
        ap.procedure_id,
        ap.procedure_type,
        COALESCE(apo.title, ap.title) AS title,
        COALESCE(apo.description, ap.description) AS description,
        COALESCE(apo.expected_evidence, ap.expected_evidence) AS expected_evidence,
        ap.assessment_method,
        ap.depth,
        ap.frequency_guidance,
        COALESCE(apo.assessor_notes, ap.assessor_notes) AS assessor_notes,
        ap.source_document,
        ap.sort_order,
        fc.control_id,
        COALESCE(occ.title, fc.title) AS control_title,
        f.code AS framework_code,
        f.name AS framework_name,
        ar.id AS result_id,
        ar.status AS result_status,
        ar.finding,
        ar.evidence_collected,
        ar.risk_level,
        ar.remediation_required,
        ar.remediation_deadline,
        ar.assessed_at,
        CONCAT(u.first_name, ' ', u.last_name) AS assessor_name
      FROM assessment_procedures ap
      JOIN framework_controls fc ON ap.framework_control_id = fc.id
      JOIN frameworks f ON fc.framework_id = f.id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $2
       AND occ.framework_control_id = fc.id
      LEFT JOIN organization_assessment_procedure_overrides apo
        ON apo.organization_id = $2
       AND apo.assessment_procedure_id = ap.id
      LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap.id
        AND ar.organization_id = $2
      LEFT JOIN users u ON ar.assessor_id = u.id
      WHERE ap.framework_control_id = $1
      ORDER BY ap.sort_order, ap.procedure_type
    `, [controlId, req.user.organization_id]);

    res.json({
      success: true,
      data: {
        procedures: result.rows,
        total: result.rows.length
      }
    });
  } catch (error) {
    log('error', 'get_control_procedures_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch procedures for control' });
  }
});

// ============================================================
// GET /api/v1/assessments/procedures/:id
// Get single procedure detail
// ============================================================
router.get('/procedures/:id', requirePermission('assessments.read'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        ap.*,
        COALESCE(apo.title, ap.title) AS title,
        COALESCE(apo.description, ap.description) AS description,
        COALESCE(apo.expected_evidence, ap.expected_evidence) AS expected_evidence,
        COALESCE(apo.assessor_notes, ap.assessor_notes) AS assessor_notes,
        fc.control_id,
        COALESCE(occ.title, fc.title) AS control_title,
        COALESCE(occ.description, fc.description) AS control_description,
        f.code AS framework_code,
        f.name AS framework_name,
        ar.id AS result_id,
        ar.status AS result_status,
        ar.finding,
        ar.evidence_collected,
        ar.risk_level,
        ar.remediation_required,
        ar.remediation_deadline,
        ar.assessed_at,
        CONCAT(u.first_name, ' ', u.last_name) AS assessor_name
      FROM assessment_procedures ap
      JOIN framework_controls fc ON ap.framework_control_id = fc.id
      JOIN frameworks f ON fc.framework_id = f.id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $2
       AND occ.framework_control_id = fc.id
      LEFT JOIN organization_assessment_procedure_overrides apo
        ON apo.organization_id = $2
       AND apo.assessment_procedure_id = ap.id
      LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap.id
        AND ar.organization_id = $2
      LEFT JOIN users u ON ar.assessor_id = u.id
      WHERE ap.id = $1
    `, [id, req.user.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Procedure not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'get_procedure_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch procedure' });
  }
});

// ============================================================
// POST /api/v1/assessments/results
// Record an assessment result
// ============================================================
router.post('/results', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { procedure_id, status, finding, evidence_collected, risk_level, remediation_required, remediation_deadline } = req.body;
    const hasFinding = Object.prototype.hasOwnProperty.call(req.body || {}, 'finding');
    const hasEvidenceCollected = Object.prototype.hasOwnProperty.call(req.body || {}, 'evidence_collected');
    const hasRiskLevel = Object.prototype.hasOwnProperty.call(req.body || {}, 'risk_level');
    const hasRemediationRequired = Object.prototype.hasOwnProperty.call(req.body || {}, 'remediation_required');
    const hasRemediationDeadline = Object.prototype.hasOwnProperty.call(req.body || {}, 'remediation_deadline');
    const source = typeof req.body?.source === 'string' ? req.body.source.trim() : null;

    if (!procedure_id || !status) {
      return res.status(400).json({ success: false, error: 'procedure_id and status are required' });
    }

    const validStatuses = ['not_assessed', 'satisfied', 'other_than_satisfied', 'not_applicable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    // Convert remediation_required to proper boolean
    // Handle various truthy/falsy representations
    const remediationRequiredBool = remediation_required == null 
      ? false 
      : (remediation_required === true || 
         remediation_required === 'true' || 
         remediation_required === '1' || 
         remediation_required === 1);

    // Validate remediation_deadline format and validity if provided
    if (hasRemediationDeadline && remediation_deadline) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(remediation_deadline)) {
        return res.status(400).json({ success: false, error: 'remediation_deadline must be in YYYY-MM-DD format' });
      }
      // Verify the date is actually valid (not 2024-13-45, etc.)
      const parsedDate = new Date(remediation_deadline);
      const [year, month, day] = remediation_deadline.split('-').map(Number);
      if (parsedDate.getFullYear() !== year || 
          parsedDate.getMonth() !== month - 1 || 
          parsedDate.getDate() !== day) {
        return res.status(400).json({ success: false, error: 'remediation_deadline is not a valid date' });
      }
    }

    const truncate = (value, max = 2000) => {
      if (value === undefined || value === null) return null;
      const text = String(value);
      if (text.length <= max) return text;
      return `${text.slice(0, max)}…`;
    };

    const procedureMetaResult = await pool.query(`
      SELECT
        ap.id as assessment_procedure_id,
        ap.procedure_id,
        ap.procedure_type,
        ap.framework_control_id,
        fc.control_id as control_code,
        COALESCE(occ.title, fc.title) as control_title,
        f.code as framework_code,
        f.name as framework_name
      FROM assessment_procedures ap
      JOIN framework_controls fc ON fc.id = ap.framework_control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $2
       AND occ.framework_control_id = fc.id
      WHERE ap.id = $1
      LIMIT 1
    `, [procedure_id, req.user.organization_id]);

    if (procedureMetaResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Procedure not found' });
    }

    const procedureMeta = procedureMetaResult.rows[0];

    // Upsert: if result exists for this org+procedure, update it; otherwise insert
    const existing = await pool.query(
      `SELECT
         id,
         status,
         finding,
         evidence_collected,
         risk_level,
         remediation_required,
         remediation_deadline,
         assessor_id,
         assessed_at,
         updated_at
       FROM assessment_results
       WHERE organization_id = $1 AND assessment_procedure_id = $2
       LIMIT 1`,
      [req.user.organization_id, procedure_id]
    );

    let result;
    if (existing.rows.length > 0) {
      const oldRow = existing.rows[0];
      result = await pool.query(`
        UPDATE assessment_results SET
          status = $1,
          finding = CASE WHEN $9 THEN $2 ELSE finding END,
          evidence_collected = CASE WHEN $10 THEN $3 ELSE evidence_collected END,
          risk_level = CASE WHEN $11 THEN $4 ELSE risk_level END,
          remediation_required = CASE WHEN $12 THEN $5 ELSE remediation_required END,
          remediation_deadline = CASE WHEN $13 THEN $6 ELSE remediation_deadline END,
          assessor_id = $7,
          assessed_at = NOW(),
          updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [
        status,
        finding || null,
        evidence_collected || null,
        risk_level || null,
        remediationRequiredBool,
        remediation_deadline || null,
        req.user.id,
        oldRow.id,
        hasFinding,
        hasEvidenceCollected,
        hasRiskLevel,
        hasRemediationRequired,
        hasRemediationDeadline
      ]);

      // Audit trail for assessment result updates (best-effort; should not block save).
      try {
        await pool.query(
          `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
           VALUES ($1, $2, 'assessment_result_updated', 'control', $3, $4)`,
          [
            req.user.organization_id,
            req.user.id,
            procedureMeta.framework_control_id,
            JSON.stringify({
              source: source || 'assessments.results',
              assessment_procedure_id: procedureMeta.assessment_procedure_id,
              procedure_id: procedureMeta.procedure_id,
              procedure_type: procedureMeta.procedure_type,
              framework_code: procedureMeta.framework_code,
              framework_name: procedureMeta.framework_name,
              control_code: procedureMeta.control_code,
              control_title: procedureMeta.control_title,
              result_id: result.rows[0]?.id,
              old_status: oldRow.status,
              new_status: status,
              old_risk_level: oldRow.risk_level,
              new_risk_level: risk_level ?? oldRow.risk_level ?? null,
              remediation_required: remediationRequiredBool,
              remediation_deadline: remediation_deadline ?? oldRow.remediation_deadline ?? null,
              finding: truncate(finding, 4000),
              evidence_collected: truncate(evidence_collected, 4000)
            })
          ]
        );
      } catch (auditError) {
        log('error', 'assessment_result_audit_log_update_failed', { error: auditError?.message || String(auditError) });
      }
    } else {
      result = await pool.query(`
        INSERT INTO assessment_results
          (organization_id, assessment_procedure_id, assessor_id, status, finding,
           evidence_collected, risk_level, remediation_required, remediation_deadline, assessed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [
        req.user.organization_id,
        procedure_id,
        req.user.id,
        status,
        finding || null,
        evidence_collected || null,
        risk_level || null,
        remediationRequiredBool,
        remediation_deadline || null
      ]);

      // Audit trail for newly recorded assessment results (best-effort; should not block save).
      try {
        await pool.query(
          `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
           VALUES ($1, $2, 'assessment_result_recorded', 'control', $3, $4)`,
          [
            req.user.organization_id,
            req.user.id,
            procedureMeta.framework_control_id,
            JSON.stringify({
              source: source || 'assessments.results',
              assessment_procedure_id: procedureMeta.assessment_procedure_id,
              procedure_id: procedureMeta.procedure_id,
              procedure_type: procedureMeta.procedure_type,
              framework_code: procedureMeta.framework_code,
              framework_name: procedureMeta.framework_name,
              control_code: procedureMeta.control_code,
              control_title: procedureMeta.control_title,
              result_id: result.rows[0]?.id,
              old_status: null,
              new_status: status,
              risk_level: risk_level || null,
              remediation_required: remediationRequiredBool,
              remediation_deadline: remediation_deadline || null,
              finding: truncate(finding, 4000),
              evidence_collected: truncate(evidence_collected, 4000)
            })
          ]
        );
      } catch (auditError) {
        log('error', 'assessment_result_audit_log_insert_failed', { error: auditError?.message || String(auditError) });
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'record_result_error', { error: error?.message || String(error) });
    // Sanitize error message to avoid leaking database details
    let errorMessage = 'Failed to record assessment result';
    if (error.message) {
      // Only include safe error messages, not raw database errors
      if (error.message.includes('invalid input syntax') || 
          error.message.includes('violates')) {
        errorMessage = 'Invalid data format or constraint violation';
      } else if (error.message.includes('not found') || error.code === '23503') {
        errorMessage = 'Referenced resource not found';
      } else {
        errorMessage = 'Failed to record assessment result';
      }
    }
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// ============================================================
// GET /api/v1/assessments/stats
// Assessment statistics for the organization
// ============================================================
router.get('/stats', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Total procedures available
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM assessment_procedures');

    // Procedures by framework
    const byFramework = await pool.query(`
      SELECT
        f.code,
        f.name,
        COUNT(ap.id) as total_procedures,
        COUNT(ar.id) FILTER (WHERE ar.status = 'satisfied') as satisfied,
        COUNT(ar.id) FILTER (WHERE ar.status = 'other_than_satisfied') as other_than_satisfied,
        COUNT(ar.id) FILTER (WHERE ar.status = 'not_applicable') as not_applicable,
        COUNT(ar.id) FILTER (WHERE ar.status IS NOT NULL AND ar.status != 'not_assessed') as assessed
      FROM assessment_procedures ap
      JOIN framework_controls fc ON ap.framework_control_id = fc.id
      JOIN frameworks f ON fc.framework_id = f.id
      LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap.id AND ar.organization_id = $1
      GROUP BY f.code, f.name
      ORDER BY f.name
    `, [orgId]);

    // Procedures by type
    const byType = await pool.query(`
      SELECT
        ap.procedure_type,
        COUNT(*) as total,
        COUNT(ar.id) FILTER (WHERE ar.status IS NOT NULL AND ar.status != 'not_assessed') as assessed
      FROM assessment_procedures ap
      LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap.id AND ar.organization_id = $1
      GROUP BY ap.procedure_type
      ORDER BY ap.procedure_type
    `, [orgId]);

    // Recent results
    const recentResults = await pool.query(`
      SELECT
        ar.status,
        ar.risk_level,
        ar.assessed_at,
        ap.procedure_id,
        ap.title AS procedure_title,
        fc.control_id,
        f.code AS framework_code,
        CONCAT(u.first_name, ' ', u.last_name) AS assessor_name
      FROM assessment_results ar
      JOIN assessment_procedures ap ON ar.assessment_procedure_id = ap.id
      JOIN framework_controls fc ON ap.framework_control_id = fc.id
      JOIN frameworks f ON fc.framework_id = f.id
      LEFT JOIN users u ON ar.assessor_id = u.id
      WHERE ar.organization_id = $1
      ORDER BY ar.assessed_at DESC
      LIMIT 10
    `, [orgId]);

    // Findings requiring remediation
    const findings = await pool.query(`
      SELECT COUNT(*) as total
      FROM assessment_results
      WHERE organization_id = $1 AND remediation_required = true
        AND status = 'other_than_satisfied'
    `, [orgId]);

    res.json({
      success: true,
      data: {
        summary: {
          total_procedures: parseInt(totalResult.rows[0].total),
          findings_requiring_remediation: parseInt(findings.rows[0].total)
        },
        by_framework: byFramework.rows,
        by_type: byType.rows,
        recent_results: recentResults.rows
      }
    });
  } catch (error) {
    log('error', 'get_assessment_stats_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch assessment statistics' });
  }
});

// ============================================================
// GET /api/v1/assessments/frameworks
// Get available frameworks with procedure counts
// ============================================================
router.get('/frameworks', requirePermission('assessments.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        f.code,
        f.name,
        COUNT(DISTINCT ap.id) as procedure_count,
        COUNT(DISTINCT fc.id) as control_count,
        STRING_AGG(DISTINCT ap.source_document, ' | ' ORDER BY ap.source_document) as source_document
      FROM frameworks f
      JOIN framework_controls fc ON fc.framework_id = f.id
      JOIN assessment_procedures ap ON ap.framework_control_id = fc.id
      GROUP BY f.code, f.name
      ORDER BY f.name
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'get_assessment_frameworks_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch assessment frameworks' });
  }
});

// ============================================================
// POST /api/v1/assessments/plans
// Create an assessment plan
// ============================================================
router.post('/plans', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { name, description, framework_id, assessment_type, depth, start_date, end_date } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const result = await pool.query(`
      INSERT INTO assessment_plans
        (organization_id, name, description, framework_id, assessment_type, depth,
         lead_assessor_id, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      req.user.organization_id,
      name,
      description || null,
      framework_id || null,
      assessment_type || 'initial',
      depth || 'focused',
      req.user.id,
      start_date || null,
      end_date || null
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'create_plan_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to create assessment plan' });
  }
});

// ============================================================
// GET /api/v1/assessments/plans
// List assessment plans for the organization
// ============================================================
router.get('/plans', requirePermission('assessments.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ap.*,
        f.code AS framework_code,
        f.name AS framework_name,
        CONCAT(u.first_name, ' ', u.last_name) AS lead_assessor_name,
        (SELECT COUNT(*) FROM assessment_plan_procedures WHERE assessment_plan_id = ap.id) AS procedure_count
      FROM assessment_plans ap
      LEFT JOIN frameworks f ON ap.framework_id = f.id
      LEFT JOIN users u ON ap.lead_assessor_id = u.id
      WHERE ap.organization_id = $1
      ORDER BY ap.created_at DESC
    `, [req.user.organization_id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'get_plans_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch assessment plans' });
  }
});

module.exports = router;
