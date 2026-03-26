// @tier: community
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { authenticate, requireAnyPermission, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');
const { ensureAuditorSubroles } = require('../services/auditorRoleTemplates');
const {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPLEXITY_ERROR_MESSAGE,
  hasRequiredPasswordComplexity
} = require('../utils/passwordPolicy');
const { encrypt, decrypt, hashForLookup } = require('../utils/encrypt');
const { hasPublicColumn } = require('../utils/schema');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// Explicit express-rate-limit instance so that static-analysis tools (CodeQL)
// recognise the rate-limiting middleware.
const usersRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});
router.use(usersRateLimiter);
const ALLOWED_PRIMARY_ROLES = new Set(['admin', 'auditor', 'user']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// email_hash column availability cache (checked once per process)
let usersEmailHashColumnAvailable = null;
async function hasEmailHashCol() {
  if (usersEmailHashColumnAvailable === null) {
    usersEmailHashColumnAvailable = await hasPublicColumn('users', 'email_hash');
  }
  return usersEmailHashColumnAvailable;
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || '').trim());
}

function splitFullName(rawValue) {
  const normalized = String(rawValue || '').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
}

async function resolveSystemRoleId(client, roleName) {
  const result = await client.query(
    `SELECT id
     FROM roles
     WHERE is_system_role = true
       AND name = $1
     LIMIT 1`,
    [roleName]
  );
  return result.rows[0]?.id || null;
}

async function validateAssignableRoleIds(client, organizationId, roleIds) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return [];
  }
  const uniqueRoleIds = Array.from(new Set(roleIds));
  const result = await client.query(
    `SELECT id::text AS id
     FROM roles
     WHERE id = ANY($1::uuid[])
       AND (organization_id = $2 OR is_system_role = true)`,
    [uniqueRoleIds, organizationId]
  );

  if (result.rows.length !== uniqueRoleIds.length) {
    const error = new Error('One or more roleIds are invalid for this organization');
    error.statusCode = 400;
    throw error;
  }

  return uniqueRoleIds;
}

async function replaceUserRoles(client, userId, roleIds) {
  await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
  for (const roleId of roleIds) {
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, roleId]
    );
  }
}

