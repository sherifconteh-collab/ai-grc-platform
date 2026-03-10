// @tier: free
/**
 * Performance Monitoring Routes
 * Provides endpoints for monitoring application performance on Railway
 * 
 * Security:
 * - All endpoints require admin permission
 * - Protected by application-wide API rate limiter (configured in server.js)
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requirePermission } = require('../middleware/auth');
const { getPerformanceStats, getRecentRequests } = require('../middleware/performanceMonitoring');

/**
 * GET /api/v1/performance/stats
 * Get current performance statistics
 * Requires admin permission
 */
router.get('/stats', requirePermission('admin'), async (req, res) => {
  try {
    const stats = getPerformanceStats();
    
    // Add database connection pool stats
    try {
      const poolStats = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      };
      stats.database = poolStats;
    } catch (err) {
      stats.database = { error: 'Unable to get pool stats' };
    }

    // Add database query performance test
    try {
      const start = process.hrtime.bigint();
      await pool.query('SELECT 1');
      const dbLatency = Number(process.hrtime.bigint() - start) / 1_000_000;
      stats.database.latency = Number(dbLatency.toFixed(2)) + ' ms';
    } catch (err) {
      stats.database.latency = 'error';
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Performance stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get performance statistics'
    });
  }
});

/**
 * GET /api/v1/performance/requests
 * Get recent request history
 * Requires admin permission
 */
router.get('/requests', requirePermission('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const requests = getRecentRequests(Math.min(limit, 500));
    
    res.json({
      success: true,
      data: {
        count: requests.length,
        requests
      }
    });
  } catch (error) {
    console.error('Performance requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent requests'
    });
  }
});

/**
 * GET /api/v1/performance/database
 * Get database performance metrics
 * Requires admin permission
 */
router.get('/database', requirePermission('admin'), async (req, res) => {
  try {
    const metrics = {};

    // Connection pool stats
    metrics.pool = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };

    // Test query latency
    const start = process.hrtime.bigint();
    await pool.query('SELECT 1');
    const latency = Number(process.hrtime.bigint() - start) / 1_000_000;
    metrics.latency = Number(latency.toFixed(2));

    // Database size (if available)
    try {
      const sizeResult = await pool.query(`
        SELECT 
          pg_database_size(current_database()) as size_bytes,
          pg_size_pretty(pg_database_size(current_database())) as size_pretty
      `);
      if (sizeResult.rows[0]) {
        metrics.size = sizeResult.rows[0].size_pretty;
        metrics.sizeBytes = parseInt(sizeResult.rows[0].size_bytes);
      }
    } catch (err) {
      // Size query might fail due to permissions
      metrics.size = 'unavailable';
    }

    // Active connections
    try {
      const connResult = await pool.query(`
        SELECT count(*) as active_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      if (connResult.rows[0]) {
        metrics.activeConnections = parseInt(connResult.rows[0].active_connections);
      }
    } catch (err) {
      metrics.activeConnections = 'unavailable';
    }

    // Slow queries (if pg_stat_statements is available)
    try {
      const slowQueriesResult = await pool.query(`
        SELECT 
          calls,
          mean_exec_time::numeric(10,2) as avg_time_ms,
          max_exec_time::numeric(10,2) as max_time_ms,
          substring(query, 1, 100) as query_preview
        FROM pg_stat_statements
        WHERE mean_exec_time > 100
        ORDER BY mean_exec_time DESC
        LIMIT 5
      `);
      metrics.slowQueries = slowQueriesResult.rows;
    } catch (err) {
      // pg_stat_statements might not be enabled
      metrics.slowQueries = [];
    }

    // Table sizes (top 10)
    try {
      const tablesResult = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);
      metrics.largestTables = tablesResult.rows;
    } catch (err) {
      metrics.largestTables = [];
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Database performance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database performance metrics'
    });
  }
});

/**
 * GET /api/v1/performance/system
 * Get system resource metrics
 * Requires admin permission
 */
router.get('/system', requirePermission('admin'), (req, res) => {
  try {
    const memory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const metrics = {
      memory: {
        rss: memory.rss,
        rssMB: Math.round(memory.rss / 1024 / 1024),
        heapUsed: memory.heapUsed,
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: memory.heapTotal,
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        external: memory.external,
        externalMB: Math.round(memory.external / 1024 / 1024),
        arrayBuffers: memory.arrayBuffers,
        arrayBuffersMB: Math.round(memory.arrayBuffers / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(Math.floor(process.uptime())),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3001,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT_NAME,
        railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME || null
      }
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('System metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system metrics'
    });
  }
});

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

module.exports = router;
