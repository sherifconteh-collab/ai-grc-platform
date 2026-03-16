'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { APP_POSITIONING_SHORT } from '@/lib/branding';
import BrandLogo from '@/components/BrandLogo';

type TierKey = 'community' | 'pro' | 'enterprise' | 'govcloud';
type BillingCadence = 'monthly' | 'annual';

const TIER_OPTIONS: Array<{
  key: TierKey;
  label: string;
  description: string;
  frameworkLimit: number;
  externalUrl?: string;
}> = [
  { key: 'community', label: 'Community (Free)', description: 'Self-hosted, up to 2 frameworks. AGPL v3.', frameworkLimit: 2 },
  { key: 'pro', label: 'Pro ($499/mo)', description: 'Available at controlweave.com — Hosted SaaS. Unlimited frameworks, SSO, 48h SLA.', frameworkLimit: -1, externalUrl: 'https://controlweave.com/#pricing' },
  { key: 'enterprise', label: 'Enterprise', description: 'Available at controlweave.com — Unlimited frameworks. Advanced AI governance and impact assessment.', frameworkLimit: -1, externalUrl: 'https://controlweave.com/#pricing' },
  { key: 'govcloud', label: 'Gov Cloud (Custom)', description: 'Available at controlweave.com — FedRAMP-ready, IL4/IL5, ITAR-compliant. Custom contract.', frameworkLimit: -1, externalUrl: 'https://controlweave.com/#pricing' },
];

const TIER_ORDER: Record<TierKey, number> = { community: 0, pro: 1, enterprise: 2, govcloud: 3 };

interface FrameworkOption {
  code: string;
  label: string;
  description: string;
  controlCount: number;
  tierRequired: TierKey;
  group?: string;
}

// Framework groups: all standards in a group count as 1 toward the tier limit
const FRAMEWORK_GROUP_METADATA: Record<string, { label: string; description: string }> = { // ip-hygiene:ignore
  iso_27000: { label: 'ISO 27000 Series', description: 'Information security management standards — 27001, 27002, 27005, 27017, 27018, 27701, and 31000. Counts as 1 framework.' }, // ip-hygiene:ignore
  iso_ai: { label: 'ISO AI Suite', description: 'AI governance standards — 42001, 42005, 23894, 38507, 22989, 23053, 5259, and TRs on bias, trust, and ethics. Counts as 1 framework.' }, // ip-hygiene:ignore
  csf_2_profiles: { label: 'NIST CSF 2.0 — Cyber AI Profiles', description: 'NIST IR 8596 profiles for AI cybersecurity: Secure (SEC), Defend (DEF), and Thwart (THW). Counts as 1 framework.' },
  owasp_ai: { label: 'OWASP AI Security', description: 'OWASP Top 10 for LLM Applications and Agentic AI risks. Counts as 1 framework.' },
};

