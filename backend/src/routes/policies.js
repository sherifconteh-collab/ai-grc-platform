// @tier: free
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireSod } = require('../middleware/sod');
const { generatePolicyFromFrameworks } = require('../services/policyService');
const { createNotification } = require('../services/notificationService');
const {
  performGapAnalysis,
  setAsBaseline,
  generatePolicyFromBaseline,
  extractPolicyText
} = require('../services/policyGapService');

router.use(authenticate);

const ALLOWED_POLICY_STATUSES = ['draft', 'under_review', 'approved', 'published', 'archived'];
const ALLOWED_REVIEW_TYPES = ['annual', 'triggered', 'ad_hoc', 'change_driven'];
const ALLOWED_REVIEW_STATUSES = ['scheduled', 'in_progress', 'completed', 'overdue'];

// GET /api/v1/policies
// List all policies for organization
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, policy_type, limit = 100, offset = 0 } = req.query;

    const where = ['organization_id = $1'];
    const params = [orgId];
    let idx = 2;

    if (status && ALLOWED_POLICY_STATUSES.includes(String(status))) {
      where.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (policy_type) {
      where.push(`policy_type = $${idx}`);
      params.push(String(policy_type));
      idx++;
    }

    const qLimit = Math.max(1, Math.min(500, Number(limit)));
    const qOffset = Math.max(0, Number(offset));

    const result = await pool.query(
      `SELECT 
         p.*,
         creator.email AS created_by_email,
         approver.email AS approved_by_email,
         (SELECT COUNT(*)::int FROM policy_sections ps WHERE ps.policy_id = p.id) AS section_count,
         (SELECT COUNT(*)::int FROM policy_control_mappings pcm 
          JOIN policy_sections ps ON ps.id = pcm.policy_section_id 
          WHERE ps.policy_id = p.id) AS mapped_controls_count
       FROM organization_policies p
       LEFT JOIN users creator ON creator.id = p.created_by
       LEFT JOIN users approver ON approver.id = p.approved_by
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, qLimit, qOffset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM organization_policies WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({
      success: true,
      data: {
        policies: result.rows,
        total: countResult.rows[0]?.total || 0,
        pagination: { limit: qLimit, offset: qOffset }
      }
    });
  } catch (error) {
    console.error('List policies error:', error);
    res.status(500).json({ success: false, error: 'Failed to list policies' });
  }
});

// GET /api/v1/policies/:id
// Get policy details with sections
router.get('/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const policyId = req.params.id;

    const policyResult = await pool.query(
      `SELECT 
         p.*,
         creator.email AS created_by_email,
         approver.email AS approved_by_email
       FROM organization_policies p
       LEFT JOIN users creator ON creator.id = p.created_by
       LEFT JOIN users approver ON approver.id = p.approved_by
       WHERE p.organization_id = $1 AND p.id = $2
       LIMIT 1`,
      [orgId, policyId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const sectionsResult = await pool.query(
      `SELECT 
         ps.*,
         (SELECT COUNT(*)::int FROM policy_control_mappings pcm WHERE pcm.policy_section_id = ps.id) AS mapped_controls_count
       FROM policy_sections ps
       WHERE ps.organization_id = $1 AND ps.policy_id = $2
       ORDER BY ps.display_order, ps.section_number`,
      [orgId, policyId]
    );

    const reviewsResult = await pool.query(
      `SELECT 
         pr.*,
         u.email AS reviewed_by_email
       FROM policy_reviews pr
       LEFT JOIN users u ON u.id = pr.reviewed_by
       WHERE pr.organization_id = $1 AND pr.policy_id = $2
       ORDER BY pr.review_date DESC
       LIMIT 10`,
      [orgId, policyId]
    );

    res.json({
      success: true,
      data: {
        policy: policyResult.rows[0],
        sections: sectionsResult.rows,
        recent_reviews: reviewsResult.rows
      }
    });
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch policy' });
  }
});

// POST /api/v1/policies
// Create new policy
router.post('/', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      policy_name,
      policy_type,
      description,
      version = '1.0',
      status = 'draft',
      effective_date,
      review_frequency_days = 365
    } = req.body || {};

    if (!policy_name || String(policy_name).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'policy_name is required (min 3 chars)' });
    }

    if (!policy_type || String(policy_type).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'policy_type is required (min 3 chars)' });
    }

    if (!ALLOWED_POLICY_STATUSES.includes(String(status))) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_POLICY_STATUSES.join(', ')}`
      });
    }

    // Calculate next review date
    let nextReviewDate = null;
    if (effective_date) {
      const effectiveDateTime = new Date(effective_date);
      effectiveDateTime.setDate(effectiveDateTime.getDate() + Number(review_frequency_days || 365));
      nextReviewDate = effectiveDateTime.toISOString().slice(0, 10);
    }

    const result = await pool.query(
      `INSERT INTO organization_policies (
         organization_id, policy_name, policy_type, description, version,
         status, effective_date, review_frequency_days, next_review_date, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        orgId,
        policy_name,
        policy_type,
        description || null,
        version,
        status,
        effective_date || null,
        review_frequency_days,
        nextReviewDate,
        req.user.id
      ]
    );

    const policy = result.rows[0];

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_created', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        policy.id,
        JSON.stringify({ policy_name, policy_type, status })
      ]
    );

    // Notification
    await createNotification(
      orgId,
      null,
      'system',
      'New Policy Created',
      `Policy "${policy_name}" has been created.`,
      `/dashboard/policies/${policy.id}`
    );

    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    console.error('Create policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
});

// POST /api/v1/policies/generate
// AI-generate policy from organization's frameworks
router.post('/generate', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      policy_name,
      policy_type,
      framework_ids = [],
      include_all_frameworks = false
    } = req.body || {};

    if (!policy_name || String(policy_name).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'policy_name is required (min 3 chars)' });
    }

    if (!policy_type || String(policy_type).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'policy_type is required (min 3 chars)' });
    }

    // Get organization's selected frameworks
    let selectedFrameworks = [];
    if (include_all_frameworks) {
      const frameworksResult = await pool.query(
        `SELECT f.id, f.name, f.code
         FROM organization_frameworks ofw
         JOIN frameworks f ON f.id = ofw.framework_id
         WHERE ofw.organization_id = $1`,
        [orgId]
      );
      selectedFrameworks = frameworksResult.rows;
    } else if (Array.isArray(framework_ids) && framework_ids.length > 0) {
      const frameworksResult = await pool.query(
        `SELECT f.id, f.name, f.code
         FROM frameworks f
         WHERE f.id = ANY($1)`,
        [framework_ids]
      );
      selectedFrameworks = frameworksResult.rows;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either framework_ids or include_all_frameworks must be specified'
      });
    }

    if (selectedFrameworks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No frameworks found for policy generation'
      });
    }

    // Generate policy using service
    const generatedPolicy = await generatePolicyFromFrameworks(
      orgId,
      req.user.id,
      policy_name,
      policy_type,
      selectedFrameworks
    );

    res.status(201).json({
      success: true,
      data: generatedPolicy,
      message: 'Policy generated successfully from selected frameworks'
    });
  } catch (error) {
    console.error('Generate policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate policy' });
  }
});

// PATCH /api/v1/policies/:id
// Update policy
router.patch('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const policyId = req.params.id;

    const existingResult = await pool.query(
      `SELECT * FROM organization_policies WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, policyId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const existing = existingResult.rows[0];
    const patch = req.body || {};

    const nextStatus = patch.status !== undefined ? String(patch.status) : existing.status;
    if (!ALLOWED_POLICY_STATUSES.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_POLICY_STATUSES.join(', ')}`
      });
    }

    // Calculate next review date if effective_date or review_frequency changes
    let nextReviewDate = existing.next_review_date;
    if (patch.effective_date || patch.review_frequency_days) {
      const effectiveDate = new Date(patch.effective_date || existing.effective_date);
      const reviewFreq = Number(patch.review_frequency_days || existing.review_frequency_days);
      effectiveDate.setDate(effectiveDate.getDate() + reviewFreq);
      nextReviewDate = effectiveDate.toISOString().slice(0, 10);
    }

    // Handle status transitions
    const approvedAt = nextStatus === 'approved' && existing.status !== 'approved' ? new Date() : existing.approved_at;
    const approvedBy = nextStatus === 'approved' && existing.status !== 'approved' ? req.user.id : existing.approved_by;
    const publishedAt = nextStatus === 'published' && existing.status !== 'published' ? new Date() : existing.published_at;
    const archivedAt = nextStatus === 'archived' && existing.status !== 'archived' ? new Date() : existing.archived_at;

    // SOD: the policy creator cannot approve their own policy
    if (nextStatus === 'approved' && existing.status !== 'approved') {
      const sodError = requireSod(existing.created_by, req.user.id, 'creator', 'approver', req.user.permissions || []);
      if (sodError) {
        return res.status(403).json({ success: false, error: sodError });
      }
    }

    const result = await pool.query(
      `UPDATE organization_policies
       SET policy_name = COALESCE($3, policy_name),
           policy_type = COALESCE($4, policy_type),
           description = COALESCE($5, description),
           version = COALESCE($6, version),
           status = $7,
           effective_date = COALESCE($8, effective_date),
           review_frequency_days = COALESCE($9, review_frequency_days),
           next_review_date = $10,
           approved_by = $11,
           approved_at = $12,
           published_at = $13,
           archived_at = $14,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        policyId,
        patch.policy_name || null,
        patch.policy_type || null,
        patch.description || null,
        patch.version || null,
        nextStatus,
        patch.effective_date || null,
        patch.review_frequency_days || null,
        nextReviewDate,
        approvedBy,
        approvedAt,
        publishedAt,
        archivedAt
      ]
    );

    const updated = result.rows[0];

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_updated', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        policyId,
        JSON.stringify({
          old_status: existing.status,
          new_status: updated.status,
          policy_name: updated.policy_name
        })
      ]
    );

    // If status changed to published, create notification
    if (nextStatus === 'published' && existing.status !== 'published') {
      await createNotification(
        orgId,
        null,
        'system',
        'Policy Published',
        `Policy "${updated.policy_name}" has been published and is now in effect.`,
        `/dashboard/policies/${policyId}`
      );
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to update policy' });
  }
});

