// @tier: enterprise
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission, requireTier } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { requireProEdition } = require('../middleware/edition');

router.use(authenticate);
router.use(requireProEdition('tprm')); // Edition check BEFORE tier check
router.use(requireTier('enterprise')); // TPRM requires Enterprise tier or higher

// Rate limiter: 120 requests per 15 minutes per org
const tprmRateLimiter = createRateLimiter({
  label: 'tprm',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});
router.use(tprmRateLimiter);

const VALID_VENDOR_TYPES = ['software', 'hardware', 'services', 'cloud', 'managed_service', 'data_processor', 'other'];
const VALID_RISK_TIERS = ['critical', 'high', 'medium', 'low'];
const VALID_REVIEW_STATUSES = ['pending_review', 'in_review', 'approved', 'conditional', 'rejected', 'decommissioned'];
const VALID_DATA_ACCESS = ['none', 'metadata', 'limited', 'full'];
const VALID_DOC_TYPES = ['soc2_report', 'iso27001_cert', 'pen_test_report', 'privacy_policy', 'dpa', 'baa', 'insurance_cert', 'business_continuity_plan', 'incident_response_plan', 'other'];

// Escape special characters in ILIKE patterns to prevent wildcard injection
function escapeIlike(str) {
  return String(str).replace(/[%_\\]/g, '\\$&');
}
const VALID_DOC_STATUSES = ['requested', 'received', 'under_review', 'accepted', 'rejected', 'expired'];
const VALID_Q_STATUSES = ['draft', 'sent', 'in_progress', 'completed', 'overdue', 'cancelled'];

// ==================== VENDORS ====================

// GET /api/v1/tprm/vendors
router.get('/vendors', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { risk_tier, review_status, search } = req.query;

    const params = [orgId];
    let where = 'WHERE v.organization_id = $1';

    if (risk_tier && VALID_RISK_TIERS.includes(risk_tier)) {
      params.push(risk_tier);
      where += ` AND v.risk_tier = $${params.length}`;
    }
    if (review_status && VALID_REVIEW_STATUSES.includes(review_status)) {
      params.push(review_status);
      where += ` AND v.review_status = $${params.length}`;
    }
    if (search) {
      params.push(`%${escapeIlike(String(search).trim())}%`);
      where += ` AND (v.vendor_name ILIKE $${params.length} OR v.services_provided ILIKE $${params.length})`;
    }

    const result = await pool.query(
      `SELECT v.*,
         (SELECT COUNT(*) FROM tprm_questionnaires q WHERE q.vendor_id = v.id) AS questionnaire_count,
         (SELECT COUNT(*) FROM tprm_documents d WHERE d.vendor_id = v.id) AS document_count,
         a.name AS cmdb_asset_name,
         a.status AS cmdb_asset_status
       FROM tprm_vendors v
       LEFT JOIN assets a ON a.id = v.cmdb_asset_id AND a.organization_id = v.organization_id
       ${where}
       ORDER BY
         CASE v.risk_tier WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         v.vendor_name ASC`,
      params
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('TPRM list vendors error:', error);
    res.status(500).json({ success: false, error: 'Failed to list vendors' });
  }
});

