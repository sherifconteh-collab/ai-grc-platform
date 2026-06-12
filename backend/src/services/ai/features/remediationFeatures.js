/**
 * AI remediation and operations features: remediation playbooks,
 * vulnerability remediation, IAVM asset alerts, incident response plans,
 * asset-to-control mapping, shadow IT detection, AI governance checks,
 * evidence suggestions, control analysis, test procedures, asset risk
 * analysis, and policy generation.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * Function bodies are identical to the original inline definitions.
 */

'use strict';

const pool = require('../../../config/database');
const { chat, compactJSON, buildPersonalizedSystem } = require('../chatCore');
const { buildFewShotBlock } = require('../exemplarLoader');

// =====================================================================
// 5. REMEDIATION PLAYBOOKS
// =====================================================================
async function generateRemediationPlaybook({ controlId, organizationId, provider, model, schemaRetryHint = null }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code, f.name as framework_name,
      COALESCE(ci.status, 'not_started') as impl_status, ci.notes as impl_notes
    FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE fc.id = $2
  `, [organizationId, controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  const assets = await pool.query(`
    SELECT a.name, a.hostname, ac.code as category, a.criticality
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1 ORDER BY a.criticality LIMIT 20
  `, [organizationId]);

  const controlTitle = control.rows[0]?.title || control.rows[0]?.control_id || 'control';

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', `remediation implementation playbook ${controlTitle}`, 'controls'),
    messages: [{ role: 'user', content: `Generate a detailed remediation playbook for this control.${buildFewShotBlock('remediation_playbook')}

Control:
${compactJSON(control.rows[0])}

Organization Assets:
${compactJSON(assets.rows)}

Provide:
1. Step-by-step implementation guide (numbered steps)
2. Required tools and technologies
3. Estimated effort (hours) and required skill level
4. Configuration examples / code snippets where applicable
5. Verification steps to confirm implementation
6. Common pitfalls and how to avoid them
7. Evidence artifacts to collect during implementation
8. Related controls that benefit from this implementation${schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : ''}` }],
    feature: 'remediation_playbook',
    maxTokens: 3072
  });
}

// =====================================================================
// VULNERABILITY REMEDIATION PLAN
// =====================================================================
async function generateVulnerabilityRemediation({
  vulnerabilityId,
  organizationId,
  provider,
  model
}) {
  const findingResult = await pool.query(
    `SELECT
       vf.id,
       vf.finding_key,
       vf.vulnerability_id,
       vf.source,
       vf.standard,
       vf.title,
       vf.description,
       vf.severity,
       vf.cvss_score,
       vf.status,
       vf.due_date,
       vf.package_name,
       vf.component_name,
       vf.version_detected,
       vf.cwe_id,
       vf.owasp_top10_2025_category,
       vf.kev_listed,
       vf.exploit_available,
       a.id AS asset_id,
       a.name AS asset_name,
       a.hostname AS asset_hostname,
       a.ip_address AS asset_ip,
       e.name AS environment_name
     FROM vulnerability_findings vf
     LEFT JOIN assets a ON a.id = vf.asset_id
     LEFT JOIN environments e ON e.id = a.environment_id
     WHERE vf.organization_id = $1
       AND vf.id = $2
     LIMIT 1`,
    [organizationId, vulnerabilityId]
  );

  if (findingResult.rows.length === 0) {
    throw new Error('Vulnerability finding not found');
  }

  const finding = findingResult.rows[0];

  const workflowResult = await pool.query(
    `SELECT
       vw.action_type,
       vw.action_status,
       vw.control_effect,
       vw.response_summary,
       vw.due_date,
       fc.control_id AS control_code,
       fc.title AS control_title,
       f.code AS framework_code,
       f.name AS framework_name,
       COALESCE(ci.status, 'not_started') AS implementation_status
     FROM vulnerability_control_work_items vw
     JOIN framework_controls fc ON fc.id = vw.framework_control_id
     JOIN frameworks f ON f.id = fc.framework_id
     LEFT JOIN control_implementations ci ON ci.id = vw.implementation_id
     WHERE vw.organization_id = $1
       AND vw.vulnerability_id = $2
     ORDER BY f.code, fc.control_id`,
    [organizationId, vulnerabilityId]
  );

  const poamResult = await pool.query(
    `SELECT
       id,
       title,
       status,
       priority,
       due_date,
       owner_id,
       remediation_plan
     FROM poam_items
     WHERE organization_id = $1
       AND vulnerability_id = $2
     ORDER BY created_at DESC
     LIMIT 5`,
    [organizationId, vulnerabilityId]
  );

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'Focus on practical remediation and control-closure actions for vulnerability findings.', 'compact', null, 'vulnerability'),
    messages: [{
      role: 'user',
      content: `Generate a vulnerability remediation and closure plan.

Vulnerability Finding:
${compactJSON(finding)}
${finding.owasp_top10_2025_category ? `\nOWASP Top 10:2025 Category: ${finding.owasp_top10_2025_category}` : ''}
${finding.cwe_id ? `CWE: ${finding.cwe_id}` : ''}

Related Control Workflow Items:
${compactJSON(workflowResult.rows)}

Related POA&M Items:
${compactJSON(poamResult.rows)}

Return:
1. Executive summary (risk + business impact)
2. Immediate containment actions (0-24h)
3. Remediation actions (patch/config/code/process) with owner roles and due dates
4. Control-closure impact: which controls can move to compliant, which remain partial
5. Required evidence artifacts for closure and audit defensibility
6. Residual risk statement and conditions for risk acceptance (if needed)
7. OWASP Top 10:2025 context: explain which OWASP category applies, why, and category-specific hardening best practices
8. A JSON block:
{
  "finding_id": "${finding.id}",
  "priority": "low|medium|high|critical",
  "recommended_actions": [
    {
      "title": "...",
      "owner_role": "...",
      "target_days": 7,
      "evidence_required": ["..."],
      "mapped_controls": ["..."]
    }
  ],
  "closure_criteria": ["..."],
  "poam_update_suggestion": "..."
}`
    }]
  });
}

// =====================================================================
// IAVM ASSET ALERT
// =====================================================================
// Matches an IAVM (Information Assurance Vulnerability Management) notice
// against the org's assets and generates an AI-powered risk alert with
// recommended remediation actions.
async function generateIAVMAssetAlert({ organizationId, iavmId, title, description, affectedProducts, severity, provider, model }) {
  const maxAssets = Math.max(50, parseInt(process.env.AI_IAVM_MAX_ASSETS || '500', 10));
  const assets = await pool.query(`
    SELECT a.id, a.name, a.hostname, a.fqdn, a.ip_address, a.operating_system,
           a.software_inventory, a.criticality, a.security_classification,
           ac.code AS category, e.name AS environment
    FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.organization_id = $1
    ORDER BY a.criticality NULLS LAST
    LIMIT $2
  `, [organizationId, maxAssets]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId,
      'You are an expert in DoD vulnerability management (IAVM program). ' +
      'You map IAVM notices to affected assets and generate actionable remediation guidance ' +
      'aligned with DISA STIGs, NIST 800-53 SI-2/RA-5, and CISA KEV timelines.',
      'compact', null, 'vulnerability'),
    messages: [{
      role: 'user',
      content: `Analyze this IAVM notice and determine which of the organization's assets are likely affected.

IAVM Notice:
- ID: ${iavmId || 'Unknown'}
- Title: ${title || 'Unknown'}
- Severity: ${severity || 'Unknown'}
- Affected Products / Platforms:
${affectedProducts ? compactJSON(affectedProducts) : 'Not specified'}
- Description:
${description || 'No description provided'}

Organization Assets (${assets.rows.length} total):
${compactJSON(assets.rows)}

Provide:
1. **Affected Assets** – List each asset likely affected by this IAVM, with a brief reason (hostname/OS/software match)
2. **Risk Assessment** – Overall risk to the organization (Critical/High/Medium/Low) with justification
3. **Remediation Steps** – Step-by-step remediation plan referencing DISA STIG or patch guidance where applicable
4. **Compliance Impact** – Which NIST 800-53 controls (e.g. SI-2, RA-5) or other framework controls are triggered
5. **Timeline** – Recommended remediation timeline based on IAVM severity category (CAT I = 21 days, CAT II = 30 days, CAT III = 180 days)
6. **Evidence Required** – What scan or patch evidence to collect for audit closure

If no assets appear to be affected, explicitly state that and explain why.`
    }]
  });
}

// =====================================================================
// 6. INCIDENT RESPONSE PLANS
// =====================================================================
async function generateIncidentResponsePlan({ organizationId, incidentType, provider, model }) {
  const assets = await pool.query(`
    SELECT a.name, a.hostname, a.ip_address, ac.code as category,
      a.criticality, a.security_classification, e.name as environment
    FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.organization_id = $1 ORDER BY a.criticality LIMIT 50
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'controls'),
    messages: [{ role: 'user', content: `Generate an incident response plan for: ${incidentType || 'General cybersecurity incident'}

Organization Asset Inventory:
${compactJSON(assets.rows)}

Generate a complete IR plan with:
1. Incident Classification & Severity Matrix
2. Detection & Identification procedures
3. Containment Strategy (short-term and long-term)
4. Eradication Steps
5. Recovery Procedures with asset-specific actions
6. Post-Incident Review checklist
7. Communication plan (internal stakeholders, regulators, affected parties)
8. Evidence preservation requirements
9. Regulatory notification requirements (GDPR 72hr, HIPAA, etc.)
10. Roles and responsibilities matrix` }]
  });
}

