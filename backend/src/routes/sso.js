// @tier: enterprise
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticate, requirePermission, requireTier } = require('../middleware/auth');
const SSO_TIER = 'pro'; // SSO available on pro+
const sso = require('../services/ssoService');
const auditService = require('../services/auditService');
const { JWT_SECRET } = require('../config/security');
const { validateBody, requireFields } = require('../middleware/validate');
const { hashForLookup } = require('../utils/encrypt');
const { hasPublicColumn } = require('../utils/schema');
const { resolveExpiryTimestampFromNow } = require('../utils/sessionExpiry');

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Escape special characters in LIKE patterns to prevent wildcard injection
function escapeLike(str) {
  return String(str).replace(/[%_\\]/g, '\\$&');
}

function issueTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

// email_hash column availability cache for SSO route (checked once per process)
let ssoEmailHashColumnAvailable = null;
async function hasSsoEmailHashCol() {
  if (ssoEmailHashColumnAvailable === null) {
    ssoEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
  }
  return ssoEmailHashColumnAvailable;
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function storeSession(userId, refreshToken) {
  const sessionExpiresAt = resolveExpiryTimestampFromNow(REFRESH_EXPIRY, 'JWT_REFRESH_EXPIRY');
  await pool.query(
    'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
    [userId, hashRefreshToken(refreshToken), sessionExpiresAt]
  );
}

function callbackUrl(provider) {
  return `${BACKEND_URL}/api/v1/sso/callback/${provider}`;
}

// ─── SSO Config management (admin only) ─────────────────────────────────────

// GET /sso/config
router.get('/config', authenticate, requireTier(SSO_TIER), requirePermission('settings.manage'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, provider_type, display_name, discovery_url, client_id,
              scopes, metadata_url, sp_entity_id, auto_provision, default_role, enabled
       FROM sso_configurations
       WHERE organization_id = $1 LIMIT 1`,
      [req.user.organization_id]
    );
    return res.json({ data: result.rows[0] || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve SSO configuration' });
  }
});

// PUT /sso/config
router.put(
  '/config',
  authenticate,
  requireTier(SSO_TIER),
  requirePermission('settings.manage'),
  validateBody((body) => requireFields(body, ['provider_type'])),
  async (req, res) => {
    try {
      await sso.saveOrgSsoConfig(req.user.organization_id, req.body);
      
      // Log SSO configuration change
      const context = auditService.extractAuditContext(req);
      await auditService.logSsoConfigChange({
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'updated',
        provider: req.body.provider_type,
        details: {
          display_name: req.body.display_name,
          enabled: req.body.enabled !== false
        },
        ...context,
        actorName: auditService.getActorName(req.user)
      });
      
      return res.json({ data: { saved: true } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save SSO configuration' });
    }
  }
);

// ─── Org OIDC SSO flow ───────────────────────────────────────────────────────

// GET /sso/login/:orgSlug  (or use org_id)
router.get('/login/org', async (req, res) => {
  try {
    const { org_id } = req.query;
    if (!org_id) return res.status(400).json({ error: 'org_id is required.' });

    const config = await sso.getOrgSsoConfig(org_id);
    if (!config) return res.status(404).json({ error: 'SSO not configured for this organization.' });

    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');

    // Store state+nonce temporarily in passkey_challenges table (reuse the mechanism)
    await pool.query(
      `INSERT INTO passkey_challenges (challenge, type, user_id)
       VALUES ($1, 'authentication', NULL)`,
      [JSON.stringify({ state, nonce, org_id })]
    );

    if (config.provider_type === 'oidc') {
      const authUrl = await sso.getOidcAuthUrl(
        config.discovery_url,
        config.client_id,
        config.client_secret,
        callbackUrl('org'),
        state,
        nonce,
        config.scopes
      );
      return res.redirect(authUrl);
    }

    return res.status(400).json({ error: 'SAML not yet implemented via this endpoint.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to initiate SSO login' });
  }
});

// GET /sso/callback/org
router.get('/callback/org', async (req, res) => {
  const context = auditService.extractAuditContext(req);
  let org_id, userId, email, ssoProviderName;

  try {
    const { state, code } = req.query;

    // Retrieve stored state
    const stateResult = await pool.query(
      `DELETE FROM passkey_challenges
       WHERE challenge LIKE $1 AND type = 'authentication' AND expires_at > NOW()
       RETURNING challenge`,
      [`%"state":"${escapeLike(state)}"%`]
    );
    if (stateResult.rows.length === 0) {
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
    }

    const { nonce, org_id: orgId } = JSON.parse(stateResult.rows[0].challenge);
    org_id = orgId;
    const config = await sso.getOrgSsoConfig(org_id);
    if (!config) return res.redirect(`${FRONTEND_URL}/login?error=sso_not_configured`);

    ssoProviderName = config.display_name || config.provider_type || 'oidc';

    const { userinfo } = await sso.exchangeOidcCode(
      config.discovery_url,
      config.client_id,
      config.client_secret,
      callbackUrl('org'),
      req.query,
      { state, nonce }
    );

    email = userinfo.email;
    if (!email) return res.redirect(`${FRONTEND_URL}/login?error=no_email`);

    userId = await sso.provisionUser(
      org_id, email,
      userinfo.name || userinfo.preferred_username || email,
      config.default_role,
      `oidc:${config.id}`, userinfo.sub,
      null, null, null
    );

    // Log successful SSO authentication
    await auditService.logAuthentication({
      organizationId: org_id,
      userId,
      email,
      authMethod: 'sso',
      ssoProvider: ssoProviderName,
      success: true,
      ...context,
      actorName: userinfo.name || email
    });

    const { accessToken, refreshToken } = issueTokens(userId);
    await storeSession(userId, refreshToken);
    return res.redirect(
      `${FRONTEND_URL}/login/sso-callback#at=${encodeURIComponent(accessToken)}&rt=${encodeURIComponent(refreshToken)}`
    );
  } catch (err) {
    console.error('SSO callback error:', err);
    
    // Log failed SSO authentication
    if (org_id) {
      try {
        await auditService.logAuthentication({
          organizationId: org_id,
          userId: userId || null,
          email: email || 'unknown',
          authMethod: 'sso',
          ssoProvider: ssoProviderName || 'unknown',
          success: false,
          failureReason: err.message,
          ...context
        });
      } catch (auditErr) {
        console.error('Failed to log SSO failure:', auditErr);
      }
    }
    
    const errorCode = err.message === 'Account is disabled'
      ? 'account_disabled'
      : 'sso_failed';
    return res.redirect(`${FRONTEND_URL}/login?error=${errorCode}`);
  }
});

