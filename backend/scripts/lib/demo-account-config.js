const DEFAULT_DEMO_PASSWORD = 'ControlWeave!2026';
const MIN_DEMO_PASSWORD_LENGTH = 15;

if (DEFAULT_DEMO_PASSWORD.length < MIN_DEMO_PASSWORD_LENGTH) {
  throw new Error(`DEFAULT_DEMO_PASSWORD must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters.`);
}

const DEMO_ADMIN_ACCOUNTS = Object.freeze([
  {
    orgName: 'Meridian Financial Group',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@enterprise.com',
    firstName: 'Alice',
    lastName: 'Chen',
    industry: 'Financial Services'
  },
  {
    orgName: 'Vanguard Defense Systems',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@govcloud.com',
    firstName: 'Eve',
    lastName: 'Marshall',
    industry: 'Defense & Government Contracting'
  },
  {
    orgName: 'BrightPath Health',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@pro.com',
    firstName: 'Sam',
    lastName: 'Rivera',
    industry: 'Healthcare'
  },
  {
    orgName: 'NovaTech Solutions',
    tier: 'enterprise',
    billingStatus: 'comped',
    email: 'admin@community.com',
    firstName: 'Fred',
    lastName: 'Okafor',
    industry: 'Technology / SaaS'
  }
]);

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

const DEMO_EMAIL_DOMAINS = Object.freeze([
  'community.com',
  'pro.com',
  'enterprise.com',
  'govcloud.com',
  // Legacy domains — kept for backward compatibility with pre-existing DB accounts
  'free.com',
  'starter.com',
  'professional.com',
  'utilities.com'
]);

// Local parts the demo seed scripts create on demo domains. Matching is done
// on exact addresses (local part + domain), never on the whole domain: domains
// like healthcare.com or enterprise.com belong to real companies, and a real
// user on one of them must not inherit the demo-account exemptions.
const DEMO_LOCAL_PARTS = Object.freeze([
  'admin',
  'auditor',
  'auditor.lead',
  'auditor.staff',
  'analyst',
  'leadership'
]);

/**
 * Demo mode controls whether shared demo accounts are seeded and whether
 * they get demo treatment at login. Opt-in in production: DEMO_AUTO_SEED must
 * be explicitly "true". Outside production it defaults to on unless set to
 * "false", so local development keeps working unchanged.
 */
function isDemoModeEnabled() {
  const raw = String(process.env.DEMO_AUTO_SEED || '').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Returns true if the email belongs to a shared demo account.
 * Demo accounts are multi-user (shared by sales prospects) so
 * password resets must be blocked to prevent one user from
 * locking everyone else out. Always false when demo mode is off.
 */
function isDemoEmail(email) {
  if (!email || !isDemoModeEnabled()) return false;
  const lower = String(email).trim().toLowerCase();
  const atIndex = lower.lastIndexOf('@');
  if (atIndex < 1) return false;
  const localPart = lower.substring(0, atIndex);
  const domain = lower.substring(atIndex + 1);
  return DEMO_LOCAL_PARTS.includes(localPart) && DEMO_EMAIL_DOMAINS.includes(domain);
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
  // The built-in default is published in the repository, so production demo
  // instances must supply their own password (some callers pass the default
  // explicitly as a fallback candidate, hence the value comparison).
  if (password === DEFAULT_DEMO_PASSWORD && process.env.NODE_ENV === 'production') {
    throw new Error('DEMO_ACCOUNT_PASSWORD must be set to a non-default value for demo accounts in production.');
  }
  if (password.length < MIN_DEMO_PASSWORD_LENGTH) {
    throw new Error(`${provided?.label || 'Demo account password'} must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters.`);
  }

  return password;
}

module.exports = {
  DEFAULT_DEMO_PASSWORD,
  MIN_DEMO_PASSWORD_LENGTH,
  DEMO_ADMIN_ACCOUNTS,
  HF_FINDINGS_BY_TIER,
  HF_DEMO_TARGET_ACCOUNTS,
  DEMO_EMAIL_DOMAINS,
  DEMO_LOCAL_PARTS,
  isDemoModeEnabled,
  isDemoEmail,
  resolveDemoAccountPassword
};
