// @tier: enterprise
'use strict';

const { Issuer } = require('openid-client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');
const { encrypt, decrypt } = require('../utils/encrypt');

// ─── Social provider base configs ────────────────────────────────────────────

const SOCIAL_PROVIDERS = {
  google: {
    discoveryUrl: 'https://accounts.google.com',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: 'openid email profile',
  },
  microsoft: {
    discoveryUrl: 'https://login.microsoftonline.com/common/v2.0',
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    scopes: 'openid email profile',
  },
  apple: {
    // Apple uses a non-standard OIDC flow; we handle it as a special case
    discoveryUrl: 'https://appleid.apple.com',
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET, // JWT signed with Apple private key
    scopes: 'openid name email',
  },
  github: {
    // GitHub OAuth2 is not OIDC; handled separately
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    emailUrl: 'https://api.github.com/user/emails',
    scopes: 'read:user user:email',
  },
};

// ─── OIDC client cache ────────────────────────────────────────────────────────

const clientCache = new Map(); // discoveryUrl → {client, ts}
const CACHE_TTL_MS = 30 * 60 * 1000;

async function getOidcClient(discoveryUrl, clientId, clientSecret) {
  const cacheKey = `${discoveryUrl}:${clientId}`;
  const cached = clientCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.client;

  const issuer = await Issuer.discover(discoveryUrl);
  const client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    response_types: ['code'],
  });

  clientCache.set(cacheKey, { client, ts: Date.now() });
  return client;
}

// ─── Org SSO config ──────────────────────────────────────────────────────────

async function getOrgSsoConfig(organizationId) {
  const result = await pool.query(
    `SELECT * FROM sso_configurations WHERE organization_id = $1 AND enabled = true LIMIT 1`,
    [organizationId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.client_secret && row.is_secret_encrypted) {
    row.client_secret = decrypt(row.client_secret);
  }
  return row;
}

async function saveOrgSsoConfig(organizationId, data) {
  const {
    provider_type,
    display_name,
    discovery_url,
    client_id,
    client_secret,
    scopes,
    metadata_url,
    sp_entity_id,
    auto_provision,
    default_role,
    enabled,
  } = data;

  let storedSecret = client_secret || null;
  let isEncrypted = false;
  if (storedSecret) {
    storedSecret = encrypt(storedSecret);
    isEncrypted = true;
  }

  await pool.query(
    `INSERT INTO sso_configurations
       (organization_id, provider_type, display_name, discovery_url, client_id, client_secret,
        is_secret_encrypted, scopes, metadata_url, sp_entity_id, auto_provision, default_role, enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (organization_id)
     DO UPDATE SET
       provider_type = EXCLUDED.provider_type,
       display_name = EXCLUDED.display_name,
       discovery_url = EXCLUDED.discovery_url,
       client_id = EXCLUDED.client_id,
       client_secret = CASE WHEN $6::text IS NOT NULL THEN EXCLUDED.client_secret ELSE sso_configurations.client_secret END,
       is_secret_encrypted = CASE WHEN $6::text IS NOT NULL THEN EXCLUDED.is_secret_encrypted ELSE sso_configurations.is_secret_encrypted END,
       scopes = EXCLUDED.scopes,
       metadata_url = EXCLUDED.metadata_url,
       sp_entity_id = EXCLUDED.sp_entity_id,
       auto_provision = EXCLUDED.auto_provision,
       default_role = EXCLUDED.default_role,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()`,
    [organizationId, provider_type, display_name || 'SSO', discovery_url || null,
     client_id || null, storedSecret, isEncrypted, scopes || 'openid email profile',
     metadata_url || null, sp_entity_id || null,
     auto_provision !== false, default_role || 'user', enabled !== false]
  );
}

// ─── OIDC flow helpers ────────────────────────────────────────────────────────

async function getOidcAuthUrl(discoveryUrl, clientId, clientSecret, redirectUri, state, nonce, scopes) {
  const client = await getOidcClient(discoveryUrl, clientId, clientSecret);
  return client.authorizationUrl({
    scope: scopes || 'openid email profile',
    redirect_uri: redirectUri,
    state,
    nonce,
    response_type: 'code',
  });
}

async function exchangeOidcCode(discoveryUrl, clientId, clientSecret, redirectUri, callbackParams, checks) {
  const client = await getOidcClient(discoveryUrl, clientId, clientSecret);
  const tokenSet = await client.callback(redirectUri, callbackParams, checks);
  const userinfo = await client.userinfo(tokenSet.access_token);
  return { tokenSet, userinfo };
}

// ─── User provisioning ────────────────────────────────────────────────────────

function splitFullName(name, fallbackEmail) {
  const normalized = String(name || fallbackEmail || '').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'User',
    lastName: parts.slice(1).join(' ') || ''
  };
}

async function provisionUser(organizationId, email, name, role, provider, providerUserId, accessToken, refreshToken, expiresAt) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look for existing user in the org
    let userRow = await client.query(
      `SELECT id, is_active FROM users WHERE email = $1 AND organization_id = $2 LIMIT 1`,
      [email.toLowerCase(), organizationId]
    );

    let userId;
    if (userRow.rows.length > 0) {
      if (!userRow.rows[0].is_active) {
        throw new Error('Account is disabled');
      }
      userId = userRow.rows[0].id;
    } else {
      // Auto-provision new user
      const { firstName, lastName } = splitFullName(name, email);
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const newUser = await client.query(
        `INSERT INTO users (email, first_name, last_name, organization_id, role, is_active, password_hash)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         RETURNING id`,
        [email.toLowerCase(), firstName, lastName, organizationId, role || 'user', passwordHash]
      );
      userId = newUser.rows[0].id;
    }

    // Upsert social login link
    await client.query(
      `INSERT INTO user_social_logins
         (user_id, provider, provider_user_id, email, access_token, refresh_token, expires_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (provider, provider_user_id)
       DO UPDATE SET user_id=$1, email=$4, access_token=$5, refresh_token=$6, expires_at=$7, updated_at=NOW()`,
      [userId, provider, providerUserId, email, accessToken || null, refreshToken || null, expiresAt || null]
    );

    await client.query('COMMIT');
    return userId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── GitHub OAuth2 (non-OIDC) ────────────────────────────────────────────────

function getGitHubAuthUrl(redirectUri, state) {
  const cfg = SOCIAL_PROVIDERS.github;
  const params = new URLSearchParams({
    client_id: cfg.clientId || '',
    redirect_uri: redirectUri,
    scope: cfg.scopes,
    state,
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

async function exchangeGitHubCode(code, redirectUri) {
  const cfg = SOCIAL_PROVIDERS.github;
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: redirectUri }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('GitHub token exchange failed.');

  const userRes = await fetch(cfg.userUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'ControlWeave' },
  });
  const user = await userRes.json();

  let email = user.email;
  if (!email) {
    const emailsRes = await fetch(cfg.emailUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'ControlWeave' },
    });
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) ? emails.find(e => e.primary && e.verified) : null;
    email = primary?.email || null;
  }

  return {
    providerUserId: String(user.id),
    email,
    name: user.name || user.login,
    accessToken: tokenData.access_token,
  };
}

module.exports = {
  SOCIAL_PROVIDERS,
  getOrgSsoConfig,
  saveOrgSsoConfig,
  getOidcAuthUrl,
  exchangeOidcCode,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  provisionUser,
};
