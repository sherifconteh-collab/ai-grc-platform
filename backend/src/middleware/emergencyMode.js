// @tier: platform
'use strict';

/**
 * Emergency Mode (Kill Switch) Middleware
 *
 * When `emergency_mode` is active in platform_settings, all non-essential
 * endpoints return 503 EMERGENCY_MODE. Platform owners can still reach
 * the recovery/status endpoints to inspect and disable emergency mode.
 *
 * Bypass paths (always allowed):
 *   GET  /health
 *   GET  /
 *   GET  /edition
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/refresh
 *   POST /api/v1/platform-admin/emergency/restore
 *   GET  /api/v1/platform-admin/system-status
 */

const pool = require('../config/database');

// Short TTL so restore propagates quickly (10 s max lag)
const CACHE_TTL_MS = 10 * 1000;

let _cache = { active: false, ts: 0, data: null };

const BYPASS_EXACT = new Set(['/', '/health', '/edition']);

const BYPASS_PREFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/platform-admin/emergency/restore',
  '/api/v1/platform-admin/system-status'
];

function invalidateEmergencyModeCache() {
  _cache = { active: false, ts: 0, data: null };
}

function parseEmergencyModeValue(raw) {
  let val = raw;
  if (typeof raw === 'string') {
    try {
      val = JSON.parse(raw);
    } catch (error) {
      val = raw.trim();
    }
  }

  let active = false;
  if (typeof val === 'boolean') {
    active = val;
  } else if (typeof val === 'string') {
    active = val.toLowerCase() === 'true';
  } else if (val && typeof val === 'object') {
    if (typeof val.active === 'boolean') {
      active = val.active;
    } else if (typeof val.active === 'string') {
      active = val.active.toLowerCase() === 'true';
    }
  }

  return { active, data: val };
}


async function _loadEmergencyMode() {
  try {
    const result = await pool.query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'emergency_mode' LIMIT 1`
    );
    if (result.rows.length === 0) {
      _cache = { active: false, ts: Date.now(), data: null };
      return false;
    }
    const { active, data } = parseEmergencyModeValue(result.rows[0].setting_value);
    _cache = { active, ts: Date.now(), data };
    return _cache.active;
  } catch (err) {
    // DB failure → fail open so a DB outage can't lock everyone out
    console.error('[emergencyMode] Cache load failed:', err.message);
    return false;
  }
}

async function emergencyModeGate(req, res, next) {
  const path = req.path || '';

  if (BYPASS_EXACT.has(path)) return next();
  for (const prefix of BYPASS_PREFIXES) {
    if (path.startsWith(prefix)) return next();
  }

  const now = Date.now();
  let isActive;
  if (_cache.ts > 0 && now - _cache.ts < CACHE_TTL_MS) {
    isActive = _cache.active;
  } else {
    isActive = await _loadEmergencyMode();
  }

  if (!isActive) return next();

  return res.status(503).json({
    success: false,
    error: 'System is in emergency shutdown mode. Contact your platform administrator.',
    code: 'EMERGENCY_MODE',
    triggered_at: _cache.data?.triggered_at || null,
    triggered_by: _cache.data?.triggered_by || null
  });
}

module.exports = { emergencyModeGate, invalidateEmergencyModeCache, parseEmergencyModeValue };
