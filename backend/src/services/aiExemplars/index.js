// @tier: community
'use strict';

/**
 * aiExemplars/index.js — loadExemplars + buildFewShotBlock.
 *
 * loadExemplars() reads a feature's curated exemplar JSON file and filters
 * out metadata entries (objects without an `output` field), so scanner
 * directives and notes can sit alongside exemplars in the same file without
 * polluting prompt composition.
 *
 * buildFewShotBlock() prepends the filtered exemplars and a 5-step
 * chain-of-thought reasoning instruction:
 *   scope -> assumptions -> key controls -> evidence expectations -> final structured output
 */

const fs = require('fs');
const path = require('path');

const EXEMPLAR_FILES = {
  gap_analysis: 'gap_analysis.json',
  remediation_playbook: 'remediation_playbook.json',
  test_procedures: 'test_procedures.json',
  evidence_suggestion: 'evidence_suggestion.json',
  evidence_suggest: 'evidence_suggestion.json', // alias
  finding: 'finding.json',
  audit_finding_draft: 'finding.json', // alias
};

const _cache = new Map();

function loadExemplars(featureKey) {
  if (!featureKey || !EXEMPLAR_FILES[featureKey]) return [];
  if (_cache.has(featureKey)) return _cache.get(featureKey);
  const file = path.join(__dirname, EXEMPLAR_FILES[featureKey]);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    _cache.set(featureKey, []);
    return [];
  }
  if (!Array.isArray(parsed)) {
    _cache.set(featureKey, []);
    return [];
  }
  // Drop metadata/scanner-directive entries that lack an `output` field.
  const filtered = parsed.filter(e => e && typeof e === 'object' && 'output' in e);
  _cache.set(featureKey, filtered);
  return filtered;
}

const COT_INSTRUCTION = [
  'Before producing the final answer, reason internally in five steps:',
  '  1. Restate the scope of the request.',
  '  2. Identify any assumptions you must make about the organization or environment.',
  '  3. List the key controls or framework references involved.',
  '  4. Outline the evidence expectations an auditor would have.',
  '  5. Produce the final structured output that satisfies the schema.',
  'Do not emit the intermediate reasoning. Emit only the final structured output.',
].join('\n');

function buildFewShotBlock(featureKey) {
  const exemplars = loadExemplars(featureKey);
  if (!exemplars.length) return '';
  const blocks = exemplars.map((ex, i) => {
    const inputStr = JSON.stringify(ex.input ?? {}, null, 2);
    const outputStr = JSON.stringify(ex.output, null, 2);
    return `Example ${i + 1}:\nInput:\n${inputStr}\nOutput:\n${outputStr}`;
  });
  return [COT_INSTRUCTION, '', 'Reference exemplars:', ...blocks].join('\n\n');
}

module.exports = {
  EXEMPLAR_FILES,
  loadExemplars,
  buildFewShotBlock,
  COT_INSTRUCTION,
};