const FRAMEWORK_OPTIONS: FrameworkOption[] = [
  { code: 'nist_csf_2.0', label: 'NIST Cybersecurity Framework 2.0', description: 'Comprehensive cybersecurity risk management framework with 6 core functions aligned to the system lifecycle.', controlCount: 43, tierRequired: 'community' },
  { code: 'nist_800_53', label: 'NIST SP 800-53 Rev 5', description: 'Federal-grade security and privacy control catalog. Requires RMF workflow and information type selection.', controlCount: 47, tierRequired: 'community' },
  { code: 'iso_27001', label: 'ISO/IEC 27001:2022', description: 'Information security management system (ISMS) standard with Annex A controls.', controlCount: 39, tierRequired: 'community', group: 'iso_27000' }, // ip-hygiene:ignore
  { code: 'soc2', label: 'SOC 2 Type II', description: 'Trust Service Criteria for service organizations. Mapped to trustworthiness objectives.', controlCount: 26, tierRequired: 'community' }, // ip-hygiene:ignore
  { code: 'nist_ai_rmf', label: 'NIST AI Risk Management Framework', description: 'AI risk management aligned with trustworthiness properties for responsible AI deployment.', controlCount: 18, tierRequired: 'community' },
  { code: 'nist_800_171', label: 'NIST SP 800-171 Rev 3', description: 'Protecting Controlled Unclassified Information (CUI) in non-federal systems. Required for DoD supply-chain programs.', controlCount: 23, tierRequired: 'pro' },
  { code: 'cmmc_2.0', label: 'CMMC 2.0 (Level 2)', description: 'Cybersecurity Maturity Model Certification — 110 practices for DoD contractor CUI protection.', controlCount: 50, tierRequired: 'pro' }, // ip-hygiene:ignore
  { code: 'nist_privacy', label: 'NIST Privacy Framework', description: 'Privacy risk management framework integrated with system lifecycle stages.', controlCount: 11, tierRequired: 'govcloud' },
  { code: 'fiscam', label: 'FISCAM', description: 'Federal Information System Controls Audit Manual for financial statement audits.', controlCount: 12, tierRequired: 'pro' },
  { code: 'gdpr', label: 'GDPR', description: 'EU General Data Protection Regulation requirements for data privacy and protection.', controlCount: 16, tierRequired: 'govcloud' },
  { code: 'hipaa', label: 'HIPAA Security Rule', description: 'Health Insurance Portability and Accountability Act security requirements for protected health information.', controlCount: 17, tierRequired: 'enterprise' }, // ip-hygiene:ignore
  { code: 'hitech', label: 'HITECH Act', description: 'Health Information Technology for Economic and Clinical Health Act — breach notification, enforcement, business associate requirements, and EHR security extending HIPAA.', controlCount: 28, tierRequired: 'enterprise' }, // ip-hygiene:ignore
  { code: 'ffiec', label: 'FFIEC IT Examination Handbook', description: 'Federal Financial Institutions Examination Council IT standards for banking and finance.', controlCount: 12, tierRequired: 'enterprise' },
  { code: 'nerc_cip', label: 'NERC CIP', description: 'North American Electric Reliability Corporation Critical Infrastructure Protection standards.', controlCount: 12, tierRequired: 'govcloud' },
  { code: 'owasp_llm_top10', label: 'OWASP LLM Top 10 (2025)', description: 'Critical security risks for Large Language Model deployments including prompt injection and data poisoning.', controlCount: 10, tierRequired: 'enterprise', group: 'owasp_ai' },
  { code: 'owasp_agentic_top10', label: 'OWASP Agentic AI Top 10 (2026)', description: 'Security risks for agentic and autonomous AI applications that act independently and chain actions.', controlCount: 10, tierRequired: 'enterprise', group: 'owasp_ai' },
  { code: 'eu_ai_act', label: 'EU AI Act', description: 'European Union Artificial Intelligence Act. Full lifecycle governance for AI systems.', controlCount: 15, tierRequired: 'govcloud' },
  { code: 'iso_42001', label: 'ISO/IEC 42001:2023', description: 'AI Management System standard. Lifecycle-aligned governance for AI organizations.', controlCount: 16, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_42005', label: 'ISO/IEC 42005:2025', description: 'AI system impact assessment guidance. Plan, document, and monitor AI impact assessments.', controlCount: 10, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_23894', label: 'ISO/IEC 23894:2023', description: 'AI risk management guidance aligned with ISO 31000.', controlCount: 13, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_38507', label: 'ISO/IEC 38507:2022', description: 'Corporate governance of AI systems.', controlCount: 10, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_22989', label: 'ISO/IEC 22989:2022', description: 'AI concepts, terminology, and reference architecture.', controlCount: 10, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_23053', label: 'ISO/IEC 23053:2022', description: 'Framework for AI systems using machine learning.', controlCount: 12, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_5259', label: 'ISO/IEC 5259 Series', description: 'Data quality for analytics and machine learning.', controlCount: 12, tierRequired: 'enterprise', group: 'iso_ai' }, // ip-hygiene:ignore
  { code: 'iso_tr_24027', label: 'ISO/IEC TR 24027:2021', description: 'Bias in AI and AI-assisted decision making.', controlCount: 12, tierRequired: 'enterprise', group: 'iso_ai' },
  { code: 'iso_tr_24028', label: 'ISO/IEC TR 24028:2020', description: 'Trustworthiness in AI systems.', controlCount: 13, tierRequired: 'enterprise', group: 'iso_ai' },
  { code: 'iso_tr_24368', label: 'ISO/IEC TR 24368:2022', description: 'Ethical and societal concerns in AI.', controlCount: 13, tierRequired: 'enterprise', group: 'iso_ai' },
  { code: 'iso_27002', label: 'ISO/IEC 27002:2022', description: 'Security controls guidance — companion to ISO 27001.', controlCount: 15, tierRequired: 'enterprise', group: 'iso_27000' }, // ip-hygiene:ignore
  { code: 'iso_27005', label: 'ISO/IEC 27005:2022', description: 'Information security risk management methodology.', controlCount: 12, tierRequired: 'enterprise', group: 'iso_27000' }, // ip-hygiene:ignore
  { code: 'iso_27017', label: 'ISO/IEC 27017:2015', description: 'Cloud security controls based on ISO 27002.', controlCount: 12, tierRequired: 'enterprise', group: 'iso_27000' }, // ip-hygiene:ignore
  { code: 'iso_27018', label: 'ISO/IEC 27018:2019', description: 'PII protection in public cloud environments.', controlCount: 11, tierRequired: 'enterprise', group: 'iso_27000' }, // ip-hygiene:ignore
  { code: 'iso_27701', label: 'ISO/IEC 27701:2019', description: 'Privacy information management system extending ISO 27001.', controlCount: 14, tierRequired: 'enterprise', group: 'iso_27000' }, // ip-hygiene:ignore
  { code: 'iso_31000', label: 'ISO 31000:2018', description: 'Risk management principles and guidelines.', controlCount: 11, tierRequired: 'enterprise', group: 'iso_27000' },
  { code: 'nist_800_207', label: 'NIST SP 800-207 Zero Trust Architecture', description: 'Zero Trust Architecture reference model and design principles for modern network security.', controlCount: 18, tierRequired: 'enterprise' },
  { code: 'ccpa_cpra', label: 'CCPA / CPRA', description: 'California Consumer Privacy Act and California Privacy Rights Act. Consumer data rights, opt-out requirements, and privacy risk assessments for California operations.', controlCount: 14, tierRequired: 'govcloud' },
  { code: 'state_ai_governance', label: 'State AI Governance Laws', description: 'Consolidated state-level AI regulations including Colorado AI Act, Illinois AI Video Interview Act, and emerging state AI transparency and impact assessment laws.', controlCount: 12, tierRequired: 'govcloud' },
  // Backend: scripts/seed-cyber-ai-profile.js
  { code: 'nist_ir_8596_sec', label: 'NIST IR 8596 — Secure (SEC)', description: 'CSF 2.0 Cyber AI Profile: Secure AI System Components. Covers GV/ID/PR/DE/RS/RC for AI asset protection.', controlCount: 25, tierRequired: 'enterprise', group: 'csf_2_profiles' },
  { code: 'nist_ir_8596_def', label: 'NIST IR 8596 — Defend (DEF)', description: 'CSF 2.0 Cyber AI Profile: AI-Enabled Cyber Defense. Covers AI-augmented detection and response.', controlCount: 17, tierRequired: 'enterprise', group: 'csf_2_profiles' },
  { code: 'nist_ir_8596_thw', label: 'NIST IR 8596 — Thwart (THW)', description: 'CSF 2.0 Cyber AI Profile: Thwart AI-Enabled Attacks. Covers countering adversarial AI threats.', controlCount: 20, tierRequired: 'enterprise', group: 'csf_2_profiles' },
];

