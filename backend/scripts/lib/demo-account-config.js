const DEFAULT_DEMO_PASSWORD = 'ControlWeave!2026';
const MIN_DEMO_PASSWORD_LENGTH = 15;

// Demo seed scripts hash with the same cost as the application so a demo
// login exercises the real bcrypt.compare cost path.
const DEMO_BCRYPT_COST = 14;

if (DEFAULT_DEMO_PASSWORD.length < MIN_DEMO_PASSWORD_LENGTH) {
  throw new Error(`DEFAULT_DEMO_PASSWORD must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters.`);
}

/**
 * One demo organization per industry vertical, plus one external audit firm.
 *
 * `email` is the canonical, industry-addressed login. `aliasEmails` are the
 * pre-existing tier-addressed logins from the days when the platform had paid
 * tiers; they are seeded as additional admin users in the same organization so
 * older docs, screenshots, and saved bookmarks keep working.
 *
 * `frameworks` are framework codes that exist in the seeded catalog
 * (`seed-frameworks.js`) — the industry seeder links these to the org, so an
 * invalid code here means an org with no compliance data.
 *
 * `persona` is `admin` for the customer-side organizations and `audit_firm`
 * for the external assessor account used to demo the audit workbench.
 */
const DEMO_ADMIN_ACCOUNTS = Object.freeze([
  {
    orgName: 'Meridian Financial Group',
    industry: 'Financial Services',
    industryKey: 'financial',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@financial.com',
    aliasEmails: ['admin@enterprise.com'],
    firstName: 'Alice',
    lastName: 'Chen',
    persona: 'admin',
    frameworks: ['ffiec', 'sr_11_7', 'sec_markets_ai_risk', 'soc2', 'nist_ai_rmf'],
    targetCompliance: 0.8
  },
  {
    orgName: 'BrightPath Health',
    industry: 'Healthcare',
    industryKey: 'healthcare',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@healthcare.com',
    aliasEmails: ['admin@pro.com'],
    firstName: 'Sam',
    lastName: 'Rivera',
    persona: 'admin',
    frameworks: ['hipaa', 'hitech', 'nist_ai_rmf'],
    targetCompliance: 0.4
  },
  {
    orgName: 'Vanguard Defense Systems',
    industry: 'Defense & Government Contracting',
    industryKey: 'defense',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@defense.com',
    aliasEmails: ['admin@govcloud.com'],
    firstName: 'Eve',
    lastName: 'Marshall',
    persona: 'admin',
    frameworks: ['cmmc_2.0', 'nist_800_171', 'fedramp_high', 'nist_ai_rmf'],
    targetCompliance: 0.9
  },
  {
    orgName: 'NovaTech Solutions',
    industry: 'Technology / SaaS',
    industryKey: 'technology',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@technology.com',
    aliasEmails: ['admin@community.com'],
    firstName: 'Fred',
    lastName: 'Okafor',
    persona: 'admin',
    frameworks: ['soc2', 'iso_27001', 'gdpr', 'iso_42001'],
    targetCompliance: 0.2
  },
  {
    orgName: 'Cascade Grid Energy',
    industry: 'Energy & Utilities',
    industryKey: 'energy',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@energy.com',
    aliasEmails: [],
    firstName: 'Dana',
    lastName: 'Whitfield',
    persona: 'admin',
    frameworks: ['nerc_cip', 'nist_csf_2.0', 'nist_ai_rmf'],
    targetCompliance: 0.75
  },
  {
    orgName: 'Harborline Retail Group',
    industry: 'Retail & E-commerce',
    industryKey: 'retail',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@retail.com',
    aliasEmails: [],
    firstName: 'Marco',
    lastName: 'Delgado',
    persona: 'admin',
    // pci_dss_v4 is only in the ControlWeaver-Pro catalog; iso_27001 is in both,
    // so this organization has a real posture in either mirror.
    frameworks: ['pci_dss_v4', 'ccpa_cpra', 'iso_27001', 'state_ai_governance', 'nist_ai_rmf'],
    targetCompliance: 0.6
  },
  {
    orgName: 'Helixor Biosciences',
    industry: 'Pharmaceuticals & Life Sciences',
    industryKey: 'pharma',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@pharma.com',
    aliasEmails: [],
    firstName: 'Nadia',
    lastName: 'Volkov',
    persona: 'admin',
    frameworks: ['iso_27001', 'gdpr', 'iso_27701', 'eu_ai_act'],
    targetCompliance: 0.55
  },
  {
    orgName: 'Lakemont University',
    industry: 'Higher Education',
    industryKey: 'education',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@education.com',
    aliasEmails: [],
    firstName: 'Theo',
    lastName: 'Nakamura',
    persona: 'admin',
    frameworks: ['nist_csf_2.0', 'nist_800_171', 'ccpa_cpra', 'iso_42005'],
    targetCompliance: 0.35
  },
  {
    orgName: 'Sterling & Roe Advisory',
    industry: 'Audit & Assurance Firm',
    industryKey: 'auditfirm',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@auditfirm.com',
    aliasEmails: [],
    firstName: 'Rosalind',
    lastName: 'Sterling',
    persona: 'audit_firm',
    frameworks: ['soc2', 'iso_27001', 'nist_800_53', 'iso_42001'],
    targetCompliance: 0.7
  }
]);

