// @tier: enterprise
/**
 * Multi-Agent Orchestrator
 * Runs parallel compliance assessments across multiple AI agents,
 * aggregating results for comprehensive organizational insight.
 */

const llm = require('./llmService');
const modelRouter = require('./modelRouter');
const reasoningMemory = require('./reasoningMemory');
const { buildRagContext } = require('./orgRagService');

const AGENT_TIMEOUT_MS = 120_000; // 2-minute per-agent timeout

// Pre-defined agent swarm configurations
const SWARM_CONFIGS = {
  // Full compliance assessment — runs all major analyses in parallel
  full_assessment: {
    name: 'Full Compliance Assessment',
    description: 'Comprehensive parallel assessment: gap analysis, compliance forecast, risk heatmap, and audit readiness',
    agents: [
      { id: 'gap_analysis', fn: 'generateGapAnalysis', label: 'Gap Analysis' },
      { id: 'compliance_forecast', fn: 'forecastCompliance', label: 'Compliance Forecast' },
      { id: 'risk_heatmap', fn: 'generateRiskHeatmap', label: 'Risk Heatmap' },
      { id: 'audit_readiness', fn: 'assessAuditReadiness', label: 'Audit Readiness' }
    ]
  },
  // Quick risk check — fast parallel risk assessment
  risk_assessment: {
    name: 'Risk Assessment',
    description: 'Parallel risk-focused assessment: risk heatmap and gap analysis',
    agents: [
      { id: 'risk_heatmap', fn: 'generateRiskHeatmap', label: 'Risk Heatmap' },
      { id: 'gap_analysis', fn: 'generateGapAnalysis', label: 'Gap Analysis' }
    ]
  },
  // Audit preparation — get audit-ready fast
  audit_prep: {
    name: 'Audit Preparation',
    description: 'Parallel audit preparation: audit readiness, gap analysis, and crosswalk optimization',
    agents: [
      { id: 'audit_readiness', fn: 'assessAuditReadiness', label: 'Audit Readiness' },
      { id: 'gap_analysis', fn: 'generateGapAnalysis', label: 'Gap Analysis' },
      { id: 'crosswalk_optimizer', fn: 'optimizeCrosswalk', label: 'Crosswalk Optimization' }
    ]
  }
};

/**
 * Execute a predefined swarm of AI agents in parallel
 * @param {string} swarmType - Key from SWARM_CONFIGS (e.g., 'full_assessment')
 * @param {Object} params - { organizationId, provider, model }
 * @returns {Object} Aggregated results from all agents
 */
async function executeSwarm(swarmType, params) {
  const config = SWARM_CONFIGS[swarmType];
  if (!config) {
    throw new Error(`Unknown swarm type: ${swarmType}. Available: ${Object.keys(SWARM_CONFIGS).join(', ')}`);
  }

  return executeAgents(config.agents, params, config.name);
}

/**
 * Execute a custom set of agents in parallel
 * @param {Array} agents - Array of { id, fn, label } where fn is a llmService function name
 * @param {Object} params - { organizationId, provider, model }
 * @param {string} swarmName - Name for logging/tracking
 * @returns {Object} Aggregated results
 */
