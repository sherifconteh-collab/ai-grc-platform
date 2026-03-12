// @tier: community
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Public token-based read-only workspace
// GET /api/v1/auditor-workspace/public/:token
router.get('/public/:token', async (req, res) => {
  try {
    const token = req.params.token;

    const linkResult = await pool.query(
      `SELECT *
       FROM auditor_workspace_links
       WHERE token = $1
         AND active = true
         AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workspace link not found or expired' });
    }

    const link = linkResult.rows[0];
    const orgId = link.organization_id;
    const engagementId = link.engagement_id;

    const summary = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM framework_controls fc JOIN organization_frameworks ofw ON ofw.framework_id = fc.framework_id WHERE ofw.organization_id = $1) AS controls_in_scope,
         (SELECT COUNT(*)::int FROM control_implementations ci WHERE ci.organization_id = $1 AND ci.status = 'implemented') AS controls_implemented,
         (SELECT COUNT(*)::int FROM poam_items p WHERE p.organization_id = $1 AND p.status IN ('open', 'in_progress', 'pending_review')) AS open_poam_items,
         (SELECT COUNT(*)::int FROM vulnerability_findings vf WHERE vf.organization_id = $1 AND vf.status IN ('open', 'in_progress')) AS open_vulnerabilities,
         (SELECT COUNT(*)::int FROM evidence e WHERE e.organization_id = $1) AS evidence_count`,
      [orgId]
    );

    const recentEvidence = await pool.query(
      `SELECT id, file_name, mime_type, file_size, created_at
       FROM evidence
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId]
    );

    let engagement = null;
    let findings = [];
    let pbcRequests = [];
    if (engagementId) {
      const engagementResult = await pool.query(
        `SELECT *
         FROM audit_engagements
         WHERE organization_id = $1 AND id = $2
         LIMIT 1`,
        [orgId, engagementId]
      );
      engagement = engagementResult.rows[0] || null;

      const findingsResult = await pool.query(
        `SELECT id, title, severity, status, recommendation, due_date, created_at
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
        [orgId, engagementId]
      );
      findings = findingsResult.rows;

      const pbcResult = await pool.query(
        `SELECT id, title, priority, status, due_date, created_at
         FROM audit_pbc_requests
         WHERE organization_id = $1 AND engagement_id = $2
         ORDER BY due_date NULLS LAST, created_at DESC`,
        [orgId, engagementId]
      );
      pbcRequests = pbcResult.rows;
    }

    res.json({
      success: true,
      data: {
        workspace: {
          name: link.name,
          read_only: link.read_only,
          expires_at: link.expires_at
        },
        summary: summary.rows[0],
        engagement,
        findings,
        pbc_requests: pbcRequests,
        recent_evidence: recentEvidence.rows
      }
    });
  } catch (error) {
    console.error('Auditor workspace public read error:', error);
    res.status(500).json({ success: false, error: 'Failed to load auditor workspace' });
  }
});

router.use(authenticate);

// GET /api/v1/auditor-workspace/links
router.get('/links', requirePermission('audit.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT *
       FROM auditor_workspace_links
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Auditor workspace list links error:', error);
    res.status(500).json({ success: false, error: 'Failed to load auditor workspace links' });
  }
});

// POST /api/v1/auditor-workspace/links
router.post('/links', requirePermission('audit.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, engagement_id = null, days_valid = 30 } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const days = Math.max(1, Math.min(365, Number(days_valid) || 30));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const inserted = await pool.query(
      `INSERT INTO auditor_workspace_links (
         organization_id, engagement_id, token, name, read_only, expires_at, active, created_by
       )
       VALUES ($1, $2, $3, $4, true, $5, true, $6)
       RETURNING *`,
      [orgId, engagement_id, newToken(), name, expiresAt.toISOString(), req.user.id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'auditor_workspace_link_created', 'auditor_workspace_link', $3, $4::jsonb, true)`,
      [orgId, req.user.id, inserted.rows[0].id, JSON.stringify({ name, engagement_id, expires_at: inserted.rows[0].expires_at })]
    );

    res.status(201).json({
      success: true,
      data: inserted.rows[0]
    });
  } catch (error) {
    console.error('Auditor workspace create link error:', error);
    res.status(500).json({ success: false, error: 'Failed to create auditor workspace link' });
  }
});

// PATCH /api/v1/auditor-workspace/links/:id
router.patch('/links/:id', requirePermission('audit.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const { active, expires_at } = req.body || {};
    const parsedExpires = expires_at ? new Date(expires_at) : null;
    if (expires_at && Number.isNaN(parsedExpires?.getTime())) {
      return res.status(400).json({ success: false, error: 'expires_at must be a valid date' });
    }

    const updated = await pool.query(
      `UPDATE auditor_workspace_links
       SET active = COALESCE($3, active),
           expires_at = COALESCE($4, expires_at)
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        active === undefined ? null : Boolean(active),
        parsedExpires ? parsedExpires.toISOString() : null
      ]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Auditor workspace link not found' });
    }

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error('Auditor workspace update link error:', error);
    res.status(500).json({ success: false, error: 'Failed to update auditor workspace link' });
  }
});

module.exports = router;
