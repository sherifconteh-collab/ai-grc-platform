// @tier: enterprise
/**
 * RMF Lifecycle Routes – NIST SP 800-37 Rev 2
 *
 * Provides per-system RMF package management with step tracking,
 * transition history, and formal authorization decisions.
 *
 * Visibility is gated on the frontend by selected frameworks:
 *   nist_800_53, nist_800_171, cmmc_2.0
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');

// Three layers, in this specific order: (1) a cheap per-process IP-based
// limiter first, so unauthenticated requests are bounded before they reach
// authenticate's JWT/DB work (also the middleware CodeQL's static analysis
// can trace as guarding this router); (2) authenticate; (3) the org-scoped
// Redis-backed limiter, which needs req.user for its key and so must run
// after auth -- this is the real production control across instances.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
router.use(authenticate);
router.use(createRateLimiter({
  label: 'rmf',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_STEPS = new Set([
  'prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor'
]);
const STEP_ORDER = ['prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor'];
const VALID_STATUSES = new Set(['not_started', 'in_progress', 'assessment_complete', 'authorized', 'denied', 'revoked']);
const VALID_ACTIONS = new Set(['advance', 'revert', 'reset', 'note']);
const VALID_DECISION_TYPES = new Set(['ato', 'dato', 'iatt', 'denial']);
const VALID_RISK_LEVELS = new Set(['low', 'moderate', 'high', 'very_high']);
const VALID_CIA = new Set(['low', 'moderate', 'high']);
const RMF_FRAMEWORK_CODES = new Set(['nist_800_53', 'nist_800_171', 'cmmc_2.0']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function trimStr(val, maxLen = 255) {
  if (val === null || val === undefined) return null;
  return String(val).trim().slice(0, maxLen) || null;
}

/**
 * Verify the requesting org actually has an RMF-relevant framework selected.
 * Returns true if allowed, sends 403 and returns false otherwise.
 */
async function verifyRmfEligibility(req, res) {
  const orgId = req.user.organization_id;
  const result = await pool.query(
    `SELECT f.code
     FROM organization_frameworks ofw
     JOIN frameworks f ON f.id = ofw.framework_id
     WHERE ofw.organization_id = $1`,
    [orgId]
  );
  const codes = result.rows.map(r => String(r.code || '').toLowerCase());
  const eligible = codes.some(c => RMF_FRAMEWORK_CODES.has(c));
  if (!eligible) {
    res.status(403).json({
      success: false,
      error: 'RMF lifecycle requires NIST 800-53, NIST 800-171, or CMMC 2.0 framework selection'
    });
  }
  return eligible;
}

// ===========================================================================
// GET /rmf/packages — list all RMF packages for the org
// ===========================================================================
router.get('/packages', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!(await verifyRmfEligibility(req, res))) return;

    const result = await pool.query(
      `SELECT rp.*,
              (SELECT COUNT(*) FROM rmf_step_history sh WHERE sh.rmf_package_id = rp.id) AS transition_count,
              (SELECT COUNT(*) FROM rmf_authorization_decisions ad WHERE ad.rmf_package_id = rp.id AND ad.is_active = true) AS active_decisions,
              (SELECT COUNT(*) FROM rmf_leveraged_authorizations la WHERE la.rmf_package_id = rp.id AND la.status = 'active') AS leveraged_count,
              creator.first_name || ' ' || creator.last_name AS created_by_name
       FROM rmf_packages rp
       LEFT JOIN users creator ON creator.id = rp.created_by
       WHERE rp.organization_id = $1
       ORDER BY rp.updated_at DESC`,
      [orgId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'rmf.packages.list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load RMF packages' });
  }
});

