// @tier: platform
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticate, requirePlatformOwner, invalidateFeatureFlagsCache } = require('../middleware/auth');
const { invalidateEmergencyModeCache, parseEmergencyModeValue } = require('../middleware/emergencyMode');
const { createRateLimiter } = require('../middleware/rateLimit');
const { encrypt, decrypt, hashForLookup } = require('../utils/encrypt');
const { hasPublicColumn } = require('../utils/schema');
const llm = require('../services/llmService');
const approvalService = require('../services/approvalService');
const { isStripeConfigured, cancelSubscriptionNow } = require('../services/stripeService');
const {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPLEXITY_ERROR_MESSAGE,
  hasRequiredPasswordComplexity
} = require('../utils/passwordPolicy');
const { SECURITY_CONFIG } = require('../config/security');
const _backupScheduler = (() => { try { return require('../services/backupScheduler'); } catch { return null; } })();

const router = express.Router();
const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_PROVIDERS = new Set(['claude', 'openai', 'gemini', 'grok', 'groq', 'ollama']);
const PLATFORM_PROVIDER_SETTING_KEYS = {
  claude: 'anthropic_api_key',
  openai: 'openai_api_key',
  gemini: 'gemini_api_key',
  grok: 'xai_api_key',
  groq: 'groq_api_key',
  ollama: 'ollama_base_url'
};
const PLATFORM_SETTING_KEYS = [
  ...Object.values(PLATFORM_PROVIDER_SETTING_KEYS),
  'default_provider',
  'default_model'
];
const ORG_LLM_SETTING_KEYS = Object.values(PLATFORM_PROVIDER_SETTING_KEYS);
const platformAdminLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  label: 'platform-admin'
});
const platformAdminBootstrapLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  label: 'platform-admin-bootstrap'
});

function maskKey(settingKey, value) {
  if (!value) return null;
  if (settingKey === 'ollama_base_url') return value;
  return `****${String(value).slice(-4)}`;
}

