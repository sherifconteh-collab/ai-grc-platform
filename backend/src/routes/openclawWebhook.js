'use strict';

const express = require('express');
const crypto = require('crypto');
const { log } = require('../utils/logger');

const router = express.Router();

function verifySignature(req, res, next) {
  const secret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, error: 'Webhook not configured' });
  }

  const signature = req.headers['x-openclaw-signature'];
  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing signature' });
  }

  // Use raw body bytes for HMAC verification (avoids JSON serialization inconsistencies)
  if (!req.rawBody) {
    log('warn', 'openclaw.missing_raw_body', { message: 'Raw body not available; HMAC verification may be unreliable' });
  }
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ success: false, error: 'Invalid signature' });
  }

  next();
}

router.use(verifySignature);

const VALID_EVENTS = [
  'demo.sent',
  'issue.escalated',
  'summary.generated',
  'lead.qualified',
  'issue.created',
  'lead.logged',
  'alert.posted',
  'post.published'
];

// POST /api/v1/openclaw/webhook
router.post('/', (req, res) => {
  const { event_type, payload } = req.body || {};

  if (event_type && !VALID_EVENTS.includes(event_type)) {
    log('warn', 'openclaw.unknown_event', { event_type });
  }

  log('info', 'openclaw.webhook_received', {
    event_type,
    payload_keys: payload ? Object.keys(payload) : [],
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, received: true, event_type });
});

module.exports = router;
