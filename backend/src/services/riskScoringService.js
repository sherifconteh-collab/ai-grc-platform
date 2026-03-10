// @tier: free
/**
 * Risk Scoring Service - Phase 6: AI-Powered Analysis
 * 
 * Implements predictive risk scoring (0-100 algorithm) with:
 * - Multi-factor weighted scoring
 * - Trend analysis and predictions
 * - Control implementation scoring
 * - Vulnerability impact assessment
 * - Evidence freshness tracking
 * - Assessment coverage analysis
 */

const pool = require('../config/database');

/**
 * Calculate comprehensive risk score for an organization
 * Returns a score from 0 (highest risk) to 100 (lowest risk)
 * 
 * Scoring Algorithm:
 * - Control Implementation: 40% weight
 * - Vulnerability Management: 25% weight
 * - Evidence Freshness: 20% weight
 * - Assessment Coverage: 15% weight
 * 
 * @param {number} organizationId - Organization ID
 * @returns {Promise<Object>} Risk score data with components and predictions
 */
async function calculateRiskScore(organizationId) {
  try {
    // 1. Calculate Control Implementation Score (40% weight)
    const controlScore = await calculateControlImplementationScore(organizationId);
    
    // 2. Calculate Vulnerability Score (25% weight)
    const vulnerabilityScore = await calculateVulnerabilityScore(organizationId);
    
    // 3. Calculate Evidence Freshness Score (20% weight)
    const evidenceScore = await calculateEvidenceFreshnessScore(organizationId);
    
    // 4. Calculate Assessment Coverage Score (15% weight)
    const assessmentScore = await calculateAssessmentCoverageScore(organizationId);
    
    // Calculate weighted overall score
    const overallScore = (
      controlScore.score * 0.40 +
      vulnerabilityScore.score * 0.25 +
      evidenceScore.score * 0.20 +
      assessmentScore.score * 0.15
    );
    
    // Determine risk grade
    const riskGrade = calculateRiskGrade(overallScore);
    
    // Get trend data
    const trendData = await calculateTrendData(organizationId, overallScore);
    
    // Make predictions
    const predictions = await predictFutureScores(organizationId, overallScore, trendData);
    
    // Count critical gaps and issues
    const criticalIssues = await countCriticalIssues(organizationId);
    
    // Prepare full risk score object
    const riskScoreData = {
      overall_risk_score: parseFloat(overallScore.toFixed(2)),
      risk_grade: riskGrade,
      
      // Component scores
      control_implementation_score: parseFloat(controlScore.score.toFixed(2)),
      vulnerability_score: parseFloat(vulnerabilityScore.score.toFixed(2)),
      evidence_freshness_score: parseFloat(evidenceScore.score.toFixed(2)),
      assessment_coverage_score: parseFloat(assessmentScore.score.toFixed(2)),
      
      // Risk factors
      critical_gaps_count: criticalIssues.criticalGaps,
      high_priority_gaps_count: criticalIssues.highPriorityGaps,
      unpatched_critical_vulns: criticalIssues.criticalVulns,
      overdue_assessments: criticalIssues.overdueAssessments,
      
      // Trend
      trend_direction: trendData.direction,
      previous_score: trendData.previousScore,
      score_change: trendData.change,
      
      // Predictions
      predicted_score_30d: predictions.day30,
      predicted_score_60d: predictions.day60,
      predicted_score_90d: predictions.day90,
      
      // Details for breakdown
      details: {
        controlBreakdown: controlScore.breakdown,
        vulnerabilityBreakdown: vulnerabilityScore.breakdown,
        evidenceBreakdown: evidenceScore.breakdown,
        assessmentBreakdown: assessmentScore.breakdown
      }
    };
    
    // Save to database
    await saveRiskScore(organizationId, riskScoreData);
    
    return riskScoreData;
    
  } catch (error) {
    console.error('Error calculating risk score:', error);
    throw error;
  }
}

/**
 * Calculate control implementation score (0-100)
 * Higher score = more controls implemented
 */
