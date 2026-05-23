// @tier: enterprise
/**
 * Reasoning Memory Layer
 * Persistent semantic memory for AI analyses — agents learn from past findings
 * to provide increasingly accurate and context-aware compliance assessments.
 */

const crypto = require('crypto');
const pool = require('../config/database');

// In-memory reasoning cache with TTL
const reasoningCache = new Map();
const MEMORY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory
const DB_RETENTION_DAYS = parseInt(process.env.REASONING_MEMORY_RETENTION_DAYS || '30', 10);
const MAX_CONTEXT_ENTRIES = 5; // Max past entries to inject as context
const MAX_CACHE_KEYS = 500; // Max total cache keys to prevent unbounded growth

/**
 * Store a reasoning entry after an AI analysis completes
 */
async function storeReasoning({ organizationId, feature, inputSummary, outputSummary, keyFindings, metadata }) {
  // Create keywords from findings for later retrieval
  const keywords = extractKeywords(keyFindings || outputSummary || '');
  const entryId = crypto.randomUUID();
  
  const entry = {
    id: entryId,
    organizationId,
    feature,
    inputSummary: truncate(inputSummary, 500),
    outputSummary: truncate(outputSummary, 2000),
    keyFindings: truncate(keyFindings, 1000),
    keywords,
    metadata: metadata || {},
    createdAt: new Date()
  };

  // Cache in memory
  const cacheKey = `${organizationId}:${feature}`;
  const existing = reasoningCache.get(cacheKey) || [];
  existing.push(entry);
  // Keep only most recent entries in memory
  if (existing.length > 20) existing.shift();
  reasoningCache.set(cacheKey, existing);

  // Evict oldest cache keys if total exceeds limit (LRU-like)
  if (reasoningCache.size > MAX_CACHE_KEYS) {
    const firstKey = reasoningCache.keys().next().value;
    if (firstKey) reasoningCache.delete(firstKey);
  }

  // Persist to database (non-blocking, never fail the main flow)
  try {
    await pool.query(`
      INSERT INTO ai_reasoning_memory 
        (id, organization_id, feature, input_summary, output_summary, key_findings, keywords, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `, [entryId, organizationId, feature, entry.inputSummary, entry.outputSummary, entry.keyFindings, keywords.join(','), JSON.stringify(entry.metadata)]);
  } catch (err) {
    console.error('reasoningMemory.storeReasoning DB error:', err.message);
  }

  return entryId;
}

/**
 * Retrieve relevant past reasoning for context injection
 */
