// @tier: community
/**
 * Smart Remediation Service - Phase 6: AI-Powered Analysis
 * 
 * Enhanced remediation plan generation with:
 * - Priority scoring (0-100)
 * - Timeline estimation
 * - Resource requirements
 * - Cost-benefit analysis
 * - Step-by-step action plans
 */

const pool = require('../config/database');
// Optional LLM service: AI remediation features disabled if unavailable
let llm;
try {
  llm = require('./llmService');
} catch (e) {
  llm = new Proxy({}, { get() { return async () => ''; } });
}

/**
 * Generate smart remediation plan for a control gap
 * 
 * @param {Object} params - Remediation parameters
 * @param {number} params.organizationId - Organization ID
 * @param {number} params.controlId - Control ID
 * @param {string} params.provider - LLM provider
 * @param {string} params.model - LLM model
 * @returns {Promise<Object>} Comprehensive remediation plan
 */
async function generateSmartRemediationPlan({
  organizationId,
  controlId,
  vulnerabilityId,
  impactAssessmentId,
  provider,
  model
}) {
  try {
    // Get context for remediation
    const context = await getRemediationContext({
      organizationId,
      controlId,
      vulnerabilityId,
      impactAssessmentId
    });
    
    // Calculate priority score
    const priorityScore = calculatePriorityScore(context);
    
    // Generate AI-powered remediation plan
    const aiPlan = await generateAIRemediationPlan({
      organizationId,
      context,
      provider,
      model
    });
    
    // Estimate timeline and resources
    const estimates = estimateRemediationEffort(context, aiPlan);
    
    // Calculate risk reduction potential
    const riskReduction = estimateRiskReduction(context);
    
    // Save plan to database
    const plan = await saveRemediationPlan({
      organizationId,
      controlId,
      vulnerabilityId,
      impactAssessmentId,
      priorityScore,
      aiPlan,
      estimates,
      riskReduction,
      provider,
      model
    });
    
    return plan;
    
  } catch (error) {
    console.error('Error generating smart remediation plan:', error);
    throw error;
  }
}

/**
 * Get context for remediation planning
 */
