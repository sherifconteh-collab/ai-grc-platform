// @tier: community
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { cyberResilienceAPI, organizationAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OrgSystem {
  id: string;
  system_name: string;
  system_code: string | null;
  is_active: boolean;
}

type PlanType = 'incident_response' | 'business_continuity' | 'disaster_recovery' | 'ransomware_playbook';
type PlanStatus = 'draft' | 'active' | 'under_review' | 'retired';
type TestOutcome = 'passed' | 'partial' | 'failed';
type TestType = 'tabletop' | 'functional' | 'full_scale';

interface ResiliencePlan {
  id: string;
  organization_id: string;
  system_id: string | null;
  system_name: string | null;
  plan_type: PlanType;
  title: string;
  description: string | null;
  status: PlanStatus;
  rto_target_hours: number | null;
  rpo_target_hours: number | null;
  owner_id: string | null;
  last_tested_date: string | null;
  next_test_due: string | null;
  document_url: string | null;
  overdue: boolean;
  last_test_date: string | null;
  last_test_outcome: TestOutcome | null;
  created_at: string;
  updated_at: string;
}

interface PlanTest {
  id: string;
  resilience_plan_id: string;
  test_type: TestType;
  scenario: string;
  test_date: string;
  participants: string[];
  outcome: TestOutcome;
  actual_rto_hours: number | null;
  actual_rpo_hours: number | null;
  findings: string | null;
  remediation_poam_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface ScoreComponent {
  score: number;
  [key: string]: number;
}

interface ResilienceScore {
  overall_score: number;
  components: {
    plan_coverage: ScoreComponent & { covered_systems: number; total_systems: number };
    test_cadence: ScoreComponent & { tested_recently: number; total_active_plans: number };
    rto_rpo_attainment: ScoreComponent & { plans_meeting_targets: number; plans_with_tests: number };
    backup_health: ScoreComponent & { successful_backups: number; total_backups: number };
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PLAN_TYPE_BADGES: Record<PlanType, { label: string; color: string }> = {
  incident_response: { label: 'Incident Response', color: 'bg-red-100 text-red-700' },
  business_continuity: { label: 'Business Continuity', color: 'bg-blue-100 text-blue-700' },
  disaster_recovery: { label: 'Disaster Recovery', color: 'bg-purple-100 text-purple-700' },
  ransomware_playbook: { label: 'Ransomware Playbook', color: 'bg-orange-100 text-orange-700' },
};

const STATUS_BADGES: Record<PlanStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  under_review: { label: 'Under Review', color: 'bg-amber-100 text-amber-700' },
  retired: { label: 'Retired', color: 'bg-gray-100 text-gray-500' },
};

const OUTCOME_BADGES: Record<TestOutcome, { label: string; color: string }> = {
  passed: { label: 'Passed', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700' },
};

const TEST_TYPE_LABELS: Record<TestType, string> = {
  tabletop: 'Tabletop Exercise',
  functional: 'Functional Test',
  full_scale: 'Full-Scale Exercise',
};

const EMPTY_CREATE_FORM = {
  plan_type: 'business_continuity' as PlanType,
  title: '',
  description: '',
  status: 'draft' as PlanStatus,
  system_id: '',
  rto_target_hours: '',
  rpo_target_hours: '',
  owner_id: '',
  last_tested_date: '',
  next_test_due: '',
  document_url: '',
};

const EMPTY_TEST_FORM = {
  test_type: 'tabletop' as TestType,
  scenario: '',
  test_date: new Date().toISOString().slice(0, 10),
  participants: '',
  outcome: 'passed' as TestOutcome,
  actual_rto_hours: '',
  actual_rpo_hours: '',
  findings: '',
  remediation_poam_id: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CyberResiliencePage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'assessments.write');

  // View state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [score, setScore] = useState<ResilienceScore | null>(null);
  const [plans, setPlans] = useState<ResiliencePlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ResiliencePlan | null>(null);
  const [planTests, setPlanTests] = useState<PlanTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [orgSystems, setOrgSystems] = useState<OrgSystem[]>([]);

  // Create plan modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  // Log test modal
  const [showTestForm, setShowTestForm] = useState(false);
  const [testForm, setTestForm] = useState(EMPTY_TEST_FORM);
  const [loggingTest, setLoggingTest] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const loadScore = useCallback(async () => {
    try {
      const res = await cyberResilienceAPI.getScore();
      setScore(res.data?.data ?? null);
    } catch {
      setScore(null);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const res = await cyberResilienceAPI.getPlans();
      setPlans(res.data?.data || []);
    } catch {
      setPlans([]);
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

  const loadPlanTests = useCallback(async (planId: string) => {
    try {
      const res = await cyberResilienceAPI.getTests(planId);
      setPlanTests(res.data?.data || []);
    } catch {
      setPlanTests([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadScore(), loadPlans(), loadSystems()]);
      setLoading(false);
    };
    init();
  }, [loadScore, loadPlans, loadSystems]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleCreate = async () => {
    if (!createForm.title.trim()) {
      setActionError('Title is required');
      return;
    }
    setCreating(true);
    setActionError('');
    try {
      await cyberResilienceAPI.createPlan({
        plan_type: createForm.plan_type,
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        status: createForm.status,
        system_id: createForm.system_id || undefined,
        rto_target_hours: createForm.rto_target_hours ? Number(createForm.rto_target_hours) : undefined,
        rpo_target_hours: createForm.rpo_target_hours ? Number(createForm.rpo_target_hours) : undefined,
        owner_id: createForm.owner_id.trim() || undefined,
        last_tested_date: createForm.last_tested_date || undefined,
        next_test_due: createForm.next_test_due || undefined,
        document_url: createForm.document_url.trim() || undefined,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setActionSuccess('Resilience plan created successfully');
      await Promise.all([loadScore(), loadPlans()]);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Failed to create plan'));
    } finally {
      setCreating(false);
    }
  };

  const handleLogTest = async () => {
    if (!selectedPlan) return;
    if (!testForm.scenario.trim()) {
      setActionError('Scenario is required');
      return;
    }
    setLoggingTest(true);
    setActionError('');
    try {
      await cyberResilienceAPI.createTest(selectedPlan.id, {
        test_type: testForm.test_type,
        scenario: testForm.scenario.trim(),
        test_date: testForm.test_date || undefined,
        participants: testForm.participants
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
        outcome: testForm.outcome,
        actual_rto_hours: testForm.actual_rto_hours ? Number(testForm.actual_rto_hours) : undefined,
        actual_rpo_hours: testForm.actual_rpo_hours ? Number(testForm.actual_rpo_hours) : undefined,
        findings: testForm.findings.trim() || undefined,
        remediation_poam_id: testForm.remediation_poam_id.trim() || undefined,
      });
      setShowTestForm(false);
      setTestForm(EMPTY_TEST_FORM);
      setActionSuccess('Test result logged');
      await Promise.all([loadPlanTests(selectedPlan.id), loadPlans(), loadScore()]);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Failed to log test'));
    } finally {
      setLoggingTest(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this resilience plan and all associated test history? This cannot be undone.')) return;
    try {
      await cyberResilienceAPI.deletePlan(id);
      setSelectedPlan(null);
      setView('list');
      setActionSuccess('Plan deleted');
      await Promise.all([loadScore(), loadPlans()]);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Failed to delete plan'));
    }
  };

  const openDetail = async (plan: ResiliencePlan) => {
    setView('detail');
    setSelectedPlan(plan);
    setPlanTests([]);
    await loadPlanTests(plan.id);
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const scoreColor = (value: number) => {
    if (value >= 80) return 'text-green-600';
    if (value >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const scoreRingColor = (value: number) => {
    if (value >= 80) return '#16a34a';
    if (value >= 50) return '#d97706';
    return '#dc2626';
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
            <h1 className="text-2xl font-bold text-gray-900">Cyber Resilience</h1>
            <p className="text-sm text-gray-500 mt-1">
              Business continuity, disaster recovery, and incident response readiness
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1 text-sm">
              {(['list', 'detail'] as const)
                .filter((v) => v !== 'detail' || selectedPlan)
                .map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      view === v ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {v === 'list' ? 'Plans' : 'Detail'}
                  </button>
                ))}
            </div>
            {canWrite && (
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                + New Plan
              </button>
            )}
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">
              dismiss
            </button>
          </div>
        )}
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {actionError}
            <button onClick={() => setActionError('')} className="ml-2 underline">
              dismiss
            </button>
          </div>
        )}
        {actionSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {actionSuccess}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading cyber resilience data...</div>
        ) : (
          <div className="space-y-6">
            {/* ================================================================
               SCORE SECTION — always visible
               ================================================================ */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className="relative w-28 h-28 rounded-full flex items-center justify-center"
                    style={{
                      background: `conic-gradient(${scoreRingColor(score?.overall_score ?? 0)} ${
                        (score?.overall_score ?? 0) * 3.6
                      }deg, #e5e7eb 0deg)`,
                    }}
                    role="progressbar"
                    aria-label="Overall Cyber Resilience Score"
                    aria-valuenow={score?.overall_score ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="w-22 h-22 bg-white rounded-full flex items-center justify-center" style={{ width: '5.25rem', height: '5.25rem' }}>
                      <span className={`text-3xl font-bold ${scoreColor(score?.overall_score ?? 0)}`}>
                        {score?.overall_score ?? 0}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mt-2">Cyber Resilience Score</p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 w-full">
                  <ScoreTile
                    label="Plan Coverage"
                    score={score?.components.plan_coverage.score ?? 0}
                    detail={
                      score
                        ? `${score.components.plan_coverage.covered_systems} of ${score.components.plan_coverage.total_systems} systems covered`
                        : '—'
                    }
                  />
                  <ScoreTile
                    label="Test Cadence"
                    score={score?.components.test_cadence.score ?? 0}
                    detail={
                      score
                        ? `${score.components.test_cadence.tested_recently} of ${score.components.test_cadence.total_active_plans} plans tested recently`
                        : '—'
                    }
                  />
                  <ScoreTile
                    label="RTO/RPO Attainment"
                    score={score?.components.rto_rpo_attainment.score ?? 0}
                    detail={
                      score
                        ? `${score.components.rto_rpo_attainment.plans_meeting_targets} of ${score.components.rto_rpo_attainment.plans_with_tests} plans meeting targets`
                        : '—'
                    }
                  />
                  <ScoreTile
                    label="Backup Health"
                    score={score?.components.backup_health.score ?? 0}
                    detail={
                      score
                        ? `${score.components.backup_health.successful_backups} of ${score.components.backup_health.total_backups} backups successful`
                        : '—'
                    }
                  />
                </div>
              </div>
            </div>

            {view === 'list' ? (
              /* ================================================================
                 PLANS LIST
                 ================================================================ */
              plans.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                  <p className="text-4xl mb-3">🛡️</p>
                  <h3 className="text-lg font-semibold text-gray-900">No Resilience Plans Yet</h3>
                  <p className="text-gray-500 mt-1 text-sm">
                    Create your first BC/DR/incident-response plan to begin tracking readiness.
                  </p>
                  {canWrite && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                      + New Plan
                    </button>
                  )}
                </div>
              ) : (
                <ul role="list" className="space-y-4">
                  {plans.map((plan) => {
                    const typeBadge = PLAN_TYPE_BADGES[plan.plan_type];
                    const statusBadge = STATUS_BADGES[plan.status];
                    const outcomeBadge = plan.last_test_outcome ? OUTCOME_BADGES[plan.last_test_outcome] : null;
                    return (
                      <li
                        role="listitem"
                        key={plan.id}
                        onClick={() => openDetail(plan)}
                        className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-3 gap-3">
                          <div>
                            <h3 className="font-semibold text-gray-900">{plan.title}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{plan.system_name || 'Org-wide'}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {plan.overdue && (
                              <span
                                aria-label="Plan test overdue"
                                className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"
                              >
                                Overdue
                              </span>
                            )}
                            <span aria-label={`Plan type: ${typeBadge.label}`} className={`px-2.5 py-1 rounded-full text-xs font-medium ${typeBadge.color}`}>
                              {typeBadge.label}
                            </span>
                            <span aria-label={`Status: ${statusBadge.label}`} className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}>
                              {statusBadge.label}
                            </span>
                            {outcomeBadge && (
                              <span
                                aria-label={`Last test outcome: ${outcomeBadge.label}`}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium ${outcomeBadge.color}`}
                              >
                                Last test: {outcomeBadge.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>RTO target: {plan.rto_target_hours != null ? `${plan.rto_target_hours}h` : '—'}</span>
                          <span>RPO target: {plan.rpo_target_hours != null ? `${plan.rpo_target_hours}h` : '—'}</span>
                          <span className="ml-auto">Updated {formatDate(plan.updated_at)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              /* ================================================================
                 DETAIL VIEW
                 ================================================================ */
              selectedPlan && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setView('list');
                        setSelectedPlan(null);
                      }}
                      className="text-gray-500 hover:text-gray-700 text-sm"
                    >
                      ← Back
                    </button>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4 gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{selectedPlan.title}</h2>
                        {selectedPlan.description && (
                          <p className="text-sm text-gray-500 mt-1">{selectedPlan.description}</p>
                        )}
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setShowTestForm(true)}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                          >
                            Log a Test
                          </button>
                          <button
                            onClick={() => handleDelete(selectedPlan.id)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      <span
                        aria-label={`Plan type: ${PLAN_TYPE_BADGES[selectedPlan.plan_type].label}`}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${PLAN_TYPE_BADGES[selectedPlan.plan_type].color}`}
                      >
                        {PLAN_TYPE_BADGES[selectedPlan.plan_type].label}
                      </span>
                      <span
                        aria-label={`Status: ${STATUS_BADGES[selectedPlan.status].label}`}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[selectedPlan.status].color}`}
                      >
                        {STATUS_BADGES[selectedPlan.status].label}
                      </span>
                      {selectedPlan.overdue && (
                        <span
                          aria-label="Plan test overdue"
                          className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"
                        >
                          Overdue
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <DetailField label="System" value={selectedPlan.system_name || 'Org-wide'} />
                      <DetailField
                        label="RTO Target"
                        value={selectedPlan.rto_target_hours != null ? `${selectedPlan.rto_target_hours}h` : undefined}
                      />
                      <DetailField
                        label="RPO Target"
                        value={selectedPlan.rpo_target_hours != null ? `${selectedPlan.rpo_target_hours}h` : undefined}
                      />
                      <DetailField label="Last Tested" value={formatDate(selectedPlan.last_tested_date)} />
                      <DetailField label="Next Test Due" value={formatDate(selectedPlan.next_test_due)} />
                      <DetailField
                        label="Document"
                        value={selectedPlan.document_url ? 'Available' : undefined}
                      />
                      <DetailField label="Created" value={formatDate(selectedPlan.created_at)} />
                      <DetailField label="Updated" value={formatDate(selectedPlan.updated_at)} />
                    </div>
                  </div>

                  {/* Test history timeline */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Test History</h3>
                    {planTests.length === 0 ? (
                      <p className="text-sm text-gray-500">No tests logged yet for this plan.</p>
                    ) : (
                      <div className="space-y-2">
                        {planTests.map((t) => (
                          <div key={t.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-50 last:border-0">
                            <span className="text-gray-400 whitespace-nowrap text-xs mt-0.5">{formatDate(t.test_date)}</span>
                            <div className="flex-1">
                              <span className="text-gray-700">
                                <span className="font-medium">{TEST_TYPE_LABELS[t.test_type]}</span>
                                {' — '}
                                {t.scenario}
                              </span>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span
                                  aria-label={`Test outcome: ${OUTCOME_BADGES[t.outcome].label}`}
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_BADGES[t.outcome].color}`}
                                >
                                  {OUTCOME_BADGES[t.outcome].label}
                                </span>
                                {t.actual_rto_hours != null && (
                                  <span className="text-xs text-gray-500">Actual RTO: {t.actual_rto_hours}h</span>
                                )}
                                {t.actual_rpo_hours != null && (
                                  <span className="text-xs text-gray-500">Actual RPO: {t.actual_rpo_hours}h</span>
                                )}
                                {t.remediation_poam_id && (
                                  <span className="text-xs text-gray-500">POA&M: {t.remediation_poam_id}</span>
                                )}
                              </div>
                              {t.findings && <p className="text-xs text-gray-500 mt-1">{t.findings}</p>}
                              {t.participants.length > 0 && (
                                <p className="text-xs text-gray-400 mt-1">Participants: {t.participants.join(', ')}</p>
                              )}
                            </div>
                            {t.created_by_name && (
                              <span className="text-xs text-gray-400 whitespace-nowrap">{t.created_by_name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ================================================================
           MODALS
           ================================================================ */}

        {/* Create Plan Modal */}
        {showCreate && (
          <Modal title="New Resilience Plan" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan Type *</label>
                  <select
                    value={createForm.plan_type}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, plan_type: e.target.value as PlanType }))
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="incident_response">Incident Response</option>
                    <option value="business_continuity">Business Continuity</option>
                    <option value="disaster_recovery">Disaster Recovery</option>
                    <option value="ransomware_playbook">Ransomware Playbook</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value as PlanStatus }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="under_review">Under Review</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Primary Data Center DR Plan"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Brief description of the plan..."
                />
              </div>

              {orgSystems.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">System (optional)</label>
                  <select
                    value={createForm.system_id}
                    onChange={(e) => setCreateForm((f) => ({ ...f, system_id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— None (org-wide plan) —</option>
                    {orgSystems.map((sys) => (
                      <option key={sys.id} value={sys.id}>
                        {sys.system_name}
                        {sys.system_code ? ` (${sys.system_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">System ID (optional)</label>
                  <input
                    type="text"
                    value={createForm.system_id}
                    onChange={(e) => setCreateForm((f) => ({ ...f, system_id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="Leave blank for an org-wide plan"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RTO Target (hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.rto_target_hours}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rto_target_hours: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RPO Target (hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.rpo_target_hours}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rpo_target_hours: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner (user ID, optional)</label>
                <input
                  type="text"
                  value={createForm.owner_id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, owner_id: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Plan owner's user ID"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Tested Date</label>
                  <input
                    type="date"
                    value={createForm.last_tested_date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, last_tested_date: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Next Test Due</label>
                  <input
                    type="date"
                    value={createForm.next_test_due}
                    onChange={(e) => setCreateForm((f) => ({ ...f, next_test_due: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document URL</label>
                <input
                  type="text"
                  value={createForm.document_url}
                  onChange={(e) => setCreateForm((f) => ({ ...f, document_url: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Link to the plan document"
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
                  {creating ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Log Test Modal */}
        {showTestForm && selectedPlan && (
          <Modal title="Log a Test" onClose={() => setShowTestForm(false)}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Type *</label>
                  <select
                    value={testForm.test_type}
                    onChange={(e) => setTestForm((f) => ({ ...f, test_type: e.target.value as TestType }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="tabletop">Tabletop Exercise</option>
                    <option value="functional">Functional Test</option>
                    <option value="full_scale">Full-Scale Exercise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Date</label>
                  <input
                    type="date"
                    value={testForm.test_date}
                    onChange={(e) => setTestForm((f) => ({ ...f, test_date: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scenario *</label>
                <textarea
                  value={testForm.scenario}
                  onChange={(e) => setTestForm((f) => ({ ...f, scenario: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Describe the test scenario..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Participants</label>
                <input
                  type="text"
                  value={testForm.participants}
                  onChange={(e) => setTestForm((f) => ({ ...f, participants: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Comma-separated names, e.g. Jane Doe, John Smith"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Outcome *</label>
                  <select
                    value={testForm.outcome}
                    onChange={(e) => setTestForm((f) => ({ ...f, outcome: e.target.value as TestOutcome }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="passed">Passed</option>
                    <option value="partial">Partial</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual RTO (hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={testForm.actual_rto_hours}
                    onChange={(e) => setTestForm((f) => ({ ...f, actual_rto_hours: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual RPO (hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={testForm.actual_rpo_hours}
                    onChange={(e) => setTestForm((f) => ({ ...f, actual_rpo_hours: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Findings</label>
                <textarea
                  value={testForm.findings}
                  onChange={(e) => setTestForm((f) => ({ ...f, findings: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Notable findings from the exercise..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remediation POA&amp;M ID (optional)</label>
                <input
                  type="text"
                  value={testForm.remediation_poam_id}
                  onChange={(e) => setTestForm((f) => ({ ...f, remediation_poam_id: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Linked POA&M item ID"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowTestForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleLogTest}
                  disabled={loggingTest}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loggingTest ? 'Saving...' : 'Log Test'}
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
function ScoreTile({ label, score, detail }: { label: string; score: number; detail: string }) {
  const color = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`} aria-label={`${label} score: ${score} out of 100`}>
        {score}
      </p>
      <p className="text-xs text-gray-400 mt-1">{detail}</p>
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response &&
    err.response.data &&
    typeof err.response.data === 'object' &&
    'error' in err.response.data &&
    typeof (err.response.data as { error?: unknown }).error === 'string'
  ) {
    return (err.response.data as { error: string }).error;
  }
  return fallback;
}
