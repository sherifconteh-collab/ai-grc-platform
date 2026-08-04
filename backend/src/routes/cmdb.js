// @tier: pro
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier } = require('../middleware/auth');
const { requireProEdition } = require('../middleware/edition');
const { validateBody, requireFields } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { log, serializeError } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

// Three layers, in this specific order, matching rmfInheritance.js: (1) a
// cheap per-process IP-based limiter first, so requests are bounded before
// authenticate does JWT and DB work -- and, importantly, this is the
// middleware CodeQL's static analysis can actually trace as guarding the
// router; (2) authenticate; (3) the org-scoped limiter below.
//
// The org-scoped createRateLimiter alone is a real limiter but an invisible
// one to js/missing-rate-limiting, which raised seven high-severity alerts
// against these handlers even though every one of them was already bounded.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }));

router.use(authenticate);
router.use(requireProEdition('cmdb')); // Edition check BEFORE tier check
router.use(requireTier('pro'));

// Rate limiter: 120 requests per 15 minutes per org. Defense-in-depth alongside
// the global /api/v1 limiter, and consistent with tprm/evidence/etc. route modules.
const cmdbRateLimiter = createRateLimiter({
  label: 'cmdb',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});
router.use(cmdbRateLimiter);

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

// ---------- ASSET ↔ CONTROL MAPPINGS ----------
// asset_control_mappings has existed since migration 005, commented "Links
// assets to compliance controls for traceability" and indexed on both foreign
// keys, but nothing ever read or wrote it. CM-8 (System Component Inventory)
// is the control an asset inventory exists to satisfy, so an inventory that
// cannot be tied to a control cannot evidence one. These routes wire it up.
const MAPPING_COMPLIANCE_STATUS = ['compliant', 'non_compliant', 'partial', 'not_applicable'];
const MAPPING_FIELDS = ['compliance_status', 'last_assessed', 'next_assessment', 'evidence_url', 'notes'];

async function assertOrgAsset(assetId, orgId) {
  const { rows } = await pool.query(
    'SELECT id FROM assets WHERE id = $1 AND organization_id = $2',
    [assetId, orgId]
  );
  return rows.length > 0;
}

