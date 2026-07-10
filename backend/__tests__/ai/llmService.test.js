'use strict';

/**
 * Unit tests for services/llmService.js — prompt builder utilities,
 * model tiering, and few-shot exemplar loading.
 * These tests do NOT make real API calls.
 */

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

// Mock DB so require-time queries don't fail
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
// Mock encrypt util
jest.mock('../../src/utils/encrypt', () => ({ decrypt: jest.fn(v => v) }));
// Mock aiSecurity
jest.mock('../../src/utils/aiSecurity', () => ({ scanForPHI: jest.fn(() => ({ detected: false })) }));

const {
  TASK_PROFILES,
  FEATURE_TASK_PROFILE,
  resolveTaskModel,
  buildFewShotBlock
} = require('../../src/services/llmService');

// ---------------------------------------------------------------------------
// Task profiles
// ---------------------------------------------------------------------------
describe('TASK_PROFILES', () => {
  test('defines reasoning, extraction, chat, and ideation profiles', () => {
    expect(TASK_PROFILES).toHaveProperty('reasoning');
    expect(TASK_PROFILES).toHaveProperty('extraction');
    expect(TASK_PROFILES).toHaveProperty('chat');
    expect(TASK_PROFILES).toHaveProperty('ideation');
  });

  test('reasoning uses temperature 0.4', () => {
    expect(TASK_PROFILES.reasoning.temperature).toBe(0.4);
  });

  test('extraction uses temperature 0.2', () => {
    expect(TASK_PROFILES.extraction.temperature).toBe(0.2);
  });

  test('ideation uses temperature 0.7', () => {
    expect(TASK_PROFILES.ideation.temperature).toBe(0.7);
  });

  test('reasoning uses Claude Sonnet for claude provider', () => {
    expect(TASK_PROFILES.reasoning.models.claude).toContain('sonnet');
  });

  test('extraction uses Claude Haiku for claude provider', () => {
    expect(TASK_PROFILES.extraction.models.claude).toContain('haiku');
  });

  test('reasoning uses gpt-5.5 for openai provider', () => {
    expect(TASK_PROFILES.reasoning.models.openai).toBe('gpt-5.5');
  });

  test('extraction uses gpt-5.4-mini for openai provider', () => {
    expect(TASK_PROFILES.extraction.models.openai).toBe('gpt-5.4-mini');
  });
});

// ---------------------------------------------------------------------------
// FEATURE_TASK_PROFILE mapping
// ---------------------------------------------------------------------------
describe('FEATURE_TASK_PROFILE', () => {
  const reasoningFeatures = ['gap_analysis', 'remediation_playbook', 'compliance_forecast'];
  const extractionFeatures = ['evidence_suggestion', 'test_procedures', 'asset_control_mapping'];
  const chatFeatures = ['chat', 'compliance_query'];

  reasoningFeatures.forEach(f => {
    test(`${f} is a reasoning task`, () => {
      expect(FEATURE_TASK_PROFILE[f]).toBe('reasoning');
    });
  });

  extractionFeatures.forEach(f => {
    test(`${f} is an extraction task`, () => {
      expect(FEATURE_TASK_PROFILE[f]).toBe('extraction');
    });
  });

  chatFeatures.forEach(f => {
    test(`${f} is a chat task`, () => {
      expect(FEATURE_TASK_PROFILE[f]).toBe('chat');
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTaskModel
// ---------------------------------------------------------------------------
describe('resolveTaskModel', () => {
  test('returns task-profile model when no overrides provided', () => {
    const { model, temperature } = resolveTaskModel('claude', 'gap_analysis');
    expect(model).toContain('sonnet'); // reasoning → sonnet
    expect(temperature).toBe(0.4);
  });

  test('returns extraction model and temperature 0.2 for evidence_suggestion', () => {
    const { model, temperature } = resolveTaskModel('claude', 'evidence_suggestion');
    expect(model).toContain('haiku');
    expect(temperature).toBe(0.2);
  });

  test('callerModel overrides profile model but uses profile temperature', () => {
    const { model, temperature } = resolveTaskModel('claude', 'gap_analysis', 'custom-model-x');
    expect(model).toBe('custom-model-x');
    expect(temperature).toBe(0.4); // reasoning profile temperature preserved
  });

  test('orgModel overrides profile model but uses profile temperature', () => {
    const { model, temperature } = resolveTaskModel('openai', 'evidence_suggestion', null, 'org-custom-model');
    expect(model).toBe('org-custom-model');
    expect(temperature).toBe(0.2); // extraction profile temperature preserved
  });

  test('callerModel takes precedence over orgModel', () => {
    const { model } = resolveTaskModel('openai', 'gap_analysis', 'caller-model', 'org-model');
    expect(model).toBe('caller-model');
  });

  test('falls back gracefully for unknown feature', () => {
    const { model, temperature } = resolveTaskModel('claude', 'unknown_feature_xyz');
    // Should fall back to reasoning profile
    expect(model).toBeTruthy();
    expect(temperature).toBe(0.4);
  });
});

// ---------------------------------------------------------------------------
// buildFewShotBlock
// ---------------------------------------------------------------------------
describe('buildFewShotBlock', () => {
  test('returns non-empty string for gap_analysis (has exemplars)', () => {
    const block = buildFewShotBlock('gap_analysis');
    expect(typeof block).toBe('string');
    expect(block.length).toBeGreaterThan(0);
  });

  test('includes reasoning instruction in the block', () => {
    const block = buildFewShotBlock('gap_analysis');
    expect(block.toLowerCase()).toMatch(/reasoning|think through/i);
  });

  test('includes exemplar content for remediation_playbook', () => {
    const block = buildFewShotBlock('remediation_playbook');
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('EXAMPLE');
  });

  test('returns empty string for feature with no exemplar file', () => {
    const block = buildFewShotBlock('unknown_feature_with_no_file');
    expect(block).toBe('');
  });

  test('respects maxExemplars limit', () => {
    const block1 = buildFewShotBlock('gap_analysis', 1);
    const block2 = buildFewShotBlock('gap_analysis', 2);
    // One exemplar should produce shorter block than two
    expect(block2.length).toBeGreaterThan(block1.length);
  });
});
