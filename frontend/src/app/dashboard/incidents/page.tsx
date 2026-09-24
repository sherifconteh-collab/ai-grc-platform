// @tier: community
'use client';

/**
 * Incident register — NIST SP 800-61 response lifecycle.
 *
 * The two things this page exists to surface, beyond the list itself: the
 * regulatory notification clock (GDPR Art. 33 gives 72 hours from awareness),
 * and the response duration metrics that come from the phase timestamps.
 */

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  incidentsAPI, departmentsAPI,
  INCIDENT_CATEGORIES, INCIDENT_STATUSES,
  type IncidentCategory, type IncidentStatus, type SeverityBand,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  PageHeader, StatCard, Pill, EmptyState, LoadingRow,
  ErrorBanner, SuccessBanner, Pagination, humanize, formatDate,
} from '@/components/registers/RegisterUI';

interface NotificationState {
  required: boolean;
  notified?: boolean;
  deadline_set?: boolean;
  deadline?: string;
  hours_remaining?: number;
  overdue?: boolean;
  met_deadline?: boolean | null;
  notified_at?: string;
}

interface IncidentMetrics {
  dwell_hours: number | null;
  time_to_triage_hours: number | null;
  time_to_contain_hours: number | null;
  time_to_resolve_hours: number | null;
  time_to_close_hours: number | null;
}

interface IncidentRow {
  id: string;
  reference: string | null;
  title: string;
  category: IncidentCategory;
  severity: SeverityBand;
  status: IncidentStatus;
  detected_at: string;
  is_breach: boolean;
  affected_record_count: number | null;
  department_name: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  metrics: IncidentMetrics;
  notification: NotificationState;
  allowed_next_statuses: IncidentStatus[];
}

interface IncidentCounts {
  total: number;
  open: number;
  open_critical: number;
  breaches: number;
  notifications_overdue: number;
  last_30_days: number;
}

interface IncidentDurations {
  avg_hours_to_triage: string | null;
  avg_hours_to_contain: string | null;
  avg_hours_to_resolve: string | null;
}

interface DepartmentOption { id: string; name: string }

interface IncidentFormState {
  title: string;
  description: string;
  category: IncidentCategory;
  severity: SeverityBand;
  detectionSource: string;
  occurredAt: string;
  departmentId: string;
  isBreach: boolean;
  affectedRecordCount: string;
  regulatoryNotificationRequired: boolean;
  notificationDeadline: string;
}

const EMPTY_FORM: IncidentFormState = {
  title: '', description: '', category: 'security', severity: 'medium',
  detectionSource: '', occurredAt: '', departmentId: '',
  isBreach: false, affectedRecordCount: '',
  regulatoryNotificationRequired: false, notificationDeadline: '',
};

const SEVERITY_TONES: Record<SeverityBand, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  low: 'neutral', medium: 'warn', high: 'danger', critical: 'danger',
};

const PAGE_LIMIT = 25;

/**
 * Renders the notification clock. Overdue is shown as how far past, not as a
 * generic "overdue" — the difference between two hours late and two weeks late
 * matters to whoever has to explain it.
 */
function NotificationClock({ notification }: { notification: NotificationState }) {
  if (!notification?.required) {
    return <span className="text-xs text-gray-500">Not required</span>;
  }
  if (notification.notified) {
    return (
      <Pill tone={notification.met_deadline === false ? 'danger' : 'ok'}>
        {notification.met_deadline === false ? 'Notified late' : 'Notified'}
      </Pill>
    );
  }
  if (!notification.deadline_set) {
    return <Pill tone="warn">Deadline not set</Pill>;
  }
  const hours = notification.hours_remaining ?? 0;
  if (notification.overdue) {
    return <Pill tone="danger">{`${Math.abs(Math.round(hours))}h overdue`}</Pill>;
  }
  return <Pill tone={hours < 24 ? 'warn' : 'info'}>{`${Math.round(hours)}h left`}</Pill>;
}

