-- Migration 015: Move NIST AI RMF to free tier
-- Product decision: NIST AI RMF should be available in the free catalog.

UPDATE frameworks
SET tier_required = 'free'
WHERE code = 'nist_ai_rmf';

SELECT 'Migration 015 completed.' AS result;
