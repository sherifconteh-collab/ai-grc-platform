require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const pool = require('./config/database');
const { attachRequestContext } = require('./middleware/requestContext');
const { createRateLimiter } = require('./middleware/rateLimit');
const { log, requestLogger, serializeError } = require('./utils/logger');
const { performanceTracker } = require('./middleware/performanceMonitoring');
const { SECURITY_CONFIG } = require('./config/security');
const { validateEdition, getEditionInfo, attachEditionInfo } = require('./middleware/edition');
const { getRedisAdapterStatus } = require('./services/websocketService');

const app = express();
const PORT = process.env.PORT || 3001;
const corsOrigins = SECURITY_CONFIG.corsOrigins;
const allowAnyOrigin = corsOrigins.includes('*');

if (process.env.TRUST_PROXY !== undefined) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
}

const loginRateLimiter = createRateLimiter({
  label: 'auth-login',
  windowMs: SECURITY_CONFIG.authRateLimitWindowMs,
  max: SECURITY_CONFIG.authRateLimitMax
});
const registerRateLimiter = createRateLimiter({
  label: 'auth-register',
  windowMs: SECURITY_CONFIG.authRateLimitWindowMs,
  max: Math.max(5, Math.floor(SECURITY_CONFIG.authRateLimitMax / 2))
});
const refreshRateLimiter = createRateLimiter({
  label: 'auth-refresh',
  windowMs: SECURITY_CONFIG.refreshRateLimitWindowMs,
  max: SECURITY_CONFIG.refreshRateLimitMax
});
const passwordRecoveryRateLimiter = createRateLimiter({
  label: 'auth-password-recovery',
  windowMs: SECURITY_CONFIG.authRateLimitWindowMs,
  max: Math.max(5, Math.floor(SECURITY_CONFIG.authRateLimitMax / 2))
});
const apiRateLimiter = createRateLimiter({
  label: 'api',
  windowMs: SECURITY_CONFIG.apiRateLimitWindowMs,
  max: SECURITY_CONFIG.apiRateLimitMax,
  skip: (req) => {
    const p = req.path || '';
    return p.startsWith('/auth/login')
      || p.startsWith('/auth/register')
      || p.startsWith('/auth/refresh')
      || p.startsWith('/webhooks')
      || p.startsWith('/openclaw');
  }
});

// Middleware
app.disable('x-powered-by');
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowAnyOrigin || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'");
  if (SECURITY_CONFIG.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(attachRequestContext);

app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    // Capture raw body for webhook signature verification
    if (req.url && req.url.includes('/openclaw')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(performanceTracker);
app.use(requestLogger);
app.use('/api/v1/auth/login', loginRateLimiter);
app.use('/api/v1/auth/register', registerRateLimiter);
app.use('/api/v1/auth/refresh', refreshRateLimiter);
app.use('/api/v1/auth/forgot-password', passwordRecoveryRateLimiter);
app.use('/api/v1/auth/reset-password', passwordRecoveryRateLimiter);
app.use('/api/v1', apiRateLimiter);

// Validate edition at startup
validateEdition();

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI GRC Platform (Community Edition)',
    status: 'online',
    version: 'v1',
    health: '/health',
    apiBase: '/api/v1',
    requestId: req.requestId
  });
});

// Edition info endpoint (public)
app.get('/edition', attachEditionInfo, (req, res) => {
  res.json({
    success: true,
    ...req.edition
  });
});

