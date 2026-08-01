// @tier: community
'use client';

/**
 * Risk register — the page the README promised for several releases.
 *
 * Shows the 5x5 residual heat map, the register itself, and the four things
 * that quietly rot a register if nobody surfaces them: unassessed risks,
 * overdue reviews, lapsed acceptances, and unowned risks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  risksAPI, departmentsAPI, usersAPI,
  RISK_CATEGORIES, RISK_STATUSES,
  type RiskCategory, type RiskStatus, type TreatmentStrategy, type SeverityBand,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  PageHeader, StatCard, SeverityChip, Pill, EmptyState, LoadingRow,
  ErrorBanner, SuccessBanner, Pagination, humanize, formatDate, severityForScore,
} from '@/components/registers/RegisterUI';

interface RiskRow {
  id: string;
  reference: string | null;
  title: string;
  category: RiskCategory;
  status: RiskStatus;
  inherent_score: number | null;
  residual_score: number | null;
  inherent_severity: SeverityBand | null;
  residual_severity: SeverityBand | null;
  risk_reduction: number | null;
  review_overdue: boolean;
  acceptance_expired: boolean;
  next_review_date: string | null;
  department_name: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  open_treatment_count: number;
  linked_control_count: number;
}

interface HeatMapCell {
  likelihood: number;
  impact: number;
  count: number;
  severity: SeverityBand;
}

interface RiskSummary {
  byStatus: Record<string, number>;
  total: number;
  attention: {
    unassessed: number;
    reviews_overdue: number;
    acceptances_expired: number;
    unowned: number;
  };
  treatments: { open: number; overdue: number };
}

interface DepartmentOption { id: string; name: string }
interface UserOption { id: string; email: string; full_name: string }

interface RiskFormState {
  title: string;
  description: string;
  category: RiskCategory;
  threatSource: string;
  vulnerability: string;
  inherentLikelihood: string;
  inherentImpact: string;
  residualLikelihood: string;
  residualImpact: string;
  treatmentStrategy: string;
  ownerUserId: string;
  departmentId: string;
  nextReviewDate: string;
}

const EMPTY_FORM: RiskFormState = {
  title: '', description: '', category: 'operational',
  threatSource: '', vulnerability: '',
  inherentLikelihood: '', inherentImpact: '',
  residualLikelihood: '', residualImpact: '',
  treatmentStrategy: '', ownerUserId: '', departmentId: '', nextReviewDate: '',
};

const SCALE = [1, 2, 3, 4, 5];
const PAGE_LIMIT = 25;

const HEAT_FILLS: Record<SeverityBand, string> = {
  low: 'bg-green-100 text-green-900',
  medium: 'bg-yellow-100 text-yellow-900',
  high: 'bg-orange-200 text-orange-900',
  critical: 'bg-red-200 text-red-900',
};

/**
 * The matrix is rendered from the band function rather than from the returned
 * cells, so empty cells still show their severity colour — an empty critical
 * corner is information, not a gap.
 */