router.get('/assets/:assetId/controls', async (req, res) => {
  try {
    if (!(await assertOrgAsset(req.params.assetId, req.user.organization_id))) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    const result = await pool.query(`
      SELECT acm.id, acm.control_id, acm.compliance_status, acm.last_assessed,
             acm.next_assessment, acm.evidence_url, acm.notes, acm.created_at,
             fc.control_id AS control_ref, fc.title AS control_title,
             f.code AS framework_code, f.name AS framework_name
      FROM asset_control_mappings acm
      JOIN framework_controls fc ON fc.id = acm.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE acm.asset_id = $1 AND acm.organization_id = $2
      ORDER BY f.code, fc.control_id`,
      [req.params.assetId, req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'cmdb.request_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/assets/:assetId/controls',
  validateBody((body) => requireFields(body, ['control_id'])),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      if (!(await assertOrgAsset(req.params.assetId, orgId))) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
      }

      const { control_id, compliance_status } = req.body;
      if (compliance_status && !MAPPING_COMPLIANCE_STATUS.includes(compliance_status)) {
        return res.status(400).json({
          success: false,
          error: `compliance_status must be one of: ${MAPPING_COMPLIANCE_STATUS.join(', ')}`
        });
      }

      const control = await pool.query('SELECT id FROM framework_controls WHERE id = $1', [control_id]);
      if (control.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Control not found' });
      }

      const result = await pool.query(`
        INSERT INTO asset_control_mappings
          (asset_id, control_id, organization_id, compliance_status, last_assessed, next_assessment, evidence_url, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (asset_id, control_id, organization_id) DO UPDATE SET
          compliance_status = EXCLUDED.compliance_status,
          last_assessed     = EXCLUDED.last_assessed,
          next_assessment   = EXCLUDED.next_assessment,
          evidence_url      = EXCLUDED.evidence_url,
          notes             = EXCLUDED.notes
        RETURNING *`,
        [req.params.assetId, control_id, orgId, compliance_status || null,
         req.body.last_assessed || null, req.body.next_assessment || null,
         req.body.evidence_url || null, req.body.notes || null]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      log('error', 'cmdb.request_failed', { error: serializeError(error) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

router.put('/assets/:assetId/controls/:controlId', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!(await assertOrgAsset(req.params.assetId, orgId))) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    if (req.body.compliance_status && !MAPPING_COMPLIANCE_STATUS.includes(req.body.compliance_status)) {
      return res.status(400).json({
        success: false,
        error: `compliance_status must be one of: ${MAPPING_COMPLIANCE_STATUS.join(', ')}`
      });
    }

    const updates = MAPPING_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(req.body, field))
      .map((field) => [field, req.body[field]]);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    const setClauses = updates.map(([col], index) => `${col} = $${index + 1}`);
    const values = updates.map(([, value]) => value);
    values.push(req.params.assetId, req.params.controlId, orgId);

    const result = await pool.query(
      `UPDATE asset_control_mappings SET ${setClauses.join(', ')}
       WHERE asset_id = $${updates.length + 1} AND control_id = $${updates.length + 2}
         AND organization_id = $${updates.length + 3} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Mapping not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'cmdb.request_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/assets/:assetId/controls/:controlId', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM asset_control_mappings
       WHERE asset_id = $1 AND control_id = $2 AND organization_id = $3 RETURNING id`,
      [req.params.assetId, req.params.controlId, req.user.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Mapping not found' });
    res.json({ success: true, message: 'Unlinked' });
  } catch (error) {
    log('error', 'cmdb.request_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Reverse lookup, so a control can show the assets that evidence it.
router.get('/controls/:controlId/assets', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT acm.id, acm.compliance_status, acm.last_assessed, acm.next_assessment,
             acm.evidence_url, acm.notes,
             a.id AS asset_id, a.name AS asset_name, a.status AS asset_status,
             a.criticality, ac.name AS category_name, ac.code AS category_code,
             e.name AS environment_name
      FROM asset_control_mappings acm
      JOIN assets a ON a.id = acm.asset_id
      JOIN asset_categories ac ON ac.id = a.category_id
      LEFT JOIN environments e ON e.id = a.environment_id
      WHERE acm.control_id = $1 AND acm.organization_id = $2
      ORDER BY ac.name, a.name`,
      [req.params.controlId, req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'cmdb.request_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------- ASSET ↔ RISK ----------
// risk_asset_links and the write side (POST/DELETE /risks/:id/assets) shipped
// with migration 140, but only the risk half. From an asset there was no way to
// see what it is exposed to, which is the direction an asset owner actually
// asks the question in. These are the reverse views; linking still happens on
// the risk, so there is one place that owns the relationship.
router.get('/assets/:assetId/risks', async (req, res) => {
  try {
    if (!(await assertOrgAsset(req.params.assetId, req.user.organization_id))) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    const result = await pool.query(`
      SELECT r.id, r.title, r.category, r.status,
             r.inherent_likelihood, r.inherent_impact, r.inherent_score,
             r.residual_likelihood, r.residual_impact, r.residual_score,
             r.next_review_date, ral.created_at AS linked_at
      FROM risk_asset_links ral
      JOIN risks r ON r.id = ral.risk_id
      WHERE ral.asset_id = $1 AND ral.organization_id = $2
      ORDER BY COALESCE(r.residual_score, r.inherent_score) DESC NULLS LAST, r.title`,
      [req.params.assetId, req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'cmdb.request_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Risk exposure for a whole category of assets, so a register can show it as a
// column without issuing one query per row.
router.get('/risk-exposure', async (req, res) => {
  try {
    const params = [req.user.organization_id];
    let categoryFilter = '';
    if (req.query.category) {
      const { rows } = await pool.query(
        'SELECT id FROM asset_categories WHERE code = $1',
        [req.query.category]
      );
      if (rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Unknown asset category' });
      }
      params.push(rows[0].id);
      categoryFilter = 'AND a.category_id = $2';
    }

    // LEFT JOIN LATERAL over the link table rather than a correlated subquery,
    // per .claude/rules/database.md, and COUNT(DISTINCT) so an asset linked to
    // several risks is not inflated by the join.
    const result = await pool.query(`
      SELECT a.id AS asset_id, a.name AS asset_name, a.criticality,
             exposure.open_risks, exposure.max_residual, exposure.top_risk_title
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT r.id)::int AS open_risks,
               MAX(COALESCE(r.residual_score, r.inherent_score)) AS max_residual,
               (ARRAY_AGG(r.title ORDER BY COALESCE(r.residual_score, r.inherent_score) DESC NULLS LAST))[1]
                 AS top_risk_title
        FROM risk_asset_links ral
        JOIN risks r ON r.id = ral.risk_id
        WHERE ral.asset_id = a.id
          AND ral.organization_id = a.organization_id
          AND r.status NOT IN ('closed', 'accepted')
      ) exposure ON TRUE
      WHERE a.organization_id = $1 ${categoryFilter}
      ORDER BY exposure.max_residual DESC NULLS LAST, a.name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'cmdb.request_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
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
