// @tier: pro
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const { normalizeTier, getCmdbEnvironmentLimit } = require('../config/tierPolicy');

// Apply authentication to all routes
router.use(authenticate);
router.use(requireTier('pro'));

/**
 * GET /api/environments
 * Get all environments for organization
 */
router.get('/', requirePermission('environments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(`
      SELECT
        e.*,
        u.first_name || ' ' || u.last_name as owner_name,
        (SELECT COUNT(*) FROM assets WHERE environment_id = e.id) as asset_count
      FROM environments e
      LEFT JOIN users u ON e.owner_id = u.id
      WHERE e.organization_id = $1
      ORDER BY e.name ASC
    `, [orgId]);

    res.json({
      success: true,
      data: {
        environments: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get environments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch environments' });
  }
});

/**
 * GET /api/environments/:id
 * Get single environment by ID with assets
 */
router.get('/:id', requirePermission('environments.read'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    const envResult = await pool.query(`
      SELECT
        e.*,
        u.first_name || ' ' || u.last_name as owner_name,
        u.email as owner_email
      FROM environments e
      LEFT JOIN users u ON e.owner_id = u.id
      WHERE e.id = $1 AND e.organization_id = $2
    `, [id, orgId]);

    if (envResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }

    // Get assets in this environment
    const assetsResult = await pool.query(`
      SELECT
        a.id, a.name, a.status, a.ip_address, a.hostname,
        ac.name as category, ac.code as category_code
      FROM assets a
      JOIN asset_categories ac ON a.category_id = ac.id
      WHERE a.environment_id = $1
      ORDER BY a.name ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        environment: envResult.rows[0],
        assets: assetsResult.rows
      }
    });
  } catch (error) {
    console.error('Get environment error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch environment' });
  }
});

/**
 * POST /api/environments
 * Create new environment (Starter+ tier)
 */
router.post('/', requireTier('pro'), requirePermission('environments.write'), validateBody((body) => requireFields(body, ['name', 'code'])), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      name, code, environment_type,
      contains_pii, contains_phi, contains_pci, data_classification,
      ip_addresses, network_zone,
      security_level, criticality,
      compliance_requirements,
      description, owner_id
    } = req.body;

    const result = await pool.query(`
      INSERT INTO environments (
        organization_id, name, code, environment_type,
        contains_pii, contains_phi, contains_pci, data_classification,
        ip_addresses, network_zone,
        security_level, criticality,
        compliance_requirements,
        description, owner_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      orgId, name, code, environment_type,
      contains_pii || false, contains_phi || false, contains_pci || false, data_classification,
      ip_addresses ? JSON.stringify(ip_addresses) : null, network_zone,
      security_level, criticality,
      compliance_requirements ? JSON.stringify(compliance_requirements) : null,
      description, owner_id
    ]);

    res.status(201).json({
      success: true,
      data: { environment: result.rows[0] },
      message: 'Environment created successfully'
    });
  } catch (error) {
    if (error.constraint === 'environments_organization_id_code_key') {
      return res.status(400).json({ success: false, error: 'Environment code already exists' });
    }
    console.error('Create environment error:', error);
    res.status(500).json({ success: false, error: 'Failed to create environment' });
  }
});

/**
 * PUT /api/environments/:id
 * Update environment
 */
router.put('/:id', requireTier('pro'), requirePermission('environments.write'), validateBody(() => []), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    // Verify environment belongs to organization
    const checkResult = await pool.query(
      'SELECT id FROM environments WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }

    const {
      name, code, environment_type,
      contains_pii, contains_phi, contains_pci, data_classification,
      ip_addresses, network_zone,
      security_level, criticality,
      compliance_requirements,
      description, owner_id
    } = req.body;

    const result = await pool.query(`
      UPDATE environments SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        environment_type = COALESCE($3, environment_type),
        contains_pii = COALESCE($4, contains_pii),
        contains_phi = COALESCE($5, contains_phi),
        contains_pci = COALESCE($6, contains_pci),
        data_classification = COALESCE($7, data_classification),
        ip_addresses = COALESCE($8, ip_addresses),
        network_zone = COALESCE($9, network_zone),
        security_level = COALESCE($10, security_level),
        criticality = COALESCE($11, criticality),
        compliance_requirements = COALESCE($12, compliance_requirements),
        description = COALESCE($13, description),
        owner_id = COALESCE($14, owner_id),
        updated_at = NOW()
      WHERE id = $15 AND organization_id = $16
      RETURNING *
    `, [
      name, code, environment_type,
      contains_pii, contains_phi, contains_pci, data_classification,
      ip_addresses ? JSON.stringify(ip_addresses) : null, network_zone,
      security_level, criticality,
      compliance_requirements ? JSON.stringify(compliance_requirements) : null,
      description, owner_id,
      id, orgId
    ]);

    res.json({
      success: true,
      data: { environment: result.rows[0] },
      message: 'Environment updated successfully'
    });
  } catch (error) {
    console.error('Update environment error:', error);
    res.status(500).json({ success: false, error: 'Failed to update environment' });
  }
});

/**
 * DELETE /api/environments/:id
 * Delete environment (must have no assets)
 */
router.delete('/:id', requireTier('pro'), requirePermission('environments.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    // Check if environment has assets
    const assetCheck = await pool.query(
      'SELECT COUNT(*) as count FROM assets WHERE environment_id = $1',
      [id]
    );

    if (parseInt(assetCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete environment with existing assets',
        message: 'Please reassign or delete all assets in this environment first'
      });
    }

    const result = await pool.query(
      'DELETE FROM environments WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }

    res.json({
      success: true,
      message: 'Environment deleted successfully'
    });
  } catch (error) {
    console.error('Delete environment error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete environment' });
  }
});

module.exports = router;
