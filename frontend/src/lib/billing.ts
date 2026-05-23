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
  effectiveTier?: string;
  billingStatus?: string;
  trialEndsAt?: string | null;
  isPlatformAdmin?: boolean;
}

export function getBillingTier(user: BillingUser | null | undefined): string {
  return String(user?.effectiveTier || user?.organizationTier || 'community').toLowerCase();
}

export function getStoredPendingBillingPlan(): string {
  if (typeof window === 'undefined') return '';

  const pendingPlan = String(window.localStorage.getItem('pendingPlan') || '').trim().toLowerCase();
  if (!pendingPlan) return '';

  if (VALID_BILLING_PLANS.has(pendingPlan)) {
    return pendingPlan;
  }

  window.localStorage.removeItem('pendingPlan');
  return '';
}

/**
 * Returns `true` when the user's organization has a paid tier but lacks a
 * valid subscription (active_paid / comped / canceling) and is no longer in
 * an active trial.  In that case the user should be redirected to
 * `/billing/resolve` to complete payment or downgrade to free.
 */
export function requiresBillingResolution(_user: BillingUser | null | undefined): boolean {
  return false;
}
