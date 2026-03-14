// @tier: community
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { organizationAPI, frameworkAPI } from '@/lib/api';
import { APP_NAME } from '@/lib/branding';

/* ── Types ─────────────────────────────────────────────────────────── */

type CiaLevel = 'low' | 'moderate' | 'high';

interface FrameworkOption {
  id: string;
  code: string;
  name: string;
  description: string;
  controlCount: number;
  tierRequired: string | null;
  group?: string | null;
}

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

const CIA_OPTIONS: { value: CiaLevel; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Limited adverse effect' },
  { value: 'moderate', label: 'Moderate', description: 'Serious adverse effect' },
  { value: 'high', label: 'High', description: 'Severe or catastrophic effect' },
];

function toggleArrayValue(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

/* ── Component ────────────────────────────────────────────────────── */

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  /* Step tracking */
  const [step, setStep] = useState(1);

  /* Step 1 — Organization basics */
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [headquartersLocation, setHeadquartersLocation] = useState('');
  const [employeeCountRange, setEmployeeCountRange] = useState('');

  /* Step 2 — System info */
  const [systemName, setSystemName] = useState('');
  const [systemDescription, setSystemDescription] = useState('');
  const [authorizationBoundary, setAuthorizationBoundary] = useState('');
  const [environmentTypes, setEnvironmentTypes] = useState<string[]>([]);

  /* Step 3 — Impact classification */
  const [confidentialityImpact, setConfidentialityImpact] = useState<CiaLevel | ''>('');
  const [integrityImpact, setIntegrityImpact] = useState<CiaLevel | ''>('');
  const [availabilityImpact, setAvailabilityImpact] = useState<CiaLevel | ''>('');
  const [dataSensitivityTypes, setDataSensitivityTypes] = useState<string[]>([]);

  /* Step 4 — Framework selection */
  const [availableFrameworks, setAvailableFrameworks] = useState<FrameworkOption[]>([]);
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  /* General state */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingFrameworks, setLoadingFrameworks] = useState(true);

  /* ── Redirect if onboarding already complete ────────────────────── */
  useEffect(() => {
    if (user?.onboardingCompleted) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  /* ── Load available frameworks ──────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await frameworkAPI.getAll();
        if (!cancelled) {
          const fws = (res.data?.data || res.data || []).map((fw: Record<string, unknown>) => ({
            id: String(fw.id || ''),
            code: String(fw.code || ''),
            name: String(fw.name || ''),
            description: String(fw.description || ''),
            controlCount: Number(fw.control_count || fw.controlCount || 0),
            tierRequired: fw.tier_required ?? fw.tierRequired ?? null,
            group: fw.group ?? null,
          }));
          setAvailableFrameworks(fws);
        }
      } catch {
        // Non-fatal — user can still complete onboarding without selecting frameworks
      } finally {
        if (!cancelled) setLoadingFrameworks(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Load existing profile (resume interrupted onboarding) ──────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getMyProfile();
        const profile = res.data?.data?.profile;
        if (!cancelled && profile) {
          setCompanyLegalName(profile.company_legal_name || '');
          setCompanyDescription(profile.company_description || '');
          setIndustry(profile.industry || '');
          setWebsite(profile.website || '');
          setHeadquartersLocation(profile.headquarters_location || '');
          setEmployeeCountRange(profile.employee_count_range || '');
          setSystemName(profile.system_name || '');
          setSystemDescription(profile.system_description || '');
          setAuthorizationBoundary(profile.authorization_boundary || '');
          setEnvironmentTypes(profile.environment_types || []);
          setConfidentialityImpact(profile.confidentiality_impact || '');
          setIntegrityImpact(profile.integrity_impact || '');
          setAvailabilityImpact(profile.availability_impact || '');
          setDataSensitivityTypes(profile.data_sensitivity_types || []);
        }
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Load selected org frameworks ──────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    if (!user?.organizationId) return;
    (async () => {
      try {
        const res = await organizationAPI.getFrameworks(user.organizationId);
        const ids = (res.data?.data || res.data || []).map((f: Record<string, unknown>) => String(f.framework_id || f.id || ''));
        if (!cancelled) setSelectedFrameworkIds(ids.filter(Boolean));
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [user?.organizationId]);

  /* ── Validation per step ────────────────────────────────────────── */
  function stepOneValid() {
    return companyLegalName.trim().length > 0 && companyDescription.trim().length > 0;
  }

  function stepTwoValid() {
    return systemName.trim().length > 0 && systemDescription.trim().length > 0 && environmentTypes.length > 0;
  }

  function stepThreeValid() {
    return confidentialityImpact !== '' && integrityImpact !== '' && availabilityImpact !== '';
  }

  /* ── Save & complete ────────────────────────────────────────────── */
  async function handleComplete() {
    setSaving(true);
    setError('');
    try {
      // Save frameworks
      if (selectedFrameworkIds.length > 0 && user?.organizationId) {
        try {
          await organizationAPI.addFrameworks(user.organizationId, { frameworkIds: selectedFrameworkIds });
        } catch {
          // non-fatal — frameworks may already be set
        }
      }

      // Save profile + mark onboarding complete
      await organizationAPI.updateMyProfile({
        company_legal_name: companyLegalName.trim(),
        company_description: companyDescription.trim(),
        industry: industry.trim() || null,
        website: website.trim() || null,
        headquarters_location: headquartersLocation.trim() || null,
        employee_count_range: employeeCountRange.trim() || null,
        system_name: systemName.trim(),
        system_description: systemDescription.trim(),
        authorization_boundary: authorizationBoundary.trim() || null,
        environment_types: environmentTypes,
        confidentiality_impact: confidentialityImpact as CiaLevel,
        integrity_impact: integrityImpact as CiaLevel,
        availability_impact: availabilityImpact as CiaLevel,
        data_sensitivity_types: dataSensitivityTypes,
        onboarding_completed: true,
      });

      // Refresh user so DashboardLayout no longer redirects back here
      if (refreshUser) await refreshUser();

      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to save. Please check required fields and try again.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Framework toggling ─────────────────────────────────────────── */
  function toggleFramework(id: string) {
    setSelectedFrameworkIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-purple-50 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center gap-3 border-b border-gray-200 bg-white/80 backdrop-blur">
        <span className="text-xl font-bold text-purple-700">{APP_NAME}</span>
        <h1 className="text-lg font-semibold text-gray-900">Organization Setup</h1>
        <span className="ml-auto text-sm text-gray-500">Step {step} of {TOTAL_STEPS}</span>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-full bg-purple-600 transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ─── Step 1: Organization Basics ────────────────────────── */}
        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Tell us about your organization</h2>
              <p className="mt-1 text-sm text-gray-600">
                This information populates your compliance documentation and SSP packages.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label htmlFor="companyLegalName" className="block text-sm font-medium text-gray-700 mb-1">
                  Company Legal Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="companyLegalName"
                  type="text"
                  value={companyLegalName}
                  onChange={(e) => setCompanyLegalName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Acme Corp, Inc."
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="companyDescription" className="block text-sm font-medium text-gray-700 mb-1">
                  Company Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="companyDescription"
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Brief description of what your organization does..."
                />
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
                  Industry
                </label>
                <input
                  id="industry"
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. Financial Services"
                />
              </div>

              <div>
                <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label htmlFor="headquartersLocation" className="block text-sm font-medium text-gray-700 mb-1">
                  Headquarters Location
                </label>
                <input
                  id="headquartersLocation"
                  type="text"
                  value={headquartersLocation}
                  onChange={(e) => setHeadquartersLocation(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. New York, NY"
                />
              </div>

              <div>
                <label htmlFor="employeeCountRange" className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Employees
                </label>
                <select
                  id="employeeCountRange"
                  value={employeeCountRange}
                  onChange={(e) => setEmployeeCountRange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select range</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="501-1000">501-1000</option>
                  <option value="1001-5000">1001-5000</option>
                  <option value="5000+">5000+</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {/* ─── Step 2: System Information ─────────────────────────── */}
        {step === 2 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Define your system</h2>
              <p className="mt-1 text-sm text-gray-600">
                Describe the primary information system under compliance scope.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="systemName" className="block text-sm font-medium text-gray-700 mb-1">
                  System Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="systemName"
                  type="text"
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. Acme Cloud Platform"
                />
              </div>

              <div>
                <label htmlFor="systemDescription" className="block text-sm font-medium text-gray-700 mb-1">
                  System Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="systemDescription"
                  value={systemDescription}
                  onChange={(e) => setSystemDescription(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="What does this system do? What data does it process?"
                />
              </div>

              <div>
                <label htmlFor="authorizationBoundary" className="block text-sm font-medium text-gray-700 mb-1">
                  Authorization Boundary
                </label>
                <textarea
                  id="authorizationBoundary"
                  value={authorizationBoundary}
                  onChange={(e) => setAuthorizationBoundary(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Describe the logical and physical boundary of the system..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Environment Types <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEnvironmentTypes(toggleArrayValue(environmentTypes, opt.value))}
                      className={`px-3 py-1.5 rounded-full text-sm transition ${
                        environmentTypes.includes(opt.value)
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── Step 3: Impact Classification ─────────────────────── */}
        {step === 3 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Impact classification</h2>
              <p className="mt-1 text-sm text-gray-600">
                Set the FIPS 199 security categorization for your system. This drives control baseline selection.
              </p>
            </div>

            {/* CIA selectors */}
            {([
              { label: 'Confidentiality', value: confidentialityImpact, setter: setConfidentialityImpact },
              { label: 'Integrity', value: integrityImpact, setter: setIntegrityImpact },
              { label: 'Availability', value: availabilityImpact, setter: setAvailabilityImpact },
            ] as const).map(({ label, value, setter }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {label} Impact <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {CIA_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setter(opt.value)}
                      className={`text-left rounded-lg border p-3 transition ${
                        value === opt.value
                          ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-500'
                          : 'border-gray-200 bg-white hover:border-purple-400'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Data sensitivity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Sensitivity Types
              </label>
              <div className="flex flex-wrap gap-2">
                {DATA_SENSITIVITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDataSensitivityTypes(toggleArrayValue(dataSensitivityTypes, opt.value))}
                    className={`px-3 py-1.5 rounded-full text-sm transition ${
                      dataSensitivityTypes.includes(opt.value)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select all data classification types processed by the system.
              </p>
            </div>
          </section>
        )}

        {/* ─── Step 4: Framework Selection ────────────────────────── */}
        {step === 4 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Select compliance frameworks</h2>
              <p className="mt-1 text-sm text-gray-600">
                Choose the frameworks your organization needs to comply with. You can change these later in Settings.
              </p>
            </div>

            {loadingFrameworks ? (
              <p className="text-sm text-gray-500">Loading frameworks...</p>
            ) : availableFrameworks.length === 0 ? (
              <p className="text-sm text-gray-500">No frameworks available. You can add them later from the dashboard.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[32rem] overflow-y-auto pr-1">
                {(() => {
                  const renderedGroups = new Set<string>();
                  return availableFrameworks.map((fw) => {
                    if (fw.group) {
                      if (renderedGroups.has(fw.group)) return null;
                      renderedGroups.add(fw.group);
                      const groupMeta = FRAMEWORK_GROUP_METADATA[fw.group];
                      const groupMembers = availableFrameworks.filter((f) => f.group === fw.group);
                      const selectedCount = groupMembers.filter((f) => selectedFrameworkIds.includes(f.id)).length;
                      const totalControls = groupMembers.reduce((sum, f) => sum + f.controlCount, 0);
                      const isExpanded = expandedGroups.has(fw.group);
                      return (
                        <div
                          key={`group-${fw.group}`}
                          className={`rounded-lg border p-3 transition ${
                            selectedCount > 0 ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(fw.group!)) next.delete(fw.group!);
                                else next.add(fw.group!);
                                return next;
                              })
                            }
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">
                                  {groupMeta?.label ?? fw.group}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {groupMembers.length} standards &middot; {totalControls} controls
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {selectedCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white">
                                    {selectedCount} selected
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{groupMeta?.description}</p>
                          </button>
                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                              {groupMembers.map((child) => {
                                const isSelected = selectedFrameworkIds.includes(child.id);
                                return (
                                  <button
                                    key={child.id}
                                    type="button"
                                    onClick={() => toggleFramework(child.id)}
                                    className={`w-full text-left rounded-md border p-2 text-xs transition ${
                                      isSelected
                                        ? 'border-purple-500 bg-purple-50'
                                        : 'border-gray-200 bg-white hover:border-purple-300'
                                    }`}
                                  >
                                    <span className="font-medium text-gray-900">{child.name}</span>
                                    <span className="text-gray-500 ml-1">({child.controlCount} controls)</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const isSelected = selectedFrameworkIds.includes(fw.id);
                    return (
                      <button
                        key={fw.id}
                        type="button"
                        onClick={() => toggleFramework(fw.id)}
                        className={`text-left rounded-lg border p-3 transition ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-500'
                            : 'border-gray-200 bg-white hover:border-purple-400'
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">{fw.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{fw.controlCount} controls</p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{fw.description}</p>
                      </button>
                    );
                  });
                })()}
              </div>
            )}
          </section>
        )}

        {/* ─── Navigation buttons ─────────────────────────────────── */}
        <div className="mt-10 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => { setStep(step - 1); setError(''); }}
              className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              disabled={
                (step === 1 && !stepOneValid()) ||
                (step === 2 && !stepTwoValid()) ||
                (step === 3 && !stepThreeValid())
              }
              onClick={() => { setStep(step + 1); setError(''); }}
              className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleComplete}
              className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving...' : 'Complete Setup'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
