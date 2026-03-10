// @tier: free
const crypto = require('crypto');
const net = require('net');
const pool = require('../config/database');

function createSignature(secret, payload) {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function isPrivateIpv4(ip) {
  const octets = ip.split('.').map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isFinite(octet))) return true;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

function isPrivateHostName(hostname) {
  const lower = String(hostname || '').trim().toLowerCase();
  if (!lower) return true;
  if (lower === 'localhost' || lower.endsWith('.local')) return true;
  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) return isPrivateIpv4(lower);
  if (ipVersion === 6) return isPrivateIpv6(lower);
  return false;
}

function validateWebhookTargetUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    throw new Error('target_url is required');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new Error('target_url must be a valid URL');
  }

  const allowHttp = String(process.env.WEBHOOK_ALLOW_HTTP || '').toLowerCase() === 'true';
  const allowPrivateHosts = String(process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS || '').toLowerCase() === 'true';

  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error('target_url must use HTTPS');
  }

  if (!allowPrivateHosts && isPrivateHostName(parsed.hostname)) {
    throw new Error('target_url cannot use localhost or private network hosts');
  }

  return parsed.toString();
}

async function enqueueWebhookEvent({ organizationId, eventType, payload }) {
  if (!organizationId || !eventType) return { enqueued: 0 };

  const subscriptionResult = await pool.query(
    `SELECT id, target_url, signing_secret, subscribed_events
     FROM webhook_subscriptions
     WHERE organization_id = $1
       AND active = true
       AND (
         subscribed_events @> ARRAY[$2]::text[]
         OR subscribed_events @> ARRAY['*']::text[]
       )`,
    [organizationId, eventType]
  );

  if (subscriptionResult.rows.length === 0) {
    return { enqueued: 0 };
  }

  let enqueued = 0;
  for (const sub of subscriptionResult.rows) {
    await pool.query(
      `INSERT INTO webhook_deliveries (
         organization_id, subscription_id, event_type, payload, delivery_status, attempt_count, next_attempt_at
       )
       VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, NOW())`,
      [organizationId, sub.id, eventType, JSON.stringify(payload || {})]
    );
    enqueued += 1;
  }

  return { enqueued };
}

async function processPendingWebhookDeliveries({ organizationId = null, limit = 25 } = {}) {
  const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 25));
  const params = [];
  let whereClause = `
    wd.delivery_status IN ('pending', 'failed')
    AND COALESCE(wd.next_attempt_at, NOW()) <= NOW()
  `;

  if (organizationId) {
    params.push(organizationId);
    whereClause += ` AND wd.organization_id = $${params.length}`;
  }

  params.push(boundedLimit);

  const result = await pool.query(
    `SELECT
       wd.id,
       wd.organization_id,
       wd.subscription_id,
       wd.event_type,
       wd.payload,
       wd.attempt_count,
       ws.target_url,
       ws.signing_secret
     FROM webhook_deliveries wd
     JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
     WHERE ${whereClause}
     ORDER BY wd.created_at ASC
     LIMIT $${params.length}`,
    params
  );

  let delivered = 0;
  let failed = 0;
  const errors = [];

  for (const row of result.rows) {
    const body = JSON.stringify({
      id: row.id,
      event: row.event_type,
      organization_id: row.organization_id,
      payload: row.payload || {},
      created_at: new Date().toISOString()
    });

    const signature = createSignature(row.signing_secret, body);
    const attemptCount = Number(row.attempt_count || 0) + 1;

    try {
      const targetUrl = validateWebhookTargetUrl(row.target_url);
      const controller = new AbortController();
      const timeoutMs = Math.max(1000, Number(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS || 15000));
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-GRC-Event': row.event_type,
            'X-GRC-Delivery-ID': row.id,
            ...(signature ? { 'X-GRC-Signature-SHA256': signature } : {})
          },
          body,
          signal: controller.signal
        });

        const responseText = await response.text();
        if (response.ok) {
          await pool.query(
            `UPDATE webhook_deliveries
             SET delivery_status = 'delivered',
                 attempt_count = $2,
                 http_status = $3,
                 response_body = $4,
                 delivered_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [row.id, attemptCount, response.status, responseText.slice(0, 4000)]
          );
          delivered += 1;
        } else {
          const retryMinutes = Math.min(60, Math.pow(2, Math.min(attemptCount, 6)));
          await pool.query(
            `UPDATE webhook_deliveries
             SET delivery_status = 'failed',
                 attempt_count = $2,
                 http_status = $3,
                 response_body = $4,
                 next_attempt_at = NOW() + ($5 || ' minutes')::interval,
                 updated_at = NOW()
             WHERE id = $1`,
            [row.id, attemptCount, response.status, responseText.slice(0, 4000), String(retryMinutes)]
          );
          failed += 1;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const retryMinutes = Math.min(60, Math.pow(2, Math.min(attemptCount, 6)));
      await pool.query(
        `UPDATE webhook_deliveries
         SET delivery_status = 'failed',
             attempt_count = $2,
             response_body = $3,
             next_attempt_at = NOW() + ($4 || ' minutes')::interval,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, attemptCount, String(error.message || error).slice(0, 4000), String(retryMinutes)]
      );
      failed += 1;
      errors.push({ deliveryId: row.id, error: error.message });
    }
  }

  return {
    attempted: result.rows.length,
    delivered,
    failed,
    errors
  };
}

module.exports = {
  validateWebhookTargetUrl,
  enqueueWebhookEvent,
  processPendingWebhookDeliveries
};
