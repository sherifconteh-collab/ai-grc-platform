require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const pool = require('./config/database');
const { attachRequestContext } = require('./middleware/requestContext');
const { createRateLimiter } = require('./middleware/rateLimit');
const { log, requestLogger, serializeError } = require('./utils/logger');
const { performanceTracker } = require('./middleware/performanceMonitoring');
// safeRequire is defined here (before any conditional imports) so it can be used
// for services and routes that are absent in the community/public-mirror build.
function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    // MODULE_NOT_FOUND with the exact path = file absent (expected in mirror).
    // Any other error (syntax, nested dependency) should be surfaced.
    if (e.code === 'MODULE_NOT_FOUND' && e.message && e.message.includes(modulePath)) {
      return null;
    }
    throw e;
  }
}
const _reminderMod = safeRequire('./services/reminderService');
const startReminderScheduler = _reminderMod ? _reminderMod.startReminderScheduler : null;
const { SECURITY_CONFIG } = require('./config/security');
const { validateEdition, getEditionInfo, attachEditionInfo } = require('./middleware/edition');
const { getRedisAdapterStatus } = require('./services/websocketService');

const app = express();
const PORT = process.env.PORT || 3001;
const openclawWebhookEnabled = String(process.env.OPENCLAW_WEBHOOK_SECRET || '').trim().length > 0;
const corsOrigins = SECURITY_CONFIG.corsOrigins;
const allowAnyOrigin = corsOrigins.includes('*');

function loadOptionalRoute(modulePath, routeLabel, enabled) {
  if (!enabled) {
    return null;
  }

  try {
    return require(modulePath);
  } catch (error) {
    log('error', 'server.optional_route_load_failed', {
      route: routeLabel,
      modulePath,
      error: serializeError(error)
    });
    return null;
  }
}

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
    const path = req.path || '';
    return path.startsWith('/auth/login')
      || path.startsWith('/auth/register')
      || path.startsWith('/auth/refresh')
      || path.startsWith('/webhooks')
      || path.startsWith('/openclaw')
      || path.startsWith('/external-ai');
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

// Stripe webhook needs raw body for signature verification
// Must be registered before express.json() middleware
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }));
if (openclawWebhookEnabled) {
  app.use('/api/v1/openclaw/webhook', express.raw({ type: 'application/json' }));
}

app.use(express.json({ limit: '2mb' }));
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

// Audit encryption strength at startup — verifies CNSA Suite 1.0 compliance
// (CNSA Suite policy: Transition to Stronger Public Key Algorithms).
// Logs posture to structured log; fails hard if production keys are absent.
(function auditEncryptionAtStartup() {
  const { auditEncryptionStrength } = require('./utils/encrypt');
  const report = auditEncryptionStrength();
  const level = report.compliant ? 'info' : 'warn';
  log(level, 'server.startup.encryption_audit', {
    compliant: report.compliant,
    cnsa_suite: report.cnsa_suite,
    summary: report.summary,
    checks: report.checks
  });
  if (!report.compliant) {
    const failures = report.checks.filter((c) => c.status === 'fail').map((c) => c.detail).join('; ');
    if (SECURITY_CONFIG.isProduction) {
      throw new Error(`Encryption audit failed — production cannot start with compliance failures: ${failures}`);
    }
  }
})();

