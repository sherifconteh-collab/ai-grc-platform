-- Open source release: grant all organizations full access to all features.
-- Removes all tier-based feature gating from the database layer.

BEGIN;

UPDATE organizations SET
  tier = 'enterprise',
  billing_status = 'comped',
  paid_tier = 'enterprise',
  trial_status = 'none',
  trial_ends_at = NULL,
  trial_expired_at = NULL,
  trial_started_at = NULL;

UPDATE frameworks SET tier_required = 'community';

UPDATE asset_categories SET tier_required = 'community';

COMMIT;
