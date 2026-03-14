-- Migration 080: Move HIPAA and HITECH frameworks to enterprise tier
UPDATE frameworks
SET tier_required = 'enterprise'
WHERE code IN ('hipaa', 'hitech');
