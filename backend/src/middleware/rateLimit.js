// @tier: free
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
  const store = new Map();

  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));

  if (typeof gcInterval.unref === 'function') {
    gcInterval.unref();
  }

  return (req, res, next) => {
    if (skip(req)) return next();

    const now = Date.now();
    const key = `${label}:${keyGenerator(req)}`;
    const current = store.get(key);
    const state = (!current || current.resetAt <= now)
      ? { count: 0, resetAt: now + windowMs }
      : current;

    state.count += 1;
    store.set(key, state);

    const remaining = Math.max(0, max - state.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));

    if (state.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
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
