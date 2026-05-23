const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { JWT_SECRET, JWT_ALGORITHM } = require('../config/security');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');

// All service account routes require Professional+ tier
router.use(authenticate);
router.use(requireTier('professional'));

/**
 * GET /api/service-accounts
 * Get all service accounts for organization
 */
router.get('/', requirePermission('service_accounts.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, vault_id } = req.query;

    let query = `
      SELECT
        sa.*,
        u1.first_name || ' ' || u1.last_name as owner_name,
        u2.first_name || ' ' || u2.last_name as reviewer_name,
        pv.name as vault_name,
        pv.vault_type,
        (SELECT COUNT(*) FROM service_account_access WHERE service_account_id = sa.id) as access_count
      FROM service_accounts sa
      LEFT JOIN users u1 ON sa.owner_id = u1.id
      LEFT JOIN users u2 ON sa.reviewer_id = u2.id
      LEFT JOIN password_vaults pv ON sa.vault_id = pv.id
      WHERE sa.organization_id = $1
    `;

    const params = [orgId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND sa.status = $${paramCount}`;
      params.push(status);
    }

    if (vault_id) {
      paramCount++;
      query += ` AND sa.vault_id = $${paramCount}`;
      params.push(vault_id);
    }

    query += ` ORDER BY sa.account_name ASC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        serviceAccounts: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get service accounts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch service accounts' });
  }
});

/**
 * GET /api/service-accounts/expiring
 * Get service accounts needing rotation or review
 */
router.get('/expiring', requirePermission('service_accounts.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const daysThreshold = parseInt(req.query.days) || 30;

    const result = await pool.query(`
      SELECT
        sa.*,
        u.first_name || ' ' || u.last_name as owner_name,
        pv.name as vault_name,
        CASE
          WHEN sa.next_rotation_date < CURRENT_DATE THEN 'overdue_rotation'
          WHEN sa.next_review_date < CURRENT_DATE THEN 'overdue_review'
          WHEN sa.next_rotation_date <= CURRENT_DATE + $2 THEN 'rotation_due_soon'
          WHEN sa.next_review_date <= CURRENT_DATE + $2 THEN 'review_due_soon'
        END as alert_type
      FROM service_accounts sa
      LEFT JOIN users u ON sa.owner_id = u.id
      LEFT JOIN password_vaults pv ON sa.vault_id = pv.id
      WHERE sa.organization_id = $1
        AND sa.is_active = true
        AND (
          sa.next_rotation_date <= CURRENT_DATE + $2
          OR sa.next_review_date <= CURRENT_DATE + $2
        )
      ORDER BY
        CASE
          WHEN sa.next_rotation_date < CURRENT_DATE THEN 1
          WHEN sa.next_review_date < CURRENT_DATE THEN 2
          ELSE 3
        END,
        sa.next_rotation_date ASC
    `, [orgId, daysThreshold]);

    res.json({
      success: true,
      data: {
        accounts: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get expiring accounts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expiring accounts' });
  }
});

/**
 * GET /api/service-accounts/:id
 * Get single service account by ID
 */
router.get('/:id', requirePermission('service_accounts.read'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    const saResult = await pool.query(`
      SELECT
        sa.*,
        u1.first_name || ' ' || u1.last_name as owner_name,
        u1.email as owner_email,
        u2.first_name || ' ' || u2.last_name as reviewer_name,
        pv.name as vault_name,
        pv.vault_type,
        pv.vault_url
      FROM service_accounts sa
      LEFT JOIN users u1 ON sa.owner_id = u1.id
      LEFT JOIN users u2 ON sa.reviewer_id = u2.id
      LEFT JOIN password_vaults pv ON sa.vault_id = pv.id
      WHERE sa.id = $1 AND sa.organization_id = $2
    `, [id, orgId]);

    if (saResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service account not found' });
    }

    // Get access details
    const accessResult = await pool.query(`
      SELECT
        saa.*,
        a.name as asset_name,
        ac.code as asset_category,
        e.name as environment_name
      FROM service_account_access saa
      LEFT JOIN assets a ON saa.asset_id = a.id
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      LEFT JOIN environments e ON saa.environment_id = e.id
      WHERE saa.service_account_id = $1
      ORDER BY saa.granted_date DESC
    `, [id]);

    // Get review history (if Enterprise+)
    const reviewsResult = await pool.query(`
      SELECT
        sar.*,
        u.first_name || ' ' || u.last_name as reviewer_name
      FROM service_account_reviews sar
      JOIN users u ON sar.reviewer_id = u.id
      WHERE sar.service_account_id = $1
      ORDER BY sar.review_date DESC
      LIMIT 10
    `, [id]);

    res.json({
      success: true,
      data: {
        serviceAccount: saResult.rows[0],
        access: accessResult.rows,
        reviews: reviewsResult.rows
      }
    });
  } catch (error) {
    console.error('Get service account error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch service account' });
  }
});

