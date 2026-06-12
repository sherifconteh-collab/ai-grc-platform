/**
 * AI usage logging, decision logging (high-stakes features), bias/framework
 * heuristics, usage counting/limits, and provider status reporting.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * The logic here is identical to the original inline definitions; only the
 * location has changed.
 */

'use strict';

const crypto = require('crypto');
const pool = require('../../config/database');
const { getAiUsageLimit } = require('../../config/tierPolicy');
const { PROVIDERS } = require('./providerConfig');

// ---------- Usage tracking ----------
/**
 * Log an AI call to ai_usage_log.
 * @param {string} organizationId
 * @param {string} userId
 * @param {string} feature
 * @param {string} provider
 * @param {string|null} model
 * @param {object} [opts] - Extended fields: success, errorMessage, tokensInput, tokensOutput,
 *                          resourceType, resourceId, ipAddress, durationMs, byokUsed
 */
async function logAIUsage(organizationId, userId, feature, provider, model, opts = {}) {
  const {
    success = true,
    errorMessage = null,
    tokensInput = null,
    tokensOutput = null,
    resourceType = null,
    resourceId = null,
    ipAddress = null,
    durationMs = null,
    byokUsed = false,
  } = opts;

  await pool.query(`
    INSERT INTO ai_usage_log
      (organization_id, user_id, feature, provider, model,
       success, error_message, tokens_input, tokens_output,
       resource_type, resource_id, ip_address, duration_ms, byok_used, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
  `, [organizationId, userId, feature, provider, model,
      success, errorMessage, tokensInput, tokensOutput,
      resourceType, resourceId, ipAddress, durationMs, byokUsed]);
}

// High-stakes features that warrant a full ai_decision_log entry
const HIGH_STAKES_FEATURES = new Set([
  'gap_analysis', 'compliance_forecast', 'remediation_playbook',
  'incident_response', 'executive_report', 'risk_heatmap', 'vendor_risk'
]);

// Map feature → primary regulatory framework for traceability
function inferRegulatoryFramework(feature) {
  switch (feature) {
    case 'gap_analysis':
    case 'compliance_forecast':
      return 'Multi-framework';
    case 'remediation_playbook':
    case 'incident_response':
      return 'NIST 800-53';
    case 'executive_report':
      return 'SOC 2';
    case 'risk_heatmap':
    case 'vendor_risk':
      return 'ISO 27001';
    default:
      return 'Multi-framework';
  }
}

/**
 * Lightweight heuristic bias detection on AI outputs.
 * Returns an array of flag objects: [{ type, severity, detail }]
 * Never throws — bias detection errors are swallowed.
 */
function detectBiasFlags(feature, outputText) {
  if (!outputText || typeof outputText !== 'string') return [];
  const flags = [];
  const text = outputText.toLowerCase();

  // Subjectivity signals in executive reports
  if (feature === 'executive_report') {
    const subjectiveTerms = ['significantly', 'extremely', 'very high', 'very low', 'clearly indicates'];
    for (const term of subjectiveTerms) {
      if (text.includes(term)) {
        flags.push({ type: 'subjectivity', severity: 'low', detail: `Output uses subjective qualifier "${term}" without quantitative basis.` });
        break;
      }
    }
  }

  // Vendor-specific naming without evidence in vendor risk
  if (feature === 'vendor_risk') {
    const vendorPattern = /\b(company|vendor|supplier|provider)\s+[A-Z][a-z]+\b/;
    if (vendorPattern.test(outputText)) {
      flags.push({ type: 'vendor_naming', severity: 'medium', detail: 'Output references specific named entities — verify findings are evidence-based, not assumption-based.' });
    }
  }

  // Recommendation inconsistency in remediation
  if (feature === 'remediation_playbook') {
    const frameworkCount = (text.match(/nist|iso|soc\s*2|hipaa|gdpr|pci/g) || []).length;
    if (frameworkCount > 4) {
      flags.push({ type: 'framework_inconsistency', severity: 'low', detail: `Output references ${frameworkCount} frameworks — verify recommendations are consistent across all.` });
    }
  }

  return flags;
}

/**
 * Write to ai_decision_log for high-stakes AI outputs.
 * Captures SHA-256 hashes of input and output for integrity verification.
 * @param {object} opts - { organizationId, feature, inputText, outputText, modelVersion, correlationId, sessionId, resourceType, resourceId }
 */
async function logAIDecision(organizationId, feature, inputText, outputText, opts = {}) {
  if (!HIGH_STAKES_FEATURES.has(feature)) return;
  try {
    const inputHash  = crypto.createHash('sha384').update(inputText  || '').digest('hex');
    const outputHash = crypto.createHash('sha384').update(outputText || '').digest('hex');
    const riskLevel  = ['incident_response', 'remediation_playbook'].includes(feature) ? 'high' : 'limited';
    const regulatoryFramework = inferRegulatoryFramework(feature);
    const biasFlags = detectBiasFlags(feature, outputText);

    // Ensure input/output are valid JSON before inserting into jsonb columns
    const safeInput  = (() => { try { JSON.parse(inputText  || '""'); return inputText  || '""'; } catch { return JSON.stringify({ text: inputText  || '' }); } })();
    const safeOutput = (() => { try { JSON.parse(outputText || '""'); return outputText || '""'; } catch { return JSON.stringify({ text: outputText || '' }); } })();

    await pool.query(`
      INSERT INTO ai_decision_log
        (organization_id, input_data, input_hash, output_data, output_hash,
         human_reviewed, risk_level, regulatory_framework, model_version,
         correlation_id, session_id, processing_timestamp, bias_flags, bias_reviewed,
         data_lineage)
      VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, false, $6, $7, $8, $9, $10, NOW(), $11::jsonb, false, $12)
    `, [
      organizationId,
      safeInput,
      inputHash,
      safeOutput,
      outputHash,
      riskLevel,
      regulatoryFramework,
      opts.modelVersion || null,
      opts.correlationId || null,
      opts.sessionId || null,
      JSON.stringify(biasFlags),
      opts.dataLineage || null
    ]);
  } catch (err) {
    // Non-critical — never block the response due to logging failure
    console.error('logAIDecision error:', err.message);
  }
}

async function getUsageCount(organizationId) {
  // Only count successful calls — failed attempts should not burn the monthly quota
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM ai_usage_log
    WHERE organization_id = $1
      AND created_at >= DATE_TRUNC('month', NOW())
      AND (success IS NULL OR success = true)
  `, [organizationId]);
  return parseInt(result.rows[0].count);
}

function getUsageLimit(tier) {
  return getAiUsageLimit(tier);
}

// ---------- Provider status ----------
function getProviderStatus(orgKeys = {}) {
  return {
    claude:  { available: !!orgKeys.claude, models: PROVIDERS.claude.models },
    openai:  { available: !!orgKeys.openai, models: PROVIDERS.openai.models },
    gemini:  { available: !!orgKeys.gemini, models: PROVIDERS.gemini.models },
    grok:    { available: !!orgKeys.grok, models: PROVIDERS.grok.models },
    groq:    { available: !!orgKeys.groq, models: PROVIDERS.groq.models },
    ollama:  { available: !!orgKeys.ollama, models: PROVIDERS.ollama.models }
  };
}

module.exports = {
  HIGH_STAKES_FEATURES,
  inferRegulatoryFramework,
  detectBiasFlags,
  logAIUsage,
  logAIDecision,
  getUsageCount,
  getUsageLimit,
  getProviderStatus,
};
