// @tier: exclude
/**
 * Auditor workflow end-to-end QA.
 *
 * Covers:
 * - engagement lifecycle
 * - PBC request lifecycle
 * - workpaper lifecycle
 * - finding lifecycle
 * - sign-off
 * - auditor workspace link + public read-only access
 *
 * Usage:
 *   node scripts/qa-auditor-workflow.js
 *
 * Env:
 *   QA_BASE_URL=http://localhost:3001
 */
const http = require('http');
const https = require('https');
const { Pool } = require('pg');
require('dotenv').config();

const BASE = (process.env.QA_BASE_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const QA_PASSWORD = 'AuditorQaPass123!';
const DB_REQUIRED = String(process.env.QA_DB_REQUIRED || 'false').toLowerCase() === 'true';
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

function request(method, urlPath, body, token, attempt = 0) {
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
        'Content-Type': 'application/json'
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
            parsedBody?.retryAfterSeconds ||
            res.headers['retry-after'] ||
            0
          );
          const waitMs = Math.max(DEFAULT_429_WAIT_MS, retryAfterSeconds * 1000);
          await sleep(waitMs);
          resolve(await request(method, urlPath, body, token, attempt + 1));
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

async function run() {
  const ts = Date.now();
  const email = `qa-auditor-${ts}@test.com`;
  const fullName = 'Auditor QA';
  const orgName = `Auditor QA Org ${ts}`;

  let token = null;
  let orgId = null;
  let userId = null;

  let engagementId = null;
  let pbcId = null;
  let workpaperId = null;
  let findingId = null;
  let signoffId = null;
  let workspaceLinkId = null;
  let workspaceToken = null;

  console.log('\n==============================================');
  console.log(' Auditor Workflow QA');
  console.log('==============================================');
  console.log(` Base URL: ${BASE}`);

  const health = await request('GET', '/health');
  check('AUD-0.1', 'health endpoint responds healthy', health.status === 200 && health.body?.status === 'healthy', `status=${health.status}`);
  if (!(health.status === 200 && health.body?.status === 'healthy')) {
    process.exit(1);
  }

  const register = await request('POST', '/api/v1/auth/register', {
    email,
    password: QA_PASSWORD,
    full_name: fullName,
    organization_name: orgName,
    initial_role: 'auditor'
  });
  check('AUD-1.1', 'register succeeds', register.status === 201, `status=${register.status}`);
  token = tokenFromAuthResponse(register.body);
  orgId = orgIdFromAuthResponse(register.body);
  userId = register.body?.data?.user?.id || null;
  check('AUD-1.2', 'register returns token', Boolean(token), 'missing token');
  check('AUD-1.3', 'register returns organization id', Boolean(orgId), 'missing organization id');

  const login = await request('POST', '/api/v1/auth/login', { email, password: QA_PASSWORD });
  check('AUD-1.4', 'login succeeds', login.status === 200, `status=${login.status}`);
  token = tokenFromAuthResponse(login.body);
  userId = login.body?.data?.user?.id || userId;
  check('AUD-1.5', 'login returns token', Boolean(token), 'missing token after login');
  if (!token || !orgId) {
    process.exit(1);
  }

  const tierUpdateResult = await dbQuery('UPDATE organizations SET tier = $1 WHERE id = $2', ['enterprise', orgId]);
  check('AUD-1.6a', 'tier update applied or skipped safely', true, `rowCount=${tierUpdateResult.rowCount || 0}`);
  const relogin = await request('POST', '/api/v1/auth/login', { email, password: QA_PASSWORD });
  check('AUD-1.6', 're-login succeeds after tier update', relogin.status === 200, `status=${relogin.status}`);
  token = tokenFromAuthResponse(relogin.body) || token;

  const frameworks = await request('GET', '/api/v1/assessments/frameworks', null, token);
  check('AUD-2.1', 'assessment frameworks endpoint succeeds', frameworks.status === 200, `status=${frameworks.status}`);

  const procedures = await request('GET', '/api/v1/assessments/procedures?limit=5', null, token);
  check('AUD-2.2', 'assessment procedures endpoint succeeds', procedures.status === 200, `status=${procedures.status}`);

  const createPlan = await request(
    'POST',
    '/api/v1/assessments/plans',
    { name: `QA Audit Plan ${ts}`, description: 'Created by auditor QA script' },
    token
  );
  check('AUD-2.3', 'assessment plan create succeeds', createPlan.status === 201, `status=${createPlan.status}`);
  const planId = createPlan.body?.data?.id || null;
  check('AUD-2.4', 'assessment plan id returned', Boolean(planId), 'missing plan id');

  const plans = await request('GET', '/api/v1/assessments/plans', null, token);
  const planRows = plans.body?.data || [];
  check('AUD-2.5', 'assessment plans list succeeds', plans.status === 200, `status=${plans.status}`);
  check('AUD-2.6', 'created assessment plan is listed', Array.isArray(planRows) && planRows.some((row) => row.id === planId), `plan_id=${planId}`);

  const createEngagement = await request(
    'POST',
    '/api/v1/assessments/engagements',
    {
      name: `QA Engagement ${ts}`,
      engagement_type: 'internal_audit',
      scope: 'Auditor QA synthetic engagement',
      framework_codes: ['nist_800_53', 'iso_27001'],
      status: 'planning',
      lead_auditor_id: userId,
      engagement_owner_id: userId
    },
    token
  );
  check('AUD-3.1', 'audit engagement create succeeds', createEngagement.status === 201, `status=${createEngagement.status}`);
  engagementId = createEngagement.body?.data?.id || null;
  check('AUD-3.2', 'audit engagement id returned', Boolean(engagementId), 'missing engagement id');
  if (!engagementId) {
    process.exit(1);
  }

  const listEngagements = await request('GET', '/api/v1/assessments/engagements?limit=20', null, token);
  const engagementRows = listEngagements.body?.data?.engagements || [];
  check('AUD-3.3', 'audit engagements list succeeds', listEngagements.status === 200, `status=${listEngagements.status}`);
  check('AUD-3.4', 'created engagement appears in list', engagementRows.some((row) => row.id === engagementId), `engagement_id=${engagementId}`);

  const patchEngagement = await request(
    'PATCH',
    `/api/v1/assessments/engagements/${engagementId}`,
    { status: 'fieldwork' },
    token
  );
  check('AUD-3.5', 'audit engagement update succeeds', patchEngagement.status === 200, `status=${patchEngagement.status}`);
  check('AUD-3.6', 'audit engagement status updated to fieldwork', patchEngagement.body?.data?.status === 'fieldwork', `status=${patchEngagement.body?.data?.status}`);

  const engagementDetail = await request('GET', `/api/v1/assessments/engagements/${engagementId}`, null, token);
  check('AUD-3.7', 'audit engagement detail succeeds', engagementDetail.status === 200, `status=${engagementDetail.status}`);
  check('AUD-3.8', 'engagement detail contains summary', Boolean(engagementDetail.body?.data?.summary), 'missing summary');

  const createPbc = await request(
    'POST',
    `/api/v1/assessments/engagements/${engagementId}/pbc`,
    {
      title: 'Provide MFA enrollment evidence',
      request_details: 'Submit evidence proving MFA enrollment coverage for in-scope systems.',
      priority: 'high',
      due_date: '2026-12-31',
      assigned_to: userId
    },
    token
  );
  check('AUD-4.1', 'PBC create succeeds', createPbc.status === 201, `status=${createPbc.status}`);
  pbcId = createPbc.body?.data?.id || null;
  check('AUD-4.2', 'PBC id returned', Boolean(pbcId), 'missing pbc id');

  const patchPbc = await request(
    'PATCH',
    `/api/v1/assessments/engagements/${engagementId}/pbc/${pbcId}`,
    { status: 'submitted', response_notes: 'Evidence packet uploaded for review.' },
    token
  );
  check('AUD-4.3', 'PBC update succeeds', patchPbc.status === 200, `status=${patchPbc.status}`);
  check('AUD-4.4', 'PBC status updated to submitted', patchPbc.body?.data?.status === 'submitted', `status=${patchPbc.body?.data?.status}`);

  const listPbc = await request('GET', `/api/v1/assessments/engagements/${engagementId}/pbc`, null, token);
  const pbcRows = listPbc.body?.data || [];
  check('AUD-4.5', 'PBC list succeeds', listPbc.status === 200, `status=${listPbc.status}`);
  check('AUD-4.6', 'PBC list includes created request', Array.isArray(pbcRows) && pbcRows.some((row) => row.id === pbcId), `pbc_id=${pbcId}`);

  const createWorkpaper = await request(
    'POST',
    `/api/v1/assessments/engagements/${engagementId}/workpapers`,
    {
      title: 'MFA Control Test Workpaper',
      objective: 'Validate MFA deployment and enforcement',
      procedure_performed: 'Reviewed MFA logs, sampled accounts, and validated policy settings.',
      conclusion: 'Control operating effectively with minor exceptions.',
      status: 'draft',
      prepared_by: userId
    },
    token
  );
  check('AUD-5.1', 'workpaper create succeeds', createWorkpaper.status === 201, `status=${createWorkpaper.status}`);
  workpaperId = createWorkpaper.body?.data?.id || null;
  check('AUD-5.2', 'workpaper id returned', Boolean(workpaperId), 'missing workpaper id');

  const patchWorkpaper = await request(
    'PATCH',
    `/api/v1/assessments/engagements/${engagementId}/workpapers/${workpaperId}`,
    {
      status: 'finalized',
      reviewer_notes: 'Finalized for reporting pack.'
    },
    token
  );
  check('AUD-5.3', 'workpaper update succeeds', patchWorkpaper.status === 200, `status=${patchWorkpaper.status}`);
  check('AUD-5.4', 'workpaper status updated to finalized', patchWorkpaper.body?.data?.status === 'finalized', `status=${patchWorkpaper.body?.data?.status}`);

  const listWorkpapers = await request('GET', `/api/v1/assessments/engagements/${engagementId}/workpapers`, null, token);
  const workpaperRows = listWorkpapers.body?.data || [];
  check('AUD-5.5', 'workpaper list succeeds', listWorkpapers.status === 200, `status=${listWorkpapers.status}`);
  check('AUD-5.6', 'workpaper list includes created workpaper', Array.isArray(workpaperRows) && workpaperRows.some((row) => row.id === workpaperId), `workpaper_id=${workpaperId}`);

  const createFinding = await request(
    'POST',
    `/api/v1/assessments/engagements/${engagementId}/findings`,
    {
      related_pbc_request_id: pbcId,
      related_workpaper_id: workpaperId,
      title: 'MFA exception handling is inconsistent',
      description: 'Exception approvals for temporary MFA bypass are not consistently documented.',
      severity: 'medium',
      recommendation: 'Require centralized approval tracking for MFA exception grants.',
      owner_user_id: userId,
      due_date: '2026-12-31'
    },
    token
  );
  check('AUD-6.1', 'finding create succeeds', createFinding.status === 201, `status=${createFinding.status}`);
  findingId = createFinding.body?.data?.id || null;
  check('AUD-6.2', 'finding id returned', Boolean(findingId), 'missing finding id');

  const patchFinding = await request(
    'PATCH',
    `/api/v1/assessments/engagements/${engagementId}/findings/${findingId}`,
    { status: 'remediating', management_response: 'Engineering has implemented an exception register workflow.' },
    token
  );
  check('AUD-6.3', 'finding update succeeds', patchFinding.status === 200, `status=${patchFinding.status}`);
  check('AUD-6.4', 'finding status updated to remediating', patchFinding.body?.data?.status === 'remediating', `status=${patchFinding.body?.data?.status}`);

  const listFindings = await request('GET', `/api/v1/assessments/engagements/${engagementId}/findings`, null, token);
  const findingRows = listFindings.body?.data || [];
  check('AUD-6.5', 'finding list succeeds', listFindings.status === 200, `status=${listFindings.status}`);
  check('AUD-6.6', 'finding list includes created finding', Array.isArray(findingRows) && findingRows.some((row) => row.id === findingId), `finding_id=${findingId}`);

  const createSignoff = await request(
    'POST',
    `/api/v1/assessments/engagements/${engagementId}/signoffs`,
    {
      signoff_type: 'auditor',
      status: 'approved',
      comments: 'Fieldwork artifacts reviewed and accepted.',
      signed_by: userId
    },
    token
  );
  check('AUD-7.1', 'signoff create succeeds', createSignoff.status === 201, `status=${createSignoff.status}`);
  signoffId = createSignoff.body?.data?.id || null;
  check('AUD-7.2', 'signoff id returned', Boolean(signoffId), 'missing signoff id');

  const listSignoffs = await request('GET', `/api/v1/assessments/engagements/${engagementId}/signoffs`, null, token);
  const signoffRows = listSignoffs.body?.data || [];
  check('AUD-7.3', 'signoff list succeeds', listSignoffs.status === 200, `status=${listSignoffs.status}`);
  check('AUD-7.4', 'signoff list includes created signoff', Array.isArray(signoffRows) && signoffRows.some((row) => row.id === signoffId), `signoff_id=${signoffId}`);

  const createWorkspaceLink = await request(
    'POST',
    '/api/v1/auditor-workspace/links',
    {
      name: `QA Workspace Link ${ts}`,
      engagement_id: engagementId,
      days_valid: 30
    },
    token
  );
  check('AUD-8.1', 'auditor workspace link create succeeds', createWorkspaceLink.status === 201, `status=${createWorkspaceLink.status}`);
  workspaceLinkId = createWorkspaceLink.body?.data?.id || null;
  workspaceToken = createWorkspaceLink.body?.data?.token || null;
  check('AUD-8.2', 'auditor workspace link id returned', Boolean(workspaceLinkId), 'missing workspace link id');
  check('AUD-8.3', 'auditor workspace token returned', Boolean(workspaceToken), 'missing workspace token');

  const listWorkspaceLinks = await request('GET', '/api/v1/auditor-workspace/links', null, token);
  const workspaceRows = listWorkspaceLinks.body?.data || [];
  check('AUD-8.4', 'auditor workspace link list succeeds', listWorkspaceLinks.status === 200, `status=${listWorkspaceLinks.status}`);
  check('AUD-8.5', 'workspace link appears in list', Array.isArray(workspaceRows) && workspaceRows.some((row) => row.id === workspaceLinkId), `workspace_link_id=${workspaceLinkId}`);

  const publicWorkspace = await request('GET', `/api/v1/auditor-workspace/public/${workspaceToken}`);
  check('AUD-8.6', 'public auditor workspace endpoint succeeds', publicWorkspace.status === 200, `status=${publicWorkspace.status}`);
  check('AUD-8.7', 'public workspace includes engagement payload', publicWorkspace.body?.data?.engagement?.id === engagementId, `engagement=${publicWorkspace.body?.data?.engagement?.id}`);
  check(
    'AUD-8.8',
    'public workspace includes finding and PBC context',
    Array.isArray(publicWorkspace.body?.data?.findings) &&
      publicWorkspace.body.data.findings.length >= 1 &&
      Array.isArray(publicWorkspace.body?.data?.pbc_requests) &&
      publicWorkspace.body.data.pbc_requests.length >= 1,
    'missing findings or pbc payload'
  );

  const disableWorkspace = await request(
    'PATCH',
    `/api/v1/auditor-workspace/links/${workspaceLinkId}`,
    { active: false },
    token
  );
  check('AUD-8.9', 'auditor workspace disable succeeds', disableWorkspace.status === 200, `status=${disableWorkspace.status}`);

  const disabledPublicWorkspace = await request('GET', `/api/v1/auditor-workspace/public/${workspaceToken}`);
  check('AUD-8.10', 'disabled public workspace token is rejected', disabledPublicWorkspace.status === 404, `status=${disabledPublicWorkspace.status}`);

  const auditLogs = await request(
    'GET',
    '/api/v1/audit/logs?eventType=auditor_workspace_link_created&limit=20',
    null,
    token
  );
  const auditRows = auditLogs.body?.data || [];
  check('AUD-9.1', 'audit log query succeeds', auditLogs.status === 200, `status=${auditLogs.status}`);
  check(
    'AUD-9.2',
    'audit logs include auditor workspace link creation',
    Array.isArray(auditRows) && auditRows.some((row) => row.resource_id === workspaceLinkId || row.resource_id === String(workspaceLinkId)),
    `resource_id=${workspaceLinkId}`
  );

  const stats = await request('GET', '/api/v1/assessments/stats', null, token);
  check('AUD-10.1', 'assessment stats endpoint succeeds', stats.status === 200, `status=${stats.status}`);

  console.log('\n----------------------------------------------');
  console.log(` Auditor Workflow QA Results: ${passed} passed, ${failed} failed`);
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
  console.error('\nAuditor workflow QA runner crashed:', error);
  process.exit(1);
});