// ─── Social login flows ───────────────────────────────────────────────────────

// GET /sso/social/:provider  — initiates OAuth2 flow
router.get('/social/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ['google', 'microsoft', 'apple', 'github'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Unknown provider.' });
    }

    const cfg = sso.SOCIAL_PROVIDERS[provider];
    if (!cfg?.clientId) {
      return res.status(503).json({ error: `${provider} sign-in is not configured on this server.` });
    }

    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');

    await pool.query(
      `INSERT INTO passkey_challenges (challenge, type, user_id)
       VALUES ($1, 'authentication', NULL)`,
      [JSON.stringify({ state, nonce, provider })]
    );

    if (provider === 'github') {
      return res.redirect(sso.getGitHubAuthUrl(callbackUrl(provider), state));
    }

    // All others are OIDC
    const authUrl = await sso.getOidcAuthUrl(
      cfg.discoveryUrl,
      cfg.clientId,
      cfg.clientSecret,
      callbackUrl(provider),
      state,
      nonce,
      cfg.scopes
    );
    return res.redirect(authUrl);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to initiate social login' });
  }
});

// GET /sso/callback/:provider
router.get('/callback/:provider', async (req, res) => {
  const context = auditService.extractAuditContext(req);
  let email, userId, orgId;

  try {
    const { provider } = req.params;
    const { state, code } = req.query;

    const stateResult = await pool.query(
      `DELETE FROM passkey_challenges
       WHERE challenge LIKE $1 AND type = 'authentication' AND expires_at > NOW()
       RETURNING challenge`,
      [`%"state":"${escapeLike(state)}"%`]
    );
    if (stateResult.rows.length === 0) {
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
    }

    const { nonce } = JSON.parse(stateResult.rows[0].challenge);
    const cfg = sso.SOCIAL_PROVIDERS[provider];
    if (!cfg) return res.redirect(`${FRONTEND_URL}/login?error=unknown_provider`);

    let name, providerUserId, accessToken;

    if (provider === 'github') {
      const ghUser = await sso.exchangeGitHubCode(code, callbackUrl(provider));
      ({ email, name, providerUserId, accessToken } = ghUser);
    } else {
      const { tokenSet, userinfo } = await sso.exchangeOidcCode(
        cfg.discoveryUrl,
        cfg.clientId,
        cfg.clientSecret,
        callbackUrl(provider),
        req.query,
        { state, nonce }
      );
      email = userinfo.email;
      name = userinfo.name || userinfo.preferred_username;
      providerUserId = userinfo.sub;
      accessToken = tokenSet.access_token;
    }

    if (!email) return res.redirect(`${FRONTEND_URL}/login?error=no_email`);

    // Find or create user — for social logins, users can belong to any org
    // First check if the social login already exists
    const existingSocial = await pool.query(
      `SELECT ul.user_id, u.is_active
       FROM user_social_logins ul
       JOIN users u ON u.id = ul.user_id
       WHERE ul.provider = $1 AND ul.provider_user_id = $2`,
      [provider, providerUserId]
    );

    if (existingSocial.rows.length > 0) {
      if (!existingSocial.rows[0].is_active) {
        return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`);
      }

      userId = existingSocial.rows[0].user_id;
      await pool.query(
        `UPDATE user_social_logins SET access_token=$1, updated_at=NOW()
         WHERE provider=$2 AND provider_user_id=$3`,
        [accessToken, provider, providerUserId]
      );
    } else {
      // Check if user exists by email (must already have an account)
      const ssoEmailHash = (await hasSsoEmailHashCol()) ? hashForLookup(email.toLowerCase()) : null;
      let existingUser;
      if (ssoEmailHash) {
        existingUser = await pool.query(
          `SELECT id, is_active FROM users WHERE email_hash = $1 LIMIT 1`,
          [ssoEmailHash]
        );
        // Fallback for pre-migration rows (email_hash IS NULL)
        if (existingUser.rows.length === 0) {
          existingUser = await pool.query(
            `SELECT id, is_active FROM users WHERE email = $1 AND email_hash IS NULL LIMIT 1`,
            [email.toLowerCase()]
          );
        }
      } else {
        existingUser = await pool.query(
          `SELECT id, is_active FROM users WHERE email = $1 LIMIT 1`,
          [email.toLowerCase()]
        );
      }
      if (existingUser.rows.length === 0) {
        // No existing account — redirect to register with pre-filled email
        return res.redirect(
          `${FRONTEND_URL}/register?email=${encodeURIComponent(email)}&social_provider=${provider}&error=account_required`
        );
      }
      if (!existingUser.rows[0].is_active) {
        return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`);
      }

      userId = existingUser.rows[0].id;
      await pool.query(
        `INSERT INTO user_social_logins (user_id, provider, provider_user_id, email, access_token)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [userId, provider, providerUserId, email, accessToken]
      );
    }

    // Get organization ID for audit logging
    const userOrgResult = await pool.query(
      `SELECT organization_id FROM users WHERE id = $1`,
      [userId]
    );
    orgId = userOrgResult.rows[0]?.organization_id;

    // Log successful social login
    if (orgId) {
      await auditService.logAuthentication({
        organizationId: orgId,
        userId,
        email,
        authMethod: 'sso',
        ssoProvider: provider,
        success: true,
        ...context,
        actorName: name || email
      });
    }

    const { accessToken: at, refreshToken: rt } = issueTokens(userId);
    await storeSession(userId, rt);
    return res.redirect(
      `${FRONTEND_URL}/login/sso-callback#at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`
    );
  } catch (err) {
    console.error(`Social ${req.params.provider} callback error:`, err);
    
    // Log failed social login (only if we have orgId, which requires successful user lookup)
    // Early-stage failures (invalid state, missing email) cannot be logged without org context
    if (orgId && email) {
      try {
        await auditService.logAuthentication({
          organizationId: orgId,
          userId: userId || null,
          email,
          authMethod: 'sso',
          ssoProvider: req.params.provider,
          success: false,
          failureReason: err.message,
          ...context
        });
      } catch (auditErr) {
        console.error('Failed to log social login failure:', auditErr);
      }
    }
    
    const errorCode = err.message === 'Account is disabled'
      ? 'account_disabled'
      : 'social_failed';
    return res.redirect(`${FRONTEND_URL}/login?error=${errorCode}`);
  }
});

// GET /sso/providers — returns which social providers are enabled on this server
router.get('/providers', async (req, res) => {
  const providers = [];
  for (const [name, cfg] of Object.entries(sso.SOCIAL_PROVIDERS)) {
    if (cfg.clientId) providers.push(name);
  }
  return res.json({ data: providers });
});

// GET /sso/social-logins — list social logins for current user
router.get('/social-logins', authenticate, requireTier(SSO_TIER), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, provider, email, created_at FROM user_social_logins WHERE user_id = $1`,
      [req.user.id]
    );
    return res.json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve social logins' });
  }
});

// DELETE /sso/social-logins/:provider — unlink a social provider
router.delete('/social-logins/:provider', authenticate, requireTier(SSO_TIER), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM user_social_logins WHERE user_id = $1 AND provider = $2`,
      [req.user.id, req.params.provider]
    );
    return res.json({ data: { unlinked: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unlink social login' });
  }
});

module.exports = router;