// =====================================================================
// 11. ASSET-TO-CONTROL MAPPING
// =====================================================================
async function mapAssetsToControls({ organizationId, provider, model }) {
  const assets = await pool.query(`
    SELECT a.id, a.name, ac.code as category, a.criticality,
      a.security_classification, a.hostname, a.cloud_provider,
      a.ai_model_type, a.ai_risk_level
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1 ORDER BY a.criticality LIMIT 30
  `, [organizationId]);

  const frameworks = await pool.query(`
    SELECT f.code, f.name FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id WHERE of2.organization_id = $1
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'controls'),
    messages: [{ role: 'user', content: `Map assets to applicable compliance controls.

Assets:
${compactJSON(assets.rows)}

Adopted Frameworks: ${JSON.stringify(frameworks.rows)}

For each asset, identify:
1. Which framework controls directly apply to this asset type
2. Priority of each control-asset pairing (Critical/High/Medium/Low)
3. Any gaps where assets lack required controls
4. Recommended control implementations per asset category
5. Return structured mapping data:
   { "mappings": [{ "asset": "name", "controls": [{ "id": "XX-1", "framework": "code", "priority": "high", "reason": "..." }] }] }` }]
  });
}

// =====================================================================
// 12. SHADOW IT DETECTION
// =====================================================================
async function detectShadowIT({ organizationId, provider, model }) {
  const assets = await pool.query(`
    SELECT a.name, ac.code as category, a.hostname, a.ip_address, a.cloud_provider,
      a.status, a.security_classification, e.name as environment
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.organization_id = $1
  `, [organizationId]);

  const controls = await pool.query(`
    SELECT f.code, fc.control_id, fc.title FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    WHERE of2.organization_id = $1
    AND (fc.title ILIKE '%inventory%' OR fc.title ILIKE '%asset%' OR fc.title ILIKE '%configuration%')
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'lean'),
    messages: [{ role: 'user', content: `Analyze asset inventory for potential Shadow IT gaps.

Registered Assets:
${compactJSON(assets.rows)}

Asset-related Controls:
${compactJSON(controls.rows)}

Analyze and provide:
1. Categories of assets that are typically present but missing from inventory
2. Common Shadow IT patterns based on the current asset profile
3. Specific asset types that should be investigated
4. Questions to ask department heads about undocumented systems
5. Automated discovery recommendations (tools and techniques)
6. Risk exposure from potential unregistered assets
7. Compliance impact of Shadow IT on adopted frameworks` }]
  });
}

