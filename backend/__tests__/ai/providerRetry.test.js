'use strict';

/**
 * isRetryableProviderError must recognise provider SDK errors by HTTP status,
 * because the SDK message text for 429/500/503/529 does not contain the phrases
 * the original message matching relied on.
 */

process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';
process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/encrypt', () => ({ decrypt: jest.fn(v => v) }));

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { isRetryableProviderError } = require('../../src/services/llmService');

const headers = new Headers();

describe('isRetryableProviderError', () => {
  test('Anthropic 529 overloaded_error is retryable', () => {
    const err = Anthropic.APIError.generate(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, undefined, headers);
    expect(isRetryableProviderError(err)).toBe(true);
  });

  test('Anthropic 429 without the words "rate limit" is retryable', () => {
    const err = Anthropic.APIError.generate(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Request rejected' } }, undefined, headers);
    expect(isRetryableProviderError(err)).toBe(true);
  });

  test('Anthropic 500 and OpenAI 503 are retryable', () => {
    const a = Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'Internal server error' } }, undefined, headers);
    const o = OpenAI.APIError.generate(503, { error: { message: 'The server is overloaded' } }, undefined, headers);
    expect(isRetryableProviderError(a)).toBe(true);
    expect(isRetryableProviderError(o)).toBe(true);
  });

  test.each([400, 401, 403, 404, 422])('status %i is not retryable', (status) => {
    const err = Anthropic.APIError.generate(status, { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }, undefined, headers);
    expect(isRetryableProviderError(err)).toBe(false);
  });

  test('message-based matching still works for errors without a status', () => {
    expect(isRetryableProviderError(new Error('Gemini request timed out after 60000ms'))).toBe(true);
    expect(isRetryableProviderError(new Error('Rate limit exceeded'))).toBe(true);
    expect(isRetryableProviderError(new Error('No API key configured'))).toBe(false);
    expect(isRetryableProviderError(null)).toBe(false);
  });
});
