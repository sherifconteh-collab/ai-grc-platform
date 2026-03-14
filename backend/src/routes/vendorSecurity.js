// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'vendor-security-route' }));

// GET /scores - List vendor security scores
router.get('/scores', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_name, score_provider, score_trend, limit } = req.query;

    let query = 'SELECT * FROM vendor_security_scores WHERE organization_id = $1';
    const values = [orgId];
    let idx = 2;

    if (vendor_name) {
      query += ` AND vendor_name = $${idx++}`;
      values.push(vendor_name);
    }
    if (score_provider) {
      query += ` AND score_provider = $${idx++}`;
      values.push(score_provider);
    }
    if (score_trend) {
      query += ` AND score_trend = $${idx++}`;
      values.push(score_trend);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      query += ` LIMIT $${idx++}`;
      values.push(parseInt(limit, 10));
    }

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing scores:', error);
    res.status(500).json({ success: false, error: 'Failed to list scores' });
  }
});

// GET /scores/:id - Get single score
router.get('/scores/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM vendor_security_scores WHERE id = $1 AND organization_id = $2',
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Score not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting score:', error);
    res.status(500).json({ success: false, error: 'Failed to get score' });
  }
});

// POST /scores - Create score entry
router.post('/scores', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_name, vendor_domain, score_provider, score_value, score_date, risk_factors } = req.body;
    const result = await pool.query(
      `INSERT INTO vendor_security_scores (organization_id, vendor_name, vendor_domain, score_provider, score_value, score_date, risk_factors)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orgId, vendor_name, vendor_domain, score_provider, score_value, score_date || new Date().toISOString().slice(0, 10), JSON.stringify(risk_factors)]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating score:', error);
    res.status(500).json({ success: false, error: 'Failed to create score' });
  }
});

// POST /scores/:id/refresh - Stub refresh score
router.post('/scores/:id/refresh', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `UPDATE vendor_security_scores SET updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Score not found' });
    }
    res.json({ success: true, data: { refreshed: true, message: 'Score refresh not yet configured' } });
  } catch (error) {
    console.error('Error refreshing score:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh score' });
  }
});

// DELETE /scores/:id - Delete score
router.delete('/scores/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'DELETE FROM vendor_security_scores WHERE id = $1 AND organization_id = $2 RETURNING *',
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Score not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error deleting score:', error);
    res.status(500).json({ success: false, error: 'Failed to delete score' });
  }
});

// GET /trends/:domain - Get score trends for a domain
router.get('/trends/:domain', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM vendor_security_scores WHERE vendor_domain = $1 AND organization_id = $2 ORDER BY created_at ASC',
      [req.params.domain, orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({ success: false, error: 'Failed to get trends' });
  }
});

// POST /monitor - Stub vendor monitoring
router.post('/monitor', async (req, res) => {
  try {
    res.json({ success: true, data: { monitoring: false, message: 'Vendor monitoring not yet configured' } });
  } catch (error) {
    console.error('Error setting up monitoring:', error);
    res.status(500).json({ success: false, error: 'Failed to set up monitoring' });
  }
});

module.exports = router;
