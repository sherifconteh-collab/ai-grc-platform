// Canonical frameworks.coverage_status classification.
//
// Source of truth is migrations/123_framework_coverage_status.sql and
// migrations/131_nist_800_53_coverage_comprehensive.sql -- those UPDATE
// existing rows in already-deployed databases. But several of these
// framework codes (nist_800_53, nist_privacy, fiscam, ffiec, nerc_cip,
// hitech, ccpa_cpra, nist_800_207, aiuc_1, cobit_2019, owasp_llm_top10,
// owasp_agentic_top10, iso_27005, iso_31000) are only ever created as rows
// by seed-frameworks.js, which runs *after* all migrations in a fresh
// `migrate -> seed` cycle (exactly what CI does). On a brand-new database
// the migration's `UPDATE ... WHERE code = ...` runs against a table that
// doesn't have that row yet, so it's a silent no-op.
//
// seed-frameworks.js re-applies this same classification after every
// insert so the result is correct regardless of migrate-vs-seed ordering.
// Keep this in sync with the two migrations by hand -- there's no shared
// runtime between SQL migrations and this JS module.
module.exports = {
  comprehensive: [
    'cobit_2019',
    'owasp_llm_top10',
    'owasp_agentic_top10',
    'state_ai_governance',
    'international_ai_governance',
    // Full 20-family catalog: 300 base controls AND all 714 non-withdrawn
    // enhancements, with NIST SP 800-53B baseline membership. Previously
    // 'comprehensive' on a base-only basis, which was a defensible reading of
    // the word but understated what is now actually seeded.
    'nist_800_53',
    // All 110 Level 2 practices, ported from the sibling repository's
    // OSCAL-imported module. This repo previously carried 50 while its own
    // framework description claimed 110 -- the description was right about the
    // standard and wrong about the data. Level 1's 17 practices are still
    // absent, so this is comprehensive for L2 only.
    'cmmc_2.0',
  ],
  representative: [
    'nist_privacy',
    'fiscam',
    'finra_supervisory_ai',
    'sec_markets_ai_risk',
    'sr_11_7',
    'iso_42005',
    'iso_27005',
    'iso_31000',
    'ffiec',
    'nerc_cip',
    'hitech',
    'ccpa_cpra',
    'nist_800_207',
    'aiuc_1',
  ],
};
