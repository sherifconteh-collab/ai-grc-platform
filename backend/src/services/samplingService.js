'use strict';

/**
 * Attribute sampling for tests of control operating effectiveness.
 *
 * Two methods:
 *   - frequencySampleSize: the frequency-and-risk table most SOX and A-123
 *     programs use for manual controls. The numbers are ControlWeave defaults
 *     that follow common audit practice; organizations can override the size
 *     on any test.
 *   - statisticalSampleSize: attribute sampling from the binomial distribution.
 *     Returns the smallest n whose upper deviation limit, at the expected number
 *     of deviations, does not exceed the tolerable rate at the chosen confidence.
 *     This reproduces the published attribute sampling tables (for example 59
 *     at 95% / 5% / 0%, 93 at 95% / 5% / 1%, 22 at 90% / 10% / 0%).
 *
 * selectSample picks items reproducibly from a seed, so a reviewer can re-run
 * the selection and get the same items.
 */

const crypto = require('crypto');

const FREQUENCIES = ['annual', 'quarterly', 'monthly', 'weekly', 'daily', 'recurring', 'as_needed'];
const RISK_LEVELS = ['low', 'moderate', 'high'];

// [low, moderate, high] risk of failure
const FREQUENCY_TABLE = Object.freeze({
  annual: [1, 1, 1],
  quarterly: [2, 2, 2],
  monthly: [2, 2, 3],
  weekly: [5, 10, 15],
  daily: [20, 30, 40],
  recurring: [25, 45, 60],
  as_needed: [25, 45, 60]
});

// Typical number of occurrences in a year, used when no population is given.
const ANNUAL_OCCURRENCES = Object.freeze({
  annual: 1, quarterly: 4, monthly: 12, weekly: 52, daily: 250, recurring: null, as_needed: null
});

const MAX_STATISTICAL_SAMPLE = 5000;

function frequencySampleSize({ frequency, riskLevel = 'moderate', controlType = 'manual', population = null }) {
  if (!FREQUENCIES.includes(frequency)) throw new RangeError(`Unknown frequency: ${frequency}`);
  if (!RISK_LEVELS.includes(riskLevel)) throw new RangeError(`Unknown risk level: ${riskLevel}`);
  if (controlType === 'automated') {
    return {
      sample_size: 1,
      method: 'frequency_table',
      basis: 'Automated control: test one instance of each configured scenario, relying on effective IT general controls over change management.'
    };
  }
  const base = FREQUENCY_TABLE[frequency][RISK_LEVELS.indexOf(riskLevel)];
  const cap = Number.isInteger(population) && population >= 0 ? population : ANNUAL_OCCURRENCES[frequency];
  const size = cap === null || cap === undefined ? base : Math.min(base, cap);
  return {
    sample_size: size,
    method: 'frequency_table',
    basis: `${frequency.replace('_', ' ')} control, ${riskLevel} risk of failure${size < base ? `, limited to a population of ${cap}` : ''}.`
  };
}

function logChoose(n, k) {
  let result = 0;
  for (let i = 1; i <= k; i += 1) result += Math.log(n - k + i) - Math.log(i);
  return result;
}

/** P(X <= k) for X ~ Binomial(n, p). */
function binomialCdf(k, n, p) {
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  let total = 0;
  for (let i = 0; i <= k; i += 1) {
    total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, total);
}

function statisticalSampleSize({ confidence = 0.95, tolerableRate = 0.05, expectedRate = 0, population = null }) {
  if (!(confidence > 0.5 && confidence < 1)) throw new RangeError('confidence must be between 0.5 and 1');
  if (!(tolerableRate > 0 && tolerableRate < 0.5)) throw new RangeError('tolerable_rate must be between 0 and 0.5');
  if (!(expectedRate >= 0 && expectedRate < tolerableRate)) throw new RangeError('expected_rate must be at least 0 and below the tolerable rate');
  const risk = 1 - confidence;
  for (let n = 1; n <= MAX_STATISTICAL_SAMPLE; n += 1) {
    const allowed = Math.max(0, Math.ceil(n * expectedRate - 1e-9));
    if (binomialCdf(allowed, n, tolerableRate) <= risk) {
      const adjusted = Number.isInteger(population) && population > 0
        ? Math.min(population, Math.ceil(n / (1 + n / population)))
        : n;
      return {
        sample_size: adjusted,
        unadjusted_sample_size: n,
        allowed_deviations: allowed,
        method: 'statistical',
        basis: `${Math.round(confidence * 100)}% confidence, ${+(tolerableRate * 100).toFixed(2)}% tolerable rate, ${+(expectedRate * 100).toFixed(2)}% expected rate${adjusted !== n ? `, finite population correction for ${population} items` : ''}.`
      };
    }
  }
  throw new RangeError('Sample size exceeds the supported maximum; widen the tolerable rate or lower the confidence.');
}

function seededRandom(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  let state = digest.readUInt32LE(0);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick sampleSize distinct items from 1..populationSize. Returns them sorted.
 * The same seed always yields the same selection.
 */
function selectSample(populationSize, sampleSize, seed) {
  if (!Number.isInteger(populationSize) || populationSize <= 0) return [];
  const count = Math.min(sampleSize, populationSize);
  const random = seededRandom(seed);
  const chosen = new Set();
  if (count > populationSize / 2) {
    // Partial Fisher-Yates when most of the population is selected.
    const items = Array.from({ length: populationSize }, (_, i) => i + 1);
    for (let i = 0; i < count; i += 1) {
      const j = i + Math.floor(random() * (populationSize - i));
      [items[i], items[j]] = [items[j], items[i]];
      chosen.add(items[i]);
    }
  } else {
    while (chosen.size < count) chosen.add(1 + Math.floor(random() * populationSize));
  }
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Suggested conclusion for a completed test. Statistical tests tolerate the
 * planned number of deviations; any exception in a table-sized sample makes
 * the control ineffective unless the reviewer documents otherwise.
 */
function suggestConclusion({ exceptions, sampleMethod, allowedDeviations = 0 }) {
  if (exceptions === 0) return 'effective';
  if (sampleMethod === 'statistical' && exceptions <= allowedDeviations) return 'effective_with_exceptions';
  return 'ineffective';
}

module.exports = {
  FREQUENCIES,
  RISK_LEVELS,
  FREQUENCY_TABLE,
  frequencySampleSize,
  statisticalSampleSize,
  binomialCdf,
  selectSample,
  suggestConclusion
};