/**
 * Framework codes the AI governance assessment actually reads. This list is
 * not "frameworks that mention AI" — it must stay in sync with the `f.code IN
 * (...)` filter in the checkAIGovernance feature, because a framework outside
 * it contributes no controls to that analysis no matter how AI-focused it is.
 *
 * Every demo organization carries at least one of these so the AI governance
 * screens have real data in every industry rather than demoing as empty.
 */
const AI_GOVERNANCE_FRAMEWORK_CODES = Object.freeze([
  'eu_ai_act',
  'nist_ai_rmf',
  'iso_42001',
  'iso_42005',
  'aiuc_1'
]);

/**
 * AI-focused regulatory frameworks that are genuinely about AI but are NOT
 * consumed by the AI governance assessment. Good for industry flavor; they do
 * not on their own make that analysis non-empty, so they never satisfy the
 * guard below.
 */
const AI_REGULATORY_FRAMEWORK_CODES = Object.freeze([
  'international_ai_governance',
  'state_ai_governance',
  'finra_supervisory_ai',
  'sec_markets_ai_risk'
]);

const AI_FRAMEWORK_CODES = Object.freeze([
  ...AI_GOVERNANCE_FRAMEWORK_CODES,
  ...AI_REGULATORY_FRAMEWORK_CODES
]);

function aiFrameworksFor(account) {
  return account.frameworks.filter((code) => AI_FRAMEWORK_CODES.includes(code));
}

function aiGovernanceFrameworksFor(account) {
  return account.frameworks.filter((code) => AI_GOVERNANCE_FRAMEWORK_CODES.includes(code));
}

// Fail at require time rather than letting a roster edit quietly ship an
// organization whose AI governance assessment would come back empty.
const accountsWithoutAi = DEMO_ADMIN_ACCOUNTS.filter(
  (account) => aiGovernanceFrameworksFor(account).length === 0
);
if (accountsWithoutAi.length > 0) {
  throw new Error(
    'Every demo account must include at least one framework from '
    + 'AI_GOVERNANCE_FRAMEWORK_CODES (the set the AI governance assessment reads). '
    + `Missing for: ${accountsWithoutAi.map((account) => account.email).join(', ')}`
  );
}

/**
 * The organization whose demo data is built around the audit workbench —
 * engagements, PBC requests, workpapers, findings, and the signoff chain.
 */
const DEMO_AUDIT_FIRM_ACCOUNT = Object.freeze(
  DEMO_ADMIN_ACCOUNTS.find((account) => account.persona === 'audit_firm')
);

if (!DEMO_AUDIT_FIRM_ACCOUNT) {
  throw new Error('DEMO_ADMIN_ACCOUNTS must contain exactly one account with persona "audit_firm".');
}

/**
 * Fallback demo login used when a caller asks for a tier or industry that has
 * no dedicated account. Never undefined — callers email this address out.
 */
const DEFAULT_DEMO_ACCOUNT_EMAIL = DEMO_ADMIN_ACCOUNTS[0].email;

