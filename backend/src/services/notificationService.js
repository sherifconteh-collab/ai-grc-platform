// @tier: community
'use strict';

const pool = require('../config/database');

/**
 * Create a notification for one user or broadcast to the whole org.
 * @param {string} orgId
 * @param {string|null} userId  - null = broadcast to all org users
 * @param {string} type         - control_due | assessment_needed | status_change | system | crosswalk
 * @param {string} title
 * @param {string} message
 * @param {string|null} link    - optional deep link
 */
async function createNotification(orgId, userId, type, title, message, link = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, userId || null, type, title, message, link || null]
    );

    // Optionally send email if user has preferences set
    try {
      await maybeEmail(orgId, userId, type, title, message, link);
    } catch {
      // Email errors never block the in-app notification
    }
  } catch (err) {
    console.error('[notificationService] Failed to create notification:', err.message);
  }
}

/**
 * Send email notification if the user has email preferences enabled for this type.
 */
async function maybeEmail(orgId, userId, type, title, message, link) {
  let emailService;
  try {
    emailService = require('./emailService');
  } catch {
    return; // emailService not available or SMTP not configured
  }

  if (!userId) {
    // Broadcast: fetch all admin users in the org
    const users = await pool.query(
      `SELECT u.id,
              u.email,
              TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name
       FROM users u
       WHERE u.organization_id = $1
         AND u.role = 'admin'
         AND u.is_active = true`,
      [orgId]
    );
    for (const user of users.rows) {
      const prefs = await getUserPreferences(user.id, type);
      if (prefs.email) {
        await emailService.sendNotificationEmail(user, { title, message, link }, orgId);
      }
    }
  } else {
    const userResult = await pool.query(
      `SELECT id,
              email,
              TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS full_name
       FROM users
       WHERE id = $1
         AND is_active = true`,
      [userId]
    );
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const prefs = await getUserPreferences(userId, type);
      if (prefs.email) {
        await emailService.sendNotificationEmail(user, { title, message, link }, orgId);
      }
    }
  }
}

/**
 * Get notification preferences for a user+type (defaults: in_app=true, email=false).
 */
async function getUserPreferences(userId, type) {
  try {
    const result = await pool.query(
      `SELECT in_app, email FROM notification_preferences WHERE user_id = $1 AND type = $2`,
      [userId, type]
    );
    if (result.rows.length > 0) return result.rows[0];
  } catch {
    // Table may not exist yet (migration not run)
  }
  return { in_app: true, email: false };
}

module.exports = { createNotification };