// Validate required environment variables at startup.
// Failing early with a clear message is far better than silently misbehaving
// in production (addresses "no environment variable validation at startup").
(function validateRequiredEnv() {
  const hasDatabaseUrl = Boolean(String(process.env.DATABASE_URL || '').trim());
  const individualDbVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingIndividual = individualDbVars.filter((v) => !String(process.env[v] || '').trim());
  const hasIndividualDbConfig = missingIndividual.length === 0;

  if (!hasDatabaseUrl && !hasIndividualDbConfig) {
    const msg = `Database connection is not configured. Set DATABASE_URL or provide the missing individual variables: ${missingIndividual.join(', ')}.`;
    if (SECURITY_CONFIG.isProduction) {
      // Hard-fail in production to prevent a broken server from starting.
      throw new Error(msg);
    } else {
      log('warn', 'server.startup.missing_db_config', { message: msg });
    }
  }
})();

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'ControlWeave API',
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
    
    // Add Railway environment info if available
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

    // Return 200 with degraded status so Railway health check treats the
    // container as alive even when the database is temporarily unavailable.
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: 'Database unavailable'
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

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = safeRequire('./routes/dashboard');
const frameworksRoutes = require('./routes/frameworks');
const organizationsRoutes = require('./routes/organizations');
const controlsRoutes = require('./routes/controls');
const implementationsRoutes = require('./routes/implementations');
const evidenceRoutes = safeRequire('./routes/evidence');
const auditRoutes = require('./routes/audit');
const auditFieldsRoutes = require('./routes/auditFields');
const rolesRoutes = require('./routes/roles');
const usersRoutes = require('./routes/users');
const cmdbRoutes = safeRequire('./routes/cmdb');
const assetsRoutes = safeRequire('./routes/assets');
const environmentsRoutes = safeRequire('./routes/environments');
const serviceAccountsRoutes = safeRequire('./routes/serviceAccounts');
const aiRoutes = require('./routes/ai');
const orgSettingsRoutes = safeRequire('./routes/orgSettings');
const assessmentsRoutes = require('./routes/assessments');
const reportsRoutes = safeRequire('./routes/reports');
const notificationsRoutes = require('./routes/notifications');
const splunkRoutes = safeRequire('./routes/splunk');
const vulnerabilitiesRoutes = safeRequire('./routes/vulnerabilities');
const sbomRoutes = safeRequire('./routes/sbom');
const dynamicConfigRoutes = require('./routes/dynamicConfig');
const poamRoutes = require('./routes/poam');
const exceptionsRoutes = require('./routes/exceptions');
const controlHealthRoutes = require('./routes/controlHealth');
const dashboardBuilderRoutes = require('./routes/dashboardBuilder');
const integrationsHubRoutes = safeRequire('./routes/integrationsHub');
const webhookRoutes = require('./routes/webhooks');
const dataGovernanceRoutes = safeRequire('./routes/dataGovernance');
const auditorWorkspaceRoutes = require('./routes/auditorWorkspace');
const opsRoutes = require('./routes/ops');
const passkeyRoutes = safeRequire('./routes/passkeys');
const ssoRoutes = safeRequire('./routes/sso');
const siemRoutes = safeRequire('./routes/siem');
const performanceRoutes = require('./routes/performance');
const externalAiRoutes = safeRequire('./routes/externalAi');
const externalAiKeysRoutes = safeRequire('./routes/externalAiKeys');
const platformAdminRoutes = safeRequire('./routes/platformAdmin');
const billingRoutes = safeRequire('./routes/billing');
const licenseRoutes = require('./routes/license');
const policiesRoutes = require('./routes/policies');
const helpRoutes = require('./routes/help');
// ── Further paid-tier conditional route imports ──
// These routes exist only in the commercial build and are absent from the
// public/community mirror.  safeRequire() returns null if a file is missing.
// Each is guarded by `if (routes) app.use(...)` below.
const phase6Routes = safeRequire('./routes/phase6');
const threatIntelRoutes = safeRequire('./routes/threatIntel');
const vendorSecurityRoutes = safeRequire('./routes/vendorSecurity');
const regulatoryNewsRoutes = safeRequire('./routes/regulatoryNews');
const aiMonitoringRoutes = safeRequire('./routes/aiMonitoring');
const dataSovereigntyRoutes = safeRequire('./routes/dataSovereignty');
const tprmRoutes = safeRequire('./routes/tprm');
const tprmPublicRoutes = safeRequire('./routes/tprmPublic');
const realtimeRoutes = safeRequire('./routes/realtime');
const openclawWebhookRoutes = loadOptionalRoute(
  './routes/openclawWebhook',
  '/api/v1/openclaw/webhook',
  openclawWebhookEnabled
);
const aiGovernanceRoutes = safeRequire('./routes/aiGovernance');
const autoEvidenceCollectionRoutes = safeRequire('./routes/autoEvidenceCollection');
const contactsRoutes = safeRequire('./routes/contacts');
const internationalAiLawsRoutes = safeRequire('./routes/internationalAiLaws');
const issueReportRoutes = require('./routes/issueReport');
const pendingEvidenceRoutes = safeRequire('./routes/pendingEvidence');
const plot4aiRoutes = safeRequire('./routes/plot4ai');
const publicContactRoutes = safeRequire('./routes/publicContact');
const ragRoutes = safeRequire('./routes/rag');
const rmfRoutes = safeRequire('./routes/rmf');
const stateAiLawsRoutes = safeRequire('./routes/stateAiLaws');
const totpRoutes = require('./routes/totp');

