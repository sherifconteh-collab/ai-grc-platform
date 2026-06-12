// @tier: community
/**
 * Audit engagement lifecycle (list/create/handoff/detail/update) and
 * engagement-scoped procedure listing.
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
const { decodeCursor, nextCursorFrom } = require('../../utils/keysetPagination');
const {
  VALID_ENGAGEMENT_TYPES,
  VALID_ENGAGEMENT_STATUSES,
  toInt,
  parseFrameworkCodes,
  assertEngagementAccess,
  ensureOrgUser,
  ensureOrgAuditorUser,
  resolveEngagementFrameworkCodes,
  logAuditEvent,
} = require('./_shared');

// ============================================================
// GET /api/v1/assessments/engagements
// List audit engagements for the organization
// ============================================================
router.get('/engagements', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, engagement_type, search, limit = 50, offset = 0, cursor } = req.query;
    // Keyset pagination: cursor=<next_cursor from a previous response> gives
    // O(1) page turns regardless of depth. limit/offset still work.
    const keyset = cursor ? decodeCursor(cursor) : null;
    if (cursor && !keyset) {
      return res.status(400).json({ success: false, error: 'Invalid cursor' });
    }

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

    if (keyset) {
      query += ` AND (ae.created_at, ae.id) < ($${idx}, $${idx + 1})`;
      params.push(keyset.createdAt, keyset.id);
      idx += 2;
      query += ` ORDER BY ae.created_at DESC, ae.id DESC LIMIT $${idx}`;
      params.push(toInt(limit, 50));
    } else {
      query += ` ORDER BY ae.created_at DESC, ae.id DESC LIMIT $${idx} OFFSET $${idx + 1}`;
      params.push(toInt(limit, 50), toInt(offset, 0));
    }

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

    // Cursor mode skips the COUNT(*) scan — avoiding it is the point.
    const countResult = keyset ? null : await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: {
        engagements: rows.rows,
        pagination: keyset
          ? {
              limit: toInt(limit, 50),
              next_cursor: nextCursorFrom(rows.rows, toInt(limit, 50))
            }
          : {
              total: parseInt(countResult.rows[0].total, 10),
              limit: toInt(limit, 50),
              offset: toInt(offset, 0),
              next_cursor: nextCursorFrom(rows.rows, toInt(limit, 50))
            }
      }
    });
  } catch (error) {
    log('error', 'list_audit_engagements_error', { error: error?.message || String(error) });
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

    if (lead_auditor_id && !(await ensureOrgUser(orgId, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an active user in this organization' });
    }
    if (lead_auditor_id && !(await ensureOrgAuditorUser(orgId, lead_auditor_id))) {
      return res.status(400).json({ success: false, error: 'lead_auditor_id must reference an auditor user in this organization' });
    }
    if (engagement_owner_id && !(await ensureOrgUser(orgId, engagement_owner_id))) {
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
    log('error', 'create_audit_engagement_error', { error: error?.message || String(error) });
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
    log('error', 'handoff_engagement_error', { error: error?.message || String(error) });
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
    log('error', 'get_audit_engagement_error', { error: error?.message || String(error) });
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
    log('error', 'update_audit_engagement_error', { error: error?.message || String(error) });
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
    log('error', 'list_engagement_procedures_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list engagement procedures' });
  }
});

module.exports = router;
