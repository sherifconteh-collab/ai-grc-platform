// @tier: community
/**
 * COTS product inventory routes: CRUD for /me/cots-products.
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
  escapeIlike,
  normalizeCotsProductInput,
  ensureSystemBelongsToOrganization,
  logOrganizationEvent,
} = require('./_helpers');

// GET /organizations/me/cots-products
router.get('/me/cots-products', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { system_id: systemId, lifecycle_status: lifecycleStatus, search } = req.query;

    let query = `
      SELECT cp.*,
             os.system_name,
             owner.first_name || ' ' || owner.last_name AS owner_name
      FROM cots_products cp
      LEFT JOIN organization_systems os ON os.id = cp.system_id
      LEFT JOIN users owner ON owner.id = cp.business_owner_id
      WHERE cp.organization_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (systemId) {
      query += ` AND cp.system_id = $${paramIndex}`;
      params.push(systemId);
      paramIndex += 1;
    }
    if (lifecycleStatus) {
      query += ` AND cp.lifecycle_status = $${paramIndex}`;
      params.push(String(lifecycleStatus).toLowerCase());
      paramIndex += 1;
    }
    if (search) {
      query += ` AND (cp.product_name ILIKE $${paramIndex} OR cp.vendor_name ILIKE $${paramIndex})`;
      params.push(`%${escapeIlike(String(search).trim())}%`);
      paramIndex += 1;
    }

    query += ` ORDER BY cp.product_name ASC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.cots.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load COTS products' });
  }
});

// POST /organizations/me/cots-products
router.post('/me/cots-products', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { payload, errors } = normalizeCotsProductInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `INSERT INTO cots_products (
         organization_id, system_id,
         product_name, vendor_name, product_version, product_type,
         deployment_model, data_access_level, lifecycle_status, criticality,
         support_end_date, notes, created_by, updated_by
       )
       VALUES (
         $1, $2,
         $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14
       )
       RETURNING *`,
      [
        orgId,
        payload.system_id,
        payload.product_name,
        payload.vendor_name,
        payload.product_version,
        payload.product_type,
        payload.deployment_model,
        payload.data_access_level,
        payload.lifecycle_status,
        payload.criticality,
        payload.support_end_date,
        payload.notes,
        req.user.id,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'cots_product_created',
      resourceType: 'cots_product',
      resourceId: result.rows[0].id,
      details: {
        product_name: result.rows[0].product_name,
        vendor_name: result.rows[0].vendor_name
      }
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.cots.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create COTS product' });
  }
});

// PUT /organizations/me/cots-products/:productId
router.put('/me/cots-products/:productId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const productId = req.params.productId;

    const existingResult = await pool.query(
      `SELECT *
       FROM cots_products
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [productId, orgId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'COTS product not found' });
    }

    const { payload, errors } = normalizeCotsProductInput(req.body || {}, existingResult.rows[0]);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `UPDATE cots_products
       SET system_id = $3,
           product_name = $4,
           vendor_name = $5,
           product_version = $6,
           product_type = $7,
           deployment_model = $8,
           data_access_level = $9,
           lifecycle_status = $10,
           criticality = $11,
           support_end_date = $12,
           notes = $13,
           updated_by = $14,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        productId,
        orgId,
        payload.system_id,
        payload.product_name,
        payload.vendor_name,
        payload.product_version,
        payload.product_type,
        payload.deployment_model,
        payload.data_access_level,
        payload.lifecycle_status,
        payload.criticality,
        payload.support_end_date,
        payload.notes,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'cots_product_updated',
      resourceType: 'cots_product',
      resourceId: productId,
      details: {
        product_name: result.rows[0]?.product_name || payload.product_name
      }
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.cots.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update COTS product' });
  }
});

// DELETE /organizations/me/cots-products/:productId
router.delete('/me/cots-products/:productId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const productId = req.params.productId;

    const result = await pool.query(
      `DELETE FROM cots_products
       WHERE id = $1 AND organization_id = $2
       RETURNING id, product_name`,
      [productId, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'COTS product not found' });
    }

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'cots_product_deleted',
      resourceType: 'cots_product',
      resourceId: productId,
      details: {
        product_name: result.rows[0].product_name
      }
    });

    res.json({ success: true, message: 'COTS product removed' });
  } catch (error) {
    log('error', 'organizations.cots.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete COTS product' });
  }
});

module.exports = router;
