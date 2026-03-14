// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'reports-route' }));

// GET /types - Available report types
router.get('/types', (req, res) => {
  try {
    const types = [
      { type: 'compliance_pdf', name: 'Compliance Report (PDF)' },
      { type: 'compliance_excel', name: 'Compliance Report (Excel)' },
      { type: 'ssp_pdf', name: 'System Security Plan (PDF)' },
      { type: 'ssp_json', name: 'System Security Plan (JSON)' }
    ];
    res.json({ success: true, data: types });
  } catch (err) {
    console.error('Error fetching report types:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch report types' });
  }
});

// GET /compliance/pdf - Compliance report PDF (stub)
router.get('/compliance/pdf', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `SELECT fc.id, fc.control_id, fc.name, ci.status, ci.implementation_details
       FROM framework_controls fc
       LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE fc.framework_id IN (SELECT id FROM frameworks WHERE organization_id = $1)`,
      [orgId]
    );
    res.json({
      success: true,
      data: { message: 'PDF generation requires additional configuration', format: 'pdf' }
    });
  } catch (err) {
    console.error('Error generating compliance PDF:', err);
    res.status(500).json({ success: false, error: 'Failed to generate compliance PDF' });
  }
});

// GET /compliance/excel - Compliance report Excel (stub)
router.get('/compliance/excel', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await pool.query(
      `SELECT fc.id, fc.control_id, fc.name, ci.status, ci.implementation_details
       FROM framework_controls fc
       LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE fc.framework_id IN (SELECT id FROM frameworks WHERE organization_id = $1)`,
      [orgId]
    );
    res.json({
      success: true,
      data: { message: 'Excel generation requires additional configuration', format: 'xlsx' }
    });
  } catch (err) {
    console.error('Error generating compliance Excel:', err);
    res.status(500).json({ success: false, error: 'Failed to generate compliance Excel' });
  }
});

// GET /ssp/pdf - SSP PDF (stub)
router.get('/ssp/pdf', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { message: 'SSP PDF generation requires additional configuration' }
    });
  } catch (err) {
    console.error('Error generating SSP PDF:', err);
    res.status(500).json({ success: false, error: 'Failed to generate SSP PDF' });
  }
});

// GET /ssp/json - SSP as structured JSON
router.get('/ssp/json', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const frameworksResult = await pool.query(
      'SELECT id, name, version, description FROM frameworks WHERE organization_id = $1',
      [orgId]
    );

    const controlsResult = await pool.query(
      `SELECT fc.id, fc.control_id, fc.name, fc.description, fc.framework_id,
              ci.status, ci.implementation_details
       FROM framework_controls fc
       LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE fc.framework_id IN (SELECT id FROM frameworks WHERE organization_id = $1)`,
      [orgId]
    );

    const controlsByFramework = {};
    for (const control of controlsResult.rows) {
      if (!controlsByFramework[control.framework_id]) {
        controlsByFramework[control.framework_id] = [];
      }
      controlsByFramework[control.framework_id].push({
        control_id: control.control_id,
        name: control.name,
        description: control.description,
        status: control.status || 'not_implemented',
        implementation_details: control.implementation_details || null
      });
    }

    const ssp = {
      title: 'System Security Plan',
      generated_at: new Date().toISOString(),
      organization_id: orgId,
      frameworks: frameworksResult.rows.map(fw => ({
        id: fw.id,
        name: fw.name,
        version: fw.version,
        description: fw.description,
        controls: controlsByFramework[fw.id] || []
      }))
    };

    res.json({ success: true, data: ssp });
  } catch (err) {
    console.error('Error generating SSP JSON:', err);
    res.status(500).json({ success: false, error: 'Failed to generate SSP JSON' });
  }
});

module.exports = router;