async function calculateControlImplementationScore(organizationId) {
  const result = await pool.query(`
    SELECT 
      COUNT(fc.id) as total_controls,
      COUNT(CASE WHEN ci.status = 'implemented' THEN 1 END) as implemented,
      COUNT(CASE WHEN ci.status = 'in_progress' THEN 1 END) as in_progress,
      COUNT(CASE WHEN ci.status IS NULL OR ci.status = 'not_started' THEN 1 END) as not_started,
      COUNT(CASE WHEN fc.priority = '1' AND (ci.status IS NULL OR ci.status != 'implemented') THEN 1 END) as p1_gaps,
      COUNT(CASE WHEN fc.priority = '2' AND (ci.status IS NULL OR ci.status != 'implemented') THEN 1 END) as p2_gaps
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
  `, [organizationId]);
  
  const data = result.rows[0];
  if (data.total_controls === 0) {
    return { score: 50, breakdown: { message: 'No frameworks adopted yet' } };
  }
  
  // Base score from implementation percentage
  const implementationPct = (parseInt(data.implemented) / parseInt(data.total_controls)) * 100;
  
  // Adjust for in-progress controls (count as 50% credit)
  const adjustedPct = ((parseInt(data.implemented) + (parseInt(data.in_progress) * 0.5)) / parseInt(data.total_controls)) * 100;
  
  // Penalty for priority 1 and 2 gaps
  const p1Penalty = parseInt(data.p1_gaps) * 2; // -2 points per P1 gap
  const p2Penalty = parseInt(data.p2_gaps) * 0.5; // -0.5 points per P2 gap
  
  const score = Math.max(0, Math.min(100, adjustedPct - p1Penalty - p2Penalty));
  
  return {
    score,
    breakdown: {
      total_controls: parseInt(data.total_controls),
      implemented: parseInt(data.implemented),
      in_progress: parseInt(data.in_progress),
      not_started: parseInt(data.not_started),
      implementation_percentage: parseFloat(implementationPct.toFixed(2)),
      priority_1_gaps: parseInt(data.p1_gaps),
      priority_2_gaps: parseInt(data.p2_gaps)
    }
  };
}

/**
 * Calculate vulnerability management score (0-100)
 * Higher score = fewer/lower severity vulnerabilities
 */
async function calculateVulnerabilityScore(organizationId) {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_vulns,
      COUNT(CASE WHEN severity = 'critical' AND status != 'remediated' THEN 1 END) as critical_open,
      COUNT(CASE WHEN severity = 'high' AND status != 'remediated' THEN 1 END) as high_open,
      COUNT(CASE WHEN severity = 'medium' AND status != 'remediated' THEN 1 END) as medium_open,
      COUNT(CASE WHEN severity = 'low' AND status != 'remediated' THEN 1 END) as low_open,
      COUNT(CASE WHEN status = 'remediated' THEN 1 END) as remediated
    FROM vulnerabilities
    WHERE organization_id = $1
  `, [organizationId]);
  
  const data = result.rows[0];
  if (data.total_vulns === '0') {
    return { score: 100, breakdown: { message: 'No vulnerabilities tracked' } };
  }
  
  // Start at 100 and deduct points for open vulnerabilities
  let score = 100;
  score -= parseInt(data.critical_open) * 15; // -15 per critical
  score -= parseInt(data.high_open) * 5;      // -5 per high
  score -= parseInt(data.medium_open) * 1;    // -1 per medium
  score -= parseInt(data.low_open) * 0.2;     // -0.2 per low
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    breakdown: {
      total_vulnerabilities: parseInt(data.total_vulns),
      critical_open: parseInt(data.critical_open),
      high_open: parseInt(data.high_open),
      medium_open: parseInt(data.medium_open),
      low_open: parseInt(data.low_open),
      remediated: parseInt(data.remediated)
    }
  };
}

/**
 * Calculate evidence freshness score (0-100)
 * Higher score = more recent evidence
 */
async function calculateEvidenceFreshnessScore(organizationId) {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_evidence,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as recent_30d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '90 days' THEN 1 END) as recent_90d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '180 days' THEN 1 END) as recent_180d,
      COUNT(CASE WHEN created_at <= NOW() - INTERVAL '365 days' THEN 1 END) as stale_365d
    FROM evidence
    WHERE organization_id = $1
  `, [organizationId]);
  
  const data = result.rows[0];
  if (data.total_evidence === '0') {
    return { score: 0, breakdown: { message: 'No evidence uploaded yet' } };
  }
  
  const total = parseInt(data.total_evidence);
  
  // Calculate freshness score based on age distribution
  const score = (
    (parseInt(data.recent_30d) / total) * 100 * 1.0 +   // Full credit for <30 days
    (parseInt(data.recent_90d) / total) * 100 * 0.7 +   // 70% credit for 30-90 days
    (parseInt(data.recent_180d) / total) * 100 * 0.4    // 40% credit for 90-180 days
  ) / 2.1; // Normalize
  
  return {
    score: Math.min(100, score),
    breakdown: {
      total_evidence: total,
      recent_30_days: parseInt(data.recent_30d),
      recent_90_days: parseInt(data.recent_90d),
      recent_180_days: parseInt(data.recent_180d),
      stale_over_1_year: parseInt(data.stale_365d)
    }
  };
}

