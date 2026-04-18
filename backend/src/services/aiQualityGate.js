// @tier: community
'use strict';

/**
 * aiQualityGate.js — runQualityGate scores AI outputs 0–100 across four
 * dimensions: length, control citations, framework ID validity, and PII scrub.
 *
 * The control-citation regex deliberately omits the `\b` anchor in front of
 * non-word prefixes (`§`, `Art.`) so HIPAA and GDPR citations like
 * `§164.312(b)` and `Art. 32(1)(b)` are detected. The prior `\b\§...` pattern
 * never matched because `\b` requires a word-character transition and `§`
 * is non-word.
 */

const FRAMEWORK_PREFIX_PATTERNS = [
  // NIST 800-53 / 800-171 family codes: AC, AT, AU, AT, CA, CM, CP, IA, IR, MA,
  // MP, PE, PL, PS, RA, SA, SC, SI, SR, PM
  /\bNIST\s*800-\d+/i,
  /\b(AC|AT|AU|CA|CM|CP|IA|IR|MA|MP|PE|PL|PS|RA|SA|SC|SI|SR|PM)-\d+(\(\d+\))?\b/,
  // ISO 27001 controls: A.5.1.1 / Annex A
  /\bISO\s*27001/i,
  /\bA\.\d+(\.\d+){0,3}\b/,
  /\bAnnex\s*A\b/i,
  // SOC 2 trust services criteria
  /\b(CC|A1|C1|P\d?)[0-9]+(\.[0-9]+)*\b/,
  /\bSOC\s*2\b/i,
  // HIPAA: §164.312(b)
  /§\s*\d+(\.\d+)*(\([a-z0-9]+\))*/i,
  /\bHIPAA\b/i,
  // GDPR: Art. 32(1)(b)
  /\bArt\.?\s*\d+(\(\d+\))?(\([a-z]\))?/i,
  /\bGDPR\b/i,
];

const PII_PATTERNS = {
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // 13-19 digits with optional separators (Visa/MC/Amex/etc.)
  credit_card: /\b(?:\d[ -]*?){13,19}\b/g,
};

function _stringifyOutput(output) {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try { return JSON.stringify(output); } catch (_e) { return String(output); }
}

function _scoreLength(text, minChars) {
  const len = text.length;
  if (len >= minChars) return 100;
  if (minChars <= 0) return 100;
  return Math.round((len / minChars) * 100);
}

function _detectCitations(text) {
  const matches = new Set();
  for (const re of FRAMEWORK_PREFIX_PATTERNS) {
    const ms = text.match(re);
    if (ms) ms.forEach(m => matches.add(m.trim()));
  }
  return Array.from(matches);
}

function _detectPii(text) {
  const found = {};
  for (const [label, re] of Object.entries(PII_PATTERNS)) {
    const ms = text.match(re);
    if (ms && ms.length) found[label] = ms.length;
  }
  return found;
}

/**
 * @param {object} opts
 * @param {string|object} opts.output - Raw AI output (string or structured)
 * @param {number} [opts.minChars=200] - Length threshold for full marks
 * @param {string[]} [opts.knownFrameworkCodes] - Codes from organization_frameworks
 * @returns {{ score: number, breakdown: object, citations: string[], unknownCodes: string[], pii: object }}
 */
function runQualityGate({ output, minChars = 200, knownFrameworkCodes = [] } = {}) {
  const text = _stringifyOutput(output);

  const lengthScore = _scoreLength(text, minChars);
  const citations = _detectCitations(text);
  const citationScore = citations.length > 0 ? 100 : 0;

  // Cross-check citations against known framework codes (case-insensitive).
  const known = new Set((knownFrameworkCodes || []).map(c => String(c).toLowerCase()));
  const unknownCodes = known.size === 0
    ? []
    : citations.filter(c => !known.has(String(c).toLowerCase()));
  const frameworkScore = known.size === 0 || citations.length === 0
    ? citationScore
    : Math.round(((citations.length - unknownCodes.length) / citations.length) * 100);

  const pii = _detectPii(text);
  const piiCount = Object.values(pii).reduce((a, b) => a + b, 0);
  const piiScore = piiCount === 0 ? 100 : Math.max(0, 100 - piiCount * 25);

  const score = Math.round((lengthScore + citationScore + frameworkScore + piiScore) / 4);

  return {
    score,
    breakdown: {
      length: lengthScore,
      citations: citationScore,
      framework: frameworkScore,
      pii: piiScore,
    },
    citations,
    unknownCodes,
    pii,
  };
}

module.exports = {
  runQualityGate,
  FRAMEWORK_PREFIX_PATTERNS,
  PII_PATTERNS,
};