// ===========================================================================
// POST /rmf/packages — create a new RMF package
// ===========================================================================
router.post('/packages', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!(await verifyRmfEligibility(req, res))) return;

    const systemName = trimStr(req.body.system_name);
    const systemDescription = trimStr(req.body.system_description, 2000);
    const systemId = trimStr(req.body.system_id);

    if (!systemName) {
      return res.status(400).json({ success: false, error: 'system_name is required' });
    }

    // If system_id supplied, verify it belongs to the org and check uniqueness
    if (systemId) {
      const sysCheck = await pool.query(
        `SELECT id FROM organization_systems WHERE id = $1 AND organization_id = $2`,
        [systemId, orgId]
      );
      if (sysCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'System not found in this organization' });
      }
      const dupCheck = await pool.query(
        `SELECT id FROM rmf_packages WHERE system_id = $1 AND organization_id = $2`,
        [systemId, orgId]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'An RMF package already exists for this system' });
      }
    }

    const result = await pool.query(
      `INSERT INTO rmf_packages (
         organization_id, system_name, system_description, system_id,
         current_step, overall_status, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, 'prepare', 'not_started', $5, $5)
       RETURNING *`,
      [orgId, systemName, systemDescription, systemId, req.user.id]
    );

    // Record initial history entry
    const pkg = result.rows[0];
    await pool.query(
      `INSERT INTO rmf_step_history (
         rmf_package_id, organization_id, from_step, to_step, action, notes, performed_by
       ) VALUES ($1, $2, NULL, 'prepare', 'advance', 'Package created – lifecycle initiated at Prepare step', $3)`,
      [pkg.id, orgId, req.user.id]
    );

    log('info', 'rmf.package.created', {
      packageId: pkg.id,
      systemName,
      orgId,
      userId: req.user.id
    });

    res.status(201).json({ success: true, data: pkg });
  } catch (error) {
    log('error', 'rmf.package.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create RMF package' });
  }
});

// ===========================================================================
// GET /rmf/packages/:id — get a single RMF package with its history
// ===========================================================================
router.get('/packages/:id', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(
      `SELECT rp.*,
              creator.first_name || ' ' || creator.last_name AS created_by_name,
              updater.first_name || ' ' || updater.last_name AS updated_by_name
       FROM rmf_packages rp
       LEFT JOIN users creator ON creator.id = rp.created_by
       LEFT JOIN users updater ON updater.id = rp.updated_by
       WHERE rp.id = $1 AND rp.organization_id = $2`,
      [req.params.id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }

    const pkg = result.rows[0];

    // Fetch recent history
    const historyResult = await pool.query(
      `SELECT sh.*,
              u.first_name || ' ' || u.last_name AS performed_by_name
       FROM rmf_step_history sh
       LEFT JOIN users u ON u.id = sh.performed_by
       WHERE sh.rmf_package_id = $1
       ORDER BY sh.performed_at DESC
       LIMIT 50`,
      [pkg.id]
    );

    // Fetch authorization decisions
    const decisionsResult = await pool.query(
      `SELECT ad.*,
              u.first_name || ' ' || u.last_name AS created_by_name
       FROM rmf_authorization_decisions ad
       LEFT JOIN users u ON u.id = ad.created_by
       WHERE ad.rmf_package_id = $1
       ORDER BY ad.decision_date DESC`,
      [pkg.id]
    );

    // Fetch leveraged authorizations (controls inherited from COTS products)
    const leveragedResult = await pool.query(
      `SELECT la.*, cp.product_name, cp.vendor_name, cp.product_type,
              cp.lifecycle_status, cp.support_end_date,
              cp.authorization_status, cp.authorization_impact_level,
              cp.external_authorization_id,
              (cp.lifecycle_status IN ('deprecated', 'retired')
               OR (cp.support_end_date IS NOT NULL AND cp.support_end_date < CURRENT_DATE)
               OR (la.expiration_date IS NOT NULL AND la.expiration_date < CURRENT_DATE)) AS at_risk
       FROM rmf_leveraged_authorizations la
       JOIN cots_products cp ON cp.id = la.cots_product_id
       WHERE la.rmf_package_id = $1 AND la.organization_id = $2
       ORDER BY la.created_at DESC`,
      [pkg.id, orgId]
    );

    res.json({
      success: true,
      data: {
        ...pkg,
        history: historyResult.rows,
        authorization_decisions: decisionsResult.rows,
        leveraged_authorizations: leveragedResult.rows
      }
    });
  } catch (error) {
    log('error', 'rmf.package.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load RMF package' });
  }
});

