'use strict';

const {
  COMPLIANT_STATUSES,
  compliancePercentage,
  complianceAggregateSql
} = require('../src/services/complianceMetrics');

describe('compliancePercentage', () => {
  it('counts implemented, verified and crosswalk-satisfied controls as compliant', () => {
    expect(COMPLIANT_STATUSES).toEqual(['implemented', 'verified', 'satisfied_via_crosswalk']);
  });

  it('excludes Not Applicable controls from the denominator', () => {
    // 8 compliant of 10 in-scope controls, 2 of which are not applicable: 8 / 8.
    expect(compliancePercentage(8, 10, 2)).toBe(100);
    // Marking a control N/A must never lower the score.
    expect(compliancePercentage(5, 10, 1)).toBeGreaterThan(compliancePercentage(5, 10, 0));
  });

  it('rounds to one decimal place', () => {
    expect(compliancePercentage(1, 3, 0)).toBe(33.3);
  });

  it('returns 0 when nothing is applicable', () => {
    expect(compliancePercentage(0, 0, 0)).toBe(0);
    expect(compliancePercentage(0, 4, 4)).toBe(0);
  });
});

describe('complianceAggregateSql', () => {
  it('builds aggregates over the given aliases with the requested precision', () => {
    const sql = complianceAggregateSql({ fc: 'x', ci: 'y', precision: 2 });
    expect(sql.total).toBe('COUNT(DISTINCT x.id)');
    expect(sql.compliant).toContain("y.status IN ('implemented', 'verified', 'satisfied_via_crosswalk')");
    expect(sql.notApplicable).toContain("y.status = 'not_applicable'");
    expect(sql.percentage).toContain(', 2)');
  });
});
