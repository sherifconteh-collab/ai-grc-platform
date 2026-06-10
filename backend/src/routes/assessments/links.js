// @tier: community
/**
 * Cross-resource link routes: assessment result evidence links (Phase 6.1)
 * and finding-control links (Phase 6.2).
 *
 * Extracted verbatim from routes/assessments.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/assessments.js AFTER the multer error handler, exactly
 * as in the original registration order.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');

// ============================================================
// Phase 6.1 — Procedure result evidence linking
// POST /api/v1/assessments/results/:resultId/evidence
// Link an evidence item directly to a specific procedure result
// ============================================================
router.post('/results/:resultId/evidence', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { resultId } = req.params;
    const organizationId = req.user.organization_id;
    const { evidenceId, linkNotes } = req.body;

    if (!evidenceId) {
      return res.status(400).json({ success: false, error: 'evidenceId is required' });
    }

    // Verify the result belongs to this org
    const resultCheck = await pool.query(
      'SELECT id FROM assessment_results WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [resultId, organizationId]
    );
    if (resultCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment result not found' });
    }

    // Verify the evidence belongs to this org
    const evidenceCheck = await pool.query(
      'SELECT id FROM evidence WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [evidenceId, organizationId]
    );
    if (evidenceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence item not found' });
    }

    const result = await pool.query(
      `INSERT INTO assessment_result_evidence_links
         (assessment_result_id, evidence_id, organization_id, link_notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (assessment_result_id, evidence_id) DO UPDATE
         SET link_notes = EXCLUDED.link_notes
       RETURNING *`,
      [resultId, evidenceId, organizationId, linkNotes || null, req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'assessment_result_evidence_link', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to link evidence to assessment result' });
  }
});

// DELETE /api/v1/assessments/results/:resultId/evidence/:evidenceId
router.delete('/results/:resultId/evidence/:evidenceId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { resultId, evidenceId } = req.params;
    const organizationId = req.user.organization_id;

    const result = await pool.query(
      `DELETE FROM assessment_result_evidence_links
       WHERE assessment_result_id = $1 AND evidence_id = $2 AND organization_id = $3
       RETURNING id`,
      [resultId, evidenceId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence link not found' });
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    log('error', 'assessment_result_evidence_unlink', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to remove evidence link' });
  }
});

// GET /api/v1/assessments/results/:resultId/evidence
router.get('/results/:resultId/evidence', requirePermission('assessments.read'), async (req, res) => {
  try {
    const { resultId } = req.params;
    const organizationId = req.user.organization_id;

    const result = await pool.query(
      `SELECT arel.id, arel.link_notes, arel.created_at,
              e.id as evidence_id, e.title, e.file_name, e.file_type,
              e.collection_date, e.status,
              u.first_name || ' ' || u.last_name as linked_by
       FROM assessment_result_evidence_links arel
       JOIN evidence e ON e.id = arel.evidence_id
       LEFT JOIN users u ON u.id = arel.created_by
       WHERE arel.assessment_result_id = $1
         AND arel.organization_id = $2
       ORDER BY arel.created_at`,
      [resultId, organizationId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'assessment_result_evidence_list', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list result evidence links' });
  }
});

// ============================================================
// Phase 6.2 — Finding control links
// POST /api/v1/assessments/findings/:findingId/controls
// Link additional controls (many-to-many) to a finding
// ============================================================
router.post('/findings/:findingId/controls', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { findingId } = req.params;
    const organizationId = req.user.organization_id;
    const { controlId, linkType = 'related' } = req.body;

    if (!controlId) {
      return res.status(400).json({ success: false, error: 'controlId is required' });
    }

    const VALID_LINK_TYPES = ['primary', 'related', 'crosswalk'];
    if (!VALID_LINK_TYPES.includes(linkType)) {
      return res.status(400).json({ success: false, error: `linkType must be one of: ${VALID_LINK_TYPES.join(', ')}` });
    }

    // Verify finding belongs to this org
    const findingCheck = await pool.query(
      'SELECT id FROM audit_findings WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [findingId, organizationId]
    );
    if (findingCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Finding not found' });
    }

    const result = await pool.query(
      `INSERT INTO finding_control_links (finding_id, control_id, organization_id, link_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (finding_id, control_id) DO UPDATE SET link_type = EXCLUDED.link_type
       RETURNING *`,
      [findingId, controlId, organizationId, linkType, req.user.id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'finding_control_link', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to link control to finding' });
  }
});

// DELETE /api/v1/assessments/findings/:findingId/controls/:controlId
router.delete('/findings/:findingId/controls/:controlId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { findingId, controlId } = req.params;
    const organizationId = req.user.organization_id;

    const result = await pool.query(
      `DELETE FROM finding_control_links
       WHERE finding_id = $1 AND control_id = $2 AND organization_id = $3
       RETURNING id`,
      [findingId, controlId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Finding-control link not found' });
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    log('error', 'finding_control_unlink', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to remove control link from finding' });
  }
});

// GET /api/v1/assessments/findings/:findingId/controls
router.get('/findings/:findingId/controls', requirePermission('assessments.read'), async (req, res) => {
  try {
    const { findingId } = req.params;
    const organizationId = req.user.organization_id;

    const result = await pool.query(
      `SELECT fcl.id, fcl.link_type, fcl.created_at,
              fc.id as control_id, fc.control_id as control_ref, fc.title as control_title,
              f.code as framework_code, f.name as framework_name
       FROM finding_control_links fcl
       JOIN framework_controls fc ON fc.id = fcl.control_id
       JOIN frameworks f ON f.id = fc.framework_id
       WHERE fcl.finding_id = $1 AND fcl.organization_id = $2
       ORDER BY fcl.link_type, fc.control_id`,
      [findingId, organizationId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'finding_controls_list', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list finding control links' });
  }
});

module.exports = router;