// ===========================================================================
// PUT /rmf/packages/:id — update package metadata
// ===========================================================================
router.put('/packages/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const existing = await pool.query(
      `SELECT * FROM rmf_packages WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }

    const pkg = existing.rows[0];
    const systemName = trimStr(req.body.system_name) || pkg.system_name;
    const systemDescription = req.body.system_description !== undefined
      ? trimStr(req.body.system_description, 2000)
      : pkg.system_description;

    // CIA impacts
    const ci = trimStr(req.body.confidentiality_impact)?.toLowerCase();
    const ii = trimStr(req.body.integrity_impact)?.toLowerCase();
    const ai = trimStr(req.body.availability_impact)?.toLowerCase();
    if (ci && !VALID_CIA.has(ci)) {
      return res.status(400).json({ success: false, error: 'Invalid confidentiality_impact' });
    }
    if (ii && !VALID_CIA.has(ii)) {
      return res.status(400).json({ success: false, error: 'Invalid integrity_impact' });
    }
    if (ai && !VALID_CIA.has(ai)) {
      return res.status(400).json({ success: false, error: 'Invalid availability_impact' });
    }

    const categorizationLevel = trimStr(req.body.categorization_level)?.toLowerCase() || pkg.categorization_level;
    const categorizationRationale = req.body.categorization_rationale !== undefined
      ? trimStr(req.body.categorization_rationale, 5000)
      : pkg.categorization_rationale;

    const selectedBaseline = trimStr(req.body.selected_baseline) || pkg.selected_baseline;
    const tailoringNotes = req.body.tailoring_notes !== undefined
      ? trimStr(req.body.tailoring_notes, 5000)
      : pkg.tailoring_notes;

    const authorizationBoundary = req.body.authorization_boundary !== undefined
      ? trimStr(req.body.authorization_boundary, 5000)
      : pkg.authorization_boundary;

    const result = await pool.query(
      `UPDATE rmf_packages SET
         system_name = $3,
         system_description = $4,
         confidentiality_impact = COALESCE($5, confidentiality_impact),
         integrity_impact = COALESCE($6, integrity_impact),
         availability_impact = COALESCE($7, availability_impact),
         categorization_level = $8,
         categorization_rationale = $9,
         selected_baseline = $10,
         tailoring_notes = $11,
         authorization_boundary = $12,
         updated_by = $13,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id, orgId, systemName, systemDescription,
        ci, ii, ai, categorizationLevel, categorizationRationale,
        selectedBaseline, tailoringNotes, authorizationBoundary, req.user.id
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'rmf.package.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update RMF package' });
  }
});

// ===========================================================================
// POST /rmf/packages/:id/transition — advance, revert, or annotate step
// ===========================================================================
router.post('/packages/:id/transition', requirePermission('assessments.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM rmf_packages WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [req.params.id, orgId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }

    const pkg = existing.rows[0];
    const toStep = trimStr(req.body.to_step)?.toLowerCase();
    const action = trimStr(req.body.action)?.toLowerCase() || 'advance';
    const notes = trimStr(req.body.notes, 5000);
    const newStatus = trimStr(req.body.status)?.toLowerCase();

    if (!toStep || !VALID_STEPS.has(toStep)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `to_step must be one of: ${STEP_ORDER.join(', ')}`
      });
    }

    if (!VALID_ACTIONS.has(action)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `action must be one of: advance, revert, reset, note`
      });
    }

    if (newStatus && !VALID_STATUSES.has(newStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`
      });
    }

    // Record history
    await client.query(
      `INSERT INTO rmf_step_history (
         rmf_package_id, organization_id, from_step, to_step, action, notes, performed_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [pkg.id, orgId, pkg.current_step, toStep, action, notes, req.user.id]
    );

    // Update package
    const updatedResult = await client.query(
      `UPDATE rmf_packages SET
         current_step = $3,
         overall_status = COALESCE($4, overall_status),
         updated_by = $5,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [pkg.id, orgId, toStep, newStatus, req.user.id]
    );

    await client.query('COMMIT');

    log('info', 'rmf.package.transition', {
      packageId: pkg.id,
      from: pkg.current_step,
      to: toStep,
      action,
      orgId,
      userId: req.user.id
    });

    res.json({ success: true, data: updatedResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'rmf.package.transition_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to transition RMF step' });
  } finally {
    client.release();
  }
});

// ===========================================================================
// GET /rmf/packages/:id/history — full step history
// ===========================================================================
router.get('/packages/:id/history', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Verify package belongs to org
    const pkgCheck = await pool.query(
      `SELECT id FROM rmf_packages WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );
    if (pkgCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }

    const result = await pool.query(
      `SELECT sh.*,
              u.first_name || ' ' || u.last_name AS performed_by_name
       FROM rmf_step_history sh
       LEFT JOIN users u ON u.id = sh.performed_by
       WHERE sh.rmf_package_id = $1 AND sh.organization_id = $2
       ORDER BY sh.performed_at DESC
       LIMIT 200`,
      [req.params.id, orgId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'rmf.history.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load step history' });
  }
});

