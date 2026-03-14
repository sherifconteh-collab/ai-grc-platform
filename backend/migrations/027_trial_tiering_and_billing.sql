-- Migration 027: Trial lifecycle + billing state for tier separation
-- Adds explicit trial metadata so new orgs can receive a paid-tier trial
-- and then automatically downgrade to free.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(50) NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS trial_source_tier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS trial_status VARCHAR(50) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trial_expired_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS paid_tier VARCHAR(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_billing_status_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_billing_status_check
      CHECK (billing_status IN ('free', 'trial', 'active_paid', 'past_due', 'canceled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_trial_status_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_trial_status_check
      CHECK (trial_status IN ('none', 'active', 'expired', 'converted'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_tier_valid_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_tier_valid_check
      CHECK (tier IN ('free', 'starter', 'professional', 'enterprise', 'utilities'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_paid_tier_valid_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_paid_tier_valid_check
      CHECK (
        paid_tier IS NULL
        OR paid_tier IN ('starter', 'professional', 'enterprise', 'utilities')
      );
  END IF;
END $$;

-- Backfill lifecycle state for existing organizations.
UPDATE organizations
SET billing_status = CASE
  WHEN tier = 'free' THEN 'free'
  ELSE 'active_paid'
END
WHERE billing_status IS NULL
   OR billing_status NOT IN ('free', 'trial', 'active_paid', 'past_due', 'canceled');

UPDATE organizations
SET trial_status = 'none'
WHERE trial_status IS NULL
   OR trial_status NOT IN ('none', 'active', 'expired', 'converted');

UPDATE organizations
SET paid_tier = tier
WHERE paid_tier IS NULL
  AND tier IN ('starter', 'professional', 'enterprise', 'utilities');

-- Ensure stale active trials are normalized.
UPDATE organizations
SET tier = 'free',
    billing_status = 'free',
    trial_status = 'expired',
    trial_expired_at = COALESCE(trial_expired_at, NOW()),
    updated_at = NOW()
WHERE trial_status = 'active'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at <= NOW();

CREATE INDEX IF NOT EXISTS idx_organizations_trial_expiry
  ON organizations (trial_status, trial_ends_at);

