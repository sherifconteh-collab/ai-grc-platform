'use strict';

/**
 * Parses a DISA STIG XCCDF benchmark (XCCDF 1.1 or 1.2, any namespace prefix)
 * into a framework module object for lib/frameworks/supplemental. Each rule
 * becomes a control keyed by its STIG id (the rule's <version>, for example
 * RHEL-08-010000), carrying its CCIs and, through DISA's CCI list, the
 * NIST SP 800-53 Rev 5 controls it implements.
 */

const xml2js = require('xml2js');

const SEVERITY_PRIORITY = { high: '1', medium: '2', low: '3' };
const CCI_SYSTEM = /cyber\.mil\/cci|iase\.disa\.mil\/cci/i;

function text(node) {
  if (node === undefined || node === null) return '';
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return String(node._ || '');
  return String(node);
}

// DISA wraps the rule discussion in escaped pseudo-XML inside <description>.
function vulnDiscussion(raw) {
  const m = raw.match(/<VulnDiscussion>([\s\S]*?)<\/VulnDiscussion>/);
  return (m ? m[1] : raw.replace(/<[^>]+>/g, ' ')).trim();
}

function collectRules(node, group, out) {
  for (const rule of node.Rule || []) out.push({ group, rule });
  for (const child of node.Group || []) collectRules(child, child, out);
  return out;
}

// Some SRGs ship two rules under one requirement id (for example
// SRG-OS-000132-GPOS-00067 as V-203655 and V-278973 in the GPOS SRG). The
// (framework_id, control_id) key allows one row per id, so keep the newest rule
// (highest numeric Vuln id) and report what was dropped.
function vulnNumber(control) {
  const match = /(\d+)$/.exec(control.vuln_id || '');
  return match ? Number(match[1]) : 0;
}

function dedupeControls(controls) {
  const kept = new Map();
  const dropped = [];
  for (const control of controls) {
    const existing = kept.get(control.control_id);
    if (!existing) {
      kept.set(control.control_id, control);
    } else if (vulnNumber(control) > vulnNumber(existing)) {
      dropped.push({ control_id: existing.control_id, vuln_id: existing.vuln_id });
      kept.set(control.control_id, control);
    } else {
      dropped.push({ control_id: control.control_id, vuln_id: control.vuln_id });
    }
  }
  return { controls: [...kept.values()], dropped };
}

async function parseBenchmark(xml, cciRev5 = {}) {
  const doc = await xml2js.parseStringPromise(xml, {
    explicitArray: true,
    tagNameProcessors: [xml2js.processors.stripPrefix]
  });
  const bench = doc.Benchmark;
  if (!bench) throw new Error('Not an XCCDF benchmark: no <Benchmark> root element');

  const releaseInfo = (bench['plain-text'] || []).find((p) => p.$ && p.$.id === 'release-info');
  const unmapped = new Set();
  const rawControls = collectRules(bench, null, []).map(({ group, rule }) => {
    const ccis = (rule.ident || [])
      .filter((i) => CCI_SYSTEM.test((i.$ || {}).system || ''))
      .map((i) => text(i).trim());
    const nist = [...new Set(ccis.flatMap((c) => {
      const ids = cciRev5[c];
      if (!ids) unmapped.add(c);
      return ids || [];
    }))];
    return {
      control_id: text(rule.version).trim(),
      title: text(rule.title).trim(),
      description: vulnDiscussion(text(rule.description)),
      priority: SEVERITY_PRIORITY[(rule.$ || {}).severity] || '2',
      control_type: 'technical',
      severity: (rule.$ || {}).severity || null,
      vuln_id: group ? String(group.$.id).replace(/^.*_group_/, '') : null,
      rule_id: String(rule.$.id).replace(/^.*_rule_/, ''),
      ccis,
      nist_800_53: nist,
      fix_text: text(rule.fixtext).trim() || null
    };
  });
  const { controls, dropped } = dedupeControls(rawControls);

  return {
    title: text(bench.title).trim(),
    version: text(bench.version).trim(),
    release_info: releaseInfo ? text(releaseInfo).trim() : null,
    status_date: bench.status && bench.status[0].$ ? bench.status[0].$.date : null,
    description: text(bench.description).trim(),
    controls,
    duplicate_rules_dropped: dropped,
    unmapped_ccis: [...unmapped].sort()
  };
}

module.exports = { parseBenchmark, vulnDiscussion, dedupeControls };