// GET /api/v1/tprm/vendors/:id
router.get('/vendors/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT v.*,
         a.name AS cmdb_asset_name,
         a.status AS cmdb_asset_status,
         ac.name AS cmdb_asset_category
       FROM tprm_vendors v
       LEFT JOIN assets a ON a.id = v.cmdb_asset_id AND a.organization_id = v.organization_id
       LEFT JOIN asset_categories ac ON ac.id = a.category_id
       WHERE v.id = $1 AND v.organization_id = $2`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const questionnaires = await pool.query(
      'SELECT id, title, status, due_date, sent_at, completed_at, overall_score, ai_generated FROM tprm_questionnaires WHERE vendor_id = $1 ORDER BY created_at DESC',
      [id]
    );

    const documents = await pool.query(
      'SELECT id, document_type, document_name, request_status, requested_at, received_at, expires_at FROM tprm_documents WHERE vendor_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        questionnaires: questionnaires.rows,
        documents: documents.rows
      }
    });
  } catch (error) {
    console.error('TPRM get vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to get vendor' });
  }
});

// POST /api/v1/tprm/vendors
router.post('/vendors', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      vendor_name, vendor_website, vendor_contact_name, vendor_contact_email,
      vendor_type, risk_tier, review_status, next_review_date, data_access_level,
      services_provided, notes, cmdb_asset_id
    } = req.body || {};

    if (!vendor_name) {
      return res.status(400).json({ success: false, error: 'vendor_name is required' });
    }
    if (vendor_type && !VALID_VENDOR_TYPES.includes(vendor_type)) {
      return res.status(400).json({ success: false, error: `Invalid vendor_type. Must be one of: ${VALID_VENDOR_TYPES.join(', ')}` });
    }
    if (risk_tier && !VALID_RISK_TIERS.includes(risk_tier)) {
      return res.status(400).json({ success: false, error: `Invalid risk_tier. Must be one of: ${VALID_RISK_TIERS.join(', ')}` });
    }
    if (data_access_level && !VALID_DATA_ACCESS.includes(data_access_level)) {
      return res.status(400).json({ success: false, error: `Invalid data_access_level. Must be one of: ${VALID_DATA_ACCESS.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO tprm_vendors
         (organization_id, vendor_name, vendor_website, vendor_contact_name, vendor_contact_email,
          vendor_type, risk_tier, review_status, next_review_date, data_access_level,
          services_provided, notes, cmdb_asset_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        orgId, vendor_name, vendor_website || null, vendor_contact_name || null,
        vendor_contact_email || null, vendor_type || 'other', risk_tier || 'medium',
        review_status || 'pending_review', next_review_date || null,
        data_access_level || 'none', services_provided || null, notes || null,
        cmdb_asset_id || null, req.user.id
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1,$2,'tprm_vendor_created','tprm_vendor',$3,$4::jsonb,true)`,
      [orgId, req.user.id, result.rows[0].id, JSON.stringify({ vendor_name, risk_tier: result.rows[0].risk_tier })]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM create vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to create vendor' });
  }
});

// PATCH /api/v1/tprm/vendors/:id
router.patch('/vendors/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const {
      vendor_name, vendor_website, vendor_contact_name, vendor_contact_email,
      vendor_type, risk_tier, review_status, next_review_date, last_review_date,
      data_access_level, services_provided, notes, cmdb_asset_id
    } = req.body || {};

    const existing = await pool.query(
      'SELECT id FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    if (vendor_type && !VALID_VENDOR_TYPES.includes(vendor_type)) {
      return res.status(400).json({ success: false, error: `Invalid vendor_type. Must be one of: ${VALID_VENDOR_TYPES.join(', ')}` });
    }
    if (risk_tier && !VALID_RISK_TIERS.includes(risk_tier)) {
      return res.status(400).json({ success: false, error: `Invalid risk_tier. Must be one of: ${VALID_RISK_TIERS.join(', ')}` });
    }
    if (review_status && !VALID_REVIEW_STATUSES.includes(review_status)) {
      return res.status(400).json({ success: false, error: `Invalid review_status. Must be one of: ${VALID_REVIEW_STATUSES.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE tprm_vendors SET
         vendor_name = COALESCE($3, vendor_name),
         vendor_website = COALESCE($4, vendor_website),
         vendor_contact_name = COALESCE($5, vendor_contact_name),
         vendor_contact_email = COALESCE($6, vendor_contact_email),
         vendor_type = COALESCE($7, vendor_type),
         risk_tier = COALESCE($8, risk_tier),
         review_status = COALESCE($9, review_status),
         next_review_date = COALESCE($10, next_review_date),
         last_review_date = COALESCE($11, last_review_date),
         data_access_level = COALESCE($12, data_access_level),
         services_provided = COALESCE($13, services_provided),
         notes = COALESCE($14, notes),
         cmdb_asset_id = COALESCE($15, cmdb_asset_id),
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        id, orgId, vendor_name || null, vendor_website || null, vendor_contact_name || null,
        vendor_contact_email || null, vendor_type || null, risk_tier || null,
        review_status || null, next_review_date || null, last_review_date || null,
        data_access_level || null, services_provided || null, notes || null,
        cmdb_asset_id || null
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1,$2,'tprm_vendor_updated','tprm_vendor',$3,$4::jsonb,true)`,
      [orgId, req.user.id, id, JSON.stringify({ vendor_name: result.rows[0].vendor_name, review_status: result.rows[0].review_status })]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM update vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to update vendor' });
  }
});

// DELETE /api/v1/tprm/vendors/:id
router.delete('/vendors/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tprm_vendors WHERE id = $1 AND organization_id = $2 RETURNING vendor_name',
      [id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1,$2,'tprm_vendor_deleted','tprm_vendor',$3,$4::jsonb,true)`,
      [orgId, req.user.id, id, JSON.stringify({ vendor_name: result.rows[0].vendor_name })]
    );

    res.json({ success: true, message: 'Vendor deleted' });
  } catch (error) {
    console.error('TPRM delete vendor error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete vendor' });
  }
});

