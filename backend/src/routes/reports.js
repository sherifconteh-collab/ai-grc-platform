// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------
// Reports — compliance and SSP report generation
// ---------------------------------------------------------------

// GET /api/v1/reports/types
router.get('/types', requirePermission('assessments.read'), async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'compliance_pdf', name: 'Compliance Report (PDF)', format: 'pdf', tier: 'community' },
      { id: 'compliance_excel', name: 'Compliance Report (Excel)', format: 'excel', tier: 'professional' },
      { id: 'ssp_pdf', name: 'System Security Plan (PDF)', format: 'pdf', tier: 'professional' },
      { id: 'ssp_json', name: 'System Security Plan (JSON/OSCAL)', format: 'json', tier: 'enterprise' }
    ]
  });
});

// GET /api/v1/reports/compliance/pdf
router.get('/compliance/pdf', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const org = await pool.query(`SELECT name FROM organizations WHERE id=$1`, [orgId]);
    const controls = await pool.query(
      `SELECT ci.status, COUNT(*) as count
       FROM control_implementations ci
       WHERE ci.organization_id=$1
       GROUP BY ci.status`,
      [orgId]
    );

    const reportData = {
      organization: org.rows[0]?.name || 'Unknown',
      generated_at: new Date().toISOString(),
      summary: controls.rows,
      note: 'Full PDF generation requires a PDF library integration (premium feature)'
    };

    // Return JSON as placeholder; real PDF generation is premium
    res.setHeader('Content-Disposition', 'attachment; filename="compliance-report.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(reportData, null, 2));
  } catch (err) {
    console.error('Compliance PDF error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate compliance report' });
  }
});

// GET /api/v1/reports/compliance/excel
router.get('/compliance/excel', requirePermission('assessments.read'), async (req, res) => {
  res.status(402).json({ success: false, error: 'Excel report generation is a professional-tier feature' });
});

// GET /api/v1/reports/ssp/pdf
router.get('/ssp/pdf', requirePermission('assessments.read'), async (req, res) => {
  res.status(402).json({ success: false, error: 'SSP PDF generation is a professional-tier feature' });
});

// GET /api/v1/reports/ssp/json
router.get('/ssp/json', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const org = await pool.query(`SELECT * FROM organizations WHERE id=$1`, [orgId]);
    const profile = await pool.query(`SELECT * FROM organization_profiles WHERE organization_id=$1`, [orgId]);
    const controls = await pool.query(
      `SELECT ci.*, fc.control_id AS control_code, fc.title AS control_title, f.code AS framework_code
       FROM control_implementations ci
       JOIN framework_controls fc ON fc.id = ci.control_id
       JOIN frameworks f ON f.id = fc.framework_id
       WHERE ci.organization_id=$1
       ORDER BY f.code, fc.control_id`,
      [orgId]
    );

    const oscal = {
      'system-security-plan': {
        uuid: orgId,
        metadata: {
          title: `System Security Plan — ${org.rows[0]?.name}`,
          'last-modified': new Date().toISOString(),
          version: '1.0',
          'oscal-version': '1.1.1'
        },
        'system-characteristics': {
          'system-name': profile.rows[0]?.system_name || org.rows[0]?.name,
          description: profile.rows[0]?.system_description || profile.rows[0]?.company_description || '',
          'security-sensitivity-level': (
            profile.rows[0]?.confidentiality_impact ??
            profile.rows[0]?.integrity_impact ??
            profile.rows[0]?.availability_impact ??
            'moderate'
          ).toLowerCase()
        },
        'control-implementation': {
          description: 'Control implementations for this system',
          'implemented-requirements': controls.rows.map(c => ({
            uuid: c.id,
            'control-id': c.control_code,
            description: c.implementation_details || '',
            props: [{ name: 'status', value: c.status }]
          }))
        }
      }
    };

    res.setHeader('Content-Disposition', 'attachment; filename="ssp.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(oscal, null, 2));
  } catch (err) {
    console.error('SSP JSON error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate SSP' });
  }
});

module.exports = router;
