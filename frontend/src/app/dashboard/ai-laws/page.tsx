'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { stateAiLawsAPI, internationalAiLawsAPI } from '@/lib/api';

type AiLawsTab = 'state' | 'international';

interface JurisdictionStats {
  total: number;
  implemented: number;
  in_progress: number;
  not_started: number;
}

interface JurisdictionSummary {
  code: string;
  name: string;
  region?: string;
  law?: string;
  authority?: string;
  effective?: string | null;
  fully_applicable?: string | null;
  status?: string;
  stats: JurisdictionStats;
}

interface AiLawsSummary {
  total_controls: number;
  implemented: number;
  completion_percentage: number;
  jurisdictions_covered?: number;
  jurisdictions: JurisdictionSummary[];
}

interface AiLawControl {
  control_id: string;
  title: string;
  description: string;
  priority?: string;
  control_type?: string;
  jurisdiction: string;
  region?: string | null;
  law?: string | null;
}

interface CrosswalkMapping {
  mapped_control_id: string;
  mapped_title: string;
  mapped_framework: string;
  mapping_type: string;
  mapping_notes?: string | null;
}

interface AiLawControlDetail extends AiLawControl {
  id: string;
  implementation_status?: string | null;
  implementation_notes?: string | null;
  implementation_updated_at?: string | null;
  crosswalk_mappings: CrosswalkMapping[];
}

type GetControlsFn = (params?: {
  jurisdiction?: string;
  region?: string;
  control_type?: string;
  priority?: string;
  search?: string;
}) => Promise<{ data: { data?: AiLawControl[] } }>;
type GetControlFn = (controlId: string) => Promise<{ data: { data?: AiLawControlDetail } }>;
type GetSummaryFn = () => Promise<{ data: { data?: AiLawsSummary } }>;

interface AiLawsApiSet {
  getControls: GetControlsFn;
  getControl: GetControlFn;
  getSummary: GetSummaryFn;
}

function completionColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-yellow-500';
  if (pct >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

function priorityBadgeClass(priority?: string): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function JurisdictionCards({ jurisdictions }: { jurisdictions: JurisdictionSummary[] }) {
  if (jurisdictions.length === 0) {
    return <p className="text-sm text-gray-500">No data available for this jurisdiction yet.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {jurisdictions.map((j) => {
        const total = j.stats.total || 0;
        const pct = total > 0 ? Math.round((j.stats.implemented / total) * 100) : 0;
        return (
          <div key={j.code} className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-600">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">{j.name}</p>
              <span className="text-xs text-gray-400">{j.code}</span>
            </div>
            {j.law && <p className="text-xs text-gray-500 mt-1">{j.law}</p>}
            {total === 0 ? (
              <p className="mt-3 text-xs text-gray-500">No data available for this jurisdiction yet.</p>
            ) : (
              <>
                <div
                  className="mt-3 w-full bg-gray-200 rounded-full h-2"
                  role="progressbar"
                  aria-label={`${j.name} implementation ${pct} percent complete`}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className={`h-2 rounded-full ${completionColor(pct)}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  {j.stats.implemented}/{total} implemented ({pct}%) · {j.stats.in_progress} in progress ·{' '}
                  {j.stats.not_started} not started
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ControlDetailModal({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: AiLawControlDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-gray-900">Control Detail</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        {loading && <div className="animate-pulse h-32 rounded-lg bg-gray-100" />}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        {detail && !loading && !error && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400">{detail.control_id}</p>
              <h3 className="text-base font-semibold text-gray-900">{detail.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{detail.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.priority && (
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${priorityBadgeClass(detail.priority)}`}
                  aria-label={`Priority: ${detail.priority}`}
                >
                  {detail.priority}
                </span>
              )}
              {detail.control_type && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{detail.control_type}</span>
              )}
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">{detail.jurisdiction}</span>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-900">Implementation Status</p>
              <p className="text-sm text-gray-600 mt-1">{detail.implementation_status || 'not_started'}</p>
              {detail.implementation_notes && (
                <p className="text-xs text-gray-500 mt-1">{detail.implementation_notes}</p>
              )}
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-900">NIST / Framework Crosswalk</p>
              {detail.crosswalk_mappings.length === 0 ? (
                <p className="text-sm text-gray-500 mt-1">No crosswalk mappings recorded for this control.</p>
              ) : (
                <ul role="list" className="mt-2 space-y-2">
                  {detail.crosswalk_mappings.map((m, idx) => (
                    <li role="listitem" key={`${m.mapped_control_id}-${idx}`} className="text-sm text-gray-700">
                      <span className="font-medium">{m.mapped_control_id}</span> — {m.mapped_title}{' '}
                      <span className="text-xs text-gray-400">({m.mapped_framework}, {m.mapping_type})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AiLawsTabPanel({ api, showRegionFilter }: { api: AiLawsApiSet; showRegionFilter: boolean }) {
  const [summary, setSummary] = useState<AiLawsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [controls, setControls] = useState<AiLawControl[]>([]);
  const [controlsLoading, setControlsLoading] = useState(true);
  const [controlsError, setControlsError] = useState('');

  const [filters, setFilters] = useState({ jurisdiction: '', region: '', control_type: '', priority: '', search: '' });

  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AiLawControlDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSummaryLoading(true);
      setSummaryError('');
      try {
        const response = await api.getSummary();
        if (!cancelled) setSummary(response.data?.data || null);
      } catch {
        if (!cancelled) setSummaryError('Failed to load jurisdiction summary.');
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadControls = async () => {
    setControlsLoading(true);
    setControlsError('');
    try {
      const params: Record<string, string> = {};
      if (filters.jurisdiction) params.jurisdiction = filters.jurisdiction;
      if (filters.region) params.region = filters.region;
      if (filters.control_type) params.control_type = filters.control_type;
      if (filters.priority) params.priority = filters.priority;
      if (filters.search) params.search = filters.search;
      const response = await api.getControls(params);
      setControls(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setControlsError('Failed to load controls.');
    } finally {
      setControlsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadControls();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.jurisdiction, filters.region, filters.control_type, filters.priority]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadControls();
  };

  const regionOptions = useMemo(() => {
    if (!summary) return [];
    const regions = summary.jurisdictions.map((j) => j.region).filter((r): r is string => Boolean(r));
    return Array.from(new Set(regions));
  }, [summary]);

  const openControl = async (controlId: string) => {
    setSelectedControlId(controlId);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const response = await api.getControl(controlId);
      setDetail(response.data?.data || null);
    } catch {
      setDetailError('Failed to load control detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Jurisdiction Summary</h2>
        {summaryError && (
          <div className="mt-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{summaryError}</div>
        )}
        {summaryLoading ? (
          <div className="mt-3 animate-pulse h-32 rounded-lg bg-gray-100" />
        ) : summary ? (
          <>
            <p className="text-sm text-gray-600 mt-1">
              {summary.implemented}/{summary.total_controls} controls implemented ({summary.completion_percentage}%)
              {typeof summary.jurisdictions_covered === 'number' ? ` across ${summary.jurisdictions_covered} jurisdictions` : ''}
            </p>
            <div className="mt-3">
              <JurisdictionCards jurisdictions={summary.jurisdictions} />
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-gray-500">No data available.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-bold text-gray-900">Controls</h2>
        <form onSubmit={handleSearchSubmit} className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label htmlFor="al-jurisdiction" className="block text-xs font-medium text-gray-700 mb-1">
              Jurisdiction
            </label>
            <select
              id="al-jurisdiction"
              value={filters.jurisdiction}
              onChange={(e) => setFilters({ ...filters, jurisdiction: e.target.value })}
              className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
            >
              <option value="">All</option>
              {(summary?.jurisdictions || []).map((j) => (
                <option key={j.code} value={j.code}>
                  {j.name}
                </option>
              ))}
            </select>
          </div>
          {showRegionFilter && (
            <div>
              <label htmlFor="al-region" className="block text-xs font-medium text-gray-700 mb-1">
                Region
              </label>
              <select
                id="al-region"
                value={filters.region}
                onChange={(e) => setFilters({ ...filters, region: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
              >
                <option value="">All</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="al-control-type" className="block text-xs font-medium text-gray-700 mb-1">
              Control Type
            </label>
            <input
              id="al-control-type"
              type="text"
              value={filters.control_type}
              onChange={(e) => setFilters({ ...filters, control_type: e.target.value })}
              className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="al-priority" className="block text-xs font-medium text-gray-700 mb-1">
              Priority
            </label>
            <input
              id="al-priority"
              type="text"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
              className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="al-search" className="block text-xs font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="flex gap-1">
              <input
                id="al-search"
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
              />
              <button
                type="submit"
                className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm"
              >
                Go
              </button>
            </div>
          </div>
        </form>

        {controlsError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{controlsError}</div>
        )}

        {controlsLoading ? (
          <div className="mt-4 animate-pulse h-40 rounded-lg bg-gray-100" />
        ) : controls.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No data available for this jurisdiction yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-2">Control ID</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Jurisdiction</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c) => (
                  <tr
                    key={c.control_id}
                    onClick={() => openControl(c.control_id)}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-medium text-gray-900">{c.control_id}</td>
                    <td className="px-4 py-2 text-gray-700">{c.title}</td>
                    <td className="px-4 py-2 text-gray-600">{c.jurisdiction}</td>
                    <td className="px-4 py-2">
                      {c.priority && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${priorityBadgeClass(c.priority)}`}>
                          {c.priority}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{c.control_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedControlId && (
        <ControlDetailModal
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedControlId(null)}
        />
      )}
    </div>
  );
}

export default function AiLawsPage() {
  const [activeTab, setActiveTab] = useState<AiLawsTab>('state');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Laws</h1>
          <p className="text-gray-600 mt-2">
            Track your organization&apos;s compliance posture against US state and international AI governance laws.
          </p>
        </div>

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('state')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'state'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              US State Laws
            </button>
            <button
              onClick={() => setActiveTab('international')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'international'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              International
            </button>
          </nav>
        </div>

        {activeTab === 'state' && <AiLawsTabPanel api={stateAiLawsAPI} showRegionFilter={false} />}
        {activeTab === 'international' && <AiLawsTabPanel api={internationalAiLawsAPI} showRegionFilter />}
      </div>
    </DashboardLayout>
  );
}
