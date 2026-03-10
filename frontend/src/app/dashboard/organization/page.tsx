// @tier: free
'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import OrganizationSystemsAndVendors from '@/components/OrganizationSystemsAndVendors';
import { frameworkAPI, organizationAPI } from '@/lib/api';
import { hasPermission, normalizeTier } from '@/lib/access';
import { useAuth } from '@/contexts/AuthContext';

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

function getFrameworkLimit(tier: string): number {
  switch (tier) {
    case 'free': return 2;
    case 'starter': return 5;
    default: return -1;
  }
}

function toggleArrayValue(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}

export default function OrganizationProfilePage() {
  const { user } = useAuth();
  const canReadOrganization = hasPermission(user, 'organizations.read');
  const canManageFrameworks = hasPermission(user, 'frameworks.manage');
  const userTier = normalizeTier(user?.organizationTier);
  const frameworkLimit = getFrameworkLimit(userTier);
  const isLimitedTier = frameworkLimit !== -1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [availableFrameworks, setAvailableFrameworks] = useState<FrameworkOption[]>([]);
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>([]);
  const [selectedFrameworkCodes, setSelectedFrameworkCodes] = useState<string[]>([]);
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

  const hasRmfRelevantFramework = useMemo(
    () => selectedFrameworkCodes.some((code) => RMF_FRAMEWORK_CODES.includes(String(code || '').toLowerCase())),
    [selectedFrameworkCodes]
  );
  const requiresNist80053InformationTypes = selectedFrameworkCodes.includes('nist_800_53');
  const rmfRequired = hasRmfRelevantFramework && (nistAdoptionMode === 'mandatory' || complianceProfile !== 'private');

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
    const nextEffective = getEffectiveCount(nextIds);
    if (frameworkLimit !== -1 && nextEffective > frameworkLimit) {
      const tierLabel = userTier.charAt(0).toUpperCase() + userTier.slice(1);
      setError(
        `${tierLabel} plan allows up to ${frameworkLimit} framework${frameworkLimit === 1 ? '' : 's'} (bundled groups count as 1). Deselect one first or upgrade tier.`
      );
      return;
    }

    setSelectedFrameworkIds(nextIds);
    updateSelectedFrameworkCodes(nextIds);
  };

  useEffect(() => {
    if (!canReadOrganization) {
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoading(true);
        const [profileResponse, frameworksResponse, selectedFrameworksResponse] = await Promise.all([
          organizationAPI.getMyProfile(),
          frameworkAPI.getAll(),
          user?.organizationId
            ? organizationAPI.getFrameworks(user.organizationId)
            : Promise.resolve({ data: { data: [] } })
        ]);
        const profile = profileResponse.data?.data?.profile || {};
        const available = Array.isArray(frameworksResponse.data?.data)
          ? frameworksResponse.data?.data?.map((framework: any) => ({
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
          ? selectedFrameworksResponse.data?.data
          : [];
        const selectedIds = selectedFrameworkRows
          .map((entry: any) => String(entry.id || ''))
          .filter((entry: string) => entry.length > 0);
        setSelectedFrameworkIds(selectedIds);

        const selectedCodesFromOrg = selectedFrameworkRows
          .map((entry: any) => String(entry.code || '').toLowerCase())
          .filter((entry: string) => entry.length > 0);
        const selectedCodesFromProfile = Array.isArray(profileResponse.data?.data?.selected_framework_codes)
          ? profileResponse.data?.data?.selected_framework_codes
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
        setError(loadError.response?.data?.error || 'Failed to load organization profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [canReadOrganization, user?.organizationId, user?.organizationName]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (canManageFrameworks && user?.organizationId) {
        await organizationAPI.addFrameworks(user.organizationId, {
          frameworkIds: selectedFrameworkIds,
        });
      }

      await organizationAPI.updateMyProfile({
        company_legal_name: companyLegalName || null,
        company_description: companyDescription || null,
        industry: industry || null,
        website: website || null,
        headquarters_location: headquartersLocation || null,
        employee_count_range: employeeCountRange || null,
        system_name: systemName || null,
        system_description: systemDescription || null,
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
      });

      setSuccess('Organization profile updated.');
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || 'Failed to save organization profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!canReadOrganization) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            You do not have permission to view organization profile settings.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Organization Profile</h1>
            <p className="text-gray-600 mt-1">
              View and update your organization and system context for assessments and SSP reporting.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600">
            Active frameworks:{' '}
            <span className="font-medium text-gray-900">
              {selectedFrameworkCodes.length > 0 ? selectedFrameworkCodes.join(', ') : 'None selected'}
            </span>
          </p>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Framework Selection</h2>
            <p className="text-xs text-gray-500">
              {selectedFrameworkIds.length} selected{isLimitedTier ? ` (${effectiveCount} counting toward limit of ${frameworkLimit})` : ''}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Manage your organization frameworks here. Bundled groups (ISO series, OWASP, CSF Profiles) count as 1 toward your limit.
          </p>

          {isLimitedTier && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              {userTier.charAt(0).toUpperCase() + userTier.slice(1)} tier supports up to {frameworkLimit}{' '}
              framework{frameworkLimit === 1 ? '' : 's'}.
            </div>
          )}

          {!canManageFrameworks && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              You can view framework selections, but only users with <code>frameworks.manage</code> can change them.
            </div>
          )}

          {availableFrameworks.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
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
                    const isAtLimit = frameworkLimit !== -1 && effectiveCount >= frameworkLimit && !groupAlreadySelected;
                    return (
                      <div key={`group-${framework.group}`} className={`rounded-lg border p-3 transition ${selectedCount > 0 ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}`}>
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
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white">
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
                              const isChildLocked = canManageFrameworks && !isChildSelected && isAtLimit;
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  onClick={() => toggleFrameworkSelection(child.id)}
                                  disabled={!canManageFrameworks || isChildLocked}
                                  className={`w-full text-left rounded-md border p-2 transition text-xs ${
                                    isChildSelected
                                      ? 'border-blue-500 bg-blue-100'
                                      : isChildLocked
                                        ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                                        : canManageFrameworks
                                          ? 'border-slate-200 bg-white hover:border-blue-300'
                                          : 'border-slate-200 bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-900">{child.name}</p>
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full ${isChildSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                      {isChildSelected ? '✓' : 'Select'}
                                    </span>
                                  </div>
                                  <p className="text-slate-500 mt-1 line-clamp-1">{child.description}</p>
                                  <p className="text-slate-400 mt-0.5">{child.controlCount} controls · Tier: {child.tierRequired || 'free'}</p>
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
                  const isAtLimit = frameworkLimit !== -1 && effectiveCount >= frameworkLimit;
                  const isLocked = canManageFrameworks && !isSelected && isAtLimit;
                  return (
                    <button
                      key={framework.id}
                      type="button"
                      onClick={() => toggleFrameworkSelection(framework.id)}
                      disabled={!canManageFrameworks || isLocked}
                      className={`text-left rounded-lg border p-4 transition ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50'
                          : isLocked
                            ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                            : canManageFrameworks
                              ? 'border-slate-200 bg-white hover:border-blue-400'
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
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Not selected'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2">{framework.description}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{framework.controlCount} controls</span>
                        <span>Tier: {framework.tierRequired || 'free'}</span>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
            {success}
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Company Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Legal Company Name" value={companyLegalName} onChange={setCompanyLegalName} />
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
            label="Company Description"
            value={companyDescription}
            onChange={setCompanyDescription}
            rows={3}
          />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">System Context</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="System Name" value={systemName} onChange={setSystemName} />
          </div>
          <TextArea label="System Description" value={systemDescription} onChange={setSystemDescription} rows={3} />
          <TextArea label="Authorization Boundary" value={authorizationBoundary} onChange={setAuthorizationBoundary} rows={3} />
          <TextArea
            label="Operating Environment Summary"
            value={operatingEnvironmentSummary}
            onChange={setOperatingEnvironmentSummary}
            rows={3}
          />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">CIA Impact Baseline</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Confidentiality"
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
              label="Integrity"
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
              label="Availability"
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
          <TextArea label="Impact Rationale" value={impactRationale} onChange={setImpactRationale} rows={3} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Environment and Data Exposure</h2>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Environment Types</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ENVIRONMENT_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
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
            <p className="text-sm font-medium text-gray-700 mb-2">
              {requiresNist80053InformationTypes ? 'Information Types (NIST SP 800-60)' : 'Data Sensitivity Types'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {DATA_SENSITIVITY_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
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

        {hasRmfRelevantFramework && (
          <>
            <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">NIST/RMF Operating Mode</h2>
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
              />
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">RMF Posture</h2>
              <p className="text-sm text-gray-600">
                {rmfRequired
                  ? 'RMF stage is required for this selected operating mode.'
                  : 'RMF stage is optional for private-sector best-practice mode.'}
              </p>
              <Select
                label={`Current RMF Stage${rmfRequired ? ' *' : ''}`}
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
              <TextArea label="RMF Notes" value={rmfNotes} onChange={setRmfNotes} rows={3} />
            </section>
          </>
        )}

        <OrganizationSystemsAndVendors canReadOrganization={canReadOrganization} />
      </div>
    </DashboardLayout>
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
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}