async function executeAgents(agents, params, swarmName = 'Custom') {
  const { organizationId, provider, model } = params;
  const startTime = Date.now();
  const correlationId = require('crypto').randomUUID();

  // Run all pre-enrichment steps in parallel for faster startup
  const [availableProviders, memoryContext, ragContext] = await Promise.all([
    getAvailableProviders(organizationId),
    reasoningMemory.buildMemoryContext({
      organizationId,
      feature: 'multi_agent',
      queryText: swarmName
    }).catch((e) => { console.warn('Swarm: failed to build memory context:', String(e?.message || e)); return ''; }),
    buildRagContext({
      organizationId,
      queryText: swarmName
    }).catch((e) => { console.warn('Swarm: failed to build RAG context:', String(e?.message || e)); return ''; })
  ]);

  // Merge enrichment context into params for agent prompts
  const enrichedParams = { ...params, ragContext: ragContext || '', memoryContext: memoryContext || '' };

  // Launch all agents in parallel
  const agentPromises = agents.map(async (agent) => {
    const agentStart = Date.now();
    // Declare routedParams outside try so it's accessible in catch
    let agentProvider = provider || 'unknown';
    let agentModel = model || null;
    try {
      // Use model router for optimal provider selection per agent
      const routedParams = { ...enrichedParams };
      const attempts = buildAgentAttempts({
        feature: agent.id,
        availableProviders,
        explicitProvider: provider || null,
        explicitModel: model || null
      });

      if (attempts.length === 0) {
        throw new Error('No available AI providers configured for this organization');
      }

      // Execute the analysis function
      const fn = llm[agent.fn];
      if (typeof fn !== 'function') {
        throw new Error(`Unknown analysis function: ${agent.fn}`);
      }

      let result;
      let finalError = null;

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        routedParams.provider = attempt.provider;
        routedParams.model = attempt.model;
        agentProvider = attempt.provider;
        agentModel = attempt.model;

        try {
          result = await Promise.race([
            fn(routedParams),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Agent ${agent.id} timed out after ${AGENT_TIMEOUT_MS / 1000}s`)), AGENT_TIMEOUT_MS)
            )
          ]);
          break;
        } catch (err) {
          finalError = err;
          const hasMoreAttempts = i < attempts.length - 1;
          if (!hasMoreAttempts || !isRetryableProviderError(err)) {
            throw err;
          }
        }
      }

      if (typeof result === 'undefined' && finalError) {
        throw finalError;
      }

      const durationMs = Date.now() - agentStart;

      // Record performance
      modelRouter.recordResult(agentProvider, durationMs, true);

      // Store reasoning from this result
      reasoningMemory.storeReasoning({
        organizationId,
        feature: agent.id,
        inputSummary: `${agent.label} for org ${organizationId}`,
        outputSummary: typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500),
        keyFindings: typeof result === 'string' ? extractFindings(result) : '',
        metadata: { correlationId, swarmName, durationMs, provider: agentProvider }
      }).catch(() => {}); // Non-blocking

      return {
        agentId: agent.id,
        label: agent.label,
        status: 'success',
        result,
        provider: agentProvider,
        model: agentModel,
        durationMs
      };
    } catch (err) {
      const durationMs = Date.now() - agentStart;
      modelRouter.recordResult(agentProvider, durationMs, false);

      return {
        agentId: agent.id,
        label: agent.label,
        status: 'error',
        error: err.message || 'Unknown error',
        durationMs
      };
    }
  });

  // Wait for all agents to complete (parallel execution)
  const results = await Promise.all(agentPromises);
  const totalDurationMs = Date.now() - startTime;

  // Aggregate
  const succeeded = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'error');

  return {
    swarmName,
    correlationId,
    organizationId,
    totalDurationMs,
    agentCount: agents.length,
    successCount: succeeded.length,
    failureCount: failed.length,
    memoryContextUsed: memoryContext.length > 0,
    ragContextUsed: ragContext.length > 0,
    agents: results
  };
}

/**
 * Get available swarm configurations
 * @returns {Object} Map of swarm types to their configs (without function references)
 */
function getSwarmConfigs() {
  const configs = {};
  for (const [key, config] of Object.entries(SWARM_CONFIGS)) {
    configs[key] = {
      name: config.name,
      description: config.description,
      agentCount: config.agents.length,
      agents: config.agents.map(a => ({ id: a.id, label: a.label }))
    };
  }
  return configs;
}

// ---------- Helpers ----------

/**
 * Get a map of available providers for an organization
 */
async function getAvailableProviders(organizationId) {
  try {
    const orgKeys = await llm.getAllOrgApiKeys(organizationId);
    const platformKeys = await llm.getAllPlatformApiKeys();
    
    return {
      claude: !!(orgKeys.claude || platformKeys.claude || process.env.ANTHROPIC_API_KEY),
      openai: !!(orgKeys.openai || platformKeys.openai || process.env.OPENAI_API_KEY),
      gemini: !!(orgKeys.gemini || platformKeys.gemini || process.env.GEMINI_API_KEY),
      grok: !!(orgKeys.grok || platformKeys.grok || process.env.XAI_API_KEY),
      groq: !!(orgKeys.groq || platformKeys.groq || process.env.GROQ_API_KEY),
      ollama: !!(orgKeys.ollama || platformKeys.ollama || process.env.OLLAMA_BASE_URL)
    };
  } catch {
    // Fallback: check env vars only
    return {
      claude: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      grok: !!process.env.XAI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      ollama: !!process.env.OLLAMA_BASE_URL
    };
  }
}

/**
 * Extract key findings from an AI analysis result for reasoning memory
 */
function extractFindings(text) {
  if (!text || typeof text !== 'string') return '';
  // Look for numbered findings, bullet points, or "key" sections
  const lines = text.split('\n');
  const findings = lines.filter(line => {
    const trimmed = line.trim();
    return (
      /^\d+\.\s/.test(trimmed) ||   // Numbered items
      /^[-*•]\s/.test(trimmed) ||    // Bullet points
      /critical|high.?risk|immediate|priority|gap|finding/i.test(trimmed)
    );
  });
  return findings.slice(0, 10).join('\n');
}

function isRetryableProviderError(err) {
  const message = (err && err.message ? String(err.message) : '').toLowerCase();
  return (
    message.includes('quota exceeded') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('temporarily unavailable') ||
    message.includes('timed out') ||
    message.includes('status 429') ||
    message.includes('status 503')
  );
}

function buildAgentAttempts({ feature, availableProviders, explicitProvider, explicitModel }) {
  const attempts = [];

  // Explicit provider/model path (respect user choice first)
  if (explicitProvider) {
    if (availableProviders[explicitProvider]) {
      attempts.push({ provider: explicitProvider, model: explicitModel || null });

      // Model downgrade fallback for Gemini Pro quota/rate-limit pressure
      if (explicitProvider === 'gemini' && explicitModel === 'gemini-3.1-pro-preview') {
        attempts.push({ provider: 'gemini', model: 'gemini-3.5-flash' });
      }
    }
  }

  // Auto-routed path with fallback chain
  const route = modelRouter.selectProvider(feature, availableProviders);
  if (route.provider && availableProviders[route.provider]) {
    attempts.push({ provider: route.provider, model: route.model || null });
  }

  // If routed to Gemini Pro, try Gemini Flash immediately before cross-provider fallback
  if (route.provider === 'gemini' && route.model === 'gemini-3.1-pro-preview' && availableProviders.gemini) {
    attempts.push({ provider: 'gemini', model: 'gemini-3.5-flash' });
  }

  const chain = modelRouter.getFallbackChain(feature, availableProviders);
  for (const fallback of chain) {
    attempts.push({ provider: fallback.provider, model: fallback.model || null });
  }

  // Explicitly add Groq as a resilient final fallback where available
  if (availableProviders.groq) {
    attempts.push({ provider: 'groq', model: 'openai/gpt-oss-120b' });
  }

  return dedupeAttempts(attempts);
}

function dedupeAttempts(attempts) {
  const seen = new Set();
  const unique = [];
  for (const attempt of attempts) {
    if (!attempt || !attempt.provider) continue;
    const key = `${attempt.provider}:${attempt.model || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(attempt);
  }
  return unique;
}

module.exports = {
  executeSwarm,
  executeAgents,
  getSwarmConfigs,
  getSwarmConfig: (type) => SWARM_CONFIGS[type] || null,
  SWARM_CONFIGS
};
