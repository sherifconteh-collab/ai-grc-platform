// @tier: free
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
  // Starter tier features
  'cmdb': 'starter',
  'assets': 'starter',
  'vulnerabilities': 'starter',
  'environments': 'starter',
  'evidence': 'starter',
  'reports': 'starter',
  'regulatoryNews': 'starter',
  'splunk': 'starter',
  
  // Professional tier features
  'sbom': 'professional',
  'aibom': 'professional',
  'serviceAccounts': 'professional',
  'threatIntel': 'professional',
  'dataSovereignty': 'professional',
  'siem': 'professional',
  'sso': 'professional',
  'realtime': 'professional',
  'tprm': 'professional',
  
  // Enterprise tier features
  'vendorSecurity': 'enterprise',
  'externalAi': 'enterprise',
  
  // Advanced features
  'cemcp': 'professional', // Code Execution MCP security
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
 * Validation: Ensure EDITION env var is set correctly
 * Call this at server startup
 */
function validateEdition() {
  const valid = ['community', 'pro', 'enterprise'];
  if (!valid.includes(EDITION)) {
    console.warn(`[SECURITY WARNING] Invalid EDITION value: "${EDITION}". Must be one of: ${valid.join(', ')}. Defaulting to 'community' for security.`);
    // Force to community as fail-safe and update module-level vars
    process.env.EDITION = 'community';
    EDITION = 'community';
    IS_COMMUNITY = true;
    IS_PRO = false;
    return false;
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
  EDITION,
  IS_COMMUNITY,
  IS_PRO,
  PRO_FEATURES
};
