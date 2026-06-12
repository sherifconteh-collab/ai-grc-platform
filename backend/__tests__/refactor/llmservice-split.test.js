'use strict';

/**
 * Regression tests for the llmService monolith split.
 *
 * services/llmService.js is now a thin facade over cohesive modules under
 * services/ai/. These tests lock in two contracts:
 *
 *   1. The facade's public export list is exactly the 58 symbols the
 *      original monolith exported (sorted, pinned by name).
 *   2. Every facade symbol is re-exported BY IDENTITY from the module that
 *      now owns it, so module-level state (caches, tracking context) cannot
 *      silently fork into two copies.
 *
 * No database is required — modules are only loaded, never invoked against
 * the pool.
 */

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

// Mock DB so require-time pool construction does not need DATABASE_URL.
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/encrypt', () => ({ decrypt: jest.fn(v => v) }));

const llm = require('../../src/services/llmService');

// ---------------------------------------------------------------------------
// 1. Facade export list (sorted) — the original monolith's 58 symbols
// ---------------------------------------------------------------------------
describe('llmservice-split: facade export list', () => {
  const EXPECTED_EXPORTS = [
    'FEATURE_TASK_PROFILE',
    'PROMPT_PROFILES',
    'PROVIDERS',
    'TASK_PROFILES',
    'analyzeAssetRisk',
    'analyzeControl',
    'analyzeQuestionnaireResponses',
    'analyzeVendorEvidence',
    'assessAuditReadiness',
    'assessVendorRisk',
    'buildFewShotBlock',
    'buildGrcSystem',
    'buildPersonalizedSystem',
    'chat',
    'chatStream',
    'checkAIGovernance',
    'cleanupAICache',
    'detectShadowIT',
    'forecastCompliance',
    'generateAuditFindingDraft',
    'generateAuditPbcDraft',
    'generateAuditWorkpaperDraft',
    'generateExecutiveReport',
    'generateGapAnalysis',
    'generateIAVMAssetAlert',
    'generateIncidentResponsePlan',
    'generatePolicy',
    'generateRemediationPlaybook',
    'generateRiskHeatmap',
    'generateTestProcedures',
    'generateVendorQuestionnaire',
    'generateVulnerabilityRemediation',
    'getAITrackingContext',
    'getAllOrgApiKeys',
    'getAllPlatformApiKeys',
    'getOrgApiKey',
    'getOrgDefaultModel',
    'getOrgDefaultProvider',
    'getPlatformApiKey',
    'getPlatformDefaultProvider',
    'getProviderStatus',
    'getUsageCount',
    'getUsageLimit',
    'invalidateAICache',
    'invalidateApiKeyCache',
    'invalidatePlatformApiKeyCache',
    'loadExemplars',
    'logAIDecision',
    'logAIUsage',
    'mapAssetsToControls',
    'monitorRegulatoryChanges',
    'optimizeCrosswalk',
    'queryCompliance',
    'recommendTraining',
    'resolveApiKey',
    'resolveTaskModel',
    'suggestEvidence',
    'withAITrackingContext',
  ];

  test('exports exactly the original 58 symbols', () => {
    expect(EXPECTED_EXPORTS).toHaveLength(58);
    expect(Object.keys(llm).sort()).toEqual(EXPECTED_EXPORTS);
  });

  test('every export is a function or config object (no undefined leaks)', () => {
    for (const key of Object.keys(llm)) {
      expect(llm[key]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Identity re-exports per extracted module
// ---------------------------------------------------------------------------
describe('llmservice-split: ai/exemplarLoader identity', () => {
  const exemplarLoader = require('../../src/services/ai/exemplarLoader');

  test('exports the expected symbols', () => {
    expect(Object.keys(exemplarLoader).sort()).toEqual([
      'buildFewShotBlock',
      'loadExemplars',
    ]);
  });

  test('facade re-exports by identity', () => {
    expect(llm.loadExemplars).toBe(exemplarLoader.loadExemplars);
    expect(llm.buildFewShotBlock).toBe(exemplarLoader.buildFewShotBlock);
  });

  test('exemplar files still resolve from services/aiExemplars', () => {
    // Path changed from __dirname/aiExemplars to __dirname/../aiExemplars —
    // pin that gap_analysis exemplars still load and are non-empty.
    const exemplars = exemplarLoader.loadExemplars('gap_analysis');
    expect(Array.isArray(exemplars)).toBe(true);
    expect(exemplars.length).toBeGreaterThan(0);
  });
});

describe('llmservice-split: ai/keyResolution identity', () => {
  const keyResolution = require('../../src/services/ai/keyResolution');

  test('exports the expected symbols', () => {
    expect(Object.keys(keyResolution).sort()).toEqual([
      'GEMINI_API_BASE',
      'PROVIDER_SETTING_KEY_MAP',
      'VALID_PROVIDERS',
      'getAllOrgApiKeys',
      'getAllPlatformApiKeys',
      'getClient',
      'getDefaultModelForProvider',
      'getOrgApiKey',
      'getOrgDefaultModel',
      'getOrgDefaultProvider',
      'getPlatformApiKey',
      'getPlatformDefaultProvider',
      'invalidateApiKeyCache',
      'invalidatePlatformApiKeyCache',
      'resolveApiKey',
    ]);
  });

  test('facade re-exports by identity', () => {
    expect(llm.getOrgApiKey).toBe(keyResolution.getOrgApiKey);
    expect(llm.getPlatformApiKey).toBe(keyResolution.getPlatformApiKey);
    expect(llm.resolveApiKey).toBe(keyResolution.resolveApiKey);
    expect(llm.getPlatformDefaultProvider).toBe(keyResolution.getPlatformDefaultProvider);
    expect(llm.getAllOrgApiKeys).toBe(keyResolution.getAllOrgApiKeys);
    expect(llm.getAllPlatformApiKeys).toBe(keyResolution.getAllPlatformApiKeys);
    expect(llm.invalidateApiKeyCache).toBe(keyResolution.invalidateApiKeyCache);
    expect(llm.invalidatePlatformApiKeyCache).toBe(keyResolution.invalidatePlatformApiKeyCache);
    expect(llm.getOrgDefaultProvider).toBe(keyResolution.getOrgDefaultProvider);
    expect(llm.getOrgDefaultModel).toBe(keyResolution.getOrgDefaultModel);
  });

  test('VALID_PROVIDERS holds the six supported providers', () => {
    expect([...keyResolution.VALID_PROVIDERS].sort())
      .toEqual(['claude', 'gemini', 'grok', 'groq', 'ollama', 'openai']);
  });

  test('getDefaultModelForProvider behavior is preserved', () => {
    expect(keyResolution.getDefaultModelForProvider('claude')).toBe('claude-haiku-4-5-20251001');
    expect(keyResolution.getDefaultModelForProvider('openai')).toBe('gpt-4o-mini');
    expect(keyResolution.getDefaultModelForProvider('nope')).toBeNull();
  });
});

describe('llmservice-split: ai/trackingContext identity', () => {
  const trackingContext = require('../../src/services/ai/trackingContext');

  test('exports the expected symbols', () => {
    expect(Object.keys(trackingContext).sort()).toEqual([
      'getAITrackingContext',
      'markAISuccess',
      'recordAIAttempt',
      'withAITrackingContext',
    ]);
  });

  test('facade re-exports by identity', () => {
    expect(llm.withAITrackingContext).toBe(trackingContext.withAITrackingContext);
    expect(llm.getAITrackingContext).toBe(trackingContext.getAITrackingContext);
  });

  test('withAITrackingContext wraps results and exposes attempt state', async () => {
    const { result, tracking } = await trackingContext.withAITrackingContext(async () => {
      trackingContext.recordAIAttempt('claude', 'model-x', true);
      trackingContext.markAISuccess('claude', 'model-x', 'openai');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(tracking.attempts).toHaveLength(1);
    expect(tracking.attempts[0]).toMatchObject({ provider: 'claude', model: 'model-x', available: true });
    expect(tracking.usedProvider).toBe('claude');
    expect(tracking.fallbackUsed).toBe(true);
  });

  test('getAITrackingContext returns null outside a tracking scope', () => {
    expect(trackingContext.getAITrackingContext()).toBeNull();
  });
});

describe('llmservice-split: ai/providerExec contract', () => {
  const providerExec = require('../../src/services/ai/providerExec');

  test('exports the expected symbols', () => {
    expect(Object.keys(providerExec).sort()).toEqual([
      'AI_MAX_RETRIES',
      'AI_RETRY_BASE_DELAY_MS',
      'PROVIDER_FALLBACK_ORDER',
      'buildNoKeyError',
      'buildProviderAttemptChain',
      'executeProviderChat',
      'isRetryableProviderError',
      'sleep',
    ]);
  });

  test('buildProviderAttemptChain puts the primary provider first, then the fallback order', () => {
    expect(providerExec.buildProviderAttemptChain('gemini'))
      .toEqual(['gemini', 'claude', 'openai', 'grok', 'groq', 'ollama']);
    expect(providerExec.buildProviderAttemptChain('not-a-provider'))
      .toEqual(['claude', 'openai', 'grok', 'gemini', 'groq', 'ollama']);
  });

  test('isRetryableProviderError matches throttling/transient messages only', () => {
    expect(providerExec.isRetryableProviderError(new Error('Rate limit exceeded'))).toBe(true);
    expect(providerExec.isRetryableProviderError(new Error('failed with status 429'))).toBe(true);
    expect(providerExec.isRetryableProviderError(new Error('invalid api key'))).toBe(false);
    expect(providerExec.isRetryableProviderError(null)).toBe(false);
  });

  test('buildNoKeyError returns a 400-coded error', () => {
    const err = providerExec.buildNoKeyError('claude');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('No API key configured for claude');
  });
});

describe('llmservice-split: ai/aiCache identity', () => {
  const aiCache = require('../../src/services/ai/aiCache');

  test('exports the expected symbols', () => {
    expect(Object.keys(aiCache).sort()).toEqual([
      'AI_CACHE_TTL_MS',
      'cleanupAICache',
      'invalidateAICache',
      'withCacheAndDedup',
    ]);
  });

  test('facade re-exports by identity', () => {
    expect(llm.invalidateAICache).toBe(aiCache.invalidateAICache);
    expect(llm.cleanupAICache).toBe(aiCache.cleanupAICache);
  });

  test('withCacheAndDedup caches results and deduplicates in-flight calls', async () => {
    const fn = jest.fn().mockResolvedValue('cached-value');
    const key = `split-test:${Date.now()}`;
    const [a, b] = await Promise.all([
      aiCache.withCacheAndDedup(key, fn),
      aiCache.withCacheAndDedup(key, fn),
    ]);
    expect(a).toBe('cached-value');
    expect(b).toBe('cached-value');
    expect(fn).toHaveBeenCalledTimes(1);
    // Subsequent call within TTL hits the cache, not fn
    const c = await aiCache.withCacheAndDedup(key, fn);
    expect(c).toBe('cached-value');
    expect(fn).toHaveBeenCalledTimes(1);
    aiCache.invalidateAICache(key.split(':')[1]);
  });
});

describe('llmservice-split: ai/usageLogging identity', () => {
  const usageLogging = require('../../src/services/ai/usageLogging');

  test('exports the expected symbols', () => {
    expect(Object.keys(usageLogging).sort()).toEqual([
      'HIGH_STAKES_FEATURES',
      'detectBiasFlags',
      'getProviderStatus',
      'getUsageCount',
      'getUsageLimit',
      'inferRegulatoryFramework',
      'logAIDecision',
      'logAIUsage',
    ]);
  });

  test('facade re-exports by identity', () => {
    expect(llm.logAIUsage).toBe(usageLogging.logAIUsage);
    expect(llm.logAIDecision).toBe(usageLogging.logAIDecision);
    expect(llm.getUsageCount).toBe(usageLogging.getUsageCount);
    expect(llm.getUsageLimit).toBe(usageLogging.getUsageLimit);
    expect(llm.getProviderStatus).toBe(usageLogging.getProviderStatus);
  });

  test('HIGH_STAKES_FEATURES set is preserved', () => {
    expect([...usageLogging.HIGH_STAKES_FEATURES].sort()).toEqual([
      'compliance_forecast',
      'executive_report',
      'gap_analysis',
      'incident_response',
      'remediation_playbook',
      'risk_heatmap',
      'vendor_risk',
    ]);
  });

  test('inferRegulatoryFramework mapping is preserved', () => {
    expect(usageLogging.inferRegulatoryFramework('gap_analysis')).toBe('Multi-framework');
    expect(usageLogging.inferRegulatoryFramework('remediation_playbook')).toBe('NIST 800-53');
    expect(usageLogging.inferRegulatoryFramework('executive_report')).toBe('SOC 2');
    expect(usageLogging.inferRegulatoryFramework('vendor_risk')).toBe('ISO 27001');
    expect(usageLogging.inferRegulatoryFramework('anything_else')).toBe('Multi-framework');
  });

  test('getProviderStatus reports availability from org keys', () => {
    const status = usageLogging.getProviderStatus({ claude: 'k' });
    expect(status.claude.available).toBe(true);
    expect(status.openai.available).toBe(false);
    expect(Object.keys(status).sort()).toEqual(['claude', 'gemini', 'grok', 'groq', 'ollama', 'openai']);
  });

  test('detectBiasFlags never throws and returns an array', () => {
    expect(usageLogging.detectBiasFlags('executive_report', 'This significantly improves things')).toEqual([
      expect.objectContaining({ type: 'subjectivity' }),
    ]);
    expect(usageLogging.detectBiasFlags('executive_report', null)).toEqual([]);
  });
});

describe('llmservice-split: ai/chatCore identity', () => {
  const chatCore = require('../../src/services/ai/chatCore');

  test('exports the expected symbols', () => {
    expect(Object.keys(chatCore).sort()).toEqual([
      'buildPersonalizedSystem',
      'chat',
      'chatStream',
      'compactJSON',
    ]);
  });

  test('facade re-exports by identity', () => {
    expect(llm.chat).toBe(chatCore.chat);
    expect(llm.chatStream).toBe(chatCore.chatStream);
    expect(llm.buildPersonalizedSystem).toBe(chatCore.buildPersonalizedSystem);
  });

  test('compactJSON strips formatting whitespace', () => {
    expect(chatCore.compactJSON({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}');
  });

  test('chat rejects non-array messages with a 400-coded error', async () => {
    await expect(chatCore.chat({ messages: 'not-an-array' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'messages must be an array' });
  });
});

describe('llmservice-split: ai/features identity', () => {
  const analysisFeatures = require('../../src/services/ai/features/analysisFeatures');
  const remediationFeatures = require('../../src/services/ai/features/remediationFeatures');
  const auditVendorFeatures = require('../../src/services/ai/features/auditVendorFeatures');

  test('analysisFeatures exports the expected symbols', () => {
    expect(Object.keys(analysisFeatures).sort()).toEqual([
      'assessAuditReadiness',
      'forecastCompliance',
      'generateExecutiveReport',
      'generateGapAnalysis',
      'generateRiskHeatmap',
      'monitorRegulatoryChanges',
      'optimizeCrosswalk',
      'queryCompliance',
      'recommendTraining',
    ]);
  });

  test('remediationFeatures exports the expected symbols', () => {
    expect(Object.keys(remediationFeatures).sort()).toEqual([
      'analyzeAssetRisk',
      'analyzeControl',
      'checkAIGovernance',
      'detectShadowIT',
      'generateIAVMAssetAlert',
      'generateIncidentResponsePlan',
      'generatePolicy',
      'generateRemediationPlaybook',
      'generateTestProcedures',
      'generateVulnerabilityRemediation',
      'mapAssetsToControls',
      'suggestEvidence',
    ]);
  });

  test('auditVendorFeatures exports the expected symbols', () => {
    expect(Object.keys(auditVendorFeatures).sort()).toEqual([
      'analyzeQuestionnaireResponses',
      'analyzeVendorEvidence',
      'assessVendorRisk',
      'generateAuditFindingDraft',
      'generateAuditPbcDraft',
      'generateAuditWorkpaperDraft',
      'generateVendorQuestionnaire',
    ]);
  });

  test('facade re-exports every feature function by identity', () => {
    for (const [name, fn] of Object.entries(analysisFeatures)) {
      expect(llm[name]).toBe(fn);
    }
    for (const [name, fn] of Object.entries(remediationFeatures)) {
      expect(llm[name]).toBe(fn);
    }
    for (const [name, fn] of Object.entries(auditVendorFeatures)) {
      expect(llm[name]).toBe(fn);
    }
  });
});

describe('llmservice-split: no-cycle guarantee', () => {
  test('no module under services/ai requires the llmService facade', () => {
    const fs = require('fs');
    const path = require('path');
    const aiDir = path.join(__dirname, '../../src/services/ai');
    const files = [];
    for (const entry of fs.readdirSync(aiDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const sub of fs.readdirSync(path.join(aiDir, entry.name))) {
          files.push(path.join(aiDir, entry.name, sub));
        }
      } else if (entry.name.endsWith('.js')) {
        files.push(path.join(aiDir, entry.name));
      }
    }
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/require\((['"]).*llmService\1\)/);
    }
  });
});