// ==================== QUESTIONNAIRES ====================

// GET /api/v1/tprm/questionnaires
router.get('/questionnaires', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, status } = req.query;

    const params = [orgId];
    let where = 'WHERE q.organization_id = $1';

    if (vendor_id) {
      params.push(vendor_id);
      where += ` AND q.vendor_id = $${params.length}`;
    }
    if (status && VALID_Q_STATUSES.includes(status)) {
      params.push(status);
      where += ` AND q.status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT q.id, q.vendor_id, q.title, q.description, q.status, q.due_date,
              q.sent_at, q.completed_at, q.overall_score, q.ai_generated, q.created_at,
              v.vendor_name, v.risk_tier
       FROM tprm_questionnaires q
       LEFT JOIN tprm_vendors v ON v.id = q.vendor_id
       ${where}
       ORDER BY q.created_at DESC`,
      params
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('TPRM list questionnaires error:', error);
    res.status(500).json({ success: false, error: 'Failed to list questionnaires' });
  }
});

// GET /api/v1/tprm/questionnaires/:id
router.get('/questionnaires/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT q.*, v.vendor_name, v.risk_tier, v.vendor_contact_email
       FROM tprm_questionnaires q
       LEFT JOIN tprm_vendors v ON v.id = q.vendor_id
       WHERE q.id = $1 AND q.organization_id = $2`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM get questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to get questionnaire' });
  }
});

// POST /api/v1/tprm/questionnaires
router.post('/questionnaires', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, title, description, due_date, questions, ai_generated } = req.body || {};

    if (!vendor_id || !title) {
      return res.status(400).json({ success: false, error: 'vendor_id and title are required' });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'questions must be a non-empty array' });
    }

    // Verify vendor belongs to org
    const vendorCheck = await pool.query(
      'SELECT id FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
      [vendor_id, orgId]
    );
    if (vendorCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const result = await pool.query(
      `INSERT INTO tprm_questionnaires
         (organization_id, vendor_id, title, description, due_date, questions, ai_generated, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       RETURNING *`,
      [orgId, vendor_id, title, description || null, due_date || null, JSON.stringify(questions), Boolean(ai_generated), req.user.id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1,$2,'tprm_questionnaire_created','tprm_questionnaire',$3,$4::jsonb,true)`,
      [orgId, req.user.id, result.rows[0].id, JSON.stringify({ vendor_id, title })]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM create questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to create questionnaire' });
  }
});

