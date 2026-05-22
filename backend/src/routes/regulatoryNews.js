// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const regulatoryNewsService = require('../services/regulatoryNewsService');
const pool = require('../config/database');

// Rate limiter for regulatory news endpoints
const regulatoryNewsRateLimiter = createRateLimiter({
  label: 'regulatory-news',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 minutes per org
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

router.use(authenticate);
router.use(regulatoryNewsRateLimiter);

// GET /api/v1/regulatory-news - List regulatory news items
router.get('/', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const filters = {
      source: req.query.source,
      is_read: req.query.is_read === 'true' ? true : req.query.is_read === 'false' ? false : undefined,
      is_archived: req.query.is_archived === 'true' ? true : req.query.is_archived === 'false' ? false : undefined,
      relevant_frameworks: req.query.frameworks ? req.query.frameworks.split(',') : undefined,
      impact_level: req.query.impact_level,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };
    
    const items = await regulatoryNewsService.getNewsItems(orgId, filters);
    
    res.json({ success: true, data: items, count: items.length });
  } catch (error) {
    console.error('List regulatory news error:', error);
    res.status(500).json({ success: false, error: 'Failed to list regulatory news' });
  }
});

// GET /api/v1/regulatory-news/unread-count - Get count of unread items
router.get('/unread-count', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const count = await regulatoryNewsService.getUnreadCount(orgId);
    
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
});

// GET /api/v1/regulatory-news/:id - Get specific news item
router.get('/:id', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const newsId = req.params.id;
    
    const result = await pool.query(
      `SELECT * FROM regulatory_news_items
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, newsId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'News item not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get news item error:', error);
    res.status(500).json({ success: false, error: 'Failed to get news item' });
  }
});

// PATCH /api/v1/regulatory-news/:id - Update news item (mark as read/archived)
router.patch('/:id', requirePermission('notifications.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const newsId = req.params.id;
    const updates = req.body;
    
    // Only allow updating is_read and is_archived
    const allowedUpdates = {};
    if (updates.is_read !== undefined) {
      allowedUpdates.is_read = updates.is_read;
    }
    if (updates.is_archived !== undefined) {
      allowedUpdates.is_archived = updates.is_archived;
    }
    
    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided'
      });
    }
    
    const item = await regulatoryNewsService.updateNewsItem(orgId, newsId, allowedUpdates);
    
    if (!item) {
      return res.status(404).json({ success: false, error: 'News item not found' });
    }
    
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Update news item error:', error);
    res.status(500).json({ success: false, error: 'Failed to update news item' });
  }
});

// POST /api/v1/regulatory-news/refresh - Trigger news refresh
router.post('/refresh', requirePermission('notifications.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    
    const items = await regulatoryNewsService.refreshNews(orgId);
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
       VALUES ($1, $2, 'regulatory_news_refreshed', 'regulatory_news', $3::jsonb, true)`,
      [orgId, req.user.id, JSON.stringify({ items_count: items.length })]
    );
    
    res.json({
      success: true,
      message: 'Regulatory news refreshed successfully',
      data: { items_added: items.length }
    });
  } catch (error) {
    console.error('Refresh regulatory news error:', error);
    
    // Log failed audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
       VALUES ($1, $2, 'regulatory_news_refresh_failed', 'regulatory_news', $3::jsonb, false)`,
      [orgId, req.user.id, JSON.stringify({ error: error.message })]
    ).catch(() => {});
    
    res.status(500).json({ success: false, error: 'Failed to refresh regulatory news' });
  }
});

// POST /api/v1/regulatory-news/mark-all-read - Mark all unread items as read
router.post('/mark-all-read', requirePermission('notifications.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    
    const result = await pool.query(
      `UPDATE regulatory_news_items
       SET is_read = true, read_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND is_read = false AND is_archived = false
       RETURNING id`,
      [orgId]
    );
    
    // Log audit event
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
       VALUES ($1, $2, 'regulatory_news_marked_all_read', 'regulatory_news', $3::jsonb, true)`,
      [orgId, req.user.id, JSON.stringify({ items_marked: result.rowCount })]
    );
    
    res.json({
      success: true,
      message: `${result.rowCount} items marked as read`,
      data: { items_marked: result.rowCount }
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark items as read' });
  }
});

// GET /api/v1/regulatory-news/sources - List available news sources
router.get('/sources/list', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const sources = regulatoryNewsService.NEWS_SOURCES;
    
    // Format sources for API response
    const formattedSources = Object.entries(sources).map(([key, config]) => ({
      id: key,
      name: key.replace(/_/g, ' ').toUpperCase(),
      url: config.url,
      frameworks: config.frameworks,
      keywords: config.keywords,
      available: !!config.url
    }));
    
    res.json({ success: true, data: formattedSources });
  } catch (error) {
    console.error('List sources error:', error);
    res.status(500).json({ success: false, error: 'Failed to list news sources' });
  }
});

module.exports = router;
