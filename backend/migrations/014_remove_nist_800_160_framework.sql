-- Migration 014: Remove NIST SP 800-160 as selectable framework
-- NIST SP 800-160 is a systems security engineering standard,
-- not a compliance framework in this platform catalog.

DELETE FROM frameworks
WHERE code = 'nist_800_160';

SELECT 'Migration 014 completed.' AS result;