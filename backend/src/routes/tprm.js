// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// TPRM — Third-Party Risk Management
// ---------------------------------------------------------------

// GET /api/v1/tprm/summary
router.get('/summary', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const vendors = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE risk_tier = 'critical') AS critical,
         COUNT(*) FILTER (WHERE risk_tier = 'high') AS high,
         COUNT(*) FILTER (WHERE risk_tier = 'medium') AS medium,
         COUNT(*) FILTER (WHERE risk_tier = 'low') AS low
       FROM tprm_vendors WHERE organization_id=$1`,
      [orgId]
    );
    const questionnaires = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed
       FROM tprm_questionnaires WHERE organization_id=$1`,
      [orgId]
    );
    res.json({
      success: true,
      data: {
        vendors: vendors.rows[0],
        questionnaires: questionnaires.rows[0]
      }
    });
  } catch (err) {
    console.error('TPRM summary error:', err);
    res.status(500).json({ success: false, error: 'Failed to load TPRM summary' });
  }
});

// GET /api/v1/tprm/vendors
router.get('/vendors', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { risk_tier, status, search, limit = 100, offset = 0 } = req.query;

    const params = [orgId];
    const filters = [];
    if (risk_tier) { params.push(risk_tier); filters.push(`risk_tier = $${params.length}`); }
    if (status) { params.push(status); filters.push(`status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); filters.push(`vendor_name ILIKE $${params.length}`); }

    const whereExtra = filters.length ? ' AND ' + filters.join(' AND ') : '';
    params.push(Number(limit) || 100, Number(offset) || 0);

    const result = await pool.query(
      `SELECT * FROM tprm_vendors WHERE organization_id=$1 ${whereExtra}
       ORDER BY risk_tier, vendor_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TPRM vendors error:', err);
    res.status(500).json({ success: false, error: 'Failed to load vendors' });
  }
});

// POST /api/v1/tprm/vendors
router.post('/vendors', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      vendor_name, vendor_type, risk_tier, services_provided, data_access_level,
      website, primary_contact, contact_email
    } = req.body || {};
    if (!vendor_name) {
      return res.status(400).json({ success: false, error: 'vendor_name is required' });
    }
    const result = await pool.query(
      `INSERT INTO tprm_vendors (
         organization_id, vendor_name, vendor_type, risk_tier, services_provided,
         data_access_level, website, primary_contact, contact_email, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        orgId, vendor_name, vendor_type || null, risk_tier || 'medium',
        services_provided || null, data_access_level || 'none',
        website || null, primary_contact || null, contact_email || null, req.user.id
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TPRM vendor create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create vendor' });
  }
});

// PUT /api/v1/tprm/vendors/:id
router.put('/vendors/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_name, vendor_type, risk_tier, services_provided, data_access_level,
            website, primary_contact, contact_email, status } = req.body || {};
    const result = await pool.query(
      `UPDATE tprm_vendors
       SET vendor_name = COALESCE($3, vendor_name),
           vendor_type = COALESCE($4, vendor_type),
           risk_tier = COALESCE($5, risk_tier),
           services_provided = COALESCE($6, services_provided),
           data_access_level = COALESCE($7, data_access_level),
           website = COALESCE($8, website),
           primary_contact = COALESCE($9, primary_contact),
           contact_email = COALESCE($10, contact_email),
           status = COALESCE($11, status),
           updated_at = NOW()
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [orgId, req.params.id, vendor_name || null, vendor_type || null, risk_tier || null,
       services_provided || null, data_access_level || null, website || null,
       primary_contact || null, contact_email || null, status || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TPRM vendor update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update vendor' });
  }
});

// DELETE /api/v1/tprm/vendors/:id
router.delete('/vendors/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM tprm_vendors WHERE organization_id=$1 AND id=$2 RETURNING id`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    console.error('TPRM vendor delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete vendor' });
  }
});

