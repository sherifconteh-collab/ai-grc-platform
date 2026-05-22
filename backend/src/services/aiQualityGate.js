// @tier: community
'use strict';

/**
 * AI Quality Gate — post-generation validation for AI feature outputs.
 *
 * Runs each AI output through rule checks before it is returned to the caller:
 *   1. Minimum content length per section
 *   2. Presence of control citations where required
 *   3. No hallucinated framework IDs (validated against DB)
 *   4. Basic PII scrub (email, phone, SSN patterns)
 *
 * Returns a quality score (0-100) and a list of rule violations.
 * Callers can enforce a minimum score threshold before accepting the output.
 */

const pool = require('../config/database');
const { log } = require('../utils/logger');

// Known framework code prefixes for citation validation
const KNOWN_FRAMEWORK_PREFIXES = [
  'AC', 'AT', 'AU', 'CA', 'CM', 'CP', 'IA', 'IR', 'MA', 'MP', 'PE', 'PL', 'PM',
  'PS', 'PT', 'RA', 'SA', 'SC', 'SI', 'SR',   // NIST 800-53 families
  'A.', 'Annex',                                 // ISO 27001
  'CC', 'A1', 'C1', 'P',                         // SOC 2
  '§', 'Art.'                                    // GDPR / HIPAA
];