// POST /api/v1/policies/:id/sections
// Add or update policy section
router.post('/:id/sections', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const policyId = req.params.id;
    const {
      section_number,
      section_title,
      section_content,
      framework_family_code,
      framework_family_name,
      display_order = 0,
      control_mappings = []
    } = req.body || {};

    // Validate policy exists
    const policyResult = await pool.query(
      `SELECT id FROM organization_policies WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, policyId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    if (!section_number || !section_title || !section_content) {
      return res.status(400).json({
        success: false,
        error: 'section_number, section_title, and section_content are required'
      });
    }

    // Insert or update section
    const sectionResult = await pool.query(
      `INSERT INTO policy_sections (
         organization_id, policy_id, section_number, section_title, section_content,
         framework_family_code, framework_family_name, display_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ON CONSTRAINT policy_sections_pkey
       DO UPDATE SET
         section_title = EXCLUDED.section_title,
         section_content = EXCLUDED.section_content,
         framework_family_code = EXCLUDED.framework_family_code,
         framework_family_name = EXCLUDED.framework_family_name,
         display_order = EXCLUDED.display_order,
         updated_at = NOW()
       RETURNING *`,
      [
        orgId,
        policyId,
        section_number,
        section_title,
        section_content,
        framework_family_code || null,
        framework_family_name || null,
        display_order
      ]
    );

    const section = sectionResult.rows[0];

    // Add control mappings if provided
    if (Array.isArray(control_mappings) && control_mappings.length > 0) {
      for (const mapping of control_mappings) {
        if (mapping.control_id && mapping.framework_id) {
          await pool.query(
            `INSERT INTO policy_control_mappings (
               organization_id, policy_section_id, control_id, framework_id, mapping_notes
             )
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (policy_section_id, control_id) DO UPDATE SET
               mapping_notes = EXCLUDED.mapping_notes`,
            [
              orgId,
              section.id,
              mapping.control_id,
              mapping.framework_id,
              mapping.mapping_notes || null
            ]
          );
        }
      }
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_section_created', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        policyId,
        JSON.stringify({ section_number, section_title })
      ]
    );

    res.status(201).json({ success: true, data: section });
  } catch (error) {
    console.error('Create policy section error:', error);
    res.status(500).json({ success: false, error: 'Failed to create policy section' });
  }
});

// GET /api/v1/policies/:id/sections/:sectionId/controls
// Get controls mapped to a policy section
router.get('/:id/sections/:sectionId/controls', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id: policyId, sectionId } = req.params;

    const result = await pool.query(
      `SELECT 
         pcm.*,
         fc.control_id AS control_code,
         fc.title AS control_title,
         f.name AS framework_name,
         f.code AS framework_code,
         ci.status AS implementation_status
       FROM policy_control_mappings pcm
       JOIN policy_sections ps ON ps.id = pcm.policy_section_id
       JOIN framework_controls fc ON fc.id = pcm.control_id
       JOIN frameworks f ON f.id = pcm.framework_id
       LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE pcm.organization_id = $1 AND ps.policy_id = $2 AND ps.id = $3
       ORDER BY f.code, fc.control_id`,
      [orgId, policyId, sectionId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get policy section controls error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch policy section controls' });
  }
});

// POST /api/v1/policies/:id/reviews
// Create policy review
router.post('/:id/reviews', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const policyId = req.params.id;
    const {
      review_type = 'annual',
      review_date,
      review_status = 'scheduled',
      review_notes,
      changes_made = false,
      requires_user_acknowledgment = false
    } = req.body || {};

    if (!ALLOWED_REVIEW_TYPES.includes(String(review_type))) {
      return res.status(400).json({
        success: false,
        error: `review_type must be one of: ${ALLOWED_REVIEW_TYPES.join(', ')}`
      });
    }

    if (!ALLOWED_REVIEW_STATUSES.includes(String(review_status))) {
      return res.status(400).json({
        success: false,
        error: `review_status must be one of: ${ALLOWED_REVIEW_STATUSES.join(', ')}`
      });
    }

    // Get policy to calculate next review date
    const policyResult = await pool.query(
      `SELECT review_frequency_days, policy_name FROM organization_policies 
       WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, policyId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const policy = policyResult.rows[0];
    const reviewDateTime = review_date ? new Date(review_date) : new Date();
    const nextReviewDateTime = new Date(reviewDateTime);
    nextReviewDateTime.setDate(nextReviewDateTime.getDate() + (policy.review_frequency_days || 365));

    const result = await pool.query(
      `INSERT INTO policy_reviews (
         organization_id, policy_id, review_type, review_date, reviewed_by,
         review_status, review_notes, next_review_date, changes_made, requires_user_acknowledgment
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        orgId,
        policyId,
        review_type,
        reviewDateTime.toISOString().slice(0, 10),
        req.user.id,
        review_status,
        review_notes || null,
        nextReviewDateTime.toISOString().slice(0, 10),
        changes_made,
        requires_user_acknowledgment
      ]
    );

    const review = result.rows[0];

    // Update policy next review date
    await pool.query(
      `UPDATE organization_policies
       SET next_review_date = $3, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2`,
      [orgId, policyId, nextReviewDateTime.toISOString().slice(0, 10)]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_review_created', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        policyId,
        JSON.stringify({ review_type, changes_made, requires_user_acknowledgment })
      ]
    );

    // If changes require acknowledgment, create alert
    if (requires_user_acknowledgment) {
      await pool.query(
        `INSERT INTO policy_monitoring_alerts (
           organization_id, policy_id, alert_type, alert_severity, alert_message, alert_details
         )
         VALUES ($1, $2, 'acknowledgment_required', 'high', $3, $4::jsonb)`,
        [
          orgId,
          policyId,
          `Policy "${policy.policy_name}" has been updated and requires user acknowledgment`,
          JSON.stringify({ review_id: review.id, review_type })
        ]
      );

      // Notify users
      await createNotification(
        orgId,
        null,
        'system',
        'Policy Review Requires Acknowledgment',
        `Policy "${policy.policy_name}" has been reviewed and changes require your acknowledgment.`,
        `/dashboard/policies/${policyId}`
      );
    }

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    console.error('Create policy review error:', error);
    res.status(500).json({ success: false, error: 'Failed to create policy review' });
  }
});

// POST /api/v1/policies/:id/acknowledge
// User acknowledges policy (or policy changes)
router.post('/:id/acknowledge', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const policyId = req.params.id;
    const { policy_review_id, acknowledgment_notes } = req.body || {};

    // Get policy info
    const policyResult = await pool.query(
      `SELECT policy_name, version FROM organization_policies 
       WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, policyId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }

    const policy = policyResult.rows[0];

    // Insert acknowledgment
    const result = await pool.query(
      `INSERT INTO policy_user_acknowledgments (
         organization_id, policy_id, policy_review_id, user_id,
         acknowledgment_notes, policy_version
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (policy_id, user_id, policy_review_id) DO UPDATE SET
         acknowledged_at = NOW(),
         acknowledgment_notes = EXCLUDED.acknowledgment_notes
       RETURNING *`,
      [
        orgId,
        policyId,
        policy_review_id || null,
        req.user.id,
        acknowledgment_notes || null,
        policy.version
      ]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_acknowledged', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        policyId,
        JSON.stringify({ policy_name: policy.policy_name, version: policy.version })
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Policy acknowledged successfully'
    });
  } catch (error) {
    console.error('Policy acknowledgment error:', error);
    res.status(500).json({ success: false, error: 'Failed to acknowledge policy' });
  }
});

