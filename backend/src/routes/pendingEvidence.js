// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// Pending Evidence — stubs; full implementation is premium
// ---------------------------------------------------------------

// POST /api/v1/pending-evidence/scan
router.post('/scan', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Pending evidence scanning is a premium feature', found: 0 } });
});

// GET /api/v1/pending-evidence
router.get('/', requirePermission('assessments.read'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// GET /api/v1/pending-evidence/stats
router.get('/stats', requirePermission('assessments.read'), async (req, res) => {
  res.json({ success: true, data: { pending: 0, approved: 0, rejected: 0 } });
});

// PATCH /api/v1/pending-evidence/:id/approve
router.patch('/:id/approve', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Pending evidence approval is a premium feature' } });
});

// PATCH /api/v1/pending-evidence/:id/reject
router.patch('/:id/reject', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Pending evidence rejection is a premium feature' } });
});

module.exports = router;
