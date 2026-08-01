// @tier: community
'use client';

/**
 * Indicators (KRI / KPI / KCI).
 *
 * The threshold form carries the one thing users get wrong: direction. The
 * helper text under it changes with the selection so it is obvious whether a
 * high number is good or bad for this indicator before the thresholds are set.
 */

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  indicatorsAPI, departmentsAPI, risksAPI,
  type IndicatorType, type IndicatorDirection, type BreachLevel,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  PageHeader, StatCard, BreachChip, Pill, EmptyState, LoadingRow,
  ErrorBanner, SuccessBanner, Pagination, humanize, formatDate,
} from '@/components/registers/RegisterUI';

interface IndicatorRow {
  id: string;
  reference: string | null;
  name: string;
  description: string | null;
  indicator_type: IndicatorType;
  unit: string | null;
  target_value: string | null;
  amber_threshold: string | null;
  red_threshold: string | null;
  direction: IndicatorDirection;
  measurement_frequency: string;
  latest_value: string | null;
  latest_measured_at: string | null;
  latest_breach_level: BreachLevel | null;
  measurement_overdue: boolean;
  is_active: boolean;
  department_name: string | null;
  risk_reference: string | null;
  objective_reference: string | null;
}

interface IndicatorSummary {
  total: number;
  active: number;
  red: number;
  amber: number;
  green: number;
  never_measured: number;
}

interface DepartmentOption { id: string; name: string }
interface RiskOption { id: string; reference: string | null; title: string }

interface IndicatorFormState {
  name: string;
  description: string;
  indicatorType: IndicatorType;
  unit: string;
  direction: IndicatorDirection;
  targetValue: string;
  amberThreshold: string;
  redThreshold: string;
  measurementFrequency: string;
  departmentId: string;
  riskId: string;
  dataSource: string;
}

const EMPTY_FORM: IndicatorFormState = {
  name: '', description: '', indicatorType: 'kri', unit: '',
  direction: 'lower_is_better', targetValue: '', amberThreshold: '', redThreshold: '',
  measurementFrequency: 'monthly', departmentId: '', riskId: '', dataSource: '',
};

const TYPE_LABELS: Record<IndicatorType, string> = {
  kri: 'KRI — is this risk getting more likely?',
  kpi: 'KPI — are we achieving the objective?',
  kci: 'KCI — is this control still operating?',
};

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'ad_hoc'];
const PAGE_LIMIT = 25;

