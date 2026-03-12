// @tier: community
/**
 * Multi-Model Router
 * Automatic provider/model selection based on task complexity, cost, and availability.
 * Optimizes across all configured LLM providers without manual routing.
 */

// Task complexity classification
const TASK_COMPLEXITY = {
  // Complex tasks — need premium models
  complex: [
    'gap_analysis', 'compliance_forecast', 'incident_response',
    'executive_report', 'vendor_risk', 'security_posture',
    'audit_readiness', 'regulatory_monitor'
  ],
  // Moderate tasks — mid-tier models work well
  moderate: [
    'crosswalk_optimizer', 'remediation_playbook', 'vulnerability_remediation',
    'risk_heatmap', 'policy_generator', 'asset_risk',
    'tprm_questionnaire_generate', 'tprm_responses_analyze',
    'audit_pbc_draft', 'audit_workpaper_draft', 'audit_finding_draft'
  ],
  // Simple tasks — fast/cheap models preferred
  simple: [
    'compliance_query', 'chat', 'control_analysis', 'evidence_suggest',
    'test_procedures', 'training_recommendations', 'shadow_it',
    'ai_governance', 'asset_control_mapping'
  ]
};

// Provider tiers for each complexity level (ordered by preference)
const ROUTING_STRATEGY = {
  complex: [
    { provider: 'claude', model: 'claude-sonnet-4-5-20250929' },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'grok', model: 'grok-4-latest' },
    { provider: 'gemini', model: 'gemini-2.5-pro' }
  ],
  moderate: [
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'claude', model: 'claude-haiku-4-5-20251001' },
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'grok', model: 'grok-3-latest' },
    { provider: 'groq', model: 'llama-3.3-70b-versatile' }
  ],
  simple: [
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'claude', model: 'claude-haiku-4-5-20251001' },
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'ollama', model: 'llama3.2' }
  ]
};

// Performance tracking — in-memory stats per provider
const providerStats = new Map();
const STATS_WINDOW_MS = 30 * 60 * 1000; // 30-minute rolling window
const ERROR_RATE_THRESHOLD = 0.5; // Skip provider if >50% error rate
const MIN_SAMPLES = 3; // Need at least 3 samples before judging
const MAX_STATS_PER_PROVIDER = 1000; // Cap entries to prevent unbounded growth

/**
 * Classify task complexity from feature name
 * @param {string} feature - The AI feature name (e.g., 'gap_analysis')
 * @returns {'complex'|'moderate'|'simple'}
 */
function classifyTask(feature) {
  if (TASK_COMPLEXITY.complex.includes(feature)) return 'complex';
  if (TASK_COMPLEXITY.moderate.includes(feature)) return 'moderate';
  return 'simple';
}

/**
 * Select the best provider/model for a task
 * @param {string} feature - The AI feature name
 * @param {Object} availableProviders - Map of provider -> boolean (has API key)
 * @param {Object} options - Optional overrides
 * @returns {{ provider: string, model: string, complexity: string, reason: string }}
 */
function selectProvider(feature, availableProviders = {}, options = {}) {
  // If user explicitly specified a provider, respect that
  if (options.preferredProvider && availableProviders[options.preferredProvider]) {
    return {
      provider: options.preferredProvider,
      model: options.preferredModel || null,
      complexity: classifyTask(feature),
      reason: 'user_specified'
    };
  }

  const complexity = classifyTask(feature);
  const strategy = ROUTING_STRATEGY[complexity] || ROUTING_STRATEGY.simple;

  for (const candidate of strategy) {
    // Check availability
    if (!availableProviders[candidate.provider]) continue;

    // Check performance stats
    const stats = getProviderStats(candidate.provider);
    if (stats.totalRequests >= MIN_SAMPLES && stats.errorRate > ERROR_RATE_THRESHOLD) {
      continue; // Skip unreliable provider
    }

    return {
      provider: candidate.provider,
      model: candidate.model,
      complexity,
      reason: 'auto_routed'
    };
  }

  // Fallback: pick any available provider
  for (const providerName of Object.keys(availableProviders)) {
    if (availableProviders[providerName]) {
      return {
        provider: providerName,
        model: null, // Use provider default
        complexity,
        reason: 'fallback'
      };
    }
  }

  return { provider: 'claude', model: null, complexity, reason: 'default' };
}

/**
 * Build a fallback chain for a task (ordered list of providers to try)
 * @param {string} feature - The AI feature name
 * @param {Object} availableProviders - Map of provider -> boolean
 * @returns {Array<{ provider: string, model: string }>}
 */
function getFallbackChain(feature, availableProviders = {}) {
  const complexity = classifyTask(feature);
  const strategy = ROUTING_STRATEGY[complexity] || ROUTING_STRATEGY.simple;
  return strategy.filter(c => availableProviders[c.provider]);
}

/**
 * Record a request result for performance tracking
 * @param {string} provider - Provider name
 * @param {number} durationMs - Request duration in milliseconds
 * @param {boolean} success - Whether the request succeeded
 */
function recordResult(provider, durationMs, success) {
  const now = Date.now();
  if (!providerStats.has(provider)) {
    providerStats.set(provider, []);
  }
  const stats = providerStats.get(provider);
  stats.push({ timestamp: now, durationMs, success });

  // Trim old entries outside the window
  const cutoff = now - STATS_WINDOW_MS;
  while (stats.length > 0 && stats[0].timestamp < cutoff) {
    stats.shift();
  }
  // Hard cap to prevent unbounded growth
  if (stats.length > MAX_STATS_PER_PROVIDER) {
    stats.splice(0, stats.length - MAX_STATS_PER_PROVIDER);
  }
}

/**
 * Get aggregated stats for a provider
 * @param {string} provider
 * @returns {{ avgLatencyMs: number, errorRate: number, totalRequests: number }}
 */
function getProviderStats(provider) {
  const now = Date.now();
  const cutoff = now - STATS_WINDOW_MS;
  const stats = (providerStats.get(provider) || []).filter(s => s.timestamp >= cutoff);

  if (stats.length === 0) {
    return { avgLatencyMs: 0, errorRate: 0, totalRequests: 0 };
  }

  const totalRequests = stats.length;
  const errors = stats.filter(s => !s.success).length;
  const avgLatencyMs = Math.round(
    stats.filter(s => s.success).reduce((sum, s) => sum + s.durationMs, 0) /
    Math.max(stats.filter(s => s.success).length, 1)
  );

  return {
    avgLatencyMs,
    errorRate: errors / totalRequests,
    totalRequests
  };
}

/**
 * Get routing dashboard data — all provider stats + routing config
 * @returns {Object}
 */
function getRoutingStatus() {
  const allStats = {};
  for (const [provider, _] of providerStats) {
    allStats[provider] = getProviderStats(provider);
  }
  return {
    taskComplexity: TASK_COMPLEXITY,
    routingStrategy: ROUTING_STRATEGY,
    providerPerformance: allStats,
    config: {
      statsWindowMinutes: STATS_WINDOW_MS / 60000,
      errorRateThreshold: ERROR_RATE_THRESHOLD,
      minSamples: MIN_SAMPLES
    }
  };
}

module.exports = {
  classifyTask,
  selectProvider,
  getFallbackChain,
  recordResult,
  getProviderStats,
  getRoutingStatus,
  TASK_COMPLEXITY,
  ROUTING_STRATEGY
};
