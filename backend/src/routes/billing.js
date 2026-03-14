// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 60, label: 'billing-route' }));

router.post('/checkout', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { url: null, message: 'Billing not yet configured. Please contact support.' }
    });
  } catch (error) {
    console.error('Billing checkout error:', error);
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

router.post('/portal', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { url: null, message: 'Billing portal not yet configured' }
    });
  } catch (error) {
    console.error('Billing portal error:', error);
    res.status(500).json({ success: false, error: 'Failed to create portal session' });
  }
});

router.get('/subscription', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM billing_subscriptions WHERE organization_id = $1',
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscription' });
  }
});

router.post('/change-plan', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { message: 'Plan change not yet configured' }
    });
  } catch (error) {
    console.error('Change plan error:', error);
    res.status(500).json({ success: false, error: 'Failed to change plan' });
  }
});

router.post('/cancel', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { message: 'Cancellation not yet configured' }
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

router.post('/downgrade-to-free', async (req, res) => {
  try {
    res.json({
      success: true,
      data: { message: 'Downgrade not yet configured' }
    });
  } catch (error) {
    console.error('Downgrade error:', error);
    res.status(500).json({ success: false, error: 'Failed to downgrade subscription' });
  }
});

module.exports = router;