export default function IndicatorsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'indicators.write');

  const [indicators, setIndicators] = useState<IndicatorRow[]>([]);
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [risks, setRisks] = useState<RiskOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [typeFilter, setTypeFilter] = useState('');
  const [breachFilter, setBreachFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IndicatorFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [measureTarget, setMeasureTarget] = useState<IndicatorRow | null>(null);
  const [measureValue, setMeasureValue] = useState('');
  const [measureNotes, setMeasureNotes] = useState('');

  const loadIndicators = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await indicatorsAPI.list({
        page,
        limit: PAGE_LIMIT,
        ...(typeFilter ? { indicatorType: typeFilter as IndicatorType } : {}),
        ...(breachFilter ? { breachLevel: breachFilter as BreachLevel } : {}),
      });
      setIndicators(Array.isArray(response.data?.data) ? response.data.data : []);
      setTotal(Number(response.data?.pagination?.total) || 0);
    } catch {
      setError('Failed to load indicators.');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, breachFilter]);

  const loadSummary = useCallback(async () => {
    try {
      const response = await indicatorsAPI.summary();
      setSummary(response.data?.data ?? null);
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => { loadIndicators(); }, [loadIndicators]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    (async () => {
      try {
        const [deptRes, riskRes] = await Promise.all([
          departmentsAPI.list({ limit: 200 }),
          risksAPI.list({ limit: 200 }),
        ]);
        setDepartments(Array.isArray(deptRes.data?.data) ? deptRes.data.data : []);
        setRisks(Array.isArray(riskRes.data?.data) ? riskRes.data.data : []);
      } catch {
        setDepartments([]);
        setRisks([]);
      }
    })();
  }, []);

  const submitIndicator = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await indicatorsAPI.create({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        indicatorType: form.indicatorType,
        unit: form.unit.trim() || undefined,
        direction: form.direction,
        targetValue: form.targetValue ? Number(form.targetValue) : undefined,
        amberThreshold: form.amberThreshold ? Number(form.amberThreshold) : undefined,
        redThreshold: form.redThreshold ? Number(form.redThreshold) : undefined,
        measurementFrequency: form.measurementFrequency,
        departmentId: form.departmentId || undefined,
        riskId: form.riskId || undefined,
        dataSource: form.dataSource.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Indicator created.');
      await Promise.all([loadIndicators(), loadSummary()]);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(detail || 'Failed to create the indicator.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMeasurement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!measureTarget || measureValue === '') return;
    try {
      const response = await indicatorsAPI.recordMeasurement(measureTarget.id, {
        value: Number(measureValue),
        notes: measureNotes.trim() || undefined,
      });
      const level = response.data?.data?.breach_level;
      setMeasureTarget(null);
      setMeasureValue('');
      setMeasureNotes('');
      setMessage(
        level && level !== 'green'
          ? `Measurement recorded — this reading is ${level}.`
          : 'Measurement recorded.'
      );
      await Promise.all([loadIndicators(), loadSummary()]);
    } catch {
      setError('Failed to record the measurement.');
    }
  };

  const directionHint = form.direction === 'higher_is_better'
    ? 'Higher values are better. A reading at or below the red threshold is a breach, so red must sit at or below amber.'
    : 'Lower values are better. A reading at or above the red threshold is a breach, so red must sit at or above amber.';

  return (
    <DashboardLayout>
      <PageHeader
        title="Indicators"
        description="Key risk, performance and control indicators with amber and red thresholds. A register assessed once a quarter is a snapshot; indicators are the moving part that says the assessment is going stale."
        action={canWrite ? (
          <button
            type="button"
            onClick={() => { setShowForm((open) => !open); setFormError(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add indicator'}
          </button>
        ) : undefined}
      />

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="Active" value={summary.active} />
          <StatCard label="Red" value={summary.red} tone={summary.red > 0 ? 'danger' : 'ok'} />
          <StatCard label="Amber" value={summary.amber} tone={summary.amber > 0 ? 'warn' : 'ok'} />
          <StatCard label="Green" value={summary.green} tone="ok" />
          <StatCard label="Never measured" value={summary.never_measured}
            tone={summary.never_measured > 0 ? 'warn' : 'ok'}
            hint="Looks fine, says nothing" />
        </div>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Type</span>
            <select value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">All</option>
              <option value="kri">KRI</option>
              <option value="kpi">KPI</option>
              <option value="kci">KCI</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Status</span>
            <select value={breachFilter}
              onChange={(e) => { setBreachFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">All</option>
              <option value="red">Red</option>
              <option value="amber">Amber</option>
              <option value="green">Green</option>
            </select>
          </label>
        </div>
      </div>

      {showForm && canWrite ? (
        <form onSubmit={submitIndicator} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">New indicator</h2>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Name *</span>
              <input value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Type</span>
              <select value={form.indicatorType}
                onChange={(e) => setForm({ ...form, indicatorType: e.target.value as IndicatorType })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {(Object.keys(TYPE_LABELS) as IndicatorType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Unit</span>
              <input value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="attempts, %, days…"
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Direction</span>
              <select value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as IndicatorDirection })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="lower_is_better">Lower is better</option>
                <option value="higher_is_better">Higher is better</option>
              </select>
              <span className="block text-xs text-gray-500 mt-1">{directionHint}</span>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Target</span>
              <input type="number" step="any" value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Measurement frequency</span>
              <select value={form.measurementFrequency}
                onChange={(e) => setForm({ ...form, measurementFrequency: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {FREQUENCIES.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Amber threshold</span>
              <input type="number" step="any" value={form.amberThreshold}
                onChange={(e) => setForm({ ...form, amberThreshold: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Red threshold</span>
              <input type="number" step="any" value={form.redThreshold}
                onChange={(e) => setForm({ ...form, redThreshold: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Watches risk</span>
              <select value={form.riskId}
                onChange={(e) => setForm({ ...form, riskId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">None</option>
                {risks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference ? `${r.reference} — ` : ''}{r.title}
                  </option>
                ))}
              </select>
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
              <span className="block text-gray-700 mb-1">Data source</span>
              <input value={form.dataSource}
                onChange={(e) => setForm({ ...form, dataSource: e.target.value })}
                placeholder="Where the reading comes from"
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Add indicator'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <LoadingRow label="Loading indicators…" />
        ) : indicators.length === 0 ? (
          <EmptyState message="No indicators match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Indicator</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latest</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thresholds</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Measured</th>
                  {canWrite ? <th scope="col" className="px-4 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {indicators.map((indicator) => (
                  <tr key={indicator.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{indicator.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {indicator.risk_reference ? `Watches ${indicator.risk_reference}` : ''}
                        {indicator.objective_reference ? ` · ${indicator.objective_reference}` : ''}
                        {indicator.department_name ? ` · ${indicator.department_name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Pill>{indicator.indicator_type.toUpperCase()}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {indicator.latest_value ?? '—'}
                          {indicator.unit && indicator.latest_value ? ` ${indicator.unit}` : ''}
                        </span>
                        <BreachChip level={indicator.latest_breach_level} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <p>Amber {indicator.amber_threshold ?? '—'} · Red {indicator.red_threshold ?? '—'}</p>
                      <p className="text-gray-500">
                        {indicator.direction === 'higher_is_better' ? 'Higher is better' : 'Lower is better'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={indicator.measurement_overdue ? 'text-yellow-700 font-medium' : 'text-gray-700'}>
                        {formatDate(indicator.latest_measured_at)}
                      </span>
                      {indicator.measurement_overdue ? (
                        <p className="text-xs text-yellow-700">Reading overdue</p>
                      ) : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => { setMeasureTarget(indicator); setMeasureValue(''); setMeasureNotes(''); }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Record reading
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

      {measureTarget ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={submitMeasurement} className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h2 className="text-lg font-semibold text-gray-900">{measureTarget.name}</h2>
            <p className="mt-1 text-sm text-gray-600">
              Amber at {measureTarget.amber_threshold ?? '—'}, red at{' '}
              {measureTarget.red_threshold ?? '—'} —{' '}
              {measureTarget.direction === 'higher_is_better' ? 'higher is better' : 'lower is better'}.
            </p>

            <label className="block mt-4 text-sm">
              <span className="block text-gray-700 mb-1">
                Value {measureTarget.unit ? `(${measureTarget.unit})` : ''} *
              </span>
              <input type="number" step="any" required value={measureValue}
                onChange={(e) => setMeasureValue(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="block mt-3 text-sm">
              <span className="block text-gray-700 mb-1">Notes</span>
              <textarea value={measureNotes} rows={2}
                onChange={(e) => setMeasureNotes(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <div className="mt-5 flex gap-3 justify-end">
              <button type="button" onClick={() => setMeasureTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded">
                Cancel
              </button>
              <button type="submit" disabled={measureValue === ''}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
                Record
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
