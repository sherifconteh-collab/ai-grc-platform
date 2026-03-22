/**
 * Tier Policy — Community Edition
 *
 * In the community (self-hosted) edition every organization is treated as
 * having unlimited access.  The hosted ControlWeave product enforces
 * tier-based limits; this module provides sensible open defaults so the
 * rest of the codebase can call the same helpers without branching.
 *
 * Tier names (post migration 094):
 *   community  — free self-hosted (index 0)
 *   pro        — paid tier 1       (index 1)
 *   enterprise — paid tier 2       (index 2)
 *   govcloud   — gov cloud tier    (index 3)
 */

const TIER_ORDER = ['community', 'pro', 'enterprise', 'govcloud'];

function normalizeTier(raw) {
  const t = String(raw || 'community').trim().toLowerCase();
  return TIER_ORDER.includes(t) ? t : 'community';
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
