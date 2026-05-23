// @tier: enterprise
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const {
  getOrganizationOnlineCount,
  getOnlineUserIds,
  isUserOnline,
  getRedisAdapterStatus
} = require('../services/websocketService');

router.use(authenticate);

// GET /realtime/status - WebSocket server status
router.get('/status', async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const userId = req.user.id;
    
    const onlineCount = getOrganizationOnlineCount(organizationId);
    const userIsOnline = isUserOnline(userId);
    const redisStatus = getRedisAdapterStatus();

    res.json({
      success: true,
      data: {
        connected: userIsOnline,
        organizationOnlineCount: onlineCount,
        adapter: {
          mode: redisStatus.mode,
          redis: {
            status: redisStatus.status,
            required: redisStatus.required,
            configured: redisStatus.configured,
            ...(redisStatus.error ? { error: redisStatus.error } : {})
          }
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('WebSocket status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get WebSocket status' });
  }
});

// GET /realtime/online-users - Get list of online users in organization
router.get('/online-users', requirePermission('users.read'), async (req, res) => {
  try {
    const organizationId = req.user.organization_id;
    const onlineUserIds = getOnlineUserIds();
    
    // If there are no online users, avoid running the query
    if (!onlineUserIds || onlineUserIds.length === 0) {
      return res.json({
        success: true,
        data: {
          users: [],
          count: 0
        }
      });
    }

    // Pagination parameters: limit and offset
    const DEFAULT_LIMIT = 100;
    const MAX_LIMIT = 500;

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit <= 0) {
      limit = DEFAULT_LIMIT;
    } else if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }

    let offset = parseInt(req.query.offset, 10);
    if (Number.isNaN(offset) || offset < 0) {
      offset = 0;
    }
    
    // Fetch user details for online users in this organization with pagination
    const result = await pool.query(
      `SELECT id, email, name 
       FROM users 
       WHERE id = ANY($1) AND organization_id = $2
       ORDER BY id
       LIMIT $3 OFFSET $4`,
      [onlineUserIds, organizationId, limit, offset]
    );
    
    res.json({
      success: true,
      data: {
        users: result.rows,
        count: result.rows.length,
        total: onlineUserIds.length,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('Online users error:', error);
    res.status(500).json({ success: false, error: 'Failed to get online users' });
  }
});

// POST /realtime/push-subscription - Subscribe to push notifications
router.post('/push-subscription', validateBody((body) => {
  return requireFields(body, ['endpoint', 'keys']);
}), async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    const { p256dh, auth } = keys;
    
    if (!p256dh || !auth) {
      return res.status(400).json({ 
        success: false, 
        error: 'keys.p256dh and keys.auth are required' 
      });
    }
    
    const userAgent = req.headers['user-agent'] || null;
    
    // Insert or update subscription
    await pool.query(
      `INSERT INTO push_subscriptions 
       (user_id, organization_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, endpoint) 
       DO UPDATE SET 
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         last_used_at = NOW()`,
      [req.user.id, req.user.organization_id, endpoint, p256dh, auth, userAgent]
    );
    
    res.json({ 
      success: true,
      message: 'Push subscription saved successfully'
    });
  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to save push subscription' });
  }
});

// DELETE /realtime/push-subscription - Unsubscribe from push notifications
router.delete('/push-subscription', validateBody((body) => {
  return requireFields(body, ['endpoint']);
}), async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.user.id, endpoint]
    );
    
    res.json({ 
      success: true,
      message: 'Push subscription removed successfully'
    });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove push subscription' });
  }
});

// GET /realtime/push-subscriptions - Get user's push subscriptions
router.get('/push-subscriptions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, endpoint, user_agent, created_at, last_used_at 
       FROM push_subscriptions 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get push subscriptions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get push subscriptions' });
  }
});

module.exports = router;