export default function IncidentsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'incidents.write');

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [counts, setCounts] = useState<IncidentCounts | null>(null);
  const [durations, setDurations] = useState<IncidentDurations | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [breachesOnly, setBreachesOnly] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IncidentFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await incidentsAPI.list({
        page,
        limit: PAGE_LIMIT,
        ...(statusFilter ? { status: statusFilter as IncidentStatus } : {}),
        ...(severityFilter ? { severity: severityFilter as SeverityBand } : {}),
        ...(openOnly ? { openOnly: true } : {}),
        ...(breachesOnly ? { breachesOnly: true } : {}),
      });
      setIncidents(Array.isArray(response.data?.data) ? response.data.data : []);
      setTotal(Number(response.data?.pagination?.total) || 0);
    } catch {
      setError('Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, severityFilter, openOnly, breachesOnly]);

  const loadMetrics = useCallback(async () => {
    try {
      const response = await incidentsAPI.metrics();
      setCounts(response.data?.data?.counts ?? null);
      setDurations(response.data?.data?.durations ?? null);
    } catch {
      setCounts(null);
    }
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);
  useEffect(() => { loadMetrics(); }, [loadMetrics]);

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

  const submitIncident = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    setSubmitting(true);
    try {
      await incidentsAPI.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        severity: form.severity,
        detectionSource: form.detectionSource.trim() || undefined,
        occurredAt: form.occurredAt || undefined,
        departmentId: form.departmentId || undefined,
        isBreach: form.isBreach,
        affectedRecordCount: form.affectedRecordCount
          ? Number(form.affectedRecordCount) : undefined,
        regulatoryNotificationRequired: form.regulatoryNotificationRequired,
        notificationDeadline: form.notificationDeadline || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Incident reported.');
      await Promise.all([loadIncidents(), loadMetrics()]);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(detail || 'Failed to report the incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const advanceStatus = async (incident: IncidentRow, status: IncidentStatus) => {
    setBusyId(incident.id);
    setError('');
    try {
      await incidentsAPI.changeStatus(incident.id, { status });
      setMessage(`${incident.reference || 'Incident'} moved to ${humanize(status).toLowerCase()}.`);
      await Promise.all([loadIncidents(), loadMetrics()]);
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(detail || 'Failed to change the incident status.');
    } finally {
      setBusyId(null);
    }
  };

  const recordNotification = async (incident: IncidentRow) => {
    setBusyId(incident.id);
    try {
      await incidentsAPI.recordNotification(incident.id, { audience: 'regulator' });
      setMessage('Regulator notification recorded.');
      await Promise.all([loadIncidents(), loadMetrics()]);
    } catch {
      setError('Failed to record the notification.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Incidents"
        description="Incident response following the NIST SP 800-61 phases, with per-phase timestamps, the regulatory notification clock, and links to the risks and controls involved."
        action={canWrite ? (
          <button
            type="button"
            onClick={() => { setShowForm((open) => !open); setFormError(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Report incident'}
          </button>
        ) : undefined}
      />

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      {counts ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Open" value={counts.open} tone={counts.open > 0 ? 'warn' : 'ok'} />
          <StatCard label="Open critical" value={counts.open_critical}
            tone={counts.open_critical > 0 ? 'danger' : 'ok'} />
          <StatCard label="Notifications overdue" value={counts.notifications_overdue}
            tone={counts.notifications_overdue > 0 ? 'danger' : 'ok'} />
          <StatCard label="Breaches" value={counts.breaches} />
          <StatCard label="Last 30 days" value={counts.last_30_days} />
          <StatCard
            label="Avg hours to contain"
            value={durations?.avg_hours_to_contain ?? '—'}
            hint="Closed incidents only"
          />
        </div>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Severity</span>
            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {(['low', 'medium', 'high', 'critical'] as SeverityBand[]).map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={openOnly}
              onChange={(e) => { setOpenOnly(e.target.checked); setPage(1); }} />
            Open only
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={breachesOnly}
              onChange={(e) => { setBreachesOnly(e.target.checked); setPage(1); }} />
            Breaches only
          </label>
        </div>
      </div>

      {showForm && canWrite ? (
        <form onSubmit={submitIncident} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Report an incident</h2>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Title *</span>
              <input value={form.title} required
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">What happened</span>
              <textarea value={form.description} rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Category</span>
              <select value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as IncidentCategory })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {INCIDENT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Severity</span>
              <select value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as SeverityBand })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {(['low', 'medium', 'high', 'critical'] as SeverityBand[]).map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">How was it detected</span>
              <input value={form.detectionSource}
                onChange={(e) => setForm({ ...form, detectionSource: e.target.value })}
                placeholder="SIEM rule, user report, third party…"
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">When it occurred</span>
              <input type="datetime-local" value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
              <span className="block text-xs text-gray-500 mt-1">
                Detection time is now; the gap between them is dwell time.
              </span>
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

            <fieldset className="text-sm border border-gray-200 rounded p-3 md:col-span-2">
              <legend className="px-1 text-gray-700">Breach and notification</legend>
              <div className="flex flex-wrap gap-4 items-end">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isBreach}
                    onChange={(e) => setForm({ ...form, isBreach: e.target.checked })} />
                  This is a data breach
                </label>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.regulatoryNotificationRequired}
                    onChange={(e) => setForm({
                      ...form, regulatoryNotificationRequired: e.target.checked
                    })} />
                  Regulatory notification required
                </label>

                <label>
                  <span className="block text-gray-600 text-xs mb-1">Records affected</span>
                  <input type="number" min={0} value={form.affectedRecordCount}
                    onChange={(e) => setForm({ ...form, affectedRecordCount: e.target.value })}
                    className="border border-gray-300 rounded px-3 py-2 w-32" />
                </label>

                <label>
                  <span className="block text-gray-600 text-xs mb-1">Notification deadline</span>
                  <input type="datetime-local" value={form.notificationDeadline}
                    onChange={(e) => setForm({ ...form, notificationDeadline: e.target.value })}
                    className="border border-gray-300 rounded px-3 py-2" />
                </label>
              </div>
            </fieldset>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Reporting…' : 'Report incident'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <LoadingRow label="Loading incidents…" />
        ) : incidents.length === 0 ? (
          <EmptyState message="No incidents match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Incident</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detected</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notification</th>
                  {canWrite ? <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Advance</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {incidents.map((incident) => (
                  <tr key={incident.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                      {incident.reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{incident.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {humanize(incident.category)}
                        {incident.department_name ? ` · ${incident.department_name}` : ''}
                        {incident.is_breach ? ' · Breach' : ''}
                        {incident.affected_record_count
                          ? ` · ${incident.affected_record_count} records` : ''}
                        {incident.metrics?.dwell_hours !== null
                          && incident.metrics?.dwell_hours !== undefined
                          ? ` · ${incident.metrics.dwell_hours}h dwell` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={SEVERITY_TONES[incident.severity]}>{humanize(incident.severity)}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={
                        incident.status === 'closed' ? 'ok'
                          : incident.status === 'false_positive' ? 'neutral' : 'info'
                      }>
                        {humanize(incident.status)}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatDate(incident.detected_at)}
                    </td>
                    <td className="px-4 py-3">
                      <NotificationClock notification={incident.notification} />
                      {canWrite && incident.notification?.required && !incident.notification?.notified ? (
                        <button
                          type="button"
                          onClick={() => recordNotification(incident)}
                          disabled={busyId === incident.id}
                          className="block mt-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          Record notification
                        </button>
                      ) : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`advance-${incident.id}`}>
                          Advance {incident.reference || incident.title}
                        </label>
                        <select
                          id={`advance-${incident.id}`}
                          value=""
                          disabled={busyId === incident.id || incident.allowed_next_statuses?.length === 0}
                          onChange={(e) => {
                            if (e.target.value) advanceStatus(incident, e.target.value as IncidentStatus);
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50"
                        >
                          <option value="">Move to…</option>
                          {(incident.allowed_next_statuses || []).map((s) => (
                            <option key={s} value={s}>{humanize(s)}</option>
                          ))}
                        </select>
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
    </DashboardLayout>
  );
}
