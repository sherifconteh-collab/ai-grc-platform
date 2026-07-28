#!/usr/bin/env node
/**
 * verify-demo-account-logins.js
 *
 * Verifies demo accounts can log in and checks onboarding_required from /auth/me.
 *
 * Env:
 *   DEMO_VERIFY_API_BASE=https://<host>/api/v1
 *   DEMO_VERIFY_PASSWORD=ControlWeave!2026
 */
require('dotenv').config()
const {
  DEMO_ADMIN_ACCOUNTS,
  DEMO_AUDITOR_ACCOUNTS,
  DEMO_AUDIT_FIRM_ACCOUNT,
  resolveDemoAccountPassword
} = require('./lib/demo-account-config')

const API_BASE = String(process.env.DEMO_VERIFY_API_BASE || 'http://localhost:3001/api/v1').replace(/\/+$/, '')
const PASSWORD = resolveDemoAccountPassword(
  { value: process.env.DEMO_VERIFY_PASSWORD, label: 'DEMO_VERIFY_PASSWORD' },
  { value: process.env.DEMO_ACCOUNT_PASSWORD, label: 'DEMO_ACCOUNT_PASSWORD' }
)

// Legacy tier-addressed logins are included so a roster change that drops an
// alias fails here rather than silently breaking old docs and bookmarks.
const ADMIN_ACCOUNTS = Object.freeze(
  DEMO_ADMIN_ACCOUNTS.flatMap((account) => [account.email, ...(account.aliasEmails || [])])
)

const AUDITOR_ACCOUNTS = Object.freeze(
  DEMO_AUDITOR_ACCOUNTS.flatMap((account) => [account.email, ...(account.aliasEmails || [])])
)

async function login(email) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD })
  })

  const payload = await response.json().catch(() => ({}))
  const accessToken = payload?.data?.tokens?.accessToken

  return {
    status: response.status,
    ok: response.ok,
    accessToken,
    payload
  }
}

async function me(accessToken) {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  })

  const payload = await response.json().catch(() => ({}))
  return {
    status: response.status,
    ok: response.ok,
    payload
  }
}

async function getJson(path, accessToken) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, ok: response.ok, payload }
}

/**
 * The audit-firm persona exists so the audit workbench can be demoed and
 * tested end to end. An empty workbench is a seeding failure, not an empty
 * state, so assert it loudly rather than letting a silent no-op through.
 */
async function verifyAuditWorkbench() {
  const account = DEMO_AUDIT_FIRM_ACCOUNT
  const loginResult = await login(account.email)
  if (!loginResult.ok || !loginResult.accessToken) {
    console.log(`  ✗ audit workbench — cannot log in as ${account.email} (${loginResult.status})`)
    return 1
  }

  const list = await getJson('/assessments/engagements', loginResult.accessToken)
  const engagements = list.payload?.data?.engagements || []
  if (!list.ok || engagements.length === 0) {
    console.log(`  ✗ audit workbench — no engagements for ${account.orgName} (run seed:demo:audit-workbench)`)
    return 1
  }

  const fieldwork = engagements.find((engagement) => engagement.status === 'fieldwork')
  if (!fieldwork) {
    console.log('  ✗ audit workbench — no engagement in fieldwork to demo the active-audit flow')
    return 1
  }

  const [pbc, workpapers, findings] = await Promise.all([
    getJson(`/assessments/engagements/${fieldwork.id}/pbc`, loginResult.accessToken),
    getJson(`/assessments/engagements/${fieldwork.id}/workpapers`, loginResult.accessToken),
    getJson(`/assessments/engagements/${fieldwork.id}/findings`, loginResult.accessToken)
  ])

  const counts = {
    pbc: (pbc.payload?.data?.pbc_requests || pbc.payload?.data || []).length,
    workpapers: (workpapers.payload?.data?.workpapers || workpapers.payload?.data || []).length,
    findings: (findings.payload?.data?.findings || findings.payload?.data || []).length
  }

  const empty = Object.entries(counts).filter(([, count]) => count === 0).map(([name]) => name)
  if (empty.length > 0) {
    console.log(`  ✗ audit workbench — fieldwork engagement has no ${empty.join(', ')}`)
    return 1
  }

  console.log(
    `  ✓ audit workbench — ${engagements.length} engagement(s); fieldwork has `
    + `${counts.pbc} PBC, ${counts.workpapers} workpapers, ${counts.findings} findings`
  )
  return 0
}

async function run() {
  const includeAuditors = String(process.env.DEMO_VERIFY_INCLUDE_AUDITORS || 'false').toLowerCase() === 'true'
  const accounts = includeAuditors
    ? [...ADMIN_ACCOUNTS, ...AUDITOR_ACCOUNTS]
    : ADMIN_ACCOUNTS

  console.log(`\n🔎 Verifying demo account login access against ${API_BASE}\n`)

  let failures = 0
  for (const email of accounts) {
    try {
      const loginResult = await login(email)
      if (!loginResult.ok || !loginResult.accessToken) {
        failures += 1
        console.log(`  ✗ ${email.padEnd(28)} login failed (${loginResult.status})`)
        continue
      }

      const meResult = await me(loginResult.accessToken)
      const onboardingRequired = Boolean(meResult.payload?.data?.onboarding_required)
      const tier = meResult.payload?.data?.organization?.tier || 'unknown'

      if (!meResult.ok) {
        failures += 1
        console.log(`  ✗ ${email.padEnd(28)} /auth/me failed (${meResult.status})`)
        continue
      }

      if (onboardingRequired) {
        failures += 1
        console.log(`  ✗ ${email.padEnd(28)} tier=${tier} onboarding_required=true`)
      } else {
        console.log(`  ✓ ${email.padEnd(28)} tier=${tier} onboarding_required=false`)
      }
    } catch (error) {
      failures += 1
      console.log(`  ✗ ${email.padEnd(28)} error=${error.message}`)
    }
  }

  failures += await verifyAuditWorkbench()

  if (failures > 0) {
    console.log(`\n❌ Demo verification finished with ${failures} failure(s).\n`)
    process.exit(1)
  }

  console.log('\n✅ All demo accounts can log in, skip onboarding, and the audit workbench is populated.\n')
}

run().catch((error) => {
  console.error(`\n❌ Verification failed: ${error.message}\n`)
  process.exit(1)
})
