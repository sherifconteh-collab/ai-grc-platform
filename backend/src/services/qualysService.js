// Qualys VMDR connector — queries vulnerability detections and normalizes them.
'use strict';

const https = require('https');
const { URL } = require('url');

function severityFromQualys(severity) {
  const s = parseInt(severity, 10);
  if (s >= 5) return 'critical';
  if (s === 4) return 'high';
  if (s === 3) return 'medium';
  if (s <= 2) return 'low';
  return 'informational';
}

async function qualysRequest(config, path) {
  const baseUrl = new URL(config.baseUrl);
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseUrl.hostname,
      path,
      method: 'GET',
      timeout: 30000,
      headers: {
        'Authorization': `Basic ${auth}`,
        'X-Requested-With': 'ControlWeave',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`Qualys API returned HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          resolve(JSON.parse(body));
        } catch (parseErr) {
          reject(new Error(`Qualys response parse error: ${parseErr.message}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Qualys request timed out')); });
    req.on('error', reject);
    req.end();
  });
}

async function syncFindings(connectorConfig) {
  try {
    const tagFilter = connectorConfig.tagIds ? `&tag_id=${connectorConfig.tagIds}` : '';
    const data = await qualysRequest(
      connectorConfig,
      `/api/2.0/fo/asset/host/vm/detection/?action=list&output_format=JSON&status=Active${tagFilter}`
    );
    const hostList = data?.HOST_LIST_VM_DETECTION_OUTPUT?.RESPONSE?.HOST_LIST?.HOST || [];
    const hosts = Array.isArray(hostList) ? hostList : [hostList];
    const findings = [];
    for (const host of hosts) {
      const detections = host.DETECTION_LIST?.DETECTION || [];
      const dets = Array.isArray(detections) ? detections : [detections];
      for (const det of dets) {
        if (!det.QID) continue;
        findings.push({
          external_id: `${host.ID}-${det.QID}`,
          title: det.RESULTS || `QID ${det.QID}`,
          severity: severityFromQualys(det.SEVERITY),
          status: String(det.STATUS || '').toLowerCase() === 'fixed' ? 'resolved' : 'open',
          raw_data: { host_id: host.ID, qid: det.QID, ...det }
        });
      }
    }
    return { findings };
  } catch (error) {
    return { error: error.message, findings: [] };
  }
}

module.exports = { syncFindings };
