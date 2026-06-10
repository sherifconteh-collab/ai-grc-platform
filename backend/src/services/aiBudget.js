// @tier: community
'use strict';

/**
 * Per-organization AI cost controls.
 *
 * Budget source (first match wins):
 *   1. organization_settings key 'ai_monthly_token_budget' (set via PUT /settings/llm)
 *   2. AI_MONTHLY_TOKEN_BUDGET env var (platform-wide default)
 * A budget of 0 (or unset) means unlimited — enforcement is opt-in so existing
 * deployments are unaffected.
 *
 * Usage is measured as SUM(tokens_input + tokens_output) from ai_usage_log for
 * the current calendar month (UTC). Both the budget and the usage are cached
 * for 60 seconds per org, so enforcement lags real spend by at most a minute.
 */

const pool = require('../config/database');
const { log } = require('../utils/logger');

const CACHE_TTL_MS = 60 * 1000;
const WARN_THRESHOLD = 0.8;

const budgetCache = new Map(); // orgId -> { value, expiresAt }
const usageCache = new Map();  // orgId -> { value, expiresAt }
const warnedThisWindow = new Map(); // orgId -> expiresAt (dedupe 80% warnings)

// Rough heuristic (~4 chars per token for English prose); used for pre-flight
// estimates where exact provider tokenization is unavailable.
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function cacheGet(map, key) {
  const hit = map.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  map.delete(key);
  return undefined;
}

function cacheSet(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getMonthlyTokenBudget(organizationId) {
  const cached = cacheGet(budgetCache, organizationId);
  if (cached !== undefined) return cached;

  let budget = 0;
  try {
    const result = await pool.query(
      `SELECT setting_value FROM organization_settings
       WHERE organization_id = $1 AND setting_key = 'ai_monthly_token_budget'`,
      [organizationId]
    );
    if (result.rows.length > 0) {
      budget = Math.max(0, parseInt(result.rows[0].setting_value, 10) || 0);
    } else {
      budget = Math.max(0, parseInt(process.env.AI_MONTHLY_TOKEN_BUDGET, 10) || 0);
    }
  } catch (err) {
    // Fail open: a budget lookup error must not take down AI features.
    log('warn', 'ai.budget.lookup_failed', { error: err.message });
    budget = 0;
  }

  cacheSet(budgetCache, organizationId, budget);
  return budget;
}

async function getCurrentMonthUsage(organizationId) {
  const cached = cacheGet(usageCache, organizationId);
  if (cached !== undefined) return cached;

  let used = 0;
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)), 0) AS used
       FROM ai_usage_log
       WHERE organization_id = $1
         AND created_at >= date_trunc('month', NOW())`,
      [organizationId]
    );
    used = Number(result.rows[0]?.used || 0);
  } catch (err) {
    log('warn', 'ai.budget.usage_lookup_failed', { error: err.message });
    used = 0;
  }

  cacheSet(usageCache, organizationId, used);
  return used;
}

/**
 * Returns { enforced, allowed, budget, used, remaining, percentUsed }.
 * When the budget is unlimited (0), enforced is false and allowed is true.
 * Logs a structured warning once per cache window when usage crosses 80%.
 */
async function checkBudget(organizationId) {
  const budget = await getMonthlyTokenBudget(organizationId);
  if (!budget) {
    return { enforced: false, allowed: true, budget: 0, used: null, remaining: null, percentUsed: null };
  }

  const used = await getCurrentMonthUsage(organizationId);
  const remaining = Math.max(0, budget - used);
  const percentUsed = Math.round((used / budget) * 100);
  const allowed = used < budget;

  if (allowed && used >= budget * WARN_THRESHOLD) {
    const warned = cacheGet(warnedThisWindow, organizationId);
    if (warned === undefined) {
      cacheSet(warnedThisWindow, organizationId, true);
      log('warn', 'ai.budget.threshold', {
        organizationId, budget, used, percentUsed
      });
    }
  }

  return { enforced: true, allowed, budget, used, remaining, percentUsed };
}

// Test hook: clears all caches so unit tests can vary pool mocks per case.
function _resetCaches() {
  budgetCache.clear();
  usageCache.clear();
  warnedThisWindow.clear();
}

module.exports = {
  estimateTokens,
  getMonthlyTokenBudget,
  getCurrentMonthUsage,
  checkBudget,
  _resetCaches
};
