'use strict';

const NIST_800_53 = require('./nist_800_53');
const FEDRAMP_REV5 = require('./fedramp_rev5_baselines');

// The FedRAMP baseline frameworks: FedRAMP's own Rev 5 control selection
// (lib/frameworks/fedramp_rev5_baselines.js, generated from FedRAMP's baseline
// workbook by scripts/import-fedramp-baselines.js), with control text taken
// from the 800-53 catalog. FedRAMP's selections are strict supersets of the
// NIST SP 800-53B baselines this module previously used (Low 156 vs 149,
// Moderate 323 vs 287, High 410 vs 370), so switching adds controls and drops
// none. Each control's description carries FedRAMP's defined parameter values
// and additional requirements after the NIST text.
//
// Control ids are prefixed so they remain distinct rows from their 800-53
// originals (framework_controls is unique on framework_id + control_id, so
// the same id in two frameworks is legal, but a distinct prefix keeps
// crosswalks and search unambiguous). The prefix is stripped back off when
// crosswalking to 800-53 in seed-frameworks.js.
const FEDRAMP_BASELINE_DEFS = [
  {
    code: 'fedramp_low',
    baseline: 'low',
    prefix: 'FRL-',
    name: 'FedRAMP Low Baseline',
    description: 'FedRAMP Low baseline for cloud services where loss of confidentiality, integrity or availability would have limited adverse effect. FedRAMP Rev 5 Low baseline: 156 NIST SP 800-53 Rev 5 controls and enhancements with FedRAMP-defined parameters. Source: FedRAMP\'s Rev 5 baseline workbook, which FedRAMP marked legacy on 2026-06-23 in favor of the FedRAMP Consolidated Rules for 2026.'
  },
  {
    code: 'fedramp_moderate',
    baseline: 'moderate',
    prefix: 'FED-',
    name: 'FedRAMP Moderate Baseline',
    description: 'FedRAMP Moderate baseline for cloud services processing Controlled Unclassified Information for US federal agencies. FedRAMP Rev 5 Moderate baseline: 323 NIST SP 800-53 Rev 5 controls and enhancements with FedRAMP-defined parameters and additional requirements; continuous monitoring (ConMon) and 3PAO assessment apply on top. Source: FedRAMP\'s Rev 5 baseline workbook, which FedRAMP marked legacy on 2026-06-23 in favor of the FedRAMP Consolidated Rules for 2026.'
  },
  {
    code: 'fedramp_high',
    baseline: 'high',
    prefix: 'FRH-',
    name: 'FedRAMP High Baseline',
    description: 'FedRAMP High baseline, required for systems processing law enforcement, emergency services, financial and health data. FedRAMP Rev 5 High baseline: 410 NIST SP 800-53 Rev 5 controls and enhancements with FedRAMP-defined parameters and additional requirements. Source: FedRAMP\'s Rev 5 baseline workbook, which FedRAMP marked legacy on 2026-06-23 in favor of the FedRAMP Consolidated Rules for 2026.'
  }
];

function fedrampDescription(nistText, entry) {
  const parts = [nistText];
  if (entry.fedramp_parameters) parts.push(`FedRAMP-defined parameters:\n${entry.fedramp_parameters}`);
  if (entry.fedramp_requirements) parts.push(`Additional FedRAMP requirements and guidance:\n${entry.fedramp_requirements}`);
  return parts.filter(Boolean).join('\n\n');
}

function buildFedrampBaselines(nist, fedramp = FEDRAMP_REV5) {
  return FEDRAMP_BASELINE_DEFS.map((def) => {
    const entries = new Map(fedramp[def.baseline].map((e) => [e.control_id, e]));
    // Catalog order, so rows seed in the same order as the 800-53 framework.
    const selected = nist.controls.filter((c) => entries.has(c.control_id));
    if (selected.length !== entries.size) {
      const known = new Set(selected.map((c) => c.control_id));
      const missing = [...entries.keys()].filter((id) => !known.has(id));
      throw new Error(`FedRAMP ${def.baseline} selects controls missing from the 800-53 catalog: ${missing.join(', ')}`);
    }
    return {
      code: def.code,
      name: def.name,
      version: nist.framework.version,
      category: 'Federal Cloud Security',
      tier_required: 'community',
      description: def.description,
      controls: selected.map((c) => ({
        control_id: `${def.prefix}${c.control_id}`,
        title: c.title,
        description: fedrampDescription(c.description, entries.get(c.control_id)),
        priority: c.priority,
        control_type: c.control_type,
        is_enhancement: c.is_enhancement,
        parent_control_id: c.parent_control_id ? `${def.prefix}${c.parent_control_id}` : null,
        // The baseline is the framework here, so per-control baseline rows
        // would be redundant -- membership is implied by inclusion.
        baselines: [],
        derived_from: c.control_id
      }))
    };
  });
}

module.exports = {
  frameworks: buildFedrampBaselines(NIST_800_53),
  FEDRAMP_BASELINE_DEFS,
  buildFedrampBaselines
};