async function getEmergencyModeState() {
  const result = await pool.query(
    `SELECT setting_value, updated_at
     FROM platform_settings
     WHERE setting_key = 'emergency_mode'
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    return { active: false, data: null, updated_at: null };
  }

  const row = result.rows[0];
  const { active, data } = parseEmergencyModeValue(row.setting_value);
  return { active, data, updated_at: row.updated_at };
}

async function logBillingCancellationAudit({ organizationId, userId, eventType, success, outcome, details }) {
  await pool.query(
    `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
     VALUES ($1, $2, $3, 'organization', $4, $5, $6, $7)`,
    [
      organizationId,
      userId,
      eventType,
      organizationId,
      JSON.stringify(details),
      success,
      outcome
    ]
  );
}

function buildOrgLlmRollupCte() {
  return `
    WITH org_llm_rollup AS (
      SELECT
        organization_id,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN BOOL_OR(setting_key = 'anthropic_api_key' AND NULLIF(setting_value, '') IS NOT NULL) THEN 'claude' END,
          CASE WHEN BOOL_OR(setting_key = 'openai_api_key' AND NULLIF(setting_value, '') IS NOT NULL) THEN 'openai' END,
          CASE WHEN BOOL_OR(setting_key = 'gemini_api_key' AND NULLIF(setting_value, '') IS NOT NULL) THEN 'gemini' END,
          CASE WHEN BOOL_OR(setting_key = 'xai_api_key' AND NULLIF(setting_value, '') IS NOT NULL) THEN 'grok' END,
          CASE WHEN BOOL_OR(setting_key = 'groq_api_key' AND NULLIF(setting_value, '') IS NOT NULL) THEN 'groq' END,
          CASE WHEN BOOL_OR(setting_key = 'ollama_base_url' AND NULLIF(setting_value, '') IS NOT NULL) THEN 'ollama' END
        ], NULL) AS enabled_llm_providers
      FROM organization_settings
      WHERE setting_key = ANY($1)
      GROUP BY organization_id
    )
  `;
}

// GET /api/v1/platform-admin/overview
router.get('/overview', platformAdminLimiter, authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const [orgs, billing, usage, externalUsage, regionDistribution, llmAdoption] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM organizations'),
      pool.query(
        `SELECT billing_status, COUNT(*)::int AS count
         FROM organizations
         GROUP BY billing_status
         ORDER BY count DESC`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_ai_requests
         FROM ai_usage_log`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_external_decisions
         FROM ai_decision_log
         WHERE decision_source = 'external'`
      ),
      pool.query(
        `SELECT 
           region,
           country_code,
           COUNT(*)::int AS count
         FROM organizations
         WHERE region IS NOT NULL
         GROUP BY region, country_code
         ORDER BY count DESC`
      ),
      pool.query(
        `${buildOrgLlmRollupCte()}
         SELECT
           COUNT(*) FILTER (WHERE COALESCE(array_length(oll.enabled_llm_providers, 1), 0) > 0)::int AS orgs_with_any_llm_key,
           COUNT(*) FILTER (WHERE COALESCE(array_length(oll.enabled_llm_providers, 1), 0) = 0)::int AS orgs_without_any_llm_key,
           COUNT(*) FILTER (WHERE 'claude' = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[])))::int AS claude,
           COUNT(*) FILTER (WHERE 'openai' = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[])))::int AS openai,
           COUNT(*) FILTER (WHERE 'gemini' = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[])))::int AS gemini,
           COUNT(*) FILTER (WHERE 'grok' = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[])))::int AS grok,
           COUNT(*) FILTER (WHERE 'groq' = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[])))::int AS groq,
           COUNT(*) FILTER (WHERE 'ollama' = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[])))::int AS ollama
         FROM organizations o
         LEFT JOIN org_llm_rollup oll ON oll.organization_id = o.id`,
        [ORG_LLM_SETTING_KEYS]
      )
    ]);

    const adoption = llmAdoption.rows[0] || {};

    res.json({
      success: true,
      data: {
        organizations_total: orgs.rows[0]?.total || 0,
        billing_status: billing.rows,
        total_ai_requests: usage.rows[0]?.total_ai_requests || 0,
        total_external_decisions: externalUsage.rows[0]?.total_external_decisions || 0,
        region_distribution: regionDistribution.rows,
        llm_key_adoption: {
          orgs_with_any_llm_key: adoption.orgs_with_any_llm_key || 0,
          orgs_without_any_llm_key: adoption.orgs_without_any_llm_key || 0,
          providers: {
            claude: adoption.claude || 0,
            openai: adoption.openai || 0,
            gemini: adoption.gemini || 0,
            grok: adoption.grok || 0,
            groq: adoption.groq || 0,
            ollama: adoption.ollama || 0
          }
        }
      }
    });
  } catch (error) {
    console.error('Platform admin overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to load platform overview' });
  }
});

// Emergency recovery routes are defined before the router-wide middleware below
// so they don't rely on the later blanket router.use(...) chain. They still
// apply authenticate/requirePlatformOwner/platformAdminLimiter explicitly.

// GET /api/v1/platform-admin/system-status
router.get('/system-status', platformAdminLimiter, authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const emergencyMode = await getEmergencyModeState();

    return res.json({
      success: true,
      data: {
        emergency_mode: emergencyMode,
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Platform admin system-status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch system status' });
  }
});

// POST /api/v1/platform-admin/emergency/restore
router.post('/emergency/restore', platformAdminLimiter, authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const restoredBy = req.user?.email || null;
    const restoredAt = new Date().toISOString();
    const restoredState = {
      active: false,
      restored_at: restoredAt,
      restored_by: restoredBy,
      reason: reason || null
    };

    await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, is_encrypted, updated_at)
       VALUES ('emergency_mode', $1, false, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, is_encrypted = false, updated_at = NOW()`,
      [JSON.stringify(restoredState)]
    );

    invalidateEmergencyModeCache();

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
       VALUES (NULL, $1, 'platform.emergency_restore', 'platform', 'system', $2, true, 'success')`,
      [req.user?.id || null, JSON.stringify({ reason: reason || null, restored_by: restoredBy, restored_at: restoredAt })]
    );

    return res.json({
      success: true,
      message: 'Emergency mode deactivated. System restored to normal operation.',
      data: { emergency_mode: restoredState }
    });
  } catch (error) {
    console.error('Platform admin emergency restore error:', error);
    return res.status(500).json({ success: false, error: 'Failed to disable emergency mode' });
  }
});

router.use(platformAdminLimiter);
router.use(authenticate);
router.use(requirePlatformOwner);

// GET /api/v1/platform-admin/organizations
router.get('/organizations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const offset = (page - 1) * limit;
    const region = req.query.region ? String(req.query.region).trim() : null;
    const hasLlmKey = req.query.has_llm_key === undefined ? null : String(req.query.has_llm_key).trim().toLowerCase();
    const llmProvider = req.query.llm_provider ? String(req.query.llm_provider).trim().toLowerCase() : null;
    const sortBy = req.query.sort_by || 'created_at';
    const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';

    if (hasLlmKey !== null && !['true', 'false'].includes(hasLlmKey)) {
      return res.status(400).json({ success: false, error: 'has_llm_key must be true or false' });
    }
    if (llmProvider && !ALLOWED_PROVIDERS.has(llmProvider)) {
      return res.status(400).json({ success: false, error: 'llm_provider must be one of: claude, openai, gemini, grok, groq, ollama' });
    }

    // Validate sort field to prevent SQL injection
    const allowedSortFields = ['created_at', 'name', 'tier', 'region', 'billing_status'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';

    // Build WHERE clause for region filtering
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 2;

    if (region) {
      whereConditions.push(`o.region = $${paramIndex}`);
      queryParams.push(region);
      paramIndex++;
    }
    if (hasLlmKey === 'true') {
      whereConditions.push(`COALESCE(array_length(oll.enabled_llm_providers, 1), 0) > 0`);
    }
    if (hasLlmKey === 'false') {
      whereConditions.push(`COALESCE(array_length(oll.enabled_llm_providers, 1), 0) = 0`);
    }
    if (llmProvider) {
      whereConditions.push(`$${paramIndex} = ANY(COALESCE(oll.enabled_llm_providers, ARRAY[]::text[]))`);
      queryParams.push(llmProvider);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Add pagination params
    queryParams.push(limit, offset);

    const [rows, count] = await Promise.all([
      pool.query(
        `${buildOrgLlmRollupCte()}
         SELECT o.id, o.name, o.tier, o.billing_status, o.trial_status, o.trial_started_at, o.trial_ends_at,
                o.region, o.country_code, o.created_at,
                COALESCE(array_length(oll.enabled_llm_providers, 1), 0) > 0 AS has_any_llm_key,
                COALESCE(oll.enabled_llm_providers, ARRAY[]::text[]) AS enabled_llm_providers
         FROM organizations o
         LEFT JOIN org_llm_rollup oll ON oll.organization_id = o.id
         ${whereClause}
         ORDER BY o.${validSortBy} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [ORG_LLM_SETTING_KEYS, ...queryParams]
      ),
      pool.query(
        `${buildOrgLlmRollupCte()}
         SELECT COUNT(*)::int AS total
         FROM organizations o
         LEFT JOIN org_llm_rollup oll ON oll.organization_id = o.id
         ${whereClause}`,
        [ORG_LLM_SETTING_KEYS, ...queryParams.slice(0, queryParams.length - 2)]
      )
    ]);

    res.json({
      success: true,
      data: rows.rows,
      pagination: {
        page,
        limit,
        total: count.rows[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Platform admin organizations error:', error);
    res.status(500).json({ success: false, error: 'Failed to list organizations' });
  }
});

// GET /api/v1/platform-admin/llm-defaults
router.get('/llm-defaults', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value, is_encrypted, updated_at
       FROM platform_settings
       WHERE setting_key = ANY($1)`,
      [PLATFORM_SETTING_KEYS]
    );

    const settings = {};
    for (const row of result.rows) {
      if ((row.setting_key.includes('api_key') || row.setting_key === 'ollama_base_url') && row.setting_value) {
        const plainValue = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
        settings[row.setting_key] = {
          configured: true,
          masked: maskKey(row.setting_key, plainValue),
          updated_at: row.updated_at
        };
      } else {
        settings[row.setting_key] = {
          value: row.setting_value,
          updated_at: row.updated_at
        };
      }
    }

    return res.json({
      success: true,
      data: {
        settings,
        hasAnthropicKey: !!settings.anthropic_api_key?.configured,
        hasOpenAIKey: !!settings.openai_api_key?.configured,
        hasGeminiKey: !!settings.gemini_api_key?.configured,
        hasGrokKey: !!settings.xai_api_key?.configured,
        hasGroqKey: !!settings.groq_api_key?.configured,
        hasOllamaUrl: !!settings.ollama_base_url?.configured,
        defaultProvider: settings.default_provider?.value || 'claude',
        defaultModel: settings.default_model?.value || null
      }
    });
  } catch (error) {
    console.error('Platform admin get llm-defaults error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch platform LLM defaults' });
  }
});

// PUT /api/v1/platform-admin/llm-defaults
router.put('/llm-defaults', async (req, res) => {
  try {
    const {
      anthropic_api_key,
      openai_api_key,
      gemini_api_key,
      xai_api_key,
      groq_api_key,
      ollama_base_url,
      default_provider,
      default_model
    } = req.body || {};

    if (default_provider && !ALLOWED_PROVIDERS.has(default_provider)) {
      return res.status(400).json({
        success: false,
        error: 'default_provider must be one of: claude, openai, gemini, grok, groq, ollama'
      });
    }

    const upsert = async (settingKey, value, shouldEncrypt = false) => {
      if (value === undefined) return;
      if (value === null || value === '') {
        await pool.query(
          'DELETE FROM platform_settings WHERE setting_key = $1',
          [settingKey]
        );
        return;
      }

      const storedValue = shouldEncrypt ? encrypt(String(value)) : String(value);
      await pool.query(
        `INSERT INTO platform_settings (setting_key, setting_value, is_encrypted, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2, is_encrypted = $3, updated_at = NOW()`,
        [settingKey, storedValue, shouldEncrypt]
      );
    };

    await upsert('anthropic_api_key', anthropic_api_key, true);
    await upsert('openai_api_key', openai_api_key, true);
    await upsert('gemini_api_key', gemini_api_key, true);
    await upsert('xai_api_key', xai_api_key, true);
    await upsert('groq_api_key', groq_api_key, true);
    await upsert('ollama_base_url', ollama_base_url, false);
    await upsert('default_provider', default_provider, false);
    await upsert('default_model', default_model, false);

    llm.invalidatePlatformApiKeyCache();

    return res.json({
      success: true,
      message: 'Platform LLM settings updated successfully'
    });
  } catch (error) {
    console.error('Platform admin update llm-defaults error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update platform LLM defaults' });
  }
});

// POST /api/v1/platform-admin/bootstrap-account
router.post('/bootstrap-account', platformAdminBootstrapLimiter, authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const firstName = String(req.body?.first_name || 'Platform').trim();
    const lastName = String(req.body?.last_name || 'Admin').trim();

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (!hasRequiredPasswordComplexity(password)) {
      return res.status(400).json({
        success: false,
        error: PASSWORD_COMPLEXITY_ERROR_MESSAGE
      });
    }

    const existingUser = await pool.query(
      'SELECT id, organization_id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    if (existingUser.rows.length > 0 && existingUser.rows[0].organization_id !== req.user.organization_id) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email already exists in another organization'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Use email_hash for conflict resolution when field-level encryption is active.
    // For pre-migration rows (email_hash IS NULL), fall back to plain email lookup.
    const paEmailHashColAvail = await hasPublicColumn('users', 'email_hash');
    let result;
    if (paEmailHashColAvail) {
      const bootstrapEmailHash = hashForLookup(email);
      const bootstrapStoredEmail = encrypt(email);

      // Check for existing row by hash (migrated) or by plain email (pre-migration)
      const existingByHash = await pool.query(
        'SELECT id FROM users WHERE email_hash = $1 AND organization_id = $2 LIMIT 1',
        [bootstrapEmailHash, req.user.organization_id]
      );
      const existingByPlain = existingByHash.rows.length === 0
        ? await pool.query(
            'SELECT id FROM users WHERE email = $1 AND email_hash IS NULL AND organization_id = $2 LIMIT 1',
            [email, req.user.organization_id]
          )
        : { rows: [] };

      if (existingByHash.rows.length > 0 || existingByPlain.rows.length > 0) {
        // Update existing row, scoped to this organization
        result = await pool.query(
          `UPDATE users SET
             email = $1, email_hash = $2, password_hash = $3,
             first_name = $4, last_name = $5,
             role = 'admin', is_active = true, is_platform_admin = true
           WHERE organization_id = $7
             AND (email_hash = $2 OR (email = $6 AND email_hash IS NULL))
           RETURNING id, false AS inserted`,
          [bootstrapStoredEmail, bootstrapEmailHash, passwordHash, firstName, lastName, email, req.user.organization_id]
        );
        if (result.rows.length === 0) {
          result = { rows: [{ id: existingByHash.rows[0]?.id || existingByPlain.rows[0]?.id, inserted: false }] };
        }
      } else {
        result = await pool.query(
          `INSERT INTO users (organization_id, email, email_hash, password_hash, first_name, last_name, role, is_active, is_platform_admin)
           VALUES ($1, $2, $3, $4, $5, $6, 'admin', true, true)
           RETURNING id, (xmax = 0) AS inserted`,
          [req.user.organization_id, bootstrapStoredEmail, bootstrapEmailHash, passwordHash, firstName, lastName]
        );
      }
    } else {
      result = await pool.query(
        `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_active, is_platform_admin)
         VALUES ($1, $2, $3, $4, $5, 'admin', true, true)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           role = 'admin',
           is_active = true,
           is_platform_admin = true
         RETURNING id, email, (xmax = 0) AS inserted`,
        [req.user.organization_id, email, passwordHash, firstName, lastName]
      );
    }

    return res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        email, // always return plain-text email in response
        status: result.rows[0].inserted ? 'created' : 'updated'
      }
    });
  } catch (error) {
    console.error('Platform admin bootstrap account error:', error);
    return res.status(500).json({ success: false, error: 'Failed to bootstrap platform admin account' });
  }
});

// =========================================================================
// FEATURE FLAGS — Global + Per-org
// =========================================================================

const VALID_TIERS = new Set(['community', 'pro', 'enterprise', 'govcloud']);

// GET /api/v1/platform-admin/settings/features
router.get('/settings/features', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'feature_flags' LIMIT 1`
    );
    const flags = result.rows.length > 0
      ? (typeof result.rows[0].setting_value === 'string'
          ? JSON.parse(result.rows[0].setting_value)
          : result.rows[0].setting_value)
      : {};
    return res.json({ success: true, data: flags });
  } catch (error) {
    console.error('Get feature flags error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch feature flags' });
  }
});

