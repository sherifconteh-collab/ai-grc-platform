// @tier: enterprise
const express = require('express');
const router = express.Router();
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { requireProEdition } = require('../middleware/edition');
const { createRateLimiter } = require('../middleware/rateLimit');
const vendorSecurityService = require('../services/vendorSecurityService');
const pool = require('../config/database');

// Rate limiter for vendor security endpoints
const vendorSecurityRateLimiter = createRateLimiter({
  label: 'vendor-security',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes per org
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

router.use(authenticate);
router.use(requireProEdition('vendorSecurity')); // Edition check BEFORE tier check
router.use(requireTier('enterprise')); // Vendor security features require Enterprise tier
router.use(vendorSecurityRateLimiter);

// GET /api/v1/vendor-security/scores - List vendor scores
router.get('/scores', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const filters = {
      vendor_name: req.query.vendor_name,
      score_provider: req.query.score_provider,
      score_trend: req.query.score_trend,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };
    
    const scores = await vendorSecurityService.getVendorScores(orgId, filters);
    
    res.json({ success: true, data: scores, count: scores.length });
  } catch (error) {
    console.error('List vendor scores error:', error);
    res.status(500).json({ success: false, error: 'Failed to list vendor scores' });
  }
});

// GET /api/v1/vendor-security/scores/:id - Get specific score
router.get('/scores/:id', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scoreId = req.params.id;
    
    const score = await vendorSecurityService.getVendorScore(orgId, scoreId);
    
    if (!score) {
      return res.status(404).json({ success: false, error: 'Vendor score not found' });
    }
    
    res.json({ success: true, data: score });
  } catch (error) {
    console.error('Get vendor score error:', error);
    res.status(500).json({ success: false, error: 'Failed to get vendor score' });
  }
});

// POST /api/v1/vendor-security/scores - Add vendor score manually
router.post('/scores', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scoreData = req.body;
    
    // Validate required fields
    if (!scoreData.vendor_name || !scoreData.score_provider || !scoreData.score_date) {
      return res.status(400).json({
        success: false,
        error: 'vendor_name, score_provider, and score_date are required'
      });
    }
    
    // Validate score_provider
    const validProviders = ['securityscorecard', 'bitsight'];
    if (!validProviders.includes(scoreData.score_provider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid score_provider. Must be one of: ${validProviders.join(', ')}`
      });
    }
    
    const score = await vendorSecurityService.upsertVendorScore(orgId, scoreData);
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'vendor_score_added', 'vendor_score', $3, $4::jsonb, true)`,
      [orgId, req.user.id, score.id, JSON.stringify({
        vendor_name: score.vendor_name,
        score_provider: score.score_provider,
        score_value: score.score_value
      })]
    );
    
    res.status(201).json({ success: true, data: score });
  } catch (error) {
    console.error('Add vendor score error:', error);
    res.status(500).json({ success: false, error: 'Failed to add vendor score' });
  }
});

// POST /api/v1/vendor-security/scores/:id/refresh - Refresh score from provider
router.post('/scores/:id/refresh', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scoreId = req.params.id;
    
    // Get existing score to find vendor domain
    const existingScore = await vendorSecurityService.getVendorScore(orgId, scoreId);
    
    if (!existingScore) {
      return res.status(404).json({ success: false, error: 'Vendor score not found' });
    }
    
    if (!existingScore.vendor_domain) {
      return res.status(400).json({
        success: false,
        error: 'Cannot refresh: vendor_domain is required'
      });
    }
    
    // Get API key from request body or from stored configuration
    const apiKey = req.body.api_key;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'api_key is required to refresh vendor score'
      });
    }
    
    const score = await vendorSecurityService.refreshVendorScore(
      orgId,
      apiKey,
      existingScore.score_provider,
      existingScore.vendor_domain
    );
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'vendor_score_refreshed', 'vendor_score', $3, $4::jsonb, true)`,
      [orgId, req.user.id, score.id, JSON.stringify({
        vendor_name: score.vendor_name,
        score_value: score.score_value,
        score_trend: score.score_trend
      })]
    );
    
    res.json({ success: true, data: score });
  } catch (error) {
    console.error('Refresh vendor score error:', error);
    
    // Log failed audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'vendor_score_refresh_failed', 'vendor_score', $3, $4::jsonb, false)`,
      [orgId, req.user.id, req.params.id, JSON.stringify({ error: error.message })]
    ).catch(() => {});
    
    res.status(500).json({ success: false, error: 'Failed to refresh vendor score' });
  }
});

// POST /api/v1/vendor-security/monitor - Start monitoring a new vendor
router.post('/monitor', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_domain, score_provider, api_key } = req.body;
    
    if (!vendor_domain || !score_provider || !api_key) {
      return res.status(400).json({
        success: false,
        error: 'vendor_domain, score_provider, and api_key are required'
      });
    }
    
    // Fetch initial score
    const score = await vendorSecurityService.refreshVendorScore(
      orgId,
      api_key,
      score_provider,
      vendor_domain
    );
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'vendor_monitoring_started', 'vendor_score', $3, $4::jsonb, true)`,
      [orgId, req.user.id, score.id, JSON.stringify({
        vendor_name: score.vendor_name,
        vendor_domain: vendor_domain,
        score_provider: score_provider
      })]
    );
    
    res.status(201).json({ success: true, data: score });
  } catch (error) {
    console.error('Start vendor monitoring error:', error);
    res.status(500).json({ success: false, error: 'Failed to start vendor monitoring' });
  }
});

// DELETE /api/v1/vendor-security/scores/:id - Remove vendor score
router.delete('/scores/:id', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scoreId = req.params.id;
    
    const deleted = await vendorSecurityService.deleteVendorScore(orgId, scoreId);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Vendor score not found' });
    }
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'vendor_score_deleted', 'vendor_score', $3, '{}'::jsonb, true)`,
      [orgId, req.user.id, scoreId]
    );
    
    res.json({ success: true, message: 'Vendor score deleted successfully' });
  } catch (error) {
    console.error('Delete vendor score error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete vendor score' });
  }
});

// GET /api/v1/vendor-security/trends/:domain - Get trend history for a vendor
router.get('/trends/:domain', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vendorDomain = req.params.domain;
    
    const trends = await vendorSecurityService.getVendorTrends(orgId, vendorDomain);
    
    res.json({ success: true, data: trends, count: trends.length });
  } catch (error) {
    console.error('Get vendor trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to get vendor trends' });
  }
});

module.exports = router;
