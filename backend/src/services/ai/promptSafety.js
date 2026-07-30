// @tier: community
/**
 * Helpers for safely embedding user-controlled values in LLM prompts.
 *
 * Prompt injection through a document's *body* is inherent to any
 * analyse-my-document feature and is contained downstream: output is schema
 * validated, and nothing the model suggests is applied without an explicit
 * human action. Short metadata fields are different — a filename or a label has
 * no legitimate reason to contain quotes, newlines, or control characters, and
 * those are exactly what lets a value escape the quoted field it is
 * interpolated into and forge surrounding prompt structure.
 */

'use strict';

/**
 * Flattens a short user-controlled label for safe interpolation into a prompt.
 * Collapses control characters (newlines included) to spaces, drops quote
 * characters that could terminate a quoted field, and caps the length so an
 * overlong value cannot crowd out the rest of the prompt.
 *
 * @param {unknown} value
 * @param {number} [maxLength=200]
 * @returns {string} A single-line, quote-free label; 'untitled' when empty.
 */
function sanitizePromptLabel(value, maxLength = 200) {
  return String(value || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/["'`]/g, '')
    .trim()
    .slice(0, maxLength) || 'untitled';
}

module.exports = { sanitizePromptLabel };