// GET /api/v1/policies/:id/monitoring-alerts
// Get monitoring alerts for a policy
router.get('/:id/monitoring-alerts', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const policyId = req.params.id;
    const { resolved = 'false' } = req.query;

    const result = await pool.query(
      `SELECT 
         pma.*,
         pr.reference_name,
         resolver.email AS resolved_by_email
       FROM policy_monitoring_alerts pma
       LEFT JOIN policy_references pr ON pr.id = pma.policy_reference_id
       LEFT JOIN users resolver ON resolver.id = pma.resolved_by
       WHERE pma.organization_id = $1 AND pma.policy_id = $2
         AND pma.resolved = $3
       ORDER BY pma.alert_severity DESC, pma.created_at DESC`,
      [orgId, policyId, resolved === 'true']
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get policy monitoring alerts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monitoring alerts' });
  }
});

// Configure multer for policy uploads
const uploadsDir = path.join(__dirname, '../../uploads/policies');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'));
    }
  }
});

// POST /api/v1/policies/upload
// Upload policy document for analysis
router.post('/upload', requirePermission('controls.write'), upload.single('policy'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    // Calculate file hash
    const fileBuffer = fs.readFileSync(req.file.path);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');
    
    // Check for duplicate
    const duplicateCheck = await pool.query(
      `SELECT id FROM policy_uploads WHERE organization_id = $1 AND file_hash = $2 LIMIT 1`,
      [orgId, hash]
    );
    
    if (duplicateCheck.rows.length > 0) {
      // Remove uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'This policy document has already been uploaded',
        existing_id: duplicateCheck.rows[0].id
      });
    }
    
    // Create upload record
    const result = await pool.query(
      `INSERT INTO policy_uploads (
         organization_id, file_name, file_path, file_size, mime_type, file_hash, uploaded_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        orgId,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        hash,
        req.user.id
      ]
    );
    
    const upload = result.rows[0];
    
    // Extract text in background (async)
    extractPolicyText(req.file.path, req.file.mimetype).then(async (text) => {
      if (text) {
        await pool.query(
          `UPDATE policy_uploads SET parsed_content = $1, processing_status = 'completed' WHERE id = $2`,
          [text, upload.id]
        );
      }
    }).catch(err => {
      console.error('Background text extraction error:', err);
    });
    
    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_uploaded', 'policy', $3, $4::jsonb, true)`,
      [orgId, req.user.id, upload.id, JSON.stringify({ file_name: req.file.originalname })]
    );
    
    // Notification
    await createNotification(
      orgId,
      null,
      'system',
      'Policy Document Uploaded',
      `Policy "${req.file.originalname}" has been uploaded and is ready for analysis.`,
      `/dashboard/policies/uploads/${upload.id}`
    );
    
    res.status(201).json({
      success: true,
      data: upload,
      message: 'Policy uploaded successfully'
    });
  } catch (error) {
    console.error('Policy upload error:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: 'Failed to upload policy' });
  }
});

