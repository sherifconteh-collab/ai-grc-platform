// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'data-sovereignty-route' }));

// GET /config - Get data sovereignty config for org
router.get('/config', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM data_sovereignty_config WHERE organization_id = $1',
      [orgId]
    );
    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ success: false, error: 'Failed to get config' });
  }
});

// PUT /config - Upsert data sovereignty config
router.put('/config', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { primary_region, data_residency_enabled, config } = req.body;
    const result = await pool.query(
      `INSERT INTO data_sovereignty_config (organization_id, primary_region, data_residency_enabled, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id) DO UPDATE SET
         primary_region = EXCLUDED.primary_region,
         data_residency_enabled = EXCLUDED.data_residency_enabled,
         config = EXCLUDED.config,
         updated_at = NOW()
       RETURNING *`,
      [orgId, primary_region, data_residency_enabled, JSON.stringify(config)]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error upserting config:', error);
    res.status(500).json({ success: false, error: 'Failed to upsert config' });
  }
});

// GET /jurisdictions - List all jurisdictions (global)
router.get('/jurisdictions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jurisdictions ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing jurisdictions:', error);
    res.status(500).json({ success: false, error: 'Failed to list jurisdictions' });
  }
});

// GET /jurisdictions/:code/recommended-frameworks
router.get('/jurisdictions/:code/recommended-frameworks', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT recommended_frameworks FROM jurisdictions WHERE code = $1',
      [req.params.code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Jurisdiction not found' });
    }
    res.json({ success: true, data: result.rows[0].recommended_frameworks });
  } catch (error) {
    console.error('Error getting recommended frameworks:', error);
    res.status(500).json({ success: false, error: 'Failed to get recommended frameworks' });
  }
});

// GET /organization-jurisdictions - List org's jurisdictions with names
router.get('/organization-jurisdictions', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT oj.*, j.code, j.name, j.region, j.data_protection_law, j.adequacy_status
       FROM organization_jurisdictions oj
       JOIN jurisdictions j ON oj.jurisdiction_id = j.id
       WHERE oj.organization_id = $1
       ORDER BY j.name`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing organization jurisdictions:', error);
    res.status(500).json({ success: false, error: 'Failed to list organization jurisdictions' });
  }
});

// POST /organization-jurisdictions - Add jurisdiction to org
router.post('/organization-jurisdictions', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { jurisdiction_id, compliance_status, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO organization_jurisdictions (organization_id, jurisdiction_id, compliance_status, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orgId, jurisdiction_id, compliance_status, notes]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding organization jurisdiction:', error);
    res.status(500).json({ success: false, error: 'Failed to add organization jurisdiction' });
  }
});

// PUT /organization-jurisdictions/:id - Update compliance_status, notes
router.put('/organization-jurisdictions/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { compliance_status, notes } = req.body;
    const result = await pool.query(
      `UPDATE organization_jurisdictions SET compliance_status = $1, notes = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [compliance_status, notes, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization jurisdiction not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating organization jurisdiction:', error);
    res.status(500).json({ success: false, error: 'Failed to update organization jurisdiction' });
  }
});

// DELETE /organization-jurisdictions/:id - Remove org jurisdiction
router.delete('/organization-jurisdictions/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'DELETE FROM organization_jurisdictions WHERE id = $1 AND organization_id = $2 RETURNING *',
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization jurisdiction not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error removing organization jurisdiction:', error);
    res.status(500).json({ success: false, error: 'Failed to remove organization jurisdiction' });
  }
});

// GET /regulatory-changes - List regulatory changes for org
router.get('/regulatory-changes', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM regulatory_changes WHERE organization_id = $1 ORDER BY effective_date DESC',
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing regulatory changes:', error);
    res.status(500).json({ success: false, error: 'Failed to list regulatory changes' });
  }
});

// POST /regulatory-changes - Create regulatory change
router.post('/regulatory-changes', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { jurisdiction_code, title, description, effective_date, status, impact_assessment } = req.body;
    const result = await pool.query(
      `INSERT INTO regulatory_changes (organization_id, jurisdiction_code, title, description, effective_date, status, impact_assessment)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orgId, jurisdiction_code, title, description, effective_date, status, impact_assessment]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating regulatory change:', error);
    res.status(500).json({ success: false, error: 'Failed to create regulatory change' });
  }
});

// PUT /regulatory-changes/:id/status - Update status and impact_assessment
router.put('/regulatory-changes/:id/status', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, impact_assessment } = req.body;
    const result = await pool.query(
      `UPDATE regulatory_changes SET status = $1, impact_assessment = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [status, impact_assessment, req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Regulatory change not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating regulatory change status:', error);
    res.status(500).json({ success: false, error: 'Failed to update regulatory change status' });
  }
});

// GET /ai-provider-regions - Static list of AI providers and regions
router.get('/ai-provider-regions', async (req, res) => {
  try {
    const providers = [
      { provider: 'OpenAI', regions: ['US East', 'US West', 'EU West', 'Asia Pacific'] },
      { provider: 'Google Cloud AI', regions: ['US Central', 'US East', 'EU West', 'EU North', 'Asia East', 'Asia Southeast'] },
      { provider: 'AWS Bedrock', regions: ['US East', 'US West', 'EU West', 'EU Central', 'Asia Pacific'] },
      { provider: 'Azure OpenAI', regions: ['US East', 'US West', 'EU West', 'EU North', 'UK South', 'Asia East'] },
      { provider: 'Anthropic', regions: ['US East', 'US West', 'EU West'] },
    ];
    res.json({ success: true, data: providers });
  } catch (error) {
    console.error('Error getting AI provider regions:', error);
    res.status(500).json({ success: false, error: 'Failed to get AI provider regions' });
  }
});

// GET /compliance-gap-analysis - Stub
router.get('/compliance-gap-analysis', async (req, res) => {
  try {
    res.json({ success: true, data: { gaps: [], message: 'Gap analysis not yet configured' } });
  } catch (error) {
    console.error('Error running gap analysis:', error);
    res.status(500).json({ success: false, error: 'Failed to run gap analysis' });
  }
});

module.exports = router;
