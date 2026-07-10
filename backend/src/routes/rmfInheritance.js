// @tier: enterprise
/**
 * RMF Leveraged Authorizations – package inheritance from COTS products.
 *
 * Lets an RMF package inherit controls and authorization posture from
 * COTS/SaaS products (FedRAMP-style leveraged authorization). Also serves
 * the Customer Responsibility Matrix (CRM) report and the OSCAL SSP export.
 *
 * Mounted at /api/v1/rmf alongside routes/rmf.js.
 */

const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');
const { buildSystemSecurityPlan } = require('../services/oscalService');

// Three layers, in this specific order: (1) a cheap per-process IP-based
// limiter first, so unauthenticated requests are bounded before they reach
// authenticate's JWT/DB work (also the middleware CodeQL's static analysis
// can trace as guarding this router); (2) authenticate; (3) the org-scoped
// Redis-backed limiter, which needs req.user for its key and so must run
// after auth -- this is the real production control across instances.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
router.use(authenticate);
router.use(createRateLimiter({
  label: 'rmf-inheritance',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_INHERITANCE_TYPES = new Set(['full', 'partial', 'hybrid']);
const VALID_LINK_STATUSES = new Set(['active', 'pending', 'expired', 'revoked']);
const MAX_INHERITED_CONTROLS = 500;
const MAX_CONTROL_ID_LENGTH = 40;

// Columns shared by every leveraged-authorization read (link + product posture).
const LEVERAGED_SELECT = `
  SELECT la.*, cp.product_name, cp.vendor_name, cp.product_type,
         cp.lifecycle_status, cp.support_end_date,
         cp.authorization_status, cp.authorization_impact_level,
         cp.external_authorization_id,
         u.first_name || ' ' || u.last_name AS created_by_name,
         (cp.lifecycle_status IN ('deprecated', 'retired')
          OR (cp.support_end_date IS NOT NULL AND cp.support_end_date < CURRENT_DATE)
          OR (la.expiration_date IS NOT NULL AND la.expiration_date < CURRENT_DATE)) AS at_risk
  FROM rmf_leveraged_authorizations la
  JOIN cots_products cp ON cp.id = la.cots_product_id
  LEFT JOIN users u ON u.id = la.created_by`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function trimStr(val, maxLen = 255) {
  if (val === null || val === undefined) return null;
  return String(val).trim().slice(0, maxLen) || null;
}

/**
 * Validate a client-supplied YYYY-MM-DD date string. Returns { value } (null
 * when omitted/empty) or { error } for malformed input, so callers can 400
 * instead of letting an invalid date reach Postgres as a 500.
 */
function toDateString(val) {
  const trimmed = trimStr(val, 10);
  if (!trimmed) return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: 'must be formatted as YYYY-MM-DD' };
  }
  return { value: trimmed };
}

/**
 * Normalize a client-supplied control-identifier list: trim, uppercase,
 * dedupe, and enforce size caps. Returns { value } (JSON string ready for a
 * JSONB parameter) or { error }.
 */
function normalizeInheritedControls(raw) {
  if (raw === undefined || raw === null) return { value: JSON.stringify([]) };
  if (!Array.isArray(raw)) {
    return { error: 'inherited_controls must be an array of control identifiers' };
  }
  const cleaned = [...new Set(raw.map(c => String(c).trim().toUpperCase()).filter(Boolean))];
  if (cleaned.length > MAX_INHERITED_CONTROLS) {
    return { error: `inherited_controls exceeds ${MAX_INHERITED_CONTROLS} entries` };
  }
  if (cleaned.some(c => c.length > MAX_CONTROL_ID_LENGTH)) {
    return { error: `control identifiers must be ${MAX_CONTROL_ID_LENGTH} characters or fewer` };
  }
  return { value: JSON.stringify(cleaned) };
}

function parseControls(raw) {
  if (Array.isArray(raw)) return raw.map(c => String(c));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(c => String(c)) : [];
    } catch (_err) {
      return [];
    }
  }
  return [];
}

/** Fetch the package org-scoped; sends 404 and returns null when missing. */
async function fetchOrgPackage(req, res, queryable = pool) {
  const result = await queryable.query(
    `SELECT * FROM rmf_packages WHERE id = $1 AND organization_id = $2`,
    [req.params.id, req.user.organization_id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: 'RMF package not found' });
    return null;
  }
  return result.rows[0];
}

