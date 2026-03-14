// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'regulatory-news-route' }));

// GET /unread-count - Count unread news items (before /:id)
router.get('/unread-count', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM regulatory_news_items WHERE organization_id = $1 AND is_read = false AND is_archived = false',
      [orgId]
    );
    res.json({ success: true, data: { unread_count: parseInt(result.rows[0].count, 10) } });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
});

// GET /sources/list - List distinct sources (before /:id)
router.get('/sources/list', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT DISTINCT source FROM regulatory_news_items WHERE organization_id = $1 ORDER BY source',
      [orgId]
    );
    res.json({ success: true, data: result.rows.map(r => r.source) });
  } catch (error) {
    console.error('Error listing sources:', error);
    res.status(500).json({ success: false, error: 'Failed to list sources' });
  }
});

// POST /refresh - Stub feed refresh (before /:id)
router.post('/refresh', async (req, res) => {
  try {
    res.json({ success: true, data: { refreshed: true, new_items: 0, message: 'Feed refresh not yet configured' } });
  } catch (error) {
    console.error('Error refreshing feeds:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh feeds' });
  }
});

// POST /mark-all-read - Mark all news as read (before /:id)
router.post('/mark-all-read', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'UPDATE regulatory_news_items SET is_read = true WHERE organization_id = $1 AND is_read = false',
      [orgId]
    );
    res.json({ success: true, data: { marked_read: result.rowCount } });
  } catch (error) {
    console.error('Error marking all read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all read' });
  }
});

// GET / - List news items
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { source, is_read, is_archived, impact_level, limit } = req.query;

    let query = 'SELECT * FROM regulatory_news_items WHERE organization_id = $1';
    const values = [orgId];
    let idx = 2;

    if (source) {
      query += ` AND source = $${idx++}`;
      values.push(source);
    }
    if (is_read !== undefined) {
      query += ` AND is_read = $${idx++}`;
      values.push(is_read);
    }
    if (is_archived !== undefined) {
      query += ` AND is_archived = $${idx++}`;
      values.push(is_archived);
    }
    if (impact_level) {
      query += ` AND impact_level = $${idx++}`;
      values.push(impact_level);
    }

    query += ' ORDER BY published_at DESC';

    const maxRows = limit ? parseInt(limit, 10) : 50;
    query += ` LIMIT $${idx++}`;
    values.push(maxRows);

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing news:', error);
    res.status(500).json({ success: false, error: 'Failed to list news' });
  }
});

// GET /:id - Get single news item and mark as read
router.get('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'UPDATE regulatory_news_items SET is_read = true WHERE id = $1 AND organization_id = $2 RETURNING *',
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'News item not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting news item:', error);
    res.status(500).json({ success: false, error: 'Failed to get news item' });
  }
});

// PATCH /:id - Update flags
router.patch('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(req.body)) {
      if (['is_read', 'is_archived'].includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    values.push(req.params.id, orgId);

    const result = await pool.query(
      `UPDATE regulatory_news_items SET ${fields.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'News item not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating news item:', error);
    res.status(500).json({ success: false, error: 'Failed to update news item' });
  }
});

module.exports = router;
