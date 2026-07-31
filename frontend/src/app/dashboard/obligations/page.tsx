// @tier: community
'use client';

/**
 * Compliance obligations register.
 *
 * Frameworks say what good practice is; obligations say what the organization
 * is actually bound to, by whom, and by when. The distinction that makes the
 * page worth opening: obligations expire, and the overdue list is the point.
 */

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  obligationsAPI, departmentsAPI,
  OBLIGATION_SOURCE_TYPES,
  type ObligationSourceType, type ComplianceStatus,
  type AttestationOutcome, type SeverityBand,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  PageHeader, StatCard, Pill, EmptyState, LoadingRow,
  ErrorBanner, SuccessBanner, Pagination, humanize, formatDate,
} from '@/components/registers/RegisterUI';

interface ObligationRow {
  id: string;
  reference: string | null;
  title: string;
  source_type: ObligationSourceType;
  source_name: string | null;
  citation: string | null;
  jurisdiction: string | null;
  criticality: SeverityBand;
  status: string;
  compliance_status: ComplianceStatus;
  frequency: string | null;
  next_due_date: string | null;
  last_attested_at: string | null;
  days_until_due: number | null;
  overdue: boolean;
  due_soon: boolean;
  department_name: string | null;
  linked_control_count: number;
}

interface ObligationSummary {
  total: number;
  active: number;
  non_compliant: number;
  not_assessed: number;
  overdue: number;
  due_soon: number;
  critical_active: number;
}

interface DepartmentOption { id: string; name: string }

interface ObligationFormState {
  title: string;
  description: string;
  sourceType: ObligationSourceType;
  sourceName: string;
  citation: string;
  jurisdiction: string;
  criticality: SeverityBand;
  frequency: string;
  effectiveDate: string;
  departmentId: string;
  penaltyDescription: string;
}

const EMPTY_FORM: ObligationFormState = {
  title: '', description: '', sourceType: 'regulation', sourceName: '',
  citation: '', jurisdiction: '', criticality: 'medium', frequency: '',
  effectiveDate: '', departmentId: '', penaltyDescription: '',
};

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial'];

const COMPLIANCE_TONES: Record<ComplianceStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  compliant: 'ok',
  partially_compliant: 'warn',
  non_compliant: 'danger',
  not_assessed: 'neutral',
  not_applicable: 'neutral',
};

const ATTESTATION_OUTCOMES: AttestationOutcome[] =
  ['met', 'partially_met', 'not_met', 'not_applicable', 'waived'];

const PAGE_LIMIT = 25;