// ===========================================================================
// POST /rmf/packages/:id/authorization — record an authorization decision
// ===========================================================================
router.post('/packages/:id/authorization', requirePermission('assessments.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;

    await client.query('BEGIN');

    const pkgCheck = await client.query(
      `SELECT * FROM rmf_packages WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [req.params.id, orgId]
    );
    if (pkgCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }

    const decisionType = trimStr(req.body.decision_type)?.toLowerCase();
    if (!decisionType || !VALID_DECISION_TYPES.has(decisionType)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `decision_type must be one of: ${Array.from(VALID_DECISION_TYPES).join(', ')}`
      });
    }

    const authorizingOfficial = trimStr(req.body.authorizing_official);
    if (!authorizingOfficial) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'authorizing_official is required' });
    }

    const riskLevel = trimStr(req.body.risk_level)?.toLowerCase() || null;
    if (riskLevel && !VALID_RISK_LEVELS.has(riskLevel)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Invalid risk_level' });
    }

    const decisionDate = req.body.decision_date || new Date().toISOString().slice(0, 10);
    const expirationDate = trimStr(req.body.expiration_date) || null;
    const conditions = trimStr(req.body.conditions, 5000);
    const residualRiskStatement = trimStr(req.body.residual_risk_statement, 5000);
    const authorizingOfficialTitle = trimStr(req.body.authorizing_official_title);

    // Deactivate previous active decisions for this package
    await client.query(
      `UPDATE rmf_authorization_decisions SET is_active = false, updated_at = NOW()
       WHERE rmf_package_id = $1 AND is_active = true`,
      [req.params.id]
    );

    const result = await client.query(
      `INSERT INTO rmf_authorization_decisions (
         rmf_package_id, organization_id, decision_type, decision_date,
         expiration_date, conditions, risk_level, residual_risk_statement,
         authorizing_official, authorizing_official_title, is_active,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
       RETURNING *`,
      [
        req.params.id, orgId, decisionType, decisionDate,
        expirationDate, conditions, riskLevel, residualRiskStatement,
        authorizingOfficial, authorizingOfficialTitle, req.user.id
      ]
    );

    // Update package status based on decision
    const newStatus = decisionType === 'denial' ? 'denied' : 'authorized';
    const atoType = decisionType;

    await client.query(
      `UPDATE rmf_packages SET
         overall_status = $3,
         authorization_type = $4,
         current_step = 'authorize',
         updated_by = $5,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId, newStatus, atoType, req.user.id]
    );

    // Record transition
    await client.query(
      `INSERT INTO rmf_step_history (
         rmf_package_id, organization_id, from_step, to_step, action, notes, performed_by
       ) VALUES ($1, $2, $3, 'authorize', 'advance', $4, $5)`,
      [
        req.params.id, orgId,
        pkgCheck.rows[0].current_step,
        `Authorization decision recorded: ${decisionType.toUpperCase()} by ${authorizingOfficial}`,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    log('info', 'rmf.authorization.created', {
      packageId: req.params.id,
      decisionType,
      orgId,
      userId: req.user.id
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'rmf.authorization.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to record authorization decision' });
  } finally {
    client.release();
  }
});

// ===========================================================================
// DELETE /rmf/packages/:id — delete an RMF package
// ===========================================================================
router.delete('/packages/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(
      `DELETE FROM rmf_packages WHERE id = $1 AND organization_id = $2 RETURNING id, system_name`,
      [req.params.id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'RMF package not found' });
    }

    log('info', 'rmf.package.deleted', {
      packageId: req.params.id,
      systemName: result.rows[0].system_name,
      orgId,
      userId: req.user.id
    });

    res.json({ success: true, message: 'RMF package deleted' });
  } catch (error) {
    log('error', 'rmf.package.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete RMF package' });
  }
});

