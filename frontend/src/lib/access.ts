// @tier: community
export type OrganizationTier = 'community' | 'pro' | 'enterprise' | 'govcloud';

export const TIER_LEVELS: Record<string, number> = {
  community: 0,
  pro: 1,
  enterprise: 2,
  govcloud: 3,
};

export interface AccessUser {
  role?: string;
  roles?: string[];
  permissions?: string[];
  isPlatformAdmin?: boolean;
  organizationTier?: string;
  effectiveTier?: string;
  featureOverrides?: Record<string, unknown>;
  globalFeatureFlags?: Record<string, boolean>;
  onboardingCompleted?: boolean;
  frameworkCodes?: string[];
}

function normalizeRoleNames(user: AccessUser | null | undefined): string[] {
  if (!user) return [];
  const primaryRole = String(user.role || '').toLowerCase().trim();
  const mappedRoles = Array.isArray(user.roles)
    ? user.roles.map((entry) => String(entry || '').toLowerCase().trim())
    : [];
  return [primaryRole, ...mappedRoles].filter((entry) => entry.length > 0);
}

export function normalizeTier(tier?: string | null): OrganizationTier {
  const value = String(tier || '').toLowerCase();
  if (value in TIER_LEVELS) {
    return value as OrganizationTier;
  }
  return 'community';
}

export function hasPermission(user: AccessUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = user.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function hasAnyPermission(user: AccessUser | null | undefined, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function hasTierAtLeast(user: AccessUser | null | undefined, minTier: OrganizationTier): boolean {
  if (!user) return false;
  const tier = user.effectiveTier || user.organizationTier;
  const userLevel = TIER_LEVELS[normalizeTier(tier)];
  const requiredLevel = TIER_LEVELS[normalizeTier(minTier)];
  return userLevel >= requiredLevel;
}

/**
 * Check if a named feature is enabled for the user, respecting global flags
 * and per-org overrides.
 */
export function hasFeature(user: AccessUser | null | undefined, featureName: string): boolean {
  if (!user) return false;
  const globalFlags = (user.globalFeatureFlags || {}) as Record<string, boolean>;
  const overrides = (user.featureOverrides || {}) as Record<string, unknown>;
  const orgFeatures = (overrides.features || {}) as Record<string, boolean>;

  // Per-org force ON beats global OFF
  if (orgFeatures[featureName] === true) return true;
  // Global OFF blocks
  if (globalFlags[featureName] === false) return false;
  // Per-org force OFF
  if (orgFeatures[featureName] === false) return false;
  return true;
}

export function requiresOrganizationOnboarding(user: AccessUser | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role !== 'admin') return false;

  const normalizedRoles = Array.isArray(user.roles)
    ? user.roles.map((entry) => String(entry || '').toLowerCase())
    : [];

  return !normalizedRoles.includes('auditor');
}

export function canAccessAuditorWorkspace(user: AccessUser | null | undefined): boolean {
  const roleNames = normalizeRoleNames(user);
  return roleNames.some((entry) => /^auditor(?:_|$)/.test(entry));
}

export function isPlatformAdmin(user: AccessUser | null | undefined): boolean {
  return Boolean(user?.isPlatformAdmin);
}

const DEMO_EMAIL_DOMAINS = [
  'community.com', 'pro.com', 'enterprise.com', 'govcloud.com',
  // Backward compat: old tier domains still in some demo databases
  'free.com', 'starter.com', 'professional.com', 'utilities.com'
];

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = String(email).trim().toLowerCase();
  const atIndex = lower.lastIndexOf('@');
  if (atIndex < 1) return false;
  const domain = lower.substring(atIndex + 1);
  return DEMO_EMAIL_DOMAINS.includes(domain);
}

/**
 * RMF Lifecycle visibility gate.
 * Returns true when the organization has selected NIST 800-53,
 * NIST 800-171, or CMMC 2.0 — the frameworks that follow NIST SP 800-37.
 */
const RMF_FRAMEWORK_CODES = new Set(['nist_800_53', 'nist_800_171', 'cmmc_2.0']);

export function hasRmfFramework(user: AccessUser | null | undefined): boolean {
  if (!user) return false;
  const codes = user.frameworkCodes || [];
  return codes.some((code) => RMF_FRAMEWORK_CODES.has(code.toLowerCase()));
}