// PUT /api/v1/platform-admin/settings/features
// If any flag is being explicitly disabled (set to false), requires a second-platform-owner
// approval before taking effect. A 202 response is returned with an approval_id.
// Enabling flags (setting to true) takes effect immediately.
router.put('/settings/features', async (req, res) => {
  try {
    const flags = req.body;
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
      return res.status(400).json({ success: false, error: 'Body must be a JSON object of feature flags' });
    }

    // Detect any flags being disabled
    const disabledFlags = Object.entries(flags)
      .filter(([, v]) => v === false)
      .map(([k]) => k);

    if (disabledFlags.length > 0) {
      // Stage this as a pending approval instead of applying immediately
      const approval = await approvalService.createApproval({
        actionType: 'feature_flag.disable',
        resourceType: 'platform_settings',
        resourceId: 'feature_flags',
        requestedBy: req.user.id,
        requestedByEmail: req.user.email,
        payload: { flags, disabled_flags: disabledFlags }
      });

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
         VALUES (NULL, $1, 'approval.requested', 'pending_approval', $2, $3, true, 'success')`,
        [
          req.user.id,
          approval.id,
          JSON.stringify({ action_type: 'feature_flag.disable', disabled_flags: disabledFlags })
        ]
      );

      return res.status(202).json({
        success: true,
        message: `Disabling feature flags requires approval. A pending approval has been created (expires in 24 hours).`,
        approval_id: approval.id,
        disabled_flags: disabledFlags,
        expires_at: approval.expires_at
      });
    }

    // No flags being disabled — apply immediately
    await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, is_encrypted)
       VALUES ('feature_flags', $1, false)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_at = NOW()`,
      [JSON.stringify(flags)]
    );
    invalidateFeatureFlagsCache();
    return res.json({ success: true, message: 'Feature flags updated' });
  } catch (error) {
    console.error('Update feature flags error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update feature flags' });
  }
});

// GET /api/v1/platform-admin/organizations/:id/features
router.get('/organizations/:id/features', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT tier, COALESCE(feature_overrides, '{}'::jsonb) as feature_overrides FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    const org = result.rows[0];
    return res.json({
      success: true,
      data: {
        tier: org.tier,
        feature_overrides: typeof org.feature_overrides === 'string'
          ? JSON.parse(org.feature_overrides)
          : org.feature_overrides
      }
    });
  } catch (error) {
    console.error('Get org features error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch org features' });
  }
});