const NIST_800_53_DETAIL_OPTIONS = [
  { value: 'cui', label: 'Controlled Unclassified Information (CUI)' },
  { value: 'fci', label: 'Federal Contract Information (FCI)' },
  { value: 'pii', label: 'Personally Identifiable Information (PII)' },
  { value: 'phi', label: 'Protected Health Information (PHI)' },
  { value: 'financial', label: 'Financial Information' },
  { value: 'operational', label: 'Operational / Mission Data' },
  { value: 'ip', label: 'Intellectual Property' },
  { value: 'confidential', label: 'Confidential Business Data' },
  { value: 'restricted', label: 'Restricted Data' },
  { value: 'internal', label: 'Internal Use Information' },
  { value: 'public', label: 'Public Information' },
  { value: 'pci', label: 'Payment Card Information (PCI)' },
] as const;

const NIST_800_171_DETAIL_OPTIONS = [
  { value: 'cui', label: 'Controlled Unclassified Information (CUI)' },
  { value: 'fci', label: 'Federal Contract Information (FCI)' },
  { value: 'confidential', label: 'Confidential Business Data' },
  { value: 'restricted', label: 'Restricted Data' },
  { value: 'operational', label: 'Operational / Mission Data' },
  { value: 'ip', label: 'Intellectual Property' },
  { value: 'internal', label: 'Internal Use Information' },
] as const;

