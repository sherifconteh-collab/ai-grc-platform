// @tier: enterprise
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { normalizeTier } = require('../config/tierPolicy');

const router = express.Router();
const externalAiKeysLimiter = createOrgRateLimiter({
  label: 'external-ai-keys',
  windowMs: 60 * 1000,
  max: 120
});

function generateAlphanumericToken(length = 32) {
  let token = '';
  while (token.length < length) {
    token += crypto.randomBytes(length * 2).toString('base64url').replace(/[^A-Za-z0-9]/g, '');
  }
  return token.slice(0, length);
}

function hashApiKey(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

router.use(authenticate);
router.use(requirePermission('settings.manage'));
router.use(externalAiKeysLimiter);

// GET /api/v1/ai/external-keys
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, key_prefix, scopes, rate_limit_per_minute, active, created_by, last_used_at, expires_at, created_at, updated_at
       FROM external_api_keys
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List external API keys error:', error);
    res.status(500).json({ success: false, error: 'Failed to list external API keys' });
  }
});

// POST /api/v1/ai/external-keys
router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const scopes = Array.isArray(req.body?.scopes) && req.body.scopes.length > 0
      ? Array.from(new Set(req.body.scopes.map((scope) => String(scope).trim()).filter(Boolean)))
      : ['ai:log'];
    if (!scopes.includes('ai:log')) scopes.push('ai:log');
    const rateLimitPerMinute = Math.max(1, Math.min(2000, Number(req.body?.rate_limit_per_minute) || 60));
    const expiresAt = req.body?.expires_at ? new Date(req.body.expires_at) : null;

    const apiKey = `cw_live_${generateAlphanumericToken(40)}`;
    const keyPrefix = apiKey.slice(0, 24);
    const keyHash = hashApiKey(apiKey);

    const inserted = await pool.query(
      `INSERT INTO external_api_keys (
        organization_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, active, created_by, expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5::text[], $6, true, $7, $8, NOW(), NOW())
       RETURNING id, name, key_prefix, scopes, rate_limit_per_minute, active, expires_at, created_at`,
      [req.user.organization_id, name, keyPrefix, keyHash, scopes, rateLimitPerMinute, req.user.id, expiresAt]
    );

    res.status(201).json({
      success: true,
      data: inserted.rows[0],
      api_key: apiKey
    });
  } catch (error) {
    console.error('Create external API key error:', error);
    res.status(500).json({ success: false, error: 'Failed to create external API key' });
  }
});

// PATCH /api/v1/ai/external-keys/:id
router.patch('/:id', async (req, res) => {
  try {
    const updates = [];
    const values = [req.params.id, req.user.organization_id];
    let idx = 3;

    if (req.body?.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(String(req.body.name || '').trim() || 'External API Key');
    }
    if (req.body?.active !== undefined) {
      updates.push(`active = $${idx++}`);
      values.push(Boolean(req.body.active));
    }
    if (req.body?.rate_limit_per_minute !== undefined) {
      updates.push(`rate_limit_per_minute = $${idx++}`);
      values.push(Math.max(1, Math.min(2000, Number(req.body.rate_limit_per_minute) || 60)));
    }
    if (req.body?.expires_at !== undefined) {
      updates.push(`expires_at = $${idx++}`);
      values.push(req.body.expires_at ? new Date(req.body.expires_at) : null);
    }
    if (req.body?.scopes !== undefined) {
      const scopes = Array.isArray(req.body.scopes)
        ? Array.from(new Set(req.body.scopes.map((scope) => String(scope).trim()).filter(Boolean)))
        : ['ai:log'];
      if (!scopes.includes('ai:log')) scopes.push('ai:log');
      updates.push(`scopes = $${idx++}::text[]`);
      values.push(scopes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE external_api_keys
       SET ${updates.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING id, name, key_prefix, scopes, rate_limit_per_minute, active, last_used_at, expires_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'External API key not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update external API key error:', error);
    res.status(500).json({ success: false, error: 'Failed to update external API key' });
  }
});

module.exports = router;
