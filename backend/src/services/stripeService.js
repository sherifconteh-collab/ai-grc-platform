// @tier: pro
const Stripe = require('stripe');
const { log } = require('../utils/logger');

// Lazy initialization: only create Stripe client when API key is present
let stripe = null;

function getStripeClient() {
  if (stripe) return stripe;
  
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }
  
  stripe = Stripe(apiKey);
  return stripe;
}

// Maps Stripe price lookup keys to internal tier names
const LOOKUP_KEY_TO_TIER = Object.freeze({
  pro_monthly: 'pro',
  pro_annual: 'pro',
  enterprise_monthly: 'enterprise',
  enterprise_annual: 'enterprise'
});

const VALID_LOOKUP_KEYS = new Set(Object.keys(LOOKUP_KEY_TO_TIER));

function tierFromLookupKey(lookupKey) {
  return LOOKUP_KEY_TO_TIER[lookupKey] || null;
}

function isValidLookupKey(lookupKey) {
  return VALID_LOOKUP_KEYS.has(lookupKey);
}

/**
 * Check if Stripe is configured
 */
function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Resolve a Stripe Price ID from a lookup key.
 * Throws if the price doesn't exist or is inactive.
 */
async function resolvePriceIdFromLookupKey(lookupKey) {
  const client = getStripeClient();
  const prices = await client.prices.list({ lookup_keys: [lookupKey], active: true });
  if (!prices.data.length) {
    throw new Error(`No active Stripe price found for lookup key: ${lookupKey}`);
  }
  return prices.data[0].id;
}

/**
 * Retrieve the lookup key from a Stripe subscription's first item.
 * Returns null if not resolvable.
 */
async function getLookupKeyFromSubscription(subscription) {
  try {
    const item = subscription.items?.data?.[0];
    if (!item) return null;

    const price = item.price;
    if (price?.lookup_key) return price.lookup_key;

    // Fetch the price to get its lookup_key if not already expanded
    const client = getStripeClient();
    const fullPrice = await client.prices.retrieve(price.id);
    return fullPrice.lookup_key || null;
  } catch (err) {
    log('warn', 'stripe.getLookupKey.failed', { error: err.message });
    return null;
  }
}

/**
 * Create a Stripe Checkout session for a subscription.
 *
 * @param {string} orgId - Organization ID stored in Stripe metadata
 * @param {string} orgEmail - Customer email
 * @param {string|null} stripeCustomerId - Existing Stripe customer ID (prevents duplicates)
 * @param {string} lookupKey - Price lookup key (e.g. 'pro_monthly')
 * @param {Date|string|null} trialEndsAt - If in the future, Stripe delays the first charge until this date
 * @param {string} successUrl - Redirect URL after payment
 * @param {string} cancelUrl - Redirect URL if customer cancels
 * @returns {{ url: string, sessionId: string }}
 */
async function createCheckoutSession({
  orgId,
  orgEmail,
  stripeCustomerId,
  lookupKey,
  trialEndsAt,
  successUrl,
  cancelUrl
}) {
  if (!isValidLookupKey(lookupKey)) {
    throw new Error(`Invalid lookup key: ${lookupKey}`);
  }

  const client = getStripeClient();
  const priceId = await resolvePriceIdFromLookupKey(lookupKey);

  // Determine trial_end Unix timestamp if still in the future
  let trialEnd;
  if (trialEndsAt) {
    const trialEndMs = new Date(trialEndsAt).getTime();
    if (trialEndMs > Date.now()) {
      trialEnd = Math.floor(trialEndMs / 1000);
    }
  }

  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : { customer_email: orgEmail }),
    metadata: { organization_id: orgId },
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { organization_id: orgId },
      ...(trialEnd ? { trial_end: trialEnd } : {})
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Stripe Customer Portal session for self-serve subscription management.
 *
 * @param {string} stripeCustomerId
 * @param {string} returnUrl - Where to send the customer after they leave the portal
 * @returns {{ url: string }}
 */
async function createBillingPortalSession({ stripeCustomerId, returnUrl }) {
  if (!stripeCustomerId) {
    throw new Error('No Stripe customer ID — customer has not completed checkout yet');
  }
  const client = getStripeClient();
  const session = await client.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl
  });
  return { url: session.url };
}

/**
 * Verify and parse a Stripe webhook event from raw request body.
 * rawBody must be the raw Buffer (not parsed JSON).
 */
function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  const client = getStripeClient();
  return client.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Fetch a subscription from Stripe with prices expanded.
 */
async function getSubscription(subscriptionId) {
  const client = getStripeClient();
  return client.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price']
  });
}

/**
 * Fetch a checkout session from Stripe with subscription and price data expanded.
 */
async function getCheckoutSession(sessionId) {
  const client = getStripeClient();
  return client.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'subscription.items.data.price']
  });
}

/**
 * Cancel a Stripe subscription immediately.
 */
async function cancelSubscriptionNow(subscriptionId) {
  if (!subscriptionId) {
    throw new Error('subscriptionId is required');
  }
  const client = getStripeClient();
  return client.subscriptions.cancel(subscriptionId);
}

/**
 * Update an existing Stripe subscription to a new price (plan change).
 * Handles proration so the customer is charged or credited proportionally.
 *
 * @param {string} subscriptionId - The Stripe subscription ID to update
 * @param {string} newLookupKey - The lookup key for the new price (e.g. 'enterprise_monthly')
 * @param {string} prorationBehavior - Stripe proration behavior: 'create_prorations' (default), 'none', or 'always_invoice'
 * @returns {object} The updated Stripe subscription object
 */
async function updateSubscription(subscriptionId, newLookupKey, prorationBehavior = 'create_prorations', extraParams = {}) {
  if (!subscriptionId) {
    throw new Error('subscriptionId is required');
  }
  if (!isValidLookupKey(newLookupKey)) {
    throw new Error(`Invalid lookup key: ${newLookupKey}`);
  }

  const client = getStripeClient();

  // Fetch the current subscription to get the existing item ID
  const subscription = await client.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price']
  });

  const currentItem = subscription.items?.data?.[0];
  if (!currentItem) {
    throw new Error('No subscription item found on the current subscription');
  }

  // Resolve the new price ID from the lookup key
  const newPriceId = await resolvePriceIdFromLookupKey(newLookupKey);

  // Update the subscription with the new price
  const updated = await client.subscriptions.update(subscriptionId, {
    items: [{
      id: currentItem.id,
      price: newPriceId
    }],
    proration_behavior: prorationBehavior,
    ...extraParams
  });

  return updated;
}

module.exports = {
  LOOKUP_KEY_TO_TIER,
  VALID_LOOKUP_KEYS,
  isStripeConfigured,
  isValidLookupKey,
  tierFromLookupKey,
  getLookupKeyFromSubscription,
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent,
  getSubscription,
  getCheckoutSession,
  cancelSubscriptionNow,
  updateSubscription
};
