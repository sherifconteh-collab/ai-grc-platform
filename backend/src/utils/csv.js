// @tier: community
/**
 * CSV helpers shared by the export routes.
 *
 * Extracted from routes/rmfInheritance.js when routes/poam.js needed the same
 * escaping. Keeping one copy matters more than the three lines it saves: a
 * subtly different escape in a second exporter is how a compliance export ends
 * up with a field that silently breaks a row for a regulator's parser.
 */

/**
 * Escape a single CSV field per RFC 4180: quote when the value contains a
 * comma, quote, CR or LF, and double any embedded quotes.
 */
function csvEscape(val) {
  const str = val === null || val === undefined ? '' : String(val);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Build a full CSV document from a header list and row objects.
 *
 * `header` is the ordered list of keys; each row is indexed by those keys, so a
 * missing key becomes an empty field rather than shifting the row.
 */
function toCsvDocument(header, rows) {
  return [
    header.map(csvEscape).join(','),
    ...rows.map((row) => header.map((col) => csvEscape(row[col])).join(','))
  ].join('\n');
}

module.exports = { csvEscape, toCsvDocument };