// GET /api/v1/tprm/cmdb-assets
router.get('/cmdb-assets', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search } = req.query;
    const params = [orgId];
    let whereExtra = '';
    if (search) { params.push(`%${search}%`); whereExtra = ` AND name ILIKE $${params.length}`; }
    const result = await pool.query(
      `SELECT id, name, asset_type, description FROM assets WHERE organization_id=$1 ${whereExtra} ORDER BY name LIMIT 200`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TPRM cmdb assets error:', err);
    res.status(500).json({ success: false, error: 'Failed to load assets' });
  }
});

// GET /api/v1/tprm/questionnaires
router.get('/questionnaires', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, status, limit = 100, offset = 0 } = req.query;
    const params = [orgId];
    const filters = [];
    if (vendor_id) { params.push(vendor_id); filters.push(`q.vendor_id = $${params.length}`); }
    if (status) { params.push(status); filters.push(`q.status = $${params.length}`); }
    const whereExtra = filters.length ? ' AND ' + filters.join(' AND ') : '';
    params.push(Number(limit) || 100, Number(offset) || 0);

    const result = await pool.query(
      `SELECT q.*, v.vendor_name, v.risk_tier
       FROM tprm_questionnaires q
       JOIN tprm_vendors v ON v.id = q.vendor_id
       WHERE q.organization_id=$1 ${whereExtra}
       ORDER BY q.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TPRM questionnaires error:', err);
    res.status(500).json({ success: false, error: 'Failed to load questionnaires' });
  }
});

// POST /api/v1/tprm/questionnaires
router.post('/questionnaires', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { vendor_id, title, questions, due_date } = req.body || {};
    if (!vendor_id || !title) {
      return res.status(400).json({ success: false, error: 'vendor_id and title are required' });
    }
    const result = await pool.query(
      `INSERT INTO tprm_questionnaires (organization_id, vendor_id, title, questions, status, due_date, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6)
       RETURNING *`,
      [orgId, vendor_id, title, questions || null, due_date || null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TPRM questionnaire create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create questionnaire' });
  }
});

// GET /api/v1/tprm/questionnaires/:id
router.get('/questionnaires/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT q.*, v.vendor_name, v.risk_tier, v.contact_email
       FROM tprm_questionnaires q JOIN tprm_vendors v ON v.id=q.vendor_id
       WHERE q.organization_id=$1 AND q.id=$2`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TPRM questionnaire get error:', err);
    res.status(500).json({ success: false, error: 'Failed to get questionnaire' });
  }
});

// GET /api/v1/tprm/documents
router.get('/documents', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { questionnaire_id, limit = 50, offset = 0 } = req.query;
    const params = [orgId];
    let whereExtra = '';
    if (questionnaire_id) { params.push(questionnaire_id); whereExtra = ` AND questionnaire_id=$${params.length}`; }
    params.push(Number(limit) || 50, Number(offset) || 0);
    const result = await pool.query(
      `SELECT id, questionnaire_id, original_filename, file_size_bytes, mime_type,
              is_sbom, sbom_format, sbom_component_count, ai_analyzed_at, uploaded_at
       FROM tprm_evidence
       WHERE organization_id=$1 ${whereExtra}
       ORDER BY uploaded_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TPRM documents error:', err);
    res.status(500).json({ success: false, error: 'Failed to load documents' });
  }
});

// POST /api/v1/tprm/documents
router.post('/documents', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { questionnaire_id, original_filename, file_size_bytes, mime_type } = req.body || {};
    if (!questionnaire_id || !original_filename) {
      return res.status(400).json({ success: false, error: 'questionnaire_id and original_filename are required' });
    }
    const result = await pool.query(
      `INSERT INTO tprm_evidence (organization_id, questionnaire_id, original_filename, file_size_bytes, mime_type, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, questionnaire_id, original_filename, uploaded_at`,
      [orgId, questionnaire_id, original_filename, file_size_bytes || null, mime_type || null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TPRM document create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create document' });
  }
});

module.exports = router;
