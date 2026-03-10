const crypto = require('crypto');

const NODE_ENV = (process.env.NODE_ENV || 'development').toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';

function parsePositiveInt(value, fallback, limits = {}) {
  const { min = 1, max = Number.MAX_SAFE_INTEGER } = limits;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function resolveJwtSecret() {
  const configuredSecret = String(process.env.JWT_SECRET || '').trim();

  if (!configuredSecret) {
    if (IS_PRODUCTION) {
      throw new Error('JWT_SECRET must be configured in production.');
    }

    // Avoid shipping a predictable default secret in non-prod.
    const ephemeralSecret = crypto.randomBytes(64).toString('hex');
    console.warn('[security] JWT_SECRET is not set. Using an ephemeral development secret.');
    return ephemeralSecret;
  }

  if (IS_PRODUCTION && configuredSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }

  if (!IS_PRODUCTION && configuredSecret.length < 32) {
    console.warn('[security] JWT_SECRET is shorter than 32 characters. Generate a stronger secret with: npm run security:generate-jwt-secret');
  }

  return configuredSecret;
}

const JWT_SECRET = resolveJwtSecret();

const SECURITY_CONFIG = {
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  authRateLimitWindowMs: parsePositiveInt(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    { min: 1000, max: 24 * 60 * 60 * 1000 }
  ),
  authRateLimitMax: parsePositiveInt(
    process.env.AUTH_RATE_LIMIT_MAX,
    100,
    { min: 1, max: 10000 }
  ),
  refreshRateLimitWindowMs: parsePositiveInt(
    process.env.REFRESH_RATE_LIMIT_WINDOW_MS,
    60 * 1000,
    { min: 1000, max: 24 * 60 * 60 * 1000 }
  ),
  refreshRateLimitMax: parsePositiveInt(
    process.env.REFRESH_RATE_LIMIT_MAX,
    120,
    { min: 1, max: 10000 }
  ),
  apiRateLimitWindowMs: parsePositiveInt(
    process.env.API_RATE_LIMIT_WINDOW_MS,
    60 * 1000,
    { min: 1000, max: 24 * 60 * 60 * 1000 }
  ),
  apiRateLimitMax: parsePositiveInt(
    process.env.API_RATE_LIMIT_MAX,
    2000,
    { min: 1, max: 100000 }
  ),
  lockoutMaxAttempts: parsePositiveInt(
    process.env.LOCKOUT_MAX_ATTEMPTS,
    5,
    { min: 1, max: 100 }
  ),
  lockoutDurationMs: parsePositiveInt(
    process.env.LOCKOUT_DURATION_MS,
    15 * 60 * 1000,
    { min: 1000, max: 24 * 60 * 60 * 1000 }
  )
};

module.exports = {
  JWT_SECRET,
  SECURITY_CONFIG
};