// =====================================================================
// 13. AI/ML MODEL GOVERNANCE CHECKS
// =====================================================================
async function checkAIGovernance({ organizationId, provider, model }) {
  const aiAssets = await pool.query(`
    SELECT a.name, a.ai_model_type, a.ai_risk_level, a.ai_training_data_source,
      a.ai_bias_testing_completed, a.ai_bias_testing_date, a.ai_human_oversight_required,
      a.status, a.version
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    WHERE a.organization_id = $1 AND ac.code = 'ai_agent'
  `, [organizationId]);

  const aiControls = await pool.query(`
    SELECT f.code, f.name, fc.control_id, fc.title, COALESCE(ci.status, 'not_started') as status
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    AND f.code IN ('eu_ai_act', 'nist_ai_rmf', 'iso_42001', 'iso_42005', 'aiuc_1')
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'ai_governance'),
    messages: [{ role: 'user', content: `Perform AI/ML model governance assessment.

AI Assets:
${compactJSON(aiAssets.rows)}

AI Governance Controls:
${compactJSON(aiControls.rows)}

Assess:
1. EU AI Act compliance status per AI asset (risk classification, conformity assessment)
2. NIST AI RMF alignment check
3. ISO/IEC 42001 AI management system alignment (governance and operational controls)
4. ISO/IEC 42005 AI system impact assessment coverage
5. Bias testing gaps and recommendations
6. Data governance status for training data
7. Human oversight requirements vs current implementation
8. Model documentation completeness
9. Transparency and explainability gaps
10. AIUC-1 agentic AI certification readiness (Data & Privacy, Security, Safety, Reliability, Accountability, Societal Impact)
11. Recommended governance actions prioritized by risk level` }]
  });
}

// =====================================================================
// 16. EVIDENCE COLLECTION ASSISTANT
// =====================================================================
async function suggestEvidence({ controlId, organizationId, provider, model, schemaRetryHint = null }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code, f.name as framework_name
    FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE fc.id = $1
  `, [controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  const retryBlock = schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : '';

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'evidence'),
    messages: [{ role: 'user', content: `Suggest evidence artifacts for this control.${buildFewShotBlock('evidence_suggestion')}

Control: ${compactJSON(control.rows[0])}

Return a JSON object with:
- control_id, control_title, framework
- evidence_items: array of { title, description, collection_method, format, freshness_days, automation_possible, automation_hint, example_filename, sufficiency_criteria }
- collection_notes: string
- estimated_collection_hours: number${retryBlock}` }],
    feature: 'evidence_suggestion'
  });
}

