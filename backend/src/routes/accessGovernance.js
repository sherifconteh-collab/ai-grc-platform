// @tier: community
/**
 * Access governance routes: entitlement reporting, SoD rule management and
 * violation evaluation, role/permission simulation (positive and negative
 * access testing), access review certification campaigns, and AI-assisted
 * RBAC document import.
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const path = require('path');
const multer = require('multer');
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');
const { requireSod } = require('../middleware/sod');
const auditService = require('../services/auditService');
const accessGovernance = require('../services/accessGovernanceService');
const { decrypt } = require('../utils/encrypt');

// express-rate-limit applied router-wide, ahead of authenticate, so a cheap
// IP-based bound is in place before authenticate's DB/JWT work runs and so
// CodeQL can trace a recognized rate-limiting middleware covering every route
// below — the org-scoped limiter beneath remains the real production control.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

router.use(authenticate);

const accessGovernanceRateLimiter = createOrgRateLimiter({
  label: 'access-governance',
  windowMs: 15 * 60 * 1000,
  max: 120
});
router.use(accessGovernanceRateLimiter);

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_DECISIONS = ['certified', 'revoked'];
const VALID_DOCUMENT_TYPES = ['roles_matrix', 'sod_matrix', 'roles_responsibilities', 'other'];
const VALID_DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv'];

// Uploads are processed entirely in memory: only the extracted text is stored
// (rbac_documents.extracted_text) and the original file is discarded, so
// there is no file-serving surface for these documents.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!VALID_DOCUMENT_EXTENSIONS.includes(path.extname(file.originalname || '').toLowerCase())) {
      return cb(new Error(`Unsupported file type. Supported: ${VALID_DOCUMENT_EXTENSIONS.join(', ')}`));
    }
    return cb(null, true);
  }
});

// Buffer-based extraction (mirrors services/orgSettings.js's extractReportText
// pattern already used elsewhere in this codebase for memory-only uploads).
async function extractDocumentText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    return (await pdfParse(file.buffer)).text;
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  }
  return file.buffer.toString('utf8');
}

function respondError(res, error, fallbackMessage) {
  const statusCode = Number(error.statusCode) || 500;
  const message = statusCode < 500 ? error.message : fallbackMessage;
  res.status(statusCode).json({ success: false, error: message });
}

// GET /entitlements — who-has-what report with over-privilege flags
router.get('/entitlements', requirePermission('access_governance.read'), async (req, res) => {
  try {
    const report = await accessGovernance.getEntitlementReport(req.user.organization_id);
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Entitlement report error:', error);
    respondError(res, error, 'Failed to load entitlement report');
  }
});

// GET /sod/rules — active + inactive rules visible to this org (own + system)
router.get('/sod/rules', requirePermission('access_governance.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, organization_id, name, description, conflicting_permissions,
             severity, is_active, created_at, updated_at,
             (organization_id IS NULL) AS is_system_rule
      FROM sod_rules
      WHERE organization_id = $1 OR organization_id IS NULL
      ORDER BY (organization_id IS NULL) DESC, severity, name
    `, [req.user.organization_id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List SoD rules error:', error);
    res.status(500).json({ success: false, error: 'Failed to load SoD rules' });
  }
});

// POST /sod/rules — create an org-specific rule
router.post('/sod/rules', requirePermission('access_governance.manage'), validateBody((body) => {
  const errors = requireFields(body, ['name', 'conflictingPermissions']);
  if (body.conflictingPermissions !== undefined) {
    const list = body.conflictingPermissions;
    if (!Array.isArray(list) || list.length < 2 || list.some((item) => typeof item !== 'string' || !item.trim())) {
      errors.push('conflictingPermissions must be an array of at least 2 permission names');
    }
  }
  if (body.severity !== undefined && !VALID_SEVERITIES.includes(body.severity)) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }
  return errors;
}), async (req, res) => {
  try {
    const { name, description, conflictingPermissions, severity } = req.body;
    const uniquePermissions = Array.from(new Set(conflictingPermissions));

    const known = await pool.query(
      'SELECT name FROM permissions WHERE name = ANY($1::text[])',
      [uniquePermissions]
    );
    const knownNames = new Set(known.rows.map((row) => row.name));
    const unknown = uniquePermissions.filter((permName) => !knownNames.has(permName));
    if (unknown.length > 0) {
      return res.status(400).json({ success: false, error: `Unknown permission(s): ${unknown.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO sod_rules (organization_id, name, description, conflicting_permissions, severity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT sod_rules_org_name_unique DO NOTHING
       RETURNING *`,
      [req.user.organization_id, name, description || null,
       JSON.stringify(uniquePermissions), severity || 'high', req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'A rule with this name already exists' });
    }

    auditService.logFromRequest(req, {
      eventType: 'access_governance.sod_rule_created',
      resourceType: 'sod_rule',
      resourceId: result.rows[0].id,
      details: { name, conflictingPermissions: uniquePermissions, severity: severity || 'high' },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create SoD rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to create SoD rule' });
  }
});

// PATCH /sod/rules/:ruleId — update own-org rule (system rules are read-only)
router.patch('/sod/rules/:ruleId', requirePermission('access_governance.manage'), validateBody((body) => {
  const errors = [];
  if (body.severity !== undefined && !VALID_SEVERITIES.includes(body.severity)) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }
  return errors;
}), async (req, res) => {
  try {
    if (!isUuid(req.params.ruleId)) {
      return res.status(400).json({ success: false, error: 'ruleId must be a valid UUID' });
    }
    const { description, severity, isActive } = req.body;
    const result = await pool.query(
      `UPDATE sod_rules
       SET description = COALESCE($1, description),
           severity = COALESCE($2, severity),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING *`,
      [description, severity, isActive, req.params.ruleId, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SoD rule not found or is a system rule' });
    }

    auditService.logFromRequest(req, {
      eventType: 'access_governance.sod_rule_updated',
      resourceType: 'sod_rule',
      resourceId: result.rows[0].id,
      details: { severity, isActive },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update SoD rule error:', error);
    res.status(500).json({ success: false, error: 'Failed to update SoD rule' });
  }
});

// GET /sod/violations — evaluate all active rules against current entitlements
router.get('/sod/violations', requirePermission('access_governance.read'), async (req, res) => {
  try {
    const result = await accessGovernance.evaluateSodViolations(req.user.organization_id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('SoD violations error:', error);
    respondError(res, error, 'Failed to evaluate SoD violations');
  }
});

// POST /simulate — positive/negative access test for a proposed role/permission set
router.post('/simulate', requirePermission('access_governance.read'), validateBody((body) => {
  const errors = [];
  if (body.roleIds !== undefined && (!Array.isArray(body.roleIds) || body.roleIds.some((id) => !isUuid(id)))) {
    errors.push('roleIds must be an array of valid UUID values');
  }
  if (body.permissions !== undefined
    && (!Array.isArray(body.permissions) || body.permissions.some((item) => typeof item !== 'string'))) {
    errors.push('permissions must be an array of permission names');
  }
  if ((!body.roleIds || body.roleIds.length === 0) && (!body.permissions || body.permissions.length === 0)) {
    errors.push('Provide roleIds and/or permissions to simulate');
  }
  return errors;
}), async (req, res) => {
  try {
    const { roleIds, permissions } = req.body;
    const result = await accessGovernance.simulateAccess(req.user.organization_id, {
      roleIds: roleIds || [],
      permissions: permissions || []
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Access simulation error:', error);
    respondError(res, error, 'Failed to run access simulation');
  }
});

// GET /campaigns — paginated campaign list
router.get('/campaigns', requirePermission('access_governance.read'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT c.*,
             COUNT(i.id)::int AS item_count,
             COUNT(i.id) FILTER (WHERE i.decision = 'pending')::int AS pending_count
      FROM access_review_campaigns c
      LEFT JOIN access_review_items i ON i.campaign_id = c.id
      WHERE c.organization_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.organization_id, limit, offset]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List campaigns error:', error);
    res.status(500).json({ success: false, error: 'Failed to load campaigns' });
  }
});

// POST /campaigns — create draft campaign with entitlement snapshots
router.post('/campaigns', requirePermission('access_governance.manage'), validateBody((body) => {
  return requireFields(body, ['name']);
}), async (req, res) => {
  try {
    const { name, description, dueDate } = req.body;
    const campaign = await accessGovernance.createCampaign(
      req.user.organization_id,
      req.user.id,
      { name, description, dueDate }
    );

    auditService.logFromRequest(req, {
      eventType: 'access_governance.campaign_created',
      resourceType: 'access_review_campaign',
      resourceId: campaign.id,
      details: { name, item_count: campaign.item_count },
      success: true
    }).catch(() => {});

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    console.error('Create campaign error:', error);
    respondError(res, error, 'Failed to create campaign');
  }
});

// GET /campaigns/:campaignId — campaign detail with items
router.get('/campaigns/:campaignId', requirePermission('access_governance.read'), async (req, res) => {
  try {
    if (!isUuid(req.params.campaignId)) {
      return res.status(400).json({ success: false, error: 'campaignId must be a valid UUID' });
    }
    const orgId = req.user.organization_id;
    const campaign = await accessGovernance.getCampaign(orgId, req.params.campaignId);
    const items = await accessGovernance.listCampaignItems(orgId, req.params.campaignId);
    res.json({ success: true, data: { ...campaign, items } });
  } catch (error) {
    console.error('Get campaign error:', error);
    respondError(res, error, 'Failed to load campaign');
  }
});

async function transitionCampaignRoute(req, res, fromStatuses, toStatus, eventType) {
  try {
    if (!isUuid(req.params.campaignId)) {
      return res.status(400).json({ success: false, error: 'campaignId must be a valid UUID' });
    }
    const campaign = await accessGovernance.transitionCampaign(
      req.user.organization_id, req.params.campaignId, fromStatuses, toStatus
    );

    auditService.logFromRequest(req, {
      eventType,
      resourceType: 'access_review_campaign',
      resourceId: campaign.id,
      details: { status: toStatus },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error(`Campaign ${toStatus} error:`, error);
    respondError(res, error, `Failed to ${toStatus === 'active' ? 'activate' : 'cancel'} campaign`);
  }
}

// POST /campaigns/:campaignId/activate
router.post('/campaigns/:campaignId/activate', requirePermission('access_governance.manage'), (req, res) => {
  return transitionCampaignRoute(req, res, ['draft'], 'active', 'access_governance.campaign_activated');
});

// POST /campaigns/:campaignId/cancel
router.post('/campaigns/:campaignId/cancel', requirePermission('access_governance.manage'), (req, res) => {
  return transitionCampaignRoute(req, res, ['draft', 'active'], 'cancelled', 'access_governance.campaign_cancelled');
});

// PATCH /campaigns/:campaignId/items/:itemId — record certify/revoke decision
router.patch('/campaigns/:campaignId/items/:itemId', requirePermission('access_governance.manage'), validateBody((body) => {
  const errors = requireFields(body, ['decision']);
  if (body.decision !== undefined && !VALID_DECISIONS.includes(body.decision)) {
    errors.push(`decision must be one of: ${VALID_DECISIONS.join(', ')}`);
  }
  return errors;
}), async (req, res) => {
  try {
    const { campaignId, itemId } = req.params;
    if (!isUuid(campaignId) || !isUuid(itemId)) {
      return res.status(400).json({ success: false, error: 'campaignId and itemId must be valid UUIDs' });
    }
    const orgId = req.user.organization_id;

    const { rows: [item] } = await pool.query(
      'SELECT subject_user_id FROM access_review_items WHERE id = $1 AND campaign_id = $2 AND organization_id = $3',
      [itemId, campaignId, orgId]
    );
    if (!item) {
      return res.status(404).json({ success: false, error: 'Review item not found' });
    }

    // SoD: a reviewer cannot certify their own access (admin '*' may override;
    // the override is visible in the audit log entry below).
    const sodError = requireSod(item.subject_user_id, req.user.id, 'review subject', 'reviewer', req.user.permissions);
    if (sodError) {
      return res.status(403).json({ success: false, error: sodError });
    }

    const decided = await accessGovernance.decideItem(orgId, campaignId, itemId, req.user.id, {
      decision: req.body.decision,
      notes: req.body.notes
    });

    auditService.logFromRequest(req, {
      eventType: 'access_governance.review_decision',
      resourceType: 'access_review_item',
      resourceId: decided.id,
      details: {
        campaignId,
        subjectUserId: decided.subject_user_id,
        decision: decided.decision,
        selfReviewOverride: String(decided.subject_user_id) === String(req.user.id)
      },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: decided });
  } catch (error) {
    console.error('Review decision error:', error);
    respondError(res, error, 'Failed to record review decision');
  }
});

// POST /campaigns/:campaignId/complete — requires all items decided; generates evidence
router.post('/campaigns/:campaignId/complete', requirePermission('access_governance.manage'), async (req, res) => {
  try {
    if (!isUuid(req.params.campaignId)) {
      return res.status(400).json({ success: false, error: 'campaignId must be a valid UUID' });
    }
    const campaign = await accessGovernance.completeCampaign(
      req.user.organization_id, req.params.campaignId, req.user.id
    );

    auditService.logFromRequest(req, {
      eventType: 'access_governance.campaign_completed',
      resourceType: 'access_review_campaign',
      resourceId: campaign.id,
      details: { evidenceId: campaign.evidence_id, decisionCounts: campaign.decision_counts },
      success: true
    }).catch(() => {});

    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Complete campaign error:', error);
    respondError(res, error, 'Failed to complete campaign');
  }
});

// POST /rbac-documents — upload an RBAC document (roles matrix, SoD matrix,
// roles & responsibilities); text is extracted in memory and the file discarded
router.post('/rbac-documents', requirePermission('access_governance.manage'),
  documentUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'file is required' });
      }
      const documentType = req.body.document_type || 'other';
      if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
        return res.status(400).json({ success: false, error: `document_type must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` });
      }

      let extractedText;
      try {
        extractedText = (await extractDocumentText(req.file) || '').trim();
      } catch {
        return res.status(400).json({ success: false, error: 'Could not extract text from the uploaded file' });
      }
      if (!extractedText) {
        return res.status(400).json({ success: false, error: 'The uploaded file contains no extractable text' });
      }

      const result = await pool.query(
        `INSERT INTO rbac_documents (organization_id, uploaded_by, file_name, mime_type, file_size_bytes, document_type, extracted_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, file_name, mime_type, file_size_bytes, document_type, analyzed_at, created_at`,
        [req.user.organization_id, req.user.id, req.file.originalname, req.file.mimetype,
         req.file.size, documentType, extractedText]
      );

      auditService.logFromRequest(req, {
        eventType: 'access_governance.rbac_document_uploaded',
        resourceType: 'rbac_document',
        resourceId: result.rows[0].id,
        details: { fileName: req.file.originalname, documentType, sizeBytes: req.file.size },
        success: true
      }).catch(() => {});

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('Upload RBAC document error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload RBAC document' });
    }
  });

// GET /rbac-documents — paginated list (metadata + stored analysis, not the raw text)
router.get('/rbac-documents', requirePermission('access_governance.read'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT d.id, d.file_name, d.mime_type, d.file_size_bytes, d.document_type,
              d.analysis, d.analyzed_at, d.created_at, u.email AS uploaded_by_email
       FROM rbac_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.organization_id = $1
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.organization_id, limit, offset]
    );
    // uploaded_by_email comes from users.email, which is field-level
    // encrypted at rest (see routes/users.js) — decrypt post-query.
    const rows = result.rows.map((row) => ({
      ...row,
      uploaded_by_email: row.uploaded_by_email ? decrypt(row.uploaded_by_email) : null
    }));
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List RBAC documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to load RBAC documents' });
  }
});

// PUT /rbac-documents/:documentId/analysis — persist a reviewed AI analysis
router.put('/rbac-documents/:documentId/analysis', requirePermission('access_governance.manage'),
  validateBody((body) => requireFields(body, ['analysis'])), async (req, res) => {
    try {
      if (!isUuid(req.params.documentId)) {
        return res.status(400).json({ success: false, error: 'documentId must be a valid UUID' });
      }
      if (typeof req.body.analysis !== 'object' || Array.isArray(req.body.analysis)) {
        return res.status(400).json({ success: false, error: 'analysis must be an object' });
      }
      const result = await pool.query(
        `UPDATE rbac_documents
         SET analysis = $1, analyzed_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND organization_id = $3
         RETURNING id, file_name, document_type, analysis, analyzed_at`,
        [JSON.stringify(req.body.analysis), req.params.documentId, req.user.organization_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'RBAC document not found' });
      }

      auditService.logFromRequest(req, {
        eventType: 'access_governance.rbac_analysis_saved',
        resourceType: 'rbac_document',
        resourceId: result.rows[0].id,
        success: true
      }).catch(() => {});

      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('Save RBAC analysis error:', error);
      res.status(500).json({ success: false, error: 'Failed to save analysis' });
    }
  });

// DELETE /rbac-documents/:documentId
router.delete('/rbac-documents/:documentId', requirePermission('access_governance.manage'), async (req, res) => {
  try {
    if (!isUuid(req.params.documentId)) {
      return res.status(400).json({ success: false, error: 'documentId must be a valid UUID' });
    }
    const result = await pool.query(
      'DELETE FROM rbac_documents WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.documentId, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'RBAC document not found' });
    }

    auditService.logFromRequest(req, {
      eventType: 'access_governance.rbac_document_deleted',
      resourceType: 'rbac_document',
      resourceId: req.params.documentId,
      success: true
    }).catch(() => {});

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Delete RBAC document error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete RBAC document' });
  }
});

module.exports = router;
