// @tier: community
// Shared Redis caching helper. Auto-initializes when REDIS_URL or REDIS_HOST is set.
// All operations fail silently when Redis is unavailable — callers always get a result.
const { log } = require('./logger');

let _redis = null;
let _initStarted = false;
let _available = false;

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

async function initRedis() {
  if (_initStarted) return;
  _initStarted = true;

  const configured = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
  if (!configured) return;

  try {
    const { createClient } = require('redis');
    const client = createClient(buildRedisConfig());
    client.on('error', () => { _available = false; });
    client.on('ready', () => { _available = true; });
    await client.connect();
    _redis = client;
    _available = true;
    log('info', 'rediscache.connected', { message: 'Redis response cache enabled' });
  } catch (err) {
    log('warn', 'rediscache.unavailable', {
      error: err.message,
      message: 'Response caching disabled (Redis unavailable)'
    });
  }
}

if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  initRedis();
}

// getCached(key, ttlSeconds, fn) — returns cached value or calls fn() and caches the result.
async function getCached(key, ttlSeconds, fn) {
  if (_available && _redis) {
    try {
      const cached = await _redis.get(key);
      if (cached !== null) return JSON.parse(cached);
    } catch (_err) {
      // Redis read failure — fall through to source
    }
  }

  const result = await fn();

  if (_available && _redis) {
    try {
      await _redis.set(key, JSON.stringify(result), { EX: ttlSeconds });
    } catch (_err) {
      // Redis write failure — result is still returned to caller
    }
  }

  return result;
}

async function invalidateCached(key) {
  if (!_available || !_redis) return;
  try {
    await _redis.del(key);
  } catch (_err) {
    // Non-fatal
  }
}

async function invalidateCachedPattern(pattern) {
  if (!_available || !_redis) return;
  try {
    for await (const key of _redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await _redis.del(key);
    }
  } catch (_err) {
    // Non-fatal
  }
}

module.exports = { getCached, invalidateCached, invalidateCachedPattern };