app.get('/health', async (req, res) => {
  try {
    const start = process.hrtime.bigint();
    await pool.query('SELECT 1');
    const dbLatency = Number(process.hrtime.bigint() - start) / 1_000_000;

    const memory = process.memoryUsage();
    const redisStatus = getRedisAdapterStatus();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        latency: Number(dbLatency.toFixed(2)) + ' ms'
      },
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + ' MB'
      },
      uptime: Math.floor(process.uptime()) + ' seconds',
      requestId: req.requestId,
      realtime: {
        websocket: {
          adapter: redisStatus.mode,
          redis: {
            status: redisStatus.status,
            required: redisStatus.required,
            configured: redisStatus.configured,
            ...(redisStatus.error ? { error: redisStatus.error } : {})
          }
        }
      }
    };

    if (redisStatus.required && redisStatus.status !== 'connected') {
      health.status = 'degraded';
    }

    if (process.env.RAILWAY_ENVIRONMENT_NAME) {
      health.railway = {
        environment: process.env.RAILWAY_ENVIRONMENT_NAME,
        serviceId: process.env.RAILWAY_SERVICE_ID || null,
        deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null
      };
    }

    res.json(health);
  } catch (error) {
    const redisStatus = getRedisAdapterStatus();

    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: error.message
      },
      uptime: Math.floor(process.uptime()) + ' seconds',
      requestId: req.requestId,
      realtime: {
        websocket: {
          adapter: redisStatus.mode,
          redis: {
            status: redisStatus.status,
            required: redisStatus.required,
            configured: redisStatus.configured,
            ...(redisStatus.error ? { error: redisStatus.error } : {})
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Community-edition routes
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const frameworksRoutes = require('./routes/frameworks');
const organizationsRoutes = require('./routes/organizations');
const controlsRoutes = require('./routes/controls');
const implementationsRoutes = require('./routes/implementations');
const auditRoutes = require('./routes/audit');
const auditFieldsRoutes = require('./routes/auditFields');
const rolesRoutes = require('./routes/roles');
const usersRoutes = require('./routes/users');
const aiRoutes = require('./routes/ai');
const assessmentsRoutes = require('./routes/assessments');
const notificationsRoutes = require('./routes/notifications');
const dynamicConfigRoutes = require('./routes/dynamicConfig');
const poamRoutes = require('./routes/poam');
const exceptionsRoutes = require('./routes/exceptions');
const controlHealthRoutes = require('./routes/controlHealth');
const dashboardBuilderRoutes = require('./routes/dashboardBuilder');
const webhookRoutes = require('./routes/webhooks');
const auditorWorkspaceRoutes = require('./routes/auditorWorkspace');
const opsRoutes = require('./routes/ops');
const performanceRoutes = require('./routes/performance');
const policiesRoutes = require('./routes/policies');
const helpRoutes = require('./routes/help');
const issueReportRoutes = require('./routes/issueReport');
const totpRoutes = require('./routes/totp');
const openclawWebhookRoutes = require('./routes/openclawWebhook');

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/frameworks', frameworksRoutes);
app.use('/api/v1/organizations', organizationsRoutes);
app.use('/api/v1/controls', controlsRoutes);
app.use('/api/v1/implementations', implementationsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/audit', auditFieldsRoutes);
app.use('/api/v1/roles', rolesRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/assessments', assessmentsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/config', dynamicConfigRoutes);
app.use('/api/v1/poam', poamRoutes);
app.use('/api/v1/exceptions', exceptionsRoutes);
app.use('/api/v1/control-health', controlHealthRoutes);
app.use('/api/v1/dashboard-builder', dashboardBuilderRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/auditor-workspace', auditorWorkspaceRoutes);
app.use('/api/v1/ops', opsRoutes);
app.use('/api/v1/performance', performanceRoutes);
app.use('/api/v1/policies', policiesRoutes);
app.use('/api/v1/help', helpRoutes);
app.use('/api/v1/issue-report', issueReportRoutes);
app.use('/api/v1/auth/totp', totpRoutes);
app.use('/api/v1/openclaw/webhook', openclawWebhookRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  const correlationId = req.requestId;
  log('error', 'request.failed', {
    requestId: correlationId,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id || null,
    organizationId: req.user?.organization_id || null,
    error: serializeError(err)
  });

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    correlationId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', correlationId: req.requestId });
});

// ensurePlatformAdmin – premium feature, no-op in community edition
// async function ensurePlatformAdmin() { /* premium feature */ }

// Auto-seed assessment procedures if the table is empty
async function ensureAssessmentProcedures() {
  let count;
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT COUNT(*) AS count FROM assessment_procedures');
      count = parseInt(rows[0].count, 10);
    } finally {
      client.release();
    }
  } catch (err) {
    log('info', 'assessment.procedures.check', { status: 'table_missing', error: err.message });
    return;
  }
  if (count > 0) {
    log('info', 'assessment.procedures.check', { status: 'exists', count });
    return;
  }
  log('info', 'assessment.procedures.seeding', { status: 'starting' });
  const scriptPath = path.join(__dirname, '../scripts/seed-assessment-procedures-rich-all.js');
  try {
    require('fs').accessSync(scriptPath);
  } catch {
    log('info', 'assessment.procedures.seeding', { status: 'skipped', reason: 'seed script not found' });
    return;
  }
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [scriptPath], { env: process.env, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Seed exited with code ${code}`)));
    child.on('error', reject);
  });
  log('info', 'assessment.procedures.seeded', { status: 'done' });
}

// Start server
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  log('info', 'server.started', {
    host: HOST,
    port: Number(PORT),
    health: `http://localhost:${PORT}/health`,
    environment: process.env.NODE_ENV || 'development',
    edition: 'community'
  });

  // Initialize WebSocket server after HTTP server is ready
  const { initializeWebSocket } = require('./services/websocketService');
  initializeWebSocket(server);

  // Auto-seed assessment procedures if table is empty
  ensureAssessmentProcedures().catch((err) =>
    log('error', 'assessment.procedures.startup_error', { error: err.message })
  );
});

// Graceful shutdown
function shutdown(signal) {
  log('warn', 'server.shutdown.requested', { signal });
  server.close(() => {
    log('info', 'server.http.closed');
    pool.end(() => {
      log('info', 'server.db.closed');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
