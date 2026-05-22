// @tier: community
const { log } = require('../utils/logger');

const REDIS_PREFIX = process.env.REDIS_RATE_LIMIT_PREFIX || 'ratelimit';
// On a transient command error we cool down (fall back to memory) and re-probe
// Redis after this window, rather than permanently disabling the primary path.
const REDIS_COOLDOWN_MS = 30000;

// Lua script: atomic INCR + conditional EXPIRE, returns [count, ttl]
const LUA_INCR_EXPIRE = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return {count, redis.call('TTL', KEYS[1])}
`;

let redisClient = null;
let redisAvailable = false;
let redisInitStarted = false;
let redisCooldownUntil = 0;

function buildRedisConfig() {
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const db = parseInt(process.env.REDIS_DB || '0', 10);
  return process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number.isNaN(port) ? 6379 : port
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: Number.isNaN(db) ? 0 : db
      };
}

async function initRedisClient() {
  if (redisInitStarted) return;
  redisInitStarted = true;

  const redisConfigured = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
  if (!redisConfigured) return;

  try {
    const { createClient } = require('redis');
    const client = createClient(buildRedisConfig());
    client.on('error', (err) => {
      if (redisAvailable) {
        log('warn', 'ratelimit.redis.error', { error: err.message });
      }
      redisAvailable = false;
    });
    client.on('ready', () => {
      redisAvailable = true;
    });
    await client.connect();
    redisClient = client;
    redisAvailable = true;
    log('info', 'ratelimit.redis.connected', {
      message: 'Redis-backed distributed rate limiting enabled'
    });
  } catch (err) {
    log('warn', 'ratelimit.redis.unavailable', {
      error: err.message,
      message: 'Falling back to in-memory rate limiting (single-instance only)'
    });
    redisClient = null;
    redisAvailable = false;
  }
}

// Kick off Redis init if configured — non-blocking startup
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  initRedisClient();
}

async function checkRedisLimit(fullKey, windowSeconds, max) {
  const result = await redisClient.eval(LUA_INCR_EXPIRE, {
    keys: [fullKey],
    arguments: [String(windowSeconds)]
  });
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  return {
    count,
    resetAt: Date.now() + Math.max(0, ttl) * 1000,
    remaining: Math.max(0, max - count)
  };
}

function defaultKeyGenerator(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : 60000;
  const max = Number(options.max) > 0 ? Number(options.max) : 100;
  const keyGenerator = typeof options.keyGenerator === 'function'
    ? options.keyGenerator
    : defaultKeyGenerator;
  const skip = typeof options.skip === 'function'
    ? options.skip
    : () => false;
  const label = String(options.label || 'global');

  // In-memory store kept as fallback when Redis is unavailable
  const store = new Map();
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.resetAt <= now) store.delete(key);
    }
  }, Math.max(windowMs, 60000));
  if (typeof gcInterval.unref === 'function') gcInterval.unref();

  function checkMemoryLimit(key) {
    const now = Date.now();
    const current = store.get(key);
    const state = (!current || current.resetAt <= now)
      ? { count: 0, resetAt: now + windowMs }
      : current;
    state.count += 1;
    store.set(key, state);
    return {
      count: state.count,
      resetAt: state.resetAt,
      remaining: Math.max(0, max - state.count)
    };
  }

  return async (req, res, next) => {
    if (skip(req)) return next();

    const rawKey = keyGenerator(req);
    let count, resetAt, remaining;

    if (redisClient && redisAvailable && Date.now() >= redisCooldownUntil) {
      try {
        const fullKey = `${REDIS_PREFIX}:${label}:${rawKey}`;
        const windowSeconds = Math.ceil(windowMs / 1000);
        ({ count, resetAt, remaining } = await checkRedisLimit(fullKey, windowSeconds, max));
      } catch (err) {
        log('warn', 'ratelimit.redis.request_error', { error: err.message });
        // Transient command error: cool down to in-memory, then re-probe Redis
        // after REDIS_COOLDOWN_MS instead of disabling the primary path forever.
        redisCooldownUntil = Date.now() + REDIS_COOLDOWN_MS;
        ({ count, resetAt, remaining } = checkMemoryLimit(`${label}:${rawKey}`));
      }
    } else {
      ({ count, resetAt, remaining } = checkMemoryLimit(`${label}:${rawKey}`));
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (count > max) {
      const now = Date.now();
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfterSeconds
      });
    }

    return next();
  };
}

function createOrgRateLimiter(options = {}) {
  return createRateLimiter({
    ...options,
    keyGenerator: (req) => {
      const orgId = req.user && req.user.organization_id
        ? String(req.user.organization_id)
        : defaultKeyGenerator(req);
      return orgId;
    }
  });
}

module.exports = {
  createRateLimiter,
  createOrgRateLimiter
};