function csvEscape(val) {
  const str = val === null || val === undefined ? '' : String(val);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** One CRM row per (inherited control x product). */
function buildCrmRows(links) {
  return links.flatMap(la =>
    parseControls(la.inherited_controls).map(controlId => ({
      control_id: controlId,
      product_name: la.product_name,
      vendor_name: la.vendor_name,
      inheritance_type: la.inheritance_type,
      status: la.status,
      authorization_reference: la.authorization_reference || la.external_authorization_id || '',
      provider_responsibilities: la.provider_responsibilities || '',
      customer_responsibilities: la.customer_responsibilities || ''
    }))
  );
}

// ===========================================================================
// GET /rmf/packages/:id/leveraged-authorizations — list links for a package
// ===========================================================================
router.get('/packages/:id/leveraged-authorizations', requirePermission('assessments.read'), async (req, res) => {
  try {
    const pkg = await fetchOrgPackage(req, res);
    if (!pkg) return;

    const result = await pool.query(
      `${LEVERAGED_SELECT}
       WHERE la.rmf_package_id = $1 AND la.organization_id = $2
       ORDER BY la.created_at DESC`,
      [pkg.id, req.user.organization_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'rmf.leveraged_auth.list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load leveraged authorizations' });
  }
});

// ===========================================================================
// POST /rmf/packages/:id/leveraged-authorizations — link a COTS product
// ===========================================================================
router.post('/packages/:id/leveraged-authorizations', requirePermission('assessments.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;

    await client.query('BEGIN');

    const pkgResult = await client.query(
      `SELECT * FROM rmf_packages WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [req.params.id, orgId]
    );
    if (pkgResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }
    const pkg = pkgResult.rows[0];

    const cotsProductId = trimStr(req.body.cots_product_id);
    if (!cotsProductId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'cots_product_id is required' });
    }

    const productResult = await client.query(
      `SELECT id, product_name, lifecycle_status FROM cots_products
       WHERE id = $1 AND organization_id = $2`,
      [cotsProductId, orgId]
    );
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'COTS product not found in this organization' });
    }
    const product = productResult.rows[0];
    if (product.lifecycle_status === 'retired') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Retired products cannot be leveraged' });
    }

    const inheritanceType = trimStr(req.body.inheritance_type)?.toLowerCase() || 'partial';
    if (!VALID_INHERITANCE_TYPES.has(inheritanceType)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `inheritance_type must be one of: ${Array.from(VALID_INHERITANCE_TYPES).join(', ')}`
      });
    }

    const status = trimStr(req.body.status)?.toLowerCase() || 'active';
    if (!VALID_LINK_STATUSES.has(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${Array.from(VALID_LINK_STATUSES).join(', ')}`
      });
    }

    const controls = normalizeInheritedControls(req.body.inherited_controls);
    if (controls.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: controls.error });
    }
    const controlCount = JSON.parse(controls.value).length;

    const reviewDate = toDateString(req.body.review_date);
    if (reviewDate.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `review_date ${reviewDate.error}` });
    }
    const expirationDate = toDateString(req.body.expiration_date);
    if (expirationDate.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `expiration_date ${expirationDate.error}` });
    }

    let inserted;
    try {
      inserted = await client.query(
        `INSERT INTO rmf_leveraged_authorizations (
           organization_id, rmf_package_id, cots_product_id,
           inheritance_type, status, authorization_reference, inherited_controls,
           provider_responsibilities, customer_responsibilities,
           review_date, expiration_date, notes, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $13)
         RETURNING *`,
        [
          orgId, pkg.id, cotsProductId,
          inheritanceType, status,
          trimStr(req.body.authorization_reference),
          controls.value,
          trimStr(req.body.provider_responsibilities, 5000),
          trimStr(req.body.customer_responsibilities, 5000),
          reviewDate.value,
          expirationDate.value,
          trimStr(req.body.notes, 5000),
          req.user.id
        ]
      );
    } catch (insertError) {
      await client.query('ROLLBACK');
      if (insertError.code === '23505') {
        return res.status(409).json({ success: false, error: 'This COTS product is already linked to this package' });
      }
      throw insertError;
    }

    await client.query(
      `INSERT INTO rmf_step_history (
         rmf_package_id, organization_id, from_step, to_step, action, notes, performed_by
       ) VALUES ($1, $2, $3, $3, 'note', $4, $5)`,
      [
        pkg.id, orgId, pkg.current_step,
        `Leveraged authorization added: ${product.product_name} (${inheritanceType}, ${controlCount} controls)`,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    log('info', 'rmf.leveraged_auth.created', {
      packageId: pkg.id,
      cotsProductId,
      inheritanceType,
      controlCount,
      orgId,
      userId: req.user.id
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'rmf.leveraged_auth.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to add leveraged authorization' });
  } finally {
    client.release();
  }
});

