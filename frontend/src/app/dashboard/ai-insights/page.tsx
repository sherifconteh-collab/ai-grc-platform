'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import StructuredOutput from '@/components/ai/StructuredOutput';
import { aiAPI, phase6API } from '@/lib/api';

type WidgetKey = 'gap' | 'forecast' | 'audit' | 'risk';

interface WidgetState {
  loading: boolean;
  result: string | null;
  error: string | null;
}

const initialState: WidgetState = { loading: false, result: null, error: null };

interface WidgetSpec {
  key: WidgetKey;
  title: string;
  description: string;
  feature: string;
  run: () => Promise<{ data: { data?: { result?: string } } }>;
}

const WIDGETS: WidgetSpec[] = [
  {
    key: 'gap',
    title: 'Compliance Gap Analysis',
    description: 'Identifies the most material gaps across your active frameworks and ranks them by impact.',
    feature: 'gap_analysis',
    run: () => aiAPI.gapAnalysis(),
  },
  {
    key: 'forecast',
    title: 'Compliance Forecast',
    description: 'Projects implementation trajectory based on the current pace of control completion.',
    feature: 'compliance_forecast',
    run: () => aiAPI.complianceForecast(),
  },
  {
    key: 'audit',
    title: 'Audit Readiness',
    description: 'Highlights what is ready, what is at risk, and what needs immediate attention before fieldwork.',
    feature: 'audit_readiness',
    run: () => aiAPI.auditReadiness(),
  },
  {
    key: 'risk',
    title: 'Risk Heatmap',
    description: 'Surfaces the top control-level risks weighted by criticality and current implementation state.',
    feature: 'risk_heatmap',
    run: () => aiAPI.riskHeatmap(),
  },
];

type InsightsTab = 'quick' | 'risk-score' | 'regulatory-impact' | 'remediation';

function extractErrorMessage(err: unknown, fallback: string): string {
  const response = (err as { response?: { data?: { error?: string; code?: string } } })?.response;
  if (response?.data?.code === 'NO_PROVIDER_CONFIGURED') {
    return 'Configure an AI provider in Settings to use this feature.';
  }
  return response?.data?.error || fallback;
}

interface RiskScore {
  id?: string;
  overall_risk_score: number;
  risk_grade: string;
  control_implementation_score?: number;
  vulnerability_score?: number;
  evidence_freshness_score?: number;
  assessment_coverage_score?: number;
  critical_gaps_count?: number;
  high_priority_gaps_count?: number;
  unpatched_critical_vulns?: number;
  overdue_assessments?: number;
  trend_direction?: string;
  score_change?: number | null;
  predicted_score_30d?: number;
  predicted_score_60d?: number;
  predicted_score_90d?: number;
  calculated_at?: string;
}

interface RiskScoreHistoryRow {
  overall_risk_score: number;
  risk_grade: string;
  calculated_at: string;
  trend_direction?: string;
  score_change?: number | null;
}

