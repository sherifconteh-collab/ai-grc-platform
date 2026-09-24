// @tier: community
'use strict';

/**
 * Cursor (keyset) pagination helpers for large, append-heavy tables where
 * OFFSET degrades linearly with page depth (audit_logs, evidence,
 * audit_engagements).
 *
 * The cursor encodes the (created_at, id) of the last row of the previous
 * page; the next page filters WHERE (created_at, id) < (cursor) with a
 * matching ORDER BY created_at DESC, id DESC. The id tiebreaker makes the
 * ordering total, so rows are never skipped or repeated across pages.
 *
 * Endpoints keep their page/offset behavior when no cursor is supplied.
 */

function encodeCursor(createdAt, id) {
  const ts = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
  return Buffer.from(JSON.stringify([ts, String(id)]), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [ts, id] = parsed;
    if (Number.isNaN(new Date(ts).getTime())) return null;
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    return { createdAt: ts, id: String(id) };
  } catch (_err) {
    return null;
  }
}

/**
 * Builds the next_cursor for a result page. Returns null when the page is
 * short (no more rows) or the rows lack the keyset columns.
 */
function nextCursorFrom(rows, limit, createdAtField = 'created_at', idField = 'id') {
  if (!Array.isArray(rows) || rows.length < limit || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  if (!last || last[createdAtField] == null || last[idField] == null) return null;
  return encodeCursor(last[createdAtField], last[idField]);
}

module.exports = { encodeCursor, decodeCursor, nextCursorFrom };
