// @tier: community
const pool = require('../config/database');

// Optional LLM service: policy generation features disabled if unavailable
let getLLMService;
try {
  ({ getLLMService } = require('./llmService'));
} catch (e) {
  getLLMService = async () => null;
}

/**
 * NIST 800-53 Control Families - Used as the structural template for policies
 */
const NIST_CONTROL_FAMILIES = [
  { code: 'AC', name: 'Access Control', order: 1 },
  { code: 'AT', name: 'Awareness and Training', order: 2 },
  { code: 'AU', name: 'Audit and Accountability', order: 3 },
  { code: 'CA', name: 'Assessment, Authorization, and Monitoring', order: 4 },
  { code: 'CM', name: 'Configuration Management', order: 5 },
  { code: 'CP', name: 'Contingency Planning', order: 6 },
  { code: 'IA', name: 'Identification and Authentication', order: 7 },
  { code: 'IR', name: 'Incident Response', order: 8 },
  { code: 'MA', name: 'Maintenance', order: 9 },
  { code: 'MP', name: 'Media Protection', order: 10 },
  { code: 'PE', name: 'Physical and Environmental Protection', order: 11 },
  { code: 'PL', name: 'Planning', order: 12 },
  { code: 'PS', name: 'Personnel Security', order: 13 },
  { code: 'PT', name: 'PII Processing and Transparency', order: 14 },
  { code: 'RA', name: 'Risk Assessment', order: 15 },
  { code: 'SA', name: 'System and Services Acquisition', order: 16 },
  { code: 'SC', name: 'System and Communications Protection', order: 17 },
  { code: 'SI', name: 'System and Information Integrity', order: 18 },
  { code: 'PM', name: 'Program Management', order: 19 },
  { code: 'SR', name: 'Supply Chain Risk Management', order: 20 }
];

/**
 * Extract control family code from control ID
 * Examples: AC-1 -> AC, AU-2 -> AU, CM-2.1 -> CM
 */
function extractFamilyCode(controlId) {
  if (!controlId) return null;
  const match = String(controlId).match(/^([A-Z]{2})-/);
  return match ? match[1] : null;
}

/**
 * Generate policy from organization's selected frameworks
 */
