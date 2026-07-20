// Orchestrator: requires each per-framework data module (see docs/FRAMEWORK_CATALOG_COMPLETION_PLAN.md
// and issue #218) and concatenates them in the same order seed-frameworks.js used before
// the refactor, so seeding remains a pure extraction with no behavior change.

const nist_csf_2_0 = require('./nist_csf_2.0');
const nist_800_53 = require('./nist_800_53');
const iso_27001 = require('./iso_27001');
const soc2 = require('./soc2');
const nist_800_171 = require('./nist_800_171');
const cmmc_2_0 = require('./cmmc_2.0');
const nist_privacy = require('./nist_privacy');
const fiscam = require('./fiscam');
const nist_ai_rmf = require('./nist_ai_rmf');
const gdpr = require('./gdpr');
const hipaa = require('./hipaa');
const hitech = require('./hitech');
const ffiec = require('./ffiec');
const nerc_cip = require('./nerc_cip');
const finra_supervisory_ai = require('./finra_supervisory_ai');
const sec_markets_ai_risk = require('./sec_markets_ai_risk');
const sr_11_7 = require('./sr_11_7');
const eu_ai_act = require('./eu_ai_act');
const iso_42001 = require('./iso_42001');
const iso_42005 = require('./iso_42005');
const aiuc_1 = require('./aiuc_1');
const iso_27002 = require('./iso_27002');
const iso_27005 = require('./iso_27005');
const iso_27017 = require('./iso_27017');
const iso_27018 = require('./iso_27018');
const iso_27701 = require('./iso_27701');
const iso_31000 = require('./iso_31000');
const nist_800_207 = require('./nist_800_207');
const ccpa_cpra = require('./ccpa_cpra');
const state_ai_governance = require('./state_ai_governance');
const international_ai_governance = require('./international_ai_governance');
const fedramp_high = require('./fedramp_high');
const cis_controls_v8 = require('./cis_controls_v8');

module.exports = [
  nist_csf_2_0,
  nist_800_53,
  iso_27001,
  soc2,
  nist_800_171,
  cmmc_2_0,
  nist_privacy,
  fiscam,
  nist_ai_rmf,
  gdpr,
  hipaa,
  hitech,
  ffiec,
  nerc_cip,
  finra_supervisory_ai,
  sec_markets_ai_risk,
  sr_11_7,
  eu_ai_act,
  iso_42001,
  iso_42005,
  aiuc_1,
  iso_27002,
  iso_27005,
  iso_27017,
  iso_27018,
  iso_27701,
  iso_31000,
  nist_800_207,
  ccpa_cpra,
  state_ai_governance,
  international_ai_governance,
  fedramp_high,
  cis_controls_v8,
];
