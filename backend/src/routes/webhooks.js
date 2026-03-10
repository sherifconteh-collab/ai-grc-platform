// @tier: free
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { enqueueWebhookEvent, processPendingWebhookDeliveries, validateWebhookTargetUrl } = require('../services/webhookService');

router.use(authenticate);
router.use(requirePermission('settings.manage'));

// GET /api/v1/webhooks
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const subscriptions = await pool.query(
      `SELECT id, name, target_url, subscribed_events, active, created_at, updated_at
       FROM webhook_subscriptions
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: subscriptions.rows });
  } catch (error) {
    console.error('List webhook subscriptions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load webhook subscriptions' });
  }
});

// POST /api/v1/webhooks
router.post('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, target_url, signing_secret = null, subscribed_events = ['*'], active = true } = req.body || {};
    if (!name || !target_url) {
      return res.status(400).json({ success: false, error: 'name and target_url are required' });
    }
    const normalizedTargetUrl = validateWebhookTargetUrl(target_url);
    const events = Array.isArray(subscribed_events) && subscribed_events.length > 0 ? subscribed_events : ['*'];

    const inserted = await pool.query(
      `INSERT INTO webhook_subscriptions (
         organization_id, name, target_url, signing_secret, subscribed_events, active, created_by
       )
       VALUES ($1, $2, $3, $4, $5::text[], $6, $7)
       RETURNING id, name, target_url, subscribed_events, active, created_at, updated_at`,
      [orgId, name, normalizedTargetUrl, signing_secret, events, Boolean(active), req.user.id]
    );

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    console.error('Create webhook subscription error:', error);
    const isValidationError = String(error.message || '').includes('target_url');
    res.status(isValidationError ? 400 : 500).json({
      success: false,
      error: isValidationError ? 'Invalid target_url' : 'Failed to create webhook subscription'
    });
  }
});

// PATCH /api/v1/webhooks/:id
router.patch('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const patch = req.body || {};
    const normalizedTargetUrl = patch.target_url === undefined
      ? null
      : validateWebhookTargetUrl(patch.target_url);

    const updated = await pool.query(
      `UPDATE webhook_subscriptions
       SET name = COALESCE($3, name),
       target_url = COALESCE($4, target_url),
           signing_secret = COALESCE($5, signing_secret),
           subscribed_events = COALESCE($6::text[], subscribed_events),
           active = COALESCE($7, active),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING id, name, target_url, subscribed_events, active, created_at, updated_at`,
      [
        orgId,
        id,
        patch.name || null,
        normalizedTargetUrl,
        patch.signing_secret || null,
        patch.subscribed_events === undefined ? null : patch.subscribed_events,
        patch.active === undefined ? null : Boolean(patch.active)
      ]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
    }

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error('Update webhook subscription error:', error);
    const isValidationError = String(error.message || '').includes('target_url');
    res.status(isValidationError ? 400 : 500).json({
      success: false,
      error: isValidationError ? 'Invalid target_url' : 'Failed to update webhook subscription'
    });
  }
});

// DELETE /api/v1/webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const deleted = await pool.query(
      `DELETE FROM webhook_subscriptions
       WHERE organization_id = $1 AND id = $2
       RETURNING id`,
      [orgId, id]
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
    }
    res.json({ success: true, message: 'Webhook subscription deleted' });
  } catch (error) {
    console.error('Delete webhook subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete webhook subscription' });
  }
});

// GET /api/v1/webhooks/deliveries
router.get('/deliveries/list', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const result = await pool.query(
      `SELECT
         wd.id,
         wd.subscription_id,
         ws.name AS subscription_name,
         wd.event_type,
         wd.delivery_status,
         wd.attempt_count,
         wd.http_status,
         wd.response_body,
         wd.next_attempt_at,
         wd.delivered_at,
         wd.created_at,
         wd.updated_at
       FROM webhook_deliveries wd
       JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
       WHERE wd.organization_id = $1
       ORDER BY wd.created_at DESC
       LIMIT $2`,
      [orgId, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List webhook deliveries error:', error);
    res.status(500).json({ success: false, error: 'Failed to load webhook deliveries' });
  }
});

// POST /api/v1/webhooks/test
router.post('/test', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const eventType = req.body?.eventType || 'webhook.test';
    const payload = req.body?.payload || { message: 'Webhook test event' };

    const enqueueResult = await enqueueWebhookEvent({
      organizationId: orgId,
      eventType,
      payload: {
        ...payload,
        requested_by: req.user.email,
        requested_at: new Date().toISOString()
      }
    });

    const deliveryResult = await processPendingWebhookDeliveries({
      organizationId: orgId,
      limit: 100
    });

    res.json({
      success: true,
      data: {
        enqueue: enqueueResult,
        delivery: deliveryResult
      }
    });
  } catch (error) {
    console.error('Webhook test error:', error);
    res.status(500).json({ success: false, error: 'Failed to run webhook test' });
  }
});

// POST /api/v1/webhooks/process
router.post('/process', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.max(1, Math.min(200, Number(req.body?.limit) || 50));
    const result = await processPendingWebhookDeliveries({
      organizationId: orgId,
      limit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Process webhook queue error:', error);
    res.status(500).json({ success: false, error: 'Failed to process webhook queue' });
  }
});

module.exports = router;
