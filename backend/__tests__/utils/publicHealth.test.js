'use strict';

const { publicHealth } = require('../../src/utils/publicHealth');

const FULL = {
  status: 'healthy',
  timestamp: '2026-10-20T00:00:00.000Z',
  database: { status: 'connected', latency: '1.20 ms', missingConfig: ['DATABASE_URL'], error: 'boom' },
  memory: { rss: '120 MB', heapUsed: '60 MB' },
  uptime: '3600 seconds',
  requestId: 'req-1',
  realtime: { websocket: { adapter: 'redis', redis: { status: 'connected', required: true, configured: true, error: 'x' } } },
  railway: { environment: 'production', serviceId: 'svc', deploymentId: 'dep' }
};

describe('publicHealth', () => {
  test('keeps the verdict and the connection states', () => {
    expect(publicHealth(FULL, 'req-1')).toEqual({
      status: 'healthy',
      timestamp: '2026-10-20T00:00:00.000Z',
      database: { status: 'connected' },
      realtime: { websocket: { redis: { status: 'connected' } } },
      requestId: 'req-1'
    });
  });

  test('leaks no memory, uptime, latency, platform ids, config names or error text', () => {
    const text = JSON.stringify(publicHealth(FULL, 'req-1'));
    for (const secret of ['rss', 'heapUsed', 'uptime', 'latency', 'railway', 'svc', 'dep', 'DATABASE_URL', 'boom', 'adapter']) {
      expect(text).not.toContain(secret);
    }
  });

  test('a degraded body without redis details still renders', () => {
    const degraded = { status: 'degraded', timestamp: 't', database: { status: 'disconnected' }, realtime: undefined };
    expect(publicHealth(degraded).realtime.websocket.redis.status).toBe('unknown');
    expect(publicHealth(degraded).status).toBe('degraded');
  });
});