async function retrieveContext({ organizationId, feature, queryText, limit }) {
  const maxEntries = Math.min(limit || MAX_CONTEXT_ENTRIES, 10);
  
  // Try memory cache first
  const cacheKey = `${organizationId}:${feature}`;
  const cached = reasoningCache.get(cacheKey);
  if (cached && cached.length > 0) {
    const queryKeywords = extractKeywords(queryText || '');
    const scored = cached
      .map(entry => ({ ...entry, score: scoreRelevance(entry.keywords, queryKeywords) }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEntries);
    if (scored.length > 0) {
      return scored.map(formatContextEntry);
    }
  }

  // Fall back to database
  try {
    const queryKeywords = extractKeywords(queryText || '');
    if (queryKeywords.length === 0) {
      // No keywords — just get recent entries for this org+feature
      const result = await pool.query(`
        SELECT id, feature, input_summary, output_summary, key_findings, keywords, created_at
        FROM ai_reasoning_memory
        WHERE organization_id = $1 AND feature = $2
          AND created_at > NOW() - INTERVAL '1 day' * $3
        ORDER BY created_at DESC
        LIMIT $4
      `, [organizationId, feature, DB_RETENTION_DAYS, maxEntries]);
      return result.rows.map(formatDbRow);
    }

    // Keyword-based search using regex matching
    const keywordPattern = queryKeywords.slice(0, 5).map(escapeRegex).join('|');
    const result = await pool.query(`
      SELECT id, feature, input_summary, output_summary, key_findings, keywords, created_at
      FROM ai_reasoning_memory
      WHERE organization_id = $1
        AND feature = $2
        AND created_at > NOW() - INTERVAL '1 day' * $3
        AND keywords ~* $4
      ORDER BY created_at DESC
      LIMIT $5
    `, [organizationId, feature, DB_RETENTION_DAYS, keywordPattern, maxEntries]);
    return result.rows.map(formatDbRow);
  } catch (err) {
    console.error('reasoningMemory.retrieveContext DB error:', err.message);
    return [];
  }
}

/**
 * Build a context string to inject into system prompts
 */
async function buildMemoryContext({ organizationId, feature, queryText }) {
  const entries = await retrieveContext({ organizationId, feature, queryText });
  if (entries.length === 0) return '';
  
  const contextLines = entries.map((e, i) => 
    `[Past Analysis ${i + 1} - ${e.feature} on ${e.date}]\n${e.summary}`
  );
  
  return `\n\n## Reasoning Memory (Past Findings)\nThe following are relevant findings from previous analyses for this organization. Use them to provide continuity and avoid repeating past recommendations:\n\n${contextLines.join('\n\n')}`;
}

/**
 * Invalidate reasoning cache for an organization
 */
function invalidateCache(organizationId, feature) {
  if (feature) {
    reasoningCache.delete(`${organizationId}:${feature}`);
  } else {
    for (const key of reasoningCache.keys()) {
      if (key.startsWith(`${organizationId}:`)) {
        reasoningCache.delete(key);
      }
    }
  }
}

/**
 * Clean up expired entries from DB
 */
async function cleanupExpired() {
  try {
    const result = await pool.query(
      `DELETE FROM ai_reasoning_memory WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [DB_RETENTION_DAYS]
    );
    return result.rowCount;
  } catch (err) {
    console.error('reasoningMemory.cleanupExpired error:', err.message);
    return 0;
  }
}

// ---------- Internal helpers ----------

function extractKeywords(text) {
  if (!text) return [];
  // Extract meaningful words (4+ chars), lowercase, deduplicate
  const words = String(text).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4)
    .filter(w => !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 50);
}

function scoreRelevance(entryKeywords, queryKeywords) {
  if (!entryKeywords || !queryKeywords || queryKeywords.length === 0) return 0;
  const entrySet = new Set(entryKeywords);
  let matches = 0;
  for (const kw of queryKeywords) {
    if (entrySet.has(kw)) matches++;
  }
  return matches / Math.max(queryKeywords.length, 1);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate(str, maxLen) {
  if (!str) return '';
  const s = String(str);
  return s.length <= maxLen ? s : s.slice(0, maxLen - 3) + '...';
}

function formatContextEntry(entry) {
  return {
    feature: entry.feature,
    summary: entry.keyFindings || entry.outputSummary,
    date: entry.createdAt ? entry.createdAt.toISOString().split('T')[0] : 'unknown'
  };
}

function formatDbRow(row) {
  return {
    feature: row.feature,
    summary: row.key_findings || row.output_summary,
    date: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : 'unknown'
  };
}

const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should',
  'their', 'there', 'were', 'they', 'being', 'does', 'done', 'each', 'than',
  'them', 'then', 'these', 'those', 'what', 'when', 'where', 'which', 'while', 'about',
  'after', 'before', 'between', 'both', 'into', 'more', 'most', 'only', 'other', 'over',
  'same', 'some', 'such', 'very', 'also', 'just', 'your', 'provide', 'based', 'using',
  'including', 'ensure', 'required', 'following', 'implement', 'current', 'specific'
]);

// Periodic in-memory cache cleanup
const cacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of reasoningCache.entries()) {
    const fresh = entries.filter(e => now - e.createdAt.getTime() < MEMORY_CACHE_TTL_MS);
    if (fresh.length === 0) {
      reasoningCache.delete(key);
    } else {
      reasoningCache.set(key, fresh);
    }
  }
}, MEMORY_CACHE_TTL_MS);
cacheCleanupInterval.unref();

module.exports = {
  storeReasoning,
  retrieveContext,
  buildMemoryContext,
  invalidateCache,
  cleanupExpired
};
