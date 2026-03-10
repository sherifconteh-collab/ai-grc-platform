/**
 * Tier Policy — Community Edition
 *
 * In the community (self-hosted) edition every organization is treated as
 * having unlimited access.  The hosted ControlWeave product enforces
 * tier-based limits; this module provides sensible open defaults so the
 * rest of the codebase can call the same helpers without branching.
 */

const TIER_ORDER = ['free', 'starter', 'professional', 'enterprise'];

function normalizeTier(raw) {
  const t = String(raw || 'enterprise').trim().toLowerCase();
  return TIER_ORDER.includes(t) ? t : 'enterprise';
}

function tierLevel(tier) {
  const idx = TIER_ORDER.indexOf(normalizeTier(tier));
  return idx === -1 ? TIER_ORDER.length - 1 : idx;
}

function getFrameworkLimit(tier) {
  // Community edition: unlimited frameworks
  return 9999;
}

function shouldEnforceAiLimitForByok(/* tier */) {
  // Community edition: no BYOK rate limits when self-hosted
  return false;
}

function getByokPolicy(/* tier */) {
  return {
    allowed: true,
    monthlyLimit: null, // unlimited
    providers: ['anthropic', 'openai', 'gemini', 'grok', 'groq', 'ollama'],
  };
}

module.exports = {
  TIER_ORDER,
  normalizeTier,
  tierLevel,
  getFrameworkLimit,
  shouldEnforceAiLimitForByok,
  getByokPolicy,
};
