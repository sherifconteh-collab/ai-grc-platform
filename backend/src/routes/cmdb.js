// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'cmdb-route' }));

const VALID_RESOURCE_TYPES = [
  'hardware',
  'software',
  'ai-agents',
  'service-accounts',
  'environments',
  'password-vaults',
];

// ── Search across all resource types ────────────────────────────────────────
router.get('/assets', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { search } = req.query;

    let query = 'SELECT * FROM cmdb_assets WHERE organization_id = $1';
    const params = [org_id];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND name ILIKE $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('CMDB search assets error:', error);
    res.status(500).json({ success: false, error: 'Failed to search assets' });
  }
});

// ── List ALL relationships for the org ──────────────────────────────────────
router.get('/relationships/all', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM cmdb_relationships WHERE organization_id = $1 ORDER BY created_at DESC',
      [org_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('CMDB list all relationships error:', error);
    res.status(500).json({ success: false, error: 'Failed to list relationships' });
  }
});

// ── List relationships filtered by asset_id ─────────────────────────────────
router.get('/relationships', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { asset_id } = req.query;

    if (!asset_id) {
      return res.status(400).json({ success: false, error: 'asset_id query param is required' });
    }

    const result = await pool.query(
      `SELECT * FROM cmdb_relationships
       WHERE organization_id = $1
         AND (source_asset_id = $2 OR target_asset_id = $2)
       ORDER BY created_at DESC`,
      [org_id, asset_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('CMDB list relationships error:', error);
    res.status(500).json({ success: false, error: 'Failed to list relationships' });
  }
});

// ── Create relationship ─────────────────────────────────────────────────────
router.post('/relationships', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { source_asset_id, target_asset_id, relationship_type } = req.body;

    if (!source_asset_id || !target_asset_id || !relationship_type) {
      return res.status(400).json({
        success: false,
        error: 'source_asset_id, target_asset_id, and relationship_type are required',
      });
    }

    const result = await pool.query(
      `INSERT INTO cmdb_relationships (organization_id, source_asset_id, target_asset_id, relationship_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [org_id, source_asset_id, target_asset_id, relationship_type]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('CMDB create relationship error:', error);
    res.status(500).json({ success: false, error: 'Failed to create relationship' });
  }
});

// ── Delete relationship ─────────────────────────────────────────────────────
router.delete('/relationships/:id', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM cmdb_relationships WHERE id = $1 AND organization_id = $2 RETURNING *',
      [id, org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Relationship not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('CMDB delete relationship error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete relationship' });
  }
});

// ── List assets by resource type ────────────────────────────────────────────
router.get('/:resource', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { resource } = req.params;

    if (!VALID_RESOURCE_TYPES.includes(resource)) {
      return res.status(400).json({ success: false, error: `Invalid resource type: ${resource}` });
    }

    const result = await pool.query(
      'SELECT * FROM cmdb_assets WHERE organization_id = $1 AND resource_type = $2 ORDER BY created_at DESC',
      [org_id, resource]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('CMDB list assets error:', error);
    res.status(500).json({ success: false, error: 'Failed to list assets' });
  }
});

// ── Get single asset ────────────────────────────────────────────────────────
router.get('/:resource/:id', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { resource, id } = req.params;

    if (!VALID_RESOURCE_TYPES.includes(resource)) {
      return res.status(400).json({ success: false, error: `Invalid resource type: ${resource}` });
    }

    const result = await pool.query(
      'SELECT * FROM cmdb_assets WHERE id = $1 AND organization_id = $2 AND resource_type = $3',
      [id, org_id, resource]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('CMDB get asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to get asset' });
  }
});

// ── Create asset ────────────────────────────────────────────────────────────
router.post('/:resource', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { resource } = req.params;

    if (!VALID_RESOURCE_TYPES.includes(resource)) {
      return res.status(400).json({ success: false, error: `Invalid resource type: ${resource}` });
    }

    const { name, description, owner, status, metadata } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const result = await pool.query(
      `INSERT INTO cmdb_assets (organization_id, resource_type, name, description, owner, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [org_id, resource, name, description || null, owner || null, status || 'active', metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('CMDB create asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to create asset' });
  }
});

// ── Update asset ────────────────────────────────────────────────────────────
router.put('/:resource/:id', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { resource, id } = req.params;

    if (!VALID_RESOURCE_TYPES.includes(resource)) {
      return res.status(400).json({ success: false, error: `Invalid resource type: ${resource}` });
    }

    const { name, description, owner, status, metadata } = req.body;

    const result = await pool.query(
      `UPDATE cmdb_assets
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           owner = COALESCE($3, owner),
           status = COALESCE($4, status),
           metadata = COALESCE($5, metadata),
           updated_at = NOW()
       WHERE id = $6 AND organization_id = $7 AND resource_type = $8
       RETURNING *`,
      [name, description, owner, status, metadata ? JSON.stringify(metadata) : null, id, org_id, resource]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('CMDB update asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to update asset' });
  }
});

// ── Delete asset ────────────────────────────────────────────────────────────
router.delete('/:resource/:id', async (req, res) => {
  try {
    const org_id = req.user.organization_id;
    const { resource, id } = req.params;

    if (!VALID_RESOURCE_TYPES.includes(resource)) {
      return res.status(400).json({ success: false, error: `Invalid resource type: ${resource}` });
    }

    const result = await pool.query(
      'DELETE FROM cmdb_assets WHERE id = $1 AND organization_id = $2 AND resource_type = $3 RETURNING *',
      [id, org_id, resource]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('CMDB delete asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

module.exports = router;
