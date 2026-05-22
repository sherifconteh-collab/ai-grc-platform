const TIER_LEVELS = Object.freeze({
  community: 0,
  pro: 1,
  enterprise: 2,
  govcloud: 3
});

const TIER_LIMITS = Object.freeze({
  community: {
    frameworks: -1,
    aiRequestsPerMonth: -1,
    cmdbEnabled: true,
    cmdbAssetLimit: -1,
    cmdbEnvironmentLimit: -1
  },
  pro: {
    frameworks: -1,
    aiRequestsPerMonth: -1,
    cmdbEnabled: true,
    cmdbAssetLimit: -1,
    cmdbEnvironmentLimit: -1
  },
  enterprise: {
    frameworks: -1,
    aiRequestsPerMonth: -1,
    cmdbEnabled: true,
    cmdbAssetLimit: -1,
    cmdbEnvironmentLimit: -1
  },
  govcloud: {
    frameworks: -1,
    aiRequestsPerMonth: -1,
    cmdbEnabled: true,
    cmdbAssetLimit: -1,
    cmdbEnvironmentLimit: -1
  }
});

const DEFAULT_TIER = 'community';
const PAID_TIERS = Object.freeze(['pro', 'enterprise', 'govcloud']);

function normalizeTier(tier) {
  const value = String(tier || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TIER_LEVELS, value)) {
    return DEFAULT_TIER;
  }
  return value;
}

function tierLevel(tier) {
  return TIER_LEVELS[normalizeTier(tier)];
}

function getTierLimits(tier) {
  return TIER_LIMITS[normalizeTier(tier)] || TIER_LIMITS[DEFAULT_TIER];
}

function getFrameworkLimit(tier) {
  return getTierLimits(tier).frameworks;
}

function getAiUsageLimit(tier) {
  return getTierLimits(tier).aiRequestsPerMonth;
}

function canUseCmdb(tier) {
  return getTierLimits(tier).cmdbEnabled;
}

function getCmdbAssetLimit(tier) {
  return getTierLimits(tier).cmdbAssetLimit;
}

function getCmdbEnvironmentLimit(tier) {
  return getTierLimits(tier).cmdbEnvironmentLimit;
}

function getContactLimit(tier) {
  const limit = getTierLimits(tier).contactLimit;
  return Number.isFinite(limit) ? limit : -1;
}

function isTierAtLeast(currentTier, minTier) {
  return tierLevel(currentTier) >= tierLevel(minTier);
}

function isPaidTier(tier) {
  return PAID_TIERS.includes(normalizeTier(tier));
}

function parseTierList(raw, fallbackCsv) {
  const source = String(raw || fallbackCsv || '')
    .split(',')
    .map((tier) => normalizeTier(tier))
    .filter(Boolean);
  return new Set(source.length ? source : [normalizeTier(DEFAULT_TIER)]);
}

function getByokPolicy() {
  const legacyFlag = process.env.AI_LIMIT_APPLIES_TO_BYOK;
  if (typeof legacyFlag === 'string' && legacyFlag.trim().length > 0) {
    const enforce = legacyFlag.toLowerCase() === 'true';
    return {
      mode: enforce ? 'enforce_all' : 'bypass_all',
      enforceByokForTier: () => enforce
    };
  }

  const bypassTiers = parseTierList(
    process.env.AI_BYOK_BYPASS_TIERS,
    'community,pro,enterprise,govcloud'
  );

  return {
    mode: 'tiered',
    bypassTiers: Array.from(bypassTiers),
    enforceByokForTier: (tier) => !bypassTiers.has(normalizeTier(tier))
  };
}

function shouldEnforceAiLimitForByok(tier) {
  const policy = getByokPolicy();
  return policy.enforceByokForTier(tier);
}

module.exports = {
  DEFAULT_TIER,
  TIER_LEVELS,
  TIER_LIMITS,
  normalizeTier,
  tierLevel,
  getTierLimits,
  getFrameworkLimit,
  getAiUsageLimit,
  canUseCmdb,
  getCmdbAssetLimit,
  getCmdbEnvironmentLimit,
  getContactLimit,
  isTierAtLeast,
  isPaidTier,
  PAID_TIERS,
  getByokPolicy,
  shouldEnforceAiLimitForByok
};
