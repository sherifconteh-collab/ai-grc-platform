// @tier: community
/**
 * MSP / parent-child organization hierarchy routes: list and create child
 * orgs, child compliance summaries, and delegated-admin grant/revoke.
 *
 * Extracted verbatim from routes/organizations.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/organizations.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');

// --- MSP / Parent-Child Org Hierarchy ---

// GET /api/v1/organizations/children — list child orgs
router.get('/children', requirePermission('organizations.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.name, o.created_at,
              (SELECT COUNT(*)::int FROM users u WHERE u.organization_id = o.id AND u.is_active = true) AS user_count
         FROM organizations o
        WHERE o.parent_org_id = $1
        ORDER BY o.name`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.children_list_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/organizations/children — create child org under parent
router.post('/children', requirePermission('organizations.write'), async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO organizations (name, parent_org_id) VALUES ($1, $2) RETURNING id, name, created_at`,
      [name.trim(), req.user.organization_id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.child_create_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/organizations/children/:childId/summary — child org compliance summary
router.get('/children/:childId/summary', requirePermission('organizations.read'), async (req, res) => {
  try {
    const childCheck = await pool.query(
      'SELECT id, name FROM organizations WHERE id = $1 AND parent_org_id = $2',
      [req.params.childId, req.user.organization_id]
    );
    const isDelegated = await pool.query(
      'SELECT id FROM org_delegated_admins WHERE child_org_id = $1 AND user_id = $2 AND (expires_at IS NULL OR expires_at > NOW())',
      [req.params.childId, req.user.id]
    );
    if (childCheck.rows.length === 0 && isDelegated.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to child organization' });
    }
    const latestSnapshotsResult = await pool.query(
      `SELECT DISTINCT ON (cs.framework_id)
              f.code AS framework_code, f.name AS framework_name,
              cs.compliance_pct, cs.snapshot_date
         FROM compliance_snapshots cs
         JOIN frameworks f ON f.id = cs.framework_id
        WHERE cs.organization_id = $1
        ORDER BY cs.framework_id, cs.snapshot_date DESC`,
      [req.params.childId]
    );
    const org = childCheck.rows[0] || { id: req.params.childId };
    res.json({
      success: true,
      data: {
        org,
        framework_snapshots: latestSnapshotsResult.rows
      }
    });
  } catch (error) {
    log('error', 'organizations.child_summary_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/organizations/children/:childId/delegate — grant delegated admin
router.post('/children/:childId/delegate', requirePermission('organizations.write'), async (req, res) => {
  const { user_id, expires_at } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }
  try {
    const childCheck = await pool.query(
      'SELECT id FROM organizations WHERE id = $1 AND parent_org_id = $2',
      [req.params.childId, req.user.organization_id]
    );
    if (childCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to child organization' });
    }
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND is_active = true',
      [user_id, req.user.organization_id]
    );
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ error: 'User not found in your organization' });
    }
    const result = await pool.query(
      `INSERT INTO org_delegated_admins (parent_org_id, child_org_id, user_id, granted_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (parent_org_id, child_org_id, user_id) DO UPDATE SET
         granted_by = EXCLUDED.granted_by, granted_at = NOW(), expires_at = EXCLUDED.expires_at
       RETURNING *`,
      [req.user.organization_id, req.params.childId, user_id, req.user.id, expires_at || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.delegate_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/organizations/children/:childId/delegate/:userId — revoke delegated admin
router.delete('/children/:childId/delegate/:userId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM org_delegated_admins WHERE parent_org_id = $1 AND child_org_id = $2 AND user_id = $3 RETURNING id',
      [req.user.organization_id, req.params.childId, req.params.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delegation not found' });
    }
    res.json({ success: true });
  } catch (error) {
    log('error', 'organizations.revoke_delegate_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
