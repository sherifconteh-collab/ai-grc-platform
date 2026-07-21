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
    'nist_800_53', // issue #217 Wave 1: full 20-family base-control set
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