// =====================================================================
// BONUS: CONTROL ANALYSIS (existing feature)
// =====================================================================
async function analyzeControl({ controlId, organizationId, provider, model }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code, f.name as framework_name,
      COALESCE(ci.status, 'not_started') as impl_status
    FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE fc.id = $2
  `, [organizationId, controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'controls'),
    messages: [{ role: 'user', content: `Analyze this control and provide implementation guidance.

Control: ${compactJSON(control.rows[0])}

Provide:
1. Plain-English explanation of what this control requires
2. Implementation approach for a mid-size organization
3. Technical vs procedural requirements
4. Estimated implementation effort
5. Key evidence artifacts needed
6. Related controls and dependencies` }]
  });
}

// =====================================================================
// BONUS: GENERATE TEST PROCEDURES
// =====================================================================
async function generateTestProcedures({ controlId, organizationId, provider, model, schemaRetryHint = null }) {
  const control = await pool.query(`
    SELECT fc.*, f.code as framework_code FROM framework_controls fc
    JOIN frameworks f ON f.id = fc.framework_id WHERE fc.id = $1
  `, [controlId]);

  if (control.rows.length === 0) throw new Error('Control not found');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'controls'),
    messages: [{ role: 'user', content: `Generate test procedures for this control.${buildFewShotBlock('test_procedures')}

Control: ${compactJSON(control.rows[0])}

Provide:
1. Test objective
2. Test steps (numbered, detailed)
3. Expected results for pass/fail
4. Sample sizes and frequency
5. Automation scripts where applicable
6. Evidence to collect during testing${schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : ''}` }],
    feature: 'test_procedures'
  });
}

// =====================================================================
// BONUS: ASSET RISK ANALYSIS
// =====================================================================
async function analyzeAssetRisk({ assetId, organizationId, provider, model }) {
  const asset = await pool.query(`
    SELECT a.*, ac.name as category_name, ac.code as category_code, e.name as environment_name
    FROM assets a JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN environments e ON e.id = a.environment_id
    WHERE a.id = $1 AND a.organization_id = $2
  `, [assetId, organizationId]);

  if (asset.rows.length === 0) throw new Error('Asset not found');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'risk'),
    messages: [{ role: 'user', content: `Perform a risk analysis on this asset.

Asset: ${compactJSON(asset.rows[0])}

Provide:
1. Risk score (1-100) with justification
2. Threat vectors specific to this asset type
3. Vulnerability assessment areas
4. Compliance requirements (which frameworks apply)
5. Recommended security controls
6. Monitoring recommendations` }]
  });
}

// =====================================================================
// BONUS: POLICY GENERATOR
// =====================================================================
async function generatePolicy({ policyType, organizationId, provider, model }) {
  const frameworks = await pool.query(`
    SELECT f.code, f.name FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id WHERE of2.organization_id = $1
  `, [organizationId]);

  return chat({
    provider, model, organizationId, maxTokens: 8192,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'policy'),
    messages: [{ role: 'user', content: `Generate a comprehensive ${policyType} policy document.

Adopted Frameworks: ${JSON.stringify(frameworks.rows)}

Generate a complete, professional policy including:
1. Policy title, version, effective date placeholders
2. Purpose and scope
3. Policy statements (specific, actionable)
4. Roles and responsibilities
5. Procedures and standards
6. Compliance and enforcement
7. Related policies and references
8. Revision history template
Map requirements to the organization's adopted frameworks where applicable.` }]
  });
}

module.exports = {
  generateRemediationPlaybook,
  generateVulnerabilityRemediation,
  generateIAVMAssetAlert,
  generateIncidentResponsePlan,
  mapAssetsToControls,
  detectShadowIT,
  checkAIGovernance,
  suggestEvidence,
  analyzeControl,
  generateTestProcedures,
  analyzeAssetRisk,
  generatePolicy,
};
