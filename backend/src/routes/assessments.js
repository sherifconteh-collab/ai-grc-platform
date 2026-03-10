// @tier: free
/**
 * Assessment Procedures Routes
 *
 * Provides endpoints for auditors/SCAs to:
 * - Browse assessment procedures by framework/control
 * - View procedure details (examine/interview/test)
 * - Record assessment results
 * - Manage assessment plans
 * - Get assessment statistics
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');
const PDFDocument = require('pdfkit');
// Optional premium service — not available in community edition
let llm;
try { llm = require('../services/llmService'); } catch (_) { llm = null; }
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireSod } = require('../middleware/sod');

// All routes require authentication
router.use(authenticate);

const VALID_ENGAGEMENT_TYPES = ['internal_audit', 'external_audit', 'readiness', 'assessment'];
const VALID_ENGAGEMENT_STATUSES = ['planning', 'fieldwork', 'reporting', 'completed', 'archived'];
const VALID_PBC_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_PBC_STATUSES = ['open', 'in_progress', 'submitted', 'accepted', 'rejected', 'closed'];
const VALID_WORKPAPER_STATUSES = ['draft', 'in_review', 'finalized'];
const VALID_FINDING_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_FINDING_STATUSES = ['open', 'accepted', 'remediating', 'verified', 'closed'];
const VALID_SIGNOFF_TYPES = [
  'auditor',
  'management',
  'executive',
  'customer_acknowledgment',
  'company_leadership',
  'auditor_firm_recommendation'
];
const VALID_SIGNOFF_STATUSES = ['approved', 'rejected'];
const VALID_AUDIT_TEMPLATE_TYPES = ['pbc', 'workpaper', 'finding', 'signoff', 'engagement_report'];
const TEMPLATE_MAX_CHARS = 250000;
const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});
const SIGNOFF_ROLE_CONFIG = [
  {
    key: 'customer_acknowledgment',
    label: 'Customer Acknowledgment',
    acceptedTypes: ['customer_acknowledgment', 'management']
  },
  {
    key: 'auditor',
    label: 'Auditor Sign-off',
    acceptedTypes: ['auditor']
  },
  {
    key: 'company_leadership',
    label: 'Company Leadership Sign-off',
    acceptedTypes: ['company_leadership', 'executive']
  },
  {
    key: 'auditor_firm_recommendation',
    label: 'Auditor Firm Final Recommendation',
    acceptedTypes: ['auditor_firm_recommendation']
  }
];

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFrameworkCodes(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((value) => String(value || '').trim()).filter(Boolean)));
  }
  if (typeof input === 'string') {
    return Array.from(new Set(input.split(',').map((value) => value.trim()).filter(Boolean)));
  }
  return [];
}

function truncateText(value, max = TEMPLATE_MAX_CHARS) {
  const text = String(value || '');
  if (text.length <= max) {
    return { value: text, truncated: false };
  }
  return { value: text.slice(0, max), truncated: true };
}

function normalizeNullableText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeAiResponseToText(result) {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') {
    if (typeof result.text === 'string') return result.text;
    if (typeof result.content === 'string') return result.content;
  }
  return JSON.stringify(result, null, 2);
}

function extractJsonObject(rawText) {
  const text = String(rawText || '');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
}

function renderTemplate(templateContent, context = {}) {
  const fallback = String(templateContent || '');
  if (!fallback.trim()) return '';
  return fallback.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = context[key];
    if (value === null || value === undefined) return '';
    return String(value);
  });
}

async function extractTemplateText(file) {
  const ext = path.extname(file?.originalname || '').toLowerCase();
  let parser = 'plain-text';
  let text = '';
  const warnings = [];

  if (['.txt', '.md', '.csv', '.json', '.xml', '.log'].includes(ext)) {
    text = Buffer.from(file.buffer).toString('utf8');
  } else if (ext === '.pdf') {
    parser = 'pdf-parse';
    try {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(file.buffer);
      text = String(parsed?.text || '');
    } catch (error) {
      parser = 'binary-fallback';
      warnings.push(`PDF parser fallback used: ${error.message}`);
      text = Buffer.from(file.buffer).toString('utf8');
    }
  } else if (ext === '.docx') {
    parser = 'mammoth';
    try {
      const mammoth = require('mammoth');
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      text = String(parsed?.value || '');
      if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
        warnings.push(`DOCX parser reported ${parsed.messages.length} warning(s).`);
      }
    } catch (error) {
      parser = 'binary-fallback';
      warnings.push(`DOCX parser fallback used: ${error.message}`);
      text = Buffer.from(file.buffer).toString('utf8');
    }
  } else {
    parser = 'binary-fallback';
    warnings.push(`Limited parsing support for ${ext || 'unknown extension'}; fallback parser used.`);
    text = Buffer.from(file.buffer).toString('utf8');
  }

  const clipped = truncateText(text, TEMPLATE_MAX_CHARS);
  return {
    parser,
    text: clipped.value.trim(),
    warnings,
    char_count: text.length,
    truncated: clipped.truncated
  };
}

async function getDefaultAuditTemplate(organizationId, userId, artifactType) {
  if (!VALID_AUDIT_TEMPLATE_TYPES.includes(String(artifactType || '').toLowerCase())) return null;
  const result = await pool.query(
    `SELECT *
     FROM audit_artifact_templates
     WHERE organization_id = $1
       AND owner_user_id = $2
       AND artifact_type = $3
       AND is_active = true
     ORDER BY is_default DESC, updated_at DESC, created_at DESC
     LIMIT 1`,
    [organizationId, userId, String(artifactType).toLowerCase()]
  );
  return result.rows[0] || null;
}

async function getEngagementById(organizationId, engagementId) {
  const result = await pool.query(
    `SELECT id, organization_id, name, status, framework_codes, lead_auditor_id, engagement_owner_id
     FROM audit_engagements
     WHERE id = $1 AND organization_id = $2`,
    [engagementId, organizationId]
  );
  return result.rows[0] || null;
}

async function assertEngagementAccess(req, res) {
  const { id } = req.params;
  const engagement = await getEngagementById(req.user.organization_id, id);
  if (!engagement) {
    res.status(404).json({ success: false, error: 'Audit engagement not found' });
    return null;
  }
  return engagement;
}

async function ensureOrgUser(organizationId, userId) {
  if (!userId) return true;
  const userResult = await pool.query(
    'SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND is_active = true',
    [userId, organizationId]
  );
  return userResult.rows.length > 0;
}

async function ensureOrgAuditorUser(organizationId, userId) {
  if (!userId) return false;
  const userResult = await pool.query(
    `SELECT
       LOWER(COALESCE(u.role, '')) AS primary_role,
       EXISTS (
         SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id
           AND (
             LOWER(r.name) = 'auditor'
             OR LOWER(r.name) LIKE 'auditor\\_%' ESCAPE '\\'
           )
       ) AS has_auditor_role
     FROM users u
     WHERE u.id = $1
       AND u.organization_id = $2
       AND u.is_active = true
     LIMIT 1`,
    [userId, organizationId]
  );

  if (userResult.rows.length === 0) return false;
  const row = userResult.rows[0];
  return row.primary_role === 'auditor' || Boolean(row.has_auditor_role);
}

async function resolveEngagementFrameworkCodes(organizationId, engagement) {
  const directCodes = parseFrameworkCodes(engagement?.framework_codes || []);
  if (directCodes.length > 0) return directCodes;

  const orgFrameworks = await pool.query(
    `SELECT f.code
     FROM organization_frameworks of2
     JOIN frameworks f ON f.id = of2.framework_id
     WHERE of2.organization_id = $1`,
    [organizationId]
  );
  return orgFrameworks.rows.map((row) => String(row.code || '').trim()).filter(Boolean);
}

async function getAssessmentProcedureById(procedureId) {
  if (!procedureId) return null;
  const result = await pool.query(
    `SELECT
      ap.id,
      ap.procedure_id,
      ap.procedure_type,
      ap.title,
      ap.description,
      ap.expected_evidence,
      ap.assessor_notes,
      ap.depth,
      fc.id AS framework_control_id,
      fc.control_id,
      fc.title AS control_title,
      f.code AS framework_code,
      f.name AS framework_name
     FROM assessment_procedures ap
     JOIN framework_controls fc ON fc.id = ap.framework_control_id
     JOIN frameworks f ON f.id = fc.framework_id
     WHERE ap.id = $1
     LIMIT 1`,
    [procedureId]
  );
  return result.rows[0] || null;
}

async function assertProcedureAllowedForEngagement(organizationId, engagement, procedureId) {
  if (!procedureId) return { procedure: null, derivedControlId: null };
  const procedure = await getAssessmentProcedureById(procedureId);
  if (!procedure) {
    return {
      error: {
        status: 400,
        message: 'assessment_procedure_id is invalid'
      }
    };
  }
  const frameworkCodes = await resolveEngagementFrameworkCodes(organizationId, engagement);
  if (frameworkCodes.length > 0 && !frameworkCodes.includes(String(procedure.framework_code))) {
    return {
      error: {
        status: 400,
        message: `assessment_procedure_id (${procedure.procedure_id || procedure.id}) is outside the engagement framework scope`
      }
    };
  }
  return {
    procedure,
    derivedControlId: procedure.framework_control_id
  };
}

function buildValidationChecklist(signoffRows = []) {
  return SIGNOFF_ROLE_CONFIG.map((rule) => {
    const matching = signoffRows
      .filter((row) => rule.acceptedTypes.includes(String(row.signoff_type || '').toLowerCase()))
      .sort((a, b) => new Date(b.signed_at).getTime() - new Date(a.signed_at).getTime());
    const latest = matching[0] || null;
    const approved = Boolean(latest && String(latest.status) === 'approved');
    return {
      key: rule.key,
      label: rule.label,
      required: true,
      approved,
      latest: latest
        ? {
            id: latest.id,
            signoff_type: latest.signoff_type,
            status: latest.status,
            comments: latest.comments,
            signed_by: latest.signed_by,
            signed_by_name: latest.signed_by_name || null,
            signed_at: latest.signed_at
          }
        : null
    };
  });
}

async function logAuditEvent(req, eventType, resourceType, resourceId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.organization_id, req.user.id, eventType, resourceType, resourceId || null, details]
    );
  } catch (error) {
    // Audit logging should not block business operations.
  }
}

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
    console.error('Get procedures error:', error);
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
    console.error('Get control procedures error:', error);
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
    console.error('Get procedure error:', error);
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
        console.error('Assessment result audit log (update) failed:', auditError);
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
        console.error('Assessment result audit log (insert) failed:', auditError);
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Record result error:', error);
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
    console.error('Get assessment stats error:', error);
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
    console.error('Get assessment frameworks error:', error);
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
    console.error('Create plan error:', error);
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
    console.error('Get plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assessment plans' });
  }
});

// ============================================================
// GET /api/v1/assessments/templates
// List organization audit artifact templates
// ============================================================
router.get('/templates', requirePermission('assessments.read'), async (req, res) => {
  try {
    const artifactType = normalizeNullableText(req.query.artifact_type);
    const includeInactive = parseBooleanFlag(req.query.include_inactive, false);
    const includeContent = parseBooleanFlag(req.query.include_content, false);

    if (artifactType && !VALID_AUDIT_TEMPLATE_TYPES.includes(String(artifactType).toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `artifact_type must be one of: ${VALID_AUDIT_TEMPLATE_TYPES.join(', ')}`
      });
    }

    const params = [req.user.organization_id, req.user.id];
    let idx = 3;
    let query = `
      SELECT
        id,
        organization_id,
        owner_user_id,
        artifact_type,
        template_name,
        template_format,
        source_filename,
        source_mime_type,
        extraction_parser,
        extraction_warnings,
        is_default,
        is_active,
        created_by,
        created_at,
        updated_at,
        LEFT(template_content, 600) AS template_preview
      FROM audit_artifact_templates
      WHERE organization_id = $1
        AND owner_user_id = $2
    `;

    if (!includeInactive) {
      query += ' AND is_active = true';
    }
    if (artifactType) {
      query += ` AND artifact_type = $${idx++}`;
      params.push(String(artifactType).toLowerCase());
    }
    query += ' ORDER BY artifact_type, is_default DESC, updated_at DESC, created_at DESC';

    const rows = await pool.query(query, params);
    const data = rows.rows.map((row) => (
      includeContent
        ? row
        : {
            ...row,
            template_content: undefined
          }
    ));

    if (includeContent) {
      for (const row of data) {
        const full = await pool.query(
          'SELECT template_content FROM audit_artifact_templates WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3 LIMIT 1',
          [row.id, req.user.organization_id, req.user.id]
        );
        row.template_content = full.rows[0]?.template_content || '';
      }
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('List audit templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to list audit templates' });
  }
});

// ============================================================
// POST /api/v1/assessments/templates
// Create or upload template content as text/json payload
// ============================================================
router.post('/templates', requirePermission('assessments.write'), async (req, res) => {
  try {
    const {
      artifact_type,
      template_name,
      template_content,
      template_format = 'text',
      set_default = false
    } = req.body || {};

    const artifactType = String(artifact_type || '').trim().toLowerCase();
    if (!VALID_AUDIT_TEMPLATE_TYPES.includes(artifactType)) {
      return res.status(400).json({
        success: false,
        error: `artifact_type must be one of: ${VALID_AUDIT_TEMPLATE_TYPES.join(', ')}`
      });
    }
    if (!template_name || !String(template_name).trim()) {
      return res.status(400).json({ success: false, error: 'template_name is required' });
    }
    if (!template_content || !String(template_content).trim()) {
      return res.status(400).json({ success: false, error: 'template_content is required' });
    }

    const clipped = truncateText(String(template_content), TEMPLATE_MAX_CHARS);
    const wantsDefault = parseBooleanFlag(set_default, false);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (wantsDefault) {
        await client.query(
          `UPDATE audit_artifact_templates
           SET is_default = false, updated_at = NOW()
           WHERE organization_id = $1
             AND artifact_type = $2
             AND owner_user_id = $3
             AND is_active = true`,
          [req.user.organization_id, artifactType, req.user.id]
          );
        }

        const inserted = await client.query(
          `INSERT INTO audit_artifact_templates (
           organization_id, artifact_type, template_name, template_content,
           template_format, is_default, is_active, created_by, owner_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
         RETURNING *`,
        [
          req.user.organization_id,
          artifactType,
          String(template_name).trim(),
          clipped.value,
          String(template_format || 'text').trim().toLowerCase(),
          wantsDefault,
          req.user.id,
          req.user.id
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: {
          ...inserted.rows[0],
          was_truncated: clipped.truncated
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create audit template error:', error);
    res.status(500).json({ success: false, error: 'Failed to create audit template' });
  }
});

// ============================================================
// POST /api/v1/assessments/templates/upload
// Upload template file (txt/md/pdf/docx) and store parsed content
// ============================================================
router.post(
  '/templates/upload',
  requirePermission('assessments.write'),
  templateUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'file is required' });
      }

      const artifactType = String(req.body?.artifact_type || '').trim().toLowerCase();
      if (!VALID_AUDIT_TEMPLATE_TYPES.includes(artifactType)) {
        return res.status(400).json({
          success: false,
          error: `artifact_type must be one of: ${VALID_AUDIT_TEMPLATE_TYPES.join(', ')}`
        });
      }

      const uploadedName = String(req.body?.template_name || '').trim();
      const defaultName = path.parse(req.file.originalname || 'Audit Template').name || 'Audit Template';
      const templateName = uploadedName || defaultName;
      const wantsDefault = parseBooleanFlag(req.body?.set_default, false);
      const parsed = await extractTemplateText(req.file);
      if (!parsed.text || !parsed.text.trim()) {
        return res.status(400).json({
          success: false,
          error: 'No extractable template text found in uploaded file'
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (wantsDefault) {
          await client.query(
            `UPDATE audit_artifact_templates
             SET is_default = false, updated_at = NOW()
             WHERE organization_id = $1
               AND artifact_type = $2
               AND owner_user_id = $3
               AND is_active = true`,
            [req.user.organization_id, artifactType, req.user.id]
          );
        }

        const inserted = await client.query(
          `INSERT INTO audit_artifact_templates (
           organization_id, artifact_type, template_name, template_content,
           template_format, source_filename, source_mime_type, extraction_parser, extraction_warnings,
           is_default, is_active, created_by, owner_user_id
           )
           VALUES ($1, $2, $3, $4, 'text', $5, $6, $7, $8::jsonb, $9, true, $10, $11)
           RETURNING *`,
          [
            req.user.organization_id,
            artifactType,
            templateName,
            parsed.text,
            req.file.originalname || null,
            req.file.mimetype || null,
            parsed.parser,
            JSON.stringify(parsed.warnings || []),
            wantsDefault,
            req.user.id,
            req.user.id
          ]
        );
        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          data: {
            ...inserted.rows[0],
            extraction: {
              parser: parsed.parser,
              warnings: parsed.warnings,
              char_count: parsed.char_count,
              truncated: parsed.truncated
            }
          }
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Upload audit template error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload audit template' });
    }
  }
);

// ============================================================
// PATCH /api/v1/assessments/templates/:templateId
// Update template metadata/content/default flag/active flag
// ============================================================
router.patch('/templates/:templateId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { templateId } = req.params;
    const existing = await pool.query(
      `SELECT *
       FROM audit_artifact_templates
       WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3
       LIMIT 1`,
      [templateId, req.user.organization_id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const current = existing.rows[0];
    const {
      template_name,
      template_content,
      is_default,
      is_active
    } = req.body || {};

    const updates = [];
    const params = [req.user.organization_id, templateId, req.user.id];
    let idx = 4;
    if (template_name !== undefined) {
      updates.push(`template_name = $${idx++}`);
      params.push(String(template_name || '').trim() || current.template_name);
    }
    if (template_content !== undefined) {
      const clipped = truncateText(String(template_content || ''), TEMPLATE_MAX_CHARS);
      updates.push(`template_content = $${idx++}`);
      params.push(clipped.value);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(parseBooleanFlag(is_active, true));
    }
    if (is_default !== undefined) {
      updates.push(`is_default = $${idx++}`);
      params.push(parseBooleanFlag(is_default, false));
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    const wantsDefault = is_default !== undefined && parseBooleanFlag(is_default, false);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (wantsDefault) {
        await client.query(
          `UPDATE audit_artifact_templates
           SET is_default = false, updated_at = NOW()
           WHERE organization_id = $1
             AND artifact_type = $2
             AND id <> $3
             AND owner_user_id = $4
             AND is_active = true`,
          [req.user.organization_id, current.artifact_type, templateId, req.user.id]
        );
      }
      updates.push('updated_at = NOW()');
      const updated = await client.query(
        `UPDATE audit_artifact_templates
         SET ${updates.join(', ')}
         WHERE organization_id = $1 AND id = $2 AND owner_user_id = $3
         RETURNING *`,
        params
      );
      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update audit template error:', error);
    res.status(500).json({ success: false, error: 'Failed to update audit template' });
  }
});

// ============================================================
// DELETE /api/v1/assessments/templates/:templateId
// Soft-delete template by setting is_active=false
// ============================================================
router.delete('/templates/:templateId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { templateId } = req.params;
    const updated = await pool.query(
      `UPDATE audit_artifact_templates
       SET is_active = false, is_default = false, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2 AND owner_user_id = $3
       RETURNING id`,
      [req.user.organization_id, templateId, req.user.id]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: { id: templateId, is_active: false } });
  } catch (error) {
    console.error('Delete audit template error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete audit template' });
  }
});

// ============================================================
// GET /api/v1/assessments/engagements
// List audit engagements for the organization
// ============================================================
router.get('/engagements', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, engagement_type, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT ae.*,
        CONCAT(lead.first_name, ' ', lead.last_name) AS lead_auditor_name,
        CONCAT(owner.first_name, ' ', owner.last_name) AS engagement_owner_name,
        (SELECT COUNT(*)::int FROM audit_pbc_requests p WHERE p.organization_id = ae.organization_id AND p.engagement_id = ae.id) AS pbc_count,
        (SELECT COUNT(*)::int FROM audit_workpapers w WHERE w.organization_id = ae.organization_id AND w.engagement_id = ae.id) AS workpaper_count,
        (SELECT COUNT(*)::int FROM audit_findings f WHERE f.organization_id = ae.organization_id AND f.engagement_id = ae.id) AS finding_count
      FROM audit_engagements ae
      LEFT JOIN users lead ON lead.id = ae.lead_auditor_id
      LEFT JOIN users owner ON owner.id = ae.engagement_owner_id
      WHERE ae.organization_id = $1
    `;

    const params = [orgId];
    let idx = 2;

    if (status) {
      query += ` AND ae.status = $${idx}`;
      params.push(String(status));
      idx++;
    }
    if (engagement_type) {
      query += ` AND ae.engagement_type = $${idx}`;
      params.push(String(engagement_type));
      idx++;
    }
    if (search) {
      query += ` AND (ae.name ILIKE $${idx} OR COALESCE(ae.scope, '') ILIKE $${idx})`;
      params.push(`%${String(search)}%`);
      idx++;
    }

    query += ` ORDER BY ae.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(toInt(limit, 50), toInt(offset, 0));

    const rows = await pool.query(query, params);

    let countQuery = `SELECT COUNT(*) as total FROM audit_engagements ae WHERE ae.organization_id = $1`;
    const countParams = [orgId];
    let cIdx = 2;
    if (status) {
      countQuery += ` AND ae.status = $${cIdx}`;
      countParams.push(String(status));
      cIdx++;
    }
    if (engagement_type) {
      countQuery += ` AND ae.engagement_type = $${cIdx}`;
      countParams.push(String(engagement_type));
      cIdx++;
    }
    if (search) {
      countQuery += ` AND (ae.name ILIKE $${cIdx} OR COALESCE(ae.scope, '') ILIKE $${cIdx})`;
      countParams.push(`%${String(search)}%`);
      cIdx++;
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        engagements: rows.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total, 10),
          limit: toInt(limit, 50),
          offset: toInt(offset, 0)
        }
      }
    });
  } catch (error) {
    console.error('List audit engagements error:', error);
    res.status(500).json({ success: false, error: 'Failed to list audit engagements' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements
// Create audit engagement
// ============================================================
router.post('/engagements', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      name,
      engagement_type = 'internal_audit',
      scope = null,
      framework_codes = [],
      status = 'planning',
      period_start = null,
      period_end = null,
      lead_auditor_id = null,
      engagement_owner_id = null
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    if (!VALID_ENGAGEMENT_TYPES.includes(String(engagement_type))) {
      return res.status(400).json({ success: false, error: `engagement_type must be one of: ${VALID_ENGAGEMENT_TYPES.join(', ')}` });
    }
    if (!VALID_ENGAGEMENT_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_ENGAGEMENT_STATUSES.join(', ')}` });
    }

    if (!(await ensureOrgUser(orgId, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an active user in this organization' });
    }
    if (lead_auditor_id && !(await ensureOrgAuditorUser(orgId, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an auditor user in this organization' });
    }
    if (!(await ensureOrgUser(orgId, engagement_owner_id))) {
      return res.status(400).json({ success: false, error: 'engagement_owner_id must reference an active user in this organization' });
    }

    const inserted = await pool.query(
      `INSERT INTO audit_engagements (
         organization_id, name, engagement_type, scope, framework_codes, status,
         period_start, period_end, lead_auditor_id, engagement_owner_id, created_by
       )
       VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        orgId,
        String(name).trim(),
        String(engagement_type),
        scope ? String(scope) : null,
        parseFrameworkCodes(framework_codes),
        String(status),
        period_start || null,
        period_end || null,
        lead_auditor_id || null,
        engagement_owner_id || null,
        req.user.id
      ]
    );

    await logAuditEvent(req, 'audit_engagement_created', 'audit_engagement', inserted.rows[0].id, {
      engagement_name: inserted.rows[0].name,
      engagement_type: inserted.rows[0].engagement_type
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    console.error('Create audit engagement error:', error);
    res.status(500).json({ success: false, error: 'Failed to create audit engagement' });
  }
});

// ============================================================
// POST /api/v1/assessments/engagements/:id/handoff
// Assign lead auditor and push engagement to auditor workflow.
// Once assigned, engagement ownership is locked.
// ============================================================
router.post('/engagements/:id/handoff', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const canManageUsers = Array.isArray(req.user?.permissions)
      && (req.user.permissions.includes('*') || req.user.permissions.includes('users.manage'));
    if (String(req.user?.role || '').toLowerCase() !== 'admin' && !canManageUsers) {
      return res.status(403).json({
        success: false,
        error: 'Only organization admins can hand off assessments to auditors'
      });
    }

    if (engagement.lead_auditor_id) {
      return res.status(409).json({
        success: false,
        error: 'This engagement is already assigned to an auditor and is locked'
      });
    }

    const { lead_auditor_id, engagement_owner_id } = req.body || {};
    if (!lead_auditor_id) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id is required for handoff' });
    }

    if (!(await ensureOrgUser(req.user.organization_id, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an active user in this organization' });
    }
    if (!(await ensureOrgAuditorUser(req.user.organization_id, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an auditor user in this organization' });
    }
    if (engagement_owner_id !== undefined && !(await ensureOrgUser(req.user.organization_id, engagement_owner_id))) {
      return res.status(400).json({ success: false, error: 'engagement_owner_id must reference an active user in this organization' });
    }

    const resolvedOwnerId = engagement_owner_id !== undefined
      ? (engagement_owner_id || null)
      : (engagement.engagement_owner_id || req.user.id);

    const updated = await pool.query(
      `UPDATE audit_engagements
       SET lead_auditor_id = $3,
           engagement_owner_id = $4,
           status = CASE WHEN status = 'planning' THEN 'fieldwork' ELSE status END,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [req.user.organization_id, engagement.id, lead_auditor_id, resolvedOwnerId]
    );

    await logAuditEvent(req, 'audit_engagement_handed_off', 'audit_engagement', engagement.id, {
      lead_auditor_id,
      engagement_owner_id: resolvedOwnerId,
      assignment_locked: true
    });

    res.json({
      success: true,
      data: {
        ...updated.rows[0],
        assignment_locked: true
      }
    });
  } catch (error) {
    console.error('Handoff engagement error:', error);
    res.status(500).json({ success: false, error: 'Failed to hand off engagement' });
  }
});

// ============================================================
// GET /api/v1/assessments/engagements/:id
// Get single audit engagement with summary counts
// ============================================================
router.get('/engagements/:id', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const detail = await pool.query(
      `SELECT ae.*,
        CONCAT(lead.first_name, ' ', lead.last_name) AS lead_auditor_name,
        CONCAT(owner.first_name, ' ', owner.last_name) AS engagement_owner_name
       FROM audit_engagements ae
       LEFT JOIN users lead ON lead.id = ae.lead_auditor_id
       LEFT JOIN users owner ON owner.id = ae.engagement_owner_id
       WHERE ae.organization_id = $1 AND ae.id = $2
       LIMIT 1`,
      [req.user.organization_id, engagement.id]
    );

    const summary = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM audit_pbc_requests WHERE organization_id = $1 AND engagement_id = $2) AS pbc_count,
         (SELECT COUNT(*)::int FROM audit_pbc_requests WHERE organization_id = $1 AND engagement_id = $2 AND status IN ('open', 'in_progress', 'submitted')) AS open_pbc_count,
         (SELECT COUNT(*)::int FROM audit_workpapers WHERE organization_id = $1 AND engagement_id = $2) AS workpaper_count,
         (SELECT COUNT(*)::int FROM audit_workpapers WHERE organization_id = $1 AND engagement_id = $2 AND status = 'finalized') AS finalized_workpaper_count,
         (SELECT COUNT(*)::int FROM audit_findings WHERE organization_id = $1 AND engagement_id = $2) AS finding_count,
         (SELECT COUNT(*)::int FROM audit_findings WHERE organization_id = $1 AND engagement_id = $2 AND status IN ('open', 'accepted', 'remediating')) AS open_finding_count,
         (SELECT COUNT(*)::int FROM audit_signoffs WHERE organization_id = $1 AND engagement_id = $2) AS signoff_count`,
      [req.user.organization_id, engagement.id]
    );

    res.json({
      success: true,
      data: {
        engagement: detail.rows[0] || engagement,
        summary: summary.rows[0]
      }
    });
  } catch (error) {
    console.error('Get audit engagement error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit engagement' });
  }
});

// ============================================================
// PATCH /api/v1/assessments/engagements/:id
// Update audit engagement
// ============================================================
router.patch('/engagements/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const {
      name,
      engagement_type,
      scope,
      framework_codes,
      status,
      period_start,
      period_end,
      lead_auditor_id,
      engagement_owner_id
    } = req.body || {};

    if (engagement_type && !VALID_ENGAGEMENT_TYPES.includes(String(engagement_type))) {
      return res.status(400).json({ success: false, error: `engagement_type must be one of: ${VALID_ENGAGEMENT_TYPES.join(', ')}` });
    }
    if (status && !VALID_ENGAGEMENT_STATUSES.includes(String(status))) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_ENGAGEMENT_STATUSES.join(', ')}` });
    }

    const currentLeadAuditorId = engagement.lead_auditor_id ? String(engagement.lead_auditor_id) : null;
    if (currentLeadAuditorId && lead_auditor_id !== undefined) {
      const requestedLeadAuditorId = lead_auditor_id ? String(lead_auditor_id) : null;
      if (requestedLeadAuditorId !== currentLeadAuditorId) {
        return res.status(409).json({
          success: false,
          error: 'Auditor assignment is locked after handoff and cannot be changed'
        });
      }
    }
    if (currentLeadAuditorId && status !== undefined && String(status) === 'planning') {
      return res.status(409).json({
        success: false,
        error: 'Engagement cannot be moved back to planning after auditor handoff'
      });
    }

    if (lead_auditor_id !== undefined && !(await ensureOrgUser(req.user.organization_id, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an active user in this organization' });
    }
    if (lead_auditor_id && !(await ensureOrgAuditorUser(req.user.organization_id, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an auditor user in this organization' });
    }
    if (engagement_owner_id !== undefined && !(await ensureOrgUser(req.user.organization_id, engagement_owner_id))) {
      return res.status(400).json({ success: false, error: 'engagement_owner_id must reference an active user in this organization' });
    }

    const updates = [];
    const params = [req.user.organization_id, engagement.id];
    let idx = 3;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name ? String(name).trim() : null); }
    if (engagement_type !== undefined) { updates.push(`engagement_type = $${idx++}`); params.push(String(engagement_type)); }
    if (scope !== undefined) { updates.push(`scope = $${idx++}`); params.push(scope ? String(scope) : null); }
    if (framework_codes !== undefined) { updates.push(`framework_codes = $${idx++}::text[]`); params.push(parseFrameworkCodes(framework_codes)); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(String(status)); }
    if (period_start !== undefined) { updates.push(`period_start = $${idx++}`); params.push(period_start || null); }
    if (period_end !== undefined) { updates.push(`period_end = $${idx++}`); params.push(period_end || null); }
    if (lead_auditor_id !== undefined) { updates.push(`lead_auditor_id = $${idx++}`); params.push(lead_auditor_id || null); }
    if (engagement_owner_id !== undefined) { updates.push(`engagement_owner_id = $${idx++}`); params.push(engagement_owner_id || null); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);

    const updated = await pool.query(
      `UPDATE audit_engagements
       SET ${updates.join(', ')}
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      params
    );

    await logAuditEvent(req, 'audit_engagement_updated', 'audit_engagement', engagement.id, {
      updated_fields: Object.keys(req.body || {})
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error('Update audit engagement error:', error);
    res.status(500).json({ success: false, error: 'Failed to update audit engagement' });
  }
});

// ============================================================
// GET /api/v1/assessments/engagements/:id/procedures
// List assessment procedures in-scope for the engagement frameworks
// ============================================================
router.get('/engagements/:id/procedures', requirePermission('assessments.read'), async (req, res) => {
  try {
    const engagement = await assertEngagementAccess(req, res);
    if (!engagement) return;

    const frameworkCodes = await resolveEngagementFrameworkCodes(req.user.organization_id, engagement);
    const {
      search,
      procedure_type,
      depth,
      result_status,
      limit = 250,
      offset = 0
    } = req.query;

    if (frameworkCodes.length === 0) {
      return res.json({
        success: true,
        data: {
          framework_codes: [],
          procedures: [],
          pagination: { total: 0, limit: toInt(limit, 250), offset: toInt(offset, 0) },
          note: 'No framework scope is set for this engagement or organization.'
        }
      });
    }

    const params = [req.user.organization_id, engagement.id, frameworkCodes];
    let idx = 4;
    let where = 'WHERE f.code = ANY($3::text[])';

    if (procedure_type) {
      where += ` AND ap.procedure_type = $${idx++}`;
      params.push(String(procedure_type));
    }
    if (depth) {
      where += ` AND ap.depth = $${idx++}`;
      params.push(String(depth));
    }
    if (result_status) {
      if (String(result_status) === 'not_assessed') {
        where += ' AND ar.status IS NULL';
      } else {
        where += ` AND ar.status = $${idx++}`;
        params.push(String(result_status));
      }
    }
    if (search) {
      where += ` AND (
        ap.title ILIKE $${idx}
        OR ap.description ILIKE $${idx}
        OR fc.control_id ILIKE $${idx}
        OR COALESCE(ap.procedure_id, '') ILIKE $${idx}
      )`;
      params.push(`%${String(search)}%`);
      idx++;
    }

    const query = `
      SELECT
        ap.id,
        ap.procedure_id,
        ap.procedure_type,
        ap.title,
        ap.description,
        ap.expected_evidence,
        ap.assessment_method,
        ap.depth,
        ap.frequency_guidance,
        ap.assessor_notes,
        ap.source_document,
        ap.sort_order,
        ap.framework_control_id,
        fc.control_id,
        fc.title AS control_title,
        f.code AS framework_code,
        f.name AS framework_name,
        COALESCE(ar.status, 'not_assessed') AS result_status,
        ar.assessed_at,
        (
          SELECT COUNT(*)::int
          FROM audit_pbc_requests p
          WHERE p.organization_id = $1
            AND p.engagement_id = $2
            AND p.assessment_procedure_id = ap.id
        ) AS linked_pbc_count,
        (
          SELECT COUNT(*)::int
          FROM audit_workpapers w
          WHERE w.organization_id = $1
            AND w.engagement_id = $2
            AND w.assessment_procedure_id = ap.id
        ) AS linked_workpaper_count
      FROM assessment_procedures ap
      JOIN framework_controls fc ON fc.id = ap.framework_control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN assessment_results ar
        ON ar.organization_id = $1
       AND ar.assessment_procedure_id = ap.id
      ${where}
      ORDER BY f.code, fc.control_id, ap.sort_order
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(toInt(limit, 250), toInt(offset, 0));
    const rows = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM assessment_procedures ap
      JOIN framework_controls fc ON fc.id = ap.framework_control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN assessment_results ar
        ON ar.organization_id = $1
       AND ar.assessment_procedure_id = ap.id
      ${where}
      AND $2::uuid IS NOT NULL
    `;
    const countParams = params.slice(0, params.length - 2);
    const countRows = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        framework_codes: frameworkCodes,
        procedures: rows.rows,
        pagination: {
          total: countRows.rows[0]?.total || 0,
          limit: toInt(limit, 250),
          offset: toInt(offset, 0)
        }
      }
    });
  } catch (error) {
    console.error('List engagement procedures error:', error);
    res.status(500).json({ success: false, error: 'Failed to list engagement procedures' });
  }
});

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
    console.error('Auto-create engagement PBC error:', error);
    res.status(500).json({ success: false, error: 'Failed to auto-create PBC requests' });
  }
});

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
      console.error('AI workpaper draft error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate AI workpaper draft' });
    }
  }
);

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
      console.error('AI PBC draft error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate AI PBC draft' });
    }
  }
);

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
      console.error('AI finding draft error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate AI finding draft' });
    }
  }
);

async function assertEngagementChildAccess(req, res, tableName, childIdParamName, notFoundMessage) {
  const engagement = await assertEngagementAccess(req, res);
  if (!engagement) return null;

  const childId = req.params[childIdParamName];
  const result = await pool.query(
    `SELECT id
     FROM ${tableName}
     WHERE organization_id = $1 AND engagement_id = $2 AND id = $3
     LIMIT 1`,
    [req.user.organization_id, engagement.id, childId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: notFoundMessage });
    return null;
  }

  return { engagement, childId };
}

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
    console.error('List engagement PBC error:', error);
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
    if (!(await ensureOrgUser(req.user.organization_id, assigned_to))) {
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
    console.error('Create engagement PBC error:', error);
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
    console.error('Update engagement PBC error:', error);
    res.status(500).json({ success: false, error: 'Failed to update PBC request' });
  }
});

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
    console.error('List engagement workpapers error:', error);
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
    if (!(await ensureOrgUser(req.user.organization_id, prepared_by))) {
      return res.status(400).json({ success: false, error: 'prepared_by must reference an active user in this organization' });
    }
    if (!(await ensureOrgUser(req.user.organization_id, reviewed_by))) {
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
    console.error('Create engagement workpaper error:', error);
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
    console.error('Update engagement workpaper error:', error);
    res.status(500).json({ success: false, error: 'Failed to update workpaper' });
  }
});

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
    console.error('List engagement findings error:', error);
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
    if (!(await ensureOrgUser(req.user.organization_id, owner_user_id))) {
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
    console.error('Create engagement finding error:', error);
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
    console.error('Update engagement finding error:', error);
    res.status(500).json({ success: false, error: 'Failed to update finding' });
  }
});

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
    console.error('List engagement signoffs error:', error);
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
    console.error('Create engagement signoff error:', error);
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
    console.error('Signoff readiness error:', error);
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
    console.error('Validation package build error:', error);
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
    console.error('Validation package PDF error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate validation package PDF' });
  }
});

router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ success: false, error: 'Template upload failed' });
  }
  return next(err);
});

module.exports = router;
