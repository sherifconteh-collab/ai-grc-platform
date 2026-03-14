// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

const REGULATORY_NEWS_NS = 'regulatory_news';

// GET /api/v1/regulatory-news
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { read, source, limit = 50, offset = 0 } = req.query;

    const params = [orgId];
    const filters = [];
    if (read !== undefined) { params.push(read === 'true'); filters.push(`rni.is_read = $${params.length}`); }
    if (source) { params.push(source); filters.push(`rni.source = $${params.length}`); }

    const whereExtra = filters.length ? ' AND ' + filters.join(' AND ') : '';
    params.push(Number(limit) || 50, Number(offset) || 0);

    const result = await pool.query(
      `SELECT * FROM regulatory_news_items rni
       WHERE rni.organization_id=$1 ${whereExtra}
       ORDER BY rni.published_at DESC NULLS LAST, rni.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const unread = await pool.query(
      `SELECT COUNT(*) FROM regulatory_news_items WHERE organization_id=$1 AND is_read=false`,
      [orgId]
    );

    res.json({ success: true, data: result.rows, unread_count: parseInt(unread.rows[0].count) });
  } catch (err) {
    console.error('Regulatory news error:', err);
    res.status(500).json({ success: false, error: 'Failed to load regulatory news' });
  }
});

// GET /api/v1/regulatory-news/unread-count
router.get('/unread-count', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT COUNT(*) FROM regulatory_news_items WHERE organization_id=$1 AND is_read=false`,
      [orgId]
    );
    res.json({ success: true, data: { count: parseInt(result.rows[0].count) } });
  } catch (err) {
    console.error('Regulatory news unread count error:', err);
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
});

// POST /api/v1/regulatory-news/mark-all-read
router.post('/mark-all-read', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `UPDATE regulatory_news_items SET is_read=true WHERE organization_id=$1`,
      [orgId]
    );
    res.json({ success: true, data: { marked: true } });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark news as read' });
  }
});

// POST /api/v1/regulatory-news/refresh
router.post('/refresh', requirePermission('controls.read'), async (req, res) => {
  // Stub — actual feed refresh would pull from external sources
  res.json({ success: true, data: { message: 'News feed refresh is handled by the scheduled job processor', items_added: 0 } });
});

// GET /api/v1/regulatory-news/sources/list
router.get('/sources/list', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT DISTINCT source FROM regulatory_news_items WHERE organization_id=$1 AND source IS NOT NULL ORDER BY source`,
      [orgId]
    );
    res.json({ success: true, data: result.rows.map(r => r.source) });
  } catch (err) {
    console.error('Regulatory news sources error:', err);
    res.status(500).json({ success: false, error: 'Failed to load news sources' });
  }
});

// POST /api/v1/regulatory-news/:id/read
router.post('/:id/read', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `UPDATE regulatory_news_items SET is_read=true WHERE organization_id=$1 AND id=$2`,
      [orgId, req.params.id]
    );
    res.json({ success: true, data: { id: req.params.id, is_read: true } });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

module.exports = router;
