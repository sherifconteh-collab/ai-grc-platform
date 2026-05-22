'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { frameworkAPI, organizationAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission, requiresOrganizationOnboarding } from '@/lib/access';
import { getStoredPendingBillingPlan, VALID_BILLING_PLANS } from '@/lib/billing';

type CiaLevel = 'low' | 'moderate' | 'high';
type RmfStage = 'prepare' | 'categorize' | 'select' | 'implement' | 'assess' | 'authorize' | 'monitor';
type DeploymentModel = 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only';
type ComplianceProfile = 'private' | 'federal' | 'hybrid';
type NistAdoptionMode = 'best_practice' | 'mandatory';
interface FrameworkOption {
  id: string;
  code: string;
  name: string;
  description: string;
  controlCount: number;
  tierRequired: string | null;
  group?: string | null;
}

// Framework groups: all standards in a group count as 1 toward the tier limit
const FRAMEWORK_GROUP_METADATA: Record<string, { label: string; description: string }> = { // ip-hygiene:ignore
  iso_27000: { label: 'ISO 27000 Series', description: 'Information security management standards — 27001, 27002, 27005, 27017, 27018, 27701, and 31000. Counts as 1 framework.' }, // ip-hygiene:ignore
  iso_ai: { label: 'ISO AI Suite', description: 'AI governance standards — 42001, 42005, 23894, 38507, 22989, 23053, 5259, and TRs on bias, trust, and ethics. Counts as 1 framework.' }, // ip-hygiene:ignore
  csf_2_profiles: { label: 'NIST CSF 2.0 — Cyber AI Profiles', description: 'NIST IR 8596 profiles for AI cybersecurity: Secure (SEC), Defend (DEF), and Thwart (THW). Counts as 1 framework.' },
  owasp_ai: { label: 'OWASP AI Security', description: 'OWASP Top 10 for LLM Applications and Agentic AI risks. Counts as 1 framework.' },
};

