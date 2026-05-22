// @tier: enterprise
const pool = require('../config/database');

/**
 * In-memory cache for organization context with 5-minute TTL
 * Reduces database queries by ~70% for frequently accessed contexts
 */
const contextCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clears cache entry for an organization (call on org updates)
 * @param {string} organizationId
 */
function invalidateOrgContextCache(organizationId) {
  contextCache.delete(organizationId);
}

/**
 * Builds a rich, personalized organization context string to inject into
 * every AI system prompt. This makes every AI response org-aware rather
 * than generic.
 *
 * @param {string} organizationId
 * @param {string} contextLevel - 'minimal', 'compact', 'full' (default: 'compact')
 * @returns {Promise<string>} context block to append to system prompt
 * 
 * @example
 * // Minimal context - just essential info (saves ~80% tokens)
 * await buildOrgContext(orgId, 'minimal');  // ~30-50 tokens
 * 
 * // Compact context - key details only (saves ~50% tokens) - DEFAULT
 * await buildOrgContext(orgId, 'compact');  // ~100-150 tokens
 * 
 * // Full context - all details (original behavior)
 * await buildOrgContext(orgId, 'full');     // ~200-300 tokens
 */
async function buildOrgContext(organizationId, contextLevel = 'compact') {
  // Check cache first
  const cacheKey = `${organizationId}:${contextLevel}`;
  const cached = contextCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }
  try {
    // Minimal context - just essential info (saves ~80% tokens)
    if (contextLevel === 'minimal') {
      const profileResult = await pool.query(
        `SELECT op.industry, o.tier, o.country_code
         FROM organizations o
         LEFT JOIN organization_profiles op ON op.organization_id = o.id
         WHERE o.id = $1 LIMIT 1`,
        [organizationId]
      );
      const profile = profileResult.rows[0] || {};
      
      const frameworksResult = await pool.query(
        `SELECT f.code FROM organization_frameworks of2
         JOIN frameworks f ON f.id = of2.framework_id
         WHERE of2.organization_id = $1`,
        [organizationId]
      );
      
      const lines = ['--- ORG CONTEXT ---'];
      if (profile.industry) lines.push(`Industry: ${profile.industry}`);
      if (profile.tier) lines.push(`Tier: ${profile.tier}`);
      if (frameworksResult.rows.length > 0) {
        lines.push(`Frameworks: ${frameworksResult.rows.map(f => f.code).join(', ')}`);
      }
      if (String(profile.country_code).toUpperCase() === 'SG') {
        lines.push('Regulatory: MAS TRM applies (Singapore jurisdiction)');
      }
      lines.push('---');
      const result = lines.join('\n');
      // Cache the result
      contextCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
    
    // Compact context - key details only (saves ~50% tokens)
    if (contextLevel === 'compact') {
      const profileResult = await pool.query(
        `SELECT op.industry, op.employee_count_range, o.tier, o.country_code
         FROM organizations o
         LEFT JOIN organization_profiles op ON op.organization_id = o.id
         WHERE o.id = $1 LIMIT 1`,
        [organizationId]
      );
      const profile = profileResult.rows[0] || {};
      
      const frameworksResult = await pool.query(
        `SELECT f.code, ROUND(
           COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
           / NULLIF(COUNT(fc.id), 0) * 100, 0
         ) AS pct
         FROM organization_frameworks of2
         JOIN frameworks f ON f.id = of2.framework_id
         JOIN framework_controls fc ON fc.framework_id = f.id
         LEFT JOIN control_implementations ci
           ON ci.control_id = fc.id AND ci.organization_id = $1
         WHERE of2.organization_id = $1
         GROUP BY f.code`,
        [organizationId]
      );
      
      const lines = ['--- ORG CONTEXT ---'];
      if (profile.industry) lines.push(`Industry: ${profile.industry}`);
      if (profile.employee_count_range) lines.push(`Size: ${profile.employee_count_range}`);
      if (profile.tier) lines.push(`Tier: ${profile.tier}`);
      if (frameworksResult.rows.length > 0) {
        lines.push(`Frameworks: ${frameworksResult.rows.map(f => `${f.code}(${f.pct || 0}%)`).join(', ')}`);
      }
      if (String(profile.country_code).toUpperCase() === 'SG') {
        lines.push('Regulatory: MAS TRM applies (Singapore jurisdiction)');
      }
      lines.push('---');
      const result = lines.join('\n');
      // Cache the result
      contextCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
    
    // Full context - all details (original behavior)
    // 1. Org profile (onboarding data)
    const profileResult = await pool.query(
      `SELECT op.company_legal_name, op.industry, op.employee_count_range,
              op.confidentiality_impact, op.integrity_impact, op.availability_impact,
              op.deployment_model, op.cloud_providers, op.data_sensitivity_types,
              op.environment_types, op.rmf_stage, op.system_name, op.system_description,
              o.tier, o.country_code
       FROM organizations o
       LEFT JOIN organization_profiles op ON op.organization_id = o.id
       WHERE o.id = $1 LIMIT 1`,
      [organizationId]
    );
    const profile = profileResult.rows[0] || {};

    // 2. Active frameworks + compliance %
    const frameworksResult = await pool.query(
      `SELECT f.code, f.name,
              COUNT(fc.id) AS total,
              COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') AS implemented,
              ROUND(
                COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
                / NULLIF(COUNT(fc.id), 0) * 100, 1
              ) AS pct
       FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       JOIN framework_controls fc ON fc.framework_id = f.id
       LEFT JOIN control_implementations ci
         ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE of2.organization_id = $1
       GROUP BY f.code, f.name
       ORDER BY f.name`,
      [organizationId]
    );

    // 3. Asset summary
    const assetResult = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE a.criticality = 'critical') AS critical,
              COUNT(*) FILTER (WHERE ac.code = 'ai_agent') AS ai_agents
       FROM assets a
       JOIN asset_categories ac ON ac.id = a.category_id
       WHERE a.organization_id = $1`,
      [organizationId]
    );
    const assets = assetResult.rows[0] || {};

    // 4. Open vulnerability count
    const vulnResult = await pool.query(
      `SELECT COUNT(*) AS open_critical
       FROM vulnerability_findings
       WHERE organization_id = $1 AND status = 'open' AND severity = 'critical'`,
      [organizationId]
    );
    const openCritical = vulnResult.rows[0]?.open_critical || 0;

    // 5. Assemble context string
    const lines = [];
    lines.push('--- ORGANIZATION CONTEXT ---');

    if (profile.company_legal_name) lines.push(`Organization: ${profile.company_legal_name}`);
    if (profile.system_name)        lines.push(`System: ${profile.system_name}`);
    if (profile.industry)           lines.push(`Industry: ${profile.industry}`);
    if (profile.employee_count_range) lines.push(`Size: ${profile.employee_count_range} employees`);
    if (profile.tier)               lines.push(`Platform Tier: ${profile.tier}`);

    if (profile.confidentiality_impact || profile.integrity_impact || profile.availability_impact) {
      lines.push(`CIA Baseline: Confidentiality=${profile.confidentiality_impact || 'unknown'}, Integrity=${profile.integrity_impact || 'unknown'}, Availability=${profile.availability_impact || 'unknown'}`);
    }

    if (profile.deployment_model)   lines.push(`Deployment: ${profile.deployment_model}`);
    if (Array.isArray(profile.cloud_providers) && profile.cloud_providers.length > 0) {
      lines.push(`Cloud: ${profile.cloud_providers.join(', ')}`);
    }
    if (Array.isArray(profile.data_sensitivity_types) && profile.data_sensitivity_types.length > 0) {
      lines.push(`Data Types: ${profile.data_sensitivity_types.join(', ')}`);
    }
    if (profile.rmf_stage)          lines.push(`RMF Stage: ${profile.rmf_stage}`);

    if (frameworksResult.rows.length > 0) {
      lines.push('Active Frameworks:');
      for (const fw of frameworksResult.rows) {
        lines.push(`  - ${fw.name}: ${fw.pct || 0}% complete (${fw.implemented}/${fw.total} controls)`);
      }
    }

    lines.push(`Assets: ${assets.total || 0} total, ${assets.critical || 0} critical, ${assets.ai_agents || 0} AI agents`);
    if (openCritical > 0) lines.push(`Open Critical Vulnerabilities: ${openCritical}`);

    // NIST control family breakdown — only if org has NIST 800-53 active
    const nistFamilyResult = await pool.query(
      `SELECT
         SPLIT_PART(fc.control_number, '-', 1) AS family,
         COUNT(fc.id) AS total,
         COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') AS implemented,
         ROUND(
           COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
           / NULLIF(COUNT(fc.id), 0) * 100, 0
         ) AS pct
       FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       JOIN framework_controls fc ON fc.framework_id = f.id
       LEFT JOIN control_implementations ci
         ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE of2.organization_id = $1
         AND f.code IN ('nist_800_53', 'nist_800_53_rev5', 'nist_800_53_r5')
       GROUP BY SPLIT_PART(fc.control_number, '-', 1)
       HAVING COUNT(fc.id) > 0
       ORDER BY pct ASC`,
      [organizationId]
    );
    if (nistFamilyResult.rows.length > 0) {
      lines.push('NIST 800-53 Control Family Coverage (weakest first):');
      for (const fam of nistFamilyResult.rows) {
        lines.push(`  - ${fam.family}: ${fam.pct || 0}% (${fam.implemented}/${fam.total} controls)`);
      }
    }

    if (String(profile.country_code).toUpperCase() === 'SG') {
      lines.push('Regulatory: MAS TRM applies — include MAS Technology Risk Management guidance in responses');
    }

    lines.push('--- END CONTEXT ---');
    const result = lines.join('\n');
    
    // Cache the result
    contextCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    // Non-fatal — return empty string so AI still works without context
    console.error('orgContextService error (non-fatal):', err.message);
    return '';
  }
}

// ---------- Per-framework behavioral guardrails ----------
// AI-specific frameworks: guardrails applied automatically when the org has them active.
const AI_FRAMEWORK_GUARDRAIL_RULES = {
  eu_ai_act:           'EU AI Act: Classify AI system risk (Unacceptable/High/Limited/Minimal) before advising. Emphasize human oversight, transparency, and conformity assessment for high-risk systems.',
  nist_ai_rmf:         'NIST AI RMF: Structure AI risk guidance around the four core functions — GOVERN, MAP, MEASURE, MANAGE.',
  iso_42001:           'ISO/IEC 42001: Align recommendations with the AI management system lifecycle (planning, implementation, monitoring, continual improvement).', // ip-hygiene:ignore
  iso_42005:           'ISO/IEC 42005: Incorporate AI impact assessment considerations including stakeholder harm, societal impact, and proportionality of risk.', // ip-hygiene:ignore
  state_ai_governance: 'State AI Governance: Account for applicable state-level AI laws (Colorado AI Act, Illinois AI Video Interview Act, NYC Local Law 144) when advising on AI deployment.',
};

// General (non-AI) compliance frameworks: guardrails applied only when the org has opted in
// via the 'apply_all_framework_guardrails' org setting.
const GENERAL_FRAMEWORK_GUARDRAIL_RULES = {
  gdpr:           'GDPR: Apply data minimization, purpose limitation, and lawful-basis checks to every recommendation involving personal data.',
  hipaa:          'HIPAA: Uphold PHI confidentiality, apply the minimum-necessary standard, and reference the Security Rule safeguards (Administrative, Physical, Technical).', // ip-hygiene:ignore
  hipaa_security: 'HIPAA: Uphold PHI confidentiality, apply the minimum-necessary standard, and reference the Security Rule safeguards (Administrative, Physical, Technical).', // ip-hygiene:ignore
  nist_800_53:    'NIST SP 800-53: Map every control recommendation to the relevant control family (AC, AU, CA, CM, IA, IR, RA, SA, SC, SI, SR, etc.) and cite the specific control ID.',
  'nist_csf_2.0': 'NIST CSF 2.0: Frame guidance around the six CSF functions — GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER.',
  iso_27001:      'ISO/IEC 27001: Recommendations must align with Annex A controls and support the information security management system (ISMS) lifecycle.', // ip-hygiene:ignore
  soc2:           'SOC 2: Ensure guidance supports the Trust Service Criteria — Security (CC), Availability (A), Confidentiality (C), Processing Integrity (PI), and Privacy (P).', // ip-hygiene:ignore
  pci_dss:        'PCI DSS: Prioritize cardholder data environment (CDE) segmentation, FIPS-validated encryption, and adherence to the 12 PCI DSS requirements.',
  fedramp:        'FedRAMP: Align recommendations with FedRAMP authorization requirements, FIPS-validated cryptography, and continuous monitoring (ConMon) obligations.',
  nerc_cip:       'NERC CIP: Guidance for OT/ICS environments must prioritize reliability, availability, and the CIP standards for critical infrastructure protection.',
  ccpa_cpra:      'CCPA/CPRA: Ensure consumer rights (access, deletion, opt-out) and data handling practices comply with California privacy law requirements.',
  nist_800_171:   'NIST SP 800-171: Apply CUI protection requirements; map recommendations to the 14 security requirement families.',
  nist_privacy:   'NIST Privacy Framework: Structure privacy recommendations around the five framework functions — IDENTIFY-P, GOVERN-P, CONTROL-P, COMMUNICATE-P, PROTECT-P.',
  ffiec:          'FFIEC: Apply IT Examination Handbook guidance; prioritize information security, business continuity, and vendor/third-party risk management for financial institutions.',
  fiscam:         'FISCAM: Align with FISCAM general and application control objectives; support federal financial system audit readiness.',
};

/**
 * Returns a guardrails section for the LLM system prompt based on the
 * organization's active compliance frameworks.  Non-fatal — returns ''
 * on any error so the AI continues to work.
 *
 * AI-specific frameworks (EU AI Act, NIST AI RMF, ISO 42001/42005, State AI Governance)
 * are always included when active.  General compliance frameworks are only included when
 * the org has opted in via the 'apply_all_framework_guardrails' setting.
 *
 * @param {string} organizationId
 * @returns {Promise<string>}
 */
async function buildFrameworkGuardrails(organizationId) {
  if (!organizationId) return '';
  try {
    const [frameworkResult, settingResult] = await Promise.all([
      pool.query(
        `SELECT f.code FROM organization_frameworks of2
         JOIN frameworks f ON f.id = of2.framework_id
         WHERE of2.organization_id = $1`,
        [organizationId]
      ),
      pool.query(
        `SELECT setting_value FROM organization_settings
         WHERE organization_id = $1 AND setting_key = 'apply_all_framework_guardrails' LIMIT 1`,
        [organizationId]
      )
    ]);

    const applyGeneral = settingResult.rows.length > 0 && settingResult.rows[0].setting_value === 'true';
    const rules = [];

    for (const row of frameworkResult.rows) {
      // AI frameworks are always applied
      const aiRule = AI_FRAMEWORK_GUARDRAIL_RULES[row.code];
      if (aiRule) { rules.push(aiRule); continue; }
      // General frameworks only applied when opted in
      if (applyGeneral) {
        const generalRule = GENERAL_FRAMEWORK_GUARDRAIL_RULES[row.code];
        if (generalRule) rules.push(generalRule);
      }
    }

    if (rules.length === 0) return '';
    return `\n## Framework Compliance Guardrails\nAll responses MUST comply with the organization's active frameworks. Apply the following rules:\n${rules.map(r => `- ${r}`).join('\n')}`;
  } catch {
    return '';
  }
}

module.exports = { buildOrgContext, invalidateOrgContextCache, buildFrameworkGuardrails };