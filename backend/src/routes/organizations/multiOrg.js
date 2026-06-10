// @tier: community
/**
 * Multi-organization routes: POST /me/new (create a new organization for
 * the current user) and POST /me/clone (clone the current org's framework
 * setup into a new org). Both share an hourly per-user rate limiter.
 *
 * Extracted verbatim from routes/organizations.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/organizations.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { sanitizeInput } = require('../../middleware/validate');
const { log } = require('../../utils/logger');
const { createRateLimiter } = require('../../middleware/rateLimit');

// =========================================================================
// MULTI-ORGANIZATION — create a new organization for the current user
// =========================================================================

const createOrgLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  label: 'organizations-create-new',
  keyGenerator: (req) => req.user?.id || req.ip
});

// POST /organizations/me/new
// Body: { name: string, tier?: string }
router.post('/me/new', requirePermission('organizations.write'), createOrgLimiter, async (req, res) => {
  const userId = req.user.id;
  const { name } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Organization name is required' });
  }

  const orgName = sanitizeInput(name.trim()).substring(0, 255);

  if (!orgName) {
    return res.status(400).json({ success: false, error: 'Organization name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgResult = await client.query(
      `INSERT INTO organizations (name, tier, billing_status, trial_status)
       VALUES ($1, 'community', 'community', 'none')
       RETURNING id, name, tier, billing_status`,
      [orgName]
    );
    const newOrg = orgResult.rows[0];

    // Bootstrap minimal org profile
    await client.query(
      `INSERT INTO organization_profiles (organization_id, onboarding_completed, created_by, updated_by)
       VALUES ($1, false, $2, $2)
       ON CONFLICT (organization_id) DO NOTHING`,
      [newOrg.id, userId]
    ).catch((e) => { log('warn', 'organizations.new_org_profile_insert_warn', { error: e.message }); });

    // Record membership in user_organizations
    await client.query(
      `INSERT INTO user_organizations (user_id, organization_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [userId, newOrg.id]
    );

    await client.query('COMMIT');

    log('info', 'organizations.new_org_created', { userId, orgId: newOrg.id, orgName });
    res.status(201).json({ success: true, data: newOrg });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.new_org_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create organization' });
  } finally {
    client.release();
  }
});

// =========================================================================
// MULTI-ORGANIZATION — clone the current org's framework setup into a new org
// =========================================================================

// POST /organizations/me/clone
// Body: { name: string }
// Creates a new org pre-loaded with the same framework selections as the
// current org (a "template" clone).  Controls / implementations are NOT
// copied — only the framework list.
router.post('/me/clone', requirePermission('organizations.write'), createOrgLimiter, async (req, res) => {
  const userId       = req.user.id;
  const sourceOrgId  = req.user.organization_id;
  const { name }     = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Organization name is required' });
  }

  const orgName = sanitizeInput(name.trim()).substring(0, 255);

  if (!orgName) {
    return res.status(400).json({ success: false, error: 'Organization name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create the target organization
    const orgResult = await client.query(
      `INSERT INTO organizations (name, tier, billing_status, trial_status)
       VALUES ($1, 'community', 'community', 'none')
       RETURNING id, name, tier, billing_status`,
      [orgName]
    );
    const newOrg = orgResult.rows[0];

    // 2. Bootstrap org profile
    await client.query(
      `INSERT INTO organization_profiles (organization_id, onboarding_completed, created_by, updated_by)
       VALUES ($1, false, $2, $2)
       ON CONFLICT (organization_id) DO NOTHING`,
      [newOrg.id, userId]
    ).catch((e) => { log('warn', 'organizations.clone_profile_insert_warn', { error: e.message }); });

    // 3. Copy framework selections from source org
    await client.query(
      `INSERT INTO organization_frameworks (organization_id, framework_id)
       SELECT $1, framework_id
       FROM   organization_frameworks
       WHERE  organization_id = $2
       ON CONFLICT DO NOTHING`,
      [newOrg.id, sourceOrgId]
    );

    // 4. Record membership
    await client.query(
      `INSERT INTO user_organizations (user_id, organization_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [userId, newOrg.id]
    );

    // Count how many frameworks were copied (inside transaction so ROLLBACK is safe)
    const fwCount = await client.query(
      `SELECT COUNT(*) AS cnt FROM organization_frameworks WHERE organization_id = $1`,
      [newOrg.id]
    );

    await client.query('COMMIT');

    log('info', 'organizations.org_cloned', { userId, sourceOrgId, newOrgId: newOrg.id, orgName });
    res.status(201).json({
      success: true,
      data: {
        ...newOrg,
        frameworks_copied: parseInt(fwCount.rows[0]?.cnt || '0', 10)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'organizations.clone_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to clone organization' });
  } finally {
    client.release();
  }
});

module.exports = router;
