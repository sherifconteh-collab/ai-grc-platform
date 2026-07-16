// @tier: exclude
/**
 * RBAC MEGA QA TEST SUITE — ControlWeave Role-Based Access Control
 *
 * Exhaustively tests RBAC enforcement across all endpoints for:
 *   0.  Health check
 *   1.  Setup — Register admin + create org
 *   2.  Setup — Create auditor user
 *   3.  Setup — Create regular user
 *   4.  Dashboard permissions
 *   5.  Frameworks permissions
 *   6.  Controls permissions
 *   7.  Evidence permissions
 *   8.  Assets (CMDB) permissions
 *   9.  Environments permissions
 *   10. Service accounts permissions
 *   11. Roles & permissions management
 *   12. Users management
 *   13. Settings management
 *   14. Audit logs
 *   15. Assessments permissions
 *   16. Notifications
 *   17. Invite system
 *   18. Account management
 *   19. Custom role enforcement
 *   20. Permission escalation prevention
 *   21. Cross-org isolation
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();
const pool = require('../src/config/database');

const BASE = (process.env.QA_BASE_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ---------- HTTP helper ----------
function req(method, urlPath, body, token, raw = false) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;

    const r = transport.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) {
          resolve({ s: res.statusCode, b: buf, h: res.headers });
        } else {
          try {
            resolve({ s: res.statusCode, b: JSON.parse(buf.toString()) });
          } catch (e) {
            resolve({ s: res.statusCode, b: buf.toString().substring(0, 200) });
          }
        }
      });
    });
    r.on('error', e => resolve({ s: 0, b: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function uploadFile(urlPath, filePath, fields, token) {
  return new Promise((resolve) => {
    const boundary = '----RbacQaBoundary' + Date.now();
    const url = new URL(urlPath, BASE);
    const transport = url.protocol === 'https:' ? https : http;
    let body = '';

    for (const [key, value] of Object.entries(fields || {})) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${value}\r\n`;
    }

    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    body += 'Content-Type: text/plain\r\n\r\n';

    const bodyStart = Buffer.from(body, 'utf8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const fullBody = Buffer.concat([bodyStart, fileContent, bodyEnd]);

    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
        Authorization: `Bearer ${token}`
      }
    };

    const request = transport.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ s: res.statusCode, b: JSON.parse(data) });
        } catch {
          resolve({ s: res.statusCode, b: data });
        }
      });
    });

    request.on('error', (error) => resolve({ s: 0, b: error.message }));
    request.write(fullBody);
    request.end();
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

// Directly query DB to upgrade org tier
function dbQuery(sql, params = []) {
  return pool.query(sql, params);
}

// =====================================================================
(async () => {
  const ts = Date.now();
  const adminEmail = `rbac-admin-${ts}@test.com`;
  const auditorEmail = `rbac-auditor-${ts}@test.com`;
  const userEmail = `rbac-user-${ts}@test.com`;
  const customEmail = `rbac-custom-${ts}@test.com`;
  const crossOrgEmail = `rbac-crossorg-${ts}@test.com`;
  const extraUserEmail = `rbac-extra-${ts}@test.com`;
  const pass = 'RbacMegaQaPass123!';

  let adminToken, auditorToken, userToken, customToken, crossOrgToken;
  let adminUserId, auditorUserId, regularUserId, customUserId;
  let orgId, controlId, frameworkId, assetId, environmentId, serviceAccountId;
  let customRoleId, evidenceId;

  console.log('\n══════════════════════════════════════════════════');
  console.log('  RBAC MEGA QA TEST SUITE — ControlWeave');
  console.log('══════════════════════════════════════════════════\n');

  // ======================== 0. HEALTH CHECK ========================
  console.log('── 0. Health Check ──');
  const health = await req('GET', '/health');
  assert('0.1', 'Health check returns healthy', health.s === 200 && health.b.status === 'healthy');

  if (health.s !== 200) {
    console.log('\n  ⛔ Server not running — aborting.\n');
    process.exit(1);
  }

  // ======================== 1. SETUP — REGISTER ADMIN + CREATE ORG ========================
  console.log('\n── 1. Setup — Register admin + create org ──');

  const reg = await req('POST', '/api/v1/auth/register', {
    email: adminEmail, password: pass, full_name: 'RBAC Admin', organization_name: 'RBAC Test Org'
  });
  assert('1.1', 'Admin registration returns 201', reg.s === 201);
  assert('1.2', 'Register returns user data', !!reg.b.data?.user?.id);
  assert('1.3', 'Register returns tokens', !!reg.b.data?.tokens?.accessToken);

  adminUserId = reg.b.data?.user?.id;
  orgId = reg.b.data?.organization?.id || reg.b.data?.user?.organization_id;

  // Upgrade to professional tier
  if (orgId) {
    await dbQuery(
      `UPDATE organizations
       SET tier = 'enterprise',
           billing_status = 'active_paid',
           trial_status = 'converted'
       WHERE id = $1`,
      [orgId]
    );
  }

  // Re-login as admin to get fresh token with upgraded tier
  const adminLogin = await req('POST', '/api/v1/auth/login', { email: adminEmail, password: pass });
  assert('1.4', 'Admin login after tier upgrade returns 200', adminLogin.s === 200);
  adminToken = adminLogin.b.data?.tokens?.accessToken;

  // Add frameworks so we have controls to test with
  const fws = await req('GET', '/api/v1/frameworks', null, adminToken);
  const allFrameworkIds = fws.b.data?.map(f => f.id) || [];
  if (allFrameworkIds.length > 0) {
    frameworkId = allFrameworkIds[0];
    await req('POST', `/api/v1/organizations/${orgId}/frameworks`, {
      frameworkIds: allFrameworkIds.slice(0, 3)
    }, adminToken);
  }

  // Fetch a control ID for later tests
  const orgCtrls = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, adminToken);
  if (orgCtrls.b.data?.length > 0) {
    controlId = orgCtrls.b.data[0].id;
  }

  // ======================== 2. SETUP — CREATE AUDITOR USER ========================
  console.log('\n── 2. Setup — Create auditor user ──');

  const createAuditor = await req('POST', '/api/v1/users', {
    email: auditorEmail, password: pass, full_name: 'RBAC Auditor', primary_role: 'auditor'
  }, adminToken);
  assert('2.1', 'Admin creates auditor user', createAuditor.s === 201);
  auditorUserId = createAuditor.b.data?.user?.id;

  const auditorLogin = await req('POST', '/api/v1/auth/login', { email: auditorEmail, password: pass });
  assert('2.2', 'Auditor login returns 200', auditorLogin.s === 200);
  auditorToken = auditorLogin.b.data?.tokens?.accessToken;

  // ======================== 3. SETUP — CREATE REGULAR USER ========================
  console.log('\n── 3. Setup — Create regular user ──');

  const createUser = await req('POST', '/api/v1/users', {
    email: userEmail, password: pass, full_name: 'RBAC User', primary_role: 'user'
  }, adminToken);
  assert('3.1', 'Admin creates regular user', createUser.s === 201);
  regularUserId = createUser.b.data?.user?.id;

  const userLogin = await req('POST', '/api/v1/auth/login', { email: userEmail, password: pass });
  assert('3.2', 'User login returns 200', userLogin.s === 200);
  userToken = userLogin.b.data?.tokens?.accessToken;

  // ======================== 4. DASHBOARD PERMISSIONS ========================
  console.log('\n── 4. Dashboard permissions ──');

  const dashAdmin = await req('GET', '/api/v1/dashboard/stats', null, adminToken);
  assert('4.1', 'Admin CAN read dashboard stats', dashAdmin.s === 200);
  assert('4.1a', 'Admin dashboard returns overall stats', !!dashAdmin.b.data?.overall);

  const dashAuditor = await req('GET', '/api/v1/dashboard/stats', null, auditorToken);
  assert('4.2', 'Auditor CAN read dashboard stats', dashAuditor.s === 200);

  const dashUser = await req('GET', '/api/v1/dashboard/stats', null, userToken);
  assert('4.3', 'User CAN read dashboard stats', dashUser.s === 200);

  // ======================== 5. FRAMEWORKS PERMISSIONS ========================
  console.log('\n── 5. Frameworks permissions ──');

  const fwAdmin = await req('GET', '/api/v1/frameworks', null, adminToken);
  assert('5.1', 'Admin CAN read frameworks', fwAdmin.s === 200);

  const fwAuditor = await req('GET', '/api/v1/frameworks', null, auditorToken);
  assert('5.2', 'Auditor CAN read frameworks', fwAuditor.s === 200);

  const fwUser = await req('GET', '/api/v1/frameworks', null, userToken);
  assert('5.3', 'User CAN read frameworks', fwUser.s === 200);

  if (frameworkId) {
    const addFwAdmin = await req('POST', `/api/v1/organizations/${orgId}/frameworks`, {
      frameworkIds: [frameworkId]
    }, adminToken);
    assert('5.4', 'Admin CAN add framework to org', addFwAdmin.s === 200);

    const addFwAuditor = await req('POST', `/api/v1/organizations/${orgId}/frameworks`, {
      frameworkIds: [frameworkId]
    }, auditorToken);
    assert('5.5', 'Auditor CANNOT add framework to org', addFwAuditor.s === 403);

    const addFwUser = await req('POST', `/api/v1/organizations/${orgId}/frameworks`, {
      frameworkIds: [frameworkId]
    }, userToken);
    assert('5.6', 'User CANNOT add framework to org', addFwUser.s === 403);
  } else {
    skip('5.4', 'Admin CAN add framework to org', 'no framework available');
    skip('5.5', 'Auditor CANNOT add framework to org', 'no framework available');
    skip('5.6', 'User CANNOT add framework to org', 'no framework available');
  }

  // ======================== 6. CONTROLS PERMISSIONS ========================
  console.log('\n── 6. Controls permissions ──');

  const ctrlsAdmin = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, adminToken);
  assert('6.1', 'Admin CAN read controls', ctrlsAdmin.s === 200);

  const ctrlsAuditor = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, auditorToken);
  assert('6.2', 'Auditor CAN read controls', ctrlsAuditor.s === 200);

  const ctrlsUser = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, userToken);
  assert('6.3', 'User CAN read controls', ctrlsUser.s === 200);

  if (controlId) {
    const updCtrlAdmin = await req('PUT', `/api/v1/controls/${controlId}/implementation`, {
      status: 'in_progress', notes: 'Admin RBAC test'
    }, adminToken);
    assert('6.4', 'Admin CAN update control implementation', updCtrlAdmin.s === 200);
    const ctrlAfterAdminUpdate = await req('GET', `/api/v1/controls/${controlId}`, null, adminToken);
    assert('6.4a', 'Admin control update persists', ctrlAfterAdminUpdate.s === 200 && ctrlAfterAdminUpdate.b.data?.implementation_status === 'in_progress');

    const updCtrlAuditor = await req('PUT', `/api/v1/controls/${controlId}/implementation`, {
      status: 'in_progress', notes: 'Auditor RBAC test'
    }, auditorToken);
    assert('6.5', 'Auditor CANNOT update control implementation', updCtrlAuditor.s === 403);

    const updCtrlUser = await req('PUT', `/api/v1/controls/${controlId}/implementation`, {
      status: 'needs_review', notes: 'User RBAC test'
    }, userToken);
    assert('6.6', 'User CAN update control implementation', updCtrlUser.s === 200);
    const ctrlAfterUserUpdate = await req('GET', `/api/v1/controls/${controlId}`, null, adminToken);
    assert('6.6a', 'User control update persists', ctrlAfterUserUpdate.s === 200 && ctrlAfterUserUpdate.b.data?.implementation_status === 'needs_review');
  } else {
    skip('6.4', 'Admin CAN update control implementation', 'no control available');
    skip('6.5', 'Auditor CANNOT update control implementation', 'no control available');
    skip('6.6', 'User CAN update control implementation', 'no control available');
  }

  // ======================== 7. EVIDENCE PERMISSIONS ========================
  console.log('\n── 7. Evidence permissions ──');

  const evAdmin = await req('GET', '/api/v1/evidence', null, adminToken);
  assert('7.1', 'Admin CAN read evidence', evAdmin.s === 200);

  const evAuditor = await req('GET', '/api/v1/evidence', null, auditorToken);
  assert('7.2', 'Auditor CAN read evidence', evAuditor.s === 200);

  const evUser = await req('GET', '/api/v1/evidence', null, userToken);
  assert('7.3', 'User CAN read evidence', evUser.s === 200);

  // Test auditor cannot delete evidence (use a fake id; expect 403, not 404)
  const delEvAuditor = await req('DELETE', '/api/v1/evidence/00000000-0000-0000-0000-000000000001', null, auditorToken);
  assert('7.4', 'Auditor CANNOT delete evidence', delEvAuditor.s === 403);

  const tempEvidencePath = path.join(os.tmpdir(), `rbac-evidence-${ts}.txt`);
  fs.writeFileSync(tempEvidencePath, 'RBAC user evidence upload');
  const postEvUser = await uploadFile('/api/v1/evidence/upload', tempEvidencePath, {
    description: 'RBAC user evidence upload',
    tags: 'rbac,user'
  }, userToken);
  assert('7.5', 'User CAN upload evidence', postEvUser.s === 201);
  evidenceId = postEvUser.b.data?.id;

  const userEvidenceList = await req('GET', '/api/v1/evidence', null, userToken);
  assert('7.6', 'User uploaded evidence appears in list', userEvidenceList.s === 200 && userEvidenceList.b.data?.some((row) => row.id === evidenceId));

  if (evidenceId) {
    const delUserEvidence = await req('DELETE', `/api/v1/evidence/${evidenceId}`, null, userToken);
    assert('7.7', 'User CAN delete own uploaded evidence', delUserEvidence.s === 200);
  } else {
    skip('7.7', 'User CAN delete own uploaded evidence', 'no evidence id returned');
  }

  try { fs.unlinkSync(tempEvidencePath); } catch (_error) {}

  // ======================== 8. ASSETS (CMDB) PERMISSIONS ========================
  console.log('\n── 8. Assets (CMDB) permissions ──');

  // Asset reads are exposed under /api/v1/cmdb/assets (read-only alias);
  // asset create/update/delete lives under /api/v1/assets and requires category_id.
  const assetsAdmin = await req('GET', '/api/v1/cmdb/assets', null, adminToken);
  assert('8.1', 'Admin CAN read assets', assetsAdmin.s === 200);

  const assetsAuditor = await req('GET', '/api/v1/cmdb/assets', null, auditorToken);
  assert('8.2', 'Auditor CAN read assets', assetsAuditor.s === 200);

  const assetsUser = await req('GET', '/api/v1/cmdb/assets', null, userToken);
  assert('8.3', 'User CAN read assets', assetsUser.s === 200);

  const assetCategories = await req('GET', '/api/v1/assets/categories', null, adminToken);
  const assetCategoryId = assetCategories.b.data?.categories?.[0]?.id;

  const createAssetAdmin = await req('POST', '/api/v1/assets', {
    name: 'RBAC Admin Asset', category_id: assetCategoryId, status: 'active'
  }, adminToken);
  assert('8.4', 'Admin CAN create asset', createAssetAdmin.s === 200 || createAssetAdmin.s === 201);
  assetId = createAssetAdmin.b.data?.id;

  const createAssetAuditor = await req('POST', '/api/v1/assets', {
    name: 'RBAC Auditor Asset', category_id: assetCategoryId, status: 'active'
  }, auditorToken);
  assert('8.5', 'Auditor CANNOT create asset', createAssetAuditor.s === 403);

  const createAssetUser = await req('POST', '/api/v1/assets', {
    name: 'RBAC User Asset', category_id: assetCategoryId, status: 'active'
  }, userToken);
  assert('8.6', 'User CAN create asset', createAssetUser.s === 200 || createAssetUser.s === 201);

  const delAssetAuditor = await req('DELETE', `/api/v1/assets/${assetId || '00000000-0000-0000-0000-000000000001'}`, null, auditorToken);
  assert('8.7', 'Auditor CANNOT delete asset', delAssetAuditor.s === 403);

  // ======================== 9. ENVIRONMENTS PERMISSIONS ========================
  console.log('\n── 9. Environments permissions ──');

  const envsAdmin = await req('GET', '/api/v1/cmdb/environments', null, adminToken);
  assert('9.1', 'Admin CAN read environments', envsAdmin.s === 200);

  const envsAuditor = await req('GET', '/api/v1/cmdb/environments', null, auditorToken);
  assert('9.2', 'Auditor CAN read environments', envsAuditor.s === 200);

  const envsUser = await req('GET', '/api/v1/cmdb/environments', null, userToken);
  assert('9.3', 'User CAN read environments', envsUser.s === 200);

  const createEnvAuditor = await req('POST', '/api/v1/cmdb/environments', {
    name: 'RBAC Auditor Env', code: `rbac-auditor-env-${ts}`, environment_type: 'staging'
  }, auditorToken);
  assert('9.4', 'Auditor CANNOT create environment', createEnvAuditor.s === 403);

  const createEnvUser = await req('POST', '/api/v1/cmdb/environments', {
    name: 'RBAC User Env', code: `rbac-user-env-${ts}`, environment_type: 'staging'
  }, userToken);
  assert('9.5', 'User CAN create environment', createEnvUser.s === 200 || createEnvUser.s === 201);
  environmentId = createEnvUser.b.data?.id;

  // ======================== 10. SERVICE ACCOUNTS PERMISSIONS ========================
  console.log('\n── 10. Service accounts permissions ──');

  const saAdmin = await req('GET', '/api/v1/cmdb/service-accounts', null, adminToken);
  assert('10.1', 'Admin CAN read service accounts', saAdmin.s === 200);

  const saAuditor = await req('GET', '/api/v1/cmdb/service-accounts', null, auditorToken);
  assert('10.2', 'Auditor CAN read service accounts', saAuditor.s === 200);

  const saUser = await req('GET', '/api/v1/cmdb/service-accounts', null, userToken);
  assert('10.3', 'User CAN read service accounts', saUser.s === 200);

  const createSaAuditor = await req('POST', '/api/v1/cmdb/service-accounts', {
    account_name: 'RBAC Auditor SA', account_type: 'api_key'
  }, auditorToken);
  assert('10.4', 'Auditor CANNOT create service account', createSaAuditor.s === 403);

  const createSaUser = await req('POST', '/api/v1/cmdb/service-accounts', {
    account_name: 'RBAC User SA', account_type: 'api_key'
  }, userToken);
  assert('10.5', 'User CAN create service account', createSaUser.s === 200 || createSaUser.s === 201);
  serviceAccountId = createSaUser.b.data?.id;

  // ======================== 11. ROLES & PERMISSIONS MANAGEMENT ========================
  console.log('\n── 11. Roles & permissions management ──');

  const rolesAdmin = await req('GET', '/api/v1/roles', null, adminToken);
  assert('11.1', 'Admin CAN list roles', rolesAdmin.s === 200);

  const createRoleAdmin = await req('POST', '/api/v1/roles', {
    name: `test-role-${ts}`, description: 'RBAC test role', permissions: ['controls.read', 'controls.write']
  }, adminToken);
  assert('11.2', 'Admin CAN create custom role', createRoleAdmin.s === 201);
  customRoleId = createRoleAdmin.b.data?.id;

  const permsAdmin = await req('GET', '/api/v1/roles/permissions/all', null, adminToken);
  assert('11.3', 'Admin CAN list all permissions', permsAdmin.s === 200);

  const rolesAuditor = await req('GET', '/api/v1/roles', null, auditorToken);
  assert('11.4', 'Auditor CANNOT list roles', rolesAuditor.s === 403);

  const createRoleAuditor = await req('POST', '/api/v1/roles', {
    name: `aud-role-${ts}`, description: 'Should fail', permissions: ['controls.read']
  }, auditorToken);
  assert('11.5', 'Auditor CANNOT create roles', createRoleAuditor.s === 403);

  const rolesUser = await req('GET', '/api/v1/roles', null, userToken);
  assert('11.6', 'User CANNOT list roles', rolesUser.s === 403);

  const createRoleUser = await req('POST', '/api/v1/roles', {
    name: `usr-role-${ts}`, description: 'Should fail', permissions: ['controls.read']
  }, userToken);
  assert('11.7', 'User CANNOT create roles', createRoleUser.s === 403);

  // ======================== 12. USERS MANAGEMENT ========================
  console.log('\n── 12. Users management ──');

  const usersAdmin = await req('GET', '/api/v1/users', null, adminToken);
  assert('12.1', 'Admin CAN list users', usersAdmin.s === 200);

  const usersAuditor = await req('GET', '/api/v1/users', null, auditorToken);
  assert('12.2', 'Auditor CAN list users (users.read)', usersAuditor.s === 200);

  // migrations/013_rbac_bootstrap.sql deliberately grants the seeded 'user'
  // role users.read (org directory visibility) — not a lockout like the
  // roles/settings/audit-log endpoints below.
  const usersUser = await req('GET', '/api/v1/users', null, userToken);
  assert('12.3', 'User CAN list users (users.read)', usersUser.s === 200);

  const createUserAdmin = await req('POST', '/api/v1/users', {
    email: extraUserEmail, password: pass, full_name: 'Extra User', primary_role: 'user'
  }, adminToken);
  assert('12.4', 'Admin CAN create user', createUserAdmin.s === 201);

  const createUserAuditor = await req('POST', '/api/v1/users', {
    email: `aud-create-${ts}@test.com`, password: pass, full_name: 'Aud Create', primary_role: 'user'
  }, auditorToken);
  assert('12.5', 'Auditor CANNOT create user', createUserAuditor.s === 403);

  const createUserUser = await req('POST', '/api/v1/users', {
    email: `usr-create-${ts}@test.com`, password: pass, full_name: 'Usr Create', primary_role: 'user'
  }, userToken);
  assert('12.6', 'User CANNOT create user', createUserUser.s === 403);

  // ======================== 13. SETTINGS MANAGEMENT ========================
  console.log('\n── 13. Settings management ──');

  const llmAdmin = await req('GET', '/api/v1/settings/llm', null, adminToken);
  assert('13.1', 'Admin CAN get LLM settings', llmAdmin.s === 200);

  const llmAuditor = await req('GET', '/api/v1/settings/llm', null, auditorToken);
  assert('13.2', 'Auditor CANNOT get LLM settings', llmAuditor.s === 403);

  const llmUser = await req('GET', '/api/v1/settings/llm', null, userToken);
  assert('13.3', 'User CANNOT get LLM settings', llmUser.s === 403);

  const updLlmAdmin = await req('PUT', '/api/v1/settings/llm', {
    default_provider: 'openai', default_model: 'gpt-4o-mini', openai_api_key: 'sk-test-rbac-key'
  }, adminToken);
  assert('13.4', 'Admin CAN update LLM settings', updLlmAdmin.s === 200);
  const llmAdminAfter = await req('GET', '/api/v1/settings/llm', null, adminToken);
  assert('13.4a', 'Admin LLM update persists provider', llmAdminAfter.s === 200 && llmAdminAfter.b.data?.defaultProvider === 'openai');
  assert('13.4b', 'Admin LLM update persists API key flag', llmAdminAfter.b.data?.hasOpenAIKey === true);

  const updLlmAuditor = await req('PUT', '/api/v1/settings/llm', {
    default_provider: 'openai', default_model: 'gpt-4o-mini', openai_api_key: 'sk-test-rbac-key'
  }, auditorToken);
  assert('13.5', 'Auditor CANNOT update LLM settings', updLlmAuditor.s === 403);

  // ======================== 14. AUDIT LOGS ========================
  console.log('\n── 14. Audit logs ──');

  const auditAdmin = await req('GET', '/api/v1/audit/logs', null, adminToken);
  assert('14.1', 'Admin CAN read audit logs', auditAdmin.s === 200);
  assert('14.1a', 'Admin audit logs include pagination', !!auditAdmin.b.pagination);

  const auditAuditor = await req('GET', '/api/v1/audit/logs', null, auditorToken);
  assert('14.2', 'Auditor CAN read audit logs', auditAuditor.s === 200);

  const auditUser = await req('GET', '/api/v1/audit/logs', null, userToken);
  assert('14.3', 'User CANNOT read audit logs', auditUser.s === 403);

  // ======================== 15. ASSESSMENTS PERMISSIONS ========================
  console.log('\n── 15. Assessments permissions ──');

  const assessAdmin = await req('GET', '/api/v1/assessments/procedures', null, adminToken);
  assert('15.1', 'Admin CAN read assessments', assessAdmin.s === 200);

  const assessAuditor = await req('GET', '/api/v1/assessments/procedures', null, auditorToken);
  assert('15.2.a', 'Auditor CAN read assessments', assessAuditor.s === 200);

  const assessUser = await req('GET', '/api/v1/assessments/procedures', null, userToken);
  assert('15.3', 'User CAN read assessments', assessUser.s === 200);

  const planAdmin = await req('POST', '/api/v1/assessments/plans', {
    name: `RBAC Admin Plan ${ts}`, description: 'Admin plan test'
  }, adminToken);
  assert('15.4', 'Admin CAN write assessments', planAdmin.s === 200 || planAdmin.s === 201);

  const planAuditor = await req('POST', '/api/v1/assessments/plans', {
    name: `RBAC Auditor Plan ${ts}`, description: 'Auditor plan test'
  }, auditorToken);
  assert('15.5', 'Auditor CAN write assessments', planAuditor.s === 200 || planAuditor.s === 201);

  const planUser = await req('POST', '/api/v1/assessments/plans', {
    name: `RBAC User Plan ${ts}`, description: 'User plan test'
  }, userToken);
  assert('15.6', 'User CAN write assessments', planUser.s === 200 || planUser.s === 201);

  // ======================== 16. NOTIFICATIONS ========================
  console.log('\n── 16. Notifications ──');

  const notiAdmin = await req('GET', '/api/v1/notifications', null, adminToken);
  assert('16.1', 'Admin CAN read notifications', notiAdmin.s === 200);

  const notiAuditor = await req('GET', '/api/v1/notifications', null, auditorToken);
  assert('16.2', 'Auditor CAN read notifications', notiAuditor.s === 200);

  const notiUser = await req('GET', '/api/v1/notifications', null, userToken);
  assert('16.3', 'User CAN read notifications', notiUser.s === 200);

  const writeNotiAuditor = await req('POST', '/api/v1/notifications', {
    title: 'Auditor notification', message: 'Should fail', type: 'info'
  }, auditorToken);
  assert('16.4', 'Auditor CANNOT write notifications', writeNotiAuditor.s === 403);

  const writeNotiUser = await req('POST', '/api/v1/notifications', {
    title: 'User notification', message: 'Should succeed', type: 'info'
  }, userToken);
  assert('16.5', 'User CAN write notifications', writeNotiUser.s === 200 || writeNotiUser.s === 201);

  // ======================== 17. INVITE SYSTEM ========================
  console.log('\n── 17. Invite system ──');

  const inviteAdmin = await req('POST', '/api/v1/users/invite', {
    email: `invite-${ts}@test.com`, primary_role: 'user'
  }, adminToken);
  assert('17.1', 'Admin CAN create invite', inviteAdmin.s === 201);

  const invitesAdmin = await req('GET', '/api/v1/users/invites', null, adminToken);
  assert('17.2', 'Admin CAN list invites', invitesAdmin.s === 200);

  const inviteAuditor = await req('POST', '/api/v1/users/invite', {
    email: `invite-aud-${ts}@test.com`, primary_role: 'user'
  }, auditorToken);
  assert('17.3', 'Auditor CANNOT create invite', inviteAuditor.s === 403);

  const inviteUser = await req('POST', '/api/v1/users/invite', {
    email: `invite-usr-${ts}@test.com`, primary_role: 'user'
  }, userToken);
  assert('17.4', 'User CANNOT create invite', inviteUser.s === 403);

  // ======================== 18. ACCOUNT MANAGEMENT ========================
  console.log('\n── 18. Account management ──');

  const exportAdmin = await req('GET', '/api/v1/settings/account/export', null, adminToken);
  assert('18.1', 'Admin CAN export data', exportAdmin.s === 200);

  const exportAuditor = await req('GET', '/api/v1/settings/account/export', null, auditorToken);
  assert('18.2', 'Auditor CANNOT export data', exportAuditor.s === 403);

  const exportUser = await req('GET', '/api/v1/settings/account/export', null, userToken);
  assert('18.3', 'User CANNOT export data', exportUser.s === 403);

  // ======================== 19. CUSTOM ROLE ENFORCEMENT ========================
  // Note: POST /roles/assign is a full REPLACE of a user's role set (DELETE
  // then INSERT — see routes/roles.js), matching the settings UI's
  // multi-select "these are all the roles this user has" checklist. It does
  // NOT merge with whatever roles the user already held. To keep the
  // auditor's base permissions (evidence.read, etc.) while adding
  // controls.write, the assign call below must include the system
  // 'auditor' role id alongside the custom role id.
  console.log('\n── 19. Custom role enforcement ──');

  if (customRoleId) {
    // Create an auditor user — auditors lack controls.write, evidence.write, settings.manage
    const createCustomUser = await req('POST', '/api/v1/users', {
      email: customEmail, password: pass, full_name: 'RBAC Custom Role Auditor', primary_role: 'auditor'
    }, adminToken);
    assert('19.1', 'Admin creates auditor user for custom role test', createCustomUser.s === 201);
    customUserId = createCustomUser.b.data?.user?.id;

    // Look up the system 'auditor' role id so the assign call below can
    // include it alongside the custom role (assign REPLACES the role set).
    const rolesForAssign = await req('GET', '/api/v1/roles', null, adminToken);
    const auditorSystemRoleId = rolesForAssign.b.data?.find((r) => r.is_system_role && r.name === 'auditor')?.id;

    // Assign custom role (controls.read + controls.write) alongside the base auditor role
    if (customUserId) {
      const assignRole = await req('POST', '/api/v1/roles/assign', {
        userId: customUserId, roleIds: [customRoleId, auditorSystemRoleId].filter(Boolean)
      }, adminToken);
      assert('19.2', 'Admin assigns custom role to auditor', assignRole.s === 200 || assignRole.s === 201);
    } else {
      skip('19.2', 'Admin assigns custom role to auditor', 'user not created');
    }

    // Login as custom-role auditor
    const customLogin = await req('POST', '/api/v1/auth/login', { email: customEmail, password: pass });
    assert('19.3', 'Custom-role auditor login returns 200', customLogin.s === 200);
    customToken = customLogin.b.data?.tokens?.accessToken;

    if (customToken && controlId) {
      // Custom role ADDS controls.write — auditor normally cannot write controls
      const customCtrlWrite = await req('PUT', `/api/v1/controls/${controlId}/implementation`, {
        status: 'implemented', notes: 'Custom role write test', poam_justification: 'RBAC custom role test validates compliant transition permissions.'
      }, customToken);
      assert('19.4', 'Custom role ADDS controls.write to auditor (200)', customCtrlWrite.s === 200);
      const customCtrlDetail = await req('GET', `/api/v1/controls/${controlId}`, null, adminToken);
      assert('19.4a', 'Custom role write persists implemented status', customCtrlDetail.s === 200 && customCtrlDetail.b.data?.implementation_status === 'implemented');

      // Auditor base + custom role still CANNOT manage roles
      const customRoleMgmt = await req('POST', '/api/v1/roles', {
        name: `custom-fail-${ts}`, description: 'fail', permissions: ['controls.read']
      }, customToken);
      assert('19.5', 'Custom role auditor still CANNOT manage roles', customRoleMgmt.s === 403);

      // Auditor base + custom role still CANNOT manage settings
      const customSettings = await req('GET', '/api/v1/settings/llm', null, customToken);
      assert('19.6', 'Custom role auditor still CANNOT manage settings', customSettings.s === 403);

      // Auditor base still CANNOT manage users even with custom role
      const customCreateUser = await req('POST', '/api/v1/users', {
        email: `custom-create-${ts}@test.com`, password: pass, full_name: 'Should Fail', primary_role: 'user'
      }, customToken);
      assert('19.7', 'Custom role auditor still CANNOT manage users', customCreateUser.s === 403);

      // Verify auditor CAN still do auditor things (read evidence, read assets)
      const customEvRead = await req('GET', '/api/v1/evidence', null, customToken);
      assert('19.8', 'Custom role auditor retains auditor evidence.read', customEvRead.s === 200);
    } else {
      skip('19.4', 'Custom role ADDS controls.write to auditor', 'login or control ID failed');
      skip('19.5', 'Custom role auditor still CANNOT manage roles', 'login failed');
      skip('19.6', 'Custom role auditor still CANNOT manage settings', 'login failed');
      skip('19.7', 'Custom role auditor still CANNOT manage users', 'login failed');
      skip('19.8', 'Custom role auditor retains auditor evidence.read', 'login failed');
    }
  } else {
    skip('19.1', 'Admin creates auditor user for custom role test', 'custom role not created');
    skip('19.2', 'Admin assigns custom role to auditor', 'custom role not created');
    skip('19.3', 'Custom-role auditor login returns 200', 'custom role not created');
    skip('19.4', 'Custom role ADDS controls.write to auditor', 'custom role not created');
    skip('19.5', 'Custom role auditor still CANNOT manage roles', 'custom role not created');
    skip('19.6', 'Custom role auditor still CANNOT manage settings', 'custom role not created');
    skip('19.7', 'Custom role auditor still CANNOT manage users', 'custom role not created');
    skip('19.8', 'Custom role auditor retains auditor evidence.read', 'custom role not created');
  }

  // ======================== 20. PERMISSION ESCALATION PREVENTION ========================
  console.log('\n── 20. Permission escalation prevention ──');

  const assignAuditor = await req('POST', '/api/v1/roles/assign', {
    userId: auditorUserId, roleIds: [customRoleId || '00000000-0000-0000-0000-000000000001']
  }, auditorToken);
  assert('20.1', 'Auditor CANNOT assign roles', assignAuditor.s === 403);

  const assignUser = await req('POST', '/api/v1/roles/assign', {
    userId: regularUserId, roleIds: [customRoleId || '00000000-0000-0000-0000-000000000001']
  }, userToken);
  assert('20.2', 'User CANNOT assign roles', assignUser.s === 403);

  if (auditorUserId) {
    const escalateAuditor = await req('PATCH', `/api/v1/users/${auditorUserId}`, {
      primary_role: 'admin'
    }, auditorToken);
    assert('20.3', 'Auditor CANNOT elevate own role', escalateAuditor.s === 403);
  } else {
    skip('20.3', 'Auditor CANNOT elevate own role', 'auditor user ID not available');
  }

  // ======================== 21. CROSS-ORG ISOLATION ========================
  console.log('\n── 21. Cross-org isolation ──');

  // Register a new user in a different org
  const crossReg = await req('POST', '/api/v1/auth/register', {
    email: crossOrgEmail, password: pass, full_name: 'Cross Org User', organization_name: 'Cross Org Inc'
  });
  assert('21.1', 'Cross-org user registers in separate org', crossReg.s === 201);
  const crossOrgId = crossReg.b.data?.organization?.id || crossReg.b.data?.user?.organization_id;

  // Upgrade cross-org to professional
  if (crossOrgId) {
    await dbQuery(
      `UPDATE organizations
       SET tier = 'enterprise',
           billing_status = 'active_paid',
           trial_status = 'converted'
       WHERE id = $1`,
      [crossOrgId]
    );
  }

  const crossLogin = await req('POST', '/api/v1/auth/login', { email: crossOrgEmail, password: pass });
  assert('21.2', 'Cross-org user login returns 200', crossLogin.s === 200);
  crossOrgToken = crossLogin.b.data?.tokens?.accessToken;

  if (crossOrgToken && orgId) {
    // Cross-org user tries to access first org's controls
    const crossCtrls = await req('GET', `/api/v1/organizations/${orgId}/controls`, null, crossOrgToken);
    assert('21.3', 'Cross-org user CANNOT access other org controls', crossCtrls.s === 403 || crossCtrls.s === 404);

    // Cross-org user tries to access first org's assets
    const crossAssets = await req('GET', '/api/v1/cmdb/assets', null, crossOrgToken);
    // Assets should return only their own org's data, which should be empty or different
    assert('21.4', 'Cross-org user gets only own org assets (isolation)',
      crossAssets.s === 200 && Array.isArray(crossAssets.b.data));

    // Verify the asset from org1 is not visible to cross-org user
    if (assetId && crossAssets.b.data) {
      const leakedAsset = crossAssets.b.data.find(a => a.id === assetId);
      assert('21.5', 'Cross-org user CANNOT see other org asset', !leakedAsset);
    } else {
      skip('21.5', 'Cross-org user CANNOT see other org asset', 'no asset to verify');
    }
  } else {
    skip('21.3', 'Cross-org user CANNOT access other org controls', 'cross-org setup failed');
    skip('21.4', 'Cross-org user gets only own org assets', 'cross-org setup failed');
    skip('21.5', 'Cross-org user CANNOT see other org asset', 'cross-org setup failed');
  }

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
