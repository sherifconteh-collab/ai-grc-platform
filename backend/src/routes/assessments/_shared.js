/**
 * Shared constants and helper functions for the assessments route tree.
 *
 * Extracted from routes/assessments.js as part of monolith split (4.1).
 * All logic is identical to the original inline definitions. The thin
 * orchestrator in routes/assessments.js requires the exported symbols and
 * passes `router` into each sub-route module (procedures / engagements /
 * evidence / findings).
 */

'use strict';

const multer = require('multer');
const path = require('path');
const pool = require('../../config/database');
const { log } = require('../../utils/logger');

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

// ---- Moved from the engagements block (was defined inside assessments.js after line 2500) ----
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

module.exports = {
  // Constants
  VALID_ENGAGEMENT_TYPES,
  VALID_ENGAGEMENT_STATUSES,
  VALID_PBC_PRIORITIES,
  VALID_PBC_STATUSES,
  VALID_WORKPAPER_STATUSES,
  VALID_FINDING_SEVERITIES,
  VALID_FINDING_STATUSES,
  VALID_SIGNOFF_TYPES,
  VALID_SIGNOFF_STATUSES,
  VALID_AUDIT_TEMPLATE_TYPES,
  TEMPLATE_MAX_CHARS,
  SIGNOFF_ROLE_CONFIG,
  templateUpload,
  // Helpers
  toInt,
  parseFrameworkCodes,
  truncateText,
  normalizeNullableText,
  parseBooleanFlag,
  normalizeAiResponseToText,
  extractJsonObject,
  renderTemplate,
  extractTemplateText,
  getDefaultAuditTemplate,
  getEngagementById,
  assertEngagementAccess,
  ensureOrgUser,
  ensureOrgAuditorUser,
  resolveEngagementFrameworkCodes,
  getAssessmentProcedureById,
  assertProcedureAllowedForEngagement,
  buildValidationChecklist,
  logAuditEvent,
  assertEngagementChildAccess,
};