// ── Community-mirror startup diagnostic ──
// Routes loaded via safeRequire() are absent when this process runs from the
// public/community mirror build (files not present on disk).  A license key
// upgrade (upgradeEdition) updates tier-gate middleware at runtime, but it
// cannot register route handlers that were never mounted at startup.
// If any paid routes are absent, log a single informational notice so that
// operators understand why paid APIs return 404 even after a license key is
// entered.  To unlock paid features the operator must deploy the commercial
// build, not the community mirror.
const _absentPaidRoutes = [
  ['dashboard',        dashboardRoutes],
  ['evidence',         evidenceRoutes],
  ['cmdb',             cmdbRoutes],
  ['assets',           assetsRoutes],
  ['environments',     environmentsRoutes],
  ['serviceAccounts',  serviceAccountsRoutes],
  ['orgSettings',      orgSettingsRoutes],
  ['reports',          reportsRoutes],
  ['splunk',           splunkRoutes],
  ['vulnerabilities',  vulnerabilitiesRoutes],
  ['sbom',             sbomRoutes],
  ['integrationsHub',  integrationsHubRoutes],
  ['dataGovernance',   dataGovernanceRoutes],
  ['passkeys',         passkeyRoutes],
  ['sso',              ssoRoutes],
  ['siem',             siemRoutes],
  ['externalAi',       externalAiRoutes],
  ['externalAiKeys',   externalAiKeysRoutes],
  ['platformAdmin',    platformAdminRoutes],
  ['billing',          billingRoutes],
].filter(([, mod]) => mod === null).map(([name]) => name);

if (_absentPaidRoutes.length > 0) {
  log('info', 'server.community_mirror', {
    message:
      'Community mirror build detected — the following paid-tier route modules are ' +
      'absent from this installation and will not be served: ' +
      _absentPaidRoutes.join(', ') + '. ' +
      'Activating a license key upgrades edition tier-checks at runtime but cannot register ' +
      'route handlers that were never mounted. To unlock paid API features, deploy the ' +
      'commercial build of ControlWeave.',
    absentRoutes: _absentPaidRoutes
  });
}

