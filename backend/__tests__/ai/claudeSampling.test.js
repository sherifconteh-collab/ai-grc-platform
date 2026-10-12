'use strict';

/**
 * Claude 4.7 and later reject a non-default temperature with HTTP 400. These
 * tests pin which model IDs receive a temperature. llmService calls
 * claudeAcceptsSampling before adding temperature to a Claude request.
 */

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/encrypt', () => ({ decrypt: jest.fn(v => v) }));

const { claudeAcceptsSampling, PROVIDERS, TASK_PROFILES } = require('../../src/services/ai/providerConfig');

describe('claudeAcceptsSampling', () => {
  test.each([
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-6',
    'claude-sonnet-4-20250514',
    'claude-opus-4-6',
    'claude-opus-4-5-20251101',
    'claude-3-5-haiku-20241022'
  ])('%s accepts temperature', (model) => {
    expect(claudeAcceptsSampling(model)).toBe(true);
  });

  test.each([
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-haiku-5-5',
    'claude-mythos-5',
    'some-future-model',
    '',
    null,
    undefined
  ])('%s does not get a temperature', (model) => {
    expect(claudeAcceptsSampling(model)).toBe(false);
  });

  test('every Claude default in the catalog is classified deliberately', () => {
    const ids = new Set([
      ...PROVIDERS.claude.models,
      ...Object.values(TASK_PROFILES).map(p => p.models.claude)
    ]);
    const accepting = [...ids].filter(claudeAcceptsSampling).sort();
    expect(accepting).toEqual([]);
  });
});
