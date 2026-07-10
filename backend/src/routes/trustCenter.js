// @tier: community
/**
 * Trust Center – public compliance-posture page.
 *
 * Admin endpoints (authenticated, settings.manage) manage the per-org config;
 * GET /public/:token serves the public page data. The public endpoint exposes
 * only aggregate, toggle-gated data: framework names, per-framework compliance
 * percentages, and active ATO counts. No control-level detail, user data, or
 * notes ever leave this route.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');

const publicRateLimiter = createRateLimiter({
  label: 'trust-center-public',
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip
});

// express-rate-limit applied router-wide (admin + public routes) so static
// analysis (CodeQL) can trace a recognized rate-limiting middleware; the
// Redis-backed publicRateLimiter above remains the real per-IP production
// control on the public endpoint specifically.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function fetchOrCreateConfig(orgId, userId) {
  const existing = await pool.query(
    `SELECT * FROM trust_center_configs WHERE organization_id = $1`,
    [orgId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await pool.query(
    `INSERT INTO trust_center_configs (organization_id, public_token, created_by, updated_by)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (organization_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [orgId, newToken(), userId]
  );
  return created.rows[0];
}

// ===========================================================================
// GET /trust-center/config — fetch (lazily creating) the org's config
// ===========================================================================
router.get('/config', authenticate, requirePermission('settings.manage'), async (req, res) => {
  try {
    const config = await fetchOrCreateConfig(req.user.organization_id, req.user.id);
    res.json({ success: true, data: config });
  } catch (error) {
    log('error', 'trust_center.config.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load Trust Center configuration' });
  }
});

// ===========================================================================
// PUT /trust-center/config — update display fields and toggles
// ===========================================================================
router.put('/config', authenticate, requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const existing = await fetchOrCreateConfig(orgId, req.user.id);

    const merge = (field, maxLen) => (req.body[field] !== undefined
      ? (String(req.body[field]).trim().slice(0, maxLen) || null)
      : existing[field]);
    const mergeBool = (field) => (req.body[field] !== undefined
      ? Boolean(req.body[field])
      : existing[field]);

    const enabled = mergeBool('enabled');

    const result = await pool.query(
      `UPDATE trust_center_configs SET
         enabled = $2,
         display_name = $3,
         description = $4,
         contact_email = $5,
         show_frameworks = $6,
         show_compliance_scores = $7,
         show_authorizations = $8,
         published_at = CASE WHEN $2 = true AND published_at IS NULL THEN NOW() ELSE published_at END,
         updated_by = $9,
         updated_at = NOW()
       WHERE organization_id = $1
       RETURNING *`,
      [
        orgId,
        enabled,
        merge('display_name', 255),
        merge('description', 5000),
        merge('contact_email', 255),
        mergeBool('show_frameworks'),
        mergeBool('show_compliance_scores'),
        mergeBool('show_authorizations'),
        req.user.id
      ]
    );

    log('info', 'trust_center.config.updated', {
      orgId,
      enabled,
      userId: req.user.id
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'trust_center.config.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update Trust Center configuration' });
  }
});

// ===========================================================================
// POST /trust-center/config/regenerate-token — rotate the public URL
// ===========================================================================
router.post('/config/regenerate-token', authenticate, requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    await fetchOrCreateConfig(orgId, req.user.id);

    const result = await pool.query(
      `UPDATE trust_center_configs SET
         public_token = $2, updated_by = $3, updated_at = NOW()
       WHERE organization_id = $1
       RETURNING *`,
      [orgId, newToken(), req.user.id]
    );

    log('info', 'trust_center.token.regenerated', { orgId, userId: req.user.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'trust_center.token.regenerate_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to regenerate token' });
  }
});

// ===========================================================================
// GET /trust-center/public/:token — public page data (no auth, rate limited)
// ===========================================================================
router.get('/public/:token', publicRateLimiter, async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[0-9a-f]{64}$/.test(token)) {
      return res.status(404).json({ success: false, error: 'Trust Center page not found' });
    }

    // Unknown and disabled tokens are indistinguishable by design.
    const configResult = await pool.query(
      `SELECT tc.*, o.name AS organization_name
       FROM trust_center_configs tc
       JOIN organizations o ON o.id = tc.organization_id
       WHERE tc.public_token = $1 AND tc.enabled = true`,
      [token]
    );
    if (configResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trust Center page not found' });
    }
    const config = configResult.rows[0];
    const orgId = config.organization_id;

    const payload = {
      display_name: config.display_name || config.organization_name,
      description: config.description,
      contact_email: config.contact_email,
      published_at: config.published_at
    };

    if (config.show_frameworks || config.show_compliance_scores) {
      // Latest snapshot per framework the org tracks.
      const frameworksResult = await pool.query(
        `SELECT DISTINCT ON (cs.framework_id)
                f.name AS framework_name, cs.compliance_pct, cs.snapshot_date
         FROM compliance_snapshots cs
         JOIN frameworks f ON f.id = cs.framework_id
         WHERE cs.organization_id = $1 AND cs.framework_id IS NOT NULL
         ORDER BY cs.framework_id, cs.snapshot_date DESC`,
        [orgId]
      );
      if (config.show_frameworks) {
        payload.frameworks = frameworksResult.rows.map(r => r.framework_name).sort();
      }
      if (config.show_compliance_scores) {
        payload.compliance_scores = frameworksResult.rows
          .map(r => ({
            framework_name: r.framework_name,
            compliance_pct: Number(r.compliance_pct),
            as_of: r.snapshot_date
          }))
          .sort((a, b) => a.framework_name.localeCompare(b.framework_name));
      }
    }

    if (config.show_authorizations) {
      const atoResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM rmf_authorization_decisions
         WHERE organization_id = $1 AND is_active = true AND decision_type = 'ato'`,
        [orgId]
      );
      payload.active_authorizations = atoResult.rows[0]?.count || 0;
    }

    res.json({ success: true, data: payload });
  } catch (error) {
    log('error', 'trust_center.public.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
