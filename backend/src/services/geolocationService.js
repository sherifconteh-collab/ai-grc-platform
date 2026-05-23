// @tier: enterprise
'use strict';

/**
 * Geolocation Service
 * 
 * Provides IP-based geolocation for data sovereignty planning and compliance tracking.
 * Uses geoip-lite for offline IP lookup without external API dependencies.
 */

const geoip = require('geoip-lite');

/**
 * Map country codes to broader geographic regions for data sovereignty planning
 * Based on common data residency regions and regulatory jurisdictions
 */
const COUNTRY_TO_REGION_MAP = {
  // North America
  'US': 'North America',
  'CA': 'North America',
  'MX': 'North America',
  
  // Europe
  'GB': 'Europe',
  'DE': 'Europe',
  'FR': 'Europe',
  'IT': 'Europe',
  'ES': 'Europe',
  'NL': 'Europe',
  'BE': 'Europe',
  'CH': 'Europe',
  'AT': 'Europe',
  'SE': 'Europe',
  'NO': 'Europe',
  'DK': 'Europe',
  'FI': 'Europe',
  'IE': 'Europe',
  'PL': 'Europe',
  'PT': 'Europe',
  'GR': 'Europe',
  'CZ': 'Europe',
  'RO': 'Europe',
  'HU': 'Europe',
  
  // Asia Pacific
  'CN': 'Asia Pacific',
  'JP': 'Asia Pacific',
  'IN': 'Asia Pacific',
  'SG': 'Asia Pacific',
  'KR': 'Asia Pacific',
  'AU': 'Asia Pacific',
  'NZ': 'Asia Pacific',
  'TH': 'Asia Pacific',
  'MY': 'Asia Pacific',
  'ID': 'Asia Pacific',
  'PH': 'Asia Pacific',
  'VN': 'Asia Pacific',
  'HK': 'Asia Pacific',
  'TW': 'Asia Pacific',
  
  // Middle East
  'AE': 'Middle East',
  'SA': 'Middle East',
  'IL': 'Middle East',
  'QA': 'Middle East',
  'KW': 'Middle East',
  'BH': 'Middle East',
  'OM': 'Middle East',
  'JO': 'Middle East',
  'LB': 'Middle East',
  
  // Latin America
  'BR': 'Latin America',
  'AR': 'Latin America',
  'CL': 'Latin America',
  'CO': 'Latin America',
  'PE': 'Latin America',
  'VE': 'Latin America',
  'EC': 'Latin America',
  'CR': 'Latin America',
  'PA': 'Latin America',
  'UY': 'Latin America',
  
  // Africa
  'ZA': 'Africa',
  'NG': 'Africa',
  'KE': 'Africa',
  'EG': 'Africa',
  'MA': 'Africa',
  'GH': 'Africa',
  'TN': 'Africa',
  'ET': 'Africa',
  'UG': 'Africa',
  'TZ': 'Africa'
};

/**
 * Extract IP address from Express request object
 * Handles proxies, load balancers, and direct connections
 * 
 * @param {Object} req - Express request object
 * @returns {string|null} - IP address or null if not found
 */
function extractIpFromRequest(req) {
  if (!req) return null;
  
  // Ensure headers object exists
  const headers = req.headers || {};
  
  // Check X-Forwarded-For header (from proxies/load balancers)
  const xForwardedFor = headers['x-forwarded-for'];
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first (original client)
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }
  
  // Check X-Real-IP header (alternative proxy header)
  const xRealIp = headers['x-real-ip'];
  if (xRealIp) {
    return xRealIp.trim();
  }
  
  // Check CF-Connecting-IP (Cloudflare)
  const cfConnectingIp = headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  
  // Fall back to Express req.ip (uses trust proxy setting)
  if (req.ip) {
    let ip = req.ip;
    // Clean up IPv6-mapped IPv4 addresses
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    return ip;
  }
  
  // Last resort: socket remote address
  if (req.connection?.remoteAddress) {
    let ip = req.connection.remoteAddress;
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    return ip;
  }
  
  if (req.socket?.remoteAddress) {
    let ip = req.socket.remoteAddress;
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    return ip;
  }
  
  return null;
}

/**
 * Get geolocation data from IP address
 * 
 * @param {string} ipAddress - IP address to lookup
 * @returns {Object|null} - Geolocation data or null if not found
 * @returns {string} .country_code - ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB')
 * @returns {string} .country_name - Full country name (e.g., 'United States')
 * @returns {string} .region - Geographic region (e.g., 'North America', 'Europe')
 * @returns {string} .continent - Continent code (e.g., 'NA', 'EU', 'AS')
 * @returns {Array<number>} .coordinates - [latitude, longitude]
 */
function lookupIpGeolocation(ipAddress) {
  if (!ipAddress || typeof ipAddress !== 'string') {
    return null;
  }
  
  // Clean up IP address (remove IPv6 prefix if present)
  let cleanIp = ipAddress.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }
  
  // Skip private/local IPs
  if (cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp === '::1') {
    return null;
  }
  
  try {
    const geo = geoip.lookup(cleanIp);
    if (!geo) {
      return null;
    }
    
    const countryCode = geo.country;
    const region = COUNTRY_TO_REGION_MAP[countryCode] || 'Other';
    
    return {
      country_code: countryCode,
      country_name: getCountryName(countryCode),
      region: region,
      continent: geo.continent || null,
      coordinates: geo.ll || null
    };
  } catch (error) {
    console.error('Geolocation lookup error:', error);
    return null;
  }
}

/**
 * Get full country name from country code
 * Returns the country code if name is not available
 * 
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {string} - Full country name or country code
 */
function getCountryName(countryCode) {
  const countryNames = {
    'US': 'United States',
    'CA': 'Canada',
    'GB': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'IT': 'Italy',
    'ES': 'Spain',
    'NL': 'Netherlands',
    'BE': 'Belgium',
    'CH': 'Switzerland',
    'AT': 'Austria',
    'SE': 'Sweden',
    'NO': 'Norway',
    'DK': 'Denmark',
    'FI': 'Finland',
    'IE': 'Ireland',
    'PL': 'Poland',
    'PT': 'Portugal',
    'GR': 'Greece',
    'CZ': 'Czech Republic',
    'RO': 'Romania',
    'HU': 'Hungary',
    'CN': 'China',
    'JP': 'Japan',
    'IN': 'India',
    'SG': 'Singapore',
    'KR': 'South Korea',
    'AU': 'Australia',
    'NZ': 'New Zealand',
    'BR': 'Brazil',
    'AR': 'Argentina',
    'MX': 'Mexico',
    'ZA': 'South Africa',
    'AE': 'United Arab Emirates',
    'SA': 'Saudi Arabia',
    'IL': 'Israel'
  };
  
  return countryNames[countryCode] || countryCode;
}

/**
 * Get geolocation from Express request
 * Convenience method that combines IP extraction and geolocation lookup
 * 
 * @param {Object} req - Express request object
 * @returns {Object|null} - Geolocation data or null if not found
 */
function getGeolocationFromRequest(req) {
  const ipAddress = extractIpFromRequest(req);
  if (!ipAddress) {
    return null;
  }
  
  return lookupIpGeolocation(ipAddress);
}

module.exports = {
  extractIpFromRequest,
  lookupIpGeolocation,
  getGeolocationFromRequest,
  getCountryName
};
