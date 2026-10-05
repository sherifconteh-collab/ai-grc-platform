'use strict';

/**
 * Shared NIST SP 800-171 Rev 3 OSCAL parsing, used by
 * scripts/generate-800-171r3-migration.js (migration 156) and
 * scripts/import-oscal-800171.js (lib/frameworks/nist_800_171_rev3.js), so the
 * migration and the seed catalog render requirement text identically.
 */

const TYPE = { '03.01':'technical','03.02':'organizational','03.03':'technical','03.04':'technical','03.05':'technical','03.06':'organizational','03.07':'organizational','03.08':'physical','03.09':'organizational','03.10':'physical','03.11':'strategic','03.12':'organizational','03.13':'technical','03.14':'technical','03.15':'policy','03.16':'organizational','03.17':'organizational' };
function paramText(params, id) {
  const p = (params || []).find((x) => x.id === id);
  if (!p) return '[Assignment: organization-defined value]';
  if (p.select) return `[Selection${p.select['how-many'] === 'one-or-more' ? ' (one or more)' : ''}: ${(p.select.choice || []).map((ch) => ch.replace(/\{\{\s*insert:\s*param,\s*([^}\s]+)\s*\}\}/g, (_, i) => paramText(params, i))).join('; ')}]`;
  return `[Assignment: ${p.usage || ('organization-defined ' + (p.label || 'value'))}]`;
}
function shortLabel(v) { const last = String(v).split('.').pop(); return /^\d+$/.test(last) ? `${Number(last)}.` : `${last}.`; }
function render(part, params, depth) {
  const label = (part.props || []).find((p) => p.name === 'label');
  let text = (part.prose || '').replace(/\{\{\s*insert:\s*param,\s*([^}\s]+)\s*\}\}/g, (_, id) => paramText(params, id));
  const lines = [];
  if (text || label) lines.push(`${'  '.repeat(Math.max(0, depth - 1))}${label && depth > 0 ? shortLabel(label.value) + ' ' : ''}${text}`.trimEnd());
  for (const child of part.parts || []) lines.push(...render(child, params, depth + 1));
  return lines;
}
function buildRows(c) {
  const rows = [];
  for (const g of c.groups) {
    for (const x of g.controls || []) {
      if ((x.props || []).some((p) => p.name === 'status' && p.value === 'withdrawn')) continue;
      const id = x.id.replace('SP_800_171_', '');
      const stmt = (x.parts || []).find((p) => p.name === 'statement');
      const desc = render(stmt, x.params, 0).filter(Boolean).join('\n');
      rows.push({ id, title: x.title, desc, type: TYPE[id.slice(0, 5)] || 'technical', family: g.title });
    }
  }
  return rows;
}

const PRIORITY_1_FAMILIES = ['03.01', '03.03', '03.05', '03.13', '03.14', '03.11', '03.06'];
function priorityFor(id) {
  return PRIORITY_1_FAMILIES.includes(id.slice(0, 5)) ? '1' : '2';
}

module.exports = { buildRows, priorityFor };