// PII patterns that should not appear in outbound AI responses
const PII_PATTERNS = [
  { label: 'email',  re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
  { label: 'ssn',    re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'phone',  re: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { label: 'credit_card', re: /\b(?:\d{4}[ -]?){3}\d{4}\b/g }
];

/**
 * Scrub known PII patterns from a text string.
 * Returns { text, scrubbed: boolean, labels: string[] }
 */
function scrubPii(text) {
  if (!text || typeof text !== 'string') return { text, scrubbed: false, labels: [] };
  let result = text;
  const labels = [];
  for (const { label, re } of PII_PATTERNS) {
    const before = result;
    result = result.replace(re, `[REDACTED_${label.toUpperCase()}]`);
    if (result !== before) labels.push(label);
  }
  return { text: result, scrubbed: labels.length > 0, labels };
}

/**
 * Check minimum length requirements for common section headers.
 * Returns a list of { section, required, actual } failures.
 */
function checkMinimumLength(text, minTotal = 200) {
  const failures = [];
  if (!text || typeof text !== 'string') {
    failures.push({ section: 'full_output', required: minTotal, actual: 0 });
    return failures;
  }
  if (text.trim().length < minTotal) {
    failures.push({ section: 'full_output', required: minTotal, actual: text.trim().length });
  }
  return failures;
}

/**
 * Check that the output contains at least one control ID citation
 * when expected (gap analysis, test procedures, etc.).
 */
function checkControlCitations(text) {
  if (!text || typeof text !== 'string') return false;
  return KNOWN_FRAMEWORK_PREFIXES.some(prefix => {
    // \b is a word-boundary anchor, which only matches at a word-char boundary.
    // Non-word prefixes (e.g. "§", "Art.") do not have a \w on either side, so we
    // must omit the \b when the prefix starts with a non-word character.
    const startsWithWordChar = /^\w/.test(prefix);
    const boundary = startsWithWordChar ? '\\b' : '';
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${boundary}${escaped}[\\w.-]{1,20}`, 'i');
    return pattern.test(text);
  });
}

/**
 * Validate framework IDs mentioned in the output against the DB.
 * Returns an array of framework codes that appear valid (present in DB).
 * This is a best-effort check — no hard failures on DB errors.
 *
 * @param {string} text
 * @param {string} organizationId
 */
async function validateFrameworkReferences(text, organizationId) {
  if (!text || !organizationId) return { valid: true, unknownCodes: [] };

  try {
    const frameworkResult = await pool.query(
      `SELECT DISTINCT f.code FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       WHERE of2.organization_id = $1`,
      [organizationId]
    );
    const orgFrameworkCodes = new Set(
      frameworkResult.rows.map(r => (r.code || '').toUpperCase())
    );

    // Extract framework-looking tokens (e.g. "NIST_800_53", "ISO_27001", "SOC_2")
    const matches = text.match(/\b(NIST[_\s]?[\w.-]+|ISO[_\s]?[\d]+|SOC[_\s]?\d|HIPAA|GDPR|CMMC|PCI[_\s-]?DSS)\b/gi) || [];
    const mentioned = [...new Set(matches.map(m => m.toUpperCase().replace(/[\s-]+/g, '_')))];

    // Only flag if the org has frameworks in DB but the mentioned ones don't appear
    if (orgFrameworkCodes.size > 0) {
      const unknownCodes = mentioned.filter(code => {
        // Check if any org framework code contains the mentioned string as a prefix
        return ![...orgFrameworkCodes].some(orgCode => orgCode.startsWith(code.substring(0, 4)));
      });
      return { valid: unknownCodes.length === 0, unknownCodes };
    }

    return { valid: true, unknownCodes: [] };
  } catch {
    return { valid: true, unknownCodes: [] };
  }
}

/**
 * Compute a quality score (0-100) for an AI output.
 *
 * Scoring rubric:
 *   - Meets minimum length (30 pts)
 *   - Contains control citations where required (25 pts)
 *   - Framework references check out (20 pts)
 *   - No PII detected (25 pts)
 */
async function scoreOutput({ feature, text, organizationId, requireCitations = false }) {
  const violations = [];
  let score = 100;

  // 1. Minimum length (30 pts)
  const lengthMin = feature === 'gap_analysis' ? 500 : 200;
  const lengthFailures = checkMinimumLength(text, lengthMin);
  if (lengthFailures.length > 0) {
    score -= 30;
    violations.push(...lengthFailures.map(f => ({ rule: 'min_length', ...f })));
  }

  // 2. Control citations (25 pts) — required for gap analysis, test procedures
  const citationRequired = requireCitations ||
    ['gap_analysis', 'test_procedures', 'remediation_playbook', 'evidence_suggestion'].includes(feature);
  if (citationRequired && !checkControlCitations(text)) {
    score -= 25;
    violations.push({ rule: 'missing_control_citations', feature });
  }

  // 3. Framework reference validation (20 pts)
  const refCheck = await validateFrameworkReferences(text, organizationId);
  if (!refCheck.valid && refCheck.unknownCodes.length > 0) {
    score -= 20;
    violations.push({ rule: 'hallucinated_framework_ids', codes: refCheck.unknownCodes });
  }

  // 4. PII scrub (25 pts)
  const piiResult = scrubPii(text);
  if (piiResult.scrubbed) {
    score -= 25;
    violations.push({ rule: 'pii_detected', labels: piiResult.labels });
  }

  return {
    score: Math.max(0, score),
    violations,
    piiScrubbed: piiResult.scrubbed,
    cleanText: piiResult.text
  };
}

/**
 * Run the quality gate on an AI output.
 * Returns { passed, score, violations, cleanText }.
 * The default minimum passing score is 60 (configurable via minScore param).
 *
 * @param {object} opts
 * @param {string} opts.feature          - Feature key
 * @param {string} opts.text             - Raw AI output text
 * @param {string} opts.organizationId   - Org context for framework validation
 * @param {number} opts.minScore         - Minimum acceptable score (default 60)
 * @param {boolean} opts.requireCitations - Force citation check (default false)
 */
async function runQualityGate({ feature, text, organizationId, minScore = 60, requireCitations = false }) {
  try {
    const result = await scoreOutput({ feature, text, organizationId, requireCitations });

    log('info', 'ai.quality_gate', {
      feature,
      organizationId,
      score: result.score,
      passed: result.score >= minScore,
      violations: result.violations.length,
      piiScrubbed: result.piiScrubbed
    });

    return {
      passed: result.score >= minScore,
      score: result.score,
      violations: result.violations,
      cleanText: result.cleanText
    };
  } catch (err) {
    log('warn', 'ai.quality_gate.error', { feature, organizationId, error: err.message });
    // Fail open — don't block the response on quality gate errors
    return { passed: true, score: 50, violations: [], cleanText: text };
  }
}

module.exports = {
  runQualityGate,
  scoreOutput,
  scrubPii,
  checkControlCitations,
  checkMinimumLength,
  validateFrameworkReferences
};
