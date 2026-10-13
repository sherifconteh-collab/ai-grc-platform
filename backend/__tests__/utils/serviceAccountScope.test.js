'use strict';

const {
  SERVICE_ACCOUNT_SCOPES,
  parseServiceAccountScope,
  isWriteScope
} = require('../../src/utils/serviceAccountScope');

describe('serviceAccountScope', () => {
  test('the allowed set is exactly read-only and full', () => {
    expect([...SERVICE_ACCOUNT_SCOPES]).toEqual(['read-only', 'full']);
  });

  test.each([undefined, null, '', '   '])('unset value %j is valid and null', (value) => {
    expect(parseServiceAccountScope(value)).toEqual({ valid: true, scope: null });
  });

  test.each([['read-only', 'read-only'], ['FULL', 'full'], ['  Read-Only ', 'read-only']])(
    'accepts %j as %j', (value, scope) => {
      expect(parseServiceAccountScope(value)).toEqual({ valid: true, scope });
    });

  test.each(['admin', 'write', 'read-write', 'readonly', 'full access', 0, false, [], {}])(
    'rejects %j', (value) => {
      expect(parseServiceAccountScope(value).valid).toBe(false);
    });

  test('only the full scope is a write scope', () => {
    expect(isWriteScope('full')).toBe(true);
    expect(isWriteScope(' FULL ')).toBe(true);
    for (const v of ['read-only', 'admin', '', null, undefined, 1, {}, ['full']]) {
      expect(isWriteScope(v)).toBe(false);
    }
  });
});