/**
 * POST /api/service-accounts
 * Create new service account
 */
router.post('/', requirePermission('service_accounts.write'), validateBody((body) => {
  const errors = requireFields(body, ['account_name', 'account_type', 'owner_id']);
  if (body.owner_id && !isUuid(body.owner_id)) {
    errors.push('owner_id must be a valid UUID');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      account_name, account_type, description,
      owner_id, business_justification,
      vault_id, vault_path,
      credential_type, rotation_frequency_days, auto_rotation_enabled,
      privilege_level, scope,
      review_frequency_days, reviewer_id
    } = req.body;

    // Calculate next rotation and review dates
    const rotationDays = rotation_frequency_days || 90;
    const reviewDays = review_frequency_days || 90;

    const result = await pool.query(`
      INSERT INTO service_accounts (
        organization_id, account_name, account_type, description,
        owner_id, business_justification,
        vault_id, vault_path,
        credential_type, rotation_frequency_days, next_rotation_date, auto_rotation_enabled,
        privilege_level, scope,
        review_frequency_days, next_review_date, reviewer_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE + $11, $12, $13, $14, $15, CURRENT_DATE + $16, $17)
      RETURNING *
    `, [
      orgId, account_name, account_type, description,
      owner_id, business_justification,
      vault_id, vault_path,
      credential_type, rotationDays, rotationDays, auto_rotation_enabled || false,
      privilege_level, scope,
      reviewDays, reviewDays, reviewer_id
    ]);

    res.status(201).json({
      success: true,
      data: { serviceAccount: result.rows[0] },
      message: 'Service account created successfully'
    });
  } catch (error) {
    if (error.constraint === 'service_accounts_organization_id_account_name_key') {
      return res.status(400).json({ success: false, error: 'Service account name already exists' });
    }
    console.error('Create service account error:', error);
    res.status(500).json({ success: false, error: 'Failed to create service account' });
  }
});

/**
 * PUT /api/service-accounts/:id
 * Update service account
 */
router.put('/:id', requirePermission('service_accounts.write'), validateBody((body) => {
  const errors = [];
  if (body.owner_id && !isUuid(body.owner_id)) {
    errors.push('owner_id must be a valid UUID');
  }
  if (body.reviewer_id && !isUuid(body.reviewer_id)) {
    errors.push('reviewer_id must be a valid UUID');
  }
  return errors;
}), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    // Verify service account belongs to organization
    const checkResult = await pool.query(
      'SELECT id FROM service_accounts WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service account not found' });
    }

    const {
      account_name, account_type, description,
      owner_id, business_justification,
      vault_id, vault_path,
      credential_type, rotation_frequency_days, auto_rotation_enabled,
      privilege_level, scope,
      review_frequency_days, reviewer_id,
      status, is_active
    } = req.body;

    const result = await pool.query(`
      UPDATE service_accounts SET
        account_name = COALESCE($1, account_name),
        account_type = COALESCE($2, account_type),
        description = COALESCE($3, description),
        owner_id = COALESCE($4, owner_id),
        business_justification = COALESCE($5, business_justification),
        vault_id = COALESCE($6, vault_id),
        vault_path = COALESCE($7, vault_path),
        credential_type = COALESCE($8, credential_type),
        rotation_frequency_days = COALESCE($9, rotation_frequency_days),
        auto_rotation_enabled = COALESCE($10, auto_rotation_enabled),
        privilege_level = COALESCE($11, privilege_level),
        scope = COALESCE($12, scope),
        review_frequency_days = COALESCE($13, review_frequency_days),
        reviewer_id = COALESCE($14, reviewer_id),
        status = COALESCE($15, status),
        is_active = COALESCE($16, is_active),
        updated_at = NOW()
      WHERE id = $17 AND organization_id = $18
      RETURNING *
    `, [
      account_name, account_type, description,
      owner_id, business_justification,
      vault_id, vault_path,
      credential_type, rotation_frequency_days, auto_rotation_enabled,
      privilege_level, scope,
      review_frequency_days, reviewer_id,
      status, is_active,
      id, orgId
    ]);

    res.json({
      success: true,
      data: { serviceAccount: result.rows[0] },
      message: 'Service account updated successfully'
    });
  } catch (error) {
    console.error('Update service account error:', error);
    res.status(500).json({ success: false, error: 'Failed to update service account' });
  }
});

