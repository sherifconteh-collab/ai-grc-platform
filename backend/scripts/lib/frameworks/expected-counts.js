// Manifest of expected framework/control counts, generated from the per-framework
// data modules in this directory. seed-frameworks.js checks against this after
// seeding and fails loudly if a wave PR silently under- or over-seeds a framework
// (see issue #218).
//
// Regenerate by re-running the generator that produced this file whenever a
// framework module is added, removed, or has controls added/removed:
//   node -e "const fs=require('fs'); const fw=require('./index.js'); const c={}; for (const f of fw) c[f.code]=f.controls.length; fs.writeFileSync('expected-counts.js', 'module.exports = ' + JSON.stringify({totalFrameworks: fw.length, totalControls: fw.reduce((s,x)=>s+x.controls.length,0), perFramework: c}, null, 2) + ';\n');"

module.exports = {
  "totalFrameworks": 33,
  "totalControls": 733,
  "perFramework": {
    "nist_csf_2.0": 57,
    "nist_800_53": 56,
    "iso_27001": 39,
    "soc2": 27,
    "nist_800_171": 24,
    "cmmc_2.0": 50,
    "nist_privacy": 11,
    "fiscam": 12,
    "nist_ai_rmf": 18,
    "gdpr": 17,
    "hipaa": 17,
    "hitech": 28,
    "ffiec": 12,
    "nerc_cip": 12,
    "finra_supervisory_ai": 10,
    "sec_markets_ai_risk": 10,
    "sr_11_7": 14,
    "eu_ai_act": 15,
    "iso_42001": 16,
    "iso_42005": 10,
    "aiuc_1": 32,
    "iso_27002": 15,
    "iso_27005": 12,
    "iso_27017": 12,
    "iso_27018": 11,
    "iso_27701": 14,
    "iso_31000": 11,
    "nist_800_207": 18,
    "ccpa_cpra": 14,
    "state_ai_governance": 47,
    "international_ai_governance": 49,
    "fedramp_high": 25,
    "cis_controls_v8": 18
  }
};