export default function ObligationsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'obligations.write');

  const [obligations, setObligations] = useState<ObligationRow[]>([]);
  const [summary, setSummary] = useState<ObligationSummary | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [sourceFilter, setSourceFilter] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ObligationFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [attestTarget, setAttestTarget] = useState<ObligationRow | null>(null);
  const [attestOutcome, setAttestOutcome] = useState<AttestationOutcome>('met');
  const [attestNotes, setAttestNotes] = useState('');

  const loadObligations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await obligationsAPI.list({
        page,
        limit: PAGE_LIMIT,
        ...(sourceFilter ? { sourceType: sourceFilter as ObligationSourceType } : {}),
        ...(complianceFilter ? { complianceStatus: complianceFilter as ComplianceStatus } : {}),
        ...(overdueOnly ? { overdueOnly: true } : {}),
      });
      setObligations(Array.isArray(response.data?.data) ? response.data.data : []);
      setTotal(Number(response.data?.pagination?.total) || 0);
    } catch {
      setError('Failed to load the obligations register.');
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter, complianceFilter, overdueOnly]);

  const loadSummary = useCallback(async () => {
    try {
      const response = await obligationsAPI.summary();
      setSummary(response.data?.data ?? null);
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => { loadObligations(); }, [loadObligations]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    (async () => {
      try {
        const response = await departmentsAPI.list({ limit: 200 });
        setDepartments(Array.isArray(response.data?.data) ? response.data.data : []);
      } catch {
        setDepartments([]);
      }
    })();
  }, []);

  const submitObligation = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    setSubmitting(true);
    try {
      await obligationsAPI.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        sourceType: form.sourceType,
        sourceName: form.sourceName.trim() || undefined,
        citation: form.citation.trim() || undefined,
        jurisdiction: form.jurisdiction.trim() || undefined,
        criticality: form.criticality,
        frequency: form.frequency || undefined,
        effectiveDate: form.effectiveDate || undefined,
        departmentId: form.departmentId || undefined,
        penaltyDescription: form.penaltyDescription.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Obligation added to the register.');
      await Promise.all([loadObligations(), loadSummary()]);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(detail || 'Failed to create the obligation.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAttestation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!attestTarget) return;
    try {
      await obligationsAPI.attest(attestTarget.id, {
        outcome: attestOutcome,
        notes: attestNotes.trim() || undefined,
      });
      setAttestTarget(null);
      setAttestNotes('');
      setAttestOutcome('met');
      setMessage('Attestation recorded and the due date rolled forward.');
      await Promise.all([loadObligations(), loadSummary()]);
    } catch {
      setError('Failed to record the attestation.');
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Compliance obligations"
        description="What the organization is bound to — statute, contract, licence condition, customer commitment — with the recurring deadlines and per-period attestation history an auditor samples."
        action={canWrite ? (
          <button
            type="button"
            onClick={() => { setShowForm((open) => !open); setFormError(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add obligation'}
          </button>
        ) : undefined}
      />

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Active" value={summary.active} />
          <StatCard label="Overdue" value={summary.overdue}
            tone={summary.overdue > 0 ? 'danger' : 'ok'} />
          <StatCard label="Due within 30 days" value={summary.due_soon}
            tone={summary.due_soon > 0 ? 'warn' : 'ok'} />
          <StatCard label="Non-compliant" value={summary.non_compliant}
            tone={summary.non_compliant > 0 ? 'danger' : 'ok'} />
          <StatCard label="Not assessed" value={summary.not_assessed}
            tone={summary.not_assessed > 0 ? 'warn' : 'ok'} />
          <StatCard label="Critical" value={summary.critical_active} />
        </div>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Source</span>
            <select value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">All</option>
              {OBLIGATION_SOURCE_TYPES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Compliance</span>
            <select value={complianceFilter}
              onChange={(e) => { setComplianceFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">All</option>
              {(Object.keys(COMPLIANCE_TONES) as ComplianceStatus[]).map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={overdueOnly}
              onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }} />
            Overdue only
          </label>
        </div>
      </div>

      {showForm && canWrite ? (
        <form onSubmit={submitObligation} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">New obligation</h2>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Title *</span>
              <input value={form.title} required
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">What is required</span>
              <textarea value={form.description} rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Source type</span>
              <select value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value as ObligationSourceType })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {OBLIGATION_SOURCE_TYPES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Source name</span>
              <input value={form.sourceName}
                onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                placeholder="GDPR, Enterprise MSA, ISO 27001…"
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Citation</span>
              <input value={form.citation}
                onChange={(e) => setForm({ ...form, citation: e.target.value })}
                placeholder="Art. 33, Schedule 3 s.4…"
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Jurisdiction</span>
              <input value={form.jurisdiction}
                onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Criticality</span>
              <select value={form.criticality}
                onChange={(e) => setForm({ ...form, criticality: e.target.value as SeverityBand })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {(['low', 'medium', 'high', 'critical'] as SeverityBand[]).map((c) => (
                  <option key={c} value={c}>{humanize(c)}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Frequency</span>
              <select value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">One-off</option>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
              </select>
              <span className="block text-xs text-gray-500 mt-1">
                A recurring obligation gets its first due date derived from this.
              </span>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Effective date</span>
              <input type="date" value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Department</span>
              <select value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Penalty for non-compliance</span>
              <input value={form.penaltyDescription}
                onChange={(e) => setForm({ ...form, penaltyDescription: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Add obligation'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <LoadingRow label="Loading obligations…" />
        ) : obligations.length === 0 ? (
          <EmptyState message="No obligations match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obligation</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Compliance</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next due</th>
                  {canWrite ? <th scope="col" className="px-4 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {obligations.map((obligation) => (
                  <tr key={obligation.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                      {obligation.reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{obligation.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {humanize(obligation.criticality)}
                        {obligation.frequency ? ` · ${humanize(obligation.frequency)}` : ' · One-off'}
                        {obligation.department_name ? ` · ${obligation.department_name}` : ''}
                        {obligation.linked_control_count > 0
                          ? ` · ${obligation.linked_control_count} control${obligation.linked_control_count === 1 ? '' : 's'}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-800">{obligation.source_name || humanize(obligation.source_type)}</p>
                      <p className="text-xs text-gray-500">
                        {obligation.citation || ''}
                        {obligation.jurisdiction ? ` · ${obligation.jurisdiction}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={COMPLIANCE_TONES[obligation.compliance_status]}>
                        {humanize(obligation.compliance_status)}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={
                        obligation.overdue ? 'text-red-700 font-medium'
                          : obligation.due_soon ? 'text-yellow-700' : 'text-gray-700'
                      }>
                        {formatDate(obligation.next_due_date)}
                      </span>
                      {obligation.days_until_due !== null ? (
                        <p className="text-xs text-gray-500">
                          {obligation.overdue
                            ? `${Math.abs(obligation.days_until_due)}d overdue`
                            : `${obligation.days_until_due}d`}
                        </p>
                      ) : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => { setAttestTarget(obligation); setAttestOutcome('met'); setAttestNotes(''); }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Attest
                        </button>
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

      {attestTarget ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitAttestation} className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Attest {attestTarget.reference || attestTarget.title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Recorded against your name for the period ending{' '}
              {formatDate(attestTarget.next_due_date)}. The next due date rolls forward
              from that date, not from today.
            </p>

            <label className="block mt-4 text-sm">
              <span className="block text-gray-700 mb-1">Outcome</span>
              <select value={attestOutcome}
                onChange={(e) => setAttestOutcome(e.target.value as AttestationOutcome)}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {ATTESTATION_OUTCOMES.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
              </select>
              {attestOutcome === 'waived' ? (
                <span className="block text-xs text-gray-500 mt-1">
                  A waiver sets the requirement aside for this period. It does not
                  change the recorded compliance status either way.
                </span>
              ) : null}
            </label>

            <label className="block mt-3 text-sm">
              <span className="block text-gray-700 mb-1">Notes</span>
              <textarea value={attestNotes} rows={3}
                onChange={(e) => setAttestNotes(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <div className="mt-5 flex gap-3 justify-end">
              <button type="button" onClick={() => setAttestTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded">
                Cancel
              </button>
              <button type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700">
                Record attestation
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
