'use strict';

/**
 * Notification links are navigated to by the web app, so they must stay inside
 * the app. Only a same-origin relative path is accepted: it starts with a single
 * "/", has no scheme, no protocol-relative "//", no backslash (browsers treat
 * "/\host" like "//host") and no whitespace or control characters (the URL
 * parser strips tabs and newlines, so "/\t/host" would become "//host").
 */
const MAX_LINK_LENGTH = 500;

function normalizeInternalPath(value) {
  if (typeof value !== 'string') return null;
  const link = value.trim();
  if (link.length === 0 || link.length > MAX_LINK_LENGTH) return null;
  if (!link.startsWith('/') || link.startsWith('//')) return null;
  if (/[\\\u0000- \u007f]/.test(link)) return null;
  return link;
}

module.exports = { normalizeInternalPath, MAX_LINK_LENGTH };