/**
 * POST /api/service-accounts/:id/rotate
 * Mark service account as rotated
 */
router.post('/:id/rotate', requirePermission('service_accounts.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    const result = await pool.query(`
      UPDATE service_accounts SET
        last_rotation_date = CURRENT_DATE,
        next_rotation_date = CURRENT_DATE + rotation_frequency_days,
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [id, orgId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service account not found' });
    }

    res.json({
      success: true,
      data: { serviceAccount: result.rows[0] },
      message: 'Service account rotation recorded'
    });
  } catch (error) {
    console.error('Rotate service account error:', error);
    res.status(500).json({ success: false, error: 'Failed to record rotation' });
  }
});

/**
 * POST /api/service-accounts/:id/review
 * Submit service account review
 */
router.post('/:id/review', requirePermission('service_accounts.write'), validateBody((body) => requireFields(body, ['review_status'])), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;
    const reviewerId = req.user.id;

    const { review_status, findings, action_taken } = req.body;

    // Create review record
    const reviewResult = await pool.query(`
      INSERT INTO service_account_reviews (
        service_account_id, reviewer_id, review_status, findings, action_taken,
        next_review_date
      )
      SELECT
        $1, $2, $3, $4, $5,
        CURRENT_DATE + sa.review_frequency_days
      FROM service_accounts sa
      WHERE sa.id = $1 AND sa.organization_id = $6
      RETURNING *
    `, [id, reviewerId, review_status, findings, action_taken, orgId]);

    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service account not found' });
    }

    // Update service account
    await pool.query(`
      UPDATE service_accounts SET
        last_review_date = CURRENT_DATE,
        next_review_date = CURRENT_DATE + review_frequency_days,
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
    `, [id, orgId]);

    res.json({
      success: true,
      data: { review: reviewResult.rows[0] },
      message: 'Review submitted successfully'
    });
  } catch (error) {
    console.error('Review service account error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit review' });
  }
});

/**
 * POST /api/service-accounts/:id/generate-token
 * Generate a JWT token for a service account (for MCP / external agent access)
 */
router.post('/:id/generate-token', requirePermission('service_accounts.write'), validateBody((body) => {
  const errors = [];
  if (body.expires_in_days && (typeof body.expires_in_days !== 'number' || body.expires_in_days < 1 || body.expires_in_days > 365)) {
    errors.push('expires_in_days must be between 1 and 365');
  }
  return errors;
}), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;
    const expiresInDays = req.body.expires_in_days || 90;

    // Verify service account exists and belongs to org
    const saResult = await pool.query(
      'SELECT id, account_name, owner_id, scope, is_active FROM service_accounts WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );

    if (saResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service account not found' });
    }

    const sa = saResult.rows[0];
    if (!sa.is_active) {
      return res.status(400).json({ success: false, error: 'Service account is inactive' });
    }

    if (!sa.owner_id) {
      return res.status(400).json({ success: false, error: 'Service account has no owner — assign an owner before generating a token' });
    }

    // Generate a long-lived JWT scoped to the service account's owner
    const token = jwt.sign(
      {
        userId: sa.owner_id,
        serviceAccountId: sa.id,
        scope: sa.scope || 'read-only',
        type: 'service_account'
      },
      JWT_SECRET,
      { expiresIn: `${expiresInDays}d`, algorithm: JWT_ALGORITHM }
    );

    // Store token hash for revocation support (gracefully skip if columns don't exist yet)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      await pool.query(
        `UPDATE service_accounts SET
          token_hash = $1,
          token_expires_at = CURRENT_DATE + $2,
          updated_at = NOW()
        WHERE id = $3 AND organization_id = $4`,
        [tokenHash, expiresInDays, id, orgId]
      );
    } catch (hashErr) {
      // token_hash/token_expires_at columns may not exist yet — token is still valid
      console.warn('Could not store token hash (migration pending):', hashErr.message);
    }

    res.json({
      success: true,
      data: {
        token,
        service_account: sa.account_name,
        scope: sa.scope || 'read-only',
        expires_in_days: expiresInDays
      },
      message: 'Service account token generated. Store this token securely — it will not be shown again.'
    });
  } catch (error) {
    console.error('Generate service account token error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate token' });
  }
});

/**
 * DELETE /api/service-accounts/:id
 * Delete service account
 */
router.delete('/:id', requirePermission('service_accounts.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;

    const result = await pool.query(
      'DELETE FROM service_accounts WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service account not found' });
    }

    res.json({
      success: true,
      message: 'Service account deleted successfully'
    });
  } catch (error) {
    console.error('Delete service account error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete service account' });
  }
});

module.exports = router;