const ENVIRONMENT_OPTIONS = [
  { value: 'on_prem', label: 'On-Prem' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'saas', label: 'SaaS' },
  { value: 'ot', label: 'OT / ICS' },
  { value: 'development', label: 'Development' },
  { value: 'test', label: 'Test' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
];

const DATA_SENSITIVITY_OPTIONS = [
  { value: 'pii', label: 'PII' },
  { value: 'phi', label: 'PHI' },
  { value: 'pci', label: 'PCI' },
  { value: 'cui', label: 'CUI' },
  { value: 'fci', label: 'FCI' },
  { value: 'financial', label: 'Financial' },
  { value: 'operational', label: 'Operational' },
  { value: 'ip', label: 'Intellectual Property' },
  { value: 'public', label: 'Public' },
  { value: 'internal', label: 'Internal' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted', label: 'Restricted' },
];
const RMF_FRAMEWORK_CODES = ['nist_800_53', 'nist_800_171'];
const GOVCLOUD_FRAMEWORK_CODES = ['nist_privacy', 'gdpr', 'hipaa', 'eu_ai_act', 'ccpa_cpra', 'state_ai_governance', 'international_ai_governance'];

function formatBillingPlan(plan: string): string {
  const [tier = '', cadence = ''] = String(plan || '').split('_');
  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Selected';
  const cadenceLabel = cadence === 'annual'
    ? 'Annual'
    : cadence === 'monthly'
      ? 'Monthly'
      : '';
  return cadenceLabel ? `${tierLabel} (${cadenceLabel})` : tierLabel;
}

function formatTierLabel(tier: string | null | undefined): string {
  switch (String(tier || '').toLowerCase()) {
    case 'community': return 'Community';
    case 'pro': return 'Pro';
    case 'enterprise': return 'Enterprise';
    case 'govcloud': return 'Gov Cloud & Advisory';
    default: return String(tier || 'community');
  }
}

function toggleArrayValue(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, isAuthenticated, refreshUser } = useAuth();
  const canManageFrameworks = hasPermission(user, 'frameworks.manage');

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [availableFrameworks, setAvailableFrameworks] = useState<FrameworkOption[]>([]);
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [headquartersLocation, setHeadquartersLocation] = useState('');
  const [employeeCountRange, setEmployeeCountRange] = useState('');

  const [systemName, setSystemName] = useState('');
  const [systemDescription, setSystemDescription] = useState('');
  const [authorizationBoundary, setAuthorizationBoundary] = useState('');
  const [operatingEnvironmentSummary, setOperatingEnvironmentSummary] = useState('');

  const [confidentialityImpact, setConfidentialityImpact] = useState<CiaLevel | ''>('');
  const [integrityImpact, setIntegrityImpact] = useState<CiaLevel | ''>('');
  const [availabilityImpact, setAvailabilityImpact] = useState<CiaLevel | ''>('');
  const [impactRationale, setImpactRationale] = useState('');

  const [environmentTypes, setEnvironmentTypes] = useState<string[]>([]);
  const [deploymentModel, setDeploymentModel] = useState<DeploymentModel | ''>('');
  const [cloudProvidersInput, setCloudProvidersInput] = useState('');
  const [dataSensitivityTypes, setDataSensitivityTypes] = useState<string[]>([]);

  const [rmfStage, setRmfStage] = useState<RmfStage | ''>('');
  const [rmfNotes, setRmfNotes] = useState('');
  const [complianceProfile, setComplianceProfile] = useState<ComplianceProfile | ''>('private');
  const [nistAdoptionMode, setNistAdoptionMode] = useState<NistAdoptionMode | ''>('best_practice');
  const [nistNotes, setNistNotes] = useState('');
  const [selectedFrameworkCodes, setSelectedFrameworkCodes] = useState<string[]>([]);
  const [pendingBillingPlan, setPendingBillingPlan] = useState('');
  const hasRmfRelevantFramework = selectedFrameworkCodes.some((code) => RMF_FRAMEWORK_CODES.includes(String(code || '').toLowerCase()));
  const requiresNist80053InformationTypes = selectedFrameworkCodes.includes('nist_800_53');
  const hasGovcloudFrameworks = selectedFrameworkCodes.some((code) => GOVCLOUD_FRAMEWORK_CODES.includes(code));

  const updateSelectedFrameworkCodes = (frameworkIds: string[], frameworksList: FrameworkOption[] = availableFrameworks) => {
    const codeById = new Map(
      frameworksList.map((framework) => [framework.id, String(framework.code || '').toLowerCase()])
    );
    const codes = frameworkIds
      .map((id) => codeById.get(id))
      .filter((code): code is string => Boolean(code));
    setSelectedFrameworkCodes(Array.from(new Set(codes)));
  };

  // Count effective frameworks: each framework_group counts as 1, ungrouped count individually
  const frameworkById = new Map(availableFrameworks.map((f) => [f.id, f]));

  const getEffectiveCount = (ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      const fw = frameworkById.get(id);
      seen.add(fw?.group || id);
    }
    return seen.size;
  };

  const effectiveCount = getEffectiveCount(selectedFrameworkIds);

  // Pre-compute set of selected groups for render-time checks
  const selectedGroups = new Set<string>();
  for (const id of selectedFrameworkIds) {
    const fw = frameworkById.get(id);
    if (fw?.group) selectedGroups.add(fw.group);
  }

  const toggleFrameworkSelection = (frameworkId: string) => {
    if (!canManageFrameworks) return;

    const isSelected = selectedFrameworkIds.includes(frameworkId);
    if (isSelected) {
      const nextIds = selectedFrameworkIds.filter((id) => id !== frameworkId);
      setSelectedFrameworkIds(nextIds);
      updateSelectedFrameworkCodes(nextIds);
      return;
    }

    const nextIds = [...selectedFrameworkIds, frameworkId];

    setSelectedFrameworkIds(nextIds);
    updateSelectedFrameworkCodes(nextIds);
  };

  useEffect(() => {
    const pendingPlan = getStoredPendingBillingPlan();
    if (pendingPlan && VALID_BILLING_PLANS.has(pendingPlan)) {
      setPendingBillingPlan(pendingPlan);
    } else {
      setPendingBillingPlan('');
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (!requiresOrganizationOnboarding(user)) {
      if (String(user?.role || '').toLowerCase() === 'auditor') {
        router.push('/dashboard/auditor-workspace');
      } else {
        router.push('/dashboard');
      }
      return;
    }

    if (user?.onboardingCompleted) {
      router.push('/dashboard');
      return;
    }

    const loadProfile = async () => {
      try {
        setPageLoading(true);
        const [profileResponse, frameworksResponse, selectedFrameworksResponse] = await Promise.all([
          organizationAPI.getMyProfile(),
          frameworkAPI.getAll(),
          user?.organizationId
            ? organizationAPI.getFrameworks(user.organizationId)
            : Promise.resolve({ data: { data: [] } })
        ]);
        const profile = profileResponse.data?.data?.profile || {};
        const available = Array.isArray(frameworksResponse.data?.data)
          ? frameworksResponse.data.data.map((framework: any) => ({
              id: framework.id,
              code: String(framework.code || ''),
              name: String(framework.name || ''),
              description: String(framework.description || ''),
              controlCount: Number.parseInt(String(framework.control_count || '0'), 10) || 0,
              tierRequired: framework.tier_required || null,
              group: framework.framework_group || null
            }))
          : [];
        setAvailableFrameworks(available);

        const selectedFrameworkRows = Array.isArray(selectedFrameworksResponse.data?.data)
          ? selectedFrameworksResponse.data.data
          : [];
        const selectedIds = selectedFrameworkRows
          .map((entry: any) => String(entry.id || ''))
          .filter((entry: string) => entry.length > 0);
        setSelectedFrameworkIds(selectedIds);

        const selectedCodesFromOrg = selectedFrameworkRows
          .map((entry: any) => String(entry.code || '').toLowerCase())
          .filter((entry: string) => entry.length > 0);
        const selectedCodesFromProfile = Array.isArray(profileResponse.data?.data?.selected_framework_codes)
          ? profileResponse.data.data.selected_framework_codes
              .map((entry: any) => String(entry || '').toLowerCase())
              .filter((entry: string) => entry.length > 0)
          : [];
        setSelectedFrameworkCodes(
          selectedCodesFromOrg.length > 0 ? selectedCodesFromOrg : selectedCodesFromProfile
        );

        setCompanyLegalName(profile.company_legal_name || user?.organizationName || '');
        setCompanyDescription(profile.company_description || '');
        setIndustry(profile.industry || '');
        setWebsite(profile.website || '');
        setHeadquartersLocation(profile.headquarters_location || '');
        setEmployeeCountRange(profile.employee_count_range || '');

        setSystemName(profile.system_name || '');
        setSystemDescription(profile.system_description || '');
        setAuthorizationBoundary(profile.authorization_boundary || '');
        setOperatingEnvironmentSummary(profile.operating_environment_summary || '');

        setConfidentialityImpact(profile.confidentiality_impact || '');
        setIntegrityImpact(profile.integrity_impact || '');
        setAvailabilityImpact(profile.availability_impact || '');
        setImpactRationale(profile.impact_rationale || '');

        setEnvironmentTypes(Array.isArray(profile.environment_types) ? profile.environment_types : []);
        setDeploymentModel(profile.deployment_model || '');
        setCloudProvidersInput(Array.isArray(profile.cloud_providers) ? profile.cloud_providers.join(', ') : '');
        setDataSensitivityTypes(Array.isArray(profile.data_sensitivity_types) ? profile.data_sensitivity_types : []);

        setRmfStage(profile.rmf_stage || '');
        setRmfNotes(profile.rmf_notes || '');
        setComplianceProfile(profile.compliance_profile || 'private');
        setNistAdoptionMode(profile.nist_adoption_mode || 'best_practice');
        setNistNotes(profile.nist_notes || '');
      } catch (loadError: any) {
        setError(loadError.response?.data?.error || 'Failed to load onboarding profile');
      } finally {
        setPageLoading(false);
      }
    };

    loadProfile();
  }, [user, loading, isAuthenticated, router]);

  const buildPayload = (markCompleted: boolean) => ({
    company_legal_name: companyLegalName,
    company_description: companyDescription,
    industry: industry || null,
    website: website || null,
    headquarters_location: headquartersLocation || null,
    employee_count_range: employeeCountRange || null,
    system_name: systemName,
    system_description: systemDescription,
    authorization_boundary: authorizationBoundary || null,
    operating_environment_summary: operatingEnvironmentSummary || null,
    confidentiality_impact: confidentialityImpact || null,
    integrity_impact: integrityImpact || null,
    availability_impact: availabilityImpact || null,
    impact_rationale: impactRationale || null,
    environment_types: environmentTypes,
    deployment_model: deploymentModel || null,
    cloud_providers: cloudProvidersInput
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
    data_sensitivity_types: dataSensitivityTypes,
    rmf_stage: hasRmfRelevantFramework ? (rmfStage || null) : null,
    rmf_notes: hasRmfRelevantFramework ? (rmfNotes || null) : null,
    compliance_profile: hasRmfRelevantFramework ? (complianceProfile || 'private') : 'private',
    nist_adoption_mode: hasRmfRelevantFramework ? (nistAdoptionMode || 'best_practice') : 'best_practice',
    nist_notes: hasRmfRelevantFramework ? (nistNotes || null) : null,
    onboarding_completed: markCompleted,
  });

  const handleSave = async (markCompleted: boolean) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (canManageFrameworks && user?.organizationId) {
        await organizationAPI.addFrameworks(user.organizationId, {
          frameworkIds: selectedFrameworkIds,
        });
      }

      await organizationAPI.updateMyProfile(buildPayload(markCompleted));

      if (markCompleted) {
        await refreshUser();
        const pendingPlan = getStoredPendingBillingPlan();
        if (pendingPlan.length > 0 && VALID_BILLING_PLANS.has(pendingPlan)) {
          // Don't remove pendingPlan here — it must survive until Stripe checkout
          // actually succeeds (cleared on the billing/success page).
          router.push(`/billing/checkout?plan=${encodeURIComponent(pendingPlan)}`);
          return;
        }
        router.push('/dashboard');
        return;
      }

      setSuccess('Progress saved. Complete setup when ready.');
    } catch (saveError: any) {
      const details = saveError.response?.data;
      if (Array.isArray(details?.missing_fields)) {
        setError(`Complete required fields: ${details.missing_fields.join(', ')}`);
      } else {
        setError(details?.error || 'Failed to save onboarding profile');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-900 via-slate-900 to-slate-800 py-10 px-4">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white px-8 py-6">
          <h1 className="text-2xl font-bold">Organization Onboarding</h1>
          <p className="text-slate-200 mt-2 text-sm">
            Private-sector baseline intake for company context, system scope, CIA baseline, and operating environment.
            Additional NIST/RMF fields are enabled only when your selected frameworks require them.
          </p>
          <p className="text-slate-300 mt-2 text-xs">
            Active frameworks: {selectedFrameworkCodes.length > 0 ? selectedFrameworkCodes.join(', ') : 'None selected yet'}
          </p>
        </div>

        <div className="px-8 py-8 space-y-8">
          {pendingBillingPlan && (
            <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg">
              <p className="text-sm font-medium">You’ll continue to Stripe after setup.</p>
              <p className="text-xs mt-1">
                Pending checkout plan: {formatBillingPlan(pendingBillingPlan)}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}

          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Framework Selection</h2>
              <p className="text-xs text-slate-500">
                {selectedFrameworkIds.length} selected
              </p>
            </div>
            <p className="text-sm text-slate-600">
              Select from our framework catalog of standards and regulations. Bundled groups (ISO series, OWASP, CSF Profiles) count as 1 toward your limit.
            </p>

            {!canManageFrameworks && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
                You can view framework selections, but only users with <code>frameworks.manage</code> can change them.
              </div>
            )}

            {availableFrameworks.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
                No active frameworks available.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(() => {
                  const renderedGroups = new Set<string>();
                  return availableFrameworks.map((framework) => {
                    // Grouped framework — render once as a collapsible card
                    if (framework.group) {
                      if (renderedGroups.has(framework.group)) return null;
                      renderedGroups.add(framework.group);
                      const groupMeta = FRAMEWORK_GROUP_METADATA[framework.group];
                      const groupMembers = availableFrameworks.filter((f) => f.group === framework.group);
                      const selectedCount = groupMembers.filter((f) => selectedFrameworkIds.includes(f.id)).length;
                      const totalControls = groupMembers.reduce((sum, f) => sum + f.controlCount, 0);
                      const isExpanded = expandedGroups.has(framework.group);
                      const groupAlreadySelected = selectedGroups.has(framework.group);
                      return (
                        <div key={`group-${framework.group}`} className={`rounded-lg border p-3 transition ${selectedCount > 0 ? 'border-purple-600 bg-purple-50' : 'border-slate-200 bg-white'}`}>
                          <button
                            type="button"
                            onClick={() => setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(framework.group!)) next.delete(framework.group!); else next.add(framework.group!);
                              return next;
                            })}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{groupMeta?.label ?? framework.group}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{groupMembers.length} standards · {totalControls} controls</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {selectedCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white">
                                    {selectedCount} selected
                                  </span>
                                )}
                                <span className="text-xs text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{groupMeta?.description}</p>
                          </button>
                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                              {groupMembers.map((child) => {
                                const isChildSelected = selectedFrameworkIds.includes(child.id);
                                const isChildLocked = false;
                                return (
                                  <button
                                    key={child.id}
                                    type="button"
                                    onClick={() => toggleFrameworkSelection(child.id)}
                                    disabled={!canManageFrameworks || isChildLocked}
                                    className={`w-full text-left rounded-md border p-2 transition text-xs ${
                                      isChildSelected
                                        ? 'border-purple-500 bg-purple-100'
                                        : isChildLocked
                                          ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                                          : canManageFrameworks
                                            ? 'border-slate-200 bg-white hover:border-purple-300'
                                            : 'border-slate-200 bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-medium text-slate-900">{child.name}</p>
                                      </div>
                                      <span className={`shrink-0 px-2 py-0.5 rounded-full ${isChildSelected ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                        {isChildSelected ? '✓' : 'Select'}
                                      </span>
                                    </div>
                                    <p className="text-slate-500 mt-1 line-clamp-1">{child.description}</p>
                                    <p className="text-slate-400 mt-0.5">{child.controlCount} controls · Tier: {formatTierLabel(child.tierRequired)}</p>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Ungrouped framework — render as individual card
                    const isSelected = selectedFrameworkIds.includes(framework.id);
                    const isLocked = false;
                    return (
                      <button
                        key={framework.id}
                        type="button"
                        onClick={() => toggleFrameworkSelection(framework.id)}
                        disabled={!canManageFrameworks || isLocked}
                        className={`text-left rounded-lg border p-4 transition ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50'
                            : isLocked
                              ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                              : canManageFrameworks
                                ? 'border-slate-200 bg-white hover:border-purple-400'
                                : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{framework.name}</p>
                            <p className="text-xs text-slate-500 mt-1">{framework.code}</p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              isSelected
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Not selected'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-2 line-clamp-2">{framework.description}</p>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <span>{framework.controlCount} controls</span>
                          <span>Tier: {formatTierLabel(framework.tierRequired)}</span>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Company Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Legal Company Name *" value={companyLegalName} onChange={setCompanyLegalName} />
              <Input label="Industry" value={industry} onChange={setIndustry} />
              <Input label="Website" value={website} onChange={setWebsite} placeholder="https://example.com" />
              <Input label="Headquarters Location" value={headquartersLocation} onChange={setHeadquartersLocation} />
              <Select
                label="Employee Count Range"
                value={employeeCountRange}
                onChange={setEmployeeCountRange}
                options={[
                  { value: '', label: 'Select range' },
                  { value: '1-10', label: '1-10' },
                  { value: '11-50', label: '11-50' },
                  { value: '51-200', label: '51-200' },
                  { value: '201-500', label: '201-500' },
                  { value: '501-1000', label: '501-1000' },
                  { value: '1000+', label: '1000+' },
                ]}
              />
            </div>
            <TextArea
              label="Company Description *"
              value={companyDescription}
              onChange={setCompanyDescription}
              rows={3}
              placeholder="Describe mission, business operations, and regulatory footprint."
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">System Context</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="System Name *" value={systemName} onChange={setSystemName} />
            </div>
            <TextArea
              label="System Description *"
              value={systemDescription}
              onChange={setSystemDescription}
              rows={3}
              placeholder="Describe purpose, major capabilities, and information processed."
            />
            <TextArea
              label="Authorization Boundary"
              value={authorizationBoundary}
              onChange={setAuthorizationBoundary}
              rows={3}
              placeholder="Define logical/physical boundaries, interfaces, and external dependencies."
            />
            <TextArea
              label="Operating Environment Summary"
              value={operatingEnvironmentSummary}
              onChange={setOperatingEnvironmentSummary}
              rows={3}
              placeholder="Summarize production/development/test and hosting context."
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">CIA Impact Baseline</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Confidentiality *"
                value={confidentialityImpact}
                onChange={(value) => setConfidentialityImpact(value as CiaLevel | '')}
                options={[
                  { value: '', label: 'Select' },
                  { value: 'low', label: 'Low' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'high', label: 'High' },
                ]}
              />
              <Select
                label="Integrity *"
                value={integrityImpact}
                onChange={(value) => setIntegrityImpact(value as CiaLevel | '')}
                options={[
                  { value: '', label: 'Select' },
                  { value: 'low', label: 'Low' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'high', label: 'High' },
                ]}
              />
              <Select
                label="Availability *"
                value={availabilityImpact}
                onChange={(value) => setAvailabilityImpact(value as CiaLevel | '')}
                options={[
                  { value: '', label: 'Select' },
                  { value: 'low', label: 'Low' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <TextArea
              label="Impact Rationale"
              value={impactRationale}
              onChange={setImpactRationale}
              rows={3}
              placeholder="Why these impact levels were selected."
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Environment and Data Exposure</h2>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Environment Types *</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ENVIRONMENT_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={environmentTypes.includes(option.value)}
                      onChange={() => setEnvironmentTypes((current) => toggleArrayValue(current, option.value))}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Deployment Model"
                value={deploymentModel}
                onChange={(value) => setDeploymentModel(value as DeploymentModel | '')}
                options={[
                  { value: '', label: 'Select model' },
                  { value: 'on_prem', label: 'On-Prem' },
                  { value: 'single_cloud', label: 'Single Cloud' },
                  { value: 'multi_cloud', label: 'Multi-Cloud' },
                  { value: 'hybrid', label: 'Hybrid' },
                  { value: 'saas_only', label: 'SaaS Only' },
                ]}
              />
              <Input
                label="Cloud Providers"
                value={cloudProvidersInput}
                onChange={setCloudProvidersInput}
                placeholder="aws, azure, gcp"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">
                {requiresNist80053InformationTypes
                  ? 'Information Types (NIST SP 800-60) *'
                  : 'Data Sensitivity Types'}
              </p>
              {requiresNist80053InformationTypes && (
                <p className="text-xs text-slate-600 mb-2">
                  Required when NIST 800-53 is selected. Choose the data/information types your system processes.
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {DATA_SENSITIVITY_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={dataSensitivityTypes.includes(option.value)}
                      onChange={() => setDataSensitivityTypes((current) => toggleArrayValue(current, option.value))}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </section>

          {hasRmfRelevantFramework ? (
            <>
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">NIST/RMF Operating Mode</h2>
                <p className="text-sm text-slate-600">
                  Because NIST 800-53 or 800-171 is selected, you can track RMF posture here.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select
                    label="Organization Compliance Profile"
                    value={complianceProfile}
                    onChange={(value) => setComplianceProfile(value as ComplianceProfile | '')}
                    options={[
                      { value: 'private', label: 'Private Sector' },
                      { value: 'federal', label: 'Federal / Government' },
                      { value: 'hybrid', label: 'Hybrid (Commercial + Federal)' },
                    ]}
                  />
                  <Select
                    label="NIST Adoption Mode"
                    value={nistAdoptionMode}
                    onChange={(value) => setNistAdoptionMode(value as NistAdoptionMode | '')}
                    options={[
                      { value: 'best_practice', label: 'Best-Practice (Optional)' },
                      { value: 'mandatory', label: 'Mandatory Baseline' },
                    ]}
                  />
                </div>
                <TextArea
                  label="NIST Adoption Notes"
                  value={nistNotes}
                  onChange={setNistNotes}
                  rows={2}
                  placeholder="Capture why NIST is optional or mandatory for your business context."
                />
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">RMF Posture</h2>
                <p className="text-sm text-slate-600">
                  RMF stage is optional and used for posture tracking only. Per NIST SP 800-37,
                  organizations progress through Prepare → Categorize → Select → Implement → Assess → Authorize → Monitor as work is completed.
                </p>
                <Select
                  label="Current RMF Stage"
                  value={rmfStage}
                  onChange={(value) => setRmfStage(value as RmfStage | '')}
                  options={[
                    { value: '', label: 'Select RMF stage' },
                    { value: 'prepare', label: 'Prepare' },
                    { value: 'categorize', label: 'Categorize' },
                    { value: 'select', label: 'Select' },
                    { value: 'implement', label: 'Implement' },
                    { value: 'assess', label: 'Assess' },
                    { value: 'authorize', label: 'Authorize' },
                    { value: 'monitor', label: 'Monitor' },
                  ]}
                />
                <TextArea
                  label="RMF Notes"
                  value={rmfNotes}
                  onChange={setRmfNotes}
                  rows={3}
                  placeholder="Capture current execution posture, approvals, and immediate priorities."
                />
              </section>
            </>
          ) : (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Framework Guidance</h2>
              <p className="text-sm text-slate-600">
                RMF fields are hidden because your selected frameworks do not require NIST RMF tracking.
                If you add NIST 800-53 or 800-171 later, this section will appear automatically.
              </p>
            </section>
          )}

          {/* AI Regulatory Monitoring — informational note when Gov Cloud-tier frameworks selected */}
          {hasGovcloudFrameworks && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">AI Regulatory Monitoring</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                  Gov Cloud &amp; Advisory
                </span>
              </div>
              <div className="border border-teal-200 bg-teal-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🤖</span>
                  <p className="text-sm font-semibold text-teal-900">Regulatory Landscape Monitoring Available</p>
                </div>
                <p className="text-xs text-teal-800 mt-1">
                  Your selected privacy and regional frameworks include AI-powered regulatory monitoring.
                  After onboarding, configure your LLM provider in Settings → LLM Configuration to enable automatic scanning for:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-teal-800 list-disc list-inside">
                  <li>Upcoming state privacy laws and enforcement deadlines</li>
                  <li>New AI governance requirements at state, federal, and international levels</li>
                  <li>Amendments to existing regulations (CCPA/CPRA, GDPR, HIPAA, EU AI Act)</li>
                  <li>Emerging controls and compliance obligations before they take effect</li>
                </ul>
                <p className="text-xs text-teal-700 mt-3 font-medium">
                  🔄 Provider-agnostic context
                </p>
                <p className="text-xs text-teal-700 mt-0.5">
                  The onboarding data you provide here builds a master context prompt that is injected into every AI call.
                  If you switch LLM providers later, the new provider receives your full environment context immediately — no reconfiguration needed.
                </p>
              </div>
            </section>
          )}

          <div className="pt-4 border-t flex flex-col sm:flex-row gap-3 justify-end">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Save Progress
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Complete Setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />
    </label>
  );
}