// PUT /api/v1/platform-admin/organizations/:id/features
router.put('/organizations/:id/features', async (req, res) => {
  try {
    const { id } = req.params;
    const overrides = req.body;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return res.status(400).json({ success: false, error: 'Body must be a JSON object' });
    }
    // Validate tier_override if provided
    if (overrides.tier_override && !VALID_TIERS.has(overrides.tier_override)) {
      return res.status(400).json({ success: false, error: `Invalid tier_override. Must be one of: ${[...VALID_TIERS].join(', ')}` });
    }
    const updateResult = await pool.query(
      `UPDATE organizations SET feature_overrides = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [JSON.stringify(overrides), id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details)
       VALUES ($1, $2, 'platform_admin.org_features_updated', 'organization', $3)`,
      [id, req.user.id, JSON.stringify({ overrides })]
    );

    return res.json({ success: true, message: 'Organization feature overrides updated' });
  } catch (error) {
    console.error('Update org features error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update org features' });
  }
});

// =========================================================================
// SUBSCRIPTION MANAGEMENT
// =========================================================================

// GET /api/v1/platform-admin/organizations/:id/subscription
router.get('/organizations/:id/subscription', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, name, tier, billing_status, paid_tier, stripe_customer_id, stripe_subscription_id,
              trial_status, trial_started_at, trial_ends_at
       FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    const org = result.rows[0];
    return res.json({ success: true, data: org });
  } catch (error) {
    console.error('Get subscription error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
  }
});

// PUT /api/v1/platform-admin/organizations/:id/subscription/tier
router.put('/organizations/:id/subscription/tier', async (req, res) => {
  try {
    const { id } = req.params;
    const { tier } = req.body;
    if (!tier || !VALID_TIERS.has(tier)) {
      return res.status(400).json({ success: false, error: `Invalid tier. Must be one of: ${[...VALID_TIERS].join(', ')}` });
    }
    const updateResult = await pool.query(
      `UPDATE organizations SET tier = $1, paid_tier = CASE WHEN $1 = 'community' THEN NULL ELSE $1 END, billing_status = CASE WHEN $1 = 'community' THEN 'community' ELSE 'active_paid' END, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [tier, id]
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details)
       VALUES ($1, $2, 'platform_admin.tier_changed', 'organization', $3)`,
      [id, req.user.id, JSON.stringify({ tier })]
    );
    return res.json({ success: true, message: `Tier changed to ${tier}` });
  } catch (error) {
    console.error('Change tier error:', error);
    return res.status(500).json({ success: false, error: 'Failed to change tier' });
  }
});

// POST /api/v1/platform-admin/organizations/:id/subscription/cancel
// Immediate cancellation (immediately: true) requires a second-platform-owner approval.
// End-of-period cancellation (immediately: false) takes effect immediately.
router.post('/organizations/:id/subscription/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { immediately, reason } = req.body || {};

    if (immediately) {
      // Verify org exists first
      const orgCheck = await pool.query(`SELECT id FROM organizations WHERE id = $1 LIMIT 1`, [id]);
      if (orgCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Organization not found' });
      }

      const approval = await approvalService.createApproval({
        actionType: 'subscription.cancel_immediately',
        resourceType: 'organization',
        resourceId: id,
        requestedBy: req.user.id,
        requestedByEmail: req.user.email,
        payload: { org_id: id, reason: reason || null }
      });

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
         VALUES ($1, $2, 'approval.requested', 'pending_approval', $3, $4, true, 'success')`,
        [id, req.user.id, approval.id, JSON.stringify({ action_type: 'subscription.cancel_immediately', reason: reason || null })]
      );

      return res.status(202).json({
        success: true,
        message: 'Immediate cancellation requires approval. A pending approval has been created.',
        approval_id: approval.id,
        expires_at: approval.expires_at
      });
    }

    const updateResult = await pool.query(
      `UPDATE organizations SET billing_status = 'canceling', updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details)
       VALUES ($1, $2, 'platform_admin.subscription_canceled', 'organization', $3)`,
      [id, req.user.id, JSON.stringify({ immediately: false, reason: reason || null })]
    );
    return res.json({ success: true, message: 'Subscription marked for cancellation at period end' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

// POST /api/v1/platform-admin/organizations/:id/subscription/comp
router.post('/organizations/:id/subscription/comp', async (req, res) => {
  try {
    const { id } = req.params;
    const { tier, months, reason } = req.body || {};
    const PAID_TIERS_FOR_COMP = new Set(['pro', 'enterprise', 'govcloud']);
    if (!tier || !PAID_TIERS_FOR_COMP.has(tier)) {
      return res.status(400).json({ success: false, error: `Invalid tier. Must be a paid tier: ${[...PAID_TIERS_FOR_COMP].join(', ')}` });
    }
    const compMonths = Math.max(1, Math.min(120, parseInt(months, 10) || 3));
    const compEnds = new Date();
    compEnds.setDate(compEnds.getDate() + compMonths * 30);

    const updateResult = await pool.query(
      `UPDATE organizations
       SET tier = $1, billing_status = 'comped', trial_ends_at = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id`,
      [tier, compEnds.toISOString(), id]
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details)
       VALUES ($1, $2, 'platform_admin.subscription_comped', 'organization', $3)`,
      [id, req.user.id, JSON.stringify({ tier, months: compMonths, reason: reason || null })]
    );
    return res.json({ success: true, message: `Comp account granted: ${tier} for ${compMonths} months` });
  } catch (error) {
    console.error('Comp subscription error:', error);
    return res.status(500).json({ success: false, error: 'Failed to comp subscription' });
  }
});

// POST /api/v1/platform-admin/organizations/:id/subscription/reactivate
router.post('/organizations/:id/subscription/reactivate', async (req, res) => {
  try {
    const { id } = req.params;
    const orgResult = await pool.query(
      `SELECT tier, paid_tier, billing_status FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (orgResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    const org = orgResult.rows[0];
    const restoredTier = org.paid_tier || org.tier || 'community';
    await pool.query(
      `UPDATE organizations SET billing_status = 'active_paid', tier = $1, updated_at = NOW() WHERE id = $2`,
      [restoredTier, id]
    );
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details)
       VALUES ($1, $2, 'platform_admin.subscription_reactivated', 'organization', $3)`,
      [id, req.user.id, JSON.stringify({ restored_tier: restoredTier })]
    );
    return res.json({ success: true, message: 'Subscription reactivated' });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reactivate subscription' });
  }
});

// =========================================================================
// TRIAL MANAGEMENT
// =========================================================================

// GET /api/v1/platform-admin/organizations/:id/trial
router.get('/organizations/:id/trial', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, name, tier, billing_status, trial_status, trial_started_at, trial_ends_at
       FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    const org = result.rows[0];
    const now = new Date();
    const endsAt = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
    const daysRemaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24))) : 0;

    return res.json({
      success: true,
      data: {
        ...org,
        days_remaining: daysRemaining,
        is_expired: endsAt ? endsAt <= now : false
      }
    });
  } catch (error) {
    console.error('Get trial error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch trial info' });
  }
});

