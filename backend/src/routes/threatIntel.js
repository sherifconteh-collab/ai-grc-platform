// @tier: enterprise
const express = require('express');
const router = express.Router();
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const threatIntelService = require('../services/threatIntelService');
const pool = require('../config/database');

// Rate limiter for threat intelligence endpoints
const threatIntelRateLimiter = createRateLimiter({
  label: 'threat-intel',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes per org
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

router.use(authenticate);
router.use(threatIntelRateLimiter);

// GET /api/v1/threat-intel/feeds - List all threat feeds
router.get('/feeds', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const feeds = await threatIntelService.getThreatFeeds(orgId);
    
    res.json({ success: true, data: feeds });
  } catch (error) {
    console.error('List threat feeds error:', error);
    res.status(500).json({ success: false, error: 'Failed to list threat feeds' });
  }
});

// GET /api/v1/threat-intel/feeds/:id - Get specific feed
router.get('/feeds/:id', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const feedId = req.params.id;
    
    const feed = await threatIntelService.getThreatFeed(orgId, feedId);
    
    if (!feed) {
      return res.status(404).json({ success: false, error: 'Threat feed not found' });
    }
    
    res.json({ success: true, data: feed });
  } catch (error) {
    console.error('Get threat feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to get threat feed' });
  }
});

// POST /api/v1/threat-intel/feeds - Create new threat feed
router.post('/feeds', requireTier('enterprise'), requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const feedData = req.body;
    
    // Validate required fields
    if (!feedData.feed_type || !feedData.feed_name) {
      return res.status(400).json({
        success: false,
        error: 'feed_type and feed_name are required'
      });
    }
    
    // Validate feed_type
    const validTypes = ['nvd', 'cisa_kev', 'mitre', 'otx'];
    if (!validTypes.includes(feedData.feed_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid feed_type. Must be one of: ${validTypes.join(', ')}`
      });
    }
    
    const feed = await threatIntelService.createThreatFeed(orgId, feedData);
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'threat_feed_created', 'threat_feed', $3, $4::jsonb, true)`,
      [orgId, req.user.id, feed.id, JSON.stringify({ feed_type: feed.feed_type, feed_name: feed.feed_name })]
    );
    
    res.status(201).json({ success: true, data: feed });
  } catch (error) {
    console.error('Create threat feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to create threat feed' });
  }
});

// PATCH /api/v1/threat-intel/feeds/:id - Update feed configuration
router.patch('/feeds/:id', requireTier('enterprise'), requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const feedId = req.params.id;
    const updates = req.body;
    
    const feed = await threatIntelService.updateThreatFeed(orgId, feedId, updates);
    
    if (!feed) {
      return res.status(404).json({ success: false, error: 'Threat feed not found' });
    }
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'threat_feed_updated', 'threat_feed', $3, $4::jsonb, true)`,
      [orgId, req.user.id, feedId, JSON.stringify(updates)]
    );
    
    res.json({ success: true, data: feed });
  } catch (error) {
    console.error('Update threat feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to update threat feed' });
  }
});

// DELETE /api/v1/threat-intel/feeds/:id - Delete feed
router.delete('/feeds/:id', requireTier('enterprise'), requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const feedId = req.params.id;
    
    const deleted = await threatIntelService.deleteThreatFeed(orgId, feedId);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Threat feed not found' });
    }
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'threat_feed_deleted', 'threat_feed', $3, '{}'::jsonb, true)`,
      [orgId, req.user.id, feedId]
    );
    
    res.json({ success: true, message: 'Threat feed deleted successfully' });
  } catch (error) {
    console.error('Delete threat feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete threat feed' });
  }
});

// POST /api/v1/threat-intel/feeds/:id/sync - Trigger manual sync
router.post('/feeds/:id/sync', requireTier('enterprise'), requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const feedId = req.params.id;
    
    const result = await threatIntelService.syncFeed(orgId, feedId);
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'threat_feed_synced', 'threat_feed', $3, $4::jsonb, true)`,
      [orgId, req.user.id, feedId, JSON.stringify(result)]
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Sync threat feed error:', error);
    
    // Log failed audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'threat_feed_sync_failed', 'threat_feed', $3, $4::jsonb, false)`,
      [orgId, req.user.id, req.params.id, JSON.stringify({ error: error.message })]
    ).catch(() => {});
    
    res.status(500).json({ success: false, error: 'Failed to sync threat feed' });
  }
});

// GET /api/v1/threat-intel/items - List threat intelligence items
router.get('/items', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const filters = {
      feed_id: req.query.feed_id,
      item_type: req.query.item_type,
      severity: req.query.severity,
      exploit_available: req.query.exploit_available === 'true' ? true : req.query.exploit_available === 'false' ? false : undefined,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };
    
    const items = await threatIntelService.getThreatItems(orgId, filters);
    
    res.json({ success: true, data: items, count: items.length });
  } catch (error) {
    console.error('List threat items error:', error);
    res.status(500).json({ success: false, error: 'Failed to list threat intelligence items' });
  }
});

// GET /api/v1/threat-intel/stats - Get statistics
router.get('/stats', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const stats = await threatIntelService.getThreatStats(orgId);
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get threat stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get threat intelligence statistics' });
  }
});

// POST /api/v1/threat-intel/sync-all - Sync all enabled feeds
router.post('/sync-all', requireTier('enterprise'), requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    
    await threatIntelService.scheduleAutoSync(orgId);
    
    res.json({ success: true, message: 'Sync jobs scheduled for all enabled feeds' });
  } catch (error) {
    console.error('Schedule sync error:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule sync jobs' });
  }
});

module.exports = router;