// PATCH /api/v1/tprm/questionnaires/:id
router.patch('/questionnaires/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { title, description, due_date, status, questions, responses, overall_score, ai_analysis } = req.body || {};

    if (status && !VALID_Q_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_Q_STATUSES.join(', ')}` });
    }

    const existing = await pool.query(
      'SELECT id FROM tprm_questionnaires WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const result = await pool.query(
      `UPDATE tprm_questionnaires SET
         title = COALESCE($3, title),
         description = COALESCE($4, description),
         due_date = COALESCE($5, due_date),
         status = COALESCE($6, status),
         questions = COALESCE($7::jsonb, questions),
         responses = COALESCE($8::jsonb, responses),
         overall_score = COALESCE($9, overall_score),
         ai_analysis = COALESCE($10, ai_analysis),
         sent_at = CASE WHEN $6 = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
         completed_at = CASE WHEN $6 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        id, orgId, title || null, description || null, due_date || null,
        status || null,
        questions ? JSON.stringify(questions) : null,
        responses ? JSON.stringify(responses) : null,
        overall_score !== undefined ? overall_score : null,
        ai_analysis || null
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM update questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to update questionnaire' });
  }
});

// DELETE /api/v1/tprm/questionnaires/:id
router.delete('/questionnaires/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tprm_questionnaires WHERE id = $1 AND organization_id = $2 RETURNING title',
      [id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    res.json({ success: true, message: 'Questionnaire deleted' });
  } catch (error) {
    console.error('TPRM delete questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete questionnaire' });
  }
});

// ==================== DOCUMENTS ====================

// GET /api/v1/tprm/documents
router.get('/documents', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, request_status } = req.query;

    const params = [orgId];
    let where = 'WHERE d.organization_id = $1';

    if (vendor_id) {
      params.push(vendor_id);
      where += ` AND d.vendor_id = $${params.length}`;
    }
    if (request_status && VALID_DOC_STATUSES.includes(request_status)) {
      params.push(request_status);
      where += ` AND d.request_status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT d.*, v.vendor_name, v.risk_tier
       FROM tprm_documents d
       LEFT JOIN tprm_vendors v ON v.id = d.vendor_id
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('TPRM list documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

// POST /api/v1/tprm/documents
router.post('/documents', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, document_type, document_name, expires_at, notes } = req.body || {};

    if (!vendor_id || !document_type || !document_name) {
      return res.status(400).json({ success: false, error: 'vendor_id, document_type, and document_name are required' });
    }
    if (!VALID_DOC_TYPES.includes(document_type)) {
      return res.status(400).json({ success: false, error: `Invalid document_type. Must be one of: ${VALID_DOC_TYPES.join(', ')}` });
    }

    // Verify vendor belongs to org
    const vendorCheck = await pool.query(
      'SELECT id FROM tprm_vendors WHERE id = $1 AND organization_id = $2',
      [vendor_id, orgId]
    );
    if (vendorCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const result = await pool.query(
      `INSERT INTO tprm_documents
         (organization_id, vendor_id, document_type, document_name, expires_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [orgId, vendor_id, document_type, document_name, expires_at || null, notes || null, req.user.id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1,$2,'tprm_document_requested','tprm_document',$3,$4::jsonb,true)`,
      [orgId, req.user.id, result.rows[0].id, JSON.stringify({ vendor_id, document_type, document_name })]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM create document error:', error);
    res.status(500).json({ success: false, error: 'Failed to create document request' });
  }
});

// PATCH /api/v1/tprm/documents/:id
router.patch('/documents/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { request_status, received_at, expires_at, notes, file_url } = req.body || {};

    if (request_status && !VALID_DOC_STATUSES.includes(request_status)) {
      return res.status(400).json({ success: false, error: `Invalid request_status. Must be one of: ${VALID_DOC_STATUSES.join(', ')}` });
    }

    const existing = await pool.query(
      'SELECT id FROM tprm_documents WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const result = await pool.query(
      `UPDATE tprm_documents SET
         request_status = COALESCE($3, request_status),
         received_at = CASE WHEN $3 = 'received' THEN COALESCE(received_at, NOW()) ELSE COALESCE($4, received_at) END,
         expires_at = COALESCE($5, expires_at),
         notes = COALESCE($6, notes),
         file_url = COALESCE($7, file_url),
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, orgId, request_status || null, received_at || null, expires_at || null, notes || null, file_url || null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM update document error:', error);
    res.status(500).json({ success: false, error: 'Failed to update document' });
  }
});