function HeatMap({ cells }: { cells: HeatMapCell[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    cells.forEach((cell) => map.set(`${cell.likelihood}:${cell.impact}`, cell.count));
    return map;
  }, [cells]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        Residual risk matrix
      </h2>
      <div className="overflow-x-auto">
        <table className="border-collapse" aria-label="Residual risk heat map, likelihood by impact">
          <tbody>
            {[...SCALE].reverse().map((likelihood) => (
              <tr key={likelihood}>
                <th scope="row" className="text-xs text-gray-500 pr-2 text-right font-normal whitespace-nowrap">
                  L{likelihood}
                </th>
                {SCALE.map((impact) => {
                  const severity = severityForScore(likelihood * impact) as SeverityBand;
                  const count = counts.get(`${likelihood}:${impact}`) || 0;
                  return (
                    <td key={impact} className="p-0.5">
                      <div
                        className={`w-14 h-12 flex items-center justify-center rounded text-sm font-semibold ${HEAT_FILLS[severity]}`}
                        aria-label={`Likelihood ${likelihood}, impact ${impact}, ${severity}: ${count} risk${count === 1 ? '' : 's'}`}
                      >
                        {count || ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td />
              {SCALE.map((impact) => (
                <td key={impact} className="text-xs text-gray-500 text-center pt-1">
                  I{impact}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Likelihood (rows) by impact (columns). Open risks only.
      </p>
    </div>
  );
}

export default function RisksPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'risks.write');

  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [heatMapCells, setHeatMapCells] = useState<HeatMapCell[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [reviewOverdueOnly, setReviewOverdueOnly] = useState(false);

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RiskFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [acceptTarget, setAcceptTarget] = useState<RiskRow | null>(null);
  const [acceptRationale, setAcceptRationale] = useState('');
  const [acceptUntil, setAcceptUntil] = useState('');

  const loadRisks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await risksAPI.list({
        page,
        limit: PAGE_LIMIT,
        ...(categoryFilter ? { category: categoryFilter as RiskCategory } : {}),
        ...(statusFilter ? { status: statusFilter as RiskStatus } : {}),
        ...(reviewOverdueOnly ? { reviewOverdue: true } : {}),
      });
      setRisks(Array.isArray(response.data?.data) ? response.data.data : []);
      setTotal(Number(response.data?.pagination?.total) || 0);
    } catch {
      setError('Failed to load the risk register.');
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, statusFilter, reviewOverdueOnly]);

  const loadAggregates = useCallback(async () => {
    try {
      const [summaryRes, heatRes] = await Promise.all([
        risksAPI.summary(),
        risksAPI.heatMap(),
      ]);
      setSummary(summaryRes.data?.data ?? null);
      setHeatMapCells(Array.isArray(heatRes.data?.data?.cells) ? heatRes.data.data.cells : []);
    } catch {
      // Aggregates are supplementary; the register itself still renders.
      setSummary(null);
    }
  }, []);

  useEffect(() => { loadRisks(); }, [loadRisks]);
  useEffect(() => { loadAggregates(); }, [loadAggregates]);

  useEffect(() => {
    (async () => {
      try {
        const [deptRes, userRes] = await Promise.all([
          departmentsAPI.list({ limit: 200 }),
          usersAPI.getOrgUsers(),
        ]);
        setDepartments(Array.isArray(deptRes.data?.data) ? deptRes.data.data : []);
        setOwners(Array.isArray(userRes.data?.data) ? userRes.data.data : []);
      } catch {
        setDepartments([]);
        setOwners([]);
      }
    })();
  }, []);

  const submitRisk = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    setSubmitting(true);
    try {
      await risksAPI.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        threatSource: form.threatSource.trim() || undefined,
        vulnerability: form.vulnerability.trim() || undefined,
        inherentLikelihood: form.inherentLikelihood ? Number(form.inherentLikelihood) : undefined,
        inherentImpact: form.inherentImpact ? Number(form.inherentImpact) : undefined,
        residualLikelihood: form.residualLikelihood ? Number(form.residualLikelihood) : undefined,
        residualImpact: form.residualImpact ? Number(form.residualImpact) : undefined,
        treatmentStrategy: (form.treatmentStrategy || undefined) as TreatmentStrategy | undefined,
        ownerUserId: form.ownerUserId || undefined,
        departmentId: form.departmentId || undefined,
        nextReviewDate: form.nextReviewDate || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Risk added to the register.');
      await Promise.all([loadRisks(), loadAggregates()]);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(detail || 'Failed to create the risk.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAcceptance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!acceptTarget || !acceptRationale.trim()) return;
    try {
      await risksAPI.accept(acceptTarget.id, {
        rationale: acceptRationale.trim(),
        acceptedUntil: acceptUntil || undefined,
      });
      setAcceptTarget(null);
      setAcceptRationale('');
      setAcceptUntil('');
      setMessage('Risk acceptance recorded.');
      await Promise.all([loadRisks(), loadAggregates()]);
    } catch {
      setError('Failed to record the acceptance.');
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Risk register"
        description="Individual risks with inherent and residual assessment, treatment strategy, named acceptance, and review cadence. Follows ISO 31000 and NIST SP 800-30."
        action={canWrite ? (
          <button
            type="button"
            onClick={() => { setShowForm((open) => !open); setFormError(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add risk'}
          </button>
        ) : undefined}
      />

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total risks" value={summary.total} />
          <StatCard label="Unassessed" value={summary.attention.unassessed}
            tone={summary.attention.unassessed > 0 ? 'warn' : 'ok'}
            hint="No residual score" />
          <StatCard label="Reviews overdue" value={summary.attention.reviews_overdue}
            tone={summary.attention.reviews_overdue > 0 ? 'danger' : 'ok'} />
          <StatCard label="Acceptances lapsed" value={summary.attention.acceptances_expired}
            tone={summary.attention.acceptances_expired > 0 ? 'danger' : 'ok'}
            hint="Accepted, past expiry" />
          <StatCard label="Unowned" value={summary.attention.unowned}
            tone={summary.attention.unowned > 0 ? 'warn' : 'ok'} />
          <StatCard label="Treatments overdue" value={summary.treatments.overdue}
            tone={summary.treatments.overdue > 0 ? 'danger' : 'ok'}
            hint={`${summary.treatments.open} open`} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1">
          <HeatMap cells={heatMapCells} />
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Filters</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {RISK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{humanize(c)}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {RISK_STATUSES.map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input
                type="checkbox"
                checked={reviewOverdueOnly}
                onChange={(e) => { setReviewOverdueOnly(e.target.checked); setPage(1); }}
              />
              Review overdue only
            </label>
          </div>
        </div>
      </div>

      {showForm && canWrite ? (
        <form onSubmit={submitRisk} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">New risk</h2>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Title *</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as RiskCategory })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                {RISK_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Treatment strategy</span>
              <select
                value={form.treatmentStrategy}
                onChange={(e) => setForm({ ...form, treatmentStrategy: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Not decided</option>
                <option value="avoid">Avoid</option>
                <option value="mitigate">Mitigate</option>
                <option value="transfer">Transfer</option>
                <option value="accept">Accept</option>
              </select>
            </label>

            <fieldset className="text-sm border border-gray-200 rounded p-3">
              <legend className="px-1 text-gray-700">Inherent (before controls)</legend>
              <div className="flex gap-3">
                <label className="flex-1">
                  <span className="block text-gray-600 text-xs mb-1">Likelihood</span>
                  <select
                    value={form.inherentLikelihood}
                    onChange={(e) => setForm({ ...form, inherentLikelihood: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">—</option>
                    {SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="flex-1">
                  <span className="block text-gray-600 text-xs mb-1">Impact</span>
                  <select
                    value={form.inherentImpact}
                    onChange={(e) => setForm({ ...form, inherentImpact: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">—</option>
                    {SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="text-sm border border-gray-200 rounded p-3">
              <legend className="px-1 text-gray-700">Residual (with controls)</legend>
              <div className="flex gap-3">
                <label className="flex-1">
                  <span className="block text-gray-600 text-xs mb-1">Likelihood</span>
                  <select
                    value={form.residualLikelihood}
                    onChange={(e) => setForm({ ...form, residualLikelihood: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">—</option>
                    {SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="flex-1">
                  <span className="block text-gray-600 text-xs mb-1">Impact</span>
                  <select
                    value={form.residualImpact}
                    onChange={(e) => setForm({ ...form, residualImpact: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">—</option>
                    {SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Owner</span>
              <select
                value={form.ownerUserId}
                onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.full_name || o.email}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Department</span>
              <select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Next review date</span>
              <input
                type="date"
                value={form.nextReviewDate}
                onChange={(e) => setForm({ ...form, nextReviewDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Add risk'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <LoadingRow label="Loading the risk register…" />
        ) : risks.length === 0 ? (
          <EmptyState
            message="No risks match these filters."
            hint={canWrite ? 'Use "Add risk" to record the first one.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inherent</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Residual</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Review</th>
                  {canWrite ? <th scope="col" className="px-4 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {risks.map((risk) => (
                  <tr key={risk.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                      {risk.reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{risk.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {humanize(risk.category)}
                        {risk.department_name ? ` · ${risk.department_name}` : ''}
                        {risk.linked_control_count > 0 ? ` · ${risk.linked_control_count} control${risk.linked_control_count === 1 ? '' : 's'}` : ''}
                        {risk.open_treatment_count > 0 ? ` · ${risk.open_treatment_count} open treatment${risk.open_treatment_count === 1 ? '' : 's'}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={risk.inherent_severity} score={risk.inherent_score} label="Inherent risk" />
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={risk.residual_severity} score={risk.residual_score} label="Residual risk" />
                      {risk.risk_reduction !== null && risk.risk_reduction > 0 ? (
                        <p className="text-xs text-green-700 mt-1">−{risk.risk_reduction} from controls</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={risk.acceptance_expired ? 'danger' : 'neutral'}>
                        {humanize(risk.status)}
                      </Pill>
                      {risk.acceptance_expired ? (
                        <p className="text-xs text-red-700 mt-1">Acceptance lapsed</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {risk.owner_first_name
                        ? `${risk.owner_first_name} ${risk.owner_last_name || ''}`.trim()
                        : <span className="text-yellow-700">Unowned</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={risk.review_overdue ? 'text-red-700 font-medium' : 'text-gray-700'}>
                        {formatDate(risk.next_review_date)}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {risk.status !== 'accepted' ? (
                          <button
                            type="button"
                            onClick={() => { setAcceptTarget(risk); setAcceptRationale(''); setAcceptUntil(''); }}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Accept
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} limit={PAGE_LIMIT} total={total} onChange={setPage} />
      </div>

      {acceptTarget ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submitAcceptance}
            className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Accept {acceptTarget.reference || acceptTarget.title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Acceptance is recorded against your name and today&apos;s date. A rationale is
              required — an acceptance without a stated reason is the finding an assessor
              writes up.
            </p>

            <label className="block mt-4 text-sm">
              <span className="block text-gray-700 mb-1">Rationale *</span>
              <textarea
                value={acceptRationale}
                onChange={(e) => setAcceptRationale(e.target.value)}
                rows={3}
                required
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </label>

            <label className="block mt-3 text-sm">
              <span className="block text-gray-700 mb-1">Accepted until (optional)</span>
              <input
                type="date"
                value={acceptUntil}
                onChange={(e) => setAcceptUntil(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
              />
              <span className="block text-xs text-gray-500 mt-1">
                Past this date the register flags the acceptance as lapsed.
              </span>
            </label>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setAcceptTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!acceptRationale.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Record acceptance
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
