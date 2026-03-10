// @tier: free
const { randomUUID } = require('crypto');

function attachRequestContext(req, res, next) {
  const incomingRequestId = req.headers['x-request-id'];
  req.requestId = (typeof incomingRequestId === 'string' && incomingRequestId.trim())
    ? incomingRequestId.trim()
    : randomUUID();

  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = {
  attachRequestContext
};