function gradeBadgeClass(grade: string): string {
  if (grade.startsWith('A')) return 'bg-green-100 text-green-800';
  if (grade.startsWith('B')) return 'bg-blue-100 text-blue-800';
  if (grade.startsWith('C')) return 'bg-yellow-100 text-yellow-800';
  if (grade.startsWith('D')) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function RiskScoreTab() {
  const [latest, setLatest] = useState<RiskScore | null>(null);
  const [history, setHistory] = useState<RiskScoreHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [latestRes, historyRes] = await Promise.all([
        phase6API.getLatestRiskScore(),
        phase6API.getRiskScoreHistory(),
      ]);
      setLatest(latestRes.data?.data || null);
      setHistory(Array.isArray(historyRes.data?.data) ? historyRes.data.data : []);
    } catch {
      setError('Failed to load risk score data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadData();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCalculate = async () => {
    setCalculating(true);
    setError('');
    try {
      await phase6API.calculateRiskScore();
      await loadData();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to calculate risk score.'));
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-600">
          Deterministic, multi-factor risk score (0-100) weighted across control implementation, vulnerability
          management, evidence freshness, and assessment coverage. No AI provider required.
        </p>
        <button
          onClick={handleCalculate}
          disabled={calculating}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {calculating ? 'Calculating…' : 'Calculate Risk Score'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 rounded-lg bg-gray-100" />
      ) : !latest ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
          No data available. Click &quot;Calculate Risk Score&quot; to generate the first score.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 border-l-4 border-purple-600">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-bold text-gray-900">{latest.overall_risk_score}</span>
            <span
              className={`text-sm font-semibold px-2 py-1 rounded-full ${gradeBadgeClass(latest.risk_grade)}`}
              aria-label={`Risk grade ${latest.risk_grade}`}
            >
              {latest.risk_grade}
            </span>
            {latest.trend_direction && (
              <span className="text-xs text-gray-500">
                Trend: {latest.trend_direction}
                {typeof latest.score_change === 'number' ? ` (${latest.score_change > 0 ? '+' : ''}${latest.score_change})` : ''}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
            <div>
              <p className="font-medium text-gray-900">{latest.critical_gaps_count ?? 0}</p>
              <p>Critical gaps</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">{latest.high_priority_gaps_count ?? 0}</p>
              <p>High priority gaps</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">{latest.unpatched_critical_vulns ?? 0}</p>
              <p>Unpatched critical vulns</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">{latest.overdue_assessments ?? 0}</p>
              <p>Overdue assessments</p>
            </div>
          </div>
          {latest.calculated_at && (
            <p className="mt-3 text-xs text-gray-400">Calculated {new Date(latest.calculated_at).toLocaleString()}</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900">History</h3>
        {loading ? (
          <div className="mt-3 animate-pulse h-24 rounded bg-gray-100" />
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No data available yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2">Calculated</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, idx) => (
                  <tr key={`${row.calculated_at}-${idx}`} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-600">{new Date(row.calculated_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.overall_risk_score}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${gradeBadgeClass(row.risk_grade)}`}>
                        {row.risk_grade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.trend_direction || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface RegulatoryImpactAssessment {
  id: string;
  framework_code: string;
  change_type: string;
  change_title?: string;
  impact_score?: number;
  impact_level: string;
  estimated_effort_hours?: number;
  estimated_cost?: number;
  review_status?: string | null;
  created_at?: string;
}

const IMPACT_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
  minimal: 'bg-gray-100 text-gray-700',
};

function RegulatoryImpactTab() {
  const [assessments, setAssessments] = useState<RegulatoryImpactAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    frameworkCode: '',
    changeType: '',
    changeDescription: '',
    effectiveDate: '',
  });

  const loadAssessments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await phase6API.getRegulatoryImpactAssessments();
      setAssessments(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setLoadError('Failed to load regulatory impact assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAssessments();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!form.frameworkCode.trim() || !form.changeType.trim() || !form.changeDescription.trim()) {
      setSubmitError('Framework code, change type, and description are required.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await phase6API.analyzeRegulatoryImpact({
        frameworkCode: form.frameworkCode.trim(),
        changeType: form.changeType.trim(),
        changeDescription: form.changeDescription.trim(),
        effectiveDate: form.effectiveDate || undefined,
      });
      setForm({ frameworkCode: '', changeType: '', changeDescription: '', effectiveDate: '' });
      await loadAssessments();
    } catch (err: unknown) {
      setSubmitError(extractErrorMessage(err, 'Failed to analyze regulatory impact.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    setReviewingId(id);
    try {
      await phase6API.reviewRegulatoryImpactAssessment(id, { status });
      await loadAssessments();
    } catch {
      setLoadError('Failed to update review status.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        AI-assisted analysis of how a regulatory or framework change affects your current compliance posture.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900">New Analysis</h3>
        {submitError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>
        )}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ri-framework" className="block text-xs font-medium text-gray-700 mb-1">
              Framework Code
            </label>
            <input
              id="ri-framework"
              type="text"
              value={form.frameworkCode}
              onChange={(e) => setForm({ ...form, frameworkCode: e.target.value })}
              placeholder="e.g., nist_800_53"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ri-change-type" className="block text-xs font-medium text-gray-700 mb-1">
              Change Type
            </label>
            <input
              id="ri-change-type"
              type="text"
              value={form.changeType}
              onChange={(e) => setForm({ ...form, changeType: e.target.value })}
              placeholder="e.g., amendment, new_requirement"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ri-description" className="block text-xs font-medium text-gray-700 mb-1">
              Change Description
            </label>
            <textarea
              id="ri-description"
              value={form.changeDescription}
              onChange={(e) => setForm({ ...form, changeDescription: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ri-effective" className="block text-xs font-medium text-gray-700 mb-1">
              Effective Date (optional)
            </label>
            <input
              id="ri-effective"
              type="date"
              value={form.effectiveDate}
              onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? 'Analyzing…' : 'Analyze Impact'}
        </button>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 rounded-lg bg-gray-100" />
      ) : assessments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
          No data available. Submit a change above to generate the first assessment.
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {assessments.map((a) => (
            <li role="listitem" key={a.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{a.change_title || a.framework_code}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.framework_code} · {a.change_type}
                    {a.created_at ? ` · ${new Date(a.created_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${IMPACT_BADGE[a.impact_level] || 'bg-gray-100 text-gray-700'}`}
                  aria-label={`Impact level: ${a.impact_level}`}
                >
                  {a.impact_level}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Review status: {a.review_status || 'pending'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleReview(a.id, 'approved')}
                  disabled={reviewingId === a.id}
                  className="text-xs font-medium text-green-700 hover:text-green-900 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReview(a.id, 'rejected')}
                  disabled={reviewingId === a.id}
                  className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RemediationPlan {
  id: string;
  plan_name?: string;
  plan_type: string;
  priority_level: string;
  status: string;
  completion_percentage?: number;
  estimated_hours?: number;
  created_at?: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

const REMEDIATION_STATUSES = ['draft', 'approved', 'in_progress', 'completed', 'cancelled'] as const;

function RemediationPlansTab() {
  const [plans, setPlans] = useState<RemediationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, { status: string; completion: number }>>({});
  const [form, setForm] = useState({
    idType: 'controlId' as 'controlId' | 'vulnerabilityId' | 'impactAssessmentId',
    idValue: '',
  });

  const loadPlans = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await phase6API.getRemediationPlans();
      setPlans(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setLoadError('Failed to load remediation plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPlans();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    if (!form.idValue.trim()) {
      setSubmitError('Provide a control, vulnerability, or impact assessment ID.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await phase6API.generateRemediationPlan({ [form.idType]: form.idValue.trim() });
      setForm({ idType: 'controlId', idValue: '' });
      await loadPlans();
    } catch (err: unknown) {
      setSubmitError(extractErrorMessage(err, 'Failed to generate remediation plan.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string) => {
    const draft = statusDrafts[id];
    if (!draft) return;
    setUpdatingId(id);
    try {
      await phase6API.updateRemediationPlanStatus(id, { status: draft.status });
      await loadPlans();
    } catch {
      setLoadError('Failed to update remediation plan status.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        AI-generated remediation plans for a control gap, vulnerability, or regulatory impact assessment.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900">Generate Plan</h3>
        {submitError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>
        )}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="rp-id-type" className="block text-xs font-medium text-gray-700 mb-1">
              Source Type
            </label>
            <select
              id="rp-id-type"
              value={form.idType}
              onChange={(e) => setForm({ ...form, idType: e.target.value as typeof form.idType })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="controlId">Control ID</option>
              <option value="vulnerabilityId">Vulnerability ID</option>
              <option value="impactAssessmentId">Impact Assessment ID</option>
            </select>
          </div>
          <div>
            <label htmlFor="rp-id-value" className="block text-xs font-medium text-gray-700 mb-1">
              ID
            </label>
            <input
              id="rp-id-value"
              type="text"
              value={form.idValue}
              onChange={(e) => setForm({ ...form, idValue: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={submitting}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? 'Generating…' : 'Generate Plan'}
        </button>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 rounded-lg bg-gray-100" />
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
          No data available. Generate a plan above to get started.
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {plans.map((plan) => {
            const draft = statusDrafts[plan.id] || { status: plan.status, completion: plan.completion_percentage || 0 };
            return (
              <li role="listitem" key={plan.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{plan.plan_name || plan.plan_type}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {plan.plan_type.replace('_', ' ')}
                      {plan.estimated_hours ? ` · ~${plan.estimated_hours}h estimated` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${PRIORITY_BADGE[plan.priority_level] || 'bg-gray-100 text-gray-700'}`}
                    aria-label={`Priority: ${plan.priority_level}`}
                  >
                    {plan.priority_level}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <label htmlFor={`rp-status-${plan.id}`} className="text-xs text-gray-500">
                    Status:
                  </label>
                  <select
                    id={`rp-status-${plan.id}`}
                    value={draft.status}
                    onChange={(e) =>
                      setStatusDrafts({ ...statusDrafts, [plan.id]: { ...draft, status: e.target.value } })
                    }
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    {REMEDIATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleStatusUpdate(plan.id)}
                    disabled={updatingId === plan.id}
                    className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-50"
                  >
                    {updatingId === plan.id ? 'Updating…' : 'Update'}
                  </button>
                  <span className="text-xs text-gray-400">
                    {plan.completion_percentage ?? 0}% complete
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AIInsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightsTab>('quick');
  const [states, setStates] = useState<Record<WidgetKey, WidgetState>>({
    gap: { ...initialState },
    forecast: { ...initialState },
    audit: { ...initialState },
    risk: { ...initialState },
  });

  const runWidget = async (widget: WidgetSpec) => {
    setStates(prev => ({ ...prev, [widget.key]: { loading: true, result: null, error: null } }));
    try {
      const res = await widget.run();
      const result = res.data?.data?.result ?? '';
      setStates(prev => ({ ...prev, [widget.key]: { loading: false, result, error: null } }));
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Request failed';
      const responseError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setStates(prev => ({
        ...prev,
        [widget.key]: { loading: false, result: null, error: responseError ?? error },
      }));
    }
  };

  const TABS: { key: InsightsTab; label: string }[] = [
    { key: 'quick', label: 'Quick Analysis' },
    { key: 'risk-score', label: 'Risk Score' },
    { key: 'regulatory-impact', label: 'Regulatory Impact' },
    { key: 'remediation', label: 'Remediation Plans' },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
          <p className="mt-1 text-sm text-gray-600">
            Optional AI-assisted analysis to speed up gap analysis, forecasting, and audit prep. AI is a
            supplement to your compliance work, not a replacement for it.
          </p>
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Generated by AI — review every output before relying on it. Outputs may be incomplete or
            occasionally inaccurate.
          </div>
        </header>

        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'quick' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {WIDGETS.map(widget => {
              const state = states[widget.key];
              return (
                <section
                  key={widget.key}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{widget.title}</h2>
                      <p className="mt-1 text-xs text-gray-600">{widget.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => runWidget(widget)}
                      disabled={state.loading}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {state.loading ? 'Generating…' : state.result ? 'Refresh' : 'Generate'}
                    </button>
                  </div>

                  <div className="mt-4 flex-1 min-h-[120px]">
                    {state.loading && (
                      <div className="text-xs text-gray-500">Running analysis…</div>
                    )}
                    {state.error && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {state.error}
                      </div>
                    )}
                    {state.result && !state.loading && !state.error && (
                      <StructuredOutput
                        content={state.result}
                        feature={widget.feature}
                        showActions={false}
                      />
                    )}
                    {!state.result && !state.loading && !state.error && (
                      <p className="text-xs text-gray-400">
                        Click Generate to run this analysis on your current organization data.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {activeTab === 'risk-score' && <RiskScoreTab />}
        {activeTab === 'regulatory-impact' && <RegulatoryImpactTab />}
        {activeTab === 'remediation' && <RemediationPlansTab />}
      </div>
    </DashboardLayout>
  );
}
