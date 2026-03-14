// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'vulnerabilities-route' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// GET / - List vulnerabilities with dynamic filtering
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      source, standard, severity, status,
      assetId, minCvss, maxCvss, search,
      limit = 100, offset = 0
    } = req.query;

    const params = [orgId];
    const conditions = ['v.organization_id = $1'];
    let paramIndex = 2;

    if (source) {
      const sources = Array.isArray(source) ? source : [source];
      conditions.push(`v.source = ANY($${paramIndex}::text[])`);
      params.push(sources);
      paramIndex++;
    }

    if (standard) {
      const standards = Array.isArray(standard) ? standard : [standard];
      conditions.push(`v.standard = ANY($${paramIndex}::text[])`);
      params.push(standards);
      paramIndex++;
    }

    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      conditions.push(`v.severity = ANY($${paramIndex}::text[])`);
      params.push(severities);
      paramIndex++;
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      conditions.push(`v.status = ANY($${paramIndex}::text[])`);
      params.push(statuses);
      paramIndex++;
    }

    if (assetId) {
      conditions.push(`v.asset_id = $${paramIndex}`);
      params.push(assetId);
      paramIndex++;
    }

    if (minCvss) {
      conditions.push(`v.cvss_score >= $${paramIndex}`);
      params.push(parseFloat(minCvss));
      paramIndex++;
    }

    if (maxCvss) {
      conditions.push(`v.cvss_score <= $${paramIndex}`);
      params.push(parseFloat(maxCvss));
      paramIndex++;
    }

    if (search) {
      conditions.push(`(v.cve_id ILIKE $${paramIndex} OR v.title ILIKE $${paramIndex} OR v.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    params.push(Math.min(parseInt(limit, 10) || 100, 500));
    const limitIdx = paramIndex++;
    params.push(parseInt(offset, 10) || 0);
    const offsetIdx = paramIndex++;

    const query = `
      SELECT v.*
      FROM vulnerabilities v
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.cvss_score DESC NULLS LAST, v.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      SELECT COUNT(*) FROM vulnerabilities v
      WHERE ${conditions.join(' AND ')}
    `;
    const countParams = params.slice(0, params.length - 2);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10)
    });
  } catch (error) {
    console.error('List vulnerabilities error:', error);
    res.status(500).json({ success: false, error: 'Failed to load vulnerabilities' });
  }
});

// GET /sources - Return distinct sources for this org
router.get('/sources', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT DISTINCT source FROM vulnerabilities WHERE organization_id = $1 AND source IS NOT NULL ORDER BY source`,
      [orgId]
    );
    res.json({ success: true, data: result.rows.map(r => r.source) });
  } catch (error) {
    console.error('Get vulnerability sources error:', error);
    res.status(500).json({ success: false, error: 'Failed to load vulnerability sources' });
  }
});

// GET /:id - Get single vulnerability
router.get('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT * FROM vulnerabilities WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get vulnerability error:', error);
    res.status(500).json({ success: false, error: 'Failed to load vulnerability' });
  }
});

// POST /:id/analyze - AI analysis stub
router.post('/:id/analyze', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id FROM vulnerabilities WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }

    res.json({
      success: true,
      data: {
        analysis: 'AI analysis pending configuration',
        vulnerability_id: req.params.id
      }
    });
  } catch (error) {
    console.error('Analyze vulnerability error:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze vulnerability' });
  }
});

// POST /import - File upload stub
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        count: 0,
        message: 'Import processing not yet configured'
      }
    });
  } catch (error) {
    console.error('Import vulnerabilities error:', error);
    res.status(500).json({ success: false, error: 'Failed to import vulnerabilities' });
  }
});

// GET /:id/workflow - Get workflow items for a vulnerability
router.get('/:id/workflow', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Verify vulnerability belongs to org
    const vulnResult = await pool.query(
      `SELECT id FROM vulnerabilities WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    if (vulnResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }

    const result = await pool.query(
      `SELECT * FROM vulnerability_workflow_items WHERE vulnerability_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get workflow items error:', error);
    res.status(500).json({ success: false, error: 'Failed to load workflow items' });
  }
});

// PATCH /:id/workflow/:workItemId - Update a workflow item
router.patch('/:id/workflow/:workItemId', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Verify vulnerability belongs to org
    const vulnResult = await pool.query(
      `SELECT id FROM vulnerabilities WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    if (vulnResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }

    const {
      action_type, action_status, control_effect,
      response_summary, response_details, due_date, owner_id
    } = req.body;

    const fields = [];
    const params = [req.params.workItemId, req.params.id];
    let paramIndex = 3;

    if (action_type !== undefined) {
      fields.push(`action_type = $${paramIndex++}`);
      params.push(action_type);
    }
    if (action_status !== undefined) {
      fields.push(`action_status = $${paramIndex++}`);
      params.push(action_status);
    }
    if (control_effect !== undefined) {
      fields.push(`control_effect = $${paramIndex++}`);
      params.push(control_effect);
    }
    if (response_summary !== undefined) {
      fields.push(`response_summary = $${paramIndex++}`);
      params.push(response_summary);
    }
    if (response_details !== undefined) {
      fields.push(`response_details = $${paramIndex++}`);
      params.push(response_details);
    }
    if (due_date !== undefined) {
      fields.push(`due_date = $${paramIndex++}`);
      params.push(due_date);
    }
    if (owner_id !== undefined) {
      fields.push(`owner_id = $${paramIndex++}`);
      params.push(owner_id);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE vulnerability_workflow_items
       SET ${fields.join(', ')}
       WHERE id = $1 AND vulnerability_id = $2
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workflow item not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update workflow item error:', error);
    res.status(500).json({ success: false, error: 'Failed to update workflow item' });
  }
});

module.exports = router;
