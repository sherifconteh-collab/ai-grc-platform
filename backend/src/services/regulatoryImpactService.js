// @tier: pro
/**
 * Regulatory Impact Analysis Service - Phase 6: AI-Powered Analysis
 * 
 * Provides automated regulatory impact analysis with:
 * - Impact scoring (0-100 scale)
 * - Effort and cost estimation
 * - Affected system identification
 * - Timeline analysis
 * - Gap assessment
 */

const pool = require('../config/database');
const llm = require('./llmService');

/**
 * Analyze regulatory impact for a specific change
 * 
 * @param {Object} params - Impact analysis parameters
 * @param {number} params.organizationId - Organization ID
 * @param {string} params.frameworkCode - Framework code (e.g., 'nist_800_53')
 * @param {string} params.changeType - Type of change
 * @param {string} params.changeDescription - Description of the regulatory change
 * @param {string} params.provider - LLM provider
 * @param {string} params.model - LLM model
 * @returns {Promise<Object>} Impact assessment with scoring and recommendations
 */
async function analyzeRegulatoryImpact({
  organizationId,
  frameworkCode,
  changeType,
  changeDescription,
  effectiveDate,
  provider,
  model
}) {
  try {
    // Get current organization compliance posture
    const posture = await getCompliancePosture(organizationId, frameworkCode);
    
    // Get affected systems and controls
    const affectedAreas = await identifyAffectedAreas(organizationId, frameworkCode);
    
    // Use AI to analyze impact
    const aiAnalysis = await generateAIImpactAnalysis({
      organizationId,
      frameworkCode,
      changeType,
      changeDescription,
      posture,
      affectedAreas,
      provider,
      model
    });
    
    // Calculate impact score
    const impactScore = calculateImpactScore(aiAnalysis, posture);
    
    // Determine impact level
    const impactLevel = determineImpactLevel(impactScore);
    
    // Estimate effort and timeline
    const estimates = estimateEffortAndTimeline(aiAnalysis, affectedAreas);
    
    // Save assessment to database
    const assessment = await saveImpactAssessment({
      organizationId,
      frameworkCode,
      changeType,
      changeDescription,
      impactScore,
      impactLevel,
      effectiveDate,
      aiAnalysis,
      estimates,
      provider,
      model
    });
    
    return assessment;
    
  } catch (error) {
    console.error('Error analyzing regulatory impact:', error);
    throw error;
  }
}

/**
 * Get organization's compliance posture for a framework
 */
async function getCompliancePosture(organizationId, frameworkCode) {
  let frameworkFilter = '';
  const params = [organizationId];
  
  if (frameworkCode) {
    frameworkFilter = ' AND f.code = $2';
    params.push(frameworkCode);
  }
  
  const result = await pool.query(`
    SELECT 
      f.code as framework_code,
      f.name as framework_name,
      COUNT(fc.id) as total_controls,
      COUNT(CASE WHEN ci.status = 'implemented' THEN 1 END) as implemented,
      COUNT(CASE WHEN ci.status = 'in_progress' THEN 1 END) as in_progress,
      COUNT(CASE WHEN ci.status IS NULL OR ci.status = 'not_started' THEN 1 END) as not_started,
      ROUND(
        COUNT(CASE WHEN ci.status = 'implemented' THEN 1 END)::numeric / 
        NULLIF(COUNT(fc.id), 0) * 100, 
        1
      ) as compliance_percentage
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1 ${frameworkFilter}
    GROUP BY f.code, f.name
  `, params);
  
  return result.rows;
}

/**
 * Identify systems and controls that may be affected
 */
async function identifyAffectedAreas(organizationId, frameworkCode) {
  // Get asset inventory
  const assets = await pool.query(`
    SELECT 
      COUNT(*) as total_assets,
      COUNT(CASE WHEN criticality = 'critical' THEN 1 END) as critical_assets,
      COUNT(CASE WHEN criticality = 'high' THEN 1 END) as high_criticality_assets,
      array_agg(DISTINCT ac.code) as asset_categories
    FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1
    GROUP BY a.organization_id
  `, [organizationId]);
  
  // Get control information
  const controls = await pool.query(`
    SELECT 
      COUNT(*) as total_controls,
      array_agg(DISTINCT fc.control_family) FILTER (WHERE fc.control_family IS NOT NULL) as control_families,
      array_agg(fc.control_id) FILTER (WHERE ci.status IS NULL OR ci.status = 'not_started') as unimplemented_controls
    FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE f.code = $2
  `, [organizationId, frameworkCode]);
  
  return {
    assets: assets.rows[0] || { total_assets: 0 },
    controls: controls.rows[0] || { total_controls: 0 }
  };
}

