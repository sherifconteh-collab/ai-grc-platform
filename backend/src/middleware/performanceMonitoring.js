// @tier: community
/**
 * Performance Monitoring Middleware
 * Tracks request performance metrics for deployment monitoring
 */

// In-memory storage for performance metrics (last 1000 requests)
const MAX_METRICS = 1000;
const performanceMetrics = {
  requests: [],
  startTime: Date.now(),
  totalRequests: 0,
  errorCount: 0,
  slowRequests: 0 // Requests > 1000ms
};

/**
 * Track performance metrics for each request
 */
function performanceTracker(req, res, next) {
  const start = process.hrtime.bigint();
  const path = req.path || req.originalUrl;
  
  // Skip static assets and health checks from detailed tracking
  const skipPaths = ['/health', '/favicon.ico'];
  const shouldTrack = !skipPaths.some(p => path.startsWith(p));

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    
    if (shouldTrack) {
      const metric = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: path,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        userId: req.user?.id || null,
        organizationId: req.user?.organization_id || null
      };

      // Keep only last MAX_METRICS requests
      if (performanceMetrics.requests.length >= MAX_METRICS) {
        performanceMetrics.requests.shift();
      }
      performanceMetrics.requests.push(metric);

      // Update counters
      performanceMetrics.totalRequests++;
      if (res.statusCode >= 400) {
        performanceMetrics.errorCount++;
      }
      if (durationMs > 1000) {
        performanceMetrics.slowRequests++;
      }
    }
  });

  next();
}

/**
 * Get current performance statistics
 */
function getPerformanceStats() {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - performanceMetrics.startTime) / 1000);
  
  // Calculate statistics from recent requests
  const recentRequests = performanceMetrics.requests;
  const durations = recentRequests.map(r => r.durationMs);
  
  let avgResponseTime = 0;
  let p50 = 0;
  let p95 = 0;
  let p99 = 0;
  
  if (durations.length > 0) {
    avgResponseTime = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    // Calculate percentiles
    const sorted = [...durations].sort((a, b) => a - b);
    p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  // Group by status code
  const statusCodes = {};
  recentRequests.forEach(r => {
    const code = r.statusCode;
    statusCodes[code] = (statusCodes[code] || 0) + 1;
  });

  // Group by endpoint
  const endpointStats = {};
  recentRequests.forEach(r => {
    const endpoint = `${r.method} ${r.path}`;
    if (!endpointStats[endpoint]) {
      endpointStats[endpoint] = {
        count: 0,
        totalDuration: 0,
        avgDuration: 0
      };
    }
    endpointStats[endpoint].count++;
    endpointStats[endpoint].totalDuration += r.durationMs;
  });

  // Calculate averages for endpoints
  Object.keys(endpointStats).forEach(endpoint => {
    const stats = endpointStats[endpoint];
    stats.avgDuration = Number((stats.totalDuration / stats.count).toFixed(2));
    delete stats.totalDuration;
  });

  // Get top 10 slowest endpoints
  const slowestEndpoints = Object.entries(endpointStats)
    .sort((a, b) => b[1].avgDuration - a[1].avgDuration)
    .slice(0, 10)
    .map(([endpoint, stats]) => ({ endpoint, ...stats }));

  return {
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds)
    },
    requests: {
      total: performanceMetrics.totalRequests,
      tracked: recentRequests.length,
      errors: performanceMetrics.errorCount,
      errorRate: performanceMetrics.totalRequests > 0 
        ? ((performanceMetrics.errorCount / performanceMetrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      slowRequests: performanceMetrics.slowRequests,
      slowRate: performanceMetrics.totalRequests > 0
        ? ((performanceMetrics.slowRequests / performanceMetrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    },
    responseTime: {
      avg: Number(avgResponseTime.toFixed(2)),
      p50: Number(p50.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      p99: Number(p99.toFixed(2))
    },
    statusCodes,
    slowestEndpoints,
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
}

/**
 * Get detailed recent requests
 */
function getRecentRequests(limit = 50) {
  return performanceMetrics.requests.slice(-limit).reverse();
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

/**
 * Reset performance metrics (useful for testing)
 */
function resetMetrics() {
  performanceMetrics.requests = [];
  performanceMetrics.startTime = Date.now();
  performanceMetrics.totalRequests = 0;
  performanceMetrics.errorCount = 0;
  performanceMetrics.slowRequests = 0;
}

module.exports = {
  performanceTracker,
  getPerformanceStats,
  getRecentRequests,
  resetMetrics
};
