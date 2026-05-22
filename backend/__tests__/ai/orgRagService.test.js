'use strict';

/**
 * Unit tests for services/orgRagService.js — text chunking and buildRagContext
 * These tests mock the DB and do not make real embedding API calls.
 */

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('openai', () => ({
  default: class OpenAI {
    constructor() {
      // Return a fake 1536-dim embedding for all inputs
      this.embeddings = {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1) }]
        })
      };
    }
  }
}));
jest.mock('../../src/services/llmService', () => ({
  resolveApiKey: jest.fn().mockResolvedValue({ key: 'test-key' })
}));

const { chunkText, buildRagContext } = require('../../src/services/orgRagService');
const pool = require('../../src/config/database');

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------
describe('chunkText', () => {
  test('returns single chunk for short text', () => {
    const text = 'Hello, this is a short document.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  test('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
  });

  test('splits long text into multiple chunks with small chunk size', () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = chunkText(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('each chunk does not exceed maxChars', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const maxChars = 300;
    const chunks = chunkText(text, maxChars, 30);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(maxChars);
    }
  });

  test('normalizes Windows line endings', () => {
    const text = 'Line 1\r\nLine 2\r\nLine 3';
    const chunks = chunkText(text);
    expect(chunks[0]).not.toContain('\r');
  });
});

// ---------------------------------------------------------------------------
// buildRagContext
// ---------------------------------------------------------------------------
describe('buildRagContext', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty string when organizationId is missing', async () => {
    const ctx = await buildRagContext({ organizationId: null, queryText: 'test' });
    expect(ctx).toBe('');
  });

  test('returns empty string when queryText is missing', async () => {
    const ctx = await buildRagContext({ organizationId: 'org-1', queryText: '' });
    expect(ctx).toBe('');
  });

  test('returns empty string when org has no indexed documents', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ cnt: '0' }] });
    const ctx = await buildRagContext({ organizationId: 'org-1', queryText: 'policies' });
    expect(ctx).toBe('');
  });

  test('returns non-empty context when chunks are available', async () => {
    // First call: count check (has docs)
    pool.query.mockResolvedValueOnce({ rows: [{ cnt: '3' }] });
    // Second call: vector search results
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          chunk_text: 'This is a relevant policy paragraph.',
          source_name: 'Policy.pdf',
          source_type: 'evidence',
          similarity: 0.85
        }
      ]
    });

    const ctx = await buildRagContext({ organizationId: 'org-1', queryText: 'access control policies' });
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx).toMatch(/organization documents/i);
  });

  test('returns empty string and does not throw when DB errors', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB connection failed'));
    const ctx = await buildRagContext({ organizationId: 'org-1', queryText: 'test' });
    expect(ctx).toBe('');
  });
});
