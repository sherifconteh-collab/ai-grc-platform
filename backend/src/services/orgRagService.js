// @tier: enterprise
/**
 * Organization RAG Service
 * Retrieval-Augmented Generation for organization documents.
 * Chunks text, generates embeddings via OpenAI, stores in pgvector,
 * and retrieves semantically relevant context for AI prompt injection.
 */

const crypto = require('crypto');
const pool = require('../config/database');
const { resolveApiKey } = require('./llmService');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE || '800', 10);       // tokens (approx chars/4)
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || '100', 10);
const MAX_CHUNKS_PER_DOC = parseInt(process.env.RAG_MAX_CHUNKS_PER_DOC || '200', 10);
const DEFAULT_TOP_K = parseInt(process.env.RAG_DEFAULT_TOP_K || '5', 10);
const MAX_TOP_K = 20;  // Hard ceiling on results per search
const APPROX_CHARS_PER_TOKEN = 4;  // ~4 chars per token for English text
const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.72');
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small default

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

/**
 * Split text into overlapping chunks suitable for embedding.
 * Uses paragraph/sentence boundaries when possible.
 * @param {string} text - Full document text
 * @param {number} [maxChars] - Max characters per chunk (≈ CHUNK_SIZE * 4)
 * @param {number} [overlapChars] - Overlap characters between chunks (≈ CHUNK_OVERLAP * 4)
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, maxChars, overlapChars) {
  if (!text || typeof text !== 'string') return [];
  const max = maxChars || CHUNK_SIZE * APPROX_CHARS_PER_TOKEN;
  const overlap = overlapChars || CHUNK_OVERLAP * APPROX_CHARS_PER_TOKEN;

  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (normalized.length <= max) return [normalized];

  const chunks = [];
  let start = 0;

  while (start < normalized.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(start + max, normalized.length);

    // Try to break at a paragraph boundary
    if (end < normalized.length) {
      const paraBreak = normalized.lastIndexOf('\n\n', end);
      if (paraBreak > start + max * 0.5) {
        end = paraBreak;
      } else {
        // Try sentence boundary
        const sentBreak = normalized.lastIndexOf('. ', end);
        if (sentBreak > start + max * 0.5) {
          end = sentBreak + 1;
        }
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start <= (chunks.length > 0 ? end - max : 0)) {
      start = end; // prevent infinite loop
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

/**
 * Generate embeddings for an array of text chunks using OpenAI-compatible API.
 * Uses the org's BYOK key if available, otherwise falls back to platform key.
 * @param {string[]} texts - Array of text strings to embed
 * @param {string} organizationId - For BYOK key resolution
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function generateEmbeddings(texts, organizationId) {
  if (!texts || texts.length === 0) return [];

  const resolved = await resolveApiKey('openai', organizationId);
  if (!resolved || !resolved.key) {
    throw new Error('No OpenAI API key available for embedding generation. Configure a key in Settings → LLM Configuration or set OPENAI_API_KEY.');
  }

  const OpenAI = require('openai');
  const client = new OpenAI.default({ apiKey: resolved.key });

  // OpenAI embeddings API supports batch — send all chunks at once (up to 2048)
  const batchSize = 100;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// Document indexing
// ---------------------------------------------------------------------------

/**
 * Index a document for RAG: chunk, embed, store.
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.text - Full document text
 * @param {string} params.sourceType - 'document'|'evidence'|'policy'|'control_narrative'
 * @param {string} [params.sourceId] - UUID of source record
 * @param {string} [params.sourceName] - Human-readable name
 * @param {Object} [params.metadata] - Additional metadata to store
 * @returns {Promise<{chunksIndexed: number, sourceId: string}>}
 */
