// @tier: pro
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier } = require('../middleware/auth');
const { requireProEdition } = require('../middleware/edition');
const { validateBody, requireFields } = require('../middleware/validate');

router.use(authenticate);
router.use(requireProEdition('cmdb')); // Edition check BEFORE tier check
router.use(requireTier('pro'));
router.use((req, res, next) => {
  const permissions = req.user?.permissions || [];
  const has = (name) => permissions.includes('*') || permissions.includes(name);
  const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  const allowed = isReadMethod
    ? (has('assets.read') || has('environments.read') || has('service_accounts.read'))
    : (has('assets.write') || has('environments.write') || has('service_accounts.write'));

  if (!allowed) {
    return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  }

  next();
});

// ---------- Helper: Map route type to DB filter/table ----------
const ROUTE_TYPE_MAP = {
  'hardware': { categoryCode: 'hardware', table: 'assets' },
  'software': { categoryCode: 'software', table: 'assets' },
  'ai-agents': { categoryCode: 'ai_agent', table: 'assets' },
  'service-accounts': { table: 'service_accounts' },
  'environments': { table: 'environments' },
  'password-vaults': { table: 'password_vaults' },
};

// ---------- ENVIRONMENTS ----------
router.get('/environments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM environments WHERE organization_id = $1 ORDER BY name',
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('CMDB environments error:', error);
    res.status(500).json({ success: false, error: 'Failed to load environments' });
  }
});

