jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));

const rcm = require('../../src/services/financialAudit/rcm');
const { assertionCoverage, summarizeProcesses } = require('../../src/services/financialAudit/readiness');
const { planSampleSize } = require('../../src/services/financialAudit/testing');
const content = require('../../scripts/lib/frameworks/financialAudit');
const { render } = require('../../scripts/generate-financial-audit-migration');
const fs = require('fs');
const path = require('path');

describe('normalizeRcm', () => {
  const base = {
    control_ref: ' P2P-01 ', process: 'Procure_To_Pay', risk_statement: 'r', control_description: 'd',
    frequency: 'weekly', control_type: 'manual', assertions: 'Existence/Occurrence; completeness', key_control: 'yes'
  };

  test('normalizes enums, booleans and assertions', () => {
    const { values, errors } = rcm.normalizeRcm(base);
    expect(errors).toEqual([]);
    expect(values).toMatchObject({ control_ref: 'P2P-01', process: 'procure_to_pay', key_control: true, assertions: ['existence_occurrence', 'completeness'] });
  });

  test('reports unknown assertions and missing fields', () => {
    const { errors } = rcm.normalizeRcm({ ...base, assertions: 'completeness;made_up', risk_statement: '' });
    expect(errors.join(' ')).toMatch(/made_up/);
    expect(errors.join(' ')).toMatch(/risk_statement/);
  });

  test('partial updates only check supplied fields', () => {
    expect(rcm.normalizeRcm({ risk_level: 'high' }, { partial: true }).errors).toEqual([]);
    expect(rcm.normalizeRcm({ risk_level: 'extreme' }, { partial: true }).errors).toHaveLength(1);
  });
});

describe('planSampleSize', () => {
  const entry = { frequency: 'monthly', risk_level: 'high', control_type: 'manual' };
  test('frequency table by default', () => {
    expect(planSampleSize(entry, { test_type: 'operating_effectiveness' }).size).toBe(3);
  });
  test('walkthrough for design tests', () => {
    expect(planSampleSize(entry, { test_type: 'design' })).toMatchObject({ method: 'walkthrough', size: 1 });
  });
  test('statistical accepts percentages', () => {
    expect(planSampleSize(entry, { sample_method: 'statistical', confidence_level: 95, tolerable_rate: 5, expected_rate: 1 })).toMatchObject({ size: 93, allowed: 1 });
  });
  test('full population needs a population', () => {
    expect(() => planSampleSize(entry, { sample_method: 'full_population' })).toThrow(/population_size/);
  });
});

describe('readiness', () => {
  const matrix = [
    { process: 'procure_to_pay', key_control: true, assertions: ['existence_occurrence', 'completeness'], oe_conclusion: 'effective' },
    { process: 'procure_to_pay', key_control: true, assertions: ['valuation_allocation'], oe_conclusion: 'ineffective' },
    { process: 'it_general', key_control: true, assertions: [], oe_conclusion: null }
  ];
  test('finds assertion gaps for transaction cycles only', () => {
    const { gaps } = assertionCoverage(matrix);
    expect(gaps.map((g) => g.assertion).sort()).toEqual(['presentation_disclosure', 'rights_obligations']);
    expect(gaps.every((g) => g.process === 'procure_to_pay')).toBe(true);
  });
  test('summarizes key control results by process', () => {
    const [p2p, itgc] = summarizeProcesses(matrix);
    expect(p2p).toMatchObject({ key_controls: 2, effective: 1, ineffective: 1, not_tested: 0 });
    expect(itgc).toMatchObject({ process: 'it_general', not_tested: 1 });
  });
});

describe('financial audit content', () => {
  const all = [...content.FISCAM_ADDITIONS, ...content.NEW_FRAMEWORKS.flatMap((f) => f.controls)];

  test('every parent reference resolves within its framework', () => {
    const fiscamIds = new Set(['SM-1', 'SM-2', 'SM-3', 'SM-4', 'AC-FM-1', 'AC-FM-2', 'AC-FM-3', 'AC-FM-4', 'CC-1', 'CC-2', 'SC-1', 'CP-FM-1', ...content.FISCAM_ADDITIONS.map((c) => c.control_id)]);
    content.FISCAM_ADDITIONS.filter((c) => c.parent_control_id).forEach((c) => expect(fiscamIds.has(c.parent_control_id)).toBe(true));
    content.NEW_FRAMEWORKS.forEach((fw) => {
      const ids = new Set(fw.controls.map((c) => c.control_id));
      fw.controls.filter((c) => c.parent_control_id).forEach((c) => expect(ids.has(c.parent_control_id)).toBe(true));
    });
  });

  test('control ids are unique per framework', () => {
    expect(new Set(content.FISCAM_ADDITIONS.map((c) => c.control_id)).size).toBe(content.FISCAM_ADDITIONS.length);
    content.NEW_FRAMEWORKS.forEach((fw) => expect(new Set(fw.controls.map((c) => c.control_id)).size).toBe(fw.controls.length));
  });

  test('COSO lists all seventeen principles', () => {
    expect(content.COSO_2013.controls.filter((c) => /^COSO-P\d+$/.test(c.control_id))).toHaveLength(17);
  });

  test('migration 162 matches the content module', () => {
    const file = fs.readFileSync(path.join(__dirname, '../../migrations/162_financial_audit_content.sql'), 'utf8');
    expect(file).toBe(render());
    all.forEach((c) => expect(file).toContain(`$cw$${c.control_id}$cw$`));
  });
});
