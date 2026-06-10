// @tier: community
/**
 * Vendor contract routes: CRUD for /me/contracts.
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
  normalizeContractInput,
  ensureSystemBelongsToOrganization,
  logOrganizationEvent,
} = require('./_helpers');

// GET /organizations/me/contracts
router.get('/me/contracts', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { system_id: systemId, status, search } = req.query;

    let query = `
      SELECT vc.*,
             os.system_name,
             cp.product_name
      FROM vendor_contracts vc
      LEFT JOIN organization_systems os ON os.id = vc.system_id
      LEFT JOIN cots_products cp ON cp.id = vc.cots_product_id
      WHERE vc.organization_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (systemId) {
      query += ` AND vc.system_id = $${paramIndex}`;
      params.push(systemId);
      paramIndex += 1;
    }
    if (status) {
      query += ` AND vc.status = $${paramIndex}`;
      params.push(String(status).toLowerCase());
      paramIndex += 1;
    }
    if (search) {
      query += ` AND (vc.contract_name ILIKE $${paramIndex} OR vc.vendor_name ILIKE $${paramIndex} OR COALESCE(vc.contract_number, '') ILIKE $${paramIndex})`;
      params.push(`%${escapeIlike(String(search).trim())}%`);
      paramIndex += 1;
    }

    query += ` ORDER BY vc.contract_name ASC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.contracts.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load contracts' });
  }
});

// POST /organizations/me/contracts
router.post('/me/contracts', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { payload, errors } = normalizeContractInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }
    if (payload.cots_product_id) {
      const productResult = await pool.query(
        `SELECT id
         FROM cots_products
         WHERE id = $1 AND organization_id = $2
         LIMIT 1`,
        [payload.cots_product_id, orgId]
      );
      if (productResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'cots_product_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `INSERT INTO vendor_contracts (
         organization_id, system_id, cots_product_id,
         contract_name, vendor_name, contract_number,
         contract_type, status, start_date, end_date, renewal_date,
         notice_period_days, security_requirements, data_processing_terms, sla_summary, notes,
         created_by, updated_by
       )
       VALUES (
         $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18
       )
       RETURNING *`,
      [
        orgId,
        payload.system_id,
        payload.cots_product_id,
        payload.contract_name,
        payload.vendor_name,
        payload.contract_number,
        payload.contract_type,
        payload.status,
        payload.start_date,
        payload.end_date,
        payload.renewal_date,
        payload.notice_period_days,
        payload.security_requirements,
        payload.data_processing_terms,
        payload.sla_summary,
        payload.notes,
        req.user.id,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'vendor_contract_created',
      resourceType: 'vendor_contract',
      resourceId: result.rows[0].id,
      details: {
        contract_name: result.rows[0].contract_name,
        vendor_name: result.rows[0].vendor_name
      }
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.contracts.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create contract' });
  }
});

// PUT /organizations/me/contracts/:contractId
router.put('/me/contracts/:contractId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const contractId = req.params.contractId;

    const existingResult = await pool.query(
      `SELECT *
       FROM vendor_contracts
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [contractId, orgId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    const { payload, errors } = normalizeContractInput(req.body || {}, existingResult.rows[0]);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }
    if (payload.cots_product_id) {
      const productResult = await pool.query(
        `SELECT id
         FROM cots_products
         WHERE id = $1 AND organization_id = $2
         LIMIT 1`,
        [payload.cots_product_id, orgId]
      );
      if (productResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'cots_product_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `UPDATE vendor_contracts
       SET system_id = $3,
           cots_product_id = $4,
           contract_name = $5,
           vendor_name = $6,
           contract_number = $7,
           contract_type = $8,
           status = $9,
           start_date = $10,
           end_date = $11,
           renewal_date = $12,
           notice_period_days = $13,
           security_requirements = $14,
           data_processing_terms = $15,
           sla_summary = $16,
           notes = $17,
           updated_by = $18,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        contractId,
        orgId,
        payload.system_id,
        payload.cots_product_id,
        payload.contract_name,
        payload.vendor_name,
        payload.contract_number,
        payload.contract_type,
        payload.status,
        payload.start_date,
        payload.end_date,
        payload.renewal_date,
        payload.notice_period_days,
        payload.security_requirements,
        payload.data_processing_terms,
        payload.sla_summary,
        payload.notes,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'vendor_contract_updated',
      resourceType: 'vendor_contract',
      resourceId: contractId,
      details: {
        contract_name: result.rows[0]?.contract_name || payload.contract_name
      }
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.contracts.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update contract' });
  }
});

// DELETE /organizations/me/contracts/:contractId
router.delete('/me/contracts/:contractId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const contractId = req.params.contractId;

    const result = await pool.query(
      `DELETE FROM vendor_contracts
       WHERE id = $1 AND organization_id = $2
       RETURNING id, contract_name`,
      [contractId, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'vendor_contract_deleted',
      resourceType: 'vendor_contract',
      resourceId: contractId,
      details: {
        contract_name: result.rows[0].contract_name
      }
    });

    res.json({ success: true, message: 'Contract removed' });
  } catch (error) {
    log('error', 'organizations.contracts.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete contract' });
  }
});

module.exports = router;