router.get('/environments/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM environments WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/environments', validateBody((body) => requireFields(body, ['name', 'code'])), async (req, res) => {
  try {
    const { name, code, environment_type, description, contains_pii, contains_phi, contains_pci,
            data_classification, network_zone, security_level, criticality } = req.body;
    const result = await pool.query(`
      INSERT INTO environments (organization_id, name, code, environment_type, description,
        contains_pii, contains_phi, contains_pci, data_classification, network_zone, security_level, criticality)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.organization_id, name, code, environment_type, description,
       contains_pii, contains_phi, contains_pci, data_classification, network_zone, security_level, criticality]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.put('/environments/:id', async (req, res) => {
  try {
    const allowedFields = [
      'name',
      'code',
      'environment_type',
      'description',
      'contains_pii',
      'contains_phi',
      'contains_pci',
      'data_classification',
      'network_zone',
      'security_level',
      'criticality'
    ];

    const updates = [];
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates.push([field, req.body[field]]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const setClauses = updates.map(([col], index) => `${col} = $${index + 1}`);
    const values = updates.map(([, value]) => value);

    setClauses.push('updated_at = NOW()');
    values.push(req.params.id, req.user.organization_id);

    const result = await pool.query(
      `UPDATE environments SET ${setClauses.join(', ')} WHERE id = $${updates.length + 1} AND organization_id = $${updates.length + 2} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.delete('/environments/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM environments WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

// ---------- PASSWORD VAULTS ----------
router.get('/password-vaults', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM password_vaults WHERE organization_id = $1 ORDER BY name',
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/password-vaults/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM password_vaults WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/password-vaults', async (req, res) => {
  try {
    const { name, vault_type, vault_url, description } = req.body;
    const result = await pool.query(
      'INSERT INTO password_vaults (organization_id, name, vault_type, vault_url, description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.organization_id, name, vault_type, vault_url, description]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.put('/password-vaults/:id', async (req, res) => {
  try {
    const { name, vault_type, vault_url, description, is_active } = req.body;
    const result = await pool.query(`
      UPDATE password_vaults SET name=COALESCE($1,name), vault_type=COALESCE($2,vault_type),
        vault_url=COALESCE($3,vault_url), description=COALESCE($4,description), is_active=COALESCE($5,is_active)
      WHERE id=$6 AND organization_id=$7 RETURNING *`,
      [name, vault_type, vault_url, description, is_active, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.delete('/password-vaults/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM password_vaults WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

// ---------- SERVICE ACCOUNTS ----------
router.get('/service-accounts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sa.*, u.first_name || ' ' || u.last_name as owner_name
      FROM service_accounts sa LEFT JOIN users u ON u.id = sa.owner_id
      WHERE sa.organization_id = $1 ORDER BY sa.account_name`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.get('/service-accounts/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM service_accounts WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.post('/service-accounts', validateBody((body) => requireFields(body, ['account_name'])), async (req, res) => {
  try {
    const { account_name, account_type, description, owner_id, vault_id, credential_type,
            rotation_frequency_days, privilege_level, scope } = req.body;
    const result = await pool.query(`
      INSERT INTO service_accounts (organization_id, account_name, account_type, description, owner_id,
        vault_id, credential_type, rotation_frequency_days, privilege_level, scope)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.organization_id, account_name, account_type, description, owner_id,
       vault_id, credential_type, rotation_frequency_days || 90, privilege_level, scope]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.put('/service-accounts/:id', async (req, res) => {
  try {
    const allowedFields = [
      'account_name',
      'account_type',
      'description',
      'owner_id',
      'business_justification',
      'vault_id',
      'vault_path',
      'credential_type',
      'last_rotation_date',
      'rotation_frequency_days',
      'next_rotation_date',
      'auto_rotation_enabled',
      'privilege_level',
      'scope',
      'last_review_date',
      'next_review_date',
      'review_frequency_days',
      'reviewer_id',
      'status',
      'is_active'
    ];

    const updates = [];
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates.push([field, req.body[field]]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const setClauses = updates.map(([col], index) => `${col} = $${index + 1}`);
    const values = updates.map(([, value]) => value);

    setClauses.push('updated_at = NOW()');
    values.push(req.params.id, req.user.organization_id);

    const result = await pool.query(
      `UPDATE service_accounts SET ${setClauses.join(', ')} WHERE id = $${updates.length + 1} AND organization_id = $${updates.length + 2} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

router.delete('/service-accounts/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM service_accounts WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
});

// ---------- ASSETS (Hardware, Software, AI Agents) ----------
async function getCategoryId(code) {
  const result = await pool.query('SELECT id FROM asset_categories WHERE code = $1', [code]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

function assetRoutes(routePath, categoryCode) {
  router.get(`/${routePath}`, async (req, res) => {
    try {
      const catId = await getCategoryId(categoryCode);
      if (!catId) return res.json({ success: true, data: [] });

      const result = await pool.query(`
        SELECT a.*, u.first_name || ' ' || u.last_name as owner_name,
               e.name as environment_name
        FROM assets a
        LEFT JOIN users u ON u.id = a.owner_id
        LEFT JOIN environments e ON e.id = a.environment_id
        WHERE a.organization_id = $1 AND a.category_id = $2
        ORDER BY a.name`,
        [req.user.organization_id, catId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
  });

  router.get(`/${routePath}/:id`, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM assets WHERE id = $1 AND organization_id = $2',
        [req.params.id, req.user.organization_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
  });

  router.post(`/${routePath}`, async (req, res) => {
    try {
      const catId = await getCategoryId(categoryCode);
      if (!catId) return res.status(400).json({ success: false, error: 'Invalid category' });

      const { name, asset_tag, serial_number, model, manufacturer, owner_id, location,
              environment_id, status, criticality, ip_address, hostname, version, notes,
              ai_model_type, ai_risk_level } = req.body;

      const result = await pool.query(`
        INSERT INTO assets (organization_id, category_id, name, asset_tag, serial_number, model,
          manufacturer, owner_id, location, environment_id, status, criticality, ip_address, hostname,
          version, notes, ai_model_type, ai_risk_level)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [req.user.organization_id, catId, name, asset_tag, serial_number, model,
         manufacturer, owner_id, location, environment_id, status || 'active', criticality,
         ip_address, hostname, version, notes, ai_model_type, ai_risk_level]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
  });

  router.put(`/${routePath}/:id`, async (req, res) => {
    try {
      const allowedFields = [
        'name',
        'asset_tag',
        'serial_number',
        'model',
        'manufacturer',
        'owner_id',
        'custodian_id',
        'business_owner_id',
        'location',
        'environment_id',
        'status',
        'acquisition_date',
        'deployment_date',
        'end_of_life_date',
        'decommission_date',
        'security_classification',
        'criticality',
        'ip_address',
        'hostname',
        'fqdn',
        'mac_address',
        'version',
        'license_key',
        'license_expiry',
        'cloud_provider',
        'cloud_region',
        'ai_model_type',
        'ai_risk_level',
        'ai_training_data_source',
        'ai_bias_testing_completed',
        'ai_bias_testing_date',
        'ai_human_oversight_required',
        'ai_transparency_score',
        'compliance_status',
        'last_audit_date',
        'next_audit_date',
        'documentation_url',
        'notes',
        'metadata'
      ];

      const updates = [];
      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          const value = field === 'metadata' && req.body[field] ? JSON.stringify(req.body[field]) : req.body[field];
          updates.push([field, value]);
        }
      }

      if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

      const setClauses = updates.map(([col], index) => `${col} = $${index + 1}`);
      const values = updates.map(([, value]) => value);

      setClauses.push('updated_at = NOW()');
      values.push(req.params.id, req.user.organization_id);

      const result = await pool.query(
        `UPDATE assets SET ${setClauses.join(', ')} WHERE id = $${updates.length + 1} AND organization_id = $${updates.length + 2} RETURNING *`,
        values
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
  });

  router.delete(`/${routePath}/:id`, async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM assets WHERE id = $1 AND organization_id = $2 RETURNING id',
        [req.params.id, req.user.organization_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, message: 'Deleted' });
    } catch (error) { console.error('CMDB error:', error); res.status(500).json({ success: false, error: 'Internal server error' }); }
  });
}

// Register asset sub-routes
assetRoutes('hardware', 'hardware');
assetRoutes('software', 'software');
assetRoutes('ai-agents', 'ai_agent');

// ---------- ALL ASSETS (for link picker) ----------
router.get('/assets', async (req, res) => {
  try {
    const { search } = req.query;
    const result = await pool.query(`
      SELECT a.id, a.name, ac.name AS category_name, ac.code AS category_code
      FROM assets a
      JOIN asset_categories ac ON ac.id = a.category_id
      WHERE a.organization_id = $1
        AND ($2::text IS NULL OR a.name ILIKE $2 OR ac.name ILIKE $2)
      ORDER BY ac.name, a.name
      LIMIT 200`,
      [req.user.organization_id, search ? `%${search}%` : null]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to load assets' }); }
});

// ---------- ASSET RELATIONSHIPS ----------
router.get('/relationships', async (req, res) => {
  try {
    const { asset_id } = req.query;
    if (!asset_id) return res.status(400).json({ success: false, error: 'asset_id required' });

    const result = await pool.query(`
      SELECT ad.id, ad.dependency_type, ad.criticality, ad.notes,
             related.id AS related_asset_id, related.name AS related_asset_name,
             ac.name AS related_category_name, ac.code AS related_category_code,
             'outbound' AS direction
      FROM asset_dependencies ad
      JOIN assets related ON related.id = ad.depends_on_asset_id
      JOIN asset_categories ac ON ac.id = related.category_id
      WHERE ad.asset_id = $1 AND related.organization_id = $2
      UNION ALL
      SELECT ad.id, ad.dependency_type, ad.criticality, ad.notes,
             related.id AS related_asset_id, related.name AS related_asset_name,
             ac.name AS related_category_name, ac.code AS related_category_code,
             'inbound' AS direction
      FROM asset_dependencies ad
      JOIN assets related ON related.id = ad.asset_id
      JOIN asset_categories ac ON ac.id = related.category_id
      WHERE ad.depends_on_asset_id = $1 AND related.organization_id = $2
      ORDER BY direction, related_category_name, related_asset_name`,
      [asset_id, req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to load relationships' }); }
});

// All relationships for the org (used by dependency-map visualisation)
router.get('/relationships/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ad.id, ad.asset_id, ad.depends_on_asset_id, ad.dependency_type, ad.criticality, ad.notes
      FROM asset_dependencies ad
      JOIN assets a ON a.id = ad.asset_id
      WHERE a.organization_id = $1`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to load relationships' }); }
});

const ALLOWED_DEPENDENCY_TYPES = ['uses', 'requires', 'hosted_on', 'communicates_with'];
const ALLOWED_CRITICALITIES = ['high', 'medium', 'low'];

router.post('/relationships', async (req, res) => {
  try {
    const { asset_id, depends_on_asset_id, dependency_type, criticality, notes } = req.body;
    if (!asset_id || !depends_on_asset_id) {
      return res.status(400).json({ success: false, error: 'asset_id and depends_on_asset_id required' });
    }
    const resolvedType = dependency_type || 'uses';
    const resolvedCriticality = criticality || 'medium';
    if (!ALLOWED_DEPENDENCY_TYPES.includes(resolvedType)) {
      return res.status(400).json({ success: false, error: 'Invalid dependency type' });
    }
    if (!ALLOWED_CRITICALITIES.includes(resolvedCriticality)) {
      return res.status(400).json({ success: false, error: 'Invalid criticality level' });
    }
    // Verify both assets belong to the org
    const check = await pool.query(
      'SELECT id FROM assets WHERE id = ANY($1) AND organization_id = $2',
      [[asset_id, depends_on_asset_id], req.user.organization_id]
    );
    if (check.rows.length < 2) return res.status(404).json({ success: false, error: 'Asset not found' });

    const result = await pool.query(`
      INSERT INTO asset_dependencies (asset_id, depends_on_asset_id, dependency_type, criticality, notes)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [asset_id, depends_on_asset_id, resolvedType, resolvedCriticality, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'Relationship already exists' });
    res.status(500).json({ success: false, error: 'Failed to create relationship' });
  }
});

router.delete('/relationships/:id', async (req, res) => {
  try {
    // Verify the source asset (asset_id) of the relationship belongs to the org
    const result = await pool.query(`
      DELETE FROM asset_dependencies ad
      USING assets a
      WHERE ad.id = $1
        AND ad.asset_id = a.id
        AND a.organization_id = $2
      RETURNING ad.id`,
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to delete relationship' }); }
});

module.exports = router;