// PUT /api/v1/platform-admin/organizations/:id/trial
router.put('/organizations/:id/trial', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, days, tier } = req.body || {};

    if (!action) {
      return res.status(400).json({ success: false, error: 'action is required (extend, shorten, end, restart, convert)' });
    }

    const orgResult = await pool.query(
      `SELECT tier, trial_status, trial_started_at, trial_ends_at, billing_status
       FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (orgResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    const org = orgResult.rows[0];
    const now = new Date();

    if (action === 'extend') {
      const addDays = Math.max(1, parseInt(days, 10) || 7);
      let baseDate = org.trial_ends_at ? new Date(org.trial_ends_at) : now;
      if (baseDate < now) baseDate = now; // reactivate expired
      const newEnd = new Date(baseDate);
      newEnd.setDate(newEnd.getDate() + addDays);
      // Cap at 365 days from today
      const maxDate = new Date(now);
      maxDate.setDate(maxDate.getDate() + 365);
      if (newEnd > maxDate) {
        return res.status(400).json({ success: false, error: 'Cannot extend trial beyond 365 days from today' });
      }
      await pool.query(
        `UPDATE organizations SET trial_ends_at = $1, trial_status = 'active', billing_status = 'trial', updated_at = NOW() WHERE id = $2`,
        [newEnd.toISOString(), id]
      );
    } else if (action === 'shorten') {
      const removeDays = Math.max(1, parseInt(days, 10) || 1);
      const baseDate = org.trial_ends_at ? new Date(org.trial_ends_at) : now;
      const newEnd = new Date(baseDate);
      newEnd.setDate(newEnd.getDate() - removeDays);
      if (newEnd <= now) {
        // Auto-expire
        await pool.query(
          `UPDATE organizations SET trial_ends_at = $1, trial_status = 'expired', tier = 'community', billing_status = 'community', updated_at = NOW() WHERE id = $2`,
          [now.toISOString(), id]
        );
      } else {
        await pool.query(
          `UPDATE organizations SET trial_ends_at = $1, updated_at = NOW() WHERE id = $2`,
          [newEnd.toISOString(), id]
        );
      }
    } else if (action === 'end') {
      await pool.query(
        `UPDATE organizations SET trial_ends_at = $1, trial_status = 'expired', tier = 'community', billing_status = 'community', updated_at = NOW() WHERE id = $2`,
        [now.toISOString(), id]
      );
    } else if (action === 'restart') {
      const trialDays = Math.max(1, Math.min(365, parseInt(days, 10) || 7));
      const trialTier = (tier && VALID_TIERS.has(tier)) ? tier : 'pro';
      const newEnd = new Date(now);
      newEnd.setDate(newEnd.getDate() + trialDays);
      await pool.query(
        `UPDATE organizations SET trial_started_at = $1, trial_ends_at = $2, trial_status = 'active', tier = $3, trial_source_tier = $3, billing_status = 'trial', updated_at = NOW() WHERE id = $4`,
        [now.toISOString(), newEnd.toISOString(), trialTier, id]
      );
    } else if (action === 'convert') {
      const PAID_TIERS = new Set(['pro', 'enterprise', 'govcloud']);
      const convertTier = (tier && PAID_TIERS.has(tier)) ? tier : 'pro';
      if (tier && !PAID_TIERS.has(tier)) {
        return res.status(400).json({ success: false, error: `Cannot convert to '${tier}'. Must be a paid tier: ${[...PAID_TIERS].join(', ')}` });
      }
      await pool.query(
        `UPDATE organizations SET trial_status = 'converted', tier = $1, paid_tier = $1, billing_status = 'active_paid', updated_at = NOW() WHERE id = $2`,
        [convertTier, id]
      );
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action. Must be: extend, shorten, end, restart, convert' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details)
       VALUES ($1, $2, $3, 'organization', $4)`,
      [id, req.user.id, `platform_admin.trial_${action}`, JSON.stringify({ action, days, tier })]
    );

    return res.json({ success: true, message: `Trial action '${action}' applied` });
  } catch (error) {
    console.error('Update trial error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update trial' });
  }
});

// ==================== SMTP CONFIGURATION ====================

const SMTP_SETTING_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_email'];

