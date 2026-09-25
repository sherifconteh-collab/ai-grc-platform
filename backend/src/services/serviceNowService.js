// ITSM connector — queries incidents and change requests. // ip-hygiene:ignore
'use strict';

const https = require('https');
const { assertSafeUrl, guardedLookup } = require('../utils/netGuard');

// Table names go into the request path.
const TABLE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

const PRIORITY_MAP = { '1': 'critical', '2': 'high', '3': 'medium', '4': 'low', '5': 'low' };

function severityFromPriority(priority) {
  return PRIORITY_MAP[String(priority)] || 'medium';
}

async function snowRequest(config, table, params) {
  if (!TABLE_PATTERN.test(String(table))) throw new Error('Invalid ServiceNow table name');
  // The instance URL is tenant-supplied: refuse private-network targets.
  const base = await assertSafeUrl(config.instanceUrl);
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const qs = new URLSearchParams({ sysparm_limit: '200', sysparm_display_value: 'true', ...params }).toString();
  return new Promise((resolve, reject) => {
    const options = {
      hostname: base.hostname,
      port: base.port || undefined,
      // Resolve and check again at connect time, so the name cannot be
      // re-pointed at a private address after assertSafeUrl (DNS rebinding).
      lookup: guardedLookup,
      path: `/api/now/table/${table}?${qs}`,
      method: 'GET',
      timeout: 30000,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`ServiceNow API returned HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { return reject(new Error('ServiceNow response parse error')); }
        // A reply without a result list is an error, not an empty sync.
        if (!data || !Array.isArray(data.result)) return reject(new Error('ServiceNow response did not contain a result list'));
        resolve(data);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('ServiceNow request timed out')); });
    req.on('error', reject);
    req.end();
  });
}

async function syncFindings(connectorConfig) {
  try {
    const changeTable = connectorConfig.changeTableName || 'change_request';
    const incidentTable = connectorConfig.incidentTableName || 'incident';
    const findings = [];

    const changes = await snowRequest(connectorConfig, changeTable, {
      sysparm_query: 'stateIN-1^ORstate=3',
      sysparm_fields: 'sys_id,number,short_description,priority,state,opened_at,closed_at'
    });
    for (const c of changes.result) {
      findings.push({
        external_id: `change-${c.sys_id}`,
        title: c.short_description || c.number || 'Change Request',
        severity: severityFromPriority(c.priority?.value || c.priority),
        status: String(c.state?.value || c.state) === '3' ? 'resolved' : 'open',
        raw_data: { type: 'change_request', ...c }
      });
    }

    const incidents = await snowRequest(connectorConfig, incidentTable, {
      sysparm_query: 'active=true',
      sysparm_fields: 'sys_id,number,short_description,priority,state,opened_at,resolved_at'
    });
    for (const inc of incidents.result) {
      findings.push({
        external_id: `incident-${inc.sys_id}`,
        title: inc.short_description || inc.number || 'Incident',
        severity: severityFromPriority(inc.priority?.value || inc.priority),
        status: String(inc.state?.value || inc.state) === 'Resolved' ? 'resolved' : 'open',
        raw_data: { type: 'incident', ...inc }
      });
    }

    return { findings };
  } catch (error) {
    return { error: error.message, findings: [] };
  }
}

module.exports = { syncFindings };
