'use strict';

const { loadExemplars, buildFewShotBlock, EXEMPLAR_FILES } = require('../src/services/aiExemplars');

describe('aiExemplars', () => {
  test('loadExemplars filters out metadata entries (no `output` field)', () => {
    const exemplars = loadExemplars('gap_analysis');
    expect(exemplars.length).toBeGreaterThan(0);
    expect(exemplars.every(e => 'output' in e)).toBe(true);
  });

  test('returns empty array for unknown feature', () => {
    expect(loadExemplars('does_not_exist_xyz')).toEqual([]);
  });

  test('aliases resolve to the same exemplar file', () => {
    expect(EXEMPLAR_FILES.evidence_suggest).toBe(EXEMPLAR_FILES.evidence_suggestion);
    expect(EXEMPLAR_FILES.audit_finding_draft).toBe(EXEMPLAR_FILES.finding);
  });

  test('buildFewShotBlock includes the 5-step CoT instruction', () => {
    const block = buildFewShotBlock('gap_analysis');
    expect(block).toMatch(/Restate the scope/);
    expect(block).toMatch(/identify any assumptions/i);
    expect(block).toMatch(/key controls/i);
    expect(block).toMatch(/evidence expectations/i);
    expect(block).toMatch(/structured output/i);
  });

  test('buildFewShotBlock returns empty string for feature with no exemplars', () => {
    expect(buildFewShotBlock('does_not_exist')).toBe('');
  });
});