/**
 * Generate AI-powered impact analysis
 */
async function generateAIImpactAnalysis({
  organizationId,
  frameworkCode,
  changeType,
  changeDescription,
  posture,
  affectedAreas,
  provider,
  model
}) {
  const prompt = `Analyze the regulatory impact of the following compliance change:

Framework: ${frameworkCode}
Change Type: ${changeType}
Change Description: ${changeDescription}

Current Compliance Posture:
${JSON.stringify(posture, null, 2)}

Affected Areas:
${JSON.stringify(affectedAreas, null, 2)}

Provide a comprehensive impact analysis including:

1. **Impact Score (0-100)**: Rate the overall impact where:
   - 90-100: Critical - Major regulatory change requiring significant resources
   - 70-89: High - Substantial impact requiring dedicated effort
   - 40-69: Medium - Moderate impact requiring some adjustments
   - 20-39: Low - Minor impact with minimal resource requirements
   - 0-19: Minimal - Negligible impact, informational only

2. **Business Impact**: Describe how this change affects business operations, compliance status, and organizational risk.

3. **Technical Requirements**: List specific technical changes, system modifications, or new controls required.

4. **Affected Controls**: Identify which specific controls are impacted (new, updated, or deprecated).

5. **Affected Systems**: List system categories and asset types that need updates.

6. **Gap Analysis**: Compare current state vs. required future state.

7. **Recommended Actions**: Provide a prioritized list of actions with:
   - Action description
   - Priority level (Critical/High/Medium/Low)
   - Estimated effort in hours
   - Dependencies

8. **Timeline**: Suggest realistic timeline for compliance including:
   - Immediate actions (0-30 days)
   - Short-term actions (1-3 months)
   - Long-term actions (3-6 months)

9. **Cost Estimation**: Estimate costs for:
   - Internal labor hours
   - External consulting/audit fees
   - Technology/tooling costs
   - Training costs

10. **Risk Assessment**: What are the risks of non-compliance and what are the risks of implementing this change?

Return structured analysis with clear sections and actionable recommendations.`;

  const systemPrompt = await llm.buildPersonalizedSystem(
    organizationId,
    'You are an expert compliance analyst specializing in regulatory impact assessment. Provide detailed, actionable analysis with specific recommendations. Reference relevant NIST publications, OWASP Top 10:2025 categories, and specific control IDs when applicable.',
    'compact', null, 'policy'
  );

  const response = await llm.chat({
    organizationId,
    provider,
    model,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt
  });
  
  return parseImpactAnalysis(response);
}

/**
 * Parse AI response into structured impact analysis
 */
function parseImpactAnalysis(aiResponse) {
  // Extract structured data from AI response
  // This is a simplified parser - in production, use more robust parsing
  
  const analysis = {
    raw_analysis: aiResponse,
    impact_score_suggested: null,
    business_impact: '',
    technical_requirements: '',
    affected_controls: [],
    affected_systems: [],
    gap_analysis: '',
    recommended_actions: [],
    timeline: {},
    cost_estimation: {},
    risk_assessment: ''
  };
  
  // Try to extract impact score from response
  const scoreMatch = aiResponse.match(/impact score[:\s]+(\d+)/i);
  if (scoreMatch) {
    analysis.impact_score_suggested = parseInt(scoreMatch[1]);
  }
  
  // Extract sections (simplified - in production, use better parsing)
  const sections = {
    business_impact: /business impact[:\s]+(.*?)(?=technical requirements|$)/is,
    technical_requirements: /technical requirements[:\s]+(.*?)(?=affected controls|$)/is,
    gap_analysis: /gap analysis[:\s]+(.*?)(?=recommended actions|$)/is,
    risk_assessment: /risk assessment[:\s]+(.*?)(?=$)/is
  };
  
  for (const [key, regex] of Object.entries(sections)) {
    const match = aiResponse.match(regex);
    if (match) {
      analysis[key] = match[1].trim();
    }
  }
  
  return analysis;
}

/**
 * Calculate impact score based on AI analysis and current posture
 */
function calculateImpactScore(aiAnalysis, posture) {
  // Use AI suggested score if available
  if (aiAnalysis.impact_score_suggested) {
    return aiAnalysis.impact_score_suggested;
  }
  
  // Fallback calculation based on compliance posture
  let baseScore = 50; // Default medium impact
  
  // Lower compliance percentage = higher impact
  if (posture.length > 0) {
    const avgCompliance = posture.reduce((sum, p) => sum + parseFloat(p.compliance_percentage || 0), 0) / posture.length;
    
    if (avgCompliance < 25) baseScore += 30;  // Low compliance = higher impact
    else if (avgCompliance < 50) baseScore += 20;
    else if (avgCompliance < 75) baseScore += 10;
    // High compliance = lower relative impact
  }
  
  return Math.min(100, Math.max(0, baseScore));
}