const DEMO_ACCOUNT_BY_INDUSTRY = Object.freeze(
  Object.fromEntries(
    DEMO_ADMIN_ACCOUNTS.map((account) => [account.industryKey, account.email])
  )
);

const HF_FINDINGS_BY_TIER = Object.freeze({
  community: 28,
  pro: 28,
  enterprise: 28,
  govcloud: 28
});

const HF_DEMO_TARGET_ACCOUNTS = Object.freeze(
  DEMO_ADMIN_ACCOUNTS.map((account) => ({
    email: account.email,
    tier: account.tier,
    findings: HF_FINDINGS_BY_TIER[account.tier] || 10
  }))
);

/**
 * Auditor-role logins, one per demo organization. Derived from the admin
 * roster so a new industry automatically gets a matching auditor account
 * rather than silently having none.
 */
const DEMO_AUDITOR_ACCOUNTS = Object.freeze(
  DEMO_ADMIN_ACCOUNTS.map((account) => ({
    orgName: account.orgName,
    industryKey: account.industryKey,
    tier: account.tier,
    billingStatus: account.billingStatus,
    email: `auditor@${account.industryKey}.com`,
    aliasEmails: account.aliasEmails.map((alias) => alias.replace(/^admin@/, 'auditor@')),
    firstName: 'Avery',
    lastName: `${account.industry.split(/[\s&/]+/)[0]} Auditor`,
    role: 'auditor'
  }))
);

function collectDemoDomains() {
  const domains = new Set();
  for (const account of DEMO_ADMIN_ACCOUNTS) {
    for (const address of [account.email, ...account.aliasEmails]) {
      const domain = String(address).split('@')[1];
      if (domain) domains.add(domain.toLowerCase());
    }
  }
  return domains;
}

const DEMO_EMAIL_DOMAINS = Object.freeze([
  ...collectDemoDomains(),
  // Legacy domains — kept for backward compatibility with pre-existing DB accounts
  'free.com',
  'starter.com',
  'professional.com',
  'utilities.com'
]);

/**
 * Returns true if the email belongs to a shared demo account.
 * Demo accounts are multi-user (shared by sales prospects) so
 * password resets must be blocked to prevent one user from
 * locking everyone else out.
 */
function isDemoEmail(email) {
  if (!email) return false;
  const lower = String(email).trim().toLowerCase();
  const atIndex = lower.lastIndexOf('@');
  if (atIndex < 1) return false;
  const domain = lower.substring(atIndex + 1);
  return DEMO_EMAIL_DOMAINS.includes(domain);
}

function resolveDemoAccountPassword(...candidates) {
  const normalizedCandidates = candidates.map((candidate) => {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return {
        label: candidate.label || 'Demo account password',
        value: String(candidate.value || '').trim()
      };
    }
    return {
      label: 'Demo account password',
      value: String(candidate || '').trim()
    };
  });

  const provided = normalizedCandidates.find((candidate) => candidate.value.length > 0);
  const password = provided?.value || DEFAULT_DEMO_PASSWORD;
  if (password.length < MIN_DEMO_PASSWORD_LENGTH) {
    throw new Error(`${provided?.label || 'Demo account password'} must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters.`);
  }

  return password;
}

module.exports = {
  DEFAULT_DEMO_PASSWORD,
  AI_FRAMEWORK_CODES,
  AI_GOVERNANCE_FRAMEWORK_CODES,
  AI_REGULATORY_FRAMEWORK_CODES,
  aiFrameworksFor,
  aiGovernanceFrameworksFor,
  MIN_DEMO_PASSWORD_LENGTH,
  DEMO_BCRYPT_COST,
  DEMO_ADMIN_ACCOUNTS,
  DEMO_AUDITOR_ACCOUNTS,
  DEMO_AUDIT_FIRM_ACCOUNT,
  DEFAULT_DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_BY_INDUSTRY,
  HF_FINDINGS_BY_TIER,
  HF_DEMO_TARGET_ACCOUNTS,
  DEMO_EMAIL_DOMAINS,
  isDemoEmail,
  resolveDemoAccountPassword
};
