// @tier: pro
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { reportsAPI, benchmarksAPI, scheduledReportsAPI, ScheduledReportInput } from '@/lib/api';

type ReportType = 'compliance-pdf' | 'compliance-excel' | 'ssp-pdf' | 'ssp-json';
type ReportsTab = 'ondemand' | 'scheduled';

interface ScheduledReport {
  id: string;
  name: string;
  report_type: ScheduledReportInput['report_type'];
  schedule: ScheduledReportInput['schedule'];
  format: ScheduledReportInput['format'];
  recipients: string[];
  filters?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

const REPORT_TYPE_OPTIONS: { value: ScheduledReportInput['report_type']; label: string }[] = [
  { value: 'compliance_summary', label: 'Compliance Summary' },
  { value: 'framework_gap', label: 'Framework Gap' },
  { value: 'evidence_status', label: 'Evidence Status' },
  { value: 'audit_trail', label: 'Audit Trail' },
  { value: 'executive', label: 'Executive' },
];

const SCHEDULE_OPTIONS: { value: ScheduledReportInput['schedule']; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const FORMAT_OPTIONS: { value: NonNullable<ScheduledReportInput['format']>; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
];

interface ScheduleFormState {
  name: string;
  report_type: ScheduledReportInput['report_type'];
  schedule: ScheduledReportInput['schedule'];
  format: NonNullable<ScheduledReportInput['format']>;
  recipients: string;
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  name: '',
  report_type: 'compliance_summary',
  schedule: 'weekly',
  format: 'pdf',
  recipients: '',
};

function ScheduledReportsPanel() {
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const loadSchedules = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await scheduledReportsAPI.getAll();
      const data = Array.isArray(response.data?.data) ? response.data.data : [];
      setSchedules(data);
    } catch {
      setLoadError('Failed to load scheduled reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSchedules();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_SCHEDULE_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (schedule: ScheduledReport) => {
    setEditingId(schedule.id);
    setForm({
      name: schedule.name,
      report_type: schedule.report_type,
      schedule: schedule.schedule,
      format: schedule.format || 'pdf',
      recipients: Array.isArray(schedule.recipients) ? schedule.recipients.join(', ') : '',
    });
    setFormError('');
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    const recipients = form.recipients
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);

    setSubmitting(true);
    setFormError('');
    try {
      const payload: ScheduledReportInput = {
        name: form.name.trim(),
        report_type: form.report_type,
        schedule: form.schedule,
        format: form.format,
        recipients,
      };
      if (editingId) {
        await scheduledReportsAPI.update(editingId, payload);
      } else {
        await scheduledReportsAPI.create(payload);
      }
      setShowForm(false);
      await loadSchedules();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setFormError(error.response?.data?.error || 'Failed to save scheduled report.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      await scheduledReportsAPI.remove(id);
      await loadSchedules();
    } catch {
      setNotice('Failed to delete scheduled report.');
    }
  };

  const runNow = async (id: string) => {
    setRunningId(id);
    setNotice('');
    try {
      await scheduledReportsAPI.runNow(id);
      setNotice('Report queued — delivery depends on the background job worker.');
    } catch {
      setNotice('Failed to queue the report run.');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-600">
          Schedule recurring report delivery to stakeholders. Actual delivery depends on the background
          job worker being enabled for this deployment.
        </p>
        <button
          onClick={openCreateForm}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          New Schedule
        </button>
      </div>

      {notice && (
        <div className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-3 rounded text-sm">
          {notice}
        </div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{loadError}</div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 rounded-lg bg-gray-100" />
      ) : schedules.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-500">
          No scheduled reports yet. Create one to automate recurring delivery.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Cadence</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{schedule.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {REPORT_TYPE_OPTIONS.find((o) => o.value === schedule.report_type)?.label ||
                      schedule.report_type}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{schedule.schedule}</td>
                  <td className="px-4 py-3 text-gray-600 uppercase">{schedule.format}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {Array.isArray(schedule.recipients) ? schedule.recipients.length : 0}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        schedule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                      }`}
                      aria-label={`Schedule status: ${schedule.is_active ? 'active' : 'inactive'}`}
                    >
                      {schedule.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => runNow(schedule.id)}
                        disabled={runningId === schedule.id}
                        className="text-purple-600 hover:text-purple-800 text-xs font-medium disabled:opacity-50"
                      >
                        {runningId === schedule.id ? 'Queuing...' : 'Run Now'}
                      </button>
                      <button
                        onClick={() => openEditForm(schedule)}
                        className="text-gray-600 hover:text-gray-900 text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Schedule' : 'New Schedule'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {formError}
              </div>
            )}

            <div>
              <label htmlFor="schedule-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                id="schedule-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="schedule-report-type" className="block text-sm font-medium text-gray-700 mb-1">
                Report Type
              </label>
              <select
                id="schedule-report-type"
                value={form.report_type}
                onChange={(e) =>
                  setForm({ ...form, report_type: e.target.value as ScheduledReportInput['report_type'] })
                }
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {REPORT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="schedule-cadence" className="block text-sm font-medium text-gray-700 mb-1">
                Schedule
              </label>
              <select
                id="schedule-cadence"
                value={form.schedule}
                onChange={(e) =>
                  setForm({ ...form, schedule: e.target.value as ScheduledReportInput['schedule'] })
                }
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {SCHEDULE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="schedule-format" className="block text-sm font-medium text-gray-700 mb-1">
                Format
              </label>
              <select
                id="schedule-format"
                value={form.format}
                onChange={(e) =>
                  setForm({
                    ...form,
                    format: e.target.value as NonNullable<ScheduledReportInput['format']>,
                  })
                }
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="schedule-recipients" className="block text-sm font-medium text-gray-700 mb-1">
                Recipients (comma-separated emails)
              </label>
              <input
                id="schedule-recipients"
                type="text"
                value={form.recipients}
                onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                placeholder="alice@example.com, bob@example.com"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={submitForm}
                disabled={submitting}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FrameworkBenchmarkInsufficient {
  framework_id: string;
  framework_name: string;
  own_pct: number;
  insufficient_data: true;
  minimum_participants: number;
}

interface FrameworkBenchmarkComparison {
  framework_id: string;
  framework_name: string;
  own_pct: number;
  insufficient_data?: false;
  participants: number;
  average_pct: number;
  median_pct: number;
  percentile_rank: number;
}

type FrameworkBenchmark = FrameworkBenchmarkInsufficient | FrameworkBenchmarkComparison;

function BenchmarkBar({ label, pct, highlight }: { label: string; pct: number; highlight?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className={highlight ? 'font-semibold text-gray-900' : ''}>{label}</span>
        <span className={highlight ? 'font-semibold text-gray-900' : ''}>{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2" aria-label={`${label} compliance ${pct.toFixed(0)} percent`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={highlight ? 'bg-blue-600 h-2 rounded-full' : 'bg-slate-400 h-2 rounded-full'}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function IndustryBenchmarkPanel() {
  const [benchmarks, setBenchmarks] = useState<FrameworkBenchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const response = await benchmarksAPI.getFrameworkBenchmarks();
        const data = Array.isArray(response.data?.data) ? response.data.data : [];
        if (!cancelled) setBenchmarks(data);
      } catch {
        if (!cancelled) setLoadError('Failed to load industry benchmark data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900">Industry Benchmark</h3>
      <p className="text-sm text-gray-600 mt-1">
        See how your compliance percentage compares to anonymized peer organizations tracking the same frameworks.
      </p>

      {loading ? (
        <div className="mt-4 animate-pulse h-24 rounded bg-gray-100" />
      ) : loadError ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {loadError}
        </div>
      ) : benchmarks.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No benchmark data available yet. Track a framework to see how you compare.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {benchmarks.map((benchmark) => (
            <div key={benchmark.framework_id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium text-gray-900">{benchmark.framework_name}</p>
              {benchmark.insufficient_data ? (
                <p className="mt-2 text-sm text-gray-500">
                  Not enough participating organizations yet (minimum {benchmark.minimum_participants}) to show a benchmark for this framework.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <BenchmarkBar label="You" pct={benchmark.own_pct} highlight />
                  <BenchmarkBar label="Peer Median" pct={benchmark.median_pct} />
                  <BenchmarkBar label="Peer Average" pct={benchmark.average_pct} />
                  <p className="text-xs text-gray-500">
                    Compared against {benchmark.participants} organizations
                    {typeof benchmark.percentile_rank === 'number' ? ` — you rank in the ${benchmark.percentile_rank}th percentile` : ''}.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ReportsTab>('ondemand');

  const downloadReport = async (reportType: ReportType) => {
    setGenerating(reportType);
    setError('');
    try {
      let response;
      let contentType = 'application/octet-stream';
      let fileName = 'report';

      switch (reportType) {
        case 'compliance-pdf':
          response = await reportsAPI.downloadPDF();
          contentType = 'application/pdf';
          fileName = `compliance-report-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        case 'compliance-excel':
          response = await reportsAPI.downloadExcel();
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          fileName = `compliance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
        case 'ssp-pdf':
          response = await reportsAPI.downloadSspPdf();
          contentType = 'application/pdf';
          fileName = `ssp-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        case 'ssp-json':
          response = await reportsAPI.downloadSspJson();
          contentType = 'application/json';
          fileName = `ssp-${new Date().toISOString().split('T')[0]}.json`;
          break;
        default:
          throw new Error('Unsupported report type');
      }

      const blob = new Blob([response.data], { type: contentType });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('Report generation requires Starter tier or higher. Please upgrade your plan.');
      } else {
        setError('Failed to generate report. Please try again.');
      }
      console.error('Report download error:', err);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-2">Generate and download compliance reports for auditors and stakeholders.</p>
        </div>

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span className="text-lg">✨</span>
            <div><div className="font-medium text-purple-800">AI Insights</div><div className="text-purple-600">Gap analysis &amp; executive report</div></div>
          </Link>
          <Link href="/dashboard/frameworks"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span className="text-lg">📐</span>
            <div><div className="font-medium text-blue-800">Frameworks</div><div className="text-blue-600">Active framework progress</div></div>
          </Link>
          <Link href="/dashboard/auditor-workspace"
            className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-xs">
            <span className="text-lg">🔍</span>
            <div><div className="font-medium text-green-800">Auditor Workspace</div><div className="text-green-600">Engagements, workpapers &amp; findings</div></div>
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('ondemand')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'ondemand'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              On-Demand Reports
            </button>
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'scheduled'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Scheduled Reports
            </button>
          </nav>
        </div>

        {activeTab === 'scheduled' && <ScheduledReportsPanel />}

        {activeTab === 'ondemand' && (
        <>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PDF Report Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                &#x1F4C4;
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">Compliance Report (PDF)</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Full compliance status report with executive summary, framework breakdown, and detailed control listing. Ideal for board presentations and auditor submissions.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Executive Summary</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Framework Breakdown</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Control Details</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Status Color-Coding</span>
                </div>
                <button
                  onClick={() => downloadReport('compliance-pdf')}
                  disabled={generating !== null}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'compliance-pdf' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download PDF Report'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Excel Report Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                &#x1F4CA;
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">Compliance Report (Excel)</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Multi-sheet spreadsheet with summary metrics, per-framework compliance, and all controls with filtering. Ideal for data analysis and custom reporting.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Summary Sheet</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Frameworks Sheet</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Controls Sheet</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Filterable</span>
                </div>
                <button
                  onClick={() => downloadReport('compliance-excel')}
                  disabled={generating !== null}
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'compliance-excel' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download Excel Report'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SSP PDF Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-600">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                🛡️
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">System Security Plan (SSP) PDF</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Narrative SSP covering organization/system context, CIA baseline, compliance posture, asset inventory, vulnerabilities, evidence, and POA&amp;M.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Whole Picture</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Audit Narrative</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Regenerable</span>
                </div>
                <button
                  onClick={() => downloadReport('ssp-pdf')}
                  disabled={generating !== null}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'ssp-pdf' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download SSP PDF'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SSP JSON Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-slate-600">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                🧾
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">System Security Plan (SSP) JSON</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Structured SSP snapshot for integrations, version control, and external automation workflows.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Machine Readable</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">API Friendly</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Regenerable</span>
                </div>
                <button
                  onClick={() => downloadReport('ssp-json')}
                  disabled={generating !== null}
                  className="mt-4 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'ssp-json' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download SSP JSON'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <IndustryBenchmarkPanel />

        {/* Tier info */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-800">
            <strong>Starter tier required.</strong> Report generation is available on Starter ($49/mo) and above. Free tier users can view compliance data on the dashboard.
          </p>
          <p className="text-xs text-purple-700 mt-2">
            Keep SSP content current by updating organization and system details at <code>/dashboard/organization</code>, then regenerate.
          </p>
        </div>
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