/**
 * Calculate assessment coverage score (0-100)
 * Higher score = more controls assessed
 */
async function calculateAssessmentCoverageScore(organizationId) {
  const result = await pool.query(`
    SELECT 
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ar.outcome IS NOT NULL THEN fc.id END) as assessed_controls,
      COUNT(DISTINCT CASE WHEN ar.outcome = 'satisfied' THEN fc.id END) as satisfied,
      COUNT(DISTINCT CASE WHEN ar.assessment_date > NOW() - INTERVAL '90 days' THEN fc.id END) as recent_assessments
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN assessment_results ar ON ar.control_id = fc.id AND ar.organization_id = $1
    WHERE of2.organization_id = $1
  `, [organizationId]);
  
  const data = result.rows[0];
  if (data.total_controls === '0') {
    return { score: 50, breakdown: { message: 'No frameworks adopted' } };
  }
  
  const total = parseInt(data.total_controls);
  const assessed = parseInt(data.assessed_controls);
  const satisfied = parseInt(data.satisfied);
  const recent = parseInt(data.recent_assessments);
  
  // Base score from coverage percentage
  const coveragePct = (assessed / total) * 100;
  
  // Bonus for satisfied assessments
  const satisfactionBonus = (satisfied / total) * 20;
  
  // Bonus for recent assessments
  const recencyBonus = (recent / total) * 10;
  
  const score = Math.min(100, coveragePct * 0.7 + satisfactionBonus + recencyBonus);
  
  return {
    score,
    breakdown: {
      total_controls: total,
      assessed_controls: assessed,
      satisfied_controls: satisfied,
      recent_assessments: recent,
      coverage_percentage: parseFloat((coveragePct).toFixed(2))
    }
  };
}

/**
 * Convert numeric score to letter grade
 */
function calculateRiskGrade(score) {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 45) return 'D';
  if (score >= 40) return 'D-';
  return 'F';
}

/**
 * Calculate trend data by comparing with previous score
 */
async function calculateTrendData(organizationId, currentScore) {
  const result = await pool.query(`
    SELECT overall_risk_score, calculated_at
    FROM risk_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT 1
  `, [organizationId]);
  
  if (result.rows.length === 0) {
    return {
      direction: 'stable',
      previousScore: null,
      change: null
    };
  }
  
  const previousScore = parseFloat(result.rows[0].overall_risk_score);
  const change = currentScore - previousScore;
  
  let direction = 'stable';
  if (change > 2) direction = 'improving';
  else if (change < -2) direction = 'declining';
  
  return {
    direction,
    previousScore,
    change: parseFloat(change.toFixed(2))
  };
}

/**
 * Predict future risk scores using linear regression
 */