// GET /api/v1/policies/uploads
// List uploaded policies
router.get('/uploads', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT 
         pu.*,
         u.email AS uploaded_by_email,
         p.policy_name AS linked_policy_name
       FROM policy_uploads pu
       LEFT JOIN users u ON u.id = pu.uploaded_by
       LEFT JOIN organization_policies p ON p.id = pu.policy_id
       WHERE pu.organization_id = $1
       ORDER BY pu.upload_date DESC
       LIMIT $2 OFFSET $3`,
      [orgId, Number(limit), Number(offset)]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List policy uploads error:', error);
    res.status(500).json({ success: false, error: 'Failed to list policy uploads' });
  }
});

// GET /api/v1/policies/uploads/:id
// Get policy upload details
router.get('/uploads/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const uploadId = req.params.id;
    
    const result = await pool.query(
      `SELECT 
         pu.*,
         u.email AS uploaded_by_email,
         p.policy_name AS linked_policy_name
       FROM policy_uploads pu
       LEFT JOIN users u ON u.id = pu.uploaded_by
       LEFT JOIN organization_policies p ON p.id = pu.policy_id
       WHERE pu.id = $1 AND pu.organization_id = $2
       LIMIT 1`,
      [uploadId, orgId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy upload not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get policy upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch policy upload' });
  }
});

// POST /api/v1/policies/uploads/:id/analyze
// Analyze uploaded policy for gaps
router.post('/uploads/:id/analyze', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const uploadId = req.params.id;
    const { framework_ids } = req.body || {};
    
    if (!framework_ids || !Array.isArray(framework_ids) || framework_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'framework_ids array is required'
      });
    }
    
    // Verify upload exists
    const uploadResult = await pool.query(
      `SELECT id FROM policy_uploads WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [uploadId, orgId]
    );
    
    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Policy upload not found' });
    }
    
    // Update status to processing
    await pool.query(
      `UPDATE policy_uploads SET processing_status = 'processing' WHERE id = $1`,
      [uploadId]
    );
    
    // Perform gap analysis
    const results = await performGapAnalysis(orgId, uploadId, framework_ids);
    
    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_gap_analysis_completed', 'policy', $3, $4::jsonb, true)`,
      [orgId, req.user.id, uploadId, JSON.stringify({ frameworks: framework_ids.length, results })]
    );
    
    res.json({
      success: true,
      data: results,
      message: 'Gap analysis completed successfully'
    });
  } catch (error) {
    console.error('Policy gap analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze policy' });
  }
});

