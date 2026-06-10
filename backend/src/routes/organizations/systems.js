// @tier: community
/**
 * Organization systems routes: CRUD for /me/systems (authorization
 * boundaries, CIA overrides, primary-system bookkeeping).
 *
 * Extracted verbatim from routes/organizations.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/organizations.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');
const {
  toBoolean,
  normalizeSystemInput,
  ensureSystemBelongsToOrganization,
  logOrganizationEvent,
} = require('./_helpers');

// GET /organizations/me/systems
router.get('/me/systems', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const includeInactive = toBoolean(req.query.include_inactive, false);

    const result = await pool.query(
      `SELECT os.*,
              creator.first_name || ' ' || creator.last_name AS created_by_name,
              updater.first_name || ' ' || updater.last_name AS updated_by_name
       FROM organization_systems os
       LEFT JOIN users creator ON creator.id = os.created_by
       LEFT JOIN users updater ON updater.id = os.updated_by
       WHERE os.organization_id = $1
         AND ($2::boolean = true OR os.is_active = true)
       ORDER BY os.is_primary DESC, os.system_name ASC`,
      [orgId, includeInactive]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.systems.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load systems' });
  }
});

// POST /organizations/me/systems
router.post('/me/systems', requirePermission('organizations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const { payload, errors } = normalizeSystemInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    await client.query('BEGIN');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS active_count
       FROM organization_systems
       WHERE organization_id = $1 AND is_active = true`,
      [orgId]
    );
    const shouldForcePrimary = Number(countResult.rows[0]?.active_count || 0) === 0;
    const shouldBePrimary = shouldForcePrimary || payload.is_primary;

    if (shouldBePrimary) {
      await client.query(
        `UPDATE organization_systems
         SET is_primary = false, updated_at = NOW(), updated_by = $2
         WHERE organization_id = $1`,
        [orgId, req.user.id]
      );
    }

    const insertResult = await client.query(
      `INSERT INTO organization_systems (
         organization_id,
         system_name, system_code, system_description,
         authorization_boundary_override, operating_environment_summary_override,
         confidentiality_impact, integrity_impact, availability_impact, impact_rationale,
         environment_types, deployment_model, cloud_providers, data_sensitivity_types,
         is_primary, is_active, created_by, updated_by
       )
       VALUES (
         $1,
         $2, $3, $4,
         $5, $6,
         $7, $8, $9, $10,
         $11::text[], $12, $13::text[], $14::text[],
         $15, $16, $17, $18
       )
       RETURNING *`,
      [
        orgId,
        payload.system_name,
        payload.system_code,
        payload.system_description,
        payload.authorization_boundary_override,
        payload.operating_environment_summary_override,
        payload.confidentiality_impact,
        payload.integrity_impact,
        payload.availability_impact,
        payload.impact_rationale,
        payload.environment_types,
        payload.deployment_model,
        payload.cloud_providers,
        payload.data_sensitivity_types,
        shouldBePrimary,
        payload.is_active,
        req.user.id,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization_system_created',
      resourceType: 'organization_system',
      resourceId: insertResult.rows[0].id,
      details: {
        system_name: insertResult.rows[0].system_name,
        is_primary: insertResult.rows[0].is_primary
      }
    });

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.systems.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create system' });
  } finally {
    client.release();
  }
});

// PUT /organizations/me/systems/:systemId
router.put('/me/systems/:systemId', requirePermission('organizations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const systemId = req.params.systemId;
    const existing = await ensureSystemBelongsToOrganization(orgId, systemId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'System not found' });
    }

    const { payload, errors } = normalizeSystemInput(req.body || {}, existing);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    await client.query('BEGIN');

    if (payload.is_primary) {
      await client.query(
        `UPDATE organization_systems
         SET is_primary = false, updated_at = NOW(), updated_by = $2
         WHERE organization_id = $1 AND id <> $3`,
        [orgId, req.user.id, systemId]
      );
    }

    const updateResult = await client.query(
      `UPDATE organization_systems
       SET system_name = $3,
           system_code = $4,
           system_description = $5,
           authorization_boundary_override = $6,
           operating_environment_summary_override = $7,
           confidentiality_impact = $8,
           integrity_impact = $9,
           availability_impact = $10,
           impact_rationale = $11,
           environment_types = $12::text[],
           deployment_model = $13,
           cloud_providers = $14::text[],
           data_sensitivity_types = $15::text[],
           is_primary = $16,
           is_active = $17,
           updated_by = $18,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        systemId,
        orgId,
        payload.system_name,
        payload.system_code,
        payload.system_description,
        payload.authorization_boundary_override,
        payload.operating_environment_summary_override,
        payload.confidentiality_impact,
        payload.integrity_impact,
        payload.availability_impact,
        payload.impact_rationale,
        payload.environment_types,
        payload.deployment_model,
        payload.cloud_providers,
        payload.data_sensitivity_types,
        payload.is_primary,
        payload.is_active,
        req.user.id
      ]
    );

    const activePrimaryCountResult = await client.query(
      `SELECT COUNT(*)::int AS active_primary_count
       FROM organization_systems
       WHERE organization_id = $1
         AND is_active = true
         AND is_primary = true`,
      [orgId]
    );
    const activePrimaryCount = Number(activePrimaryCountResult.rows[0]?.active_primary_count || 0);
    if (activePrimaryCount === 0) {
      const fallbackResult = await client.query(
        `SELECT id
         FROM organization_systems
         WHERE organization_id = $1
           AND is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [orgId]
      );
      if (fallbackResult.rows.length > 0) {
        await client.query(
          `UPDATE organization_systems
           SET is_primary = true, updated_at = NOW(), updated_by = $2
           WHERE id = $1 AND organization_id = $3`,
          [fallbackResult.rows[0].id, req.user.id, orgId]
        );
      }
    }

    await client.query('COMMIT');

    const refreshed = await pool.query(
      `SELECT *
       FROM organization_systems
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [systemId, orgId]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization_system_updated',
      resourceType: 'organization_system',
      resourceId: systemId,
      details: {
        system_name: refreshed.rows[0]?.system_name || payload.system_name,
        is_primary: refreshed.rows[0]?.is_primary || false
      }
    });

    res.json({ success: true, data: refreshed.rows[0] || updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.systems.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update system' });
  } finally {
    client.release();
  }
});

// DELETE /organizations/me/systems/:systemId
router.delete('/me/systems/:systemId', requirePermission('organizations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const systemId = req.params.systemId;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, system_name, is_primary
       FROM organization_systems
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [systemId, orgId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'System not found' });
    }

    await client.query(
      `DELETE FROM organization_systems
       WHERE id = $1 AND organization_id = $2`,
      [systemId, orgId]
    );

    const activePrimaryCountResult = await client.query(
      `SELECT COUNT(*)::int AS active_primary_count
       FROM organization_systems
       WHERE organization_id = $1
         AND is_active = true
         AND is_primary = true`,
      [orgId]
    );
    const activePrimaryCount = Number(activePrimaryCountResult.rows[0]?.active_primary_count || 0);
    if (activePrimaryCount === 0) {
      const fallbackResult = await client.query(
        `SELECT id
         FROM organization_systems
         WHERE organization_id = $1
           AND is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [orgId]
      );
      if (fallbackResult.rows.length > 0) {
        await client.query(
          `UPDATE organization_systems
           SET is_primary = true, updated_at = NOW(), updated_by = $2
           WHERE id = $1 AND organization_id = $3`,
          [fallbackResult.rows[0].id, req.user.id, orgId]
        );
      }
    }

    await client.query('COMMIT');

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization_system_deleted',
      resourceType: 'organization_system',
      resourceId: systemId,
      details: {
        system_name: existing.rows[0].system_name,
        was_primary: existing.rows[0].is_primary
      }
    });

    res.json({ success: true, message: 'System removed' });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.systems.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete system' });
  } finally {
    client.release();
  }
});

module.exports = router;