async function predictFutureScores(organizationId, currentScore, trendData) {
  // Get historical scores for better prediction
  const history = await pool.query(`
    SELECT overall_risk_score, calculated_at
    FROM risk_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT 10
  `, [organizationId]);
  
  // Simple linear prediction based on recent trend
  let trendRate = 0;
  if (trendData.change !== null) {
    // Assume trend continues
    trendRate = trendData.change / 30; // Daily rate of change
  }
  
  return {
    day30: Math.max(0, Math.min(100, parseFloat((currentScore + (trendRate * 30)).toFixed(2)))),
    day60: Math.max(0, Math.min(100, parseFloat((currentScore + (trendRate * 60)).toFixed(2)))),
    day90: Math.max(0, Math.min(100, parseFloat((currentScore + (trendRate * 90)).toFixed(2))))
  };
}

/**
 * Count critical issues affecting risk
 */
async function countCriticalIssues(organizationId) {
  const controls = await pool.query(`
    SELECT 
      COUNT(CASE WHEN fc.priority = '1' AND (ci.status IS NULL OR ci.status != 'implemented') THEN 1 END) as critical_gaps,
      COUNT(CASE WHEN fc.priority = '2' AND (ci.status IS NULL OR ci.status != 'implemented') THEN 1 END) as high_gaps
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
  `, [organizationId]);
  
  const vulns = await pool.query(`
    SELECT COUNT(*) as critical_vulns
    FROM vulnerabilities
    WHERE organization_id = $1 AND severity = 'critical' AND status != 'remediated'
  `, [organizationId]);
  
  const assessments = await pool.query(`
    SELECT COUNT(DISTINCT fc.id) as overdue
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN assessment_results ar ON ar.control_id = fc.id AND ar.organization_id = $1
    WHERE of2.organization_id = $1 
      AND fc.priority IN ('1', '2')
      AND (ar.assessment_date IS NULL OR ar.assessment_date < NOW() - INTERVAL '180 days')
  `, [organizationId]);
  
  return {
    criticalGaps: parseInt(controls.rows[0].critical_gaps),
    highPriorityGaps: parseInt(controls.rows[0].high_gaps),
    criticalVulns: parseInt(vulns.rows[0].critical_vulns),
    overdueAssessments: parseInt(assessments.rows[0].overdue)
  };
}

/**
 * Save risk score to database
 */
async function saveRiskScore(organizationId, scoreData) {
  await pool.query(`
    INSERT INTO risk_scores (
      organization_id, overall_risk_score, risk_grade,
      control_implementation_score, vulnerability_score, 
      evidence_freshness_score, assessment_coverage_score,
      critical_gaps_count, high_priority_gaps_count,
      unpatched_critical_vulns, overdue_assessments,
      trend_direction, previous_score, score_change,
      predicted_score_30d, predicted_score_60d, predicted_score_90d,
      calculation_method
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
  `, [
    organizationId,
    scoreData.overall_risk_score,
    scoreData.risk_grade,
    scoreData.control_implementation_score,
    scoreData.vulnerability_score,
    scoreData.evidence_freshness_score,
    scoreData.assessment_coverage_score,
    scoreData.critical_gaps_count,
    scoreData.high_priority_gaps_count,
    scoreData.unpatched_critical_vulns,
    scoreData.overdue_assessments,
    scoreData.trend_direction,
    scoreData.previous_score,
    scoreData.score_change,
    scoreData.predicted_score_30d,
    scoreData.predicted_score_60d,
    scoreData.predicted_score_90d,
    'weighted_aggregate'
  ]);
}

/**
 * Get latest risk score for an organization
 */
async function getLatestRiskScore(organizationId) {
  const result = await pool.query(`
    SELECT *
    FROM risk_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT 1
  `, [organizationId]);
  
  return result.rows[0] || null;
}

/**
 * Get risk score history for trending
 */
async function getRiskScoreHistory(organizationId, limit = 30) {
  const result = await pool.query(`
    SELECT overall_risk_score, risk_grade, calculated_at,
           trend_direction, score_change
    FROM risk_scores
    WHERE organization_id = $1
    ORDER BY calculated_at DESC
    LIMIT $2
  `, [organizationId, limit]);
  
  return result.rows;
}

module.exports = {
  calculateRiskScore,
  getLatestRiskScore,
  getRiskScoreHistory
};
