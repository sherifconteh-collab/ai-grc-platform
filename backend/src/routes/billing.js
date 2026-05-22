// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');

const OPEN_SOURCE_RESPONSE = {
  tier: 'open',
  billing_status: 'open_source',
  billing_enabled: false,
  message: 'ControlWeaver is open source — no subscription required.'
};

router.get('/config', authenticate, (_req, res) => {
  res.json({ success: true, data: { stripe_publishable_key: null, billing_enabled: false } });
});

router.get('/subscription', authenticate, (_req, res) => {
  res.json({ success: true, data: OPEN_SOURCE_RESPONSE });
});

router.post('/downgrade-to-free', authenticate, (_req, res) => {
  res.json({ success: true, message: 'All features are free — no downgrade needed.' });
});

router.post('/checkout', authenticate, (_req, res) => {
  res.status(410).json({ success: false, error: 'Billing is not available. ControlWeaver is open source.' });
});

router.post('/portal', authenticate, (_req, res) => {
  res.status(410).json({ success: false, error: 'Billing is not available. ControlWeaver is open source.' });
});

router.post('/cancel', authenticate, requirePermission('settings.manage'), (_req, res) => {
  res.json({ success: true, message: 'No active subscription to cancel.' });
});

router.post('/change-plan', authenticate, (_req, res) => {
  res.status(410).json({ success: false, error: 'Billing is not available. ControlWeaver is open source.' });
});

router.post('/activate-license', authenticate, requirePermission('settings.manage'), (_req, res) => {
  res.json({ success: true, message: 'ControlWeaver is open source — all features are unlocked.' });
});

router.post('/mobile-upgrade', authenticate, (_req, res) => {
  res.status(410).json({ success: false, error: 'Billing is not available. ControlWeaver is open source.' });
});

router.post('/webhook', (_req, res) => {
  res.json({ received: true });
});

module.exports = router;