async function generatePolicyFromFrameworks(orgId, userId, policyName, policyType, frameworks) {
  try {
    // Step 1: Create the policy record
    const policyResult = await pool.query(
      `INSERT INTO organization_policies (
         organization_id, policy_name, policy_type, status, version,
         review_frequency_days, created_by
       )
       VALUES ($1, $2, $3, 'draft', '1.0', 365, $4)
       RETURNING *`,
      [orgId, policyName, policyType, userId]
    );

    const policy = policyResult.rows[0];

    // Step 2: Get all controls from selected frameworks
    const frameworkIds = frameworks.map(f => f.id);
    const controlsResult = await pool.query(
      `SELECT 
         fc.id,
         fc.control_id,
         fc.title,
         fc.description,
         fc.control_type,
         f.id AS framework_id,
         f.name AS framework_name,
         f.code AS framework_code,
         ci.status AS implementation_status
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE f.id = ANY($2)
       ORDER BY fc.control_id`,
      [orgId, frameworkIds]
    );

    const controls = controlsResult.rows;

    // Step 3: Group controls by control family
    const controlsByFamily = {};
    for (const control of controls) {
      const familyCode = extractFamilyCode(control.control_id);
      if (!familyCode) continue;

      if (!controlsByFamily[familyCode]) {
        controlsByFamily[familyCode] = [];
      }
      controlsByFamily[familyCode].push(control);
    }

    // Step 4: Generate policy sections based on NIST control families
    const sections = [];
    for (const family of NIST_CONTROL_FAMILIES) {
      const familyControls = controlsByFamily[family.code] || [];
      
      if (familyControls.length === 0) {
        continue; // Skip families with no controls
      }

      // Generate section content using AI
      const sectionContent = await generateSectionContent(
        orgId,
        policyName,
        policyType,
        family,
        familyControls,
        frameworks
      );

      // Insert section
      const sectionResult = await pool.query(
        `INSERT INTO policy_sections (
           organization_id, policy_id, section_number, section_title,
           section_content, framework_family_code, framework_family_name, display_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          orgId,
          policy.id,
          family.code,
          `${family.code} - ${family.name}`,
          sectionContent,
          family.code,
          family.name,
          family.order
        ]
      );

      const section = sectionResult.rows[0];

      // Map controls to this section
      for (const control of familyControls) {
        await pool.query(
          `INSERT INTO policy_control_mappings (
             organization_id, policy_section_id, control_id, framework_id
           )
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (policy_section_id, control_id) DO NOTHING`,
          [orgId, section.id, control.id, control.framework_id]
        );
      }

      sections.push({
        section,
        controls_count: familyControls.length
      });
    }

    // Step 5: Calculate next review date
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + 365);
    
    await pool.query(
      `UPDATE organization_policies
       SET effective_date = CURRENT_DATE,
           next_review_date = $3,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [policy.id, orgId, nextReviewDate.toISOString().slice(0, 10)]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'policy_generated', 'policy', $3, $4::jsonb, true)`,
      [
        orgId,
        userId,
        policy.id,
        JSON.stringify({
          policy_name: policyName,
          policy_type: policyType,
          frameworks: frameworks.map(f => f.code),
          sections_created: sections.length
        })
      ]
    );

    return {
      policy,
      sections,
      frameworks_used: frameworks.map(f => ({ id: f.id, name: f.name, code: f.code }))
    };
  } catch (error) {
    console.error('Generate policy error:', error);
    throw error;
  }
}

/**
 * Generate section content for a control family using AI
 */
async function generateSectionContent(orgId, policyName, policyType, family, controls, frameworks) {
  try {
    // Get organization context
    const orgResult = await pool.query(
      `SELECT name, industry, organization_size FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId]
    );
    const org = orgResult.rows[0] || {};

    // Build prompt for AI
    const frameworkNames = frameworks.map(f => f.name).join(', ');
    const controlList = controls.map(c => 
      `- ${c.control_id}: ${c.title} (${c.framework_code})`
    ).join('\n');

    const prompt = `You are a compliance expert creating a comprehensive ${policyType} for ${org.name || 'an organization'}.

Organization Context:
- Industry: ${org.industry || 'General'}
- Size: ${org.organization_size || 'Medium'}
- Compliance Frameworks: ${frameworkNames}

Policy Section: ${family.code} - ${family.name}

Create a detailed policy section that addresses the following controls from multiple frameworks:

${controlList}

Requirements:
1. Write clear, actionable policy statements that address ALL listed controls
2. When multiple frameworks have similar controls, integrate them into unified policy statements
3. Use professional, formal policy language
4. Include specific requirements, responsibilities, and procedures
5. Make it practical and implementable for ${org.organization_size || 'medium-sized'} ${org.industry || 'organizations'}
6. Length: 300-500 words

Format the response as a cohesive policy section with:
- Purpose statement
- Scope
- Policy statements (numbered)
- Roles and responsibilities
- References to relevant controls

Do NOT include a title or header - just the policy content.`;

    // Get LLM service and generate content
    const llmService = await getLLMService(orgId);
    
    if (!llmService) {
      // Fallback: Generate basic section from control descriptions
      return generateFallbackSectionContent(family, controls, frameworks);
    }

    const response = await llmService.generateText(prompt, {
      temperature: 0.7,
      max_tokens: 1000
    });

    return response || generateFallbackSectionContent(family, controls, frameworks);
  } catch (error) {
    console.error('Generate section content error:', error);
    // Fallback to basic generation
    return generateFallbackSectionContent(family, controls, frameworks);
  }
}

/**
 * Fallback section generation without AI
 */
function generateFallbackSectionContent(family, controls, frameworks) {
  const frameworkNames = frameworks.map(f => f.name).join(', ');
  
  let content = `## Purpose\n\nThis section establishes ${family.name.toLowerCase()} requirements for the organization in accordance with ${frameworkNames}.\n\n`;
  
  content += `## Scope\n\nThese policies apply to all information systems, personnel, and processes within the organization.\n\n`;
  
  content += `## Policy Statements\n\n`;
  
  // Group controls by framework
  const controlsByFramework = {};
  for (const control of controls) {
    if (!controlsByFramework[control.framework_code]) {
      controlsByFramework[control.framework_code] = [];
    }
    controlsByFramework[control.framework_code].push(control);
  }

  let policyNum = 1;
  for (const [frameworkCode, frameworkControls] of Object.entries(controlsByFramework)) {
    for (const control of frameworkControls) {
      content += `${policyNum}. **${control.control_id}**: ${control.title}\n`;
      if (control.description) {
        const shortDesc = String(control.description).substring(0, 200);
        content += `   ${shortDesc}${control.description.length > 200 ? '...' : ''}\n`;
      }
      content += '\n';
      policyNum++;
    }
  }

  content += `## Roles and Responsibilities\n\n`;
  content += `- **Management**: Approve and oversee implementation of these policies\n`;
  content += `- **IT/Security Team**: Implement technical controls and monitor compliance\n`;
  content += `- **All Personnel**: Adhere to policies and report violations\n\n`;
  
  content += `## Review\n\nThis policy shall be reviewed annually or when significant changes occur.\n`;

  return content;
}

