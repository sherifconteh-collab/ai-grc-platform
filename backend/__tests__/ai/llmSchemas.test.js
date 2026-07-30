'use strict';

const {
  validate,
  validateFeatureOutput,
  parseJsonOutput,
  GAP_ANALYSIS_SCHEMA,
  EVIDENCE_SUGGESTION_SCHEMA,
  FINDING_SCHEMA,
  RBAC_ANALYSIS_SCHEMA,
  FEATURE_SCHEMAS
} = require('../../src/services/llmSchemas');
const rbacAnalysisExemplars = require('../../src/services/aiExemplars/rbac_analysis.json');

describe('llmSchemas.validate (recursive)', () => {
  test('flags missing top-level required property', () => {
    const r = validate(GAP_ANALYSIS_SCHEMA, { gaps: [], remediation_roadmap: {}, audit_readiness_score: 50 });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('executive_summary'))).toBe(true);
  });

  test('recurses into array items and reports path', () => {
    const data = {
      executive_summary: 'x'.repeat(120),
      audit_readiness_score: 70,
      remediation_roadmap: {},
      gaps: [
        { control_id: 'AC-2', framework: 'NIST', title: 'Ok', severity: 'high', description: 'd' },
        { control_id: 'AC-3', framework: 'NIST', title: 'Bad sev', severity: 'NOT_VALID', description: 'd' }
      ]
    };
    const r = validate(GAP_ANALYSIS_SCHEMA, data);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('gaps[1].severity'))).toBe(true);
  });

  test('passes when nested items satisfy all constraints', () => {
    const data = {
      executive_summary: 'x'.repeat(120),
      audit_readiness_score: 72,
      remediation_roadmap: { immediate: [], short_term: [], medium_term: [] },
      gaps: [
        { control_id: 'AC-2', framework: 'NIST', title: 'Access reviews', severity: 'medium', description: 'd' }
      ]
    };
    const r = validate(GAP_ANALYSIS_SCHEMA, data);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe('llmSchemas.validateFeatureOutput (feature key aliases)', () => {
  test('route key "evidence_suggest" resolves to EVIDENCE_SUGGESTION_SCHEMA', () => {
    const payload = {
      control_id: 'AC-2',
      evidence_items: [
        { title: 'Okta user export', description: 'export of users', collection_method: 'manual_export' }
      ]
    };
    const r = validateFeatureOutput('evidence_suggest', payload);
    expect(r.valid).toBe(true);
  });

  test('route key "audit_finding_draft" resolves to FINDING_SCHEMA and flags bad severity', () => {
    const payload = {
      title: 'Access review gap',
      severity: 'moderate', // invalid — schema expects medium/low/...
      criteria: 'NIST AC-2',
      condition: 'c',
      cause: 'c',
      effect: 'e',
      recommendation: 'r'
    };
    const r = validateFeatureOutput('audit_finding_draft', payload);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.toLowerCase().includes('severity'))).toBe(true);
  });
});

describe('llmSchemas.parseJsonOutput', () => {
  test('strips ```json fence', () => {
    const out = parseJsonOutput('```json\n{"a":1}\n```');
    expect(out).toEqual({ a: 1 });
  });
  test('recovers JSON object from prose+json mix', () => {
    const out = parseJsonOutput('Here you go: {"a":2} — done.');
    expect(out).toEqual({ a: 2 });
  });
  test('returns null for unparseable input', () => {
    expect(parseJsonOutput('not json at all')).toBeNull();
  });
});

describe('llmSchemas.EVIDENCE_SUGGESTION_SCHEMA shape alignment', () => {
  test('requires evidence_items with title/description/collection_method', () => {
    const r = validate(EVIDENCE_SUGGESTION_SCHEMA, {
      control_id: 'AC-2',
      evidence_items: [{ title: 'x' /* missing description and collection_method */ }]
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('description'))).toBe(true);
    expect(r.errors.some(e => e.includes('collection_method'))).toBe(true);
  });
});

describe('llmSchemas.FINDING_SCHEMA shape alignment', () => {
  test('accepts NIST observation/criteria/cause/effect contract', () => {
    const r = validate(FINDING_SCHEMA, {
      title: 'Access review cadence gap',
      severity: 'medium',
      criteria: 'NIST AC-2(3)',
      condition: '34 accounts stale',
      cause: 'manual process',
      effect: 'orphan access risk',
      recommendation: 'automate review workflow',
      related_controls: ['AC-2', 'AC-2(3)'],
      repeat_finding: false
    });
    expect(r.valid).toBe(true);
  });
});

describe('llmSchemas.RBAC_ANALYSIS_SCHEMA', () => {
  test('is registered under the rbac_analysis feature key', () => {
    expect(FEATURE_SCHEMAS.rbac_analysis).toBe(RBAC_ANALYSIS_SCHEMA);
  });

  test('both curated exemplars validate against the schema', () => {
    expect(rbacAnalysisExemplars.length).toBeGreaterThanOrEqual(2);
    rbacAnalysisExemplars.forEach((exemplar) => {
      const r = validate(RBAC_ANALYSIS_SCHEMA, exemplar.output);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  });

  test('flags a missing suggested_sod_rules array and an invalid severity enum', () => {
    const r = validate(RBAC_ANALYSIS_SCHEMA, {
      summary: 'x'.repeat(60),
      roles: [{ name: 'Ops', duties: ['x'], mapped_permissions: ['dashboard.read'] }],
      sod_conflicts: [
        { title: 'Bad conflict', description: 'd', severity: 'catastrophic' }
      ],
      gaps_and_risks: []
      // suggested_sod_rules intentionally omitted
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('suggested_sod_rules'))).toBe(true);
    expect(r.errors.some(e => e.includes('severity'))).toBe(true);
  });

  test('requires mapped_permissions on each role', () => {
    const r = validate(RBAC_ANALYSIS_SCHEMA, {
      summary: 'x'.repeat(60),
      roles: [{ name: 'Ops', duties: ['x'] }],
      sod_conflicts: [],
      suggested_sod_rules: [],
      gaps_and_risks: []
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('mapped_permissions'))).toBe(true);
  });
});