// GET /api/v1/platform-admin/smtp — returns current SMTP config (password masked)
router.get('/smtp', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value, is_encrypted, updated_at
       FROM platform_settings WHERE setting_key = ANY($1)`,
      [SMTP_SETTING_KEYS]
    );

    const settings = {};
    for (const row of result.rows) {
      const plainValue = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
      settings[row.setting_key] = {
        value: row.setting_key === 'smtp_pass'
          ? (plainValue ? '•'.repeat(12) : '')  // always mask password
          : (plainValue || ''),
        configured: Boolean(plainValue),
        updated_at: row.updated_at
      };
    }

    // Indicate whether SMTP is active (DB or env vars)
    const dbHost = settings.smtp_host?.configured;
    const envHost = Boolean(process.env.SMTP_HOST);
    const source = dbHost ? 'database' : (envHost ? 'environment' : 'none');

    // Only return actual values when stored in DB.
    // When configured via env vars, return empty strings so the UI shows a
    // read-only indicator rather than persisting the placeholder on save.
    const smtpHostValue = dbHost ? (settings.smtp_host?.value || '') : '';

    res.json({
      success: true,
      data: {
        smtp_host: smtpHostValue,
        smtp_port: settings.smtp_port?.value || '',
        smtp_user: settings.smtp_user?.value || '',
        smtp_pass: settings.smtp_pass?.value || '',
        smtp_from_email: settings.smtp_from_email?.value || '',
        configured: dbHost || envHost,
        source
      }
    });
  } catch (error) {
    console.error('Platform admin get SMTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SMTP configuration' });
  }
});

// PUT /api/v1/platform-admin/smtp — save SMTP configuration
router.put('/smtp', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email } = req.body || {};

    const upsert = async (settingKey, value, shouldEncrypt = false) => {
      if (value === undefined) return;
      if (value === null || value === '') {
        await pool.query('DELETE FROM platform_settings WHERE setting_key = $1', [settingKey]);
        return;
      }
      const storedValue = shouldEncrypt ? encrypt(String(value)) : String(value);
      await pool.query(
        `INSERT INTO platform_settings (setting_key, setting_value, is_encrypted, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2, is_encrypted = $3, updated_at = NOW()`,
        [settingKey, storedValue, shouldEncrypt]
      );
    };

    if (smtp_port !== undefined && smtp_port !== '' && smtp_port !== null) {
      const portNum = parseInt(smtp_port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return res.status(400).json({ success: false, error: 'smtp_port must be a valid port number (1–65535)' });
      }
    }

    await upsert('smtp_host', smtp_host, false);
    await upsert('smtp_port', smtp_port, false);
    await upsert('smtp_user', smtp_user, false);
    if (smtp_pass && !smtp_pass.startsWith('•')) {
      // Only update password if a new value is provided (not the masked placeholder)
      await upsert('smtp_pass', smtp_pass, true);
    }
    await upsert('smtp_from_email', smtp_from_email, false);

    // Invalidate the email service transporter cache so the new settings take effect immediately
    const emailService = require('../services/emailService');
    if (typeof emailService.invalidateSmtpCache === 'function') {
      emailService.invalidateSmtpCache();
    }

    res.json({ success: true, message: 'SMTP configuration saved. Send a test email to verify.' });
  } catch (error) {
    console.error('Platform admin update SMTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to save SMTP configuration' });
  }
});

// GET /api/v1/platform-admin/llm/status
// Test all configured platform LLM provider keys and return health status
router.get('/llm/status', async (req, res) => {
  try {
    // Fetch all platform LLM key rows in one query
    const result = await pool.query(
      `SELECT setting_key, setting_value, is_encrypted
       FROM platform_settings
       WHERE setting_key = ANY($1)`,
      [Object.values(PLATFORM_PROVIDER_SETTING_KEYS)]
    );

    // Build a map of provider → decrypted key/url
    const keyMap = {};
    for (const row of result.rows) {
      const plain = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
      keyMap[row.setting_key] = plain || null;
    }

    // Test each provider concurrently
    const providerTests = [
      { provider: 'claude', settingKey: 'anthropic_api_key' },
      { provider: 'openai', settingKey: 'openai_api_key' },
      { provider: 'gemini', settingKey: 'gemini_api_key' },
      { provider: 'grok', settingKey: 'xai_api_key' },
      { provider: 'groq', settingKey: 'groq_api_key' },
      { provider: 'ollama', settingKey: 'ollama_base_url' }
    ];

    const testResults = await Promise.all(
      providerTests.map(async ({ provider, settingKey }) => {
        const apiKey = keyMap[settingKey];
        if (!apiKey) {
          return { provider, configured: false, status: 'unconfigured', latency_ms: null, error: null };
        }

        const start = Date.now();
        try {
          if (provider === 'claude') {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic.default({ apiKey });
            await client.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Respond with OK.' }]
            });
          } else if (provider === 'openai') {
            const OpenAI = require('openai');
            const client = new OpenAI.default({ apiKey });
            await client.chat.completions.create({
              model: 'gpt-4o-mini',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Respond with OK.' }]
            });
          } else if (provider === 'gemini') {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: 'Respond with OK.' }] }],
                  generationConfig: { maxOutputTokens: 10 }
                })
              }
            );
            if (!response.ok) {
              const data = await response.json();
              throw new Error(data?.error?.message || `HTTP ${response.status}`);
            }
          } else if (provider === 'grok') {
            const OpenAI = require('openai');
            const client = new OpenAI.default({ apiKey, baseURL: process.env.XAI_API_BASE || 'https://api.x.ai/v1' });
            await client.chat.completions.create({
              model: 'grok-3-latest',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Respond with OK.' }]
            });
          } else if (provider === 'groq') {
            const OpenAI = require('openai');
            const client = new OpenAI.default({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
            await client.chat.completions.create({
              model: 'llama-3.1-8b-instant',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Respond with OK.' }]
            });
          } else if (provider === 'ollama') {
            const baseURL = apiKey || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
            const OpenAI = require('openai');
            const client = new OpenAI.default({ apiKey: 'ollama', baseURL });
            await client.chat.completions.create({
              model: 'llama3.2',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Respond with OK.' }]
            });
          }

          return {
            provider,
            configured: true,
            status: 'ok',
            latency_ms: Date.now() - start,
            error: null
          };
        } catch (err) {
          return {
            provider,
            configured: true,
            status: 'error',
            latency_ms: Date.now() - start,
            error: err.message || 'Unknown error'
          };
        }
      })
    );

    return res.json({
      success: true,
      checked_at: new Date().toISOString(),
      data: testResults
    });
  } catch (error) {
    console.error('Platform admin LLM status check error:', error);
    return res.status(500).json({ success: false, error: 'Failed to check LLM provider status' });
  }
});

// ─── KILL SWITCH ────────────────────────────────────────────────────────────

// POST /api/v1/platform-admin/emergency/shutdown
// Activates emergency mode — all non-essential endpoints start returning 503
router.post('/emergency/shutdown', async (req, res) => {
  try {
    const { reason } = req.body || {};
    const triggeredBy = req.user.email;
    const triggeredAt = new Date().toISOString();
    const modeData = {
      active: true,
      triggered_at: triggeredAt,
      triggered_by: triggeredBy,
      reason: reason || null
    };

    await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, is_encrypted)
       VALUES ('emergency_mode', $1, false)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_at = NOW()`,
      [JSON.stringify(modeData)]
    );

    invalidateEmergencyModeCache();

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
       VALUES (NULL, $1, 'platform.emergency_shutdown', 'platform', 'system', $2, true, 'success')`,
      [req.user.id, JSON.stringify({ reason: reason || null, triggered_by: triggeredBy, triggered_at: triggeredAt })]
    );

    return res.json({
      success: true,
      message: 'Emergency shutdown activated. All non-essential endpoints are now returning 503.',
      triggered_at: triggeredAt
    });
  } catch (error) {
    console.error('Emergency shutdown error:', error);
    return res.status(500).json({ success: false, error: 'Failed to activate emergency shutdown' });
  }
});

// ─── APPROVAL WORKFLOWS ──────────────────────────────────────────────────────

// GET /api/v1/platform-admin/approvals
// List pending (or filtered) approvals
router.get('/approvals', async (req, res) => {
  try {
    await approvalService.expireStaleApprovals();
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'expired']);
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status filter' });
    }
    const rows = await approvalService.getPendingApprovals({
      status,
      limit: Math.min(100, parseInt(limit, 10) || 50),
      offset: parseInt(offset, 10) || 0
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List approvals error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list approvals' });
  }
});

// GET /api/v1/platform-admin/approvals/:id
router.get('/approvals/:id', async (req, res) => {
  try {
    const approval = await approvalService.getApproval(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval not found' });
    }
    return res.json({ success: true, data: approval });
  } catch (error) {
    console.error('Get approval error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch approval' });
  }
});

// POST /api/v1/platform-admin/approvals/:id/approve
// Approves the pending action and executes it immediately
router.post('/approvals/:id/approve', async (req, res) => {
  try {
    const { note } = req.body || {};

    // Fetch the approval first so we can enforce pre-conditions before mutating state.
    const pendingApproval = await approvalService.getApproval(req.params.id);
    if (!pendingApproval) {
      return res.status(404).json({ success: false, error: 'Approval not found' });
    }
    if (pendingApproval.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'Approval not found or already resolved' });
    }

    // Enforce "second platform owner" requirement: block self-approval.
    // `requested_by` is the creator's user ID set on the pending_approvals row.
    const creatorId = pendingApproval.requested_by || null;
    if (creatorId) {
      const creatorResult = await pool.query(
        `SELECT is_platform_admin FROM users WHERE id = $1 LIMIT 1`,
        [creatorId]
      );
      const creator = creatorResult.rows[0];

      if (!creator?.is_platform_admin) {
        return res.status(400).json({
          success: false,
          error: 'Approval request is invalid because the original requester is not a platform owner.'
        });
      }

      if (String(creatorId) === String(req.user.id)) {
        return res.status(403).json({
          success: false,
          error: 'Self-approval is not allowed. A different platform owner must approve this action.'
        });
      }
    }

    // Enforce expiry before attempting to approve.
    if (pendingApproval.expires_at && new Date(pendingApproval.expires_at) <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Approval request has expired and can no longer be approved.'
      });
    }

    // Execute the staged action BEFORE marking the approval as approved so that a
    // failed execution leaves the approval in 'pending' state and can be retried.
    let executeResult = null;
    if (pendingApproval.action_type === 'feature_flag.disable') {
      const { flags } = pendingApproval.payload;
      if (flags && typeof flags === 'object') {
        await pool.query(
          `INSERT INTO platform_settings (setting_key, setting_value, is_encrypted)
           VALUES ('feature_flags', $1, false)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = $1, updated_at = NOW()`,
          [JSON.stringify(flags)]
        );
        invalidateFeatureFlagsCache();
        executeResult = { flags_applied: Object.keys(flags) };
      }
    } else if (pendingApproval.action_type === 'subscription.cancel_immediately') {
      const { org_id } = pendingApproval.payload;
      if (org_id) {
        const orgLookup = await pool.query(
          `SELECT tier, billing_status, stripe_subscription_id FROM organizations WHERE id = $1 LIMIT 1`,
          [org_id]
        );
        const org = orgLookup.rows[0];
        if (!org) {
          return res.status(404).json({ success: false, error: 'Organization not found' });
        }

        let stripeCancellationStatus = 'not_applicable';
        let cancellationAudit = null;
        if (org.stripe_subscription_id) {
          if (!isStripeConfigured()) {
            return res.status(503).json({
              success: false,
              error: 'Stripe billing is not configured. Cannot safely cancel an active paid subscription.'
            });
          }
          try {
            await cancelSubscriptionNow(org.stripe_subscription_id);
            stripeCancellationStatus = 'stripe_cancel_succeeded';
          } catch (stripeErr) {
            stripeCancellationStatus = 'stripe_cancel_failed';
            cancellationAudit = {
              eventType: 'billing.subscription_cancel_failed',
              success: false,
              outcome: 'failure',
              details: {
                stripe_status: stripeCancellationStatus,
                previous_stripe_subscription_id: org.stripe_subscription_id || null,
                error: stripeErr.message
              }
            };
            await logBillingCancellationAudit({
              organizationId: org_id,
              userId: req.user.id,
              eventType: cancellationAudit.eventType,
              success: cancellationAudit.success,
              outcome: cancellationAudit.outcome,
              details: cancellationAudit.details
            });
            console.error('Platform admin Stripe cancel error:', stripeErr);
            return res.status(502).json({
              success: false,
              error: 'Failed to cancel Stripe subscription. Billing cancellation was not applied.'
            });
          }
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const lockedOrg = await client.query(
            `SELECT id, tier, billing_status, stripe_subscription_id FROM organizations WHERE id = $1 FOR UPDATE`,
            [org_id]
          );
          if (lockedOrg.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Organization not found' });
          }

          await client.query(
            `UPDATE organizations
             SET tier = 'community', billing_status = 'canceled', paid_tier = NULL,
                 stripe_subscription_id = NULL, updated_at = NOW()
             WHERE id = $1`,
            [org_id]
          );

          await client.query('COMMIT');
          cancellationAudit = {
            eventType: 'billing.subscription_cancel_reconciled',
            success: true,
            outcome: 'success',
            details: {
              stripe_status: stripeCancellationStatus,
              previous_stripe_subscription_id: org.stripe_subscription_id || null
            }
          };
        } catch (dbError) {
          await client.query('ROLLBACK');
          cancellationAudit = {
            eventType: 'billing.subscription_cancel_reconciliation_required',
            success: false,
            outcome: 'failure',
            details: {
              stripe_status: stripeCancellationStatus,
              previous_stripe_subscription_id: org.stripe_subscription_id || null,
              reconciliation_required: stripeCancellationStatus === 'stripe_cancel_succeeded',
              error: dbError.message
            }
          };
          await logBillingCancellationAudit({
            organizationId: org_id,
            userId: req.user.id,
            eventType: cancellationAudit.eventType,
            success: cancellationAudit.success,
            outcome: cancellationAudit.outcome,
            details: cancellationAudit.details
          });
          throw dbError;
        } finally {
          client.release();
        }

        if (cancellationAudit) {
          await logBillingCancellationAudit({
            organizationId: org_id,
            userId: req.user.id,
            eventType: cancellationAudit.eventType,
            success: cancellationAudit.success,
            outcome: cancellationAudit.outcome,
            details: cancellationAudit.details
          });
        }

        executeResult = {
          org_id,
          status: 'canceled',
          stripe_canceled: !!org.stripe_subscription_id,
          stripe_status: stripeCancellationStatus
        };
      }
    }

    // Action executed successfully — now mark the approval as approved (with expiry guard).
    const approval = await approvalService.approveAction(
      req.params.id,
      req.user.id,
      req.user.email,
      note || null
    );
    if (!approval) {
      // Row was modified between our pre-check and the UPDATE (e.g. expired mid-flight or another admin approved concurrently).
      return res.status(409).json({ success: false, error: 'Approval could not be confirmed — it may have been resolved concurrently. Please refresh and try again.' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
       VALUES (NULL, $1, 'approval.approved', 'pending_approval', $2, $3, true, 'success')`,
      [
        req.user.id,
        approval.id,
        JSON.stringify({ action_type: approval.action_type, note: note || null, execute_result: executeResult })
      ]
    );

    return res.json({
      success: true,
      message: `Approval granted and action '${approval.action_type}' executed.`,
      data: { approval_id: approval.id, execute_result: executeResult }
    });
  } catch (error) {
    if (error.code === 'APPROVAL_REQUEST_EXPIRED') {
      return res.status(400).json({ success: false, error: 'Approval request has expired and can no longer be approved.' });
    }
    console.error('Approve action error:', error);
    return res.status(500).json({ success: false, error: 'Failed to approve action' });
  }
});

