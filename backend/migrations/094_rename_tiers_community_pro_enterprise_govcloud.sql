-- Migration 094: Rename tier identifiers to match new business model
-- Old: free / starter / professional / utilities
-- New: community / pro / enterprise / govcloud
--
-- This migration is idempotent — safe to re-run.

BEGIN;

-- Drop legacy constraints before updating rows. The previous CHECKs only allow
-- old tier names and would reject the renamed values during the data rewrite.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_tier_valid_check;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_tier_check;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_paid_tier_valid_check;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_billing_status_check;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_billing_status_valid_check;

-- ─── organizations.tier ───
UPDATE organizations SET tier = 'community'  WHERE tier = 'free';
UPDATE organizations SET tier = 'pro'        WHERE tier = 'starter';
UPDATE organizations SET tier = 'enterprise' WHERE tier = 'professional';
UPDATE organizations SET tier = 'govcloud'   WHERE tier = 'utilities';

-- ─── organizations.paid_tier ───
UPDATE organizations SET paid_tier = 'pro'        WHERE paid_tier = 'starter';
UPDATE organizations SET paid_tier = 'enterprise' WHERE paid_tier = 'professional';
UPDATE organizations SET paid_tier = 'govcloud'   WHERE paid_tier = 'utilities';

-- ─── organizations.billing_status ───
UPDATE organizations SET billing_status = 'community' WHERE billing_status = 'free';

-- ─── organizations.trial_source_tier ───
UPDATE organizations SET trial_source_tier = 'pro'        WHERE trial_source_tier = 'starter';
UPDATE organizations SET trial_source_tier = 'enterprise' WHERE trial_source_tier = 'professional';
UPDATE organizations SET trial_source_tier = 'govcloud'   WHERE trial_source_tier = 'utilities';

-- ─── frameworks.tier_required ───
UPDATE frameworks SET tier_required = 'community'  WHERE tier_required = 'free';
UPDATE frameworks SET tier_required = 'pro'        WHERE tier_required = 'starter';
UPDATE frameworks SET tier_required = 'enterprise' WHERE tier_required = 'professional';
UPDATE frameworks SET tier_required = 'govcloud'   WHERE tier_required = 'utilities';

-- ─── asset_categories.tier_required ───
UPDATE asset_categories SET tier_required = 'community'  WHERE tier_required = 'free';
UPDATE asset_categories SET tier_required = 'pro'        WHERE tier_required = 'starter';
UPDATE asset_categories SET tier_required = 'enterprise' WHERE tier_required = 'professional';
UPDATE asset_categories SET tier_required = 'govcloud'   WHERE tier_required = 'utilities';

-- ─── Update CHECK constraints ───
ALTER TABLE organizations ADD CONSTRAINT organizations_tier_valid_check
  CHECK (tier IN ('community', 'pro', 'enterprise', 'govcloud'));

ALTER TABLE organizations ADD CONSTRAINT organizations_paid_tier_valid_check
  CHECK (
    paid_tier IS NULL
    OR paid_tier IN ('pro', 'enterprise', 'govcloud')
  );

ALTER TABLE organizations ADD CONSTRAINT organizations_billing_status_check
  CHECK (billing_status IN ('community', 'trial', 'active_paid', 'past_due', 'canceling', 'canceled', 'comped', 'license'));

-- Update column defaults
ALTER TABLE organizations ALTER COLUMN tier SET DEFAULT 'community';
ALTER TABLE organizations ALTER COLUMN billing_status SET DEFAULT 'community';
ALTER TABLE frameworks ALTER COLUMN tier_required SET DEFAULT 'community';
ALTER TABLE asset_categories ALTER COLUMN tier_required SET DEFAULT 'community';

COMMIT;
