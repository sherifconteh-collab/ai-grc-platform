// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'pending-evidence-route' }));

// POST /scan - Stub: trigger evidence scan
router.post('/scan', async (_req, res) => {
  try {
    res.json({ success: true, data: { scanned: true, new_suggestions: 0, message: 'Evidence scan completed' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / - List pending evidence
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const status = req.query.status || 'pending';
    const result = await pool.query(
      `SELECT id, title, description, source, suggested_control_ids, status,
              reviewer_notes, created_at, updated_at
       FROM pending_evidence
       WHERE organization_id = $1 AND status = $2
       ORDER BY created_at DESC`,
      [orgId, status]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats - Counts by status
router.get('/stats', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM pending_evidence
       WHERE organization_id = $1
       GROUP BY status`,
      [orgId]
    );
    const stats = {};
    for (const row of result.rows) {
      stats[row.status] = row.count;
    }
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/approve - Approve pending evidence
router.post('/:id/approve', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { reviewer_notes } = req.body;
    const result = await pool.query(
      `UPDATE pending_evidence SET status = 'approved', reviewer_notes = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [reviewer_notes || null, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending evidence not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/reject - Reject pending evidence
router.post('/:id/reject', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { reviewer_notes } = req.body;
    const result = await pool.query(
      `UPDATE pending_evidence SET status = 'rejected', reviewer_notes = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [reviewer_notes || null, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending evidence not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