// POST /api/v1/platform-admin/approvals/:id/reject
router.post('/approvals/:id/reject', async (req, res) => {
  try {
    const { note } = req.body || {};
    const approval = await approvalService.rejectAction(
      req.params.id,
      req.user.id,
      req.user.email,
      note || null
    );
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval not found or already resolved' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success, outcome)
       VALUES (NULL, $1, 'approval.rejected', 'pending_approval', $2, $3, true, 'success')`,
      [
        req.user.id,
        approval.id,
        JSON.stringify({ action_type: approval.action_type, note: note || null })
      ]
    );

    return res.json({
      success: true,
      message: `Action '${approval.action_type}' rejected.`,
      data: { approval_id: approval.id }
    });
  } catch (error) {
    if (error.code === 'APPROVAL_REQUEST_EXPIRED') {
      return res.status(400).json({ success: false, error: 'Approval request has expired and can no longer be rejected.' });
    }
    console.error('Reject action error:', error);
    return res.status(500).json({ success: false, error: 'Failed to reject action' });
  }
});

// POST /api/v1/platform-admin/smtp/test — sends a test email using current SMTP config
router.post('/smtp/test', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const { to_email } = req.body || {};
    if (!to_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to_email))) {
      return res.status(400).json({ success: false, error: 'A valid to_email is required' });
    }

    const emailService = require('../services/emailService');
    await emailService.sendNotificationEmail(
      { email: String(to_email), full_name: 'Platform Admin' },
      {
        title: 'ControlWeave SMTP Test',
        message: 'SMTP is configured correctly. Email delivery is working.',
        link: null
      }
    );

    res.json({ success: true, message: `Test email sent to ${to_email}` });
  } catch (error) {
    console.error('Platform admin SMTP test error:', error);
    res.status(500).json({ success: false, error: 'SMTP test failed' });
  }
});

// ─── Backup Administration ──────────────────────────────────────────────────

// GET /api/v1/platform-admin/backups/config
// Returns current backup configuration from environment variables.
router.get('/backups/config', authenticate, requirePlatformOwner, (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: process.env.BACKUP_ENABLED === 'true',
      schedule: process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *',
      s3Configured: !!process.env.AWS_S3_BUCKET,
      s3Bucket: process.env.AWS_S3_BUCKET || null,
      s3Prefix: process.env.AWS_S3_PREFIX || 'backups/',
      retentionDays: parseInt(process.env.DB_BACKUP_RETENTION_DAYS || '7', 10),
      backupDir: process.env.DB_BACKUP_DIR || '/app/backups'
    }
  });
});

// GET /api/v1/platform-admin/backups
// Lists the most recent 50 backup run records.
router.get('/backups', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bl.id, bl.started_at, bl.completed_at, bl.status, bl.trigger,
              bl.backup_file, bl.file_size_bytes, bl.s3_key,
              bl.error_message, bl.exit_code,
              u.email AS triggered_by_email, u.full_name AS triggered_by_name
       FROM backup_logs bl
       LEFT JOIN users u ON u.id = bl.triggered_by
       ORDER BY bl.started_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve backup history' });
  }
});

// POST /api/v1/platform-admin/backups/run
// Triggers an immediate manual backup. Rejects if one is already running.
router.post('/backups/run', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    if (!_backupScheduler) {
      return res.status(503).json({ success: false, error: 'Backup service is not available' });
    }

    const { rows: running } = await pool.query(
      "SELECT id FROM backup_logs WHERE status = 'running' LIMIT 1"
    );
    if (running.length > 0) {
      return res.status(409).json({ success: false, error: 'A backup is already in progress' });
    }

    _backupScheduler.runBackup('manual', req.user.id).catch(() => {});
    res.status(202).json({ success: true, message: 'Backup started' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to start backup' });
  }
});

// ─── Security Administration ────────────────────────────────────────────────

// GET /api/v1/platform-admin/security/rate-limits
// Returns the active rate limit thresholds (display-only, env-configured at startup).
router.get('/security/rate-limits', authenticate, requirePlatformOwner, (req, res) => {
  res.json({
    success: true,
    data: {
      auth: {
        label: 'Authentication',
        windowMs: SECURITY_CONFIG.authRateLimitWindowMs,
        max: SECURITY_CONFIG.authRateLimitMax
      },
      refresh: {
        label: 'Token Refresh',
        windowMs: SECURITY_CONFIG.refreshRateLimitWindowMs,
        max: SECURITY_CONFIG.refreshRateLimitMax
      },
      api: {
        label: 'General API',
        windowMs: SECURITY_CONFIG.apiRateLimitWindowMs,
        max: SECURITY_CONFIG.apiRateLimitMax
      },
      platformAdmin: {
        label: 'Platform Admin',
        windowMs: 60 * 1000,
        max: 120
      }
    }
  });
});

// GET /api/v1/platform-admin/security/headers
// Returns current security header and CORS configuration (display-only).
router.get('/security/headers', authenticate, requirePlatformOwner, (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    data: {
      corsOrigins: SECURITY_CONFIG.corsOrigins,
      headers: {
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'",
        'Strict-Transport-Security': isProduction
          ? 'max-age=31536000; includeSubDomains'
          : '(only set in production)'
      }
    }
  });
});

// GET /api/v1/platform-admin/security/sessions
// Lists all active (non-expired) sessions platform-wide, paginated.
router.get('/security/sessions', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT s.id, s.user_id, s.expires_at, s.created_at,
                u.email, u.full_name, o.name AS org_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN organizations o ON o.id = u.organization_id
         WHERE s.expires_at > NOW()
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM sessions WHERE expires_at > NOW()")
    ]);

    res.json({
      success: true,
      data: dataResult.rows,
      total: countResult.rows[0].total,
      page,
      limit
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve sessions' });
  }
});

// DELETE /api/v1/platform-admin/security/sessions/user/:userId
// Revokes all active sessions for a specific user.
router.delete('/security/sessions/user/:userId', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    const result = await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id,
                               details, success, outcome, source_system)
       VALUES (NULL, $1, 'admin_sessions_revoked', 'user', $2,
               $3::jsonb, true, 'success', 'controlweave')`,
      [
        req.user.id,
        userId,
        JSON.stringify({ revoked_count: result.rowCount, target_user_id: userId, revoked_by: req.user.id })
      ]
    );

    res.json({ success: true, revoked: result.rowCount });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to revoke sessions' });
  }
});