// GET /api/v1/policies/uploads/:id/gaps
// Get gap analysis results
router.get('/uploads/:id/gaps', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const uploadId = req.params.id;
    
    // Get gap analyses
    const analysesResult = await pool.query(
      `SELECT 
         pga.*,
         f.name AS framework_name,
         f.code AS framework_code
       FROM policy_gap_analysis pga
       JOIN frameworks f ON f.id = pga.framework_id
       WHERE pga.policy_upload_id = $1 AND pga.organization_id = $2
       ORDER BY pga.analysis_date DESC`,
      [uploadId, orgId]
    );
    
    // Get specific gaps for each analysis
    const detailedResults = [];
    for (const analysis of analysesResult.rows) {
      const gapsResult = await pool.query(
        `SELECT 
           pcg.*,
           fc.control_id AS control_code,
           fc.title AS control_title,
           reviewer.email AS reviewed_by_email
         FROM policy_control_gaps pcg
         JOIN framework_controls fc ON fc.id = pcg.control_id
         LEFT JOIN users reviewer ON reviewer.id = pcg.reviewed_by
         WHERE pcg.gap_analysis_id = $1
         ORDER BY 
           CASE pcg.gap_severity
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             ELSE 4
           END,
           fc.control_id`,
        [analysis.id]
      );
      
      detailedResults.push({
        ...analysis,
        gaps: gapsResult.rows
      });
    }
    
    res.json({ success: true, data: detailedResults });
  } catch (error) {
    console.error('Get policy gaps error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch gap analysis' });
  }
});

