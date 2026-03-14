// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// Auto Evidence Collection — stubs; full implementation is premium
// ---------------------------------------------------------------

// GET /api/v1/auto-evidence/sources
router.get('/sources', requirePermission('assessments.read'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// GET /api/v1/auto-evidence/rules
router.get('/rules', requirePermission('assessments.read'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/auto-evidence/rules
router.post('/rules', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Auto evidence rules are a premium feature' } });
});

// GET /api/v1/auto-evidence/rules/:id
router.get('/rules/:id', requirePermission('assessments.read'), async (req, res) => {
  res.status(404).json({ success: false, error: 'Auto evidence rules are a premium feature' });
});

// PUT /api/v1/auto-evidence/rules/:id
router.put('/rules/:id', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Auto evidence rules are a premium feature' } });
});

// DELETE /api/v1/auto-evidence/rules/:id
router.delete('/rules/:id', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Auto evidence rules are a premium feature' } });
});

// POST /api/v1/auto-evidence/collect
router.post('/collect', requirePermission('assessments.write'), async (req, res) => {
  res.json({ success: true, data: { message: 'Auto evidence collection is a premium feature', collected: 0 } });
});

module.exports = router;