app.use('/api/v1/license', licenseRoutes);
if (passkeyRoutes) app.use('/api/v1/auth/passkey', passkeyRoutes);
app.use('/api/v1/auth/totp', totpRoutes);
app.use('/api/v1/auth', authRoutes);
if (ssoRoutes) app.use('/api/v1/sso', ssoRoutes);
if (siemRoutes) app.use('/api/v1/siem', siemRoutes);
if (dashboardRoutes) app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/frameworks', frameworksRoutes);
app.use('/api/v1/organizations', organizationsRoutes);
app.use('/api/v1/controls', controlsRoutes);
app.use('/api/v1/implementations', implementationsRoutes);
if (evidenceRoutes) app.use('/api/v1/evidence', evidenceRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/audit', auditFieldsRoutes); // Dynamic fields management under same base path
app.use('/api/v1/roles', rolesRoutes);
app.use('/api/v1/users', usersRoutes);
if (cmdbRoutes) app.use('/api/v1/cmdb', cmdbRoutes);
if (assetsRoutes) app.use('/api/v1/assets', assetsRoutes);
if (environmentsRoutes) app.use('/api/v1/environments', environmentsRoutes);
if (serviceAccountsRoutes) app.use('/api/v1/service-accounts', serviceAccountsRoutes);
if (assetsRoutes) app.use('/api/assets', assetsRoutes);
if (environmentsRoutes) app.use('/api/environments', environmentsRoutes);
if (serviceAccountsRoutes) app.use('/api/service-accounts', serviceAccountsRoutes);
app.use('/api/v1/ai', aiRoutes);
if (orgSettingsRoutes) app.use('/api/v1/settings', orgSettingsRoutes);
app.use('/api/v1/assessments', assessmentsRoutes);
if (reportsRoutes) app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
if (integrationsHubRoutes) app.use('/api/v1/integrations-hub', integrationsHubRoutes);
if (splunkRoutes) app.use('/api/v1/integrations', splunkRoutes);
if (vulnerabilitiesRoutes) app.use('/api/v1/vulnerabilities', vulnerabilitiesRoutes);
if (sbomRoutes) app.use('/api/v1/sbom', sbomRoutes);
app.use('/api/v1/config', dynamicConfigRoutes);
app.use('/api/v1/poam', poamRoutes);
app.use('/api/v1/exceptions', exceptionsRoutes);
app.use('/api/v1/control-health', controlHealthRoutes);
app.use('/api/v1/dashboard-builder', dashboardBuilderRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
if (dataGovernanceRoutes) app.use('/api/v1/data-governance', dataGovernanceRoutes);
app.use('/api/v1/auditor-workspace', auditorWorkspaceRoutes);
app.use('/api/v1/ops', opsRoutes);
app.use('/api/v1/performance', performanceRoutes);
if (externalAiRoutes) app.use('/api/v1/external-ai', externalAiRoutes);
if (externalAiKeysRoutes) app.use('/api/v1/ai/external-keys', externalAiKeysRoutes);
if (platformAdminRoutes) app.use('/api/v1/platform-admin', platformAdminRoutes);
if (billingRoutes) app.use('/api/v1/billing', billingRoutes);
if (phase6Routes) app.use('/api/v1/phase6', phase6Routes);
if (threatIntelRoutes) app.use('/api/v1/threat-intel', threatIntelRoutes);
if (vendorSecurityRoutes) app.use('/api/v1/vendor-security', vendorSecurityRoutes);
if (regulatoryNewsRoutes) app.use('/api/v1/regulatory-news', regulatoryNewsRoutes);
if (aiMonitoringRoutes) app.use('/api/v1/ai/monitoring', aiMonitoringRoutes);
if (dataSovereigntyRoutes) app.use('/api/v1/data-sovereignty', dataSovereigntyRoutes);
app.use('/api/v1/policies', policiesRoutes);
if (tprmRoutes) app.use('/api/v1/tprm', tprmRoutes);
if (tprmPublicRoutes) app.use('/api/v1/tprm-public', tprmPublicRoutes);
if (realtimeRoutes) app.use('/api/v1/realtime', realtimeRoutes);
if (openclawWebhookRoutes) {
  app.use('/api/v1/openclaw/webhook', openclawWebhookRoutes);
} else if (openclawWebhookEnabled) {
  app.use('/api/v1/openclaw/webhook', (_req, res) => {
    res.status(503).json({
      success: false,
      error: 'OpenClaw webhook is temporarily unavailable'
    });
  });
}
if (aiGovernanceRoutes) app.use('/api/v1/ai-governance', aiGovernanceRoutes);
if (autoEvidenceCollectionRoutes) app.use('/api/v1/auto-evidence', autoEvidenceCollectionRoutes);
if (contactsRoutes) app.use('/api/v1/contacts', contactsRoutes);
app.use('/api/v1/help', helpRoutes);
if (internationalAiLawsRoutes) app.use('/api/v1/international-ai-laws', internationalAiLawsRoutes);
app.use('/api/v1/issues', issueReportRoutes);
if (pendingEvidenceRoutes) app.use('/api/v1/pending-evidence', pendingEvidenceRoutes);
if (plot4aiRoutes) app.use('/api/v1/plot4ai', plot4aiRoutes);
if (publicContactRoutes) app.use('/api/v1/public', publicContactRoutes);
if (ragRoutes) app.use('/api/v1/rag', ragRoutes);
if (rmfRoutes) app.use('/api/v1/rmf', rmfRoutes);
if (stateAiLawsRoutes) app.use('/api/v1/state-ai-laws', stateAiLawsRoutes);

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

  const rawStatusCode = err.statusCode ?? err.status;
  const statusCode = (Number.isInteger(rawStatusCode) && rawStatusCode >= 400 && rawStatusCode < 600)
    ? rawStatusCode
    : 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const safeMessage = isClientError
    ? (err.message || 'Request error')
    : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: safeMessage,
    correlationId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', correlationId: req.requestId });
});

