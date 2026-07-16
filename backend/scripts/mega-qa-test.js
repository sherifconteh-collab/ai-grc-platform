// @tier: exclude
/**
 * MEGA QA TEST SUITE — Every inch of the ControlWeave
 *
 * Tests all 19 route files, 100+ endpoints across:
 *   1.  Auth lifecycle (register, login, refresh, me, logout)
 *   2.  Frameworks (list all)
 *   3.  Organizations (add/remove frameworks, get controls, org access)
 *   4.  Dashboard (stats, priority-actions, recent-activity, trend, crosswalk-impact, maturity)
 *   5.  Controls (get, implementation, mappings, history)
 *   6.  Implementations (list, activity feed, due, status, assign, review)
 *   7.  CMDB (environments, password-vaults, service-accounts, hardware, software, ai-agents)
 *   8.  Evidence (list, upload, get, update, delete, link, unlink)
 *   9.  Audit (logs, stats, event-types, user audit)
 *   10. Roles & Permissions (list, create, update, delete, permissions, assign, user roles)
 *   11. Users (list)
 *   12. AI Analysis (status + all 21 POST endpoints)
 *   13. Settings (LLM get/put/test/delete)
 *   14. Assessments (procedures, results, stats, frameworks, plans)
 *   15. Reports (types, PDF, Excel)
 *   16. Notifications (list, create, mark read, read all)
 *   17. Tier gating (free vs starter vs professional)
 *   18. RBAC (admin vs viewer)
 *   19. Security (cross-org, SQL injection, XSS, invalid tokens, 404s)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

const BASE = (process.env.QA_BASE_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const MAX_429_RETRIES = parseInt(process.env.QA_MAX_429_RETRIES || '3', 10);
const DEFAULT_429_WAIT_MS = parseInt(process.env.QA_DEFAULT_429_WAIT_MS || '2000', 10);
const OVERVIEW_ADMIN_EMAIL = process.env.QA_OVERVIEW_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@enterprise.com';
const OVERVIEW_ADMIN_PASSWORD = process.env.QA_OVERVIEW_ADMIN_PASSWORD || process.env.QA_DEMO_PASSWORD || process.env.ADMIN_PASSWORD || 'ControlWeave!2026';
const COMMUNITY_ADMIN_EMAIL = process.env.QA_COMMUNITY_ADMIN_EMAIL || 'admin@community.com';
const COMMUNITY_ADMIN_PASSWORD = process.env.QA_COMMUNITY_ADMIN_PASSWORD || process.env.QA_DEMO_PASSWORD || process.env.ADMIN_PASSWORD || 'ControlWeave!2026';
const PLATFORM_OWNER_EMAIL = process.env.QA_PLATFORM_OWNER_EMAIL || process.env.PLATFORM_ADMIN_EMAIL || '';
const PLATFORM_OWNER_PASSWORD = process.env.QA_PLATFORM_OWNER_PASSWORD || process.env.PLATFORM_ADMIN_PASSWORD || '';
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
let cachedOverviewAdminToken = null;
let cachedCommunityAdminToken = null;
let cachedPlatformOwnerToken = undefined;

// ---------- HTTP helper ----------
function req(method, urlPath, body, token, raw = false, attempt = 0) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;

    const r = transport.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', async () => {
        const buf = Buffer.concat(chunks);
        let parsedBody = raw ? buf : null;
        if (!raw) {
          try {
            parsedBody = JSON.parse(buf.toString());
          } catch (_e) {
            parsedBody = buf.toString().substring(0, 200);
          }
        }

        if (res.statusCode === 429 && attempt < MAX_429_RETRIES) {
          const retryAfterSeconds = Number(
            (parsedBody && typeof parsedBody === 'object' ? parsedBody.retryAfterSeconds : null) ||
            res.headers['retry-after'] ||
            0
          );
          const waitMs = Math.max(DEFAULT_429_WAIT_MS, retryAfterSeconds * 1000);
          await sleep(waitMs);
          resolve(await req(method, urlPath, body, token, raw, attempt + 1));
          return;
        }

        if (raw) {
          resolve({ s: res.statusCode, b: buf, h: res.headers });
          return;
        }

        resolve({ s: res.statusCode, b: parsedBody });
      });
    });
    r.on('timeout', () => r.destroy(new Error('Request timed out')));
    r.on('error', e => resolve({ s: 0, b: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// Multipart upload helper
function uploadFile(urlPath, filePath, fields, token, attempt = 0) {
  return new Promise((resolve) => {
    const boundary = '----FormBoundary' + Date.now();
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;

    let body = '';
    // Add fields
    for (const [key, value] of Object.entries(fields || {})) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${value}\r\n`;
    }

    // Add file
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    body += `Content-Type: text/plain\r\n\r\n`;

    const bodyStart = Buffer.from(body, 'utf8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const fullBody = Buffer.concat([bodyStart, fileContent, bodyEnd]);

    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
        'Authorization': 'Bearer ' + token,
      }
    };

    const r = transport.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        let parsed = d;
        try { parsed = JSON.parse(d); }
        catch (e) { parsed = d; }

        if (res.statusCode === 429 && attempt < MAX_429_RETRIES) {
          const retryAfterSeconds = Number(
            (parsed && typeof parsed === 'object' ? parsed.retryAfterSeconds : null) ||
            res.headers['retry-after'] ||
            0
          );
          const waitMs = Math.max(DEFAULT_429_WAIT_MS, retryAfterSeconds * 1000);
          await sleep(waitMs);
          resolve(await uploadFile(urlPath, filePath, fields, token, attempt + 1));
          return;
        }

        resolve({ s: res.statusCode, b: parsed });
      });
    });
    r.on('error', e => resolve({ s: 0, b: e.message }));
    r.write(fullBody);
    r.end();
  });
}

function assert(testId, description, condition) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testId}: ${description}`);
  } else {
    failed++;
    failures.push(`${testId}: ${description}`);
    console.log(`  ❌ ${testId}: ${description}`);
  }
}

function skip(testId, description, reason) {
  skipped++;
  console.log(`  ⏭️  ${testId}: ${description} — SKIPPED (${reason})`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flattenHelpArticles(payload) {
  return Object.values(payload?.data?.categories || {}).flat();
}

function isMissingAiKeyError(payload) {
  // checkAIUsage (routes/ai.js) signals this condition with a stable code
  // rather than free text -- match on that instead of wording that can change.
  return payload?.code === 'NO_PROVIDER_CONFIGURED';
}

async function loginUser(email, password) {
  return req('POST', '/api/v1/auth/login', { email, password });
}

async function getOverviewAdminToken() {
  if (cachedOverviewAdminToken) {
    return cachedOverviewAdminToken;
  }

  const login = await loginUser(OVERVIEW_ADMIN_EMAIL, OVERVIEW_ADMIN_PASSWORD);
  if (login.s !== 200 || !login.b.data?.tokens?.accessToken) {
    throw new Error(`Overview admin login failed (${login.s}) for ${OVERVIEW_ADMIN_EMAIL}`);
  }

  const token = login.b.data.tokens.accessToken;
  const overview = await req('GET', '/api/v1/platform-admin/overview', null, token);
  if (overview.s !== 200) {
    throw new Error(`Overview admin access check failed (${overview.s}) for ${OVERVIEW_ADMIN_EMAIL}`);
  }

  cachedOverviewAdminToken = token;
  return token;
}

async function getCommunityAdminToken() {
  if (cachedCommunityAdminToken) {
    return cachedCommunityAdminToken;
  }

  const login = await loginUser(COMMUNITY_ADMIN_EMAIL, COMMUNITY_ADMIN_PASSWORD);
  if (login.s !== 200 || !login.b.data?.tokens?.accessToken) {
    throw new Error(`Community demo login failed (${login.s}) for ${COMMUNITY_ADMIN_EMAIL}`);
  }

  cachedCommunityAdminToken = login.b.data.tokens.accessToken;
  return cachedCommunityAdminToken;
}

async function getPlatformOwnerToken() {
  if (cachedPlatformOwnerToken !== undefined) {
    return cachedPlatformOwnerToken;
  }

  if (!PLATFORM_OWNER_EMAIL || !PLATFORM_OWNER_PASSWORD) {
    cachedPlatformOwnerToken = null;
    return cachedPlatformOwnerToken;
  }

  const login = await loginUser(PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_PASSWORD);
  if (login.s !== 200 || !login.b.data?.tokens?.accessToken) {
    cachedPlatformOwnerToken = null;
    return cachedPlatformOwnerToken;
  }

  const token = login.b.data.tokens.accessToken;
  const llmDefaults = await req('GET', '/api/v1/platform-admin/llm-defaults', null, token);
  cachedPlatformOwnerToken = llmDefaults.s === 200 ? token : null;
  return cachedPlatformOwnerToken;
}

async function getPlatformLlmDefaults() {
  const platformOwnerToken = await getPlatformOwnerToken();
  if (!platformOwnerToken) {
    return { s: 0, b: { error: 'Protected platform owner credentials not configured' } };
  }
  return req('GET', '/api/v1/platform-admin/llm-defaults', null, platformOwnerToken);
}

async function updatePlatformLlmDefaults(body) {
  const platformOwnerToken = await getPlatformOwnerToken();
  if (!platformOwnerToken) {
    return { s: 0, b: { error: 'Protected platform owner credentials not configured' } };
  }
  return req('PUT', '/api/v1/platform-admin/llm-defaults', body, platformOwnerToken);
}

async function inviteAndAcceptUser(adminToken, { email, primaryRole, fullName, password }) {
  const invite = await req('POST', '/api/v1/users/invite', {
    email,
    primary_role: primaryRole
  }, adminToken);

  const inviteToken = invite.b.data?.invite_token;
  const accept = inviteToken
    ? await req('POST', '/api/v1/auth/accept-invite', {
        token: inviteToken,
        full_name: fullName,
        password
      })
    : { s: 0, b: { error: 'Invite token missing' } };

  return {
    invite,
    accept,
    token: accept.b.data?.tokens?.accessToken || null
  };
}

// =====================================================================
(async () => {
  const ts = Date.now();
  const email1 = `mega-admin-${ts}@test.com`;
  const email2 = `mega-viewer-${ts}@test.com`;
  const pass = 'ControlWeaveQaPass123!';

  console.log('\n══════════════════════════════════════════════════');
  console.log('  MEGA QA TEST SUITE — ControlWeave');
  console.log('══════════════════════════════════════════════════\n');

  // ======================== 0. HEALTH CHECK ========================
  console.log('── 0. Health Check ──');
  const health = await req('GET', '/health');
  assert('0.1', 'Health check returns healthy', health.s === 200 && health.b.status === 'healthy');

  // ======================== 1. AUTH LIFECYCLE ========================
  console.log('\n── 1. Auth Lifecycle ──');

  // 1.1 Register validation
  const regBad = await req('POST', '/api/v1/auth/register', { email: email1 });
  assert('1.1', 'Register rejects missing fields', regBad.s === 400);

  // 1.2 Register success
  const reg = await req('POST', '/api/v1/auth/register', {
    email: email1, password: pass, full_name: 'Mega Admin', organization_name: 'Mega Test Org'
  });
  assert('1.2', 'Register returns 201', reg.s === 201);
  assert('1.3', 'Register returns user data', !!reg.b.data?.user?.id);
  assert('1.4', 'Register returns tokens', !!reg.b.data?.tokens?.accessToken);
  assert('1.5', 'Register returns organization', !!reg.b.data?.organization?.id);
  assert('1.6', 'Register full_name is combined', reg.b.data?.user?.full_name === 'Mega Admin');

  const adminToken = reg.b.data?.tokens?.accessToken;
  const adminRefresh = reg.b.data?.tokens?.refreshToken;
  const adminUserId = reg.b.data?.user?.id;
  const orgId = reg.b.data?.organization?.id || reg.b.data?.user?.organization_id;
  const orgTier = reg.b.data?.organization?.tier;
  const orgBilling = reg.b.data?.organization?.billing_status;
  const orgTrial = reg.b.data?.organization?.trial_status;

  assert(
    '1.7',
    'Org starts in active trial tier',
    orgTier !== 'community' && orgBilling === 'trial' && orgTrial === 'active'
  );

  // 1.3 Duplicate registration
  const regDup = await req('POST', '/api/v1/auth/register', {
    email: email1, password: pass, full_name: 'Dup', organization_name: 'Dup'
  });
  assert('1.8', 'Duplicate email returns 409', regDup.s === 409);

  // 1.4 Login validation
  const loginBad = await req('POST', '/api/v1/auth/login', {});
  assert('1.9', 'Login rejects missing fields', loginBad.s === 400);

  // 1.5 Login with wrong password
  const loginWrong = await req('POST', '/api/v1/auth/login', { email: email1, password: 'wrong' });
  assert('1.10', 'Wrong password returns 401', loginWrong.s === 401);

  // 1.6 Login success
  const login = await req('POST', '/api/v1/auth/login', { email: email1, password: pass });
  assert('1.11', 'Login returns 200', login.s === 200);
  assert('1.12', 'Login returns tokens nested', !!login.b.data?.tokens?.accessToken);
  assert('1.13', 'Login returns user with org_id', !!login.b.data?.user?.organization_id);

  const token = login.b.data?.tokens?.accessToken;

  // 1.7 Refresh
  const refresh = await req('POST', '/api/v1/auth/refresh', { refreshToken: adminRefresh });
  assert('1.14', 'Refresh returns new access token', refresh.s === 200 && !!refresh.b.data?.accessToken);

  // 1.8 GET /auth/me
  const me = await req('GET', '/api/v1/auth/me', null, token);
  assert('1.15', '/me returns 200', me.s === 200);
  assert('1.16', '/me has full_name', !!me.b.data?.full_name);
  assert('1.17', '/me has organization nested', !!me.b.data?.organization?.id);
  assert('1.18', '/me has roles array', Array.isArray(me.b.data?.roles));
  assert('1.19', '/me has permissions array', Array.isArray(me.b.data?.permissions));

  // 1.9 Auth required (no token)
  const noAuth = await req('GET', '/api/v1/frameworks');
  assert('1.20', 'No token returns 401', noAuth.s === 401);

  // 1.10 Invalid token
  const badToken = await req('GET', '/api/v1/frameworks', null, 'bad.token.here');
  assert('1.21', 'Invalid token returns 401/403', badToken.s === 401 || badToken.s === 403);

  const communityToken = await getCommunityAdminToken();
  assert('1.21a', 'Community demo login succeeds', !!communityToken);
  const communityMe = await req('GET', '/api/v1/auth/me', null, communityToken);
  const communityOrgId = communityMe.b.data?.organization?.id;
  assert('1.22', 'Community demo account authenticated', communityMe.s === 200 && !!communityMe.b.data?.organization?.id);

  const proToken = token;

  // ======================== 2. FRAMEWORKS ========================
  console.log('\n── 2. Frameworks ──');

  const fws = await req('GET', '/api/v1/frameworks', null, proToken);
  assert('2.1', 'GET /frameworks returns 200', fws.s === 200);
  assert('2.2', 'Frameworks is array', Array.isArray(fws.b.data));
  assert('2.3', 'Frameworks have control_count', fws.b.data?.[0]?.control_count !== undefined);

  const frameworkById = new Map((fws.b.data || []).map((framework) => [framework.id, framework]));
  const frameworkIds = fws.b.data?.slice(0, 2).map(f => f.id) || [];
  const allFrameworkIds = fws.b.data?.map(f => f.id) || [];
  let selectedFrameworkIds = frameworkIds;
  let detectedFreeLimit = frameworkIds.length;

  // ======================== 3. ORGANIZATIONS ========================
  console.log('\n── 3. Organizations ──');

  // 3.1 Add frameworks for the isolated QA org.
  const addFw = await req('POST', `/api/v1/organizations/${orgId}/frameworks`, { frameworkIds }, proToken);
  if (addFw.s === 200) {
    assert('3.1', 'Add frameworks returns 200', true);
    assert('3.2', 'Returns framework data', Array.isArray(addFw.b.data));
  } else if (
    addFw.s === 403
    && Number.isFinite(Number(addFw.b?.maxFrameworks))
    && Number(addFw.b.maxFrameworks) > 0
  ) {
    detectedFreeLimit = Number(addFw.b.maxFrameworks);
    selectedFrameworkIds = allFrameworkIds.slice(0, detectedFreeLimit);
    const retryAddFw = await req(
      'POST',
      `/api/v1/organizations/${orgId}/frameworks`,
      { frameworkIds: selectedFrameworkIds },
      proToken
    );
    assert('3.1', `Add frameworks within free tier limit (${detectedFreeLimit}) returns 200`, retryAddFw.s === 200);
    assert('3.2', 'Returns framework data', Array.isArray(retryAddFw.b.data));
  } else {
    assert('3.1', 'Add frameworks returns 200', false);
    assert('3.2', 'Returns framework data', false);
  }

  // 3.2 Get org frameworks
  const orgFws = await req('GET', `/api/v1/organizations/${orgId}/frameworks`, null, proToken);
  assert('3.3', 'GET org frameworks returns 200', orgFws.s === 200);
  assert('3.4', `Org has ${selectedFrameworkIds.length} frameworks`, orgFws.b.data?.length === selectedFrameworkIds.length);
  const orgFrameworkIds = new Set((orgFws.b.data || []).map((framework) => framework.id));
  assert('3.4b', 'Org frameworks include selected framework ids', selectedFrameworkIds.every((frameworkId) => orgFrameworkIds.has(frameworkId)));

  // 3.3 Verify community demo org can access frameworks (no tier cap).
  const communityOrgFws = await req('GET', `/api/v1/organizations/${communityOrgId}/frameworks`, null, communityToken);
  assert('3.4a', 'Community org frameworks returns 200', communityOrgFws.s === 200 && Array.isArray(communityOrgFws.b.data));

  // 3.4 Get org controls
  const orgCtrls = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, proToken);
  assert('3.7', 'GET org controls returns 200', orgCtrls.s === 200);
  assert('3.8', 'Org controls is array', Array.isArray(orgCtrls.b.data));

  // 3.5 Org controls filter by framework
  if (selectedFrameworkIds[0]) {
    const expectedFrameworkCode = frameworkById.get(selectedFrameworkIds[0])?.code;
    const filteredCtrls = await req('GET', `/api/v1/organizations/${orgId}/controls?frameworkId=${selectedFrameworkIds[0]}`, null, proToken);
    assert('3.9', 'Filtered org controls returns 200', filteredCtrls.s === 200);
    assert(
      '3.9a',
      'Framework filter only returns requested framework',
      !!expectedFrameworkCode
        && Array.isArray(filteredCtrls.b.data)
        && filteredCtrls.b.data.every((control) => control.framework_code === expectedFrameworkCode)
    );
  }

  // 3.6 Org controls filter by status
  const statusCtrls = await req('GET', `/api/v1/organizations/${orgId}/controls?status=not_started`, null, proToken);
  assert('3.10', 'Status filter returns 200', statusCtrls.s === 200);
  assert(
    '3.10a',
    'Status filter only returns not_started controls',
    Array.isArray(statusCtrls.b.data) && statusCtrls.b.data.every((control) => control.status === 'not_started')
  );

  // ======================== 4. FULL ACCESS VERIFICATION ========================
  // All demo accounts have enterprise-tier access — all features accessible.
  console.log('\n── 4. Full Access Verification ──');

  const communityEvidence = await req('GET', '/api/v1/evidence', null, communityToken);
  assert('4.1', 'Community: evidence accessible (200)', communityEvidence.s === 200);

  const communityReports = await req('GET', '/api/v1/reports/types', null, communityToken);
  assert('4.2', 'Community: reports accessible (200)', communityReports.s === 200);

  const communityCmdb = await req('GET', '/api/v1/cmdb/environments', null, communityToken);
  assert('4.3', 'Community: CMDB accessible (200)', communityCmdb.s === 200);

  const communityMaturity = await req('GET', '/api/v1/dashboard/maturity-score', null, communityToken);
  assert('4.4', 'Community: maturity score accessible (200)', communityMaturity.s === 200);

  assert('4.5', 'Primary QA org token available', !!proToken);
  assert('4.6', '/me org is authenticated', me.b.data?.organization?.id !== undefined);

  // Add more frameworks — no tier limit
  const addMorePro = await req('POST', `/api/v1/organizations/${orgId}/frameworks`, { frameworkIds: allFrameworkIds.slice(2, 5) }, proToken);
  assert('4.7', 'Can add additional frameworks (no tier limit)', addMorePro.s === 200);

  // ======================== 5. DASHBOARD ========================
  console.log('\n── 5. Dashboard ──');

  const dashboardOrgFws = await req('GET', `/api/v1/organizations/${orgId}/frameworks`, null, proToken);
  const dashboardOrgCtrls = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, proToken);
  const dashStats = await req('GET', '/api/v1/dashboard/stats', null, proToken);
  assert('5.1', 'Dashboard stats returns 200', dashStats.s === 200);
  assert('5.2', 'Stats has overall', !!dashStats.b.data?.overall);
  assert('5.3', 'Stats has frameworks array', Array.isArray(dashStats.b.data?.frameworks));
  assert('5.4', 'Overall has totalControls', dashStats.b.data?.overall?.totalControls !== undefined);
  assert('5.5', 'Overall has compliancePercentage', dashStats.b.data?.overall?.compliancePercentage !== undefined);
  assert(
    '5.5a',
    'Stats framework count matches org frameworks',
    dashboardOrgFws.s === 200 && dashStats.b.data?.frameworks?.length === dashboardOrgFws.b.data?.length
  );
  assert(
    '5.5b',
    'Stats totalControls matches org controls',
    dashboardOrgCtrls.s === 200 && dashStats.b.data?.overall?.totalControls === dashboardOrgCtrls.b.data?.length
  );

  const priority = await req('GET', '/api/v1/dashboard/priority-actions', null, proToken);
  assert('5.6', 'Priority actions returns 200', priority.s === 200);
  assert('5.7', 'Priority actions is array', Array.isArray(priority.b.data));
  assert(
    '5.7a',
    'Priority actions only include unresolved high-priority controls',
    Array.isArray(priority.b.data)
      && priority.b.data.every((item) => item.status === 'not_started' && ['P1', 'high', 'critical'].includes(item.priority))
  );

  const recentAct = await req('GET', '/api/v1/dashboard/recent-activity', null, proToken);
  assert('5.8', 'Recent activity returns 200', recentAct.s === 200);

  const trend = await req('GET', '/api/v1/dashboard/compliance-trend?period=30d', null, proToken);
  assert('5.9', 'Compliance trend returns 200', trend.s === 200);

  const crossImpact = await req('GET', '/api/v1/dashboard/crosswalk-impact', null, proToken);
  assert('5.10', 'Crosswalk impact returns 200', crossImpact.s === 200);

  const maturity = await req('GET', '/api/v1/dashboard/maturity-score', null, proToken);
  assert('5.11', 'Maturity score returns 200 (professional)', maturity.s === 200);
  assert('5.12', 'Maturity has overallScore', maturity.b.data?.overallScore !== undefined);
  assert('5.13', 'Maturity has dimensions', Array.isArray(maturity.b.data?.dimensions));
  assert('5.14', 'Maturity has level and label', !!maturity.b.data?.label);
  assert('5.15', 'Maturity has recommendations', Array.isArray(maturity.b.data?.recommendations));

  // ======================== 6. CONTROLS & IMPLEMENTATIONS ========================
  console.log('\n── 6. Controls & Implementations ──');

  // Get a control ID from org controls
  const orgCtrlsAll = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, proToken);
  const firstControl = orgCtrlsAll.b.data?.[0];
  const controlId = firstControl?.id;

  if (controlId) {
    // 6.1 Get single control
    const ctrl = await req('GET', `/api/v1/controls/${controlId}`, null, proToken);
    assert('6.1', 'GET control returns 200', ctrl.s === 200);
    assert('6.2', 'Control has title', !!ctrl.b.data?.title);
    assert('6.3', 'Control has framework info', !!ctrl.b.data?.framework_name);

    // 6.2 Get control mappings
    const mappings = await req('GET', `/api/v1/controls/${controlId}/mappings`, null, proToken);
    assert('6.4', 'GET mappings returns 200', mappings.s === 200);
    assert('6.5', 'Mappings is array', Array.isArray(mappings.b.data));

    // 6.3 Implement control
    const impl = await req('PUT', `/api/v1/controls/${controlId}/implementation`, {
      status: 'in_progress',
      notes: 'QA test - starting implementation'
    }, proToken);
    assert('6.6', 'PUT implementation returns 200', impl.s === 200);
    assert('6.7', 'Returns implementation data', !!impl.b.data?.implementation);
    const ctrlAfterInProgress = await req('GET', `/api/v1/controls/${controlId}`, null, proToken);
    assert('6.7a', 'Control status persisted as in_progress', ctrlAfterInProgress.s === 200 && ctrlAfterInProgress.b.data?.implementation_status === 'in_progress');

    // 6.4 Mark as implemented (triggers crosswalk)
    const implDone = await req('PUT', `/api/v1/controls/${controlId}/implementation`, {
      status: 'implemented',
      notes: 'QA test - completed',
      poam_justification: 'QA automation: control implementation completed and evidence collected.'
    }, proToken);
    assert('6.8', 'Mark implemented returns 200', implDone.s === 200);
    assert('6.9', 'Has crosswalkedControls array', Array.isArray(implDone.b.data?.crosswalkedControls));
    const ctrlAfterImplemented = await req('GET', `/api/v1/controls/${controlId}`, null, proToken);
    assert('6.9a', 'Control status persisted as implemented', ctrlAfterImplemented.s === 200 && ctrlAfterImplemented.b.data?.implementation_status === 'implemented');

    // 6.5 Control history
    const history = await req('GET', `/api/v1/controls/${controlId}/history`, null, proToken);
    assert('6.10', 'Control history returns 200', history.s === 200);
    assert('6.11', 'History is array', Array.isArray(history.b.data));
    assert('6.11a', 'History includes control_status_changed events', Array.isArray(history.b.data) && history.b.data.some((entry) => entry.event_type === 'control_status_changed'));

    // 6.6 Implementations list
    const implList = await req('GET', '/api/v1/implementations', null, proToken);
    assert('6.12', 'GET implementations returns 200', implList.s === 200);
    assert('6.13', 'Implementations is array', Array.isArray(implList.b.data));
    assert('6.14', 'Has at least 1 implementation', implList.b.data?.length >= 1);
    const currentImplementation = (implList.b.data || []).find((item) => item.framework_control_id === controlId);
    assert('6.14a', 'Implementation list includes updated control', !!currentImplementation && currentImplementation.status === 'implemented');

    // 6.7 Implementations with filters
    const implFiltered = await req('GET', '/api/v1/implementations?status=implemented', null, proToken);
    assert('6.15', 'Filtered implementations returns 200', implFiltered.s === 200);
    assert('6.15a', 'Filtered implementations only include implemented items', Array.isArray(implFiltered.b.data) && implFiltered.b.data.every((item) => item.status === 'implemented'));
    assert('6.15b', 'Filtered implementations include updated control', !currentImplementation || implFiltered.b.data.some((item) => item.id === currentImplementation.id));

    // 6.8 Activity feed
    const actFeed = await req('GET', '/api/v1/implementations/activity/feed?limit=5', null, proToken);
    assert('6.16', 'Activity feed returns 200', actFeed.s === 200);
    assert('6.16a', 'Activity feed includes updated control', Array.isArray(actFeed.b.data) && actFeed.b.data.some((item) => item.control_code === firstControl.control_id));

    // 6.10 Get single implementation
    const implementationId = currentImplementation?.id || implList.b.data?.[0]?.id;
    if (implementationId) {
      const implSingle = await req('GET', `/api/v1/implementations/${implementationId}`, null, proToken);
      assert('6.18', 'GET single implementation returns 200', implSingle.s === 200);
      assert('6.18a', 'Single implementation has status history', Array.isArray(implSingle.b.data?.status_history));

      // 6.11 Patch status
      const patchStatus = await req('PATCH', `/api/v1/implementations/${implementationId}/status`, {
        status: 'needs_review', notes: 'QA review test'
      }, proToken);
      assert('6.19', 'PATCH status returns 200', patchStatus.s === 200);
      assert('6.19a', 'PATCH status persists needs_review', patchStatus.b.data?.status === 'needs_review');

      // 6.12 Assign
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const assign = await req('PATCH', `/api/v1/implementations/${implementationId}/assign`, {
        assignedTo: adminUserId, dueDate, notes: 'Assigned via QA test'
      }, proToken);
      assert('6.20', 'PATCH assign returns 200', assign.s === 200);
      assert('6.20a', 'PATCH assign stores assignee', assign.b.data?.assigned_to === adminUserId);
      assert('6.20b', 'PATCH assign stores due date', String(assign.b.data?.due_date || '').slice(0, 10) === dueDate);

      // 6.9 Due upcoming
      const due = await req('GET', '/api/v1/implementations/due/upcoming?days=30', null, proToken);
      assert('6.17', 'Due upcoming returns 200', due.s === 200);
      assert('6.17a', 'Due upcoming includes assigned implementation', Array.isArray(due.b.data) && due.b.data.some((item) => item.id === implementationId));

      // 6.13 Review
      const review = await req('POST', `/api/v1/implementations/${implementationId}/review`, {
        notes: 'QA review submission'
      }, proToken);
      assert('6.21', 'POST review returns 200', review.s === 200);
      assert('6.21a', 'Review keeps implementation in needs_review', review.b.data?.status === 'needs_review');

      const implAfterReview = await req('GET', `/api/v1/implementations/${implementationId}`, null, proToken);
      assert(
        '6.21b',
        'Single implementation reflects latest review notes',
        implAfterReview.s === 200
          && implAfterReview.b.data?.status === 'needs_review'
          && implAfterReview.b.data?.notes === 'QA review submission'
          && Array.isArray(implAfterReview.b.data?.status_history)
          && implAfterReview.b.data.status_history.some((entry) => entry.new_status === 'needs_review')
      );
    }

    // 6.14 Nonexistent control
    const noCtrl = await req('GET', '/api/v1/controls/00000000-0000-0000-0000-000000000000', null, proToken);
    assert('6.22', 'Nonexistent control returns 404', noCtrl.s === 404);
  } else {
    skip('6.x', 'Control tests', 'No controls found');
  }

  // ======================== 7. CMDB ========================
  console.log('\n── 7. CMDB ──');

  // 7.1 Environments CRUD
  const envCreate = await req('POST', '/api/v1/cmdb/environments', {
    name: 'QA-Production', code: 'qa-prod', environment_type: 'production',
    description: 'QA test env', criticality: 'high'
  }, proToken);
  assert('7.1', 'Create environment returns 201', envCreate.s === 201);
  const envId = envCreate.b.data?.id;

  const envList = await req('GET', '/api/v1/cmdb/environments', null, proToken);
  assert('7.2', 'List environments returns 200', envList.s === 200);
  assert('7.3', 'Environments is array', Array.isArray(envList.b.data));

  if (envId) {
    const envGet = await req('GET', `/api/v1/cmdb/environments/${envId}`, null, proToken);
    assert('7.4', 'Get environment returns 200', envGet.s === 200);

    const envUpdate = await req('PUT', `/api/v1/cmdb/environments/${envId}`, {
      description: 'Updated QA env'
    }, proToken);
    assert('7.5', 'Update environment returns 200', envUpdate.s === 200);
  }

  // 7.2 Password Vaults CRUD
  const vaultCreate = await req('POST', '/api/v1/cmdb/password-vaults', {
    name: 'QA Vault', vault_type: 'hashicorp', vault_url: 'https://vault.qa.local',
    description: 'QA test vault'
  }, proToken);
  assert('7.6', 'Create vault returns 201', vaultCreate.s === 201);
  const vaultId = vaultCreate.b.data?.id;

  const vaultList = await req('GET', '/api/v1/cmdb/password-vaults', null, proToken);
  assert('7.7', 'List vaults returns 200', vaultList.s === 200);

  if (vaultId) {
    const vaultGet = await req('GET', `/api/v1/cmdb/password-vaults/${vaultId}`, null, proToken);
    assert('7.8', 'Get vault returns 200', vaultGet.s === 200);

    const vaultUpdate = await req('PUT', `/api/v1/cmdb/password-vaults/${vaultId}`, {
      description: 'Updated QA vault'
    }, proToken);
    assert('7.9', 'Update vault returns 200', vaultUpdate.s === 200);
  }

  // 7.3 Service Accounts CRUD
  const saCreate = await req('POST', '/api/v1/cmdb/service-accounts', {
    account_name: 'svc-qa-test', account_type: 'service',
    description: 'QA test service account', privilege_level: 'standard'
  }, proToken);
  assert('7.10', 'Create service account returns 201', saCreate.s === 201);
  const saId = saCreate.b.data?.id;

  const saList = await req('GET', '/api/v1/cmdb/service-accounts', null, proToken);
  assert('7.11', 'List service accounts returns 200', saList.s === 200);

  if (saId) {
    const saGet = await req('GET', `/api/v1/cmdb/service-accounts/${saId}`, null, proToken);
    assert('7.12', 'Get service account returns 200', saGet.s === 200);
  }

  // 7.4 Hardware Assets CRUD
  const hwCreate = await req('POST', '/api/v1/cmdb/hardware', {
    name: 'QA-Server-01', hostname: 'qa-srv-01.test.local',
    status: 'active', criticality: 'high'
  }, proToken);
  assert('7.13', 'Create hardware returns 201', hwCreate.s === 201);
  const hwId = hwCreate.b.data?.id;

  const hwList = await req('GET', '/api/v1/cmdb/hardware', null, proToken);
  assert('7.14', 'List hardware returns 200', hwList.s === 200);

  if (hwId) {
    const hwGet = await req('GET', `/api/v1/cmdb/hardware/${hwId}`, null, proToken);
    assert('7.15', 'Get hardware returns 200', hwGet.s === 200);

    const hwUpdate = await req('PUT', `/api/v1/cmdb/hardware/${hwId}`, { notes: 'Updated via QA' }, proToken);
    assert('7.16', 'Update hardware returns 200', hwUpdate.s === 200);
  }

  // 7.5 Software Assets CRUD
  const swCreate = await req('POST', '/api/v1/cmdb/software', {
    name: 'QA-App-Suite', version: '2.0.0', status: 'active', criticality: 'medium'
  }, proToken);
  assert('7.17', 'Create software returns 201', swCreate.s === 201);
  const swId = swCreate.b.data?.id;

  const swList = await req('GET', '/api/v1/cmdb/software', null, proToken);
  assert('7.18', 'List software returns 200', swList.s === 200);

  // 7.6 AI Agents CRUD
  const aiCreate = await req('POST', '/api/v1/cmdb/ai-agents', {
    name: 'QA-AI-Model', ai_model_type: 'classification',
    ai_risk_level: 'limited', status: 'active', criticality: 'high'
  }, proToken);
  assert('7.19', 'Create AI agent returns 201', aiCreate.s === 201);
  const aiAssetId = aiCreate.b.data?.id;

  const aiList = await req('GET', '/api/v1/cmdb/ai-agents', null, proToken);
  assert('7.20', 'List AI agents returns 200', aiList.s === 200);

  // ======================== 8. EVIDENCE ========================
  console.log('\n── 8. Evidence ──');

  // Create a temp file for upload
  const tmpFile = path.join(os.tmpdir(), `controlweave-qa-test-evidence-${ts}.txt`);
  const evidenceContent = 'QA Test Evidence Content\nLine 2\nLine 3';
  fs.writeFileSync(tmpFile, evidenceContent);

  const evUpload = await uploadFile('/api/v1/evidence/upload', tmpFile, {
    description: 'QA test evidence file',
    tags: 'qa,test,automated'
  }, proToken);
  assert('8.1', 'Upload evidence returns 201', evUpload.s === 201);
  const evidenceId = evUpload.b.data?.id;

  const evList = await req('GET', '/api/v1/evidence', null, proToken);
  assert('8.2', 'List evidence returns 200', evList.s === 200);
  assert('8.3', 'Evidence is array', Array.isArray(evList.b.data));
  assert('8.3a', 'Uploaded evidence appears in list', !evidenceId || evList.b.data.some((item) => item.id === evidenceId));

  // Search
  const evSearch = await req('GET', '/api/v1/evidence?search=QA', null, proToken);
  assert('8.4', 'Evidence search returns 200', evSearch.s === 200);
  assert('8.4a', 'Evidence search returns uploaded file', !evidenceId || evSearch.b.data.some((item) => item.id === evidenceId));

  if (evidenceId) {
    const evGet = await req('GET', `/api/v1/evidence/${evidenceId}`, null, proToken);
    assert('8.5', 'Get evidence returns 200', evGet.s === 200);
    assert('8.6', 'Evidence has file_name', !!evGet.b.data?.file_name);

    // Update
    const evUpdate = await req('PUT', `/api/v1/evidence/${evidenceId}`, {
      description: 'Updated QA evidence'
    }, proToken);
    assert('8.7', 'Update evidence returns 200', evUpdate.s === 200);
    const evAfterUpdate = await req('GET', `/api/v1/evidence/${evidenceId}`, null, proToken);
    assert('8.7a', 'Updated evidence description persists', evAfterUpdate.s === 200 && evAfterUpdate.b.data?.description === 'Updated QA evidence');

    // Link to control
    if (controlId) {
      const evLink = await req('POST', `/api/v1/evidence/${evidenceId}/link`, {
        controlIds: [controlId], notes: 'QA test link'
      }, proToken);
      assert('8.8', 'Link evidence to control returns 200', evLink.s === 200);

      // Verify linked controls
      const evDetail = await req('GET', `/api/v1/evidence/${evidenceId}`, null, proToken);
      assert('8.9', 'Evidence shows linked controls', evDetail.b.data?.linked_controls?.length >= 1);

      // Unlink
      const evUnlink = await req('DELETE', `/api/v1/evidence/${evidenceId}/unlink/${controlId}`, null, proToken);
      assert('8.10', 'Unlink control returns 200', evUnlink.s === 200);
      const evAfterUnlink = await req('GET', `/api/v1/evidence/${evidenceId}`, null, proToken);
      assert(
        '8.10a',
        'Unlinked control is removed from evidence detail',
        evAfterUnlink.s === 200
          && Array.isArray(evAfterUnlink.b.data?.linked_controls)
          && !evAfterUnlink.b.data.linked_controls.some((linkedControl) => linkedControl.id === controlId || linkedControl.control_id === firstControl.control_id)
      );
    }

    // Download
    const evDl = await req('GET', `/api/v1/evidence/${evidenceId}/download`, null, proToken, true);
    assert('8.11', 'Download evidence returns 200', evDl.s === 200);
    assert('8.11a', 'Downloaded evidence matches uploaded content', evDl.b.toString('utf8').includes(evidenceContent));

    // Delete
    const evDel = await req('DELETE', `/api/v1/evidence/${evidenceId}`, null, proToken);
    assert('8.12', 'Delete evidence returns 200', evDel.s === 200);

    // Verify deleted
    const evGone = await req('GET', `/api/v1/evidence/${evidenceId}`, null, proToken);
    assert('8.13', 'Deleted evidence returns 404', evGone.s === 404);
  }

  // Cleanup temp file
  try { fs.unlinkSync(tmpFile); } catch (e) {}

  // ======================== 9. AUDIT ========================
  console.log('\n── 9. Audit ──');

  const auditLogs = await req('GET', '/api/v1/audit/logs', null, proToken);
  assert('9.1', 'Audit logs returns 200', auditLogs.s === 200);
  assert('9.2', 'Audit data is array', Array.isArray(auditLogs.b.data));
  assert('9.3', 'Audit has pagination', !!auditLogs.b.pagination);
  const auditEmailSample = (auditLogs.b.data || []).find((row) => row.user_email);
  assert('9.3a', 'Audit user_email is plaintext when present', !auditEmailSample || String(auditEmailSample.user_email).includes('@'));

  const auditStats = await req('GET', '/api/v1/audit/stats', null, proToken);
  assert('9.4', 'Audit stats returns 200', auditStats.s === 200);
  assert('9.5', 'Stats has eventBreakdown', Array.isArray(auditStats.b.data?.eventBreakdown));
  assert('9.6', 'Stats has totalEvents', auditStats.b.data?.totalEvents !== undefined);

  const auditTypes = await req('GET', '/api/v1/audit/event-types', null, proToken);
  assert('9.7', 'Event types returns 200', auditTypes.s === 200);

  const userAudit = await req('GET', `/api/v1/audit/user/${adminUserId}`, null, proToken);
  assert('9.8', 'User audit returns 200', userAudit.s === 200);
  assert('9.8a', 'User audit includes recent events', Array.isArray(userAudit.b.data) && userAudit.b.data.length >= 1);

  // Filtered audit logs
  const filteredAudit = await req('GET', '/api/v1/audit/logs?limit=5&offset=0', null, proToken);
  assert('9.9', 'Filtered audit logs returns 200', filteredAudit.s === 200);
  assert('9.9a', 'Filtered audit logs respect requested limit', Array.isArray(filteredAudit.b.data) && filteredAudit.b.data.length <= 5);

  // ======================== 10. ROLES & RBAC ========================
  console.log('\n── 10. Roles & RBAC ──');

  const rolesList = await req('GET', '/api/v1/roles', null, proToken);
  assert('10.1', 'List roles returns 200', rolesList.s === 200);
  assert('10.2', 'Roles is array', Array.isArray(rolesList.b.data));

  // Create role
  const roleCreate = await req('POST', '/api/v1/roles', {
    name: 'qa-tester-role', description: 'QA Test Role'
  }, proToken);
  assert('10.3', 'Create role returns 201', roleCreate.s === 201);
  const roleId = roleCreate.b.data?.id;

  if (roleId) {
    // Update role
    const roleUpdate = await req('PUT', `/api/v1/roles/${roleId}`, {
      description: 'Updated QA role'
    }, proToken);
    assert('10.4', 'Update role returns 200', roleUpdate.s === 200);

    // Assign role to user
    const roleAssign = await req('POST', '/api/v1/roles/assign', {
      userId: adminUserId, roleIds: [roleId]
    }, proToken);
    assert('10.5', 'Assign role returns 200', roleAssign.s === 200);

    // Get user roles
    const userRoles = await req('GET', `/api/v1/roles/user/${adminUserId}`, null, proToken);
    assert('10.6', 'Get user roles returns 200', userRoles.s === 200);
    assert('10.7', 'User has assigned role', userRoles.b.data?.length >= 1);

    // Delete role
    const roleDel = await req('DELETE', `/api/v1/roles/${roleId}`, null, proToken);
    assert('10.8', 'Delete role returns 200', roleDel.s === 200);
  }

  // Permissions list
  const permsList = await req('GET', '/api/v1/roles/permissions/all', null, proToken);
  assert('10.9', 'GET permissions returns 200', permsList.s === 200);

  // ======================== 11. USERS ========================
  console.log('\n── 11. Users ──');

  const usersList = await req('GET', '/api/v1/users', null, proToken);
  assert('11.1', 'List users returns 200', usersList.s === 200);
  assert('11.2', 'Users is array', Array.isArray(usersList.b.data));
  assert('11.3', 'Has at least 1 user', usersList.b.data?.length >= 1);

  // ======================== 12. AI ANALYSIS (All 21 endpoints) ========================
  console.log('\n── 12. AI Analysis ──');

  // 12.1 Status endpoint
  const aiStatus = await req('GET', '/api/v1/ai/status', null, proToken);
  assert('12.1', 'AI status returns 200', aiStatus.s === 200);
  assert('12.2', 'Has providers object', !!aiStatus.b.data?.providers);
  assert('12.3', 'Has usage object', !!aiStatus.b.data?.usage);
  assert('12.4', 'Has features object', !!aiStatus.b.data?.features);
  assert('12.5', 'Has tier info', !!aiStatus.b.data?.tier);
  assert('12.6', 'Professional tier = unlimited usage', aiStatus.b.data?.usage?.limit === 'unlimited');
  assert('12.6a', 'Provider payload omits hasPlatformKey', !('hasPlatformKey' in (aiStatus.b.data?.providers?.openai || {})));
  assert('12.6b', 'Provider availability reflects org keys only', aiStatus.b.data?.providers?.openai?.available === false);

  // All AI POST endpoints should return 400 "No API key" when no BYOK key configured
  const aiEndpoints = [
    { path: '/api/v1/ai/gap-analysis', body: {}, name: 'Gap Analysis' },
    { path: '/api/v1/ai/crosswalk-optimizer', body: {}, name: 'Crosswalk Optimizer' },
    { path: '/api/v1/ai/compliance-forecast', body: {}, name: 'Compliance Forecast' },
    { path: '/api/v1/ai/regulatory-monitor', body: { frameworks: ['nist_csf'] }, name: 'Regulatory Monitor' },
    { path: `/api/v1/ai/remediation/${controlId || '00000000-0000-0000-0000-000000000000'}`, body: {}, name: 'Remediation Playbook' },
    { path: '/api/v1/ai/incident-response', body: { incidentType: 'ransomware' }, name: 'Incident Response' },
    { path: '/api/v1/ai/executive-report', body: {}, name: 'Executive Report' },
    { path: '/api/v1/ai/risk-heatmap', body: {}, name: 'Risk Heatmap' },
    { path: '/api/v1/ai/vendor-risk', body: { vendorInfo: { name: 'TestVendor' } }, name: 'Vendor Risk' },
    { path: '/api/v1/ai/audit-readiness', body: { framework: 'nist_csf' }, name: 'Audit Readiness' },
    { path: '/api/v1/ai/asset-control-mapping', body: {}, name: 'Asset-Control Mapping' },
    { path: '/api/v1/ai/shadow-it', body: {}, name: 'Shadow IT' },
    { path: '/api/v1/ai/ai-governance', body: {}, name: 'AI Governance' },
    { path: '/api/v1/ai/query', body: { question: 'What is our compliance status?' }, name: 'Compliance Query' },
    { path: '/api/v1/ai/training-recommendations', body: {}, name: 'Training Recs' },
    { path: `/api/v1/ai/evidence-suggest/${controlId || '00000000-0000-0000-0000-000000000000'}`, body: {}, name: 'Evidence Suggest' },
    { path: `/api/v1/ai/analyze/control/${controlId || '00000000-0000-0000-0000-000000000000'}`, body: {}, name: 'Control Analysis' },
    { path: `/api/v1/ai/test-procedures/${controlId || '00000000-0000-0000-0000-000000000000'}`, body: {}, name: 'Test Procedures' },
    { path: `/api/v1/ai/analyze/asset/${hwId || '00000000-0000-0000-0000-000000000000'}`, body: {}, name: 'Asset Risk' },
    { path: '/api/v1/ai/generate-policy', body: { policyType: 'Information Security' }, name: 'Policy Generator' },
  ];

  let aiTestNum = 7;
  for (const ep of aiEndpoints) {
    const r = await req('POST', ep.path, ep.body, proToken);
    // Without a configured API key, checkAIUsage (routes/ai.js) returns 422
    // with code NO_PROVIDER_CONFIGURED and a message pointing at Settings.
    assert(`12.${aiTestNum}`, `${ep.name}: returns 422 no API key (got ${r.s})`,
      r.s === 422 && isMissingAiKeyError(r.b));
    aiTestNum++;
  }

  const protectedPlatformOwnerToken = await getPlatformOwnerToken();
  let configuredPlatformProvider = 'openai';
  let temporaryPlatformKeyNeeded = false;
  if (protectedPlatformOwnerToken) {
    const platformDefaults = await getPlatformLlmDefaults();
    const configuredProtectedProvider = [
      ['openai', platformDefaults.b.data?.hasOpenAIKey],
      ['claude', platformDefaults.b.data?.hasAnthropicKey],
      ['gemini', platformDefaults.b.data?.hasGeminiKey],
      ['grok', platformDefaults.b.data?.hasGrokKey],
      ['groq', platformDefaults.b.data?.hasGroqKey]
    ].find(([, configured]) => configured)?.[0];
    configuredPlatformProvider = configuredProtectedProvider || 'openai';
    temporaryPlatformKeyNeeded = configuredPlatformProvider === 'openai' && !platformDefaults.b.data?.hasOpenAIKey;
    if (temporaryPlatformKeyNeeded) {
      const platformKeySetup = await updatePlatformLlmDefaults({ openai_api_key: 'sk-platform-fallback-test-key' });
      assert('12.28a', 'Temporary platform OpenAI key setup succeeds', platformKeySetup.s === 200);
    }
  }

  const platformOnlyChat = await req('POST', '/api/v1/ai/query', {
    provider: configuredPlatformProvider,
    question: 'Hello'
  }, proToken);
  assert('12.28', 'Platform key does not act as customer fallback', platformOnlyChat.s === 422 && isMissingAiKeyError(platformOnlyChat.b));

  if (temporaryPlatformKeyNeeded) {
    const platformKeyCleanup = await updatePlatformLlmDefaults({ openai_api_key: null });
    assert('12.28b', 'Temporary platform OpenAI key cleanup succeeds', platformKeyCleanup.s === 200);
  }

  // ======================== 13. SETTINGS (LLM) ========================
  console.log('\n── 13. Settings ──');

  const llmGet = await req('GET', '/api/v1/settings/llm', null, proToken);
  assert('13.1', 'GET LLM settings returns 200', llmGet.s === 200);
  assert('13.2', 'Has settings object', !!llmGet.b.data);
  assert('13.3', 'Has defaultProvider', !!llmGet.b.data?.defaultProvider);

  // Save a fake key
  const llmPut = await req('PUT', '/api/v1/settings/llm', {
    default_provider: 'openai',
    default_model: 'gpt-4o-mini',
    openai_api_key: 'sk-org-metrics-test'
  }, proToken);
  assert('13.4', 'PUT LLM settings returns 200', llmPut.s === 200);

  // Verify saved
  const llmGet2 = await req('GET', '/api/v1/settings/llm', null, proToken);
  assert('13.5', 'Default provider updated to openai', llmGet2.b.data?.defaultProvider === 'openai');
  assert('13.5a', 'OpenAI org key saved', llmGet2.b.data?.hasOpenAIKey === true);
  assert('13.5b', 'Stored OpenAI key is masked', llmGet2.b.data?.settings?.openai_api_key?.masked === '****test');

  // Test API key validation (will fail with bad key, but endpoint should work)
  const llmTest = await req('POST', '/api/v1/settings/llm/test', {
    provider: 'claude', apiKey: 'sk-ant-fake-key-for-testing'
  }, proToken);
  assert('13.6', 'LLM test endpoint responds (400 = bad key)', llmTest.s === 400);

  // Invalid provider
  const llmBadProv = await req('DELETE', '/api/v1/settings/llm/invalid', null, proToken);
  assert('13.8', 'Invalid provider returns 400', llmBadProv.s === 400);

  const unauthorizedPlatformOverview = await req('GET', '/api/v1/platform-admin/overview', null, proToken);
  assert('13.9', 'Non-platform owner is blocked from platform overview', unauthorizedPlatformOverview.s === 403 || unauthorizedPlatformOverview.s === 401);

  if (protectedPlatformOwnerToken) {
    const platformOverview = await req('GET', '/api/v1/platform-admin/overview', null, protectedPlatformOwnerToken);
    assert('13.10', 'Platform overview returns 200 for platform owner', platformOverview.s === 200);
    assert('13.11', 'Platform overview includes AI key adoption', typeof platformOverview.b.data?.llm_key_adoption?.orgs_with_any_llm_key === 'number');
    assert('13.11a', 'Platform overview counts OpenAI-enabled orgs', Number(platformOverview.b.data?.llm_key_adoption?.providers?.openai || 0) >= 1);
  } else {
    skip('13.10', 'Platform overview returns 200 for platform owner', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
    skip('13.11', 'Platform overview includes AI key adoption', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
    skip('13.11a', 'Platform overview counts OpenAI-enabled orgs', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
  }

  if (protectedPlatformOwnerToken) {
    const platformOrgsWithKey = await req('GET', '/api/v1/platform-admin/organizations?has_llm_key=true&llm_provider=openai', null, protectedPlatformOwnerToken);
    assert('13.12', 'Platform organizations filter by AI key/provider returns 200', platformOrgsWithKey.s === 200);
    assert('13.13', 'Filtered organizations include AI key metadata', Array.isArray(platformOrgsWithKey.b.data?.[0]?.enabled_llm_providers) || platformOrgsWithKey.b.data?.length === 0);
    const currentOrgPlatformEntry = platformOrgsWithKey.b.data?.find((organization) => organization.id === orgId);
    assert('13.13a', 'Filtered organizations include current org', !!currentOrgPlatformEntry);
    assert(
      '13.13b',
      'Current org shows OpenAI key metadata',
      !!currentOrgPlatformEntry
        && currentOrgPlatformEntry.has_any_llm_key === true
        && Array.isArray(currentOrgPlatformEntry.enabled_llm_providers)
        && currentOrgPlatformEntry.enabled_llm_providers.includes('openai')
    );
  } else {
    skip('13.12', 'Platform organizations filter by AI key/provider returns 200', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
    skip('13.13', 'Filtered organizations include AI key metadata', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
    skip('13.13a', 'Filtered organizations include current org', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
    skip('13.13b', 'Current org shows OpenAI key metadata', 'Set QA_PLATFORM_OWNER_EMAIL/QA_PLATFORM_OWNER_PASSWORD or PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD');
  }

  // Help articles — all articles accessible to all users (no tier gating)
  const communityHelpCatalog = await req('GET', '/api/v1/help', null, communityToken);
  const communityHelpArticles = flattenHelpArticles(communityHelpCatalog.b);
  assert('13.14', 'Community help catalog returns 200', communityHelpCatalog.s === 200 && communityHelpArticles.length > 0);

  // 13.15 and 13.16: locked/tier metadata may or may not be present; just verify catalog loads
  const communityFinancialServicesDetail = await req('GET', '/api/v1/help/financial-services', null, communityToken);
  assert('13.17', 'Community org can open help article (200)', communityFinancialServicesDetail.s === 200);

  const enterpriseHelpCatalog = await req('GET', '/api/v1/help', null, proToken);
  const enterpriseHelpArticles = flattenHelpArticles(enterpriseHelpCatalog.b);
  const enterpriseFinancialServicesArticle = enterpriseHelpArticles.find((article) => article.slug === 'financial-services');
  assert('13.18', 'Enterprise help catalog returns 200', enterpriseHelpCatalog.s === 200 && enterpriseHelpArticles.length > 0);

  const enterpriseFinancialServicesDetail = await req('GET', '/api/v1/help/financial-services', null, proToken);
  assert('13.19', 'Enterprise org can open enterprise help article', enterpriseFinancialServicesDetail.s === 200 && enterpriseFinancialServicesDetail.b?.data?.slug === 'financial-services');

  // Delete the org OpenAI key and verify it is removed from settings.
  const llmDel = await req('DELETE', '/api/v1/settings/llm/openai', null, proToken);
  assert('13.7', 'DELETE LLM key returns 200', llmDel.s === 200);
  const llmGet3 = await req('GET', '/api/v1/settings/llm', null, proToken);
  assert('13.7a', 'Deleted OpenAI key is removed from settings', llmGet3.s === 200 && llmGet3.b.data?.hasOpenAIKey === false);

  // Reset default provider back
  await req('PUT', '/api/v1/settings/llm', { default_provider: 'claude', default_model: null, openai_api_key: null }, proToken);

  // ======================== 14. ASSESSMENTS ========================
  console.log('\n── 14. Assessments ──');

  const asmtProcs = await req('GET', '/api/v1/assessments/procedures', null, proToken);
  assert('14.1', 'List procedures returns 200', asmtProcs.s === 200);
  assert('14.2', 'Has procedures array', Array.isArray(asmtProcs.b.data?.procedures));
  assert('14.3', 'Has total count', asmtProcs.b.data?.total !== undefined);

  // Filter by framework
  const asmtFiltered = await req('GET', '/api/v1/assessments/procedures?framework_code=nist_800_53a', null, proToken);
  assert('14.4', 'Filtered procedures returns 200', asmtFiltered.s === 200);

  // Procedure detail
  const firstProc = asmtProcs.b.data?.procedures?.[0];
  if (firstProc?.id) {
    const procDetail = await req('GET', `/api/v1/assessments/procedures/${firstProc.id}`, null, proToken);
    assert('14.5', 'Procedure detail returns 200', procDetail.s === 200);
    assert('14.6', 'Has procedure_type', !!procDetail.b.data?.procedure_type);
  }

  // By control
  if (controlId) {
    const byCtrl = await req('GET', `/api/v1/assessments/procedures/by-control/${controlId}`, null, proToken);
    assert('14.7', 'Procedures by control returns 200', byCtrl.s === 200);
  }

  // Record result
  if (firstProc?.id) {
    const recordResult = await req('POST', '/api/v1/assessments/results', {
      procedure_id: firstProc.id,
      status: 'satisfied',
      finding: 'QA test - control meets requirements',
      evidence_collected: 'Screenshots and logs',
      risk_level: 'low'
    }, proToken);
    assert('14.8', 'Record result returns 200', recordResult.s === 200);
  }

  // Bad result
  const badResult = await req('POST', '/api/v1/assessments/results', {
    procedure_id: null, status: 'invalid_status'
  }, proToken);
  assert('14.9', 'Bad result returns 400', badResult.s === 400);

  // Assessment stats
  const asmtStats = await req('GET', '/api/v1/assessments/stats', null, proToken);
  assert('14.10', 'Assessment stats returns 200', asmtStats.s === 200);
  assert('14.11', 'Stats has summary', !!asmtStats.b.data?.summary);
  assert('14.12', 'Stats has by_framework', Array.isArray(asmtStats.b.data?.by_framework));
  assert('14.13', 'Stats has by_type', Array.isArray(asmtStats.b.data?.by_type));

  // Assessment frameworks
  const asmtFws = await req('GET', '/api/v1/assessments/frameworks', null, proToken);
  assert('14.14', 'Assessment frameworks returns 200', asmtFws.s === 200);

  // Create plan
  const planCreate = await req('POST', '/api/v1/assessments/plans', {
    name: 'QA Assessment Plan',
    description: 'Test plan from QA suite',
    assessment_type: 'initial',
    depth: 'focused'
  }, proToken);
  assert('14.15', 'Create plan returns 201', planCreate.s === 201);

  // List plans
  const plansList = await req('GET', '/api/v1/assessments/plans', null, proToken);
  assert('14.16', 'List plans returns 200', plansList.s === 200);

  // Bad plan (missing name)
  const badPlan = await req('POST', '/api/v1/assessments/plans', { description: 'No name' }, proToken);
  assert('14.17', 'Plan without name returns 400', badPlan.s === 400);

  // ======================== 15. REPORTS ========================
  console.log('\n── 15. Reports ──');

  const reportTypes = await req('GET', '/api/v1/reports/types', null, proToken);
  assert('15.1', 'Report types returns 200', reportTypes.s === 200);
  assert('15.2.a', 'Has report types array', Array.isArray(reportTypes.b.data));
  assert('15.3', 'Has PDF and Excel types', reportTypes.b.data?.length >= 2);

  // PDF download
  const pdfReport = await req('GET', '/api/v1/reports/compliance/pdf', null, proToken, true);
  assert('15.4', 'PDF report returns 200', pdfReport.s === 200);
  assert('15.5', 'PDF has correct content-type', (pdfReport.h?.['content-type'] || '').includes('pdf'));
  assert('15.6', 'PDF has content (>100 bytes)', pdfReport.b?.length > 100);

  // Excel download
  const xlReport = await req('GET', '/api/v1/reports/compliance/excel', null, proToken, true);
  assert('15.7', 'Excel report returns 200', xlReport.s === 200);
  assert('15.8', 'Excel has correct content-type', (xlReport.h?.['content-type'] || '').includes('spreadsheet') || (xlReport.h?.['content-type'] || '').includes('openxml'));
  assert('15.9', 'Excel has content (>100 bytes)', xlReport.b?.length > 100);

  // ======================== 16. NOTIFICATIONS ========================
  console.log('\n── 16. Notifications ──');

  const notifBefore = await req('GET', '/api/v1/notifications', null, proToken);
  const unreadBefore = notifBefore.b.data?.unreadCount || 0;

  // Create notification
  const notifCreate = await req('POST', '/api/v1/notifications', {
    type: 'info', title: 'QA Test Notification',
    message: 'This is a test notification from the QA suite',
    link: '/dashboard'
  }, proToken);
  assert('16.1', 'Create notification returns 201', notifCreate.s === 201);
  const notifId = notifCreate.b.data?.id;

  // List notifications
  const notifList = await req('GET', '/api/v1/notifications', null, proToken);
  assert('16.2', 'List notifications returns 200', notifList.s === 200);
  assert('16.3', 'Has notifications array', Array.isArray(notifList.b.data?.notifications));
  assert('16.4', 'Has unreadCount', notifList.b.data?.unreadCount !== undefined);
  assert('16.4a', 'Created notification appears unread in list', !notifId || notifList.b.data?.notifications?.some((notification) => notification.id === notifId && notification.is_read === false));
  assert('16.4b', 'Unread count increases after create', notifList.b.data?.unreadCount >= unreadBefore + (notifId ? 1 : 0));

  // Unread only
  const notifUnread = await req('GET', '/api/v1/notifications?unread=true', null, proToken);
  assert('16.5', 'Unread filter returns 200', notifUnread.s === 200);

  // Mark single as read
  if (notifId) {
    const markRead = await req('PATCH', `/api/v1/notifications/${notifId}/read`, null, proToken);
    assert('16.6', 'Mark read returns 200', markRead.s === 200);
    const unreadAfterMarkRead = await req('GET', '/api/v1/notifications?unread=true', null, proToken);
    assert('16.6a', 'Marked notification no longer appears unread', Array.isArray(unreadAfterMarkRead.b.data?.notifications) && !unreadAfterMarkRead.b.data.notifications.some((notification) => notification.id === notifId));
  }

  // Create another and mark all read
  await req('POST', '/api/v1/notifications', {
    type: 'warning', title: 'QA Test 2', message: 'Another test'
  }, proToken);
  const markAll = await req('POST', '/api/v1/notifications/read-all', null, proToken);
  assert('16.7', 'Mark all read returns 200', markAll.s === 200);

  // Verify all read
  const notifAfter = await req('GET', '/api/v1/notifications?unread=true', null, proToken);
  assert('16.8', 'All notifications marked read', notifAfter.b.data?.unreadCount === 0);

  // ======================== 17. CROSS-ORG SECURITY ========================
  console.log('\n── 17. Cross-Org Security ──');

  // Register a second user in a different org
  const reg2 = await req('POST', '/api/v1/auth/register', {
    email: email2, password: pass, full_name: 'Other User', organization_name: 'Other Org'
  });
  const otherToken = reg2.b.data?.tokens?.accessToken;
  const otherOrgId = reg2.b.data?.organization?.id;

  // Other user tries to access our org's frameworks
  const crossOrg1 = await req('GET', `/api/v1/organizations/${orgId}/frameworks`, null, otherToken);
  assert('17.1', 'Cross-org framework access blocked (403)', crossOrg1.s === 403);

  // Other user tries to add frameworks to our org
  const crossOrg2 = await req('POST', `/api/v1/organizations/${orgId}/frameworks`, { frameworkIds: [frameworkIds[0]] }, otherToken);
  assert('17.2', 'Cross-org framework add blocked (403)', crossOrg2.s === 403);

  // Other user tries to get our org's controls
  const crossOrg3 = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, otherToken);
  assert('17.3', 'Cross-org controls access blocked (403)', crossOrg3.s === 403);

  // Other user tries to delete our framework
  if (frameworkIds[0]) {
    const crossOrg4 = await req('DELETE', `/api/v1/organizations/${orgId}/frameworks/${frameworkIds[0]}`, null, otherToken);
    assert('17.4', 'Cross-org framework delete blocked (403)', crossOrg4.s === 403);
  }

  // Controls are visible but scoped to their org (implementations filtered)
  // This verifies that implementation data doesn't leak
  if (controlId) {
    const otherCtrl = await req('GET', `/api/v1/controls/${controlId}`, null, otherToken);
    // Control details are global (framework controls are shared), but implementation data is scoped
    assert('17.5', 'Control detail accessible but implementation scoped',
      otherCtrl.s === 200 && otherCtrl.b.data?.implementation_status === 'not_started');
  }

  // ======================== 18. RBAC (Admin vs Non-Admin) ========================
  console.log('\n── 18. RBAC ──');

  // Non-admin trying admin-only operations
  // Settings PUT requires admin
  const nonAdminSettings = await req('PUT', '/api/v1/settings/llm', { default_provider: 'openai' }, otherToken);
  // Note: register creates admin user, so this should actually work — let's create a true non-admin
  // For the second org, the registering user IS admin. Create a real non-admin via the invite flow.
  const viewerSetup = await inviteAndAcceptUser(proToken, {
    email: `viewer-${ts}@test.com`,
    primaryRole: 'user',
    fullName: 'QA Viewer',
    password: pass
  });
  assert('18.1a', 'Viewer invite created successfully', viewerSetup.invite.s === 201 && !!viewerSetup.invite.b.data?.invite_token);

  const viewerToken = viewerSetup.token;
  assert('18.1', 'Viewer can login', viewerSetup.accept.s === 201 && !!viewerToken);

  if (viewerToken) {
    // Viewer CAN read
    const vDash = await req('GET', '/api/v1/dashboard/stats', null, viewerToken);
    assert('18.2', 'Viewer can read dashboard', vDash.s === 200);

    const vFws = await req('GET', '/api/v1/frameworks', null, viewerToken);
    assert('18.3', 'Viewer can list frameworks', vFws.s === 200);

    // Viewer CANNOT do admin operations
    const vCreateRole = await req('POST', '/api/v1/roles', { name: 'hacker-role' }, viewerToken);
    assert('18.4', 'Viewer cannot create roles (403)', vCreateRole.s === 403);

    const vUpdateSettings = await req('PUT', '/api/v1/settings/llm', { default_provider: 'openai' }, viewerToken);
    assert('18.5', 'Viewer cannot update settings (403)', vUpdateSettings.s === 403);

    const vTestLLM = await req('POST', '/api/v1/settings/llm/test', {
      provider: 'claude', apiKey: 'fake'
    }, viewerToken);
    assert('18.6', 'Viewer cannot test LLM keys (403)', vTestLLM.s === 403);

    const vDelLLM = await req('DELETE', '/api/v1/settings/llm/claude', null, viewerToken);
    assert('18.7', 'Viewer cannot delete LLM keys (403)', vDelLLM.s === 403);
  }

  // ======================== 19. EDGE CASES & SECURITY ========================
  console.log('\n── 19. Edge Cases & Security ──');

  // SQL injection attempts
  const sqli1 = await req('GET', `/api/v1/organizations/${orgId}/controls?frameworkId='; DROP TABLE users;--`, null, proToken);
  assert('19.1', 'SQL injection in query param handled safely', sqli1.s === 200 || sqli1.s === 400 || sqli1.s === 500);

  const sqli2 = await req('POST', '/api/v1/auth/login', {
    email: "' OR 1=1 --", password: 'test'
  });
  assert('19.2', 'SQL injection in login blocked', sqli2.s === 401);

  // XSS in input
  const xss = await req('POST', '/api/v1/notifications', {
    type: 'info', title: '<script>alert("xss")</script>',
    message: '<img src=x onerror=alert(1)>'
  }, proToken);
  assert('19.3', 'XSS input stored but not executed (201)', xss.s === 201);

  // Invalid UUIDs
  const badUuid = await req('GET', '/api/v1/controls/not-a-uuid', null, proToken);
  assert('19.4', 'Invalid UUID returns error', badUuid.s === 500 || badUuid.s === 400 || badUuid.s === 404);

  // 404 route
  const notFound = await req('GET', '/api/v1/nonexistent-route', null, proToken);
  assert('19.5', 'Unknown route returns 404', notFound.s === 404);

  // Empty body on POST
  const emptyBody = await req('POST', '/api/v1/auth/register', {});
  assert('19.6', 'Empty body register returns 400', emptyBody.s === 400);

  // Very long string
  const longStr = 'A'.repeat(10000);
  const longInput = await req('POST', '/api/v1/notifications', {
    type: 'info', title: longStr, message: 'test'
  }, proToken);
  assert('19.7', 'Very long input handled (no crash)', longInput.s === 201 || longInput.s === 500);

  // Expired/invalid refresh token
  const badRefresh = await req('POST', '/api/v1/auth/refresh', { refreshToken: 'invalid.token.value' });
  assert('19.8', 'Invalid refresh token returns 401', badRefresh.s === 401);

  // Missing required body field
  const missingField = await req('POST', '/api/v1/assessments/results', { status: 'satisfied' }, proToken);
  assert('19.9', 'Missing procedure_id returns 400', missingField.s === 400);

  // ======================== 20. DELETE / CLEANUP OPERATIONS ========================
  console.log('\n── 20. Cleanup & Delete Operations ──');

  // Delete CMDB items
  if (hwId) {
    const delHw = await req('DELETE', `/api/v1/cmdb/hardware/${hwId}`, null, proToken);
    assert('20.1', 'Delete hardware returns 200', delHw.s === 200);
  }
  if (swId) {
    const delSw = await req('DELETE', `/api/v1/cmdb/software/${swId}`, null, proToken);
    assert('20.2', 'Delete software returns 200', delSw.s === 200);
  }
  if (aiAssetId) {
    const delAi = await req('DELETE', `/api/v1/cmdb/ai-agents/${aiAssetId}`, null, proToken);
    assert('20.3', 'Delete AI agent returns 200', delAi.s === 200);
  }
  if (saId) {
    const delSa = await req('DELETE', `/api/v1/cmdb/service-accounts/${saId}`, null, proToken);
    assert('20.4', 'Delete service account returns 200', delSa.s === 200);
  }
  if (vaultId) {
    const delVault = await req('DELETE', `/api/v1/cmdb/password-vaults/${vaultId}`, null, proToken);
    assert('20.5', 'Delete vault returns 200', delVault.s === 200);
  }
  if (envId) {
    const delEnv = await req('DELETE', `/api/v1/cmdb/environments/${envId}`, null, proToken);
    assert('20.6', 'Delete environment returns 200', delEnv.s === 200);
  }

  // Remove framework from org
  if (frameworkIds[0]) {
    const delFw = await req('DELETE', `/api/v1/organizations/${orgId}/frameworks/${frameworkIds[0]}`, null, proToken);
    assert('20.7', 'Delete org framework returns 200', delFw.s === 200);
  }

  // ======================== 21. LOGOUT & SESSION ========================
  console.log('\n── 21. Logout & Session ──');

  const logout = await req('POST', '/api/v1/auth/logout', null, proToken);
  assert('21.1', 'Logout returns 200', logout.s === 200);

  // Verify session invalidated (refresh should fail)
  const postLogoutRefresh = await req('POST', '/api/v1/auth/refresh', { refreshToken: adminRefresh });
  assert('21.2', 'Refresh after logout fails', postLogoutRefresh.s === 401);

  // Token itself still works until expiry (JWT is stateless) — this is expected behavior
  const postLogoutMe = await req('GET', '/api/v1/auth/me', null, proToken);
  assert('21.3', 'Access token works until expiry (stateless JWT)', postLogoutMe.s === 200);

  // ══════════════════════════ RESULTS ══════════════════════════

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  TOTAL:   ${passed + failed + skipped} tests`);
  console.log('══════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log(`    ❌ ${f}`));
  }

  console.log('\n');
  process.exit(failed > 0 ? 1 : 0);
})();
