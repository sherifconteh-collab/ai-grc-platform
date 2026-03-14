// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'plot4ai-route' }));

router.get('/threats', async (req, res) => {
  try {
    const { category, aitype, role, phase, search } = req.query;
    let query = 'SELECT * FROM plot4ai_threats WHERE 1=1';
    const values = [];
    let idx = 1;

    if (category) { query += ` AND category = $${idx++}`; values.push(category); }
    if (aitype) { query += ` AND ai_type = $${idx++}`; values.push(aitype); }
    if (role) { query += ` AND role = $${idx++}`; values.push(role); }
    if (phase) { query += ` AND phase = $${idx++}`; values.push(phase); }
    if (search) {
      query += ` AND (threat_name ILIKE $${idx} OR description ILIKE $${idx})`;
      values.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY created_at DESC';
    const limit = parseInt(req.query.limit, 10) || 100;
    query += ` LIMIT $${idx++}`;
    values.push(limit);

    const result = await pool.query(query, values);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing threats:', error);
    return res.status(500).json({ success: false, error: 'Failed to list threats' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM plot4ai_threats ORDER BY category'
    );
    return res.json({ success: true, data: result.rows.map(r => r.category) });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

router.get('/filters', async (req, res) => {
  try {
    const aiTypes = await pool.query('SELECT DISTINCT ai_type FROM plot4ai_threats WHERE ai_type IS NOT NULL ORDER BY ai_type');
    const roles = await pool.query('SELECT DISTINCT role FROM plot4ai_threats WHERE role IS NOT NULL ORDER BY role');
    const phases = await pool.query('SELECT DISTINCT phase FROM plot4ai_threats WHERE phase IS NOT NULL ORDER BY phase');
    return res.json({
      success: true,
      data: {
        ai_types: aiTypes.rows.map(r => r.ai_type),
        roles: roles.rows.map(r => r.role),
        phases: phases.rows.map(r => r.phase)
      }
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch filters' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*)::int AS total FROM plot4ai_threats');
    const catResult = await pool.query(
      'SELECT category, COUNT(*)::int AS count FROM plot4ai_threats GROUP BY category ORDER BY category'
    );
    const byCategory = {};
    catResult.rows.forEach(r => { byCategory[r.category] = r.count; });
    return res.json({
      success: true,
      data: {
        total: totalResult.rows[0].total,
        by_category: byCategory
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

module.exports = router;