// DELETE /api/v1/tprm/documents/:id
router.delete('/documents/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tprm_documents WHERE id = $1 AND organization_id = $2 RETURNING document_name',
      [id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('TPRM delete document error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

// ==================== SUMMARY ====================

// GET /api/v1/tprm/summary
router.get('/summary', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const [vendors, questionnaires, documents] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE risk_tier = 'critical') AS critical_count,
           COUNT(*) FILTER (WHERE risk_tier = 'high') AS high_count,
           COUNT(*) FILTER (WHERE risk_tier = 'medium') AS medium_count,
           COUNT(*) FILTER (WHERE risk_tier = 'low') AS low_count,
           COUNT(*) FILTER (WHERE review_status = 'pending_review') AS pending_review_count,
           COUNT(*) FILTER (WHERE next_review_date <= NOW() + INTERVAL '30 days' AND review_status NOT IN ('rejected','decommissioned')) AS due_for_review_count,
           COUNT(*) AS total_count
         FROM tprm_vendors WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
           COUNT(*) FILTER (WHERE status IN ('sent','in_progress')) AS open_count,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
           COUNT(*) AS total_count
         FROM tprm_questionnaires WHERE organization_id = $1`,
        [orgId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE request_status = 'requested') AS requested_count,
           COUNT(*) FILTER (WHERE expires_at <= NOW() + INTERVAL '90 days' AND request_status = 'accepted') AS expiring_count,
           COUNT(*) AS total_count
         FROM tprm_documents WHERE organization_id = $1`,
        [orgId]
      )
    ]);

    res.json({
      success: true,
      data: {
        vendors: vendors.rows[0],
        questionnaires: questionnaires.rows[0],
        documents: documents.rows[0]
      }
    });
  } catch (error) {
    console.error('TPRM summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to get TPRM summary' });
  }
});