// DELETE /api/v1/platform-admin/security/sessions/:sessionId
// Revokes a single session by its ID.
router.delete('/security/sessions/:sessionId', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }

    const result = await pool.query(
      'DELETE FROM sessions WHERE id = $1 RETURNING user_id',
      [sessionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const targetUserId = result.rows[0].user_id;
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id,
                               details, success, outcome, source_system)
       VALUES (NULL, $1, 'admin_session_revoked', 'session', $2,
               $3::jsonb, true, 'success', 'controlweave')`,
      [
        req.user.id,
        sessionId,
        JSON.stringify({ session_id: sessionId, target_user_id: targetUserId, revoked_by: req.user.id })
      ]
    );

    res.json({ success: true, revoked: 1 });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to revoke session' });
  }
});

// GET /api/v1/platform-admin/security/audit-logs
// Platform-wide audit log query (not scoped to any organization).
router.get('/security/audit-logs', authenticate, requirePlatformOwner, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const params = [];
    const conditions = [];

    if (req.query.userId) {
      params.push(req.query.userId);
      conditions.push(`al.user_id = $${params.length}`);
    }
    if (req.query.orgId) {
      params.push(req.query.orgId);
      conditions.push(`al.organization_id = $${params.length}`);
    }
    if (req.query.eventType) {
      params.push(req.query.eventType);
      conditions.push(`al.event_type = $${params.length}`);
    }
    if (req.query.outcome) {
      params.push(req.query.outcome);
      conditions.push(`al.outcome = $${params.length}`);
    }
    if (req.query.startDate) {
      params.push(req.query.startDate);
      conditions.push(`al.created_at >= $${params.length}`);
    }
    if (req.query.endDate) {
      params.push(req.query.endDate);
      conditions.push(`al.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT al.id, al.created_at, al.event_type, al.resource_type, al.resource_id,
                al.ip_address, al.success, al.outcome, al.failure_reason,
                u.email AS user_email, u.full_name AS user_name,
                o.name AS org_name, al.organization_id
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN organizations o ON o.id = al.organization_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.json({
      success: true,
      data: dataResult.rows,
      total: countResult.rows[0].total,
      page,
      limit
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve audit logs' });
  }
});

module.exports = router;
