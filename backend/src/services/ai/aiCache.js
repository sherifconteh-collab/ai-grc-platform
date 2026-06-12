/**
 * In-memory AI result caching and in-flight request deduplication.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * Module-level cache state (result cache, in-flight map, cleanup interval)
 * lives exactly here and nowhere else.
 */

'use strict';

// =====================================================================
// RESULT CACHING AND REQUEST DEDUPLICATION
// =====================================================================
// In-memory cache for AI analysis results with configurable TTL
// Prevents redundant AI calls when multiple users or components request the same analysis
const aiResultCache = new Map();
const aiInFlightRequests = new Map();
const AI_CACHE_TTL_MS = Math.max(1000, parseInt(process.env.AI_CACHE_TTL_MS || '300000', 10)); // Default 5 minutes, min 1 second
const AI_ERROR_CACHE_TTL_MS = 30 * 1000; // Cache errors for 30 seconds to prevent rapid retries

// Periodic cleanup of expired cache entries to prevent memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of aiResultCache.entries()) {
    const ttl = entry.error ? AI_ERROR_CACHE_TTL_MS : AI_CACHE_TTL_MS;
    if (now - entry.timestamp >= ttl) {
      aiResultCache.delete(key);
    }
  }
}, AI_CACHE_TTL_MS); // Run cleanup at same interval as TTL

// Allow graceful cleanup on shutdown
cleanupInterval.unref(); // Don't prevent process exit

/**
 * Wraps an AI function with caching and request deduplication
 * - Caches results for AI_CACHE_TTL_MS to prevent redundant AI API calls
 * - Caches errors for 30 seconds to prevent rapid retries during outages
 * - Deduplicates in-flight requests to prevent concurrent identical calls
 * 
 * @param {string} cacheKey - Unique key for this request (e.g., 'gap-analysis:orgId')
 * @param {Function} fn - Async function that returns the AI result
 * @returns {Promise<any>} The cached or freshly computed result
 */
async function withCacheAndDedup(cacheKey, fn) {
  // Check cache first
  const cached = aiResultCache.get(cacheKey);
  if (cached) {
    const ttl = cached.error ? AI_ERROR_CACHE_TTL_MS : AI_CACHE_TTL_MS;
    if (Date.now() - cached.timestamp < ttl) {
      if (cached.error) {
        throw new Error(cached.data);
      }
      return cached.data;
    }
  }

  // Check if request is already in flight
  const inFlight = aiInFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight; // Return the existing promise
  }

  // Execute the function and cache the promise
  const promise = (async () => {
    try {
      const result = await fn();
      // Cache the successful result
      aiResultCache.set(cacheKey, { data: result, timestamp: Date.now(), error: false });
      return result;
    } catch (err) {
      // Cache the error for a short period to prevent rapid retries
      aiResultCache.set(cacheKey, { data: err.message, timestamp: Date.now(), error: true });
      throw err;
    } finally {
      // Remove from in-flight requests
      aiInFlightRequests.delete(cacheKey);
    }
  })();

  aiInFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Invalidates the cache for a specific organization's AI results
 * Call this when org data changes significantly (e.g., control implementation updated)
 * 
 * @param {string} organizationId
 * @param {string} feature - Optional feature name to invalidate (e.g., 'gap-analysis')
 */
function invalidateAICache(organizationId, feature = null) {
  if (feature) {
    // Invalidate specific feature for this org — keys may include :provider:model suffixes
    const prefix = `${feature}:${organizationId}`;
    for (const key of aiResultCache.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        aiResultCache.delete(key);
      }
    }
  } else {
    // Invalidate all features for this org — match orgId anywhere in the key
    for (const key of aiResultCache.keys()) {
      if (key.includes(`:${organizationId}:`) || key.endsWith(`:${organizationId}`)) {
        aiResultCache.delete(key);
      }
    }
  }
}

/**
 * Cleanup function to stop background tasks
 * Call before process shutdown for graceful cleanup
 */
function cleanupAICache() {
  clearInterval(cleanupInterval);
  aiResultCache.clear();
  aiInFlightRequests.clear();
}

module.exports = {
  AI_CACHE_TTL_MS,
  withCacheAndDedup,
  invalidateAICache,
  cleanupAICache,
};
