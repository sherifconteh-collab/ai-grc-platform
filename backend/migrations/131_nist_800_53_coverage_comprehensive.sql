-- Migration 131: Flip NIST SP 800-53 Rev 5 coverage_status to 'comprehensive'
--
-- Issue #217 Wave 1 completed the NIST SP 800-53 Rev 5 base-control set:
-- all 20 control families now seed all 300 non-withdrawn base controls
-- (excluding control enhancements, matching this repo's existing
-- enhancement-free convention), sourced directly from NIST's official
-- OSCAL/CPRT catalog (usnistgov/oscal-content, rev 5.2.0) rather than a
-- curated subset. Migration 123 left this framework at the DEFAULT
-- 'core_controls' because it previously seeded 56 (later 153 once
-- seed-missing-controls.js's since-merged family backfill is counted) of
-- the ~300 official base controls. It is now verified complete against
-- the live official catalog (see lib/frameworks/expected-counts.js and
-- lib/frameworks/verifyCounts.js, which fail the seed run loudly on any
-- future drift), so the UI's coverage badge should say so.

UPDATE frameworks SET coverage_status = 'comprehensive' WHERE code = 'nist_800_53';

SELECT 'Migration 131 completed.' AS result;
