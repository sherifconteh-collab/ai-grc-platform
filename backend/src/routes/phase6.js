// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const riskScoringService = require('../services/riskScoringService');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'phase6-route' }));

// Risk Score endpoints
router.post('/risk-score/calculate', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await riskScoringService.calculateRiskScore(org);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error calculating risk score:', error);
    return res.status(500).json({ success: false, error: 'Failed to calculate risk score' });
  }
});

router.get('/risk-score/latest', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await riskScoringService.getLatestRiskScore(org);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching latest risk score:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch latest risk score' });
  }
});

router.get('/risk-score/history', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const result = await riskScoringService.getRiskScoreHistory(org, limit);
    return res.json({ success: true, data: result });
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
    const regulatoryChange = [regulation, description].filter(Boolean).join('\n\n') || null;
    const requiredActions = recommendations == null
      ? null
      : (typeof recommendations === 'string' ? recommendations : JSON.stringify(recommendations));
    const result = await pool.query(
      `INSERT INTO regulatory_impact_assessments
       (organization_id, title, regulatory_change, impact_level, affected_controls, required_actions, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *`,
      [
        org,
        title,
        regulatoryChange,
        impact_level || 'medium',
        JSON.stringify(affected_controls || []),
        requiredActions,
        status || 'open'
      ]
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
       SET reviewed_by = $1,
           review_notes = $2,
           review_status = COALESCE($3, review_status, 'reviewed'),
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING *`,
      [reviewed_by, review_notes, status || null, id, org]
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
       (organization_id, plan_name, current_state, status, priority_level, estimated_completion_date, remediation_steps)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6::jsonb) RETURNING *`,
      [
        org,
        title,
        description || null,
        priority || 'medium',
        target_date || null,
        JSON.stringify(tasks || [])
      ]
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
      `UPDATE remediation_plans
       SET status = $1,
           current_state = COALESCE($2, current_state),
           updated_at = NOW()
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
