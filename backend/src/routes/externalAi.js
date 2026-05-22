// @tier: enterprise
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { createRateLimiter } = require('../middleware/rateLimit');
const { normalizeTier } = require('../config/tierPolicy');

const router = express.Router();

const keyRateState = new Map();
const keyLastUsedSync = new Map();
const VALID_RISK_LEVELS = new Set(['limited', 'low', 'medium', 'high', 'critical']);
const externalIngestLimiter = createRateLimiter({
  label: 'external-ai-ingest',
  windowMs: 60 * 1000,
  max: 240,
  keyGenerator: (req) => parseApiKey(req) || req.ip || 'unknown'
});
const keyStateGcInterval = setInterval(() => {
  try {
    const currentBucket = Math.floor(Date.now() / 60000);
    for (const stateKey of keyRateState.keys()) {
      const keyBucket = Number(String(stateKey).split(':').pop());
      if (Number.isFinite(keyBucket) && keyBucket < (currentBucket - 2)) {
        keyRateState.delete(stateKey);
      }
    }
    const now = Date.now();
    for (const [keyId, lastSyncMs] of keyLastUsedSync.entries()) {
      if ((now - Number(lastSyncMs || 0)) > 5 * 60 * 1000) {
        keyLastUsedSync.delete(keyId);
      }
    }
  } catch (error) {
    console.error('External AI key state cleanup error:', error);
  }
}, 60 * 1000);
if (typeof keyStateGcInterval.unref === 'function') keyStateGcInterval.unref();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function parseApiKey(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-api-key'] || '').trim();
}

async function authenticateExternalApiKey(req, res, next) {
  try {
    const apiKey = parseApiKey(req);
    if (!apiKey || !apiKey.startsWith('cw_live_')) {
      return res.status(401).json({ success: false, error: 'Valid external API key required' });
    }

    const keyHash = sha256(apiKey);
    const result = await pool.query(
      `SELECT k.id, k.organization_id, k.scopes, k.rate_limit_per_minute, k.active, k.expires_at,
              o.tier AS organization_tier
       FROM external_api_keys k
       JOIN organizations o ON o.id = k.organization_id
       WHERE k.key_hash = $1
       LIMIT 1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid external API key' });
    }

    const key = result.rows[0];
    if (!key.active) {
      return res.status(403).json({ success: false, error: 'External API key is inactive' });
    }
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(403).json({ success: false, error: 'External API key has expired' });
    }
    if (!Array.isArray(key.scopes) || !key.scopes.includes('ai:log')) {
      return res.status(403).json({ success: false, error: 'External API key missing ai:log scope' });
    }

    const now = Date.now();
    const bucket = Math.floor(now / 60000);
    const stateKey = `${key.id}:${bucket}`;
    const count = (keyRateState.get(stateKey) || 0) + 1;
    keyRateState.set(stateKey, count);
    if (count > Number(key.rate_limit_per_minute || 60)) {
      return res.status(429).json({ success: false, error: 'External API key rate limit exceeded' });
    }

    req.externalApiKey = key;
    const lastSyncedAt = Number(keyLastUsedSync.get(key.id) || 0);
    if ((now - lastSyncedAt) >= 60 * 1000) {
      keyLastUsedSync.set(key.id, now);
      await pool.query('UPDATE external_api_keys SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1', [key.id]).catch((error) => {
        console.error('External AI key last_used update error:', error);
      });
    }
    return next();
  } catch (error) {
    console.error('External API key auth error:', error);
    return res.status(500).json({ success: false, error: 'Failed to authenticate external API key' });
  }
}

// POST /api/v1/external-ai/decisions
router.post('/decisions', externalIngestLimiter, authenticateExternalApiKey, async (req, res) => {
  try {
    const body = req.body || {};
    const inputData = body.input_data || body.input || {};
    const outputData = body.output_data || body.output || {};
    const inputText = JSON.stringify(inputData);
    const outputText = JSON.stringify(outputData);
    const inputHash = sha256(inputText);
    const outputHash = sha256(outputText);
    const processingTimestamp = body.processing_timestamp ? new Date(body.processing_timestamp) : new Date();
    const modelVersion = body.model_version || body.external_model || null;
    const riskLevel = String(body.risk_level || 'limited').toLowerCase();
    if (!VALID_RISK_LEVELS.has(riskLevel)) {
      return res.status(400).json({
        success: false,
        error: `risk_level must be one of: ${Array.from(VALID_RISK_LEVELS).join(', ')}`
      });
    }

    const inserted = await pool.query(
      `INSERT INTO ai_decision_log (
         ai_agent_id, organization_id, input_data, input_hash, model_version, processing_timestamp,
         output_data, output_hash, confidence_score, reasoning, key_factors,
         human_reviewed, correlation_id, session_id, regulatory_framework, risk_assessment,
         compliance_notes, feature, risk_level, decision_source, external_provider, external_model,
         external_decision_id, external_api_key_id, created_at, updated_at
       )
       VALUES (
         NULL, $1, $2::jsonb, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb,
         false, $11, $12, $13, $14, $15, $16, $17, 'external', $18, $19, $20, $21, NOW(), NOW()
       )
       RETURNING id, organization_id, processing_timestamp`,
      [
        req.externalApiKey.organization_id,
        inputData,
        inputHash,
        modelVersion,
        processingTimestamp,
        outputData,
        outputHash,
        body.confidence_score ?? null,
        body.reasoning || null,
        body.key_factors || [],
        body.correlation_id || null,
        body.session_id || null,
        body.regulatory_framework || null,
        body.risk_assessment || null,
        body.compliance_notes || null,
        body.feature || null,
        riskLevel,
        body.external_provider || null,
        body.external_model || null,
        body.external_decision_id || null,
        req.externalApiKey.id
      ]
    );

    return res.status(201).json({
      success: true,
      data: inserted.rows[0]
    });
  } catch (error) {
    console.error('External AI decision ingest error:', error);
    return res.status(500).json({ success: false, error: 'Failed to ingest external AI decision' });
  }
});

module.exports = router;
