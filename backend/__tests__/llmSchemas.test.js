'use strict';

const {
  GAP_ANALYSIS_SCHEMA,
  REMEDIATION_PLAYBOOK_SCHEMA,
  FINDING_SCHEMA,
  validate,
  formatErrorsForRetry,
  getSchemaForFeature,
} = require('../src/services/llmSchemas');

describe('llmSchemas.validate (recursive)', () => {
  test('accepts a fully valid gap_analysis payload', () => {
    const value = {
      readiness_score: 70,
      summary: 'Acceptable readiness with documented gaps.',
      gaps: [
        { control: 'AC-2(3)', severity: 'high', description: 'Inactive accounts not disabled.' },
      ],
      recommended_roadmap: ['Implement HRIS-driven deprovisioning.'],
    };
    const r = validate(GAP_ANALYSIS_SCHEMA, value);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('detects nested array-item violations (the v3.0.0 regression)', () => {
    const value = {
      readiness_score: 70,
      summary: 'Test.',
      gaps: [
        { control: 'AC-2(3)', severity: 'urgent' },
      ],
      recommended_roadmap: [],
    };
    const r = validate(GAP_ANALYSIS_SCHEMA, value);
    expect(r.valid).toBe(false);
    const paths = r.errors.map(e => e.instancePath);
    expect(paths).toContain('/gaps/0');
    expect(r.errors.some(e => /must be one of/.test(e.message))).toBe(true);
  });

  test('flags out-of-range numeric fields', () => {
    const value = { readiness_score: 150, summary: 'x', gaps: [], recommended_roadmap: [] };
    const r = validate(GAP_ANALYSIS_SCHEMA, value);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /must be <= 100/.test(e.message))).toBe(true);
  });

  test('descends into deeply nested object properties', () => {
    const value = { objective: 'Fix MFA.', steps: [{ order: 0, action: '' }] };
    const r = validate(REMEDIATION_PLAYBOOK_SCHEMA, value);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.instancePath.startsWith('/steps/0'))).toBe(true);
  });

  test('formatErrorsForRetry produces a stable correction-hint string', () => {
    const r = validate(FINDING_SCHEMA, { criteria: 'x' });
    expect(r.valid).toBe(false);
    const hint = formatErrorsForRetry(r.errors);
    expect(hint).toMatch(/did not validate/);
    expect(hint).toMatch(/respond again with valid JSON/);
  });

  test('feature aliases resolve to the right schema', () => {
    expect(getSchemaForFeature('evidence_suggest')).toBe(getSchemaForFeature('evidence_suggestion'));
    expect(getSchemaForFeature('audit_finding_draft')).toBe(getSchemaForFeature('finding'));
    expect(getSchemaForFeature('does_not_exist')).toBeNull();
  });
});
