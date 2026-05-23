// @tier: pro
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, checkTierLimit, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const { normalizeTier, tierLevel } = require('../config/tierPolicy');

// Apply authentication and tier checking to all routes
router.use(authenticate);
router.use(checkTierLimit);

/**
 * GET /api/assets
 * Get all assets for the organization with filtering
 */
router.get('/', requirePermission('assets.read'), async (req, res) => {
  try {
    const { category, status, environment_id, search } = req.query;
    const orgId = req.user.organization_id;

    let query = `
      SELECT
        a.*,
        ac.name as category_name,
        ac.code as category_code,
        e.name as environment_name,
        u1.first_name || ' ' || u1.last_name as owner_name,
        u2.first_name || ' ' || u2.last_name as custodian_name,
        COALESCE(vs.critical_open, 0)::int AS vuln_critical,
        COALESCE(vs.high_open, 0)::int    AS vuln_high,
        COALESCE(vs.medium_open, 0)::int  AS vuln_medium,
        COALESCE(vs.low_open, 0)::int     AS vuln_low,
        COALESCE(vs.total_open, 0)::int   AS vuln_total_open
      FROM assets a
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      LEFT JOIN environments e ON a.environment_id = e.id
      LEFT JOIN users u1 ON a.owner_id = u1.id
      LEFT JOIN users u2 ON a.custodian_id = u2.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open','in_progress'))::int AS critical_open,
          COUNT(*) FILTER (WHERE severity = 'high'     AND status IN ('open','in_progress'))::int AS high_open,
          COUNT(*) FILTER (WHERE severity = 'medium'   AND status IN ('open','in_progress'))::int AS medium_open,
          COUNT(*) FILTER (WHERE severity = 'low'      AND status IN ('open','in_progress'))::int AS low_open,
          COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int                           AS total_open
        FROM vulnerability_findings
        WHERE asset_id = a.id AND organization_id = a.organization_id
      ) vs ON true
      WHERE a.organization_id = $1
    `;

    const params = [orgId];
    let paramCount = 1;

    if (category) {
      paramCount++;
      query += ` AND ac.code = $${paramCount}`;
      params.push(category);
    }

    if (status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
    }

    if (environment_id) {
      paramCount++;
      query += ` AND a.environment_id = $${paramCount}`;
      params.push(environment_id);
    }

    if (search) {
      paramCount++;
      query += ` AND (a.name ILIKE $${paramCount} OR a.hostname ILIKE $${paramCount} OR a.ip_address ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY a.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        assets: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assets' });
  }
});

/**
 * GET /api/assets/categories
 * Get all asset categories (with tier filtering)
 */
router.get('/categories', requirePermission('assets.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM asset_categories
      ORDER BY name ASC
    `);

    res.json({
      success: true,
      data: {
        categories: result.rows,
        allCategories: result.rows
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/assets/stats
 * Get asset statistics for dashboard
 */
router.get('/stats', requirePermission('assets.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_assets,
        COUNT(*) FILTER (WHERE status = 'active') as active_assets,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance_assets,
        COUNT(*) FILTER (WHERE status = 'deprecated') as deprecated_assets,
        COUNT(DISTINCT category_id) as categories_used,
        COUNT(DISTINCT environment_id) as environments_used
      FROM assets
      WHERE organization_id = $1
    `, [orgId]);

    const categoryBreakdown = await pool.query(`
      SELECT
        ac.name as category,
        ac.code,
        COUNT(a.id) as count
      FROM asset_categories ac
      LEFT JOIN assets a ON ac.id = a.category_id AND a.organization_id = $1
      GROUP BY ac.id, ac.name, ac.code
      ORDER BY count DESC
    `, [orgId]);

    res.json({
      success: true,
      data: {
        summary: stats.rows[0],
        byCategory: categoryBreakdown.rows
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/assets/:id
 * Get single asset by ID
 */
router.get('/:id', requirePermission('assets.read'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    const result = await pool.query(`
      SELECT
        a.*,
        ac.name as category_name,
        ac.code as category_code,
        e.name as environment_name,
        e.code as environment_code,
        u1.first_name || ' ' || u1.last_name as owner_name,
        u1.email as owner_email,
        u2.first_name || ' ' || u2.last_name as custodian_name,
        u3.first_name || ' ' || u3.last_name as business_owner_name
      FROM assets a
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      LEFT JOIN environments e ON a.environment_id = e.id
      LEFT JOIN users u1 ON a.owner_id = u1.id
      LEFT JOIN users u2 ON a.custodian_id = u2.id
      LEFT JOIN users u3 ON a.business_owner_id = u3.id
      WHERE a.id = $1 AND a.organization_id = $2
    `, [id, orgId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Get dependencies
    const dependencies = await pool.query(`
      SELECT
        ad.dependency_type,
        ad.criticality,
        ad.notes,
        a.id as asset_id,
        a.name as asset_name,
        ac.code as asset_category
      FROM asset_dependencies ad
      JOIN assets a ON ad.depends_on_asset_id = a.id
      JOIN asset_categories ac ON a.category_id = ac.id
      WHERE ad.asset_id = $1
    `, [id]);

    res.json({
      success: true,
      data: {
        asset: result.rows[0],
        dependencies: dependencies.rows
      }
    });
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch asset' });
  }
});

/**
 * POST /api/assets
 * Create new asset
 */
router.post('/', requirePermission('assets.write'), validateBody((body) => requireFields(body, ['category_id', 'name'])), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      category_id, name, asset_tag, serial_number, model, manufacturer,
      owner_id, custodian_id, business_owner_id,
      location, environment_id, status,
      acquisition_date, deployment_date, end_of_life_date,
      security_classification, criticality,
      ip_address, hostname, fqdn, mac_address,
      version, license_key, license_expiry,
      cloud_provider, cloud_region,
      ai_model_type, ai_risk_level, ai_training_data_source,
      ai_bias_testing_completed, ai_human_oversight_required,
      notes, metadata
    } = req.body;

    const result = await pool.query(`
      INSERT INTO assets (
        organization_id, category_id, name, asset_tag, serial_number, model, manufacturer,
        owner_id, custodian_id, business_owner_id,
        location, environment_id, status,
        acquisition_date, deployment_date, end_of_life_date,
        security_classification, criticality,
        ip_address, hostname, fqdn, mac_address,
        version, license_key, license_expiry,
        cloud_provider, cloud_region,
        ai_model_type, ai_risk_level, ai_training_data_source,
        ai_bias_testing_completed, ai_human_oversight_required,
        notes, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34
      )
      RETURNING *
    `, [
      orgId, category_id, name, asset_tag, serial_number, model, manufacturer,
      owner_id, custodian_id, business_owner_id,
      location, environment_id, status || 'active',
      acquisition_date, deployment_date, end_of_life_date,
      security_classification, criticality,
      ip_address, hostname, fqdn, mac_address,
      version, license_key, license_expiry,
      cloud_provider, cloud_region,
      ai_model_type, ai_risk_level, ai_training_data_source,
      ai_bias_testing_completed || false, ai_human_oversight_required || false,
      notes, metadata ? JSON.stringify(metadata) : null
    ]);

    res.status(201).json({
      success: true,
      data: { asset: result.rows[0] },
      message: 'Asset created successfully'
    });
  } catch (error) {
    console.error('Create asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to create asset' });
  }
});

/**
 * PUT /api/assets/:id
 * Update asset
 */
router.put('/:id', requirePermission('assets.write'), validateBody(() => []), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    // First verify asset belongs to organization
    const checkResult = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    const {
      name, asset_tag, serial_number, model, manufacturer,
      owner_id, custodian_id, business_owner_id,
      location, environment_id, status,
      acquisition_date, deployment_date, end_of_life_date, decommission_date,
      security_classification, criticality,
      ip_address, hostname, fqdn, mac_address,
      version, license_key, license_expiry,
      cloud_provider, cloud_region,
      ai_model_type, ai_risk_level, ai_training_data_source,
      ai_bias_testing_completed, ai_bias_testing_date, ai_human_oversight_required,
      notes, metadata
    } = req.body;

    const result = await pool.query(`
      UPDATE assets SET
        name = COALESCE($1, name),
        asset_tag = COALESCE($2, asset_tag),
        serial_number = COALESCE($3, serial_number),
        model = COALESCE($4, model),
        manufacturer = COALESCE($5, manufacturer),
        owner_id = COALESCE($6, owner_id),
        custodian_id = COALESCE($7, custodian_id),
        business_owner_id = COALESCE($8, business_owner_id),
        location = COALESCE($9, location),
        environment_id = COALESCE($10, environment_id),
        status = COALESCE($11, status),
        acquisition_date = COALESCE($12, acquisition_date),
        deployment_date = COALESCE($13, deployment_date),
        end_of_life_date = COALESCE($14, end_of_life_date),
        decommission_date = COALESCE($15, decommission_date),
        security_classification = COALESCE($16, security_classification),
        criticality = COALESCE($17, criticality),
        ip_address = COALESCE($18, ip_address),
        hostname = COALESCE($19, hostname),
        fqdn = COALESCE($20, fqdn),
        mac_address = COALESCE($21, mac_address),
        version = COALESCE($22, version),
        license_key = COALESCE($23, license_key),
        license_expiry = COALESCE($24, license_expiry),
        cloud_provider = COALESCE($25, cloud_provider),
        cloud_region = COALESCE($26, cloud_region),
        ai_model_type = COALESCE($27, ai_model_type),
        ai_risk_level = COALESCE($28, ai_risk_level),
        ai_training_data_source = COALESCE($29, ai_training_data_source),
        ai_bias_testing_completed = COALESCE($30, ai_bias_testing_completed),
        ai_bias_testing_date = COALESCE($31, ai_bias_testing_date),
        ai_human_oversight_required = COALESCE($32, ai_human_oversight_required),
        notes = COALESCE($33, notes),
        metadata = COALESCE($34, metadata),
        updated_at = NOW()
      WHERE id = $35 AND organization_id = $36
      RETURNING *
    `, [
      name, asset_tag, serial_number, model, manufacturer,
      owner_id, custodian_id, business_owner_id,
      location, environment_id, status,
      acquisition_date, deployment_date, end_of_life_date, decommission_date,
      security_classification, criticality,
      ip_address, hostname, fqdn, mac_address,
      version, license_key, license_expiry,
      cloud_provider, cloud_region,
      ai_model_type, ai_risk_level, ai_training_data_source,
      ai_bias_testing_completed, ai_bias_testing_date, ai_human_oversight_required,
      notes, metadata ? JSON.stringify(metadata) : null,
      id, orgId
    ]);

    res.json({
      success: true,
      data: { asset: result.rows[0] },
      message: 'Asset updated successfully'
    });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to update asset' });
  }
});

/**
 * DELETE /api/assets/:id
 * Delete asset
 */
router.delete('/:id', requirePermission('assets.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    const result = await pool.query(
      'DELETE FROM assets WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

module.exports = router;
