// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'sbom-route' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// GET /assets - Return distinct asset names
router.get('/assets', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search } = req.query;

    const params = [orgId];
    const conditions = ['organization_id = $1', 'asset_name IS NOT NULL'];
    let paramIndex = 2;

    if (search) {
      conditions.push(`asset_name ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT DISTINCT asset_name FROM sbom_components WHERE ${conditions.join(' AND ')} ORDER BY asset_name`,
      params
    );

    res.json({ success: true, data: result.rows.map(r => r.asset_name) });
  } catch (error) {
    console.error('Get SBOM assets error:', error);
    res.status(500).json({ success: false, error: 'Failed to load SBOM assets' });
  }
});

// GET / - List SBOM components
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { limit = 100, offset = 0 } = req.query;

    const safeLimit = Math.min(parseInt(limit, 10) || 100, 500);
    const safeOffset = parseInt(offset, 10) || 0;

    const query = `
      SELECT *
      FROM sbom_components
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) FROM sbom_components WHERE organization_id = $1
    `;

    const [result, countResult] = await Promise.all([
      pool.query(query, [orgId, safeLimit, safeOffset]),
      pool.query(countQuery, [orgId])
    ]);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10)
    });
  } catch (error) {
    console.error('List SBOM components error:', error);
    res.status(500).json({ success: false, error: 'Failed to load SBOM components' });
  }
});

// GET /:id - Get single SBOM component
router.get('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT * FROM sbom_components WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SBOM component not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get SBOM component error:', error);
    res.status(500).json({ success: false, error: 'Failed to load SBOM component' });
  }
});

// POST /upload - File upload stub
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        message: 'SBOM processing not yet configured'
      }
    });
  } catch (error) {
    console.error('Upload SBOM error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload SBOM' });
  }
});

module.exports = router;
