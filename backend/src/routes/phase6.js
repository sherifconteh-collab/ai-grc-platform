// @tier: enterprise
/**
 * Phase 6 AI-Powered Analysis Routes
 * 
 * Endpoints for:
 * - Predictive risk scoring
 * - Regulatory impact analysis
 * - Smart remediation plans
 */

const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const riskScoringService = require('../services/riskScoringService');
const regulatoryImpactService = require('../services/regulatoryImpactService');
const smartRemediationService = require('../services/smartRemediationService');

const aiOrgRateLimiter = createOrgRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  label: 'phase6-ai-org'
});

// All routes require authentication
router.use(authenticate);
router.use(aiOrgRateLimiter);

// =====================================================================
// RISK SCORING ENDPOINTS
// =====================================================================

/**
 * POST /api/v1/phase6/risk-score/calculate
 * Calculate or recalculate risk score for the organization
 */
router.post('/risk-score/calculate', requirePermission('ai.use'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    
    const riskScore = await riskScoringService.calculateRiskScore(organizationId);
    
    res.json({
      success: true,
      data: riskScore
    });
  } catch (error) {
    console.error('Error calculating risk score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate risk score'
    });
  }
});

/**
 * GET /api/v1/phase6/risk-score/latest
 * Get the latest risk score for the organization
 */
router.get('/risk-score/latest', requirePermission('compliance.read'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    
    const riskScore = await riskScoringService.getLatestRiskScore(organizationId);
    
    if (!riskScore) {
      return res.json({
        success: true,
        data: null,
        message: 'No risk score calculated yet. Use POST /risk-score/calculate to generate one.'
      });
    }
    
    res.json({
      success: true,
      data: riskScore
    });
  } catch (error) {
    console.error('Error fetching latest risk score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch risk score'
    });
  }
});

/**
 * GET /api/v1/phase6/risk-score/history
 * Get risk score history for trending
 */
router.get('/risk-score/history', requirePermission('compliance.read'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const limit = parseInt(req.query.limit) || 30;
    
    const history = await riskScoringService.getRiskScoreHistory(organizationId, limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching risk score history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch risk score history'
    });
  }
});

// =====================================================================
// REGULATORY IMPACT ANALYSIS ENDPOINTS
// =====================================================================

/**
 * POST /api/v1/phase6/regulatory-impact/analyze
 * Analyze impact of a regulatory change
 */
router.post('/regulatory-impact/analyze', requirePermission('ai.use'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const {
      frameworkCode,
      changeType,
      changeDescription,
      effectiveDate,
      provider,
      model
    } = req.body;
    
    if (!frameworkCode || !changeType || !changeDescription) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: frameworkCode, changeType, changeDescription'
      });
    }
    
    const assessment = await regulatoryImpactService.analyzeRegulatoryImpact({
      organizationId,
      frameworkCode,
      changeType,
      changeDescription,
      effectiveDate,
      provider,
      model
    });
    
    res.json({
      success: true,
      data: assessment
    });
  } catch (error) {
    console.error('Error analyzing regulatory impact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze regulatory impact'
    });
  }
});

/**
 * GET /api/v1/phase6/regulatory-impact/assessments
 * Get regulatory impact assessments for the organization
 */
router.get('/regulatory-impact/assessments', requirePermission('compliance.read'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const {
      frameworkCode,
      impactLevel,
      limit,
      offset
    } = req.query;
    
    const assessments = await regulatoryImpactService.getImpactAssessments(organizationId, {
      frameworkCode,
      impactLevel,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    
    res.json({
      success: true,
      data: assessments
    });
  } catch (error) {
    console.error('Error fetching impact assessments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch impact assessments'
    });
  }
});

/**
 * PUT /api/v1/phase6/regulatory-impact/assessments/:id/review
 * Update review status of an impact assessment
 */
router.put('/regulatory-impact/assessments/:id/review', requirePermission('compliance.manage'), async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const userId = req.user.id;
    const { status, notes } = req.body;
    
    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: approved, rejected, or pending'
      });
    }
    
    const updated = await regulatoryImpactService.updateAssessmentReview(
      assessmentId,
      userId,
      status,
      notes
    );
    
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating assessment review:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update assessment review'
    });
  }
});

// =====================================================================
// SMART REMEDIATION ENDPOINTS
// =====================================================================

/**
 * POST /api/v1/phase6/remediation/generate
 * Generate smart remediation plan
 */
router.post('/remediation/generate', requirePermission('ai.use'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const {
      controlId,
      vulnerabilityId,
      impactAssessmentId,
      provider,
      model
    } = req.body;
    
    if (!controlId && !vulnerabilityId && !impactAssessmentId) {
      return res.status(400).json({
        success: false,
        error: 'Must provide at least one of: controlId, vulnerabilityId, or impactAssessmentId'
      });
    }
    
    const plan = await smartRemediationService.generateSmartRemediationPlan({
      organizationId,
      controlId,
      vulnerabilityId,
      impactAssessmentId,
      provider,
      model
    });
    
    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Error generating remediation plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate remediation plan'
    });
  }
});

/**
 * GET /api/v1/phase6/remediation/plans
 * Get remediation plans for the organization
 */
router.get('/remediation/plans', requirePermission('compliance.read'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const {
      status,
      priorityLevel,
      limit,
      offset
    } = req.query;
    
    const plans = await smartRemediationService.getRemediationPlans(organizationId, {
      status,
      priorityLevel,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Error fetching remediation plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch remediation plans'
    });
  }
});

/**
 * PUT /api/v1/phase6/remediation/plans/:id/status
 * Update status of a remediation plan
 */
router.put('/remediation/plans/:id/status', requirePermission('compliance.manage'), async (req, res) => {
  try {
    const planId = req.params.id;
    const userId = req.user.id;
    const { status, completionPercentage } = req.body;
    
    const validStatuses = ['draft', 'approved', 'in_progress', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const percentage = parseInt(completionPercentage) || 0;
    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({
        success: false,
        error: 'Completion percentage must be between 0 and 100'
      });
    }
    
    const updated = await smartRemediationService.updatePlanStatus(
      planId,
      status,
      percentage,
      userId
    );
    
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating plan status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update plan status'
    });
  }
});

// =====================================================================
// COMBINED ANALYSIS ENDPOINT
// =====================================================================

/**
 * POST /api/v1/phase6/analyze/comprehensive
 * Run comprehensive Phase 6 analysis (risk scoring + regulatory impact + remediation)
 */
router.post('/analyze/comprehensive', requirePermission('ai.use'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const { provider, model } = req.body;
    
    // Calculate risk score
    const riskScore = await riskScoringService.calculateRiskScore(organizationId);
    
    // Get recent impact assessments
    const recentImpacts = await regulatoryImpactService.getImpactAssessments(organizationId, {
      limit: 5
    });
    
    // Get active remediation plans
    const activePlans = await smartRemediationService.getRemediationPlans(organizationId, {
      status: 'in_progress',
      limit: 10
    });
    
    res.json({
      success: true,
      data: {
        risk_score: riskScore,
        recent_impact_assessments: recentImpacts,
        active_remediation_plans: activePlans,
        summary: {
          overall_risk_score: riskScore.overall_risk_score,
          risk_grade: riskScore.risk_grade,
          trend_direction: riskScore.trend_direction,
          critical_impacts: recentImpacts.filter(a => a.impact_level === 'critical').length,
          high_priority_plans: activePlans.filter(p => p.priority_level === 'critical' || p.priority_level === 'high').length
        }
      }
    });
  } catch (error) {
    console.error('Error running comprehensive analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run comprehensive analysis'
    });
  }
});

module.exports = router;
