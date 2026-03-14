-- Migration 070: Extend billing_status CHECK constraint to include 'canceling'
-- The billing webhook handler sets billing_status = 'canceling' when a Stripe
-- subscription has cancel_at_period_end = true (user cancelled via portal but
-- access continues until period end). The original constraint in migration 027
-- did not include this value, causing a constraint violation on that webhook event.

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_billing_status_check
  CHECK (billing_status IN ('free', 'trial', 'active_paid', 'past_due', 'canceling', 'canceled'));