// ===========================================================================
// PUT /rmf/packages/:id/leveraged-authorizations/:linkId — update a link
// ===========================================================================
router.put('/packages/:id/leveraged-authorizations/:linkId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const existingResult = await pool.query(
      `SELECT la.*, cp.product_name
       FROM rmf_leveraged_authorizations la
       JOIN cots_products cp ON cp.id = la.cots_product_id
       WHERE la.id = $1 AND la.rmf_package_id = $2 AND la.organization_id = $3`,
      [req.params.linkId, req.params.id, orgId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Leveraged authorization not found' });
    }
    const existing = existingResult.rows[0];

    const inheritanceType = req.body.inheritance_type !== undefined
      ? trimStr(req.body.inheritance_type)?.toLowerCase()
      : existing.inheritance_type;
    if (!VALID_INHERITANCE_TYPES.has(inheritanceType)) {
      return res.status(400).json({
        success: false,
        error: `inheritance_type must be one of: ${Array.from(VALID_INHERITANCE_TYPES).join(', ')}`
      });
    }

    const status = req.body.status !== undefined
      ? trimStr(req.body.status)?.toLowerCase()
      : existing.status;
    if (!VALID_LINK_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${Array.from(VALID_LINK_STATUSES).join(', ')}`
      });
    }

    let controlsValue = JSON.stringify(parseControls(existing.inherited_controls));
    if (req.body.inherited_controls !== undefined) {
      const controls = normalizeInheritedControls(req.body.inherited_controls);
      if (controls.error) {
        return res.status(400).json({ success: false, error: controls.error });
      }
      controlsValue = controls.value;
    }

    const merge = (field, maxLen) => (req.body[field] !== undefined
      ? trimStr(req.body[field], maxLen)
      : existing[field]);

    let reviewDate = existing.review_date;
    if (req.body.review_date !== undefined) {
      const parsed = toDateString(req.body.review_date);
      if (parsed.error) {
        return res.status(400).json({ success: false, error: `review_date ${parsed.error}` });
      }
      reviewDate = parsed.value;
    }
    let expirationDate = existing.expiration_date;
    if (req.body.expiration_date !== undefined) {
      const parsed = toDateString(req.body.expiration_date);
      if (parsed.error) {
        return res.status(400).json({ success: false, error: `expiration_date ${parsed.error}` });
      }
      expirationDate = parsed.value;
    }

    const result = await pool.query(
      `UPDATE rmf_leveraged_authorizations SET
         inheritance_type = $4,
         status = $5,
         authorization_reference = $6,
         inherited_controls = $7::jsonb,
         provider_responsibilities = $8,
         customer_responsibilities = $9,
         review_date = $10,
         expiration_date = $11,
         notes = $12,
         updated_by = $13,
         updated_at = NOW()
       WHERE id = $1 AND rmf_package_id = $2 AND organization_id = $3
       RETURNING *`,
      [
        req.params.linkId, req.params.id, orgId,
        inheritanceType, status,
        merge('authorization_reference', 255),
        controlsValue,
        merge('provider_responsibilities', 5000),
        merge('customer_responsibilities', 5000),
        reviewDate,
        expirationDate,
        merge('notes', 5000),
        req.user.id
      ]
    );

    if (status !== existing.status) {
      const pkg = await pool.query(
        `SELECT current_step FROM rmf_packages WHERE id = $1 AND organization_id = $2`,
        [req.params.id, orgId]
      );
      await pool.query(
        `INSERT INTO rmf_step_history (
           rmf_package_id, organization_id, from_step, to_step, action, notes, performed_by
         ) VALUES ($1, $2, $3, $3, 'note', $4, $5)`,
        [
          req.params.id, orgId, pkg.rows[0]?.current_step || 'prepare',
          `Leveraged authorization status changed: ${existing.product_name} (${existing.status} -> ${status})`,
          req.user.id
        ]
      );
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'rmf.leveraged_auth.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update leveraged authorization' });
  }
});

// ===========================================================================
// DELETE /rmf/packages/:id/leveraged-authorizations/:linkId — remove a link
// ===========================================================================
router.delete('/packages/:id/leveraged-authorizations/:linkId', requirePermission('assessments.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;

    await client.query('BEGIN');

    const deleted = await client.query(
      `DELETE FROM rmf_leveraged_authorizations la
       USING cots_products cp, rmf_packages rp
       WHERE la.id = $1 AND la.rmf_package_id = $2 AND la.organization_id = $3
         AND cp.id = la.cots_product_id AND rp.id = la.rmf_package_id
       RETURNING cp.product_name, rp.current_step`,
      [req.params.linkId, req.params.id, orgId]
    );
    if (deleted.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Leveraged authorization not found' });
    }

    await client.query(
      `INSERT INTO rmf_step_history (
         rmf_package_id, organization_id, from_step, to_step, action, notes, performed_by
       ) VALUES ($1, $2, $3, $3, 'note', $4, $5)`,
      [
        req.params.id, orgId, deleted.rows[0].current_step,
        `Leveraged authorization removed: ${deleted.rows[0].product_name}`,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    log('info', 'rmf.leveraged_auth.deleted', {
      packageId: req.params.id,
      linkId: req.params.linkId,
      orgId,
      userId: req.user.id
    });

    res.json({ success: true, message: 'Leveraged authorization removed' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'rmf.leveraged_auth.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to remove leveraged authorization' });
  } finally {
    client.release();
  }
});

// ===========================================================================
// GET /rmf/packages/:id/eligible-cots-products — products available to link
// ===========================================================================
router.get('/packages/:id/eligible-cots-products', requirePermission('assessments.read'), async (req, res) => {
  try {
    const pkg = await fetchOrgPackage(req, res);
    if (!pkg) return;

    const result = await pool.query(
      `SELECT cp.id, cp.product_name, cp.vendor_name, cp.product_type,
              cp.lifecycle_status, cp.system_id, cp.support_end_date,
              cp.authorization_status, cp.authorization_impact_level,
              cp.external_authorization_id
       FROM cots_products cp
       WHERE cp.organization_id = $1
         AND cp.lifecycle_status <> 'retired'
         AND NOT EXISTS (
           SELECT 1 FROM rmf_leveraged_authorizations la
           WHERE la.cots_product_id = cp.id AND la.rmf_package_id = $2
         )
       ORDER BY (cp.system_id IS NOT DISTINCT FROM $3) DESC, cp.product_name ASC`,
      [req.user.organization_id, pkg.id, pkg.system_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'rmf.leveraged_auth.eligible_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load eligible COTS products' });
  }
});

// ===========================================================================
// GET /rmf/packages/:id/crm-report — Customer Responsibility Matrix (JSON/CSV)
// ===========================================================================
router.get('/packages/:id/crm-report', requirePermission('assessments.read'), async (req, res) => {
  try {
    const pkg = await fetchOrgPackage(req, res);
    if (!pkg) return;

    const links = await pool.query(
      `${LEVERAGED_SELECT}
       WHERE la.rmf_package_id = $1 AND la.organization_id = $2
       ORDER BY cp.product_name ASC`,
      [pkg.id, req.user.organization_id]
    );
    const rows = buildCrmRows(links.rows);

    if (String(req.query.format || 'json').toLowerCase() === 'csv') {
      const header = [
        'control_id', 'product_name', 'vendor_name', 'inheritance_type', 'status',
        'authorization_reference', 'provider_responsibilities', 'customer_responsibilities'
      ];
      const csv = [
        header.join(','),
        ...rows.map(row => header.map(col => csvEscape(row[col])).join(','))
      ].join('\r\n');

      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="crm-${pkg.id}-${date}.csv"`);
      return res.send(csv);
    }

    res.json({
      success: true,
      data: {
        package_id: pkg.id,
        system_name: pkg.system_name,
        generated_at: new Date().toISOString(),
        products: links.rows.length,
        rows
      }
    });
  } catch (error) {
    log('error', 'rmf.crm_report.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate CRM report' });
  }
});