// POST /api/v1/tprm/vendors/:id/store-ai-assessment
router.post('/vendors/:id/store-ai-assessment', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { ai_risk_summary, ai_risk_score } = req.body || {};

    if (ai_risk_score !== undefined && (typeof ai_risk_score !== 'number' || ai_risk_score < 0 || ai_risk_score > 100)) {
      return res.status(400).json({ success: false, error: 'ai_risk_score must be a number between 0 and 100' });
    }

    const result = await pool.query(
      `UPDATE tprm_vendors SET
         ai_risk_summary = COALESCE($3, ai_risk_summary),
         ai_risk_score = COALESCE($4, ai_risk_score),
         ai_assessed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, orgId, ai_risk_summary || null, ai_risk_score !== undefined ? ai_risk_score : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM store AI assessment error:', error);
    res.status(500).json({ success: false, error: 'Failed to store AI assessment' });
  }
});

// GET /api/v1/tprm/cmdb-assets - Search CMDB assets for linking to vendors
router.get('/cmdb-assets', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const search = req.query.search ? String(req.query.search) : null;

    const params = [orgId];
    let searchClause = '';
    if (search) {
      params.push(`%${escapeIlike(String(search).trim())}%`);
      searchClause = `AND (a.name ILIKE $${params.length} OR a.manufacturer ILIKE $${params.length} OR a.model ILIKE $${params.length})`;
    }

    const result = await pool.query(
      `SELECT a.id, a.name, a.status, a.criticality, a.manufacturer, a.model, a.version,
              ac.name AS category_name,
              a.notes
       FROM assets a
       LEFT JOIN asset_categories ac ON ac.id = a.category_id
       WHERE a.organization_id = $1 AND a.status != 'decommissioned'
       ${searchClause}
       ORDER BY a.name
       LIMIT 100`,
      params
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('TPRM CMDB assets search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search CMDB assets' });
  }
});

// GET /api/v1/tprm/cmdb-assets/:assetId/vendors - Get TPRM vendors linked to a CMDB asset
router.get('/cmdb-assets/:assetId/vendors', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { assetId } = req.params;

    const result = await pool.query(
      `SELECT v.id, v.vendor_name, v.vendor_type, v.risk_tier, v.review_status,
              v.data_access_level, v.ai_risk_score, v.next_review_date
       FROM tprm_vendors v
       WHERE v.cmdb_asset_id = $1 AND v.organization_id = $2
       ORDER BY v.vendor_name`,
      [assetId, orgId]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('TPRM CMDB asset vendors error:', error);
    res.status(500).json({ success: false, error: 'Failed to get vendors for asset' });
  }
});

// ==================== QUESTIONNAIRE EMAIL DELIVERY ====================

// POST /api/v1/tprm/questionnaires/:id/send
// Sends the questionnaire to the vendor by email and records sent_at + access token
router.post('/questionnaires/:id/send', requirePermission('organizations.read'), async (req, res) => {
  const { randomBytes } = require('crypto');
  const { sendNotificationEmail } = require('../services/emailService');
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { recipient_email } = req.body || {};

    // Load questionnaire + vendor info
    const qResult = await pool.query(
      `SELECT q.*, v.vendor_name, v.vendor_contact_email, o.name AS org_name
       FROM tprm_questionnaires q
       JOIN tprm_vendors v ON v.id = q.vendor_id
       JOIN organizations o ON o.id = q.organization_id
       WHERE q.id = $1 AND q.organization_id = $2`,
      [id, orgId]
    );
    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const q = qResult.rows[0];

    // Determine recipient email
    const toEmail = recipient_email || q.vendor_contact_email;
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({
        success: false,
        error: 'A valid recipient_email is required (or set a vendor contact email on the vendor record)'
      });
    }

    // Generate a cryptographically random access token if not already set
    const accessToken = q.access_token || randomBytes(48).toString('hex');

    // Build the respond link using FRONTEND_URL
    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const respondLink = `${frontendBase}/tprm/respond/${accessToken}`;

    // Build question list for the email body
    const questions = Array.isArray(q.questions) ? q.questions : [];
    const questionListHtml = questions.map((question, i) => {
      const qObj = typeof question === 'object' ? question : {};
      return `<li style="margin-bottom:8px"><strong>Q${i + 1}${qObj.category ? ` (${qObj.category})` : ''}:</strong> ${qObj.question || question}</li>`;
    }).join('');

    const dueDateHtml = q.due_date
      ? `<p style="color:#374151"><strong>Due by:</strong> ${new Date(q.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`
      : '';

    // Send the email
    const emailBody = {
      title: `Security Questionnaire: ${q.title}`,
      message: `
        <p>${q.org_name} has sent you a security questionnaire as part of their third-party risk management process.</p>
        ${q.description ? `<p><em>${q.description}</em></p>` : ''}
        ${dueDateHtml}
        <p><strong>Questionnaire: ${q.title}</strong></p>
        <p>This questionnaire contains ${questions.length} question${questions.length !== 1 ? 's' : ''} covering your organisation's security posture.</p>
        ${questionListHtml ? `<ul style="margin-top:12px">${questionListHtml}</ul>` : ''}
        <p style="margin-top:16px"><a href="${respondLink}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Open &amp; Complete Questionnaire →</a></p>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px">If the button above doesn't work, copy and paste this link into your browser:<br/>${respondLink}</p>
      `,
      link: null
    };

    await sendNotificationEmail({ email: toEmail, full_name: q.vendor_name }, emailBody, orgId);

    // Update questionnaire: set token, sent_at, status, vendor_email
    const updated = await pool.query(
      `UPDATE tprm_questionnaires SET
         access_token = $3,
         vendor_email = $4,
         sent_at = COALESCE(sent_at, NOW()),
         status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, status, sent_at, vendor_email, access_token`,
      [id, orgId, accessToken, toEmail]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1,$2,'tprm_questionnaire_sent','tprm_questionnaire',$3,$4::jsonb,true)`,
      [orgId, req.user.id, id, JSON.stringify({ to: toEmail, questionnaire_title: q.title })]
    );

    res.json({
      success: true,
      data: updated.rows[0],
      message: `Questionnaire sent to ${toEmail}`
    });
  } catch (error) {
    console.error('TPRM send questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to send questionnaire' });
  }
});

