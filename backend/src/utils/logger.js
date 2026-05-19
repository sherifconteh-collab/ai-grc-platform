// @tier: community
let _sentryClient = null;

function setSentryClient(sentry) {
  _sentryClient = sentry;
}

function serializeError(err) {
  if (!err) return null;
  return {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
}

function log(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    if (_sentryClient) {
      const err = meta instanceof Error ? meta : (meta.error instanceof Error ? meta.error : null);
      if (err) {
        _sentryClient.captureException(err);
      } else {
        _sentryClient.captureMessage(message, 'error');
      }
    }
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    log('info', 'request.completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user?.id || null,
      organizationId: req.user?.organization_id || null,
      ip: req.ip
    });
  });

  next();
}

module.exports = {
  log,
  serializeError,
  requestLogger,
  setSentryClient
};