'use strict';

/**
 * Tests for services/aiBudget.js — per-org monthly AI token budget.
 * Mocks pg pool per testing.md (unit-only, no DB).
 */

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const pool = require('../../src/config/database');
const aiBudget = require('../../src/services/aiBudget');

const ORG = 'org-uuid-1';

function mockBudgetAndUsage(budgetRow, usedTokens) {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('organization_settings')) {
      return { rows: budgetRow === null ? [] : [{ setting_value: String(budgetRow) }] };
    }
    if (sql.includes('ai_usage_log')) {
      return { rows: [{ used: usedTokens }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  aiBudget._resetCaches();
  pool.query.mockReset();
  delete process.env.AI_MONTHLY_TOKEN_BUDGET;
});

describe('estimateTokens', () => {
  test('estimates roughly 4 chars per token and handles empty input', () => {
    expect(aiBudget.estimateTokens('')).toBe(0);
    expect(aiBudget.estimateTokens(null)).toBe(0);
    expect(aiBudget.estimateTokens('a'.repeat(400))).toBe(100);
    expect(aiBudget.estimateTokens('abc')).toBe(1);
  });
});

describe('checkBudget', () => {
  test('unlimited when no org setting and no env default', async () => {
    mockBudgetAndUsage(null, 0);
    const res = await aiBudget.checkBudget(ORG);
    expect(res).toEqual({ enforced: false, allowed: true, budget: 0, used: null, remaining: null, percentUsed: null });
  });

  test('allows when under budget and reports remaining', async () => {
    mockBudgetAndUsage(1000, 250);
    const res = await aiBudget.checkBudget(ORG);
    expect(res.enforced).toBe(true);
    expect(res.allowed).toBe(true);
    expect(res.budget).toBe(1000);
    expect(res.used).toBe(250);
    expect(res.remaining).toBe(750);
    expect(res.percentUsed).toBe(25);
  });

  test('blocks when usage reaches the budget', async () => {
    mockBudgetAndUsage(1000, 1000);
    const res = await aiBudget.checkBudget(ORG);
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test('blocks when usage exceeds the budget', async () => {
    mockBudgetAndUsage(1000, 1500);
    const res = await aiBudget.checkBudget(ORG);
    expect(res.allowed).toBe(false);
    expect(res.percentUsed).toBe(150);
  });

  test('falls back to AI_MONTHLY_TOKEN_BUDGET env default', async () => {
    process.env.AI_MONTHLY_TOKEN_BUDGET = '500';
    mockBudgetAndUsage(null, 100);
    const res = await aiBudget.checkBudget(ORG);
    expect(res.enforced).toBe(true);
    expect(res.budget).toBe(500);
    expect(res.allowed).toBe(true);
  });

  test('org setting overrides env default', async () => {
    process.env.AI_MONTHLY_TOKEN_BUDGET = '500';
    mockBudgetAndUsage(2000, 100);
    const res = await aiBudget.checkBudget(ORG);
    expect(res.budget).toBe(2000);
  });

  test('fails open (unlimited) when the budget lookup throws', async () => {
    pool.query.mockRejectedValue(new Error('db down'));
    const res = await aiBudget.checkBudget(ORG);
    expect(res.enforced).toBe(false);
    expect(res.allowed).toBe(true);
  });

  test('caches budget and usage within the TTL window', async () => {
    mockBudgetAndUsage(1000, 250);
    await aiBudget.checkBudget(ORG);
    await aiBudget.checkBudget(ORG);
    // 1 budget query + 1 usage query — second call served from cache
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