// POST /api/v1/tprm/questionnaires/:id/remind
// Sends a reminder email to the vendor
router.post('/questionnaires/:id/remind', requirePermission('organizations.read'), async (req, res) => {
  const { sendNotificationEmail } = require('../services/emailService');
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const qResult = await pool.query(
      `SELECT q.*, v.vendor_name, o.name AS org_name
       FROM tprm_questionnaires q
       JOIN tprm_vendors v ON v.id = q.vendor_id
       JOIN organizations o ON o.id = q.organization_id
       WHERE q.id = $1 AND q.organization_id = $2`,
      [id, orgId]
    );
    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const q = qResult.rows[0];

    if (!q.vendor_email || !q.access_token) {
      return res.status(400).json({ success: false, error: 'Questionnaire has not been sent yet. Use the send endpoint first.' });
    }

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const respondLink = `${frontendBase}/tprm/respond/${q.access_token}`;

    await sendNotificationEmail({ email: q.vendor_email, full_name: q.vendor_name }, {
      title: `Reminder: Security Questionnaire — ${q.title}`,
      message: `This is a reminder that ${q.org_name} is awaiting your response to the security questionnaire "${q.title}".${q.due_date ? ` The deadline is ${new Date(q.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.` : ''}`,
      link: respondLink
    }, orgId);

    await pool.query(
      `UPDATE tprm_questionnaires SET reminder_sent_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    res.json({ success: true, message: `Reminder sent to ${q.vendor_email}` });
  } catch (error) {
    console.error('TPRM remind questionnaire error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reminder' });
  }
});

// ==================== EVIDENCE (internal view) ====================

// GET /api/v1/tprm/questionnaires/:id/evidence
// List all evidence files uploaded by a vendor for this questionnaire
router.get('/questionnaires/:id/evidence', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    // Verify questionnaire belongs to org
    const qCheck = await pool.query(
      `SELECT id FROM tprm_questionnaires WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, orgId]
    );
    if (qCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const result = await pool.query(
      `SELECT id, original_filename, file_size_bytes, mime_type,
              is_sbom, sbom_format, sbom_component_count, sbom_summary,
              ai_analysis, ai_analyzed_at, ai_risk_flags, uploaded_at
       FROM tprm_evidence
       WHERE questionnaire_id = $1
       ORDER BY uploaded_at DESC`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('TPRM get evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to load evidence' });
  }
});

// DELETE /api/v1/tprm/evidence/:evidenceId
router.delete('/evidence/:evidenceId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { evidenceId } = req.params;

    const result = await pool.query(
      `DELETE FROM tprm_evidence WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [evidenceId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    res.json({ success: true, message: 'Evidence deleted' });
  } catch (error) {
    console.error('TPRM delete evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete evidence' });
  }
});

// POST /api/v1/tprm/evidence/:evidenceId/store-ai-analysis
// Persist AI evidence analysis results (called after the AI endpoint returns)
router.post('/evidence/:evidenceId/store-ai-analysis', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { evidenceId } = req.params;
    const { ai_analysis, ai_risk_flags } = req.body || {};

    if (!ai_analysis) {
      return res.status(400).json({ success: false, error: 'ai_analysis is required' });
    }

    const result = await pool.query(
      `UPDATE tprm_evidence
       SET ai_analysis = $3, ai_risk_flags = $4, ai_analyzed_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, ai_analyzed_at`,
      [evidenceId, orgId, String(ai_analysis),
       ai_risk_flags ? JSON.stringify(ai_risk_flags) : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('TPRM store AI evidence analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to store AI analysis' });
  }
});

module.exports = router;
