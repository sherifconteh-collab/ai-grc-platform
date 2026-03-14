-- Migration 055: Add Stripe billing fields to organizations
-- Adds stripe_customer_id and stripe_subscription_id for Stripe integration

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer
  ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_stripe_subscription
  ON organizations(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
