// @tier: enterprise
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { rmfAPI, organizationAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface OrgSystem {
  id: string;
  system_name: string;
  system_code: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RmfPackage {
  id: string;
  system_name: string;
  system_description: string | null;
  current_step: string;
  overall_status: string;
  categorization_level: string | null;
  selected_baseline: string | null;
  authorization_type: string | null;
  authorization_boundary: string | null;
  confidentiality_impact: string | null;
  integrity_impact: string | null;
  availability_impact: string | null;
  categorization_rationale: string | null;
  tailoring_notes: string | null;
  continuous_monitoring_enabled: boolean;
  last_assessment_date: string | null;
  next_assessment_due: string | null;
  transition_count: number;
  active_decisions: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface StepHistoryEntry {
  id: string;
  from_step: string | null;
  to_step: string;
  action: string;
  notes: string | null;
  performed_by_name: string | null;
  performed_at: string;
}

interface AuthorizationDecision {
  id: string;
  decision_type: string;
  decision_date: string;
  expiration_date: string | null;
  conditions: string | null;
  risk_level: string | null;
  residual_risk_statement: string | null;
  authorizing_official: string;
  authorizing_official_title: string | null;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
}

interface DashboardSummary {
  total_packages: number;
  step_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
  active_authorizations: number;
  expiring_authorizations: { system_name: string; expiration_date: string; decision_type: string }[];
  recent_activity: {
    id: string;
    from_step: string | null;
    to_step: string;
    action: string;
    notes: string | null;
    performed_by_name: string | null;
    performed_at: string;
    system_name: string;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RMF_STEPS = [
  { key: 'prepare', label: 'Prepare', icon: '📋', description: 'Essential activities to manage security and privacy risks' },
  { key: 'categorize', label: 'Categorize', icon: '🏷️', description: 'Categorize the system and information based on impact analysis' },
  { key: 'select', label: 'Select', icon: '✅', description: 'Select, tailor, and document security controls' },
  { key: 'implement', label: 'Implement', icon: '🔧', description: 'Implement controls and document deployment' },
  { key: 'assess', label: 'Assess', icon: '🔍', description: 'Assess controls to determine effectiveness' },
  { key: 'authorize', label: 'Authorize', icon: '🔑', description: 'Authorize the system based on risk determination' },
  { key: 'monitor', label: 'Monitor', icon: '📡', description: 'Monitor controls and maintain ongoing authorization' },
] as const;

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  assessment_complete: { label: 'Assessment Complete', color: 'bg-purple-100 text-purple-700' },
  authorized: { label: 'Authorized', color: 'bg-green-100 text-green-700' },
  denied: { label: 'Denied', color: 'bg-red-100 text-red-700' },
  revoked: { label: 'Revoked', color: 'bg-orange-100 text-orange-700' },
};

const DECISION_BADGES: Record<string, { label: string; color: string }> = {
  ato: { label: 'ATO', color: 'bg-green-100 text-green-800' },
  dato: { label: 'DATO', color: 'bg-yellow-100 text-yellow-800' },
  iatt: { label: 'IATT', color: 'bg-blue-100 text-blue-800' },
  denial: { label: 'Denial', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RmfLifecyclePage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'assessments.write');

  // State
  const [view, setView] = useState<'dashboard' | 'list' | 'detail'>('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [packages, setPackages] = useState<RmfPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<(RmfPackage & { history: StepHistoryEntry[]; authorization_decisions: AuthorizationDecision[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Organization systems (for linking)
  const [orgSystems, setOrgSystems] = useState<OrgSystem[]>([]);

  // Create package form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ system_name: '', system_description: '', system_id: '' });
  const [creating, setCreating] = useState(false);

  // Transition form
  const [showTransition, setShowTransition] = useState(false);
  const [transitionForm, setTransitionForm] = useState({ to_step: '', action: 'advance', notes: '' });
  const [transitioning, setTransitioning] = useState(false);

  // Authorization form
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authForm, setAuthForm] = useState({
    decision_type: 'ato',
    authorizing_official: '',
    authorizing_official_title: '',
    decision_date: new Date().toISOString().slice(0, 10),
    expiration_date: '',
    risk_level: '',
    conditions: '',
    residual_risk_statement: '',
  });
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------
  const loadSummary = useCallback(async () => {
    try {
      const res = await rmfAPI.getSummary();
      setSummary(res.data?.data);
    } catch {
      // Summary may fail if no packages yet — that's OK
      setSummary(null);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      const res = await rmfAPI.getPackages();
      setPackages(res.data?.data || []);
    } catch {
      setPackages([]);
    }
  }, []);

  const loadPackageDetail = useCallback(async (id: string) => {
    try {
      const res = await rmfAPI.getPackage(id);
      setSelectedPackage(res.data?.data);
    } catch {
      setError('Failed to load package details');
    }
  }, []);

  const loadSystems = useCallback(async () => {
    try {
      const res = await organizationAPI.getSystems();
      setOrgSystems((res.data?.data || []).filter((s: OrgSystem) => s.is_active));
    } catch {
      setOrgSystems([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadSummary(), loadPackages(), loadSystems()]);
      setLoading(false);
    };
    init();
  }, [loadSummary, loadPackages, loadSystems]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleCreate = async () => {
    if (!createForm.system_name.trim()) {
      setActionError('System name is required');
      return;
    }
    setCreating(true);
    setActionError('');
    try {
      await rmfAPI.createPackage({
        system_name: createForm.system_name.trim(),
        system_description: createForm.system_description.trim() || undefined,
        system_id: createForm.system_id || undefined,
      });
      setShowCreate(false);
      setCreateForm({ system_name: '', system_description: '', system_id: '' });
      setActionSuccess('RMF package created successfully');
      await Promise.all([loadSummary(), loadPackages()]);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to create package');
    } finally {
      setCreating(false);
    }
  };

  const handleTransition = async () => {
    if (!selectedPackage || !transitionForm.to_step) return;
    setTransitioning(true);
    setActionError('');
    try {
      await rmfAPI.transitionStep(selectedPackage.id, {
        to_step: transitionForm.to_step,
        action: transitionForm.action,
        notes: transitionForm.notes.trim() || undefined,
      });
      setShowTransition(false);
      setTransitionForm({ to_step: '', action: 'advance', notes: '' });
      setActionSuccess('Step transition recorded');
      await loadPackageDetail(selectedPackage.id);
      await loadSummary();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  const handleAuthDecision = async () => {
    if (!selectedPackage) return;
    if (!authForm.authorizing_official.trim()) {
      setActionError('Authorizing official is required');
      return;
    }
    setAuthSubmitting(true);
    setActionError('');
    try {
      await rmfAPI.createAuthorization(selectedPackage.id, {
        decision_type: authForm.decision_type,
        authorizing_official: authForm.authorizing_official.trim(),
        authorizing_official_title: authForm.authorizing_official_title.trim() || undefined,
        decision_date: authForm.decision_date,
        expiration_date: authForm.expiration_date || undefined,
        risk_level: authForm.risk_level || undefined,
        conditions: authForm.conditions.trim() || undefined,
        residual_risk_statement: authForm.residual_risk_statement.trim() || undefined,
      });
      setShowAuthForm(false);
      setAuthForm({
        decision_type: 'ato',
        authorizing_official: '',
        authorizing_official_title: '',
        decision_date: new Date().toISOString().slice(0, 10),
        expiration_date: '',
        risk_level: '',
        conditions: '',
        residual_risk_statement: '',
      });
      setActionSuccess('Authorization decision recorded');
      await loadPackageDetail(selectedPackage.id);
      await loadSummary();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to record decision');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this RMF package and all associated history? This cannot be undone.')) return;
    try {
      await rmfAPI.deletePackage(id);
      setSelectedPackage(null);
      setView('list');
      setActionSuccess('Package deleted');
      await Promise.all([loadSummary(), loadPackages()]);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to delete');
    }
  };

  const openDetail = async (pkg: RmfPackage) => {
    setView('detail');
    setSelectedPackage(null);
    await loadPackageDetail(pkg.id);
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const currentStepIndex = (step: string) => RMF_STEPS.findIndex(s => s.key === step);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RMF Lifecycle</h1>
            <p className="text-sm text-gray-500 mt-1">NIST SP 800-37 Rev 2 — Risk Management Framework</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1 text-sm">
              {(['dashboard', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => { setView(v); setSelectedPackage(null); }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    view === v ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {v === 'dashboard' ? 'Overview' : 'Packages'}
                </button>
              ))}
            </div>
            {canWrite && (
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                + New RMF Package
              </button>
            )}
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
          </div>
        )}
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {actionError}
            <button onClick={() => setActionError('')} className="ml-2 underline">dismiss</button>
          </div>
        )}
        {actionSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {actionSuccess}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading RMF data...</div>
        ) : view === 'dashboard' ? (
          /* ================================================================
             DASHBOARD VIEW
             ================================================================ */
          <div className="space-y-6">
            {/* Step Distribution — 7-step stepper */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Lifecycle Step Distribution</h2>
              <div className="flex items-center gap-1">
                {RMF_STEPS.map((step, idx) => {
                  const count = summary?.step_distribution?.[step.key] || 0;
                  return (
                    <div key={step.key} className="flex-1 text-center">
                      <div className="flex items-center justify-center mb-2">
                        {idx > 0 && <div className="h-0.5 flex-1 bg-gray-200 -mr-1" />}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 shrink-0 ${
                          count > 0 ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                        }`}>
                          {step.icon}
                        </div>
                        {idx < RMF_STEPS.length - 1 && <div className="h-0.5 flex-1 bg-gray-200 -ml-1" />}
                      </div>
                      <p className="text-xs font-medium text-gray-700">{step.label}</p>
                      <p className={`text-lg font-bold ${count > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>{count}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <StatCard label="Total Packages" value={summary?.total_packages ?? packages.length} />
              <StatCard label="Active Authorizations" value={summary?.active_authorizations ?? 0} color="text-green-600" />
              <StatCard
                label="Expiring Soon"
                value={summary?.expiring_authorizations?.length ?? 0}
                color={summary?.expiring_authorizations?.length ? 'text-amber-600' : undefined}
              />
              <StatCard
                label="Denied / Revoked"
                value={(summary?.status_distribution?.denied ?? 0) + (summary?.status_distribution?.revoked ?? 0)}
                color="text-red-600"
              />
            </div>

            {/* Expiring authorizations */}
            {(summary?.expiring_authorizations?.length ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="font-semibold text-amber-800 mb-3">⚠ Authorizations Expiring Within 90 Days</h3>
                <div className="space-y-2">
                  {summary!.expiring_authorizations.map((ea, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800">{ea.system_name}</span>
                      <span className="text-amber-700">
                        {DECISION_BADGES[ea.decision_type]?.label || ea.decision_type.toUpperCase()} expires {formatDate(ea.expiration_date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activity */}
            {(summary?.recent_activity?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
                <div className="space-y-3">
                  {summary!.recent_activity.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-gray-400 whitespace-nowrap">{formatDate(a.performed_at)}</span>
                      <span className="text-gray-700">
                        <span className="font-medium">{a.system_name}</span>
                        {' — '}
                        {a.from_step ? `${a.from_step} → ${a.to_step}` : `Started at ${a.to_step}`}
                        {a.notes && <span className="text-gray-400 ml-1">({a.notes})</span>}
                      </span>
                      {a.performed_by_name && (
                        <span className="ml-auto text-gray-400">{a.performed_by_name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {packages.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <p className="text-4xl mb-3">🔄</p>
                <h3 className="text-lg font-semibold text-gray-900">No RMF Packages Yet</h3>
                <p className="text-gray-500 mt-1 text-sm">Create your first RMF package to begin tracking the NIST SP 800-37 lifecycle.</p>
                {canWrite && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                  >
                    + New RMF Package
                  </button>
                )}
              </div>
            )}
          </div>
        ) : view === 'list' ? (
          /* ================================================================
             LIST VIEW
             ================================================================ */
          <div className="space-y-4">
            {packages.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No RMF packages found.</p>
              </div>
            ) : (
              packages.map(pkg => {
                const stepIdx = currentStepIndex(pkg.current_step);
                const badge = STATUS_BADGES[pkg.overall_status] || STATUS_BADGES.not_started;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => openDetail(pkg)}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{pkg.system_name}</h3>
                        {pkg.system_description && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{pkg.system_description}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Mini stepper */}
                    <div className="flex items-center gap-1 mb-3">
                      {RMF_STEPS.map((step, i) => (
                        <div
                          key={step.key}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i <= stepIdx ? 'bg-indigo-500' : 'bg-gray-200'
                          }`}
                          title={step.label}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>📍 {RMF_STEPS[stepIdx]?.label || pkg.current_step}</span>
                      {pkg.categorization_level && <span>📊 {pkg.categorization_level.toUpperCase()} Impact</span>}
                      <span className="ml-auto">Updated {formatDate(pkg.updated_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* ================================================================
             DETAIL VIEW
             ================================================================ */
          selectedPackage ? (
            <div className="space-y-6">
              {/* Back + header */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setView('list'); setSelectedPackage(null); }}
                  className="text-gray-500 hover:text-gray-700 text-sm"
                >
                  ← Back
                </button>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedPackage.system_name}</h2>
                    {selectedPackage.system_description && (
                      <p className="text-sm text-gray-500 mt-1">{selectedPackage.system_description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canWrite && (
                      <>
                        <button
                          onClick={() => {
                            setShowTransition(true);
                            const idx = currentStepIndex(selectedPackage.current_step);
                            const nextStep = RMF_STEPS[Math.min(idx + 1, RMF_STEPS.length - 1)]?.key || '';
                            setTransitionForm({ to_step: nextStep, action: 'advance', notes: '' });
                          }}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                        >
                          Advance Step
                        </button>
                        <button
                          onClick={() => setShowAuthForm(true)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                        >
                          Record Decision
                        </button>
                        <button
                          onClick={() => handleDelete(selectedPackage.id)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    (STATUS_BADGES[selectedPackage.overall_status] || STATUS_BADGES.not_started).color
                  }`}>
                    {(STATUS_BADGES[selectedPackage.overall_status] || STATUS_BADGES.not_started).label}
                  </span>
                  {selectedPackage.categorization_level && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      {selectedPackage.categorization_level.toUpperCase()} Impact
                    </span>
                  )}
                  {selectedPackage.authorization_type && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      (DECISION_BADGES[selectedPackage.authorization_type] || { color: 'bg-gray-100 text-gray-700' }).color
                    }`}>
                      {(DECISION_BADGES[selectedPackage.authorization_type] || { label: selectedPackage.authorization_type }).label}
                    </span>
                  )}
                </div>

                {/* Full stepper */}
                <div className="flex items-center gap-2 mb-6">
                  {RMF_STEPS.map((step, idx) => {
                    const pkgIdx = currentStepIndex(selectedPackage.current_step);
                    const isCompleted = idx < pkgIdx;
                    const isCurrent = idx === pkgIdx;
                    return (
                      <div key={step.key} className="flex-1 text-center">
                        <div className="flex items-center justify-center mb-1.5">
                          {idx > 0 && (
                            <div className={`h-0.5 flex-1 ${isCompleted || isCurrent ? 'bg-indigo-400' : 'bg-gray-200'}`} />
                          )}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 border-2 ${
                            isCurrent
                              ? 'border-indigo-600 bg-indigo-100 ring-2 ring-indigo-200'
                              : isCompleted
                              ? 'border-indigo-500 bg-indigo-500 text-white'
                              : 'border-gray-200 bg-gray-50'
                          }`}>
                            {isCompleted ? '✓' : step.icon}
                          </div>
                          {idx < RMF_STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 ${isCompleted ? 'bg-indigo-400' : 'bg-gray-200'}`} />
                          )}
                        </div>
                        <p className={`text-xs font-medium ${isCurrent ? 'text-indigo-700' : isCompleted ? 'text-indigo-500' : 'text-gray-400'}`}>
                          {step.label}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Detail grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <DetailField label="Current Step" value={RMF_STEPS[currentStepIndex(selectedPackage.current_step)]?.label || selectedPackage.current_step} />
                  <DetailField label="Confidentiality" value={selectedPackage.confidentiality_impact?.toUpperCase()} />
                  <DetailField label="Integrity" value={selectedPackage.integrity_impact?.toUpperCase()} />
                  <DetailField label="Availability" value={selectedPackage.availability_impact?.toUpperCase()} />
                  <DetailField label="Baseline" value={selectedPackage.selected_baseline} />
                  <DetailField label="Categorization" value={selectedPackage.categorization_level?.toUpperCase()} />
                  <DetailField label="Created" value={formatDate(selectedPackage.created_at)} />
                  <DetailField label="Created By" value={selectedPackage.created_by_name} />
                </div>
              </div>

              {/* Authorization decisions */}
              {selectedPackage.authorization_decisions?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Authorization Decisions</h3>
                  <div className="space-y-3">
                    {selectedPackage.authorization_decisions.map(ad => (
                      <div key={ad.id} className={`p-4 rounded-lg border ${ad.is_active ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              (DECISION_BADGES[ad.decision_type] || { color: 'bg-gray-100 text-gray-700' }).color
                            }`}>
                              {(DECISION_BADGES[ad.decision_type] || { label: ad.decision_type }).label}
                            </span>
                            {ad.is_active && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-200 text-green-800">Active</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">{formatDate(ad.decision_date)}</span>
                        </div>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">{ad.authorizing_official}</span>
                          {ad.authorizing_official_title && <span className="text-gray-500"> — {ad.authorizing_official_title}</span>}
                        </p>
                        {ad.expiration_date && (
                          <p className="text-xs text-gray-500 mt-1">Expires: {formatDate(ad.expiration_date)}</p>
                        )}
                        {ad.conditions && (
                          <p className="text-xs text-gray-500 mt-1">Conditions: {ad.conditions}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step History */}
              {selectedPackage.history?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Step History</h3>
                  <div className="space-y-2">
                    {selectedPackage.history.map(h => (
                      <div key={h.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-50 last:border-0">
                        <span className="text-gray-400 whitespace-nowrap text-xs mt-0.5">{formatDate(h.performed_at)}</span>
                        <div className="flex-1">
                          <span className="text-gray-700">
                            {h.from_step ? (
                              <><span className="font-medium">{h.from_step}</span> → <span className="font-medium">{h.to_step}</span></>
                            ) : (
                              <>Started at <span className="font-medium">{h.to_step}</span></>
                            )}
                            <span className="text-gray-400 ml-1">({h.action})</span>
                          </span>
                          {h.notes && <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>}
                        </div>
                        {h.performed_by_name && (
                          <span className="text-xs text-gray-400 whitespace-nowrap">{h.performed_by_name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">Loading package...</div>
          )
        )}

        {/* ================================================================
           MODALS
           ================================================================ */}

        {/* Create Package Modal */}
        {showCreate && (
          <Modal title="Create RMF Package" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Name *</label>
                <input
                  type="text"
                  value={createForm.system_name}
                  onChange={e => setCreateForm(f => ({ ...f, system_name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Financial Reporting System"
                />
              </div>
              {orgSystems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link to Organization System</label>
                  <select
                    value={createForm.system_id}
                    onChange={e => {
                      const sysId = e.target.value;
                      const sys = orgSystems.find(s => s.id === sysId);
                      setCreateForm(f => ({
                        ...f,
                        system_id: sysId,
                        system_name: sys ? sys.system_name : f.system_name,
                      }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— None (standalone package) —</option>
                    {orgSystems.map(sys => (
                      <option key={sys.id} value={sys.id}>
                        {sys.system_name}{sys.system_code ? ` (${sys.system_code})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Links this RMF package to an existing system in your asset inventory.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={createForm.system_description}
                  onChange={e => setCreateForm(f => ({ ...f, system_description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Brief description of the system..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Package'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Transition Modal */}
        {showTransition && selectedPackage && (
          <Modal title="Record Step Transition" onClose={() => setShowTransition(false)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Step *</label>
                <select
                  value={transitionForm.to_step}
                  onChange={e => setTransitionForm(f => ({ ...f, to_step: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select step...</option>
                  {RMF_STEPS.map(s => (
                    <option key={s.key} value={s.key}>
                      {s.icon} {s.label} — {s.description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={transitionForm.action}
                  onChange={e => setTransitionForm(f => ({ ...f, action: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="advance">Advance</option>
                  <option value="revert">Revert</option>
                  <option value="reset">Reset</option>
                  <option value="note">Note (no step change)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={transitionForm.notes}
                  onChange={e => setTransitionForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Reason for transition..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowTransition(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleTransition}
                  disabled={transitioning || !transitionForm.to_step}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {transitioning ? 'Saving...' : 'Record Transition'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Authorization Decision Modal */}
        {showAuthForm && selectedPackage && (
          <Modal title="Record Authorization Decision" onClose={() => setShowAuthForm(false)}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Decision Type *</label>
                  <select
                    value={authForm.decision_type}
                    onChange={e => setAuthForm(f => ({ ...f, decision_type: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ato">ATO — Authorization to Operate</option>
                    <option value="dato">DATO — Denial of Authorization to Operate</option>
                    <option value="iatt">IATT — Interim Authorization to Test</option>
                    <option value="denial">Denial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Decision Date *</label>
                  <input
                    type="date"
                    value={authForm.decision_date}
                    onChange={e => setAuthForm(f => ({ ...f, decision_date: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Authorizing Official *</label>
                  <input
                    type="text"
                    value={authForm.authorizing_official}
                    onChange={e => setAuthForm(f => ({ ...f, authorizing_official: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="Name of authorizing official"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={authForm.authorizing_official_title}
                    onChange={e => setAuthForm(f => ({ ...f, authorizing_official_title: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Chief Information Security Officer"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={authForm.expiration_date}
                    onChange={e => setAuthForm(f => ({ ...f, expiration_date: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                  <select
                    value={authForm.risk_level}
                    onChange={e => setAuthForm(f => ({ ...f, risk_level: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select...</option>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                    <option value="very_high">Very High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conditions</label>
                <textarea
                  value={authForm.conditions}
                  onChange={e => setAuthForm(f => ({ ...f, conditions: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Any conditions attached to this authorization..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Residual Risk Statement</label>
                <textarea
                  value={authForm.residual_risk_statement}
                  onChange={e => setAuthForm(f => ({ ...f, residual_risk_statement: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Description of residual risk accepted..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAuthForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleAuthDecision}
                  disabled={authSubmitting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {authSubmitting ? 'Recording...' : 'Record Decision'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-700">{value || '—'}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