// ===========================================================================
// GET /rmf/packages/:id/crm-report/pdf — CRM report as PDF
// ===========================================================================
router.get('/packages/:id/crm-report/pdf', requirePermission('assessments.read'), async (req, res) => {
  try {
    const pkg = await fetchOrgPackage(req, res);
    if (!pkg) return;

    const links = await pool.query(
      `${LEVERAGED_SELECT}
       WHERE la.rmf_package_id = $1 AND la.organization_id = $2
       ORDER BY cp.product_name ASC`,
      [pkg.id, req.user.organization_id]
    );

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="crm-${pkg.id}-${date}.pdf"`);

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(20).text('Customer Responsibility Matrix', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#444444')
      .text(`System: ${pkg.system_name}`, { align: 'center' })
      .text(`Categorization: ${pkg.categorization_level || 'not set'}  |  Generated: ${date}`, { align: 'center' });
    doc.moveDown(1.5);

    if (links.rows.length === 0) {
      doc.fontSize(11).fillColor('#000000')
        .text('No leveraged authorizations are recorded for this package.');
    }

    links.rows.forEach((la, idx) => {
      if (idx > 0) doc.moveDown(1);
      doc.fontSize(14).fillColor('#000000')
        .text(`${la.product_name} — ${la.vendor_name}`);
      doc.fontSize(10).fillColor('#444444')
        .text(`Inheritance: ${la.inheritance_type}  |  Status: ${la.status}` +
          (la.authorization_reference ? `  |  Reference: ${la.authorization_reference}` : '') +
          (la.expiration_date ? `  |  Expires: ${String(la.expiration_date).slice(0, 10)}` : ''));
      doc.moveDown(0.5);

      const controls = parseControls(la.inherited_controls);
      doc.fontSize(10).fillColor('#000000')
        .text(`Inherited controls (${controls.length}): ${controls.join(', ') || 'none listed'}`);
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor('#000000').text('Provider responsibilities:', { continued: false });
      doc.fontSize(10).fillColor('#444444')
        .text(la.provider_responsibilities || 'Not documented.', { indent: 12 });
      doc.moveDown(0.25);
      doc.fontSize(10).fillColor('#000000').text('Customer responsibilities:');
      doc.fontSize(10).fillColor('#444444')
        .text(la.customer_responsibilities || 'Not documented.', { indent: 12 });
    });

    doc.end();
  } catch (error) {
    log('error', 'rmf.crm_report.pdf_failed', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to generate CRM PDF' });
    }
  }
});

// ===========================================================================
// GET /rmf/packages/:id/oscal — OSCAL 1.1.x System Security Plan export
// ===========================================================================
router.get('/packages/:id/oscal', requirePermission('assessments.read'), async (req, res) => {
  try {
    const pkg = await fetchOrgPackage(req, res);
    if (!pkg) return;

    const links = await pool.query(
      `${LEVERAGED_SELECT}
       WHERE la.rmf_package_id = $1 AND la.organization_id = $2
       ORDER BY cp.product_name ASC`,
      [pkg.id, req.user.organization_id]
    );

    const decision = await pool.query(
      `SELECT * FROM rmf_authorization_decisions
       WHERE rmf_package_id = $1 AND organization_id = $2 AND is_active = true
       ORDER BY decision_date DESC
       LIMIT 1`,
      [pkg.id, req.user.organization_id]
    );

    const ssp = buildSystemSecurityPlan(pkg, links.rows, decision.rows[0] || null);

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="oscal-ssp-${pkg.id}-${date}.json"`);
    res.send(JSON.stringify(ssp, null, 2));
  } catch (error) {
    log('error', 'rmf.oscal_export.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to export OSCAL SSP' });
  }
});

module.exports = router;
module.exports.normalizeInheritedControls = normalizeInheritedControls;
