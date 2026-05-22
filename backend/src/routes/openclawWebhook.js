'use strict';

const express = require('express');
const crypto = require('crypto');
const { log } = require('../utils/logger');

const router = express.Router();

function getRawBodyBuffer(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  return Buffer.from(JSON.stringify(req.body || {}), 'utf8');
}

function parseRequestBody(req) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length === 0) {
      return {};
    }

    return JSON.parse(req.body.toString('utf8'));
  }

  return req.body || {};
}

function verifySignature(req, res, next) {
  const secret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, error: 'Webhook not configured' });
  }

  const signature = String(req.headers['x-openclaw-signature'] || '').trim();
  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing signature' });
  }

  // SHA-384 = 96 hex chars (CNSA 1.0); legacy SHA-256 = 64 hex chars accepted
  // transitionally until senders are upgraded.
  if (!/^([a-fA-F0-9]{64}|[a-fA-F0-9]{96})$/.test(signature)) {
    return res.status(401).json({ success: false, error: 'Invalid signature' });
  }

  const provided = Buffer.from(signature, 'hex');
  const rawBody = getRawBodyBuffer(req);
  const valid = ['sha384', 'sha256'].some((alg) => {
    const expected = crypto.createHmac(alg, secret).update(rawBody).digest();
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  });

  if (!valid) {
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
  let body;
  try {
    body = parseRequestBody(req);
  } catch (_error) {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }

  const { event_type, payload } = body;

  if (event_type && !VALID_EVENTS.includes(event_type)) {
    log('warn', 'openclaw.webhook.unknown_event', { eventType: event_type });
  }

  log('info', 'openclaw.webhook.received', {
    eventType: event_type || null,
    payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    receivedAt: new Date().toISOString()
  });

  res.json({ success: true, received: true, event_type });
});

module.exports = router;
