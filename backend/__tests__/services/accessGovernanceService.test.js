'use strict';

/**
 * Tests for services/accessGovernanceService.js
 * Covers: effective-permission resolution, SoD rule matching, SoD violation
 * evaluation, and access simulation. Uses Jest module mocking — no real DB.
 */

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/services/subscriptionService', () => ({
  expireOrganizationTrialIfNeeded: jest.fn().mockResolvedValue(false)
}));
jest.mock('../../src/utils/encrypt', () => ({ decrypt: jest.fn((value) => value) }));

const pool = require('../../src/config/database');
const {
  resolveEffectivePermissions,
  findRuleViolations,
  evaluateSodViolations,
  simulateAccess
} = require('../../src/services/accessGovernanceService');

const ORG_ID = '11111111-1111-1111-1111-111111111111';

const SOD_RULES = [
  {
    id: 'rule-1',
    name: 'User provisioning combined with role administration',
    severity: 'high',
    conflicting_permissions: ['users.manage', 'roles.manage']
  },
  {
    id: 'rule-2',
    name: 'Control implementation combined with assessment execution',
    severity: 'medium',
    conflicting_permissions: ['controls.write', 'assessments.write']
  }
];

function mockQueries() {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM sod_rules')) {
      return { rows: SOD_RULES };
    }
    if (sql.includes('FROM users u')) {
      return {
        rows: [
          { id: 'u-admin', email: 'admin@test.com', primary_role: 'admin', is_active: true, roles: ['admin'], role_permissions: [] },
          { id: 'u-toxic', email: 'toxic@test.com', primary_role: 'user', is_active: true, roles: ['ops'], role_permissions: ['users.manage', 'roles.manage', 'dashboard.read'] },
          { id: 'u-clean', email: 'clean@test.com', primary_role: 'user', is_active: true, roles: ['viewer'], role_permissions: ['dashboard.read'] }
        ]
      };
    }
    if (sql.includes('FROM permissions ORDER BY')) {
      return {
        rows: [
          { name: 'controls.read', resource: 'controls', action: 'read', description: null },
          { name: 'controls.write', resource: 'controls', action: 'write', description: null },
          { name: 'assessments.write', resource: 'assessments', action: 'write', description: null }
        ]
      };
    }
    throw new Error(`Unexpected query in test: ${sql.slice(0, 80)}`);
  });
}

describe('resolveEffectivePermissions', () => {
  test('uses role_permissions rows exclusively when present', () => {
    const resolved = resolveEffectivePermissions('user', ['controls.read']);
    expect(resolved).toEqual(['controls.read']);
  });

  test('falls back to legacy role permissions when no rows exist', () => {
    const resolved = resolveEffectivePermissions('auditor', []);
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved).not.toContain('*');
  });

  test('primary role admin always implies wildcard', () => {
    expect(resolveEffectivePermissions('admin', [])).toContain('*');
    expect(resolveEffectivePermissions('admin', ['controls.read'])).toContain('*');
  });
});

describe('findRuleViolations', () => {
  test('flags a rule only when every conflicting permission is held', () => {
    expect(findRuleViolations(['users.manage', 'roles.manage'], SOD_RULES)).toHaveLength(1);
    expect(findRuleViolations(['users.manage'], SOD_RULES)).toHaveLength(0);
    expect(findRuleViolations([], SOD_RULES)).toHaveLength(0);
  });

  test('ignores rules with an empty conflicting set', () => {
    const rules = [{ id: 'r', name: 'empty', severity: 'low', conflicting_permissions: [] }];
    expect(findRuleViolations(['anything'], rules)).toHaveLength(0);
  });
});

describe('evaluateSodViolations', () => {
  beforeEach(() => mockQueries());

  test('reports toxic combinations and excludes wildcard holders', async () => {
    const result = await evaluateSodViolations(ORG_ID);

    expect(result.rules_evaluated).toBe(2);
    expect(result.wildcard_users).toEqual([{ user_id: 'u-admin', email: 'admin@test.com' }]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      user_id: 'u-toxic',
      rule_id: 'rule-1',
      severity: 'high'
    });
  });
});

describe('simulateAccess', () => {
  beforeEach(() => mockQueries());

  test('returns positive and negative results for a proposed permission set', async () => {
    const result = await simulateAccess(ORG_ID, { permissions: ['controls.read'] });

    expect(result.allowed_count).toBe(1);
    expect(result.denied_count).toBe(2);
    const allowedByName = Object.fromEntries(result.results.map((entry) => [entry.permission, entry.allowed]));
    expect(allowedByName['controls.read']).toBe(true);
    expect(allowedByName['controls.write']).toBe(false);
    expect(result.sod_violations).toHaveLength(0);
  });

  test('detects SoD violations in the proposed combination', async () => {
    const result = await simulateAccess(ORG_ID, { permissions: ['controls.write', 'assessments.write'] });

    expect(result.sod_violations).toHaveLength(1);
    expect(result.sod_violations[0].id).toBe('rule-2');
  });

  test('wildcard grants everything and skips SoD noise', async () => {
    const result = await simulateAccess(ORG_ID, { permissions: ['*'] });

    expect(result.wildcard).toBe(true);
    expect(result.denied_count).toBe(0);
    expect(result.sod_violations).toHaveLength(0);
  });
});
