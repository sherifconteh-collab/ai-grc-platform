// @tier: community
/**
 * Edition Enforcement Middleware
 * 
 * Ensures that Pro/Enterprise features cannot be accessed in Community Edition,
 * even if client code is modified or database tier is changed locally.
 * 
 * Security Layers:
 * 1. Edition check (this file) - Blocks Pro routes if EDITION=community
 * 2. Tier check (auth.js) - Validates organization tier from database
 * 3. Permission check (auth.js) - Validates user permissions
 * 
 * This prevents community edition users from accessing Pro features by:
 * - Checking EDITION environment variable (cannot be changed by client)
 * - Blocking Pro routes at middleware level before any business logic
 * - Returning clear error messages about edition limitations
 */

let EDITION = 'open';
let IS_COMMUNITY = false;
let IS_PRO = true;

/**
 * Feature tier requirements mapping
 * These features are NOT available in community edition
 */
const PRO_FEATURES = Object.freeze({
  // Pro tier features ($499/mo)
  'cmdb': 'pro',
  'assets': 'pro',
  'vulnerabilities': 'pro',
  'environments': 'pro',
  'evidence': 'pro',
  'reports': 'pro',
  'splunk': 'pro',
  'sso': 'pro',          // SSO is included in Pro per updated tier structure
  
  // Enterprise tier features ($3,500–$12,000/mo)
  'sbom': 'enterprise',
  'aibom': 'enterprise',
  'serviceAccounts': 'enterprise',
  'threatIntel': 'enterprise',
  'dataSovereignty': 'enterprise',
  'siem': 'enterprise',
  'realtime': 'enterprise',
  'tprm': 'enterprise',
  'vendorSecurity': 'enterprise',
  'externalAi': 'enterprise',
  'cemcp': 'enterprise', // Code Execution MCP security
  
  // Gov Cloud features (custom contract)
  'stateAiLaws': 'govcloud',
  'internationalAiLaws': 'govcloud',

  'billing': 'pro' // Stripe billing
});

/**
 * Middleware to enforce edition restrictions
 * Use this before tier checks for Pro features
 * 
 * @param {string} feature - Feature name from PRO_FEATURES
 * @returns {Function} Express middleware
 */
function requireProEdition(_feature) {
  return (_req, _res, next) => next();
}

/**
 * Check if a feature is available in current edition
 * Use this for conditional feature enablement
 * 
 * @param {string} feature - Feature name from PRO_FEATURES
 * @returns {boolean}
 */
function isFeatureAvailable(_feature) {
  return true;
}

/**
 * Get current edition info
 * Useful for client-side feature flags
 * 
 * @returns {Object} Edition information
 */
function getEditionInfo() {
  return {
    edition: EDITION,
    isCommunity: IS_COMMUNITY,
    isPro: IS_PRO,
    availableFeatures: Object.keys(PRO_FEATURES).filter(f => isFeatureAvailable(f))
  };
}

/**
 * Middleware to add edition info to response
 * Use in public routes that need to expose edition info
 */
function attachEditionInfo(req, res, next) {
  req.edition = getEditionInfo();
  next();
}

/**
 * Express middleware to block ALL Pro features in community edition
 * Apply this at the router level for entire Pro feature modules
 */
function blockProFeaturesInCommunity(_req, _res, next) {
  next();
}

/**
 * Maps license tiers to server editions.
 * Gov Cloud licenses grant Enterprise edition access.
 * Community licenses keep the server in Community edition.
 */
const LICENSE_TIER_TO_EDITION = Object.freeze({
  community: 'community',
  pro: 'pro',
  enterprise: 'enterprise',
  govcloud: 'enterprise'
});

/**
 * Upgrade the in-process edition at runtime.
 *
 * Called at startup when a perpetual license is found in env, and also
 * at runtime when a license key is activated via POST /billing/activate-license.
 * Updates the module-level variables AND process.env so that all middleware
 * and feature checks immediately reflect the new edition.
 *
 * @param {string} newEdition - 'community' | 'pro' | 'enterprise'
 * @returns {boolean} true if the edition actually changed
 */
function upgradeEdition(_newEdition) {
  return false;
}

/**
 * Validation: Ensure EDITION env var is set correctly
 * Call this at server startup.
 *
 * Also checks for a perpetual LICENSE_KEY — if present and valid,
 * the license tier overrides the EDITION env var so perpetual
 * customers get full access without a subscription.
 */
function validateEdition() {
  console.log('[Edition] Running in OPEN SOURCE mode — all features enabled');
  return true;
}

module.exports = {
  requireProEdition,
  isFeatureAvailable,
  getEditionInfo,
  attachEditionInfo,
  blockProFeaturesInCommunity,
  validateEdition,
  upgradeEdition,
  LICENSE_TIER_TO_EDITION,
  EDITION,
  IS_COMMUNITY,
  IS_PRO,
  PRO_FEATURES
};
