'use strict';

// All 97 SP 800-171 Rev 3 security requirements, generated from NIST's OSCAL
// catalog by scripts/import-oscal-800171.js (lib/frameworks/nist_800_171_rev3.js).
// Migration 156 installs the same rows on existing databases, so a fresh seed
// and an upgraded deployment now carry the same requirement set.
//
// The 24 requirements the catalog shipped before keep their original priority
// and control type: migration 156 refreshes only title and text, so deployed
// databases still hold these values.

const NIST_800_171_REV3 = require('./nist_800_171_rev3');

const ORIGINAL_FIELDS = {
  '03.01.01': ['1', 'technical'], '03.01.02': ['1', 'technical'], '03.01.03': ['1', 'technical'],
  '03.01.05': ['1', 'technical'], '03.01.12': ['1', 'technical'], '03.01.20': ['2', 'technical'],
  '03.03.01': ['1', 'technical'], '03.03.02': ['1', 'technical'], '03.04.01': ['1', 'technical'],
  '03.04.02': ['1', 'technical'], '03.04.06': ['2', 'technical'], '03.05.01': ['1', 'technical'],
  '03.05.02': ['2', 'technical'], '03.05.03': ['1', 'technical'], '03.06.01': ['1', 'organizational'],
  '03.08.01': ['2', 'technical'], '03.11.01': ['1', 'strategic'], '03.11.02': ['1', 'technical'],
  '03.12.01': ['1', 'organizational'], '03.13.01': ['1', 'technical'], '03.13.08': ['1', 'technical'],
  '03.14.01': ['1', 'technical'], '03.14.02': ['1', 'technical'], '03.14.06': ['1', 'technical']
};

module.exports = {
  code: 'nist_800_171', name: 'NIST SP 800-171 Rev 3', version: 'Rev 3',
  category: 'CUI Protection', tier_required: 'pro',
  description: 'Protecting Controlled Unclassified Information (CUI) in nonfederal systems and organizations: all 97 security requirements across 17 families.',
  controls: NIST_800_171_REV3.controls.map((c) => {
    const [priority, controlType] = ORIGINAL_FIELDS[c.control_id] || [c.priority, c.control_type];
    return {
      control_id: c.control_id,
      title: c.title,
      description: c.description,
      priority,
      control_type: controlType
    };
  })
};
