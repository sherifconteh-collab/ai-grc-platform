// @tier: community
'use client';

/**
 * The remediation register.
 *
 * This route already existed as a link target -- the control detail page has
 * pointed "View all" at /dashboard/poam?controlId=... for as long as it has had
 * a POA&M panel -- but the page itself was never built, so the link 404'd. The
 * only list was a tab on Operations, which sits behind `settings.manage` even
 * though every POA&M endpoint requires only `controls.read`.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { poamAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import { StatusBadge, PriorityBadge, POAM_STATUS_COLORS } from '@/components/poam/PoamStatusBadge';
import { remediationTerms } from '@/lib/poamTerminology';
import {
  PoamItem, POAM_STATUSES, POAM_PRIORITIES, errorMessage,
} from '@/lib/poamTypes';

interface PoamSummary {
  total: number;
  active: number;
  risk_accepted: number;
  overdue: number;
}

// useSearchParams needs a Suspense boundary to prerender, matching how
// dashboard/structure and the other query-param pages in this app are built.
export default function PoamListPage() {
  return (
    <Suspense fallback={null}>
      <PoamListView />
    </Suspense>
  );
}

function PoamListView() {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const controlId = searchParams.get('controlId') || '';
  const riskId = searchParams.get('riskId') || '';
  const initialStatus = searchParams.get('status') || '';

  const [items, setItems] = useState<PoamItem[]>([]);
  const [summary, setSummary] = useState<PoamSummary>({ total: 0, active: 0, risk_accepted: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<'csv' | 'pdf' | null>(null);

  const canWrite = hasPermission(user, 'controls.write');
  const terms = useMemo(() => remediationTerms(), []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await poamAPI.getList({
        limit: 500,
        controlId: controlId || undefined,
        riskId: riskId || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      });
      setItems(res.data?.data?.items || []);
      setSummary(res.data?.data?.summary || { total: 0, active: 0, risk_accepted: 0, overdue: 0 });
    } catch (err: unknown) {
      setError(errorMessage(err, `Failed to load ${terms.plural.toLowerCase()}`));
    } finally {
      setLoading(false);
    }
  }, [controlId, riskId, statusFilter, priorityFilter, terms.plural]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (format: 'csv' | 'pdf') => {
    try {
      setDownloading(format);
      setError('');
      // Export honors the same filters as the list on screen -- an export that
      // silently returns a different set than the user is looking at is a
      // reporting bug, not a cosmetic one.
      const res = await poamAPI.download(format, {
        controlId: controlId || undefined,
        riskId: riskId || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      });
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `poam-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(errorMessage(err, `Failed to export as ${format.toUpperCase()}`));
    } finally {
      setDownloading(null);
    }
  };

  const filtered = search
    ? items.filter((item) =>
        [item.title, item.control_code, item.status, item.priority, item.source_type]
          .some((field) => String(field || '').toLowerCase().includes(search.toLowerCase())))
    : items;

  const scopeLabel = controlId
    ? 'filtered to one control'
    : riskId
      ? 'filtered to one risk'
      : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{terms.plural}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Tracked weaknesses and the remediation planned to close them.
              {scopeLabel && <span className="ml-1 text-purple-700">({scopeLabel})</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownload('csv')}
              disabled={downloading !== null}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading === 'csv' ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloading !== null}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading === 'pdf' ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {(controlId || riskId) && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-900">
            Showing only items linked to the selected {controlId ? 'control' : 'risk'}.{' '}
            <Link href="/dashboard/poam" className="underline hover:text-purple-950">Show all {terms.plural.toLowerCase()}</Link>
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total" value={summary.total} tone="gray" />
          <SummaryCard label="Active" value={summary.active} tone="blue" />
          <SummaryCard label="Overdue" value={summary.overdue} tone="red" />
          <SummaryCard label="Risk accepted" value={summary.risk_accepted} tone="purple" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder={`Filter ${terms.plural.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Filter ${terms.plural.toLowerCase()}`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All statuses</option>
            {POAM_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All priorities</option>
            {POAM_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
          <Link
            href="/dashboard/operations"
            className="ml-auto px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-md hover:bg-purple-50"
          >
            Operations rollup
          </Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500 text-sm">Loading {terms.plural.toLowerCase()}...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500 text-sm">No {terms.plural.toLowerCase()} found.</p>
            <p className="text-gray-400 text-xs mt-2">
              Items are raised automatically when a control test comes back other than satisfied,
              when an audit finding is recorded, or from a vulnerability or risk.
              {canWrite && ' You can also create one from the Operations page.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Controls</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Raised by</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestones</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        href={`/dashboard/poam/${item.id}`}
                        className="font-medium text-purple-700 hover:text-purple-900 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.control_code || '—'}
                      {(item.control_count || 0) > 1 && (
                        <span className="ml-1 text-xs text-gray-400">+{(item.control_count || 1) - 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">
                      {String(item.source_type || 'manual').replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3"><PriorityBadge value={item.priority} /></td>
                    <td className="px-4 py-3"><StatusBadge value={item.status} colorMap={POAM_STATUS_COLORS} /></td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.milestone_count || 0}
                      {item.next_milestone_date && (
                        <span className="block text-xs text-gray-400">
                          next {new Date(item.next_milestone_date).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.due_date ? new Date(item.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.owner_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneMap: Record<string, string> = {
    gray: 'text-gray-900',
    blue: 'text-blue-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneMap[tone] || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
