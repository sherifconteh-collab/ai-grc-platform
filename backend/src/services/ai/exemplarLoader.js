/**
 * Few-shot exemplar loader for AI prompts.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * The logic is identical to the original inline definitions; only the
 * exemplar directory path is resolved relative to services/ (one level up)
 * because this module lives in services/ai/.
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// Few-shot exemplar loader
// Loads curated examples from services/aiExemplars/ JSON files.
// Each file contains 2-3 examples that are injected into AI prompts to set
// the quality bar and guide output structure.
// ---------------------------------------------------------------------------
const EXEMPLAR_CACHE = new Map();

function loadExemplars(feature) {
  if (EXEMPLAR_CACHE.has(feature)) return EXEMPLAR_CACHE.get(feature);
  try {
    const filePath = path.join(__dirname, '..', 'aiExemplars', `${feature}.json`);
    const data = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    // Filter out non-exemplar entries (e.g. metadata entries used to carry
    // IP-hygiene scanner directives). Real exemplars must have an `output` field.
    const exemplars = (Array.isArray(data) ? data : [])
      .filter(e => e && typeof e === 'object' && 'output' in e);
    EXEMPLAR_CACHE.set(feature, exemplars);
    return exemplars;
  } catch {
    EXEMPLAR_CACHE.set(feature, []);
    return [];
  }
}

/**
 * Build a few-shot exemplar block to prepend to the user message.
 * Includes a chain-of-thought reasoning instruction before output.
 *
 * @param {string} feature - Feature key (must match an aiExemplars/*.json file)
 * @param {number} [maxExemplars=2] - How many examples to include
 * @returns {string} Formatted exemplar + CoT block, or empty string if no exemplars
 */
function buildFewShotBlock(feature, maxExemplars = 2) {
  const exemplars = loadExemplars(feature).slice(0, maxExemplars);
  if (exemplars.length === 0) return '';

  const exampleLines = exemplars.map((ex, i) => {
    const outputStr = typeof ex.output === 'object'
      ? JSON.stringify(ex.output, null, 2)
      : String(ex.output);
    return `--- EXAMPLE ${i + 1} ---\nContext: ${ex.description || ex.input_summary || ''}\nHigh-quality output:\n${outputStr}`;
  }).join('\n\n');

  return `\n\n## Quality Exemplars\nThe following are examples of high-quality outputs for this type of analysis. Use them to calibrate your response quality, depth, and structure — do NOT copy them verbatim.\n\n${exampleLines}\n\n## Reasoning Approach\nBefore writing your response, think through:\n1. Scope and boundaries of the analysis\n2. Key assumptions about the organization's maturity\n3. Control intent and why gaps create real risk\n4. Priority ordering by business impact and remediation effort\n5. What specific evidence an auditor would need to close each gap\n\nThen produce your structured output.\n`;
}

module.exports = {
  loadExemplars,
  buildFewShotBlock,
};
