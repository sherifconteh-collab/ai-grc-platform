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

let EDITION = (process.env.EDITION || 'pro').toLowerCase();
let IS_COMMUNITY = EDITION === 'community';
let IS_PRO = EDITION === 'pro' || EDITION === 'enterprise';

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
  'regulatoryNews': 'pro',
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
function requireProEdition(feature) {
  return (req, res, next) => {
    // Pro edition: allow everything
    if (IS_PRO) {
      return next();
    }
    
    // Community edition: block Pro features
    if (IS_COMMUNITY && PRO_FEATURES[feature]) {
      const requiredTier = PRO_FEATURES[feature];
      return res.status(403).json({
        success: false,
        error: 'Feature not available in Community Edition',
        message: `This feature requires ${requiredTier} tier or higher and is not available in the Community Edition.`,
        feature: feature,
        edition: 'community',
        requiredEdition: 'pro',
        upgradeUrl: 'https://controlweave.com/pricing'
      });
    }
    
    // Unknown edition or feature: deny by default (fail closed)
    return res.status(403).json({
      success: false,
      error: 'Feature availability check failed',
      message: 'Unable to determine feature availability for your edition.'
    });
  };
}

/**
 * Check if a feature is available in current edition
 * Use this for conditional feature enablement
 * 
 * @param {string} feature - Feature name from PRO_FEATURES
 * @returns {boolean}
 */
function isFeatureAvailable(feature) {
  if (IS_PRO) return true;
  if (IS_COMMUNITY) return !PRO_FEATURES[feature];
  return false; // Unknown edition: deny by default
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
function blockProFeaturesInCommunity(req, res, next) {
  if (IS_COMMUNITY) {
    return res.status(403).json({
      success: false,
      error: 'Feature not available in Community Edition',
      message: 'This feature is not available in the Community Edition. Please upgrade to Pro edition for access to enterprise features.',
      edition: 'community',
      requiredEdition: 'pro',
      upgradeUrl: 'https://controlweave.com/pricing'
    });
  }
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
function upgradeEdition(newEdition) {
  const valid = ['community', 'pro', 'enterprise'];
  if (!newEdition || typeof newEdition !== 'string') return false;
  const normalized = newEdition.trim().toLowerCase();
  if (!valid.includes(normalized)) return false;

  const oldEdition = EDITION;
  EDITION = normalized;
  IS_COMMUNITY = EDITION === 'community';
  IS_PRO = EDITION === 'pro' || EDITION === 'enterprise';
  process.env.EDITION = EDITION;

  // Update module.exports so future require() calls see current values.
  // Note: callers that already destructured (const { IS_COMMUNITY } = require(...))
  // will still hold stale references — middleware functions use the module-level
  // let variables directly, which is the intended runtime path.
  module.exports.EDITION = EDITION;
  module.exports.IS_COMMUNITY = IS_COMMUNITY;
  module.exports.IS_PRO = IS_PRO;

  if (oldEdition !== EDITION) {
    console.log(`[Edition] Upgraded from ${oldEdition.toUpperCase()} to ${EDITION.toUpperCase()}`);
    return true;
  }
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
  const valid = ['community', 'pro', 'enterprise'];
  if (!valid.includes(EDITION)) {
    console.warn(`[SECURITY WARNING] Invalid EDITION value: "${EDITION}". Must be one of: ${valid.join(', ')}. Defaulting to 'community' for security.`);
    upgradeEdition('community');
    return false;
  }

  // Check for perpetual license key
  try {
    const { loadLicenseFromEnv } = require('../services/licenseService');
    const license = loadLicenseFromEnv();
    if (license && license.valid) {
      console.log(`[Edition] Perpetual license detected — licensee: ${license.licensee}, tier: ${license.tier}, seats: ${license.seats === -1 ? 'unlimited' : license.seats}`);
      // Upgrade edition to match license tier
      const effectiveEdition = LICENSE_TIER_TO_EDITION[license.tier] || 'pro';
      if (valid.indexOf(effectiveEdition) > valid.indexOf(EDITION)) {
        upgradeEdition(effectiveEdition);
      }
    }
  } catch (err) {
    // licenseService not critical — log and continue
    console.warn(`[Edition] License check skipped: ${err.message}`);
  }

  console.log(`[Edition] Running in ${EDITION.toUpperCase()} edition`);
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