// Auto-provision platform admin on startup if env vars are set
// Set PLATFORM_ADMIN_EMAIL (+ optionally PLATFORM_ADMIN_PASSWORD,
// PLATFORM_ADMIN_FIRST_NAME, PLATFORM_ADMIN_LAST_NAME, PLATFORM_ADMIN_ORG)
// in Railway Variables and the account is created/updated on every deploy.
async function ensurePlatformAdmin() {
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return; // env var not set — skip silently

  const { randomBytes } = require('crypto');
  const bcrypt = require('bcryptjs');
  const firstName = String(process.env.PLATFORM_ADMIN_FIRST_NAME || 'Platform').trim();
  const lastName  = String(process.env.PLATFORM_ADMIN_LAST_NAME  || 'Admin').trim();
  const orgName   = String(process.env.PLATFORM_ADMIN_ORG        || 'ControlWeave Platform').trim();
  let password = String(process.env.PLATFORM_ADMIN_PASSWORD || '').trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let orgId;
    const existingOrg = await client.query(
      'SELECT id FROM organizations WHERE name = $1 LIMIT 1', [orgName]
    );
    if (existingOrg.rows.length > 0) {
      orgId = existingOrg.rows[0].id;
    } else {
      const orgRes = await client.query(
        `INSERT INTO organizations (name, tier, billing_status)
         VALUES ($1, 'enterprise', 'active_paid') RETURNING id`,
        [orgName]
      );
      orgId = orgRes.rows[0].id;
    }

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    const isExistingUser = existingUser.rows.length > 0;
    const shouldGeneratePassword = !password && !isExistingUser;
    const shouldUpdatePassword = Boolean(password) || shouldGeneratePassword;

    if (shouldGeneratePassword) {
      password = `CW-${randomBytes(9).toString('base64url')}!1`;
    }

    const hash = shouldUpdatePassword ? await bcrypt.hash(password, 12) : null;
    const result = await client.query(
      `INSERT INTO users
         (organization_id, email, password_hash, first_name, last_name, role, is_active, is_platform_admin)
       VALUES ($1,$2,$3,$4,$5,'admin',true,true)
       ON CONFLICT (email) DO UPDATE SET
         organization_id=EXCLUDED.organization_id,
         password_hash=COALESCE(EXCLUDED.password_hash, users.password_hash),
         first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         role='admin', is_active=true, is_platform_admin=true
       RETURNING id, email, (xmax=0) AS inserted`,
      [orgId, email, hash, firstName, lastName]
    );
    const userId = result.rows[0].id;

    // Mark onboarding complete so platform admin goes straight to dashboard
    await client.query(
      `INSERT INTO organization_profiles
         (organization_id, onboarding_completed, onboarding_completed_at, created_by, updated_by)
       VALUES ($1, true, NOW(), $2, $2)
       ON CONFLICT (organization_id) DO UPDATE SET
         onboarding_completed     = true,
         onboarding_completed_at  = COALESCE(organization_profiles.onboarding_completed_at, NOW()),
         updated_by               = EXCLUDED.updated_by`,
      [orgId, userId]
    );

    await client.query('COMMIT');

    const mode = result.rows[0].inserted ? 'created' : 'updated';
    log('info', 'platform.admin.provisioned', { email, status: mode, org: orgName });
    if (shouldGeneratePassword) {
      log('info', 'platform.admin.generated_password', { email, password });
    } else if (!password && isExistingUser) {
      log('info', 'platform.admin.password_preserved', { email });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    log('error', 'platform.admin.provision_failed', { email, error: err.message });
  } finally {
    client.release();
  }
}

