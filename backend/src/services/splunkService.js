// @tier: pro
const pool = require('../config/database');

const SPLUNK_SETTING_KEYS = {
  baseUrl: 'splunk_base_url',
  apiToken: 'splunk_api_token',
  defaultIndex: 'splunk_default_index'
};

function normalizeBaseUrl(input) {
  if (!input || typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const parsed = new URL(value);
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    throw new Error('Invalid Splunk base URL');
  }
}

function parseSplunkError(payload, status) {
  const messages = payload?.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const details = messages
      .map((item) => item?.text || item?.message || '')
      .filter(Boolean)
      .join('; ');
    if (details) return details;
  }
  if (payload?.error) return payload.error;
  return `Splunk request failed (${status})`;
}

async function getOrgSplunkSettings(organizationId) {
  const result = await pool.query(
    `SELECT setting_key, setting_value, updated_at
     FROM organization_settings
     WHERE organization_id = $1
       AND setting_key IN ($2, $3, $4)`,
    [organizationId, SPLUNK_SETTING_KEYS.baseUrl, SPLUNK_SETTING_KEYS.apiToken, SPLUNK_SETTING_KEYS.defaultIndex]
  );

  const data = {
    baseUrl: null,
    apiToken: null,
    defaultIndex: null,
    updatedAt: null
  };

  for (const row of result.rows) {
    if (row.setting_key === SPLUNK_SETTING_KEYS.baseUrl) data.baseUrl = row.setting_value;
    if (row.setting_key === SPLUNK_SETTING_KEYS.apiToken) data.apiToken = row.setting_value;
    if (row.setting_key === SPLUNK_SETTING_KEYS.defaultIndex) data.defaultIndex = row.setting_value;
    if (!data.updatedAt || row.updated_at > data.updatedAt) data.updatedAt = row.updated_at;
  }

  return data;
}

async function upsertOrgSetting(organizationId, key, value, encrypted = false) {
  if (value === undefined) return;
  if (value === null || value === '') {
    await pool.query(
      'DELETE FROM organization_settings WHERE organization_id = $1 AND setting_key = $2',
      [organizationId, key]
    );
    return;
  }
  await pool.query(
    `INSERT INTO organization_settings (organization_id, setting_key, setting_value, is_encrypted, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (organization_id, setting_key)
     DO UPDATE SET setting_value = $3, is_encrypted = $4, updated_at = NOW()`,
    [organizationId, key, String(value), encrypted]
  );
}

async function saveOrgSplunkSettings(organizationId, { baseUrl, apiToken, defaultIndex }) {
  const normalizedBaseUrl = baseUrl === undefined ? undefined : normalizeBaseUrl(baseUrl);
  await upsertOrgSetting(organizationId, SPLUNK_SETTING_KEYS.baseUrl, normalizedBaseUrl, false);
  await upsertOrgSetting(organizationId, SPLUNK_SETTING_KEYS.apiToken, apiToken, true);
  await upsertOrgSetting(organizationId, SPLUNK_SETTING_KEYS.defaultIndex, defaultIndex, false);
  return getOrgSplunkSettings(organizationId);
}

function maskToken(token) {
  if (!token) return null;
  const suffix = token.length > 4 ? token.slice(-4) : token;
  return `****${suffix}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function splunkRequest(config, method, path, { query, formBody } = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.SPLUNK_REQUEST_TIMEOUT_MS || 30000);
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const url = new URL(path, `${config.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Authorization: `Bearer ${config.apiToken}`
    };

    let body;
    if (formBody) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(formBody).toString();
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      signal: controller.signal
    });

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (error) {
      parsed = { raw };
    }

    if (!response.ok) {
      throw new Error(parseSplunkError(parsed, response.status));
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchQuery(search, defaultIndex) {
  const trimmed = String(search || '').trim();
  if (!trimmed) throw new Error('search is required');
  if (/^\s*(search|index=)/i.test(trimmed)) return trimmed;
  if (defaultIndex) return `search index=${defaultIndex} ${trimmed}`;
  return `search ${trimmed}`;
}

function parseJobDone(payload) {
  const value = payload?.entry?.[0]?.content?.isDone;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.toLowerCase() === '1' || value.toLowerCase() === 'true';
  return false;
}

function extractServerInfo(payload) {
  const info = payload?.entry?.[0]?.content || {};
  return {
    serverName: info.serverName || info.server_name || null,
    version: info.version || null,
    build: info.build || null
  };
}

async function testConnection(config) {
  const payload = await splunkRequest(config, 'GET', '/services/server/info', {
    query: { output_mode: 'json' }
  });
  return extractServerInfo(payload);
}

async function runSearch(config, {
  search,
  earliestTime,
  latestTime,
  maxEvents = 200
}) {
  const normalizedSearch = buildSearchQuery(search, config.defaultIndex);

  const createPayload = await splunkRequest(config, 'POST', '/services/search/jobs', {
    formBody: {
      search: normalizedSearch,
      output_mode: 'json',
      earliest_time: earliestTime || '-24h@h',
      latest_time: latestTime || 'now',
      exec_mode: 'normal'
    }
  });

  const sid = createPayload?.sid || createPayload?.entry?.[0]?.content?.sid;
  if (!sid) {
    throw new Error('Splunk did not return a search id (sid)');
  }

  const startedAt = Date.now();
  const maxWaitMs = Number(process.env.SPLUNK_SEARCH_MAX_WAIT_MS || 30000);
  while (Date.now() - startedAt < maxWaitMs) {
    const statusPayload = await splunkRequest(config, 'GET', `/services/search/jobs/${encodeURIComponent(sid)}`, {
      query: { output_mode: 'json' }
    });
    if (parseJobDone(statusPayload)) break;
    await sleep(750);
  }

  const resultsPayload = await splunkRequest(config, 'GET', `/services/search/jobs/${encodeURIComponent(sid)}/results`, {
    query: {
      output_mode: 'json',
      count: Math.max(1, Math.min(2000, Number(maxEvents) || 200))
    }
  });

  const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];

  // Best-effort cancel/finalize to reduce stale jobs.
  splunkRequest(config, 'POST', `/services/search/jobs/${encodeURIComponent(sid)}/control`, {
    formBody: { action: 'finalize', output_mode: 'json' }
  }).catch(() => {});

  return {
    sid,
    search: normalizedSearch,
    results
  };
}

module.exports = {
  SPLUNK_SETTING_KEYS,
  normalizeBaseUrl,
  getOrgSplunkSettings,
  saveOrgSplunkSettings,
  maskToken,
  testConnection,
  runSearch
};