/**
 * Determine impact level from score
 */
function determineImpactLevel(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'minimal';
}

/**
 * Estimate effort and timeline
 */
function estimateEffortAndTimeline(aiAnalysis, affectedAreas) {
  // Basic estimation algorithm
  // In production, this would be more sophisticated
  
  const baseHours = 40; // Minimum effort
  const assetMultiplier = Math.min(3, (affectedAreas.assets.total_assets || 10) / 50);
  const controlMultiplier = Math.min(3, (affectedAreas.controls.total_controls || 10) / 100);
  
  const estimatedHours = Math.round(baseHours * assetMultiplier * controlMultiplier);
  const estimatedCost = estimatedHours * 150; // $150/hour average rate
  
  // Calculate timeline
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + 7); // Start in 1 week
  
  const completionDate = new Date(startDate);
  completionDate.setDate(completionDate.getDate() + Math.ceil(estimatedHours / 8)); // 8 hours per day
  
  return {
    estimated_hours: estimatedHours,
    estimated_cost: estimatedCost,
    estimated_start_date: startDate.toISOString().split('T')[0],
    estimated_completion_date: completionDate.toISOString().split('T')[0]
  };
}

/**
 * Save impact assessment to database
 */
async function saveImpactAssessment({
  organizationId,
  frameworkCode,
  changeType,
  changeDescription,
  impactScore,
  impactLevel,
  effectiveDate,
  aiAnalysis,
  estimates,
  provider,
  model
}) {
  const result = await pool.query(`
    INSERT INTO regulatory_impact_assessments (
      organization_id,
      framework_code,
      change_type,
      change_title,
      change_description,
      impact_score,
      impact_level,
      affected_controls,
      affected_systems,
      estimated_effort_hours,
      estimated_cost,
      regulation_effective_date,
      compliance_deadline,
      days_to_comply,
      business_impact,
      technical_requirements,
      gap_analysis,
      recommended_actions,
      ai_provider,
      ai_model,
      confidence_score
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )
    RETURNING *
  `, [
    organizationId,
    frameworkCode,
    changeType,
    changeDescription.substring(0, 500), // title truncated
    changeDescription,
    impactScore,
    impactLevel,
    aiAnalysis.affected_controls || [],
    aiAnalysis.affected_systems || [],
    estimates.estimated_hours,
    estimates.estimated_cost,
    effectiveDate || null,
    estimates.estimated_completion_date,
    effectiveDate ? Math.ceil((new Date(effectiveDate) - new Date()) / (1000 * 60 * 60 * 24)) : null,
    aiAnalysis.business_impact || '',
    aiAnalysis.technical_requirements || '',
    aiAnalysis.gap_analysis || '',
    aiAnalysis.raw_analysis || '',
    provider,
    model,
    85.0 // Default confidence score
  ]);
  
  return result.rows[0];
}

/**
 * Get regulatory impact assessments for an organization
 */
async function getImpactAssessments(organizationId, options = {}) {
  const { frameworkCode, impactLevel, limit = 50, offset = 0 } = options;
  
  let whereClause = 'WHERE organization_id = $1';
  const params = [organizationId];
  let paramIndex = 2;
  
  if (frameworkCode) {
    whereClause += ` AND framework_code = $${paramIndex}`;
    params.push(frameworkCode);
    paramIndex++;
  }
  
  if (impactLevel) {
    whereClause += ` AND impact_level = $${paramIndex}`;
    params.push(impactLevel);
    paramIndex++;
  }
  
  params.push(limit, offset);
  
  const result = await pool.query(`
    SELECT *
    FROM regulatory_impact_assessments
    ${whereClause}
    ORDER BY impact_score DESC, created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  return result.rows;
}

/**
 * Update assessment review status
 */
async function updateAssessmentReview(assessmentId, userId, status, notes) {
  const result = await pool.query(`
    UPDATE regulatory_impact_assessments
    SET review_status = $1,
        reviewed_by = $2,
        reviewed_at = CURRENT_TIMESTAMP,
        review_notes = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `, [status, userId, notes, assessmentId]);
  
  return result.rows[0];
}

module.exports = {
  analyzeRegulatoryImpact,
  getImpactAssessments,
  updateAssessmentReview
};