async function getRemediationContext({
  organizationId,
  controlId,
  vulnerabilityId,
  impactAssessmentId
}) {
  const context = {
    type: null,
    control: null,
    vulnerability: null,
    impactAssessment: null,
    relatedControls: [],
    relatedAssets: []
  };
  
  // Get control information if provided
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.*, f.code as framework_code, f.name as framework_name,
             ci.status, ci.notes, ci.assigned_to
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
      WHERE fc.id = $2
    `, [organizationId, controlId]);
    
    if (controlResult.rows.length > 0) {
      context.type = 'control_gap';
      context.control = controlResult.rows[0];
    }
  }
  
  // Get vulnerability information if provided
  if (vulnerabilityId) {
    const vulnResult = await pool.query(`
      SELECT v.*, a.name as asset_name, ac.code as asset_category
      FROM vulnerabilities v
      LEFT JOIN assets a ON a.id = v.asset_id
      LEFT JOIN asset_categories ac ON ac.id = a.category_id
      WHERE v.id = $1 AND v.organization_id = $2
    `, [vulnerabilityId, organizationId]);
    
    if (vulnResult.rows.length > 0) {
      context.type = 'vulnerability';
      context.vulnerability = vulnResult.rows[0];
    }
  }
  
  // Get impact assessment if provided
  if (impactAssessmentId) {
    const impactResult = await pool.query(`
      SELECT *
      FROM regulatory_impact_assessments
      WHERE id = $1 AND organization_id = $2
    `, [impactAssessmentId, organizationId]);
    
    if (impactResult.rows.length > 0) {
      context.type = 'regulatory_change';
      context.impactAssessment = impactResult.rows[0];
    }
  }
  
  // Get related controls and assets for context
  if (context.type) {
    // Get organization's frameworks and controls
    const relatedControls = await pool.query(`
      SELECT fc.control_id, fc.title, fc.priority, f.code as framework_code,
             ci.status
      FROM organization_frameworks of2
      JOIN frameworks f ON f.id = of2.framework_id
      JOIN framework_controls fc ON fc.framework_id = f.id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
      WHERE of2.organization_id = $1
      ORDER BY fc.priority
      LIMIT 20
    `, [organizationId]);
    
    context.relatedControls = relatedControls.rows;
    
    // Get related assets
    const relatedAssets = await pool.query(`
      SELECT a.id, a.name, ac.code as category, a.criticality
      FROM assets a
      JOIN asset_categories ac ON ac.id = a.category_id
      WHERE a.organization_id = $1
      ORDER BY a.criticality DESC
      LIMIT 10
    `, [organizationId]);
    
    context.relatedAssets = relatedAssets.rows;
  }
  
  return context;
}

/**
 * Calculate priority score (0-100) for remediation
 */
function calculatePriorityScore(context) {
  let score = 50; // Base score
  
  if (context.type === 'control_gap' && context.control) {
    // Priority 1 controls get higher score
    const priority = parseInt(context.control.priority || 3);
    score += (4 - priority) * 15; // P1=45, P2=30, P3=15
    
    // Not started controls are higher priority than in-progress
    if (!context.control.status || context.control.status === 'not_started') {
      score += 10;
    }
  }
  
  if (context.type === 'vulnerability' && context.vulnerability) {
    // Higher severity = higher priority
    const severityScores = {
      'critical': 95,
      'high': 80,
      'medium': 60,
      'low': 40
    };
    score = severityScores[context.vulnerability.severity] || 50;
  }
  
  if (context.type === 'regulatory_change' && context.impactAssessment) {
    // Use impact score directly
    score = context.impactAssessment.impact_score || 50;
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Generate AI-powered remediation plan
 */
async function generateAIRemediationPlan({ organizationId, context, provider, model }) {
  let prompt = 'Generate a comprehensive remediation plan.\n\n';
  
  if (context.type === 'control_gap' && context.control) {
    prompt += `Control to Implement:
Framework: ${context.control.framework_code}
Control ID: ${context.control.control_id}
Title: ${context.control.title}
Description: ${context.control.description || 'N/A'}
Priority: ${context.control.priority}
Current Status: ${context.control.status || 'not_started'}

Related Controls:
${JSON.stringify(context.relatedControls.slice(0, 5), null, 2)}`;
  } else if (context.type === 'vulnerability' && context.vulnerability) {
    prompt += `Vulnerability to Remediate:
Severity: ${context.vulnerability.severity}
Title: ${context.vulnerability.title}
Description: ${context.vulnerability.description || 'N/A'}
Asset: ${context.vulnerability.asset_name || 'N/A'}
CVSS Score: ${context.vulnerability.cvss_score || 'N/A'}`;
  } else if (context.type === 'regulatory_change' && context.impactAssessment) {
    prompt += `Regulatory Change to Address:
Framework: ${context.impactAssessment.framework_code}
Change Type: ${context.impactAssessment.change_type}
Description: ${context.impactAssessment.change_description}
Impact Level: ${context.impactAssessment.impact_level}`;
  }
  
  prompt += `

Organization Assets:
${JSON.stringify(context.relatedAssets, null, 2)}

Provide a detailed remediation plan with:

1. **Current State Assessment**: Describe the current situation and gaps

2. **Target State Definition**: Define the desired end state

3. **Remediation Steps**: Provide a step-by-step action plan with:
   - Step number and description
   - Responsible role (CISO, IT Manager, Developer, etc.)
   - Estimated hours per step
   - Dependencies on other steps
   - Success criteria

4. **Required Resources**:
   - Personnel (roles and time commitment)
   - Tools or technology needed
   - Training requirements
   - Budget considerations

5. **Timeline Breakdown**:
   - Quick wins (0-2 weeks)
   - Short-term actions (2-6 weeks)
   - Long-term actions (6+ weeks)

6. **Dependencies and Blockers**: Identify what needs to happen first

7. **Success Criteria**: How to verify completion

8. **Cost-Benefit Analysis**:
   - Implementation costs (time, money, resources)
   - Expected benefits (risk reduction, compliance improvement)
   - Return on investment

9. **Risk Analysis**: What could go wrong and mitigation strategies

10. **Post-Implementation**: Ongoing maintenance and monitoring requirements

Return structured, actionable plan with specific recommendations.`;

  const systemPrompt = await llm.buildPersonalizedSystem(
    organizationId,
    'You are an expert security and compliance remediation specialist. Provide detailed, practical remediation plans with specific steps and realistic timelines. Map all recommendations to relevant OWASP Top 10:2025 categories and NIST control families where applicable.',
    'compact', null, 'vulnerability'
  );

  const response = await llm.chat({
    organizationId,
    provider,
    model,
    messages: [{ role: 'user', content: prompt }],
    systemPrompt
  });
  
  return parseRemediationPlan(response);
}

/**
 * Parse AI response into structured plan
 */
function parseRemediationPlan(aiResponse) {
  // Simplified parser - extract key sections
  const plan = {
    raw_plan: aiResponse,
    current_state: '',
    target_state: '',
    steps: [],
    resources: [],
    dependencies: [],
    success_criteria: ''
  };
  
  // Extract current state
  const currentStateMatch = aiResponse.match(/current state[:\s]+(.*?)(?=target state|$)/is);
  if (currentStateMatch) {
    plan.current_state = currentStateMatch[1].trim().substring(0, 2000);
  }
  
  // Extract target state
  const targetStateMatch = aiResponse.match(/target state[:\s]+(.*?)(?=remediation steps|$)/is);
  if (targetStateMatch) {
    plan.target_state = targetStateMatch[1].trim().substring(0, 2000);
  }
  
  // Extract success criteria
  const successMatch = aiResponse.match(/success criteria[:\s]+(.*?)(?=cost-benefit|$)/is);
  if (successMatch) {
    plan.success_criteria = successMatch[1].trim().substring(0, 1000);
  }
  
  return plan;
}

/**
 * Estimate remediation effort
 */
function estimateRemediationEffort(context, aiPlan) {
  let baseHours = 20; // Minimum effort
  
  if (context.type === 'control_gap' && context.control) {
    const priority = parseInt(context.control.priority || 3);
    baseHours = priority === 1 ? 60 : priority === 2 ? 40 : 20;
  } else if (context.type === 'vulnerability') {
    const severityHours = {
      'critical': 80,
      'high': 40,
      'medium': 20,
      'low': 10
    };
    baseHours = severityHours[context.vulnerability?.severity] || 20;
  } else if (context.type === 'regulatory_change') {
    baseHours = Math.round((context.impactAssessment?.estimated_effort_hours || 40));
  }
  
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + 3); // Start in 3 days
  
  const completionDate = new Date(startDate);
  completionDate.setDate(completionDate.getDate() + Math.ceil(baseHours / 6)); // 6 hours per day
  
  const estimatedCost = baseHours * 150; // $150/hour
  
  return {
    estimated_hours: baseHours,
    estimated_start_date: startDate.toISOString().split('T')[0],
    estimated_completion_date: completionDate.toISOString().split('T')[0],
    estimated_cost: estimatedCost
  };
}

/**
 * Estimate risk reduction from implementing remediation
 */
function estimateRiskReduction(context) {
  if (context.type === 'control_gap' && context.control) {
    const priority = parseInt(context.control.priority || 3);
    return priority === 1 ? 85 : priority === 2 ? 65 : 45;
  } else if (context.type === 'vulnerability') {
    const reductions = {
      'critical': 95,
      'high': 75,
      'medium': 50,
      'low': 25
    };
    return reductions[context.vulnerability?.severity] || 50;
  } else if (context.type === 'regulatory_change') {
    const impact = context.impactAssessment?.impact_level;
    const reductions = {
      'critical': 90,
      'high': 70,
      'medium': 50,
      'low': 30,
      'minimal': 15
    };
    return reductions[impact] || 50;
  }
  
  return 50;
}

/**
 * Save remediation plan to database
 */
async function saveRemediationPlan({
  organizationId,
  controlId,
  vulnerabilityId,
  impactAssessmentId,
  priorityScore,
  aiPlan,
  estimates,
  riskReduction,
  provider,
  model
}) {
  const priorityLevel = priorityScore >= 80 ? 'critical' :
                        priorityScore >= 60 ? 'high' :
                        priorityScore >= 40 ? 'medium' : 'low';
  
  const planType = controlId ? 'control_gap' :
                   vulnerabilityId ? 'vulnerability' :
                   impactAssessmentId ? 'regulatory_change' : 'general';
  
  const result = await pool.query(`
    INSERT INTO remediation_plans (
      organization_id,
      plan_name,
      plan_type,
      control_id,
      vulnerability_id,
      impact_assessment_id,
      priority_score,
      priority_level,
      risk_reduction,
      estimated_hours,
      estimated_start_date,
      estimated_completion_date,
      estimated_cost,
      current_state,
      target_state,
      success_criteria,
      ai_generated,
      ai_provider,
      ai_model,
      status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    )
    RETURNING *
  `, [
    organizationId,
    `Remediation Plan - ${new Date().toISOString().split('T')[0]}`,
    planType,
    controlId || null,
    vulnerabilityId || null,
    impactAssessmentId || null,
    priorityScore,
    priorityLevel,
    riskReduction,
    estimates.estimated_hours,
    estimates.estimated_start_date,
    estimates.estimated_completion_date,
    estimates.estimated_cost,
    aiPlan.current_state || '',
    aiPlan.target_state || '',
    aiPlan.success_criteria || '',
    true,
    provider,
    model,
    'draft'
  ]);
  
  return {
    ...result.rows[0],
    ai_plan_details: aiPlan
  };
}

/**
 * Get remediation plans for an organization
 */
async function getRemediationPlans(organizationId, options = {}) {
  const { status, priorityLevel, limit = 50, offset = 0 } = options;
  
  let whereClause = 'WHERE organization_id = $1';
  const params = [organizationId];
  let paramIndex = 2;
  
  if (status) {
    whereClause += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (priorityLevel) {
    whereClause += ` AND priority_level = $${paramIndex}`;
    params.push(priorityLevel);
    paramIndex++;
  }
  
  params.push(limit, offset);
  
  const result = await pool.query(`
    SELECT *
    FROM remediation_plans
    ${whereClause}
    ORDER BY priority_score DESC, created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  return result.rows;
}

/**
 * Update remediation plan status
 */
async function updatePlanStatus(planId, status, completionPercentage, userId) {
  const result = await pool.query(`
    UPDATE remediation_plans
    SET status = $1,
        completion_percentage = $2,
        ${status === 'approved' ? 'approved_by = $4, approved_at = CURRENT_TIMESTAMP,' : ''}
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `, status === 'approved' ? [status, completionPercentage, planId, userId] : [status, completionPercentage, planId]);
  
  return result.rows[0];
}

module.exports = {
  generateSmartRemediationPlan,
  getRemediationPlans,
  updatePlanStatus
};
