/**
 * Shared billing utilities used by AuthContext, DashboardLayout, and page-level
 * routing to determine whether a user needs to resolve their billing status.
 */

/** Billing statuses that count as "paid / valid" for dashboard access. */
export const VALID_PAID_BILLING_STATES = new Set([
  'active_paid',
  'comped',
  'canceling',
  'license',
]);

/**
 * Valid billing plan lookup keys accepted by Stripe checkout.
 */
export const VALID_BILLING_PLANS = new Set([
  'pro_monthly', 'pro_annual',
  'enterprise_monthly', 'enterprise_annual',
]);

interface BillingUser {
  organizationTier?: string;
  billingStatus?: string;
  trialEndsAt?: string | null;
  isPlatformAdmin?: boolean;
}

/**
 * Returns `true` when the user's organization has a paid tier but lacks a
 * valid subscription (active_paid / comped / canceling) and is no longer in
 * an active trial.  In that case the user should be redirected to
 * `/billing/resolve` to complete payment or downgrade to free.
 */
export function requiresBillingResolution(user: BillingUser | null | undefined): boolean {
  if (!user) return false;
  if (user.isPlatformAdmin) return false;

  const tier = String(user.organizationTier || 'community').toLowerCase();
  const billingStatus = String(user.billingStatus || 'community').toLowerCase();

  // Community tier — no payment needed
  if (tier === 'community') return false;

  // Already in a valid paid state
  if (VALID_PAID_BILLING_STATES.has(billingStatus)) return false;

  // Trial is OK while still active
  if (billingStatus === 'trial') {
    const trialEnd = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
    if (trialEnd && trialEnd > new Date()) return false;
    return true; // trial expired
  }

  // Any other state on a paid tier needs resolution
  return true;
}