async function indexDocument({ organizationId, text, sourceType, sourceId, sourceName, metadata }) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!text || text.trim().length === 0) throw new Error('Document text is empty');

  const effectiveSourceId = sourceId || crypto.randomUUID();
  const fileHash = crypto.createHash('sha256').update(text).digest('hex');

  // Check if already indexed with same hash
  const existing = await pool.query(
    `SELECT id, file_hash FROM org_rag_index_status
     WHERE organization_id = $1 AND source_type = $2 AND source_id = $3 LIMIT 1`,
    [organizationId, sourceType || 'document', effectiveSourceId]
  );
  if (existing.rows.length > 0 && existing.rows[0].file_hash === fileHash) {
    return { chunksIndexed: 0, sourceId: effectiveSourceId, status: 'already_indexed' };
  }

  // Remove old chunks if re-indexing
  if (existing.rows.length > 0) {
    await pool.query(
      'DELETE FROM org_document_embeddings WHERE organization_id = $1 AND source_id = $2 AND source_type = $3',
      [organizationId, effectiveSourceId, sourceType || 'document']
    );
  }

  // Chunk
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { chunksIndexed: 0, sourceId: effectiveSourceId, status: 'empty' };
  }

  // Generate embeddings
  const embeddings = await generateEmbeddings(chunks, organizationId);

  // Store chunks + embeddings
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(',')}]`;
      await client.query(
        `INSERT INTO org_document_embeddings
           (organization_id, source_type, source_id, source_name, chunk_index, chunk_text, embedding, token_count, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9::jsonb)`,
        [
          organizationId,
          sourceType || 'document',
          effectiveSourceId,
          sourceName || null,
          i,
          chunks[i],
          embeddingStr,
          Math.ceil(chunks[i].length / APPROX_CHARS_PER_TOKEN),
          JSON.stringify(metadata || {})
        ]
      );
    }

    // Upsert index status
    await client.query(
      `INSERT INTO org_rag_index_status
         (organization_id, source_type, source_id, source_name, chunk_count, file_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'indexed')
       ON CONFLICT (organization_id, source_type, source_id)
       DO UPDATE SET chunk_count = $5, file_hash = $6, status = 'indexed', indexed_at = NOW()`,
      [organizationId, sourceType || 'document', effectiveSourceId, sourceName || null, chunks.length, fileHash]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { chunksIndexed: chunks.length, sourceId: effectiveSourceId, status: 'indexed' };
}

// ---------------------------------------------------------------------------
// Semantic search / retrieval
// ---------------------------------------------------------------------------

/**
 * Search for semantically relevant document chunks using cosine similarity.
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.query - Search query text
 * @param {number} [params.topK] - Number of results (default 5)
 * @param {number} [params.threshold] - Min similarity score (default 0.72)
 * @param {string} [params.sourceType] - Filter by source type
 * @returns {Promise<Array<{chunkText: string, sourceName: string, sourceType: string, similarity: number}>>}
 */
async function searchDocuments({ organizationId, query, topK, threshold, sourceType }) {
  if (!organizationId || !query) return [];

  const limit = Math.min(topK || DEFAULT_TOP_K, MAX_TOP_K);
  const minScore = threshold ?? SIMILARITY_THRESHOLD;

  // Generate embedding for the query
  let queryEmbedding;
  try {
    const embeddings = await generateEmbeddings([query], organizationId);
    queryEmbedding = embeddings[0];
  } catch (err) {
    console.error('orgRagService.searchDocuments embedding error:', err.message);
    return [];
  }

  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Cosine similarity search via pgvector (<=> is cosine distance, 1 - distance = similarity)
  const sql = sourceType
    ? `SELECT chunk_text, source_name, source_type, source_id, chunk_index,
              1 - (embedding <=> $2::vector) AS similarity
       FROM org_document_embeddings
       WHERE organization_id = $1 AND source_type = $4
         AND 1 - (embedding <=> $2::vector) >= $3
       ORDER BY embedding <=> $2::vector
       LIMIT $5`
    : `SELECT chunk_text, source_name, source_type, source_id, chunk_index,
              1 - (embedding <=> $2::vector) AS similarity
       FROM org_document_embeddings
       WHERE organization_id = $1
         AND 1 - (embedding <=> $2::vector) >= $3
       ORDER BY embedding <=> $2::vector
       LIMIT $4`;

  const params = sourceType
    ? [organizationId, embeddingStr, minScore, sourceType, limit]
    : [organizationId, embeddingStr, minScore, limit];

  try {
    const result = await pool.query(sql, params);
    return result.rows.map(row => ({
      chunkText: row.chunk_text,
      sourceName: row.source_name,
      sourceType: row.source_type,
      sourceId: row.source_id,
      chunkIndex: row.chunk_index,
      similarity: parseFloat(row.similarity)
    }));
  } catch (err) {
    console.error('orgRagService.searchDocuments query error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// RAG context builder (for LLM prompt injection)
// ---------------------------------------------------------------------------

/**
 * Build a RAG context string to inject into the AI system prompt.
 * Retrieves the most relevant document chunks for the given query.
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.queryText - The user's question or analysis topic
 * @param {number} [params.topK] - Max chunks to include
 * @returns {Promise<string>} Formatted context block or empty string
 */
async function buildRagContext({ organizationId, queryText, topK }) {
  if (!organizationId || !queryText) return '';

  try {
    // Quick check: does this org have any indexed documents?
    const countResult = await pool.query(
      'SELECT COUNT(*) AS cnt FROM org_rag_index_status WHERE organization_id = $1',
      [organizationId]
    );
    if (parseInt(countResult.rows[0].cnt, 10) === 0) return '';

    const chunks = await searchDocuments({
      organizationId,
      query: queryText,
      topK: topK || DEFAULT_TOP_K
    });

    if (chunks.length === 0) return '';

    const contextLines = chunks.map((c, i) =>
      `[Document ${i + 1}: ${c.sourceName || c.sourceType} (relevance: ${(c.similarity * 100).toFixed(0)}%)]\n${c.chunkText}`
    );

    return `\n\n## Relevant Organization Documents (RAG)\nThe following excerpts are from this organization's own documents and evidence. Use them to ground your response in the organization's actual policies, procedures, and artifacts:\n\n${contextLines.join('\n\n')}`;
  } catch (err) {
    // Non-fatal — RAG is an enhancement, not a requirement
    console.error('orgRagService.buildRagContext error (non-fatal):', err.message);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Management helpers
// ---------------------------------------------------------------------------

/**
 * List indexed documents for an organization.
 */
async function listIndexedDocuments(organizationId) {
  const result = await pool.query(
    `SELECT source_type, source_id, source_name, chunk_count, status, indexed_at
     FROM org_rag_index_status
     WHERE organization_id = $1
     ORDER BY indexed_at DESC`,
    [organizationId]
  );
  return result.rows;
}

/**
 * Remove a document's chunks and index status.
 * Deletes by (organization_id, source_type, source_id) to avoid cross-type deletions.
 */
async function removeDocument(organizationId, sourceType, sourceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM org_document_embeddings WHERE organization_id = $1 AND source_type = $2 AND source_id = $3',
      [organizationId, sourceType, sourceId]
    );
    await client.query(
      'DELETE FROM org_rag_index_status WHERE organization_id = $1 AND source_type = $2 AND source_id = $3',
      [organizationId, sourceType, sourceId]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get RAG stats for an organization.
 */
async function getOrgRagStats(organizationId) {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT s.id) AS document_count,
       COALESCE(SUM(s.chunk_count), 0) AS total_chunks,
       MAX(s.indexed_at) AS last_indexed_at
     FROM org_rag_index_status s
     WHERE s.organization_id = $1 AND s.status = 'indexed'`,
    [organizationId]
  );
  return {
    documentCount: parseInt(result.rows[0].document_count, 10),
    totalChunks: parseInt(result.rows[0].total_chunks, 10),
    lastIndexedAt: result.rows[0].last_indexed_at
  };
}

module.exports = {
  chunkText,
  generateEmbeddings,
  indexDocument,
  searchDocuments,
  buildRagContext,
  listIndexedDocuments,
  removeDocument,
  getOrgRagStats
};
