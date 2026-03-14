-- Migration: Move NERC CIP framework from professional tier to utilities tier
UPDATE frameworks
SET tier_required = 'utilities'
WHERE code = 'nerc_cip';
