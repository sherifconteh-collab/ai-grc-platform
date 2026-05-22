// @tier: enterprise
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { requireProEdition } = require('../middleware/edition');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { log } = require('../utils/logger');

router.use(authenticate);
router.use(requireProEdition('externalAi'));
router.use(requireTier('enterprise'));

const rateLimiter = createOrgRateLimiter({ label: 'ai-governance', max: 120, windowMs: 15 * 60 * 1000 });
router.use(rateLimiter);

// GET /ai-governance/summary
router.get('/summary', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const [vendors, incidents, supply] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM ai_vendor_assessments WHERE organization_id = $1', [orgId]),
      pool.query("SELECT COUNT(*) FROM ai_vendor_incidents WHERE organization_id = $1 AND status = 'open'", [orgId]),
      pool.query('SELECT COUNT(*) FROM ai_supply_chain_components WHERE organization_id = $1 AND is_active = true', [orgId]),
    ]);
    res.json({
      success: true,
      data: {
        total_vendors: parseInt(vendors.rows[0].count, 10),
        open_incidents: parseInt(incidents.rows[0].count, 10),
        supply_chain_components: parseInt(supply.rows[0].count, 10),
      },
    });
  } catch (error) {
    log('error', 'aiGovernance.summary.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai-governance/vendors
router.get('/vendors', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { risk_level, vendor_type, status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['organization_id = $1'];
    const values = [orgId];
    let idx = 2;

    if (risk_level) { conditions.push(`risk_level = $${idx++}`); values.push(risk_level); }
    if (vendor_type) { conditions.push(`vendor_type = $${idx++}`); values.push(vendor_type); }
    if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
    if (search) {
      const escaped = String(search).replace(/[%_\\]/g, '\\$&');
      conditions.push(`vendor_name ILIKE $${idx++}`);
      values.push(`%${escaped}%`);
    }

    const where = conditions.join(' AND ');
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM ai_vendor_assessments WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'aiGovernance.vendors.list.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai-governance/vendors/:id
router.get('/vendors/:id', requirePermission('ai.read'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ai_vendor_assessments WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor assessment not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.vendors.get.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai-governance/vendors
router.post('/vendors', requirePermission('ai.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_name, vendor_type, vendor_website, vendor_contact, risk_level, overall_risk_score } = req.body;
    if (!vendor_name || !vendor_type) {
      return res.status(400).json({ error: 'vendor_name and vendor_type are required' });
    }
    const VALID_TYPES = ['llm_provider', 'ml_platform', 'data_provider', 'ai_tool', 'consulting'];
    if (!VALID_TYPES.includes(vendor_type)) {
      return res.status(400).json({ error: `vendor_type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const result = await pool.query(
      `INSERT INTO ai_vendor_assessments
         (organization_id, vendor_name, vendor_type, vendor_website, vendor_contact, risk_level, overall_risk_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [orgId, vendor_name, vendor_type, vendor_website || null, vendor_contact || null, risk_level || null, overall_risk_score || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.vendors.create.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /ai-governance/vendors/:id
router.patch('/vendors/:id', requirePermission('ai.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;
    const existing = await pool.query(
      'SELECT id FROM ai_vendor_assessments WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Vendor assessment not found' });

    const allowed = ['vendor_name','vendor_type','vendor_website','vendor_contact','risk_level','overall_risk_score','status'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id, orgId);
    const result = await pool.query(
      `UPDATE ai_vendor_assessments SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.vendors.update.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /ai-governance/vendors/:id
router.delete('/vendors/:id', requirePermission('ai.write'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM ai_vendor_assessments WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Vendor assessment not found' });
    res.json({ success: true });
  } catch (error) {
    log('error', 'aiGovernance.vendors.delete.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai-governance/incidents
router.get('/incidents', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_assessment_id, severity, status, incident_type } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['organization_id = $1'];
    const values = [orgId];
    let idx = 2;

    if (vendor_assessment_id) { conditions.push(`vendor_assessment_id = $${idx++}`); values.push(vendor_assessment_id); }
    if (severity) { conditions.push(`severity = $${idx++}`); values.push(severity); }
    if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
    if (incident_type) { conditions.push(`incident_type = $${idx++}`); values.push(incident_type); }

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM ai_vendor_incidents WHERE ${conditions.join(' AND ')}
       ORDER BY incident_date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'aiGovernance.incidents.list.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai-governance/incidents
router.post('/incidents', requirePermission('ai.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_assessment_id, title, description, severity, incident_type, incident_date } = req.body;
    if (!title || !severity) {
      return res.status(400).json({ error: 'title and severity are required' });
    }
    const result = await pool.query(
      `INSERT INTO ai_vendor_incidents
         (organization_id, vendor_assessment_id, title, description, severity, incident_type, incident_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [orgId, vendor_assessment_id || null, title, description || null, severity, incident_type || null, incident_date || new Date()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.incidents.create.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /ai-governance/incidents/:id
router.patch('/incidents/:id', requirePermission('ai.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;
    const allowed = ['title','description','severity','status','incident_type','incident_date','resolution_notes'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id, orgId);
    const result = await pool.query(
      `UPDATE ai_vendor_incidents SET ${updates.join(', ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Incident not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.incidents.update.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai-governance/supply-chain
router.get('/supply-chain', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { source_vendor_id, component_type, risk_level, approved_for_use } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['organization_id = $1', 'is_active = true'];
    const values = [orgId];
    let idx = 2;

    if (source_vendor_id) { conditions.push(`source_vendor_id = $${idx++}`); values.push(source_vendor_id); }
    if (component_type) { conditions.push(`component_type = $${idx++}`); values.push(component_type); }
    if (risk_level) { conditions.push(`risk_level = $${idx++}`); values.push(risk_level); }
    if (approved_for_use !== undefined) {
      conditions.push(`approved_for_use = $${idx++}`);
      values.push(approved_for_use === 'true');
    }

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM ai_supply_chain_components WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'aiGovernance.supplyChain.list.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai-governance/supply-chain
router.post('/supply-chain', requirePermission('ai.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { component_name, component_type, source_vendor_id, risk_level, version } = req.body;
    if (!component_name || !component_type) {
      return res.status(400).json({ error: 'component_name and component_type are required' });
    }
    const result = await pool.query(
      `INSERT INTO ai_supply_chain_components
         (organization_id, component_name, component_type, source_vendor_id, risk_level, version)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orgId, component_name, component_type, source_vendor_id || null, risk_level || null, version || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.supplyChain.create.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /ai-governance/supply-chain/:id
router.patch('/supply-chain/:id', requirePermission('ai.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;
    const allowed = ['component_name','component_type','risk_level','version','approved_for_use','is_active'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id, orgId);
    const result = await pool.query(
      `UPDATE ai_supply_chain_components SET ${updates.join(', ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Supply chain component not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiGovernance.supplyChain.update.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
