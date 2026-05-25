const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { log } = require('../utils/logger');

router.use(authenticate);

// GET /api/v1/frameworks/custom — list org's custom frameworks
router.get('/', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cf.id, cf.code, cf.name, cf.version, cf.category, cf.description,
              cf.is_published, cf.created_at, cf.updated_at,
              COUNT(cfc.id)::int AS control_count
         FROM custom_frameworks cf
         LEFT JOIN custom_framework_controls cfc ON cfc.custom_framework_id = cf.id
        WHERE cf.organization_id = $1
        GROUP BY cf.id
        ORDER BY cf.created_at DESC`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'custom_frameworks.list_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/frameworks/custom — create custom framework
router.post('/', requirePermission('frameworks.manage'), async (req, res) => {
  const { code, name, version = '1.0', category = 'custom', description } = req.body;
  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'code is required' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO custom_frameworks (organization_id, code, name, version, category, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.organization_id, code.trim(), name.trim(), version, category, description || null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A custom framework with that code already exists' });
    }
    log('error', 'custom_frameworks.create_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/frameworks/custom/:id — get framework + controls
router.get('/:id', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const fwResult = await pool.query(
      'SELECT * FROM custom_frameworks WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (fwResult.rows.length === 0) {
      return res.status(404).json({ error: 'Custom framework not found' });
    }
    const controlsResult = await pool.query(
      'SELECT * FROM custom_framework_controls WHERE custom_framework_id = $1 AND organization_id = $2 ORDER BY sort_order, control_id',
      [req.params.id, req.user.organization_id]
    );
    res.json({ success: true, data: { ...fwResult.rows[0], controls: controlsResult.rows } });
  } catch (error) {
    log('error', 'custom_frameworks.get_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/frameworks/custom/:id — update framework metadata
router.put('/:id', requirePermission('frameworks.manage'), async (req, res) => {
  const { name, version, category, description } = req.body;
  try {
    const result = await pool.query(
      `UPDATE custom_frameworks
          SET name = COALESCE($3, name),
              version = COALESCE($4, version),
              category = COALESCE($5, category),
              description = COALESCE($6, description),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [req.params.id, req.user.organization_id,
       name !== undefined ? name : null,
       version !== undefined ? version : null,
       category !== undefined ? category : null,
       description !== undefined ? description : null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Custom framework not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'custom_frameworks.update_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/frameworks/custom/:id
router.delete('/:id', requirePermission('frameworks.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM custom_frameworks WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Custom framework not found' });
    }
    res.json({ success: true });
  } catch (error) {
    log('error', 'custom_frameworks.delete_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/frameworks/custom/:id/controls — add a control
router.post('/:id/controls', requirePermission('frameworks.manage'), async (req, res) => {
  const { control_id, title, description, priority = 'medium', control_type = 'technical', sort_order = 0 } = req.body;
  if (!control_id || typeof control_id !== 'string' || !control_id.trim()) {
    return res.status(400).json({ error: 'control_id is required' });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const validPriorities = ['critical', 'high', 'medium', 'low'];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'priority must be one of: critical, high, medium, low' });
  }
  try {
    const fwCheck = await pool.query(
      'SELECT id FROM custom_frameworks WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (fwCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Custom framework not found' });
    }
    const result = await pool.query(
      `INSERT INTO custom_framework_controls
         (custom_framework_id, organization_id, control_id, title, description, priority, control_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.params.id, req.user.organization_id, control_id.trim(), title.trim(), description || null, priority, control_type, sort_order]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A control with that ID already exists in this framework' });
    }
    log('error', 'custom_frameworks.add_control_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/frameworks/custom/:id/controls/:controlId
router.put('/:id/controls/:controlId', requirePermission('frameworks.manage'), async (req, res) => {
  const { title, description, priority, control_type, sort_order } = req.body;
  if (priority) {
    const validPriorities = ['critical', 'high', 'medium', 'low'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'priority must be one of: critical, high, medium, low' });
    }
  }
  try {
    const result = await pool.query(
      `UPDATE custom_framework_controls
          SET title = COALESCE($4, title),
              description = COALESCE($5, description),
              priority = COALESCE($6, priority),
              control_type = COALESCE($7, control_type),
              sort_order = COALESCE($8, sort_order),
              updated_at = NOW()
        WHERE control_id = $1
          AND custom_framework_id = $2
          AND organization_id = $3
        RETURNING *`,
      [req.params.controlId, req.params.id, req.user.organization_id,
       title || null, description || null, priority || null, control_type || null,
       sort_order !== undefined ? sort_order : null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Control not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'custom_frameworks.update_control_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/frameworks/custom/:id/controls/:controlId
router.delete('/:id/controls/:controlId', requirePermission('frameworks.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM custom_framework_controls
        WHERE control_id = $1 AND custom_framework_id = $2 AND organization_id = $3
        RETURNING id`,
      [req.params.controlId, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Control not found' });
    }
    res.json({ success: true });
  } catch (error) {
    log('error', 'custom_frameworks.delete_control_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/frameworks/custom/:id/publish — toggle publish state
router.post('/:id/publish', requirePermission('frameworks.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE custom_frameworks
          SET is_published = NOT is_published, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, is_published`,
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Custom framework not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'custom_frameworks.publish_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/frameworks/custom/clone/:sourceCode — clone a seeded framework as starting point
router.post('/clone/:sourceCode', requirePermission('frameworks.manage'), async (req, res) => {
  const { name, code } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'code is required for the new custom framework' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sourceResult = await client.query(
      `SELECT f.id, f.name, f.version, f.category, f.description
         FROM frameworks f
        WHERE f.code = $1 AND f.is_active = true`,
      [req.params.sourceCode]
    );
    if (sourceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Source framework not found' });
    }
    const source = sourceResult.rows[0];
    const fwResult = await client.query(
      `INSERT INTO custom_frameworks (organization_id, code, name, version, category, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.organization_id, code.trim(), name.trim(), source.version,
       source.category, `Cloned from ${source.name}. ${source.description || ''}`.trim(), req.user.id]
    );
    const newFwId = fwResult.rows[0].id;
    const insertResult = await client.query(
      `INSERT INTO custom_framework_controls
         (custom_framework_id, organization_id, control_id, title, description, priority, control_type, sort_order)
       SELECT $1, $2, control_id, title, description, priority, control_type,
              (ROW_NUMBER() OVER (ORDER BY control_id) - 1)::integer
         FROM framework_controls
        WHERE framework_id = $3`,
      [newFwId, req.user.organization_id, source.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...fwResult.rows[0], control_count: insertResult.rowCount } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A custom framework with that code already exists' });
    }
    log('error', 'custom_frameworks.clone_failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