// Auto-seed assessment procedures if the table is empty (global/framework-level data, not per-org)
async function ensureAssessmentProcedures() {
  const client = await pool.connect();
  let count;
  try {
    const { rows } = await client.query('SELECT COUNT(*) AS count FROM assessment_procedures');
    count = parseInt(rows[0].count, 10);
  } finally {
    client.release();
  }
  if (count > 0) {
    log('info', 'assessment.procedures.check', { status: 'exists', count });
    return;
  }
  log('info', 'assessment.procedures.seeding', { status: 'starting' });
  const { spawn } = require('child_process');
  const scriptPath = [
    'seed-assessment-procedures-rich-all.js',
    'seed-assessment-procedures-summary.js',
    'seed-assessment-procedures.js',
  ]
    .map((filename) => path.join(__dirname, '../scripts', filename))
    .find((candidatePath) => fs.existsSync(candidatePath));

  if (!scriptPath) {
    log('warn', 'assessment.procedures.seed_missing', {
      status: 'skipped',
      reason: 'No assessment procedure seed script was packaged with this build.'
    });
    return;
  }

  const child = spawn(process.execPath, [scriptPath], { env: process.env, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Seed exited with code ${code}`)));
    child.on('error', reject);
  });
  log('info', 'assessment.procedures.seeded', { status: 'done' });
}

function notifyNoLicenseConfigured() {
  const adminEmail = (process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail) {
    log('info', 'license.unlicensed', {
      note: 'No license key found. Use POST /api/v1/license/generate-community to generate a free community license, or POST /api/v1/license/activate to activate a purchased key.'
    });
    return;
  }

  try {
    const emailService = require('./services/emailService');
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

    void emailService.sendNotificationEmail(
      { email: adminEmail, full_name: 'Platform Admin' },
      {
        title: 'ControlWeave — License key not configured',
        message:
          'Your self-hosted ControlWeave installation is running without an activated license key. ' +
          'Community tier is free and does not require a paid license. ' +
          'You can generate a community license key instantly from the platform admin panel, ' +
          'or activate a purchased key via the license settings page.',
        link: `${frontendUrl}/dashboard/settings?tab=license`
      }
    ).then(() => {
      log('info', 'license.no_license_notification_sent', {
        adminEmail: adminEmail.length > 4 ? adminEmail.replace(/(.{2}).+(@.+)/, '$1***$2') : '***'
      });
    }).catch((notifyErr) => {
      log('warn', 'license.no_license_notification_failed', { error: notifyErr.message });
    });
  } catch (notifyErr) {
    log('warn', 'license.no_license_notification_failed', { error: notifyErr.message });
  }
}

/**
 * On startup: load a persisted license key from the database and apply it.
 * This means license keys activated via POST /api/v1/license/activate survive
 * server restarts without any manual .env editing.
 *
 * Precedence: valid env var (LICENSE_KEY / CONTROLWEAVE_LICENSE_KEY) > database.
 * If the env var is set but invalid, we fall through to the DB key rather than
 * silently running with the wrong edition.
 *
 * Also fires an optional async heartbeat to LICENSE_HEARTBEAT_URL (if set).
 * The heartbeat is NEVER mandatory — connectivity failures never revoke access.
 */
async function ensureLicenseFromDb() {
  const {
    loadLicenseKeyFromDb,
    validateLicenseKey,
    heartbeatCheck,
    setLocalPublicKey
  } = require('./services/licenseService');
  const { upgradeEdition, LICENSE_TIER_TO_EDITION } = require('./middleware/edition');

  let activeKey = null;

  // Check env var first — but only honour it if the key actually validates.
  const envKey = (process.env.LICENSE_KEY || process.env.CONTROLWEAVE_LICENSE_KEY || '').trim();
  if (envKey) {
    const envResult = validateLicenseKey(envKey);
    if (envResult.valid) {
      activeKey = envKey;
    } else {
      log('warn', 'license.env_key_invalid', {
        error: envResult.error,
        note: 'Env var LICENSE_KEY is set but invalid — falling through to DB-persisted key.'
      });
    }
  }

  // Fall through to DB when env key is absent or invalid.
  if (!activeKey) {
    const { licenseKey: dbKey, localPublicKey } = await loadLicenseKeyFromDb(pool);
    if (dbKey) {
      // If a locally-generated key was used, restore its public key in-process
      // so validation succeeds without CONTROLWEAVE_LICENSE_PUBKEY in env.
      if (localPublicKey) {
        setLocalPublicKey(localPublicKey);
      }
      const result = validateLicenseKey(dbKey);
      if (result.valid) {
        const effectiveEdition = LICENSE_TIER_TO_EDITION[result.tier] || 'community';
        upgradeEdition(effectiveEdition);
        log('info', 'license.loaded_from_db', {
          tier: result.tier,
          edition: effectiveEdition,
          licensee: result.licensee
        });
        activeKey = dbKey;
      } else {
        log('warn', 'license.db_key_invalid', { error: result.error });
      }
    }
  }

  // Notify platform admin by email if no license is active on this server.
  // This is a one-time informational nudge and must not delay startup.
  if (!activeKey) {
    notifyNoLicenseConfigured();
  }

  // Optional background heartbeat — fires-and-forgets, never revokes access.
  // heartbeatCheck() always resolves and logs internally; no catch needed.
  if (activeKey && process.env.LICENSE_HEARTBEAT_URL) {
    heartbeatCheck(activeKey);
  }
}
// Start server
// Apply DB-persisted license BEFORE listening so edition/tier gating is correct
// from the very first request. If license loading fails (DB unreachable, etc.),
// the server still starts — community tier works unlicensed by design.
// Other startup tasks (notifications, reminders, platform admin, assessment
// procedures) are intentionally deferred until after the server is listening.
let stopReminders = () => {};
const HOST = process.env.HOST || '0.0.0.0';

ensureLicenseFromDb()
  .catch((err) => {
    // Non-fatal: the server should start even if license loading fails.
    // Community tier is the default when no valid license is present.
    log('warn', 'license.startup_error', { error: err.message });
  })
  .then(() => {
    const server = app.listen(PORT, HOST, () => {
      log('info', 'server.started', {
        host: HOST,
        port: Number(PORT),
        health: `http://localhost:${PORT}/health`,
        environment: process.env.NODE_ENV || 'development'
      });

      // Initialize WebSocket server after HTTP server is ready
      const { initializeWebSocket } = require('./services/websocketService');
      initializeWebSocket(server);

      // Start background jobs only after the HTTP server is reachable.
      stopReminders = startReminderScheduler ? startReminderScheduler() : () => {};

      // Auto-provision platform admin if env vars are present
      ensurePlatformAdmin().catch((err) =>
        log('error', 'platform.admin.startup_error', { error: err.message })
      );

      // Auto-seed assessment procedures if table is empty
      ensureAssessmentProcedures().catch((err) =>
        log('error', 'assessment.procedures.startup_error', { error: err.message })
      );

      // Verify COMPLIANCE_MONITORING_CATEGORIES in aiMonitoring.js matches the DB
      // CHECK constraint — warns on drift so migration/constant stay in sync.
      // The guard checks both safeRequire (may return null) and the export existing
      // (defensive for older module versions that predate this function).
      if (aiMonitoringRoutes && aiMonitoringRoutes.validateCategorySync) {
        aiMonitoringRoutes.validateCategorySync().catch((err) =>
          log('warn', 'ai_monitoring.category_sync_error', { error: err.message })
        );
      }
    });

    // Graceful shutdown
    function shutdown(signal) {
      log('warn', 'server.shutdown.requested', { signal });
      stopReminders();
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
  });
