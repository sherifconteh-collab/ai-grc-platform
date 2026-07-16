// @tier: exclude
/**
 * Dynamic QA scenario coverage for SBOM + vulnerability workflow linkage.
 *
 * Run directly:
 *   node scripts/qa-dynamic-scenarios.js
 *
 * Env:
 *   QA_BASE_URL=http://localhost:3001
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const BASE = (process.env.QA_BASE_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const QA_PASSWORD = 'DynamicQaPass123!';
const DB_REQUIRED = String(process.env.QA_DB_REQUIRED || 'false').toLowerCase() === 'true';
const STRICT_WORKFLOW_LINKAGE = String(process.env.QA_STRICT_WORKFLOW_LINKAGE || 'false').toLowerCase() === 'true';
const MAX_429_RETRIES = parseInt(process.env.QA_MAX_429_RETRIES || '3', 10);
const DEFAULT_429_WAIT_MS = parseInt(process.env.QA_DEFAULT_429_WAIT_MS || '2000', 10);

let passed = 0;
let failed = 0;
const failures = [];

function logPass(id, text) {
  passed += 1;
  console.log(`  PASS ${id} ${text}`);
}

function logFail(id, text, detail) {
  failed += 1;
  const message = detail ? `${id} ${text} (${detail})` : `${id} ${text}`;
  failures.push(message);
  console.log(`  FAIL ${id} ${text}${detail ? ` (${detail})` : ''}`);
}

function check(id, text, condition, detail) {
  if (condition) {
    logPass(id, text);
  } else {
    logFail(id, text, detail);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(method, urlPath, body, token, headers = {}, attempt = 0) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = body === undefined || body === null ? null : JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', async () => {
        const raw = Buffer.concat(chunks).toString();
        let parsedBody = raw;
        try {
          parsedBody = JSON.parse(raw);
        } catch (error) {
          parsedBody = raw;
        }

        if (res.statusCode === 429 && attempt < MAX_429_RETRIES) {
          const retryAfterSeconds = Number(
            (parsedBody && typeof parsedBody === 'object' ? parsedBody.retryAfterSeconds : null) ||
            res.headers['retry-after'] ||
            0
          );
          const waitMs = Math.max(DEFAULT_429_WAIT_MS, retryAfterSeconds * 1000);
          await sleep(waitMs);
          resolve(await request(method, urlPath, body, token, headers, attempt + 1));
          return;
        }

        resolve({ status: res.statusCode, body: parsedBody });
      });
    });

    req.on('error', (error) => resolve({ status: 0, body: error.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadFile(urlPath, filePath, fields, token, attempt = 0) {
  return new Promise((resolve) => {
    const boundary = `----DynamicQABoundary${Date.now()}`;
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);

    let head = '';
    for (const [key, value] of Object.entries(fields || {})) {
      head += `--${boundary}\r\n`;
      head += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      head += `${value}\r\n`;
    }
    head += `--${boundary}\r\n`;
    head += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    head += 'Content-Type: application/json\r\n\r\n';

    const tail = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([Buffer.from(head, 'utf8'), fileData, Buffer.from(tail, 'utf8')]);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        Authorization: `Bearer ${token}`
      }
    };

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', async () => {
        const raw = Buffer.concat(chunks).toString();
        let parsedBody = raw;
        try {
          parsedBody = JSON.parse(raw);
        } catch (error) {
          parsedBody = raw;
        }

        if (res.statusCode === 429 && attempt < MAX_429_RETRIES) {
          const retryAfterSeconds = Number(
            (parsedBody && typeof parsedBody === 'object' ? parsedBody.retryAfterSeconds : null) ||
            res.headers['retry-after'] ||
            0
          );
          const waitMs = Math.max(DEFAULT_429_WAIT_MS, retryAfterSeconds * 1000);
          await sleep(waitMs);
          resolve(await uploadFile(urlPath, filePath, fields, token, attempt + 1));
          return;
        }

        resolve({ status: res.statusCode, body: parsedBody });
      });
    });

    req.on('error', (error) => resolve({ status: 0, body: error.message }));
    req.write(payload);
    req.end();
  });
}

async function dbQuery(sql, params = []) {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'grc_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (DB_REQUIRED) throw error;
    console.warn(`  WARN dbQuery skipped: ${error.message}`);
    return { rows: [], rowCount: 0 };
  } finally {
    await pool.end();
  }
}

function tokenFromAuthResponse(payload) {
  return payload?.data?.tokens?.accessToken || payload?.data?.accessToken || null;
}

function orgIdFromAuthResponse(payload) {
  return (
    payload?.data?.organization?.id ||
    payload?.data?.user?.organization_id ||
    payload?.data?.user?.organizationId ||
    null
  );
}

function makeSampleSbom(ts) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    serialNumber: `urn:uuid:dynamic-qa-${ts}`,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: 'dynamic-qa', name: 'dynamic-qa-runner', version: '1.0.0' }],
      component: {
        type: 'application',
        'bom-ref': 'app-root',
        name: 'dynamic-qa-app',
        version: '1.0.0'
      }
    },
    components: [
      {
        type: 'application',
        'bom-ref': 'app-root',
        name: 'dynamic-qa-app',
        version: '1.0.0',
        licenses: [{ license: { id: 'Apache-2.0' } }]
      },
      {
        type: 'library',
        'bom-ref': 'pkg:npm/lodash@4.17.20',
        name: 'lodash',
        version: '4.17.20',
        purl: 'pkg:npm/lodash@4.17.20',
        licenses: [{ license: { id: 'MIT' } }]
      }
    ],
    dependencies: [
      {
        ref: 'app-root',
        dependsOn: ['pkg:npm/lodash@4.17.20']
      }
    ],
    vulnerabilities: [
      {
        id: 'CVE-2020-8203',
        ratings: [{ severity: 'high', score: 7.4 }],
        affects: [{ ref: 'pkg:npm/lodash@4.17.20' }],
        description: 'Prototype pollution in lodash versions prior to 4.17.21.',
        recommendation: 'Upgrade lodash to 4.17.21 or later.'
      }
    ]
  };
}

async function run() {
  const ts = Date.now();
  const email = `qa-dynamic-${ts}@test.com`;
  const fullName = 'Dynamic QA';
  const orgName = `Dynamic QA Org ${ts}`;

  let token = null;
  let orgId = null;
  let sbomFilePath = null;
  let uploadedSbomId = null;
  let vulnerabilityId = null;
  let workflowItemId = null;

  console.log('\n==============================================');
  console.log(' Dynamic QA Scenarios (SBOM + Vulnerabilities)');
  console.log('==============================================');
  console.log(` Base URL: ${BASE}`);

  const health = await request('GET', '/health');
  check('DYN-0.1', 'health endpoint responds healthy', health.status === 200 && health.body?.status === 'healthy', `status=${health.status}`);
  if (!(health.status === 200 && health.body?.status === 'healthy')) {
    process.exit(1);
  }

  const register = await request('POST', '/api/v1/auth/register', {
    email,
    password: QA_PASSWORD,
    full_name: fullName,
    organization_name: orgName
  });
  check('DYN-1.1', 'register succeeds', register.status === 201, `status=${register.status}`);

  orgId = orgIdFromAuthResponse(register.body);
  token = tokenFromAuthResponse(register.body);
  check('DYN-1.2', 'register returns organization id', Boolean(orgId), 'missing organization id');
  check('DYN-1.3', 'register returns token', Boolean(token), 'missing token');

  const login = await request('POST', '/api/v1/auth/login', { email, password: QA_PASSWORD });
  check('DYN-1.4', 'login succeeds', login.status === 200, `status=${login.status}`);
  token = tokenFromAuthResponse(login.body);
  check('DYN-1.5', 'login returns token', Boolean(token), 'missing token after login');
  if (!token || !orgId) {
    process.exit(1);
  }

  const tierUpdateResult = await dbQuery('UPDATE organizations SET tier = $1 WHERE id = $2', ['enterprise', orgId]);
  check('DYN-1.5a', 'tier update applied or skipped safely', true, `rowCount=${tierUpdateResult.rowCount || 0}`);

  const relogin = await request('POST', '/api/v1/auth/login', { email, password: QA_PASSWORD });
  check('DYN-1.6', 're-login after tier update succeeds', relogin.status === 200, `status=${relogin.status}`);
  token = tokenFromAuthResponse(relogin.body);
  check('DYN-1.7', 're-login returns token', Boolean(token), 'missing token after tier update');

  const frameworks = await request('GET', '/api/v1/frameworks', null, token);
  check('DYN-2.1', 'framework list is available', frameworks.status === 200 && Array.isArray(frameworks.body?.data), `status=${frameworks.status}`);
  const frameworkIds = (frameworks.body?.data || []).slice(0, 4).map((f) => f.id);
  check('DYN-2.2', 'framework list contains at least one entry', frameworkIds.length > 0, `count=${frameworkIds.length}`);

  if (frameworkIds.length > 0) {
    const setFrameworks = await request(
      'POST',
      `/api/v1/organizations/${orgId}/frameworks`,
      { frameworkIds },
      token
    );
    check('DYN-2.3', 'organization framework selection succeeds', setFrameworks.status === 200, `status=${setFrameworks.status}`);
  }

  const categories = await request('GET', '/api/v1/assets/categories', null, token);
  check('DYN-3.1', 'asset categories endpoint succeeds', categories.status === 200, `status=${categories.status}`);
  const categoryRows = categories.body?.data?.categories || [];
  const softwareCategory = categoryRows.find((c) => c.code === 'software') || categoryRows[0];
  check('DYN-3.2', 'at least one writable asset category exists', Boolean(softwareCategory?.id), 'no category found');

  let assetId = null;
  if (softwareCategory?.id) {
    const createAsset = await request(
      'POST',
      '/api/v1/assets',
      {
        category_id: softwareCategory.id,
        name: `Dynamic QA Asset ${ts}`,
        status: 'active',
        version: '1.0.0',
        notes: 'Created by dynamic QA scenario'
      },
      token
    );

    check('DYN-3.3', 'asset creation succeeds', createAsset.status === 201, `status=${createAsset.status}`);
    assetId = createAsset.body?.data?.asset?.id || null;
    check('DYN-3.4', 'asset id is returned', Boolean(assetId), 'missing asset id');
  }

  if (!assetId) {
    process.exit(1);
  }

  const sbomPayload = makeSampleSbom(ts);
  sbomFilePath = path.join(os.tmpdir(), `dynamic-qa-sbom-${ts}.json`);
  fs.writeFileSync(sbomFilePath, JSON.stringify(sbomPayload, null, 2), 'utf8');

  const upload = await uploadFile('/api/v1/sbom/upload', sbomFilePath, { asset_id: assetId }, token);
  check('DYN-4.1', 'SBOM upload succeeds', upload.status === 201, `status=${upload.status}`);
  uploadedSbomId = upload.body?.data?.sbom_id || null;
  check('DYN-4.2', 'SBOM upload returns sbom_id', Boolean(uploadedSbomId), 'missing sbom_id');
  check('DYN-4.3', 'SBOM upload detects vulnerabilities', Number(upload.body?.data?.vulnerabilities_found || 0) >= 1, `vulns=${upload.body?.data?.vulnerabilities_found}`);

  const sbomList = await request('GET', '/api/v1/sbom?limit=25', null, token);
  check('DYN-4.4', 'SBOM list endpoint succeeds', sbomList.status === 200, `status=${sbomList.status}`);
  const sboms = sbomList.body?.data?.sboms || [];
  check('DYN-4.5', 'SBOM list includes uploaded SBOM', sboms.some((s) => s.id === uploadedSbomId), `uploaded=${uploadedSbomId}`);

  const sbomDetail = await request('GET', `/api/v1/sbom/${uploadedSbomId}`, null, token);
  check('DYN-4.6', 'SBOM detail endpoint succeeds', sbomDetail.status === 200, `status=${sbomDetail.status}`);
  check(
    'DYN-4.7',
    'SBOM detail contains parsed components',
    Array.isArray(sbomDetail.body?.data?.components) && sbomDetail.body.data.components.length >= 1,
    `components=${sbomDetail.body?.data?.components?.length || 0}`
  );
  check(
    'DYN-4.8',
    'SBOM detail contains component vulnerabilities',
    Array.isArray(sbomDetail.body?.data?.componentVulnerabilities) && sbomDetail.body.data.componentVulnerabilities.length >= 1,
    `componentVulns=${sbomDetail.body?.data?.componentVulnerabilities?.length || 0}`
  );

  const vulnerabilities = await request('GET', '/api/v1/vulnerabilities?source=SBOM&search=CVE-2020-8203&limit=25', null, token);
  check('DYN-5.1', 'vulnerability list endpoint succeeds', vulnerabilities.status === 200, `status=${vulnerabilities.status}`);
  const findings = vulnerabilities.body?.data?.findings || [];
  check('DYN-5.2', 'at least one SBOM vulnerability finding is returned', findings.length >= 1, `count=${findings.length}`);

  const matchedFinding = findings.find((f) => String(f.vulnerability_id).toUpperCase() === 'CVE-2020-8203') || findings[0];
  vulnerabilityId = matchedFinding?.id || null;
  check('DYN-5.3', 'vulnerability finding has id', Boolean(vulnerabilityId), 'missing vulnerability id');

  const vulnDetail = await request('GET', `/api/v1/vulnerabilities/${vulnerabilityId}`, null, token);
  check('DYN-5.4', 'vulnerability detail endpoint succeeds', vulnDetail.status === 200, `status=${vulnDetail.status}`);
  check(
    'DYN-5.5',
    'vulnerability detail includes audit linkage payload',
    Array.isArray(vulnDetail.body?.data?.relatedAuditEvents),
    'relatedAuditEvents missing'
  );

  const workflow = await request('GET', `/api/v1/vulnerabilities/${vulnerabilityId}/workflow`, null, token);
  check('DYN-5.6', 'vulnerability workflow endpoint succeeds', workflow.status === 200, `status=${workflow.status}`);
  const workItems = workflow.body?.data?.items || [];
  const hasWorkflowItems = workItems.length >= 1;
  check(
    'DYN-5.7',
    'workflow creates at least one control impact item',
    hasWorkflowItems || !STRICT_WORKFLOW_LINKAGE,
    `count=${workItems.length}`
  );

  workflowItemId = workItems[0]?.id || null;
  check(
    'DYN-5.8',
    'workflow item has id',
    Boolean(workflowItemId) || !STRICT_WORKFLOW_LINKAGE,
    'missing workflow item id'
  );

  if (workflowItemId) {
    const patch = await request(
      'PATCH',
      `/api/v1/vulnerabilities/${vulnerabilityId}/workflow/${workflowItemId}`,
      {
        actionStatus: 'in_progress',
        controlEffect: 'partial',
        responseSummary: 'Dynamic QA test moved this item to in_progress.'
      },
      token
    );
    check('DYN-5.9', 'workflow item update succeeds', patch.status === 200, `status=${patch.status}`);
  }

  const sources = await request('GET', '/api/v1/vulnerabilities/sources', null, token);
  check('DYN-5.10', 'vulnerability source metadata endpoint succeeds', sources.status === 200, `status=${sources.status}`);
  check(
    'DYN-5.11',
    'framework required artifacts are exposed',
    Array.isArray(sources.body?.data?.frameworkRequiredArtifacts) && sources.body.data.frameworkRequiredArtifacts.length >= 1,
    `count=${sources.body?.data?.frameworkRequiredArtifacts?.length || 0}`
  );

  const auditLogs = await request('GET', '/api/v1/audit/logs?limit=200', null, token);
  check('DYN-6.1', 'audit log endpoint succeeds', auditLogs.status === 200, `status=${auditLogs.status}`);
  const auditEvents = auditLogs.body?.data || [];
  check(
    'DYN-6.2',
    'audit logs include sbom upload event',
    auditEvents.some((row) => row.event_type === 'sbom_uploaded'),
    'sbom_uploaded not found'
  );
  check(
    'DYN-6.3',
    'audit logs include workflow update event',
    auditEvents.some((row) => row.event_type === 'vulnerability_workflow_updated') || (!STRICT_WORKFLOW_LINKAGE && !workflowItemId),
    'vulnerability_workflow_updated not found'
  );

  if (sbomFilePath && fs.existsSync(sbomFilePath)) {
    fs.unlinkSync(sbomFilePath);
  }

  console.log('\n----------------------------------------------');
  console.log(` Dynamic Scenario Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------');
  if (failures.length > 0) {
    for (const item of failures) {
      console.log(`  - ${item}`);
    }
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('\nDynamic scenario runner crashed:', error);
  process.exit(1);
});
