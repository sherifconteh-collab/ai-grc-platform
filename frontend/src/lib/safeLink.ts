/**
 * Notification links are stored by the API, but the browser decides where they
 * lead, so the client checks them again before navigating. Only a same-origin
 * relative path is accepted: a single leading "/", no "//" or backslash, and no
 * whitespace or control characters. Anything else (javascript:, https://..., //host)
 * is ignored.
 */
const MAX_LINK_LENGTH = 500;

const UNSAFE_CHARACTERS = /[\\\u0000- \u007f]/;

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const link = value.trim();
  if (link.length === 0 || link.length > MAX_LINK_LENGTH) return null;
  if (!link.startsWith('/') || link.startsWith('//')) return null;
  if (UNSAFE_CHARACTERS.test(link)) return null;
  return link;
}
