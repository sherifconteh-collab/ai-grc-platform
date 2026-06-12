// @tier: community
/**
 * Public facade for the LLM service.
 *
 * The original monolith was split into cohesive modules under services/ai/:
 *   - ai/providerConfig    — provider + task-profile configuration
 *   - ai/prompts           — GRC system prompt templates and profiles
 *   - ai/exemplarLoader    — few-shot exemplar loading
 *   - ai/keyResolution     — BYOK key resolution, caches, provider clients
 *   - ai/trackingContext   — AsyncLocalStorage attempt/fallback tracking
 *   - ai/providerExec      — provider chat execution and retry utilities
 *   - ai/aiCache           — AI result caching and request deduplication
 *   - ai/usageLogging      — usage/decision logging and provider status
 *   - ai/chatCore          — sanitization, privacy controls, chat/chatStream
 *   - ai/features/*        — the AI feature functions (analysis, remediation,
 *                            auditor drafting, and TPRM vendor features)
 *
 * This module re-exports the exact same public API as before the split, by
 * identity, so no downstream require path changes are needed. Modules under
 * services/ai/ must never require this facade (no cycles).
 */

const {
  PROVIDERS,
  TASK_PROFILES,
  FEATURE_TASK_PROFILE,
  resolveTaskModel,
} = require('./ai/providerConfig');
const { PROMPT_PROFILES, buildGrcSystem } = require('./ai/prompts');
const { loadExemplars, buildFewShotBlock } = require('./ai/exemplarLoader');
const {
  getOrgApiKey,
  getPlatformApiKey,
  resolveApiKey,
  getPlatformDefaultProvider,
  getAllOrgApiKeys,
  getAllPlatformApiKeys,
  invalidateApiKeyCache,
  invalidatePlatformApiKeyCache,
  getOrgDefaultProvider,
  getOrgDefaultModel,
} = require('./ai/keyResolution');
const { withAITrackingContext, getAITrackingContext } = require('./ai/trackingContext');
const { invalidateAICache, cleanupAICache } = require('./ai/aiCache');
const {
  logAIUsage,
  logAIDecision,
  getUsageCount,
  getUsageLimit,
  getProviderStatus,
} = require('./ai/usageLogging');
const { chat, chatStream, buildPersonalizedSystem } = require('./ai/chatCore');
const {
  generateGapAnalysis,
  optimizeCrosswalk,
  forecastCompliance,
  monitorRegulatoryChanges,
  generateExecutiveReport,
  generateRiskHeatmap,
  assessAuditReadiness,
  queryCompliance,
  recommendTraining,
} = require('./ai/features/analysisFeatures');
const {
  generateRemediationPlaybook,
  generateVulnerabilityRemediation,
  generateIAVMAssetAlert,
  generateIncidentResponsePlan,
  mapAssetsToControls,
  detectShadowIT,
  checkAIGovernance,
  suggestEvidence,
  analyzeControl,
  generateTestProcedures,
  analyzeAssetRisk,
  generatePolicy,
} = require('./ai/features/remediationFeatures');
const {
  assessVendorRisk,
  generateAuditPbcDraft,
  generateAuditWorkpaperDraft,
  generateAuditFindingDraft,
  generateVendorQuestionnaire,
  analyzeQuestionnaireResponses,
  analyzeVendorEvidence,
} = require('./ai/features/auditVendorFeatures');

module.exports = {
  chat,
  chatStream,
  generateGapAnalysis,
  optimizeCrosswalk,
  forecastCompliance,
  monitorRegulatoryChanges,
  generateRemediationPlaybook,
  generateVulnerabilityRemediation,
  generateIAVMAssetAlert,
  generateIncidentResponsePlan,
  generateExecutiveReport,
  generateRiskHeatmap,
  assessVendorRisk,
  assessAuditReadiness,
  generateVendorQuestionnaire,
  analyzeQuestionnaireResponses,
  analyzeVendorEvidence,
  mapAssetsToControls,
  detectShadowIT,
  checkAIGovernance,
  queryCompliance,
  recommendTraining,
  suggestEvidence,
  analyzeControl,
  generateTestProcedures,
  analyzeAssetRisk,
  generatePolicy,
  generateAuditPbcDraft,
  generateAuditWorkpaperDraft,
  generateAuditFindingDraft,
  logAIUsage,
  logAIDecision,
  getUsageCount,
  getUsageLimit,
  getProviderStatus,
  getOrgApiKey,
  getPlatformApiKey,
  resolveApiKey,
  getPlatformDefaultProvider,
  getAllOrgApiKeys,
  getAllPlatformApiKeys,
  invalidateApiKeyCache,
  invalidatePlatformApiKeyCache,
  invalidateAICache,
  cleanupAICache,
  withAITrackingContext,
  getAITrackingContext,
  getOrgDefaultProvider,
  getOrgDefaultModel,
  buildPersonalizedSystem,
  buildGrcSystem,
  PROMPT_PROFILES,
  PROVIDERS,
  TASK_PROFILES,
  FEATURE_TASK_PROFILE,
  resolveTaskModel,
  buildFewShotBlock,
  loadExemplars,
};