// ===========================================================================
// GET /rmf/summary — org-level RMF dashboard summary
// ===========================================================================
router.get('/summary', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!(await verifyRmfEligibility(req, res))) return;

    // Step distribution
    const stepDist = await pool.query(
      `SELECT current_step, COUNT(*)::int AS count
       FROM rmf_packages WHERE organization_id = $1
       GROUP BY current_step`,
      [orgId]
    );

    // Status distribution
    const statusDist = await pool.query(
      `SELECT overall_status, COUNT(*)::int AS count
       FROM rmf_packages WHERE organization_id = $1
       GROUP BY overall_status`,
      [orgId]
    );

    // Total packages
    const total = await pool.query(
      `SELECT COUNT(*)::int AS count FROM rmf_packages WHERE organization_id = $1`,
      [orgId]
    );

    // Active authorizations
    const activeAuth = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM rmf_authorization_decisions
       WHERE organization_id = $1 AND is_active = true`,
      [orgId]
    );

    // Upcoming expirations (next 90 days)
    const expiring = await pool.query(
      `SELECT ad.*, rp.system_name
       FROM rmf_authorization_decisions ad
       JOIN rmf_packages rp ON rp.id = ad.rmf_package_id
       WHERE ad.organization_id = $1
         AND ad.is_active = true
         AND ad.expiration_date IS NOT NULL
         AND ad.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
       ORDER BY ad.expiration_date ASC
       LIMIT 10`,
      [orgId]
    );

    // Active leveraged authorizations (controls inherited from COTS products)
    const leveragedTotal = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM rmf_leveraged_authorizations
       WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );

    // At-risk leveraged authorizations: active links whose provider product is
    // deprecated/retired, past support end, or whose authorization is expiring
    const atRiskLeveraged = await pool.query(
      `SELECT la.id, la.rmf_package_id, la.expiration_date, la.status,
              rp.system_name, cp.product_name, cp.lifecycle_status, cp.support_end_date
       FROM rmf_leveraged_authorizations la
       JOIN rmf_packages rp ON rp.id = la.rmf_package_id
       JOIN cots_products cp ON cp.id = la.cots_product_id
       WHERE la.organization_id = $1
         AND la.status = 'active'
         AND (cp.lifecycle_status IN ('deprecated', 'retired')
              OR (cp.support_end_date IS NOT NULL AND cp.support_end_date < CURRENT_DATE)
              OR (la.expiration_date IS NOT NULL AND la.expiration_date <= CURRENT_DATE + INTERVAL '90 days'))
       ORDER BY la.expiration_date ASC NULLS LAST
       LIMIT 10`,
      [orgId]
    );

    // Recent transitions
    const recentActivity = await pool.query(
      `SELECT sh.*, rp.system_name,
              u.first_name || ' ' || u.last_name AS performed_by_name
       FROM rmf_step_history sh
       JOIN rmf_packages rp ON rp.id = sh.rmf_package_id
       LEFT JOIN users u ON u.id = sh.performed_by
       WHERE sh.organization_id = $1
       ORDER BY sh.performed_at DESC
       LIMIT 10`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        total_packages: total.rows[0]?.count || 0,
        step_distribution: Object.fromEntries(
          STEP_ORDER.map(s => [s, stepDist.rows.find(r => r.current_step === s)?.count || 0])
        ),
        status_distribution: Object.fromEntries(
          statusDist.rows.map(r => [r.overall_status, r.count])
        ),
        active_authorizations: activeAuth.rows[0]?.count || 0,
        expiring_authorizations: expiring.rows,
        leveraged_authorizations_total: leveragedTotal.rows[0]?.count || 0,
        at_risk_leveraged: atRiskLeveraged.rows,
        recent_activity: recentActivity.rows
      }
    });
  } catch (error) {
    log('error', 'rmf.summary.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load RMF summary' });
  }
});

module.exports = router;
