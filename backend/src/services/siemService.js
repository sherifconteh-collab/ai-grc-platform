// @tier: enterprise
'use strict';

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const dgram = require('dgram');
const net = require('net');
const tls = require('tls');
const pool = require('../config/database');
const { encrypt, decrypt } = require('../utils/encrypt');

function toPlainObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_err) {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// ─── Config management ────────────────────────────────────────────────────────

async function listSiemConfigs(organizationId) {
  const result = await pool.query(
    `SELECT id, name, provider, enabled, endpoint_url,
            splunk_index, elastic_index_prefix, syslog_host, syslog_port, syslog_protocol,
            event_filter, created_at, updated_at
     FROM siem_configurations
     WHERE organization_id = $1
     ORDER BY created_at`,
    [organizationId]
  );
  return result.rows;
}

async function getSiemConfig(organizationId, id) {
  const result = await pool.query(
    `SELECT * FROM siem_configurations WHERE id = $1 AND organization_id = $2`,
    [id, organizationId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  // Decrypt sensitive fields for internal use
  if (row.api_key && row.is_key_encrypted) row.api_key = decrypt(row.api_key);
  if (row.webhook_secret && row.is_secret_encrypted) row.webhook_secret = decrypt(row.webhook_secret);
  return row;
}

async function saveSiemConfig(organizationId, data) {
  const {
    id, name, provider, enabled, endpoint_url, api_key, splunk_index,
    splunk_sourcetype, elastic_index_prefix, elastic_pipeline,
    syslog_host, syslog_port, syslog_protocol, webhook_secret,
    webhook_headers, event_filter,
  } = data;

  let storedKey = api_key || null;
  let keyEncrypted = false;
  if (storedKey) { storedKey = encrypt(storedKey); keyEncrypted = true; }

  let storedSecret = webhook_secret || null;
  let secretEncrypted = false;
  if (storedSecret) { storedSecret = encrypt(storedSecret); secretEncrypted = true; }

  if (id) {
    // Update existing
    await pool.query(
      `UPDATE siem_configurations SET
         name=$2, provider=$3, enabled=$4, endpoint_url=$5,
         api_key=CASE WHEN $6::text IS NOT NULL THEN $6 ELSE api_key END,
         is_key_encrypted=CASE WHEN $6::text IS NOT NULL THEN $7 ELSE is_key_encrypted END,
         splunk_index=$8, splunk_sourcetype=$9,
         elastic_index_prefix=$10, elastic_pipeline=$11,
         syslog_host=$12, syslog_port=$13, syslog_protocol=$14,
         webhook_secret=CASE WHEN $15::text IS NOT NULL THEN $15 ELSE webhook_secret END,
         is_secret_encrypted=CASE WHEN $15::text IS NOT NULL THEN $16 ELSE is_secret_encrypted END,
         webhook_headers=$17, event_filter=$18, updated_at=NOW()
       WHERE id=$1 AND organization_id=$19`,
      [id, name, provider, enabled !== false, endpoint_url || null,
       storedKey, keyEncrypted, splunk_index || null, splunk_sourcetype || '_json',
       elastic_index_prefix || 'controlweave', elastic_pipeline || null,
       syslog_host || null, syslog_port || 514, syslog_protocol || 'udp',
       storedSecret, secretEncrypted, webhook_headers ? JSON.stringify(webhook_headers) : '{}',
       event_filter || ['*'], organizationId]
    );
    return id;
  }

  const result = await pool.query(
    `INSERT INTO siem_configurations
       (organization_id, name, provider, enabled, endpoint_url, api_key, is_key_encrypted,
        splunk_index, splunk_sourcetype, elastic_index_prefix, elastic_pipeline,
        syslog_host, syslog_port, syslog_protocol,
        webhook_secret, is_secret_encrypted, webhook_headers, event_filter)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [organizationId, name, provider, enabled !== false, endpoint_url || null,
     storedKey, keyEncrypted, splunk_index || null, splunk_sourcetype || '_json',
     elastic_index_prefix || 'controlweave', elastic_pipeline || null,
     syslog_host || null, syslog_port || 514, syslog_protocol || 'udp',
     storedSecret, secretEncrypted, webhook_headers ? JSON.stringify(webhook_headers) : '{}',
     event_filter || ['*']]
  );
  return result.rows[0].id;
}

async function deleteSiemConfig(organizationId, id) {
  const result = await pool.query(
    `DELETE FROM siem_configurations WHERE id = $1 AND organization_id = $2 RETURNING id`,
    [id, organizationId]
  );
  return result.rowCount > 0;
}

// ─── Event forwarding ─────────────────────────────────────────────────────────

async function forwardEvent(organizationId, eventType, payload) {
  const configs = await pool.query(
    `SELECT * FROM siem_configurations
     WHERE organization_id = $1 AND enabled = true
       AND ($2 = ANY(event_filter) OR '*' = ANY(event_filter))`,
    [organizationId, eventType]
  );

  const results = [];
  for (const cfg of configs.rows) {
    if (cfg.api_key && cfg.is_key_encrypted) cfg.api_key = decrypt(cfg.api_key);
    if (cfg.webhook_secret && cfg.is_secret_encrypted) cfg.webhook_secret = decrypt(cfg.webhook_secret);

    try {
      let result;
      if (cfg.provider === 'splunk') result = await sendToSplunk(cfg, eventType, payload);
      else if (cfg.provider === 'elastic') result = await sendToElastic(cfg, eventType, payload);
      else if (cfg.provider === 'webhook') result = await sendToWebhook(cfg, eventType, payload);
      else if (cfg.provider === 'syslog') result = await sendToSyslog(cfg, eventType, payload);
      results.push({ id: cfg.id, provider: cfg.provider, ok: true, detail: result });
    } catch (err) {
      results.push({ id: cfg.id, provider: cfg.provider, ok: false, error: err.message });
    }
  }
  return results;
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function sendToSplunk(cfg, eventType, payload) {
  const body = JSON.stringify({
    time: Math.floor(Date.now() / 1000),
    sourcetype: cfg.splunk_sourcetype || '_json',
    index: cfg.splunk_index || 'main',
    event: { event_type: eventType, ...payload },
  });
  return httpPost(cfg.endpoint_url, body, {
    Authorization: `Splunk ${cfg.api_key}`,
    'Content-Type': 'application/json',
  });
}

async function sendToElastic(cfg, eventType, payload) {
  const indexName = `${cfg.elastic_index_prefix || 'controlweave'}-${new Date().toISOString().slice(0, 7)}`;
  const pipelineQuery = cfg.elastic_pipeline
    ? `?pipeline=${encodeURIComponent(cfg.elastic_pipeline)}`
    : '';
  const url = `${cfg.endpoint_url.replace(/\/$/, '')}/${indexName}/_doc${pipelineQuery}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(cfg.api_key ? { Authorization: `ApiKey ${cfg.api_key}` } : {}),
  };
  const body = JSON.stringify({ '@timestamp': new Date().toISOString(), event_type: eventType, ...payload });
  return httpPost(url, body, headers);
}

async function sendToWebhook(cfg, eventType, payload) {
  const body = JSON.stringify({ event_type: eventType, timestamp: new Date().toISOString(), ...payload });
  const headers = {
    'Content-Type': 'application/json',
    ...(cfg.api_key ? { Authorization: `Bearer ${cfg.api_key}` } : {}),
    ...toPlainObject(cfg.webhook_headers),
  };
  if (cfg.webhook_secret) {
    const sig = crypto.createHmac('sha256', cfg.webhook_secret).update(body).digest('hex');
    headers['X-ControlWeave-Signature'] = `sha256=${sig}`;
  }
  return httpPost(cfg.endpoint_url, body, headers);
}

function sendToSyslog(cfg, eventType, payload) {
  return new Promise((resolve, reject) => {
    const msg = `<134>${new Date().toISOString()} controlweave ${eventType} ${JSON.stringify(payload)}\n`;
    const buf = Buffer.from(msg, 'utf8');
    const host = cfg.syslog_host || 'localhost';
    const port = cfg.syslog_port || 514;
    const proto = cfg.syslog_protocol || 'udp';

    if (proto === 'udp') {
      const client = dgram.createSocket('udp4');
      client.send(buf, port, host, (err) => {
        client.close();
        if (err) reject(err); else resolve('sent');
      });
      return;
    }

    if (proto === 'tls') {
      const socket = tls.connect({ host, port, servername: host }, () => {
        socket.write(buf, () => { socket.end(); resolve('sent'); });
      });
      socket.on('error', reject);
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('syslog TLS timeout')); });
      return;
    }

    {
      const socket = net.createConnection(port, host, () => {
        socket.write(buf, () => { socket.end(); resolve('sent'); });
      });
      socket.on('error', reject);
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('syslog TCP timeout')); });
    }
  });
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Test connectivity ────────────────────────────────────────────────────────

async function testSiemConfig(organizationId, id) {
  const cfg = await getSiemConfig(organizationId, id);
  if (!cfg) throw Object.assign(new Error('Config not found.'), { statusCode: 404 });
  const testEvent = { source: 'controlweave', message: 'Test event from ControlWeave', test: true };
  return forwardEventDirect(cfg, 'siem.test', testEvent);
}

async function forwardEventDirect(cfg, eventType, payload) {
  if (cfg.provider === 'splunk') return sendToSplunk(cfg, eventType, payload);
  if (cfg.provider === 'elastic') return sendToElastic(cfg, eventType, payload);
  if (cfg.provider === 'webhook') return sendToWebhook(cfg, eventType, payload);
  if (cfg.provider === 'syslog') return sendToSyslog(cfg, eventType, payload);
  throw new Error('Unknown provider');
}

module.exports = {
  listSiemConfigs,
  getSiemConfig,
  saveSiemConfig,
  deleteSiemConfig,
  forwardEvent,
  testSiemConfig,
};
