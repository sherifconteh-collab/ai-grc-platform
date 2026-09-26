// @tier: community
// Global search behind the Ctrl+K command palette. Returns a few records per
// type, each type gated by the read permission of the module that owns it and
// filtered by organization_id. Results carry ids only; the frontend turns them
// into links with lib/deepLinks.ts so every result opens its own record.
//
// This edition has no ERP module and no Policies frontend page yet (the
// policy tables exist, but there is no /dashboard/policies screen to link
// into), so those two record types from ControlWeaver-Pro are not searched here.
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { log, serializeError } = require('../utils/logger');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 240, label: 'global-search' }));

const PER_TYPE_LIMIT = 6;
const MAX_QUERY_LENGTH = 100;

function can(req, permission) {
  const perms = req.user.permissions || [];
  return perms.includes('*') || perms.includes(permission);
}

function escapeIlike(str) {
  return String(str).replace(/[%_\\]/g, '\\$&');
}

// $1 = organization_id, $2 = '%term%', $3 = limit, $4 = compact term for ids ('ac2' matches 'AC-2')
const TYPES = [
  {
    type: 'control',
    permission: 'controls.read',
    sql: `SELECT fc.id, fc.control_id AS ref, fc.title, f.name AS context, NULL::uuid AS parent_id
            FROM framework_controls fc
            JOIN frameworks f ON f.id = fc.framework_id
            JOIN organization_frameworks ofw ON ofw.framework_id = f.id AND ofw.organization_id = $1
           WHERE fc.control_id ILIKE $2 OR fc.title ILIKE $2
              OR regexp_replace(lower(fc.control_id), '[^a-z0-9]', '', 'g') = $4
           ORDER BY (regexp_replace(lower(fc.control_id), '[^a-z0-9]', '', 'g') = $4) DESC,
                    (fc.control_id ILIKE $2) DESC, length(fc.control_id), fc.control_id
           LIMIT $3`
  },
  {
    type: 'risk',
    permission: 'risks.read',
    sql: `SELECT id, reference AS ref, title, status AS context, NULL::uuid AS parent_id FROM risks
           WHERE organization_id = $1 AND (title ILIKE $2 OR reference ILIKE $2)
           ORDER BY updated_at DESC LIMIT $3`
  },
  {
    type: 'poam',
    permission: 'controls.read',
    sql: `SELECT id, NULL AS ref, title, status AS context, NULL::uuid AS parent_id FROM poam_items
           WHERE organization_id = $1 AND title ILIKE $2
           ORDER BY updated_at DESC LIMIT $3`
  },
  {
    type: 'vendor',
    permission: 'tprm.read',
    sql: `SELECT id, NULL AS ref, vendor_name AS title, risk_tier AS context, NULL::uuid AS parent_id FROM tprm_vendors
           WHERE organization_id = $1 AND vendor_name ILIKE $2
           ORDER BY vendor_name LIMIT $3`
  },
  {
    type: 'evidence',
    permission: 'evidence.read',
    sql: `SELECT id, NULL AS ref, file_name AS title, description AS context, NULL::uuid AS parent_id FROM evidence
           WHERE organization_id = $1 AND (file_name ILIKE $2 OR description ILIKE $2)
           ORDER BY created_at DESC LIMIT $3`
  },
  {
    type: 'asset',
    permission: 'assets.read',
    sql: `SELECT id, asset_tag AS ref, name AS title, hostname AS context, NULL::uuid AS parent_id FROM assets
           WHERE organization_id = $1 AND (name ILIKE $2 OR asset_tag ILIKE $2 OR hostname ILIKE $2)
           ORDER BY name LIMIT $3`
  },
  {
    type: 'incident',
    permission: 'incidents.read',
    sql: `SELECT id, reference AS ref, title, severity AS context, NULL::uuid AS parent_id FROM incidents
           WHERE organization_id = $1 AND (title ILIKE $2 OR reference ILIKE $2)
           ORDER BY updated_at DESC LIMIT $3`
  }
];

// GET /api/v1/search?q=...
router.get('/', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return res.json({ success: true, data: { query: q, results: [] } });
    if (q.length > MAX_QUERY_LENGTH) return res.status(400).json({ success: false, error: 'Search text is too long' });

    const orgId = req.user.organization_id;
    const pattern = `%${escapeIlike(q)}%`;
    const compact = q.toLowerCase().replace(/[^a-z0-9]/g, '');
    const active = TYPES.filter((t) => can(req, t.permission));
    const params = [orgId, pattern, PER_TYPE_LIMIT, compact];
    const batches = await Promise.all(active.map(async (t) => {
      // Postgres rejects unused bind parameters, so pass only the ones the query names.
      const { rows } = await pool.query(t.sql, t.sql.includes('$4') ? params : params.slice(0, 3));
      return rows.map((r) => ({ ...r, type: t.type }));
    }));
    res.json({ success: true, data: { query: q, results: batches.flat() } });
  } catch (error) {
    log('error', 'search.failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

module.exports = router;
module.exports._internal = { escapeIlike, TYPES };