// GET /users
router.get('/', requireAnyPermission(['users.read', 'users.manage']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name,
             TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) as full_name,
             u.role, u.is_active, u.created_at
      FROM users u
      WHERE u.organization_id = $1
      ORDER BY u.first_name, u.last_name
    `, [req.user.organization_id]);

    const rows = result.rows.map((u) => ({ ...u, email: decrypt(u.email) }));
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ success: false, error: 'Failed to load users' });
  }
});

// POST /users
router.post('/', requirePermission('users.manage'), validateBody((body) => {
  const errors = requireFields(body, ['email', 'password', 'full_name']);
  if (body.email && !isValidEmail(body.email)) {
    errors.push('email must be a valid email address');
  }
  if (body.password && String(body.password).length < MIN_PASSWORD_LENGTH) {
    errors.push(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  } else if (body.password && !hasRequiredPasswordComplexity(body.password)) {
    errors.push(PASSWORD_COMPLEXITY_ERROR_MESSAGE);
  }
  if (body.primary_role && !ALLOWED_PRIMARY_ROLES.has(String(body.primary_role).toLowerCase())) {
    errors.push('primary_role must be one of: admin, auditor, user');
  }
  if (body.role_ids !== undefined) {
    if (!Array.isArray(body.role_ids)) {
      errors.push('role_ids must be an array');
    } else if (body.role_ids.some((id) => !isUuid(id))) {
      errors.push('role_ids must contain valid UUID values');
    }
  }
  return errors;
}), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fullName = String(req.body.full_name || '').trim();
    const primaryRole = String(req.body.primary_role || 'user').toLowerCase();
    const roleIdsInput = Array.isArray(req.body.role_ids) ? req.body.role_ids : [];
    const autoGenerateAuditorSubroles = req.body.auto_generate_auditor_subroles !== false;

    const useEmailHash = await hasEmailHashCol();
    const emailHash = useEmailHash ? hashForLookup(email) : null;
    // Check for duplicate email — with fallback for pre-migration rows (email_hash IS NULL)
    let existing;
    if (emailHash) {
      existing = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHash]);
      if (existing.rows.length === 0) {
        // Fallback: plain-text match for rows not yet migrated
        existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND email_hash IS NULL', [email]);
      }
    } else {
      existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    }
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const { firstName, lastName } = splitFullName(fullName);
    const passwordHash = await bcrypt.hash(password, 12);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const storedEmail = emailHash ? encrypt(email) : email;
      const uCols = emailHash
        ? 'organization_id, email, email_hash, password_hash, first_name, last_name, role, is_active'
        : 'organization_id, email, password_hash, first_name, last_name, role, is_active';
      const uVals = emailHash
        ? [req.user.organization_id, storedEmail, emailHash, passwordHash, firstName, lastName, primaryRole, true]
        : [req.user.organization_id, email, passwordHash, firstName, lastName, primaryRole, true];
      const uPlaceholders = uVals.map((_, i) => `$${i + 1}`).join(', ');
      const userResult = await client.query(
        `INSERT INTO users (${uCols})
         VALUES (${uPlaceholders})
         RETURNING id, email, first_name, last_name, role, is_active, created_at`,
        uVals
      );
      const createdUser = userResult.rows[0];
      // Expose plain-text email in response
      createdUser.email = email;

      if (primaryRole === 'auditor' && autoGenerateAuditorSubroles) {
        await ensureAuditorSubroles(client, req.user.organization_id);
      }

      const systemRoleId = await resolveSystemRoleId(client, primaryRole);
      const validatedCustomRoleIds = await validateAssignableRoleIds(client, req.user.organization_id, roleIdsInput);
      const finalRoleIds = Array.from(new Set([
        ...(systemRoleId ? [systemRoleId] : []),
        ...validatedCustomRoleIds
      ]));

      if (finalRoleIds.length > 0) {
        await replaceUserRoles(client, createdUser.id, finalRoleIds);
      }

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: {
          user: createdUser,
          role_ids: finalRoleIds
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create user error:', error);
    const statusCode = Number(error.statusCode) || 500;
    const message = statusCode === 500 ? 'Failed to create user' : String(error.message || 'Failed to create user');
    res.status(statusCode).json({ success: false, error: message });
  }
});

// PATCH /users/:userId
router.patch('/:userId', requirePermission('users.manage'), validateBody((body, req) => {
  const errors = [];
  if (!isUuid(req.params.userId)) {
    errors.push('userId must be a valid UUID');
  }
  const noUpdatableFields = (
    body.full_name === undefined &&
    body.primary_role === undefined &&
    body.is_active === undefined &&
    body.role_ids === undefined
  );
  if (noUpdatableFields) {
    errors.push('Provide at least one of: full_name, primary_role, is_active, role_ids');
  }
  if (body.full_name !== undefined && !String(body.full_name).trim()) {
    errors.push('full_name cannot be empty');
  }
  if (body.primary_role !== undefined && !ALLOWED_PRIMARY_ROLES.has(String(body.primary_role).toLowerCase())) {
    errors.push('primary_role must be one of: admin, auditor, user');
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }
  if (body.role_ids !== undefined) {
    if (!Array.isArray(body.role_ids)) {
      errors.push('role_ids must be an array');
    } else if (body.role_ids.some((id) => !isUuid(id))) {
      errors.push('role_ids must contain valid UUID values');
    }
  }
  return errors;
}), async (req, res) => {
  try {
    const userId = req.params.userId;
    const roleIdsInput = Array.isArray(req.body.role_ids) ? req.body.role_ids : null;
    const autoGenerateAuditorSubroles = req.body.auto_generate_auditor_subroles !== false;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingUserResult = await client.query(
        `SELECT id, role
         FROM users
         WHERE id = $1
           AND organization_id = $2
         LIMIT 1`,
        [userId, req.user.organization_id]
      );
      if (existingUserResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'User not found in your organization' });
      }

      const existingUser = existingUserResult.rows[0];
      const nextRole = req.body.primary_role !== undefined
        ? String(req.body.primary_role).toLowerCase()
        : String(existingUser.role).toLowerCase();

      if (nextRole === 'auditor' && autoGenerateAuditorSubroles) {
        await ensureAuditorSubroles(client, req.user.organization_id);
      }

      const updates = [];
      const params = [];
      let idx = 1;

      if (req.body.full_name !== undefined) {
        const { firstName, lastName } = splitFullName(req.body.full_name);
        updates.push(`first_name = $${idx++}`);
        params.push(firstName);
        updates.push(`last_name = $${idx++}`);
        params.push(lastName);
      }
      if (req.body.primary_role !== undefined) {
        updates.push(`role = $${idx++}`);
        params.push(nextRole);
      }
      if (req.body.is_active !== undefined) {
        updates.push(`is_active = $${idx++}`);
        params.push(Boolean(req.body.is_active));
      }

      let updatedUser;
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        params.push(userId);
        params.push(req.user.organization_id);
        const updated = await client.query(
          `UPDATE users
           SET ${updates.join(', ')}
           WHERE id = $${idx++}
             AND organization_id = $${idx++}
           RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at`,
          params
        );
        updatedUser = updated.rows[0];
      } else {
        const current = await client.query(
          `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
           FROM users
           WHERE id = $1
             AND organization_id = $2
           LIMIT 1`,
          [userId, req.user.organization_id]
        );
        updatedUser = current.rows[0];
      }

      if (roleIdsInput !== null || req.body.primary_role !== undefined) {
        const systemRoleId = await resolveSystemRoleId(client, nextRole);
        const validatedCustomRoleIds = await validateAssignableRoleIds(
          client,
          req.user.organization_id,
          roleIdsInput || []
        );
        const finalRoleIds = Array.from(new Set([
          ...(systemRoleId ? [systemRoleId] : []),
          ...validatedCustomRoleIds
        ]));
        if (finalRoleIds.length > 0) {
          await replaceUserRoles(client, userId, finalRoleIds);
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        data: {
          user: updatedUser
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update user error:', error);
    const statusCode = Number(error.statusCode) || 500;
    const message = statusCode === 500 ? 'Failed to update user' : String(error.message || 'Failed to update user');
    res.status(statusCode).json({ success: false, error: message });
  }
});

// =========================================================================
// INVITE SYSTEM — Pre-configured user invitations
// =========================================================================

// ---------- POST /api/v1/users/invite ----------
// Admin creates an invite with pre-selected role, custom roles.
// Returns an invite token the admin can share as a link.
router.post('/invite', requirePermission('users.manage'), validateBody((body) => {
  const errors = [];
  if (!body.email || !isValidEmail(body.email)) errors.push('Valid email is required');
  if (body.primary_role && !ALLOWED_PRIMARY_ROLES.has(body.primary_role)) {
    errors.push('primary_role must be admin, auditor, or user');
  }
  if (body.role_ids && !Array.isArray(body.role_ids)) {
    errors.push('role_ids must be an array');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const email = String(req.body.email).trim().toLowerCase();
    const primaryRole = req.body.primary_role || 'user';
    const roleIds = Array.isArray(req.body.role_ids)
      ? req.body.role_ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : [];

    // Check if email already exists as a user (use email_hash when available)
    const invEmailHash = (await hasEmailHashCol()) ? hashForLookup(email) : null;
    let existingUser;
    if (invEmailHash) {
      existingUser = await pool.query('SELECT id FROM users WHERE email_hash = $1 LIMIT 1', [invEmailHash]);
      if (existingUser.rows.length === 0) {
        // Fallback for pre-migration rows
        existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND email_hash IS NULL LIMIT 1', [email]);
      }
    } else {
      existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    }
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists' });
    }

    // Check for existing pending invite
    const existingInvite = await pool.query(
      `SELECT id FROM organization_invites
       WHERE organization_id = $1 AND LOWER(email) = $2 AND status = 'pending' AND expires_at > NOW()
       LIMIT 1`,
      [orgId, email]
    );
    if (existingInvite.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'A pending invite for this email already exists' });
    }

    // Generate secure invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(`
      INSERT INTO organization_invites
        (organization_id, email, invite_token, primary_role, role_ids, invited_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, primary_role, role_ids, status, expires_at, created_at
    `, [orgId, email, inviteToken, primaryRole, roleIds, req.user.id]);

    // Audit log
    await pool.query(`
      INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, ip_address, success, created_at)
      VALUES ($1, $2, 'user_invited', 'user', $3, $4, $5, true, NOW())
    `, [orgId, req.user.id, result.rows[0].id,
        JSON.stringify({ email, primary_role: primaryRole, role_ids: roleIds }),
        req.ip || null]).catch(() => {});

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        invite_token: inviteToken,
        invite_url: `/invite?token=${inviteToken}`
      }
    });
  } catch (err) {
    console.error('Create invite error:', err);
    res.status(500).json({ success: false, error: 'Failed to create invite' });
  }
});

// ---------- GET /api/v1/users/invites ----------
// List all invites for the organization
router.get('/invites', requirePermission('users.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(`
      SELECT oi.id, oi.email, oi.primary_role, oi.role_ids, oi.status,
             oi.expires_at, oi.accepted_at, oi.created_at,
             CONCAT(u.first_name, ' ', u.last_name) AS invited_by_name
      FROM organization_invites oi
      LEFT JOIN users u ON u.id = oi.invited_by
      WHERE oi.organization_id = $1
      ORDER BY oi.created_at DESC
      LIMIT 100
    `, [orgId]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List invites error:', err);
    res.status(500).json({ success: false, error: 'Failed to list invites' });
  }
});

// ---------- DELETE /api/v1/users/invites/:inviteId ----------
// Revoke a pending invite
router.delete('/invites/:inviteId', requirePermission('users.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { inviteId } = req.params;

    const result = await pool.query(
      `UPDATE organization_invites SET status = 'revoked'
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'
       RETURNING id, email`,
      [inviteId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invite not found or already used' });
    }

    res.json({ success: true, message: 'Invite revoked' });
  } catch (err) {
    console.error('Revoke invite error:', err);
    res.status(500).json({ success: false, error: 'Failed to revoke invite' });
  }
});

module.exports = router;