function toggleArrayValue(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((entry) => entry !== value);
  }
  return [...current, value];
}

function tierLabel(tier: TierKey): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    }>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [initialRole, setInitialRole] = useState<'admin' | 'auditor' | 'user'>('admin');
  const [selectedTier, setSelectedTier] = useState<TierKey>('community');
  const [billingCadence, setBillingCadence] = useState<BillingCadence>('monthly');
  const [frameworkCodes, setFrameworkCodes] = useState<string[]>([]);
  const [informationTypes, setInformationTypes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { register } = useAuth();
  const organizationIsRequired = initialRole === 'admin';

  const selectedTierMeta = TIER_OPTIONS.find((t) => t.key === selectedTier) || TIER_OPTIONS[0];
  const frameworkLimit = selectedTierMeta.frameworkLimit;

  const requiresNist80053Details = frameworkCodes.includes('nist_800_53');
  const requiresNist800171Details = frameworkCodes.includes('nist_800_171');

  const hasUtilitiesFrameworks = frameworkCodes.some((code) =>
    FRAMEWORK_OPTIONS.some((fw) => fw.code === code && fw.tierRequired === 'govcloud')
  );

  const availableFrameworks = FRAMEWORK_OPTIONS.filter(
    (fw) => (TIER_ORDER as Record<string, number>)[fw.tierRequired] <= (TIER_ORDER as Record<string, number>)[selectedTier]
  );
  const lockedFrameworks = FRAMEWORK_OPTIONS.filter(
    (fw) => (TIER_ORDER as Record<string, number>)[fw.tierRequired] > (TIER_ORDER as Record<string, number>)[selectedTier]
  );

  useEffect(() => {
    if (!requiresNist80053Details && !requiresNist800171Details && informationTypes.length > 0) {
      setInformationTypes([]);
    }
  }, [requiresNist80053Details, requiresNist800171Details, informationTypes.length]);

  useEffect(() => {
    const rawPlan = String(searchParams.get('plan') || '').toLowerCase().trim();
    const rawBilling = String(searchParams.get('billing') || '').toLowerCase().trim();

    let tierFromQuery: TierKey | null = null;
    let cadenceFromQuery: BillingCadence | null = null;

    if (['community', 'pro', 'enterprise', 'govcloud'].includes(rawPlan)) {
      tierFromQuery = rawPlan as TierKey;
    } else {
      const [tierPart, cadencePart] = rawPlan.split('_');
      if (['community', 'pro', 'enterprise', 'govcloud'].includes(tierPart)) {
        tierFromQuery = tierPart as TierKey;
      }
      if (cadencePart === 'monthly' || cadencePart === 'annual') {
        cadenceFromQuery = cadencePart as BillingCadence;
      }
    }

    if (rawBilling === 'monthly' || rawBilling === 'annual') {
      cadenceFromQuery = rawBilling as BillingCadence;
    }

    if (tierFromQuery) {
      setSelectedTier(tierFromQuery);
    }
    if (cadenceFromQuery) {
      setBillingCadence(cadenceFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    setFrameworkCodes((current) =>
      current.filter((code) =>
        FRAMEWORK_OPTIONS.some((fw) => fw.code === code && (TIER_ORDER as Record<string, number>)[fw.tierRequired] <= (TIER_ORDER as Record<string, number>)[selectedTier])
      )
    );
  }, [selectedTier]);

  // Count effective frameworks: each framework_group counts as 1, ungrouped count individually
  const getEffectiveCount = (codes: string[]) => {
    const seen = new Set<string>();
    for (const code of codes) {
      const fw = FRAMEWORK_OPTIONS.find((f) => f.code === code);
      seen.add(fw?.group || code);
    }
    return seen.size;
  };

  const effectiveCount = getEffectiveCount(frameworkCodes);

  const toggleFramework = (code: string) => {
    setFrameworkCodes((current) => {
      if (current.includes(code)) {
        return current.filter((entry) => entry !== code);
      }
      const nextCodes = [...current, code];
      const nextEffective = getEffectiveCount(nextCodes);
      if (frameworkLimit !== -1 && nextEffective > frameworkLimit) {
        setError(`${tierLabel(selectedTier)} tier allows up to ${frameworkLimit} framework selection${frameworkLimit === 1 ? '' : 's'} (bundled ISO standards count as 1). Deselect one first or choose a higher tier.`);
        return current;
      }
      return nextCodes;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    const normalizedOrganizationName = organizationName.trim();
    if (organizationIsRequired && !normalizedOrganizationName) {
      setError('Organization name is required for admin signup');
      return;
    }

    if (organizationIsRequired && frameworkCodes.length === 0) {
      setError('Select at least one framework to initialize your organization');
      return;
    }

    if (organizationIsRequired && requiresNist80053Details && informationTypes.length === 0) {
      setError('NIST 800-53 requires at least one information type selection (NIST SP 800-60).');
      return;
    }

    setLoading(true);

    try {
      if (organizationIsRequired && selectedTier !== 'community') {
        localStorage.setItem('pendingPlan', `${selectedTier}_${billingCadence}`);
      } else {
        localStorage.removeItem('pendingPlan');
      }

      await register(
        email,
        password,
        fullName,
        normalizedOrganizationName,
        initialRole,
        organizationIsRequired ? frameworkCodes : [],
        organizationIsRequired && requiresNist80053Details ? informationTypes : []
      );
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-800 py-10 px-4">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-3xl">
        <div className="text-center mb-8">
          <BrandLogo
            className="flex flex-col items-center gap-3"
            imageClassName="h-16 w-16"
            showTagline={true}
            size={64}
          />
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Create Account</h1>
          <p className="text-xs text-purple-700 mt-2 font-medium">
            Includes a 14-day full-feature trial. After trial end, your org moves to Free tier unless upgraded.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="initialRole" className="block text-sm font-medium text-gray-700 mb-2">
                Initial Role
              </label>
              <select
                id="initialRole"
                value={initialRole}
                onChange={(e) => setInitialRole(e.target.value as 'admin' | 'auditor' | 'user')}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="admin">Admin (recommended for first user)</option>
                <option value="auditor">Auditor (read-focused)</option>
                <option value="user">User (implementation contributor)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Choose your working mode first. Admins can update role assignments later.
              </p>
            </div>

            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 mb-2">
                {organizationIsRequired ? 'Organization Name' : 'Organization / Client (Optional)'}
              </label>
              <input
                id="organizationName"
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required={organizationIsRequired}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder={organizationIsRequired ? 'Enter your organization name' : 'Optional now; can be set later'}
              />
              <p className="text-xs text-gray-500 mt-1">
                {organizationIsRequired
                  ? 'Required for admin onboarding.'
                  : 'You can start immediately and set organization details later.'}
              </p>
            </div>
          </div>

          {organizationIsRequired && (
            <>
              {/* Tier Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Your Tier
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {TIER_OPTIONS.map((tier) => (
                    <button
                      key={tier.key}
                      type="button"
                      onClick={() => {
                        if (tier.externalUrl) {
                          window.open(tier.externalUrl, '_blank', 'noopener,noreferrer');
                        } else {
                          setSelectedTier(tier.key);
                        }
                      }}
                      className={`text-left rounded-lg border p-3 transition ${
                        selectedTier === tier.key
                          ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-500'
                          : tier.externalUrl
                          ? 'border-gray-200 bg-gray-50 hover:border-purple-400 opacity-75'
                          : 'border-gray-200 bg-white hover:border-purple-400'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{tier.label}{tier.externalUrl ? ' ↗' : ''}</p>
                      <p className="text-xs text-gray-500 mt-1">{tier.description}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This is the Community Edition (self-hosted). Paid plans (Pro, Enterprise, Gov Cloud) are available at{' '}
                  <a href="https://controlweave.com/#pricing" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">controlweave.com</a>.
                </p>

              </div>

              {/* Framework Selection */}
              <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Available Frameworks
                  </label>
                  <span className="text-xs text-gray-500">
                    {frameworkCodes.length} selected{frameworkLimit !== -1 ? ` (${effectiveCount} counting toward limit of ${frameworkLimit})` : ''}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Select the frameworks for your organization. Bundled groups (ISO series, OWASP, CSF Profiles) count as 1 toward your limit.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[28rem] overflow-y-auto pr-1">
                  {(() => {
                    const renderedGroups = new Set<string>();
                    return availableFrameworks.map((fw) => {
                      // Grouped framework — render once as a collapsible card
                      if (fw.group) {
                        if (renderedGroups.has(fw.group)) return null;
                        renderedGroups.add(fw.group);
                        const groupMeta = FRAMEWORK_GROUP_METADATA[fw.group];
                        const groupMembers = availableFrameworks.filter((f) => f.group === fw.group);
                        const selectedCount = groupMembers.filter((f) => frameworkCodes.includes(f.code)).length;
                        const totalControls = groupMembers.reduce((sum, f) => sum + f.controlCount, 0);
                        const isExpanded = expandedGroups.has(fw.group);
                        const groupAlreadySelected = frameworkCodes.some((c) => FRAMEWORK_OPTIONS.find((f) => f.code === c)?.group === fw.group);
                        const isAtLimit = frameworkLimit !== -1 && effectiveCount >= frameworkLimit && !groupAlreadySelected;
                        return (
                          <div key={`group-${fw.group}`} className={`rounded-lg border p-3 transition ${selectedCount > 0 ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white'}`}>
                            <button
                              type="button"
                              onClick={() => setExpandedGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(fw.group!)) next.delete(fw.group!); else next.add(fw.group!);
                                return next;
                              })}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">{groupMeta?.label ?? fw.group}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{groupMembers.length} standards · {totalControls} controls</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {selectedCount > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white">
                                      {selectedCount} selected
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                                </div>
                              </div>
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{groupMeta?.description}</p>
                            </button>
                            {isExpanded && (
                              <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                                {groupMembers.map((child) => {
                                  const isChildSelected = frameworkCodes.includes(child.code);
                                  const isChildLocked = !isChildSelected && isAtLimit;
                                  return (
                                    <button
                                      key={child.code}
                                      type="button"
                                      onClick={() => toggleFramework(child.code)}
                                      disabled={isChildLocked}
                                      className={`w-full text-left rounded-md border p-2 transition text-xs ${
                                        isChildSelected
                                          ? 'border-purple-500 bg-purple-100'
                                          : isChildLocked
                                            ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                                            : 'border-gray-200 bg-white hover:border-purple-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="font-medium text-gray-900">{child.label}</p>
                                        </div>
                                        <span className={`shrink-0 px-2 py-0.5 rounded-full ${isChildSelected ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                          {isChildSelected ? '✓' : 'Select'}
                                        </span>
                                      </div>
                                      <p className="text-gray-500 mt-1 line-clamp-1">{child.description}</p>
                                      <p className="text-gray-400 mt-0.5">{child.controlCount} controls · Tier: {tierLabel(child.tierRequired)}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Ungrouped framework — render as individual card
                      const isSelected = frameworkCodes.includes(fw.code);
                      const isAtLimit = frameworkLimit !== -1 && effectiveCount >= frameworkLimit;
                      const isLocked = !isSelected && isAtLimit;
                      return (
                        <button
                          key={fw.code}
                          type="button"
                          onClick={() => toggleFramework(fw.code)}
                          disabled={isLocked}
                          className={`text-left rounded-lg border p-3 transition ${
                            isSelected
                              ? 'border-purple-600 bg-purple-50'
                              : isLocked
                                ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                                : 'border-gray-200 bg-white hover:border-purple-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{fw.label}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{fw.code}</p>
                            </div>
                            <span
                              className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                                isSelected ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-2 line-clamp-2">{fw.description}</p>
                          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                            <span>{fw.controlCount} controls</span>
                            <span>Tier: {tierLabel(fw.tierRequired)}</span>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>

                {lockedFrameworks.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Requires a higher tier
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(() => {
                        const renderedLockedGroups = new Set<string>();
                        return lockedFrameworks.map((fw) => {
                          if (fw.group) {
                            if (renderedLockedGroups.has(fw.group)) return null;
                            renderedLockedGroups.add(fw.group);
                            const groupMeta = FRAMEWORK_GROUP_METADATA[fw.group];
                            const groupMembers = lockedFrameworks.filter((f) => f.group === fw.group);
                            const totalControls = groupMembers.reduce((sum, f) => sum + f.controlCount, 0);
                            const lowestTier = groupMembers.reduce((t, f) => TIER_ORDER[f.tierRequired] < TIER_ORDER[t] ? f.tierRequired : t, groupMembers[0].tierRequired);
                            return (
                              <div key={`locked-group-${fw.group}`} className="text-left rounded-lg border border-gray-200 bg-gray-50 p-3 opacity-60">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-500">{groupMeta?.label ?? fw.group}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{groupMembers.length} standards · {totalControls} controls</p>
                                  </div>
                                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                                    {tierLabel(lowestTier)}+
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-2 line-clamp-2">{groupMeta?.description}</p>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={fw.code}
                              className="text-left rounded-lg border border-gray-200 bg-gray-50 p-3 opacity-60"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-500">{fw.label}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{fw.code}</p>
                                </div>
                                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                                  {tierLabel(fw.tierRequired)}+
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mt-2 line-clamp-2">{fw.description}</p>
                              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{fw.controlCount} controls</span>
                                <span>Tier: {tierLabel(fw.tierRequired)}</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Regulatory Monitoring — shown when utilities-tier frameworks selected */}
              {hasUtilitiesFrameworks && (
                <div className="border border-teal-200 bg-teal-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">🤖</span>
                    <p className="text-sm font-semibold text-teal-900">
                      AI-Powered Regulatory Monitoring
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                      Included with Utilities
                    </span>
                  </div>
                  <p className="text-xs text-teal-800 mt-1">
                    Your selected privacy and regional frameworks are automatically monitored for regulatory changes.
                    After setup, ControlWeave&apos;s AI will continuously scan the regulatory landscape and alert you to:
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-teal-800 list-disc list-inside">
                    <li>Upcoming state privacy laws and enforcement deadlines</li>
                    <li>New AI governance requirements at state, federal, and international levels</li>
                    <li>Amendments to existing regulations (CCPA/CPRA, GDPR, HIPAA, EU AI Act)</li>
                    <li>Emerging controls and compliance obligations before they take effect</li>
                    <li>Impact assessments showing which of your current controls are affected</li>
                  </ul>
                  <p className="text-xs text-teal-700 mt-3 font-medium">
                    🔄 Seamless provider handoff
                  </p>
                  <p className="text-xs text-teal-700 mt-0.5">
                    Every AI call includes a master context prompt built from your organization&apos;s profile —
                    industry, frameworks, compliance posture, CIA baseline, assets, and vulnerabilities.
                    If you switch LLM providers in Settings, the new provider receives this context immediately
                    with zero reconfiguration.
                  </p>
                </div>
              )}

              {/* NIST 800-53 specific details */}
              {requiresNist80053Details && (
                <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-indigo-900">
                    NIST SP 800-53 — Information Types Required (NIST SP 800-60)
                  </p>
                  <p className="text-xs text-indigo-800 mt-1">
                    NIST 800-53 requires you to identify the information types your system processes, stores, or transmits.
                    These categories drive control baseline selection and impact-level tailoring per FIPS 199 / SP 800-60.
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {NIST_800_53_DETAIL_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-start gap-2 text-sm text-indigo-900">
                        <input
                          type="checkbox"
                          checked={informationTypes.includes(option.value)}
                          onChange={() => setInformationTypes((current) => toggleArrayValue(current, option.value))}
                          className="mt-1"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* NIST 800-171 specific details */}
              {requiresNist800171Details && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-amber-900">
                    NIST SP 800-171 — CUI Categories
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    NIST 800-171 protects Controlled Unclassified Information (CUI) in non-federal systems.
                    Identify the CUI categories relevant to your contracts or regulatory obligations. These determine
                    which security families and assessment objectives apply.
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {NIST_800_171_DETAIL_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-start gap-2 text-sm text-amber-900">
                        <input
                          type="checkbox"
                          checked={informationTypes.includes(option.value)}
                          onChange={() => setInformationTypes((current) => toggleArrayValue(current, option.value))}
                          className="mt-1"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="At least 12 characters"
              />
              <p className="text-xs text-gray-500 mt-1">
                Must include uppercase, lowercase, number, and special character
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Re-enter your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-md font-semibold hover:bg-purple-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-purple-600 hover:text-purple-700 font-semibold">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            {APP_POSITIONING_SHORT}
          </p>
        </div>
      </div>
    </div>
  );
}

