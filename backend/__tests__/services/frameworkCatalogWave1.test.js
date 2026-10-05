'use strict';

// Guards the Wave 1 catalog: FedRAMP Rev 5 baselines and the full SP 800-171 Rev 3 set.
const frameworks = require('../../scripts/lib/frameworks');

const byCode = (code) => frameworks.find((f) => f.code === code);

describe('framework catalog wave 1', () => {
  test('catalog holds 39 frameworks', () => {
    expect(frameworks).toHaveLength(39);
  });

  test.each([
    ['fedramp_low', 156],
    ['fedramp_moderate', 323],
    ['fedramp_high', 410],
    ['nist_800_171', 97],
  ])('%s has %i controls', (code, count) => {
    const fw = byCode(code);
    expect(fw).toBeDefined();
    expect(fw.controls).toHaveLength(count);
  });

  test('control ids are unique within each framework', () => {
    for (const fw of frameworks) {
      const ids = fw.controls.map((c) => c.control_id || c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
