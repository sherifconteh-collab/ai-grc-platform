// @tier: community
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');

let notificationNew = () => {};
let notificationRead = () => {};
let notificationReadAll = () => {};
try {
  ({ notificationNew, notificationRead, notificationReadAll } = require('../services/realtimeEventService'));
} catch (_err) {
  // Optional in the public/community repo.
}

router.use(authenticate);

const notificationsRateLimiter = createRateLimiter({ label: 'notifications', windowMs: 60 * 1000, max: 60 });
router.use(notificationsRateLimiter);

// Explicit express-rate-limit instance for the email-status route so that
// static-analysis tools (CodeQL) recognise the rate-limiting middleware.
const emailStatusRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
  message: { success: false, error: 'Too many requests', message: 'Rate limit exceeded. Please try again later.' }
});

const NOTIFICATION_TYPES = ['control_due', 'assessment_needed', 'status_change', 'system', 'crosswalk'];

// GET /notifications — supports limit, unread, type, page
router.get('/', requirePermission('notifications.read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const orgId = req.user.organization_id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread === 'true';
    const typeFilter = req.query.type || null;

    const params = [orgId, userId];
    let where = 'WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL)';

    if (unreadOnly) where += ' AND is_read = false';
    if (typeFilter) {
      params.push(typeFilter);
      where += ` AND type = $${params.length}`;
    }

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM notifications WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL) AND is_read = false`,
      [orgId, userId]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unreadCount: parseInt(countResult.rows[0].count),
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to load notifications' });
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', requirePermission('notifications.read'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) AND organization_id = $3',
      [req.params.id, req.user.id, req.user.organization_id]
    );
    
    // Emit real-time event
    notificationRead(req.user.id, req.params.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

// POST /notifications/read-all
router.post('/read-all', requirePermission('notifications.read'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL)',
      [req.user.organization_id, req.user.id]
    );
    
    // Emit real-time event
    notificationReadAll(req.user.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Read all error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
});

// POST /notifications (create notification — internal use, admin only)
router.post('/', requirePermission('notifications.write'), validateBody((body) => {
  const errors = requireFields(body, ['type', 'title', 'message']);
  return errors;
}), async (req, res) => {
  try {
    const { type, title, message, link, userId } = req.body;

    if (userId) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
        [userId, req.user.organization_id]
      );
      if (userResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'userId is not in your organization' });
      }
    }

    const result = await pool.query(`
      INSERT INTO notifications (organization_id, user_id, type, title, message, link)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [req.user.organization_id, userId || null, type, title, message, link || null]);

    // Emit real-time event
    const notification = result.rows[0];
    notificationNew(userId || null, req.user.organization_id, notification);

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ success: false, error: 'Failed to create notification' });
  }
});

// ─── Notification Preferences ─────────────────────────────────────────────────

// GET /notifications/preferences
router.get('/preferences', async (req, res) => {
  try {
    let stored = {};
    try {
      const result = await pool.query(
        `SELECT type, in_app, email FROM notification_preferences WHERE user_id = $1`,
        [req.user.id]
      );
      for (const row of result.rows) stored[row.type] = row;
    } catch (err) {
      // Table may not exist if migration not run — return defaults
      console.warn('notification_preferences query failed (migration may not be applied):', err.message);
    }

    const prefs = NOTIFICATION_TYPES.map(type => ({
      type,
      in_app: stored[type]?.in_app ?? true,
      email: stored[type]?.email ?? false
    }));

    res.json({ success: true, data: prefs });
  } catch (error) {
    console.error('Preferences error:', error);
    res.status(500).json({ success: false, error: 'Failed to load preferences' });
  }
});

// PUT /notifications/preferences
router.put('/preferences', validateBody((body) => requireFields(body, ['type'])), async (req, res) => {
  try {
    const { type, in_app = true, email = false } = req.body;
    if (!NOTIFICATION_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${NOTIFICATION_TYPES.join(', ')}` });
    }

    await pool.query(
      `INSERT INTO notification_preferences (user_id, type, in_app, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, type) DO UPDATE SET in_app = $3, email = $4`,
      [req.user.id, type, Boolean(in_app), Boolean(email)]
    );

    res.json({ success: true });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({ success: false, error: 'Run migrations first.' });
    }
    console.error('Preferences update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

// GET /notifications/email-status — whether SMTP is configured (for UI)
router.get('/email-status', emailStatusRateLimiter, async (req, res) => {
  // Check env vars first (no DB cost)
  if (process.env.SMTP_HOST) {
    return res.json({ success: true, data: { configured: true, source: 'environment' } });
  }
  // Check org-level settings for the requesting user's organization
  const orgId = req.user?.organization_id;
  if (orgId) {
    try {
      const orgResult = await pool.query(
        `SELECT 1 FROM organization_settings
         WHERE organization_id = $1 AND setting_key = 'smtp_host'
           AND setting_value IS NOT NULL AND setting_value != '' LIMIT 1`,
        [orgId]
      );
      if (orgResult.rows.length > 0) {
        return res.json({ success: true, data: { configured: true, source: 'database' } });
      }
    } catch (err) {
      console.warn('Org SMTP setting lookup failed:', err.message);
    }
  }
  // Fall back to platform_settings (backward compat for existing deployments)
  try {
    const result = await pool.query(
      `SELECT 1 FROM platform_settings WHERE setting_key = 'smtp_host' AND setting_value IS NOT NULL AND setting_value != '' LIMIT 1`
    );
    return res.json({ success: true, data: { configured: result.rows.length > 0, source: result.rows.length > 0 ? 'database' : 'none' } });
  } catch (err) {
    console.warn('platform_settings SMTP lookup failed:', err.message);
    return res.json({ success: true, data: { configured: false, source: 'none' } });
  }
});

module.exports = router;
