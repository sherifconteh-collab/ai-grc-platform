'use strict';

// What an anonymous caller gets. A liveness probe needs the verdict and the
// connection states and nothing else: no memory, uptime, latency, platform
// ids, missing-config names or error text. Still HTTP 200 when the database is
// down, because railway.json and the Dockerfile HEALTHCHECK treat non-200 as dead.
function publicHealth(full, requestId) {
  const redis = full.realtime && full.realtime.websocket && full.realtime.websocket.redis;
  return {
    status: full.status,
    timestamp: full.timestamp,
    database: { status: full.database.status },
    realtime: { websocket: { redis: { status: redis ? redis.status : 'unknown' } } },
    requestId
  };
}

module.exports = { publicHealth };