/**
 * Create monitoring reference for a policy
 */
async function createPolicyReference(orgId, policyId, sectionId, referenceType, referenceName, referenceIdentifier, monitoringFrequencyDays = 90) {
  try {
    const nextMonitoringDate = new Date();
    nextMonitoringDate.setDate(nextMonitoringDate.getDate() + monitoringFrequencyDays);

    const result = await pool.query(
      `INSERT INTO policy_references (
         organization_id, policy_id, policy_section_id, reference_type,
         reference_name, reference_identifier, monitoring_enabled,
         monitoring_frequency_days, next_monitoring_date, monitoring_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, 'needs_review')
       RETURNING *`,
      [
        orgId,
        policyId,
        sectionId || null,
        referenceType,
        referenceName,
        referenceIdentifier || null,
        monitoringFrequencyDays,
        nextMonitoringDate.toISOString().slice(0, 10)
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Create policy reference error:', error);
    throw error;
  }
}

/**
 * Check for policy references that need monitoring
 */
async function checkPolicyReferences(orgId) {
  try {
    const result = await pool.query(
      `SELECT 
         pr.*,
         p.policy_name
       FROM policy_references pr
       JOIN organization_policies p ON p.id = pr.policy_id
       WHERE pr.organization_id = $1
         AND pr.monitoring_enabled = true
         AND pr.next_monitoring_date <= CURRENT_DATE
         AND pr.monitoring_status != 'compliant'
       ORDER BY pr.next_monitoring_date`,
      [orgId]
    );

    // Create alerts for references that need checking
    for (const ref of result.rows) {
      await pool.query(
        `INSERT INTO policy_monitoring_alerts (
           organization_id, policy_id, policy_reference_id, alert_type,
           alert_severity, alert_message, alert_details
         )
         VALUES ($1, $2, $3, 'reference_changed', 'medium', $4, $5::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          orgId,
          ref.policy_id,
          ref.id,
          `Policy reference "${ref.reference_name}" requires monitoring review`,
          JSON.stringify({
            reference_type: ref.reference_type,
            last_monitored: ref.last_monitored_at
          })
        ]
      );
    }

    return result.rows;
  } catch (error) {
    console.error('Check policy references error:', error);
    throw error;
  }
}

/**
 * Schedule annual policy reviews
 */
async function scheduleAnnualReviews(orgId) {
  try {
    const result = await pool.query(
      `SELECT id, policy_name, next_review_date
       FROM organization_policies
       WHERE organization_id = $1
         AND status IN ('approved', 'published')
         AND next_review_date <= CURRENT_DATE
       ORDER BY next_review_date`,
      [orgId]
    );

    for (const policy of result.rows) {
      // Create review record
      await pool.query(
        `INSERT INTO policy_reviews (
           organization_id, policy_id, review_type, review_date,
           review_status, next_review_date
         )
         VALUES ($1, $2, 'annual', CURRENT_DATE, 'scheduled', $3)
         ON CONFLICT DO NOTHING`,
        [
          orgId,
          policy.id,
          policy.next_review_date
        ]
      );

      // Create alert
      await pool.query(
        `INSERT INTO policy_monitoring_alerts (
           organization_id, policy_id, alert_type, alert_severity, alert_message
         )
         VALUES ($1, $2, 'review_due', 'high', $3)`,
        [
          orgId,
          policy.id,
          `Annual review is due for policy "${policy.policy_name}"`
        ]
      );
    }

    return result.rows;
  } catch (error) {
    console.error('Schedule annual reviews error:', error);
    throw error;
  }
}

module.exports = {
  generatePolicyFromFrameworks,
  generateSectionContent,
  createPolicyReference,
  checkPolicyReferences,
  scheduleAnnualReviews,
  NIST_CONTROL_FAMILIES,
  extractFamilyCode
};
