'use strict';

const { normalizeInternalPath } = require('../../src/utils/safeLink');

describe('normalizeInternalPath', () => {
  it.each([
    '/dashboard/poam/123',
    '/dashboard/controls?tab=evidence',
    '/dashboard/audit/poam/abc#section'
  ])('keeps the in-app path %s', (link) => {
    expect(normalizeInternalPath(link)).toBe(link);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,x',
    'https://evil.example.com/',
    'http://evil.example.com/',
    '//evil.example.com/',
    '/\\evil.example.com/',
    '/\t/evil.example.com/',
    '/\n/evil.example.com/',
    ' //evil.example.com',
    'dashboard/poam',
    '',
    null,
    undefined,
    42,
    {},
    `/${'a'.repeat(600)}`
  ])('rejects %j', (link) => {
    expect(normalizeInternalPath(link)).toBeNull();
  });
});
