// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// CMDB — Configuration Management Database
// Assets are stored in the `assets` table (migration 022).
// Relationships live in the POAM/vulnerability linking tables.
// ---------------------------------------------------------------

// GET /api/v1/cmdb/assets
router.get('/assets', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search, asset_type, limit = 200, offset = 0 } = req.query;

    const params = [orgId];
    const filters = [];
    if (asset_type) { params.push(asset_type); filters.push(`asset_type = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    const whereExtra = filters.length ? ' AND ' + filters.join(' AND ') : '';
    params.push(Number(limit) || 200, Number(offset) || 0);

    const result = await pool.query(
      `SELECT a.*,
              ac.name AS category_name
       FROM assets a
       LEFT JOIN asset_categories ac ON ac.id = a.category_id
       WHERE a.organization_id=$1 ${whereExtra}
       ORDER BY a.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = await pool.query(
      `SELECT COUNT(*) FROM assets WHERE organization_id=$1`,
      [orgId]
    );
    res.json({ success: true, data: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error('CMDB assets error:', err);
    res.status(500).json({ success: false, error: 'Failed to load assets' });
  }
});

// POST /api/v1/cmdb/assets
router.post('/assets', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, asset_type, description, ip_address, hostname, os, owner_id, category_id, criticality } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const result = await pool.query(
      `INSERT INTO assets (organization_id, name, asset_type, description, ip_address, hostname, os, owner_id, category_id, criticality)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, name, asset_type || null, description || null, ip_address || null,
       hostname || null, os || null, owner_id || null, category_id || null, criticality || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('CMDB asset create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create asset' });
  }
});

// GET /api/v1/cmdb/assets/:id
router.get('/assets/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT a.*, ac.name AS category_name
       FROM assets a LEFT JOIN asset_categories ac ON ac.id=a.category_id
       WHERE a.organization_id=$1 AND a.id=$2`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('CMDB asset get error:', err);
    res.status(500).json({ success: false, error: 'Failed to get asset' });
  }
});

// PUT /api/v1/cmdb/assets/:id
router.put('/assets/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, asset_type, description, ip_address, hostname, os, owner_id, category_id, criticality } = req.body || {};
    const result = await pool.query(
      `UPDATE assets
       SET name = COALESCE($3, name),
           asset_type = COALESCE($4, asset_type),
           description = COALESCE($5, description),
           ip_address = COALESCE($6, ip_address),
           hostname = COALESCE($7, hostname),
           os = COALESCE($8, os),
           owner_id = COALESCE($9, owner_id),
           category_id = COALESCE($10, category_id),
           criticality = COALESCE($11, criticality),
           updated_at = NOW()
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [orgId, req.params.id, name || null, asset_type || null, description || null,
       ip_address || null, hostname || null, os || null, owner_id || null, category_id || null, criticality || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('CMDB asset update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update asset' });
  }
});

// DELETE /api/v1/cmdb/assets/:id
router.delete('/assets/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM assets WHERE organization_id=$1 AND id=$2 RETURNING id, name`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('CMDB asset delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

// ---------------------------------------------------------------
// Relationships (stub — stored as JSONB on assets for now)
// ---------------------------------------------------------------

// GET /api/v1/cmdb/relationships
router.get('/relationships', requirePermission('controls.read'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// GET /api/v1/cmdb/relationships/all
router.get('/relationships/all', requirePermission('controls.read'), async (req, res) => {
  res.json({ success: true, data: [] });
});

// POST /api/v1/cmdb/relationships
router.post('/relationships', requirePermission('controls.write'), async (req, res) => {
  res.json({ success: true, data: { id: null, message: 'Asset relationships are a premium CMDB feature' } });
});

// ---------------------------------------------------------------
// Asset categories
// ---------------------------------------------------------------

// GET /api/v1/cmdb/categories
router.get('/categories', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT * FROM asset_categories WHERE organization_id IS NULL OR organization_id=$1 ORDER BY name`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('CMDB categories error:', err);
    res.status(500).json({ success: false, error: 'Failed to load asset categories' });
  }
});

module.exports = router;
