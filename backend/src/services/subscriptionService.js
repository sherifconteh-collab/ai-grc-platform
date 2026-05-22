// @tier: pro
const pool = require('../config/database');
const { normalizeTier } = require('../config/tierPolicy');
const { log } = require('../utils/logger');

const VALID_PAID_TIERS = new Set(['pro', 'enterprise', 'govcloud']);
const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_TIER = 'enterprise';

function parseTrialDays(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TRIAL_DAYS;
  }
  return Math.min(365, Math.floor(parsed));
}

function getTrialConfig() {
  const configuredTier = normalizeTier(process.env.TRIAL_INITIAL_TIER || DEFAULT_TRIAL_TIER);
  const trialTier = configuredTier === 'community' ? DEFAULT_TRIAL_TIER : configuredTier;
  const trialDays = parseTrialDays(process.env.TRIAL_DAYS || DEFAULT_TRIAL_DAYS);
  return { trialTier, trialDays };
}

function getTrialSeedData() {
  const { trialTier, trialDays } = getTrialConfig();
  return {
    tier: trialTier,
    billingStatus: 'trial',
    trialSourceTier: trialTier,
    trialStatus: 'active',
    trialDays
  };
}

function normalizePaidTier(candidateTier) {
  const normalized = normalizeTier(candidateTier);
  if (!VALID_PAID_TIERS.has(normalized)) {
    return null;
  }
  return normalized;
}

async function expireOrganizationTrialIfNeeded(_options) {
  return false;
}

async function expireAllTrials(_options) {
  return 0;
}

const ENTITLED_FRAMEWORK_TIERS = Object.freeze({
  community:  ['community', 'pro', 'enterprise', 'govcloud'],
  pro:        ['community', 'pro', 'enterprise', 'govcloud'],
  enterprise: ['community', 'pro', 'enterprise', 'govcloud'],
  govcloud:   ['community', 'pro', 'enterprise', 'govcloud']
});

async function ensureOrgFrameworks(organizationId, _tier) {
  if (!organizationId) return;

  try {
    const existing = await pool.query(
      'SELECT 1 FROM organization_frameworks WHERE organization_id = $1 LIMIT 1',
      [organizationId]
    );
    if (existing.rows.length > 0) return;

    await pool.query(
      `INSERT INTO organization_frameworks (organization_id, framework_id)
       SELECT $1, f.id
       FROM frameworks f
       WHERE f.is_active = true
       ON CONFLICT (organization_id, framework_id) DO NOTHING`,
      [organizationId]
    );
  } catch (err) {
    log('warn', 'subscription.ensure_frameworks.failed', {
      organizationId,
      error: { message: err.message, code: err.code }
    });
  }
}

module.exports = {
  getTrialConfig,
  getTrialSeedData,
  normalizePaidTier,
  expireOrganizationTrialIfNeeded,
  expireAllTrials,
  ensureOrgFrameworks,
  ENTITLED_FRAMEWORK_TIERS
};

