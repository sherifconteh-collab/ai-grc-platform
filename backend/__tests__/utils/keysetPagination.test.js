'use strict';

const { encodeCursor, decodeCursor, nextCursorFrom } = require('../../src/utils/keysetPagination');

const UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('keysetPagination', () => {
  test('round-trips a Date and uuid', () => {
    const ts = new Date('2026-06-10T12:00:00.000Z');
    const cursor = encodeCursor(ts, UUID);
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-06-10T12:00:00.000Z', id: UUID });
  });

  test('round-trips a string timestamp', () => {
    const cursor = encodeCursor('2026-06-10T12:00:00.000Z', UUID);
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-06-10T12:00:00.000Z', id: UUID });
  });

  test('rejects garbage, tampered, and oversized cursors', () => {
    expect(decodeCursor('not-base64-json')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(Buffer.from('["x"]').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('["2026-01-01T00:00:00Z","not-a-uuid"]').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('["nope","' + UUID + '"]').toString('base64url'))).toBeNull();
    expect(decodeCursor('a'.repeat(201))).toBeNull();
  });

  test('nextCursorFrom returns a cursor only for full pages', () => {
    const rows = [
      { id: UUID, created_at: '2026-06-10T12:00:00.000Z' },
      { id: UUID.replace('0000', '0001'), created_at: '2026-06-09T12:00:00.000Z' }
    ];
    expect(nextCursorFrom(rows, 2)).toBe(encodeCursor('2026-06-09T12:00:00.000Z', UUID.replace('0000', '0001')));
    expect(nextCursorFrom(rows, 3)).toBeNull();
    expect(nextCursorFrom([], 2)).toBeNull();
    expect(nextCursorFrom([{ id: UUID }], 1)).toBeNull();
  });
});