// POST /api/v1/policies/uploads/:id/set-baseline
// Set uploaded policy as baseline for generation
router.post('/uploads/:id/set-baseline', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const uploadId = req.params.id;
    
    const result = await setAsBaseline(orgId, uploadId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Policy upload not found' });
    }
    
    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_baseline_set', 'policy', $3, $4::jsonb, true)`,
      [orgId, req.user.id, uploadId, JSON.stringify({ file_name: result.file_name })]
    );
    
    // Notification
    await createNotification(
      orgId,
      null,
      'system',
      'Policy Baseline Set',
      `"${result.file_name}" has been set as the baseline policy for generation.`,
      `/dashboard/policies/uploads/${uploadId}`
    );
    
    res.json({
      success: true,
      data: result,
      message: 'Policy set as baseline successfully'
    });
  } catch (error) {
    console.error('Set baseline error:', error);
    res.status(500).json({ success: false, error: 'Failed to set policy as baseline' });
  }
});

// POST /api/v1/policies/generate-from-baseline
// Generate policy starting from uploaded baseline
router.post('/generate-from-baseline', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      policy_name,
      policy_type,
      baseline_upload_id,
      framework_ids = []
    } = req.body || {};
    
    if (!policy_name || !policy_type || !baseline_upload_id) {
      return res.status(400).json({
        success: false,
        error: 'policy_name, policy_type, and baseline_upload_id are required'
      });
    }
    
    if (!Array.isArray(framework_ids) || framework_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one framework_id is required'
      });
    }
    
    const result = await generatePolicyFromBaseline(
      orgId,
      req.user.id,
      policy_name,
      policy_type,
      baseline_upload_id,
      framework_ids
    );
    
    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_generated_from_baseline', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        req.user.id,
        result.policy.id,
        JSON.stringify({ baseline: result.baseline_used, frameworks: framework_ids.length })
      ]
    );
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Policy generated from baseline successfully'
    });
  } catch (error) {
    console.error('Generate from baseline error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate policy from baseline' });
  }
});

module.exports = router;
