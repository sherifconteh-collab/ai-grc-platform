// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'threat-intel-route' }));

// GET /feeds - List feeds for org
router.get('/feeds', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM threat_intel_feeds WHERE organization_id = $1 ORDER BY created_at DESC',
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing feeds:', error);
    res.status(500).json({ success: false, error: 'Failed to list feeds' });
  }
});

// GET /feeds/:id - Get single feed
router.get('/feeds/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM threat_intel_feeds WHERE id = $1 AND organization_id = $2',
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feed not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting feed:', error);
    res.status(500).json({ success: false, error: 'Failed to get feed' });
  }
});

// POST /feeds - Create feed
router.post('/feeds', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, feed_url, feed_type, enabled } = req.body;
    const result = await pool.query(
      `INSERT INTO threat_intel_feeds (organization_id, name, feed_url, feed_type, enabled)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, name, feed_url, feed_type, enabled]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating feed:', error);
    res.status(500).json({ success: false, error: 'Failed to create feed' });
  }
});

// PATCH /feeds/:id - Update feed fields
router.patch('/feeds/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(req.body)) {
      if (['name', 'feed_url', 'feed_type', 'enabled'].includes(key)) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id, orgId);

    const result = await pool.query(
      `UPDATE threat_intel_feeds SET ${fields.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feed not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating feed:', error);
    res.status(500).json({ success: false, error: 'Failed to update feed' });
  }
});

// DELETE /feeds/:id - Delete feed
router.delete('/feeds/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'DELETE FROM threat_intel_feeds WHERE id = $1 AND organization_id = $2 RETURNING *',
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feed not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting feed:', error);
    res.status(500).json({ success: false, error: 'Failed to delete feed' });
  }
});

// POST /feeds/:id/sync - Stub sync single feed
router.post('/feeds/:id/sync', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `UPDATE threat_intel_feeds SET last_sync_at = NOW(), sync_status = 'completed', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Feed not found' });
    }
    res.json({ success: true, data: { synced: true, new_items: 0 } });
  } catch (error) {
    console.error('Error syncing feed:', error);
    res.status(500).json({ success: false, error: 'Failed to sync feed' });
  }
});

// POST /sync-all - Stub sync all feeds
router.post('/sync-all', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `UPDATE threat_intel_feeds SET last_sync_at = NOW(), sync_status = 'completed', updated_at = NOW()
       WHERE organization_id = $1`,
      [orgId]
    );
    res.json({ success: true, data: { feeds_synced: result.rowCount } });
  } catch (error) {
    console.error('Error syncing all feeds:', error);
    res.status(500).json({ success: false, error: 'Failed to sync all feeds' });
  }
});

// GET /items - List threat intel items
router.get('/items', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { feed_id, severity, item_type, exploit_available, status, limit } = req.query;

    let query = 'SELECT * FROM threat_intel_items WHERE organization_id = $1';
    const values = [orgId];
    let idx = 2;

    if (feed_id) {
      query += ` AND feed_id = $${idx++}`;
      values.push(feed_id);
    }
    if (severity) {
      query += ` AND severity = $${idx++}`;
      values.push(severity);
    }
    if (item_type) {
      query += ` AND item_type = $${idx++}`;
      values.push(item_type);
    }
    if (exploit_available !== undefined) {
      query += ` AND exploit_available = $${idx++}`;
      values.push(exploit_available);
    }
    if (status) {
      query += ` AND status = $${idx++}`;
      values.push(status);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      query += ` LIMIT $${idx++}`;
      values.push(parseInt(limit, 10));
    }

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing items:', error);
    res.status(500).json({ success: false, error: 'Failed to list items' });
  }
});

// GET /stats - Threat intel statistics
router.get('/stats', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const [totalResult, severityResult, typeResult, feedsResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM threat_intel_items WHERE organization_id = $1', [orgId]),
      pool.query('SELECT severity, COUNT(*) as count FROM threat_intel_items WHERE organization_id = $1 GROUP BY severity', [orgId]),
      pool.query('SELECT item_type, COUNT(*) as count FROM threat_intel_items WHERE organization_id = $1 GROUP BY item_type', [orgId]),
      pool.query('SELECT COUNT(*) as total FROM threat_intel_feeds WHERE organization_id = $1', [orgId]),
    ]);

    res.json({
      success: true,
      data: {
        total_items: parseInt(totalResult.rows[0].total, 10),
        by_severity: severityResult.rows,
        by_type: typeResult.rows,
        feeds_count: parseInt(feedsResult.rows[0].total, 10),
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
