// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'phase6-route' }));

// Risk Score endpoints
router.post('/risk-score/calculate', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      `INSERT INTO risk_scores (organization_id, overall_score, breakdown, calculated_at)
       VALUES ($1, 0, $2, NOW()) RETURNING *`,
      [org, JSON.stringify({})]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error calculating risk score:', error);
    return res.status(500).json({ success: false, error: 'Failed to calculate risk score' });
  }
});

router.get('/risk-score/latest', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM risk_scores WHERE organization_id = $1 ORDER BY calculated_at DESC LIMIT 1',
      [org]
    );
    return res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching latest risk score:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch latest risk score' });
  }
});

router.get('/risk-score/history', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM risk_scores WHERE organization_id = $1 ORDER BY calculated_at',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching risk score history:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch risk score history' });
  }
});

// Regulatory Impact endpoints
router.post('/regulatory-impact/analyze', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { title, description, regulation, impact_level, affected_controls, recommendations, status } = req.body;
    const result = await pool.query(
      `INSERT INTO regulatory_impact_assessments
       (organization_id, title, description, regulation, impact_level, affected_controls, recommendations, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [org, title, description, regulation, impact_level, affected_controls || [], recommendations || {}, status || 'draft']
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error analyzing regulatory impact:', error);
    return res.status(500).json({ success: false, error: 'Failed to analyze regulatory impact' });
  }
});

router.get('/regulatory-impact/assessments', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM regulatory_impact_assessments WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing assessments:', error);
    return res.status(500).json({ success: false, error: 'Failed to list assessments' });
  }
});

router.put('/regulatory-impact/assessments/:id/review', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { reviewed_by, review_notes, status } = req.body;
    const result = await pool.query(
      `UPDATE regulatory_impact_assessments
       SET reviewed_by = $1, review_notes = $2, status = $3, updated_at = NOW()
       WHERE id = $4 AND organization_id = $5 RETURNING *`,
      [reviewed_by, review_notes, status, id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error reviewing assessment:', error);
    return res.status(500).json({ success: false, error: 'Failed to review assessment' });
  }
});

// Remediation endpoints
router.post('/remediation/generate', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { title, description, priority, target_date, tasks } = req.body;
    const result = await pool.query(
      `INSERT INTO remediation_plans
       (organization_id, title, description, status, priority, target_date, tasks)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6) RETURNING *`,
      [org, title, description, priority, target_date, tasks || JSON.stringify([])]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error generating remediation plan:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate remediation plan' });
  }
});

router.get('/remediation/plans', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM remediation_plans WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing remediation plans:', error);
    return res.status(500).json({ success: false, error: 'Failed to list remediation plans' });
  }
});

router.put('/remediation/plans/:id/status', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { status, notes } = req.body;
    const result = await pool.query(
      `UPDATE remediation_plans SET status = $1, description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [status, notes, id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Remediation plan not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating remediation plan status:', error);
    return res.status(500).json({ success: false, error: 'Failed to update remediation plan status' });
  }
});

// Comprehensive analysis stub
router.post('/analyze/comprehensive', async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        message: 'Comprehensive analysis not yet configured',
        risk_score: null,
        impact_assessments: [],
        remediation_plans: []
      }
    });
  } catch (error) {
    console.error('Error running comprehensive analysis:', error);
    return res.status(500).json({ success: false, error: 'Failed to run comprehensive analysis' });
  }
});

module.exports = router;
