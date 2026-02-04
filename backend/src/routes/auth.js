import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  logAccountCreated,
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  AuditEventType
} from '../utils/auditLogger.js';
import { initializeOrganizationRoles } from '../services/roleService.js';

const router = express.Router();

// Helper function to generate tokens
function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      organizationId: user.organization_id,
      email: user.email,
      role: user.role,
      type: 'access'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );

  const refreshToken = jwt.sign(
    {
      userId: user.id,
      type: 'refresh'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );

  return { accessToken, refreshToken };
}

// Helper to validate password strength
function validatePassword(password) {
  if (password.length < 12) {
    return 'Password must be at least 12 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  const client = await pool.connect();

  try {
    const { email, password, full_name, organization_name, industry } = req.body;

    // Validate required fields
    if (!email || !password || !full_name || !organization_name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, full name, and organization name are required'
      });
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: passwordError
      });
    }

    await client.query('BEGIN');

    // Check if email already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    // Create organization
    const orgResult = await client.query(
      `INSERT INTO organizations (name, industry, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, name`,
      [organization_name, industry || null]
    );

    const organization = orgResult.rows[0];

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (organization_id, email, full_name, role, password_hash, is_active, email_verified, created_at)
       VALUES ($1, $2, $3, $4, $5, true, false, NOW())
       RETURNING id, organization_id, email, full_name, role`,
      [organization.id, email.toLowerCase(), full_name, 'admin', password_hash]
    );

    const user = userResult.rows[0];

    // Generate tokens
    const tokens = generateTokens(user);

    // Store refresh token in sessions
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await client.query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at, ip_address, user_agent, is_active, created_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      [user.id, tokens.refreshToken, expiresAt, req.ip, req.get('user-agent')]
    );

    await client.query('COMMIT');

    // Initialize default roles after transaction commits so the org exists for FK lookups
    try {
      await initializeOrganizationRoles(organization.id, user.id);
    } catch (roleError) {
      console.warn('Warning: Could not initialize roles:', roleError.message);
    }

    // Log registration with AU-2 compliant audit logging
    await logAccountCreated(
      user.id,
      user.email,
      user.id, // Created by self
      req.ip,
      req.get('user-agent'),
      {
        organization_id: organization.id,
        organization_name: organization.name,
        role: user.role
      }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        },
        organization: {
          id: organization.id,
          name: organization.name
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900 // 15 minutes in seconds
        }
      },
      message: 'Registration successful'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  } finally {
    client.release();
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Get user with password hash
    const result = await pool.query(
      `SELECT id, organization_id, email, full_name, role, password_hash, is_active
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Log failed login attempt with AU-2 compliant logging
      await logLoginFailure(
        email.toLowerCase(),
        'Invalid credentials',
        req.ip,
        req.get('user-agent'),
        { reason: 'user_not_found' }
      );

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is inactive'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      // Log failed login attempt with AU-2 compliant logging
      await logLoginFailure(
        user.email,
        'Invalid credentials',
        req.ip,
        req.get('user-agent'),
        { user_id: user.id, reason: 'invalid_password' }
      );

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate tokens
    const tokens = generateTokens(user);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at, ip_address, user_agent, is_active, created_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      [user.id, tokens.refreshToken, expiresAt, req.ip, req.get('user-agent')]
    );

    // Update last_login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Log successful login with AU-2 compliant logging
    await logLoginSuccess(
      user.id,
      user.email,
      req.ip,
      req.get('user-agent'),
      {
        organization_id: user.organization_id,
        role: user.role
      }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          organization_id: user.organization_id
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type'
      });
    }

    // Check if session exists and is active
    const sessionResult = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, u.organization_id, u.email, u.role, u.is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token = $1 AND s.is_active = true`,
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }

    const session = sessionResult.rows[0];

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      await pool.query(
        'UPDATE sessions SET is_active = false WHERE id = $1',
        [session.id]
      );
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired'
      });
    }

    // Check if user is still active
    if (!session.is_active) {
      return res.status(401).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        userId: session.user_id,
        organizationId: session.organization_id,
        email: session.email,
        role: session.role,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    // Update last activity
    await pool.query(
      'UPDATE sessions SET last_activity = NOW() WHERE id = $1',
      [session.id]
    );

    res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: 900
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Deactivate the specific session
      await pool.query(
        'UPDATE sessions SET is_active = false WHERE refresh_token = $1 AND user_id = $2',
        [refreshToken, req.user.id]
      );
    }

    // Log logout with AU-2 compliant logging
    await logLogout(
      req.user.id,
      req.user.email,
      req.ip,
      req.get('user-agent'),
      { session_terminated: !!refreshToken }
    );

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.last_login,
              o.id as org_id, o.name as org_name, o.industry
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    // Get user's roles and permissions
    const rolesResult = await pool.query(
      `SELECT r.name, r.description
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [req.user.id]
    );

    const permissionsResult = await pool.query(
      `SELECT DISTINCT p.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at,
        last_login: user.last_login,
        organization: {
          id: user.org_id,
          name: user.org_name,
          industry: user.industry
        },
        roles: rolesResult.rows.map(r => r.name),
        permissions: permissionsResult.rows.map(p => p.name)
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

export default router;
