'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { frameworkAPI, organizationAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface CoveragePublication {
  id: string;
  publication_code: string;
  title: string;
  publication_family: string;
  publication_type: string;
  recommended_for_private: boolean;
  federal_focus: boolean;
  mapped_controls: number;
  completed_controls: number;
  in_progress_controls: number;
  not_started_controls: number;
  completion_percent: number;
}

interface CoverageCell {
  publication_family: string;
  publication_type: string;
  publication_count: number;
  mapped_controls: number;
  completed_controls: number;
  completion_percent: number;
}

interface CoveragePayload {
  summary: {
    publication_count: number;
    total_mapped_controls: number;
    total_completed_controls: number;
    total_in_progress_controls: number;
    total_not_started_controls: number;
    overall_completion_percent: number;
  };
  publications: CoveragePublication[];
  heatmap: {
    families: string[];
    types: string[];
    cells: CoverageCell[];
  };
  top_gaps: CoveragePublication[];
}

function getCellColor(completionPercent: number) {
  if (completionPercent >= 85) return 'bg-green-100 text-green-900';
  if (completionPercent >= 65) return 'bg-emerald-50 text-emerald-900';
  if (completionPercent >= 45) return 'bg-yellow-100 text-yellow-900';
  if (completionPercent >= 25) return 'bg-orange-100 text-orange-900';
  return 'bg-red-100 text-red-900';
}

export default function FrameworkMappingCoveragePage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'frameworks.manage');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<CoveragePayload | null>(null);

  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [privateOnly, setPrivateOnly] = useState(false);
  const [federalOnly, setFederalOnly] = useState(false);

  const [families, setFamilies] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const profileResponse = await organizationAPI.getMyProfile();
        const profile = profileResponse.data?.data?.profile || {};
        if (!isMounted) return;
        setPrivateOnly(profile.compliance_profile === 'private');
      } catch {
        // Keep defaults when profile is unavailable.
      }
    };

    bootstrap();
    return () => {
      isMounted = false;
    };
  }, []);

  async function loadCoverage() {
    try {
      setLoading(true);
      setError('');

      const response = await frameworkAPI.getNistPublicationCoverage({
        search: search || undefined,
        publication_family: familyFilter !== 'all' ? familyFilter : undefined,
        publication_type: typeFilter !== 'all' ? typeFilter : undefined,
        private_only: privateOnly || undefined,
        federal_only: federalOnly || undefined
      });

      const loadedPayload = response.data?.data as CoveragePayload;
      setPayload(loadedPayload);
      setFamilies(
        Array.from(
          new Set((loadedPayload?.publications || []).map((publication) => publication.publication_family))
        ).sort()
      );
      setTypes(
        Array.from(
          new Set((loadedPayload?.publications || []).map((publication) => publication.publication_type))
        ).sort()
      );
    } catch (loadError: any) {
      setPayload(null);
      setError(loadError.response?.data?.error || 'Failed to load mapping coverage');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadCoverage();
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, familyFilter, typeFilter, privateOnly, federalOnly]);

  const heatmapCellLookup = useMemo(() => {
    const lookup = new Map<string, CoverageCell>();
    (payload?.heatmap?.cells || []).forEach((cell) => {
      lookup.set(`${cell.publication_family}|||${cell.publication_type}`, cell);
    });
    return lookup;
  }, [payload]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">NIST Mapping and Coverage</h1>
            <p className="text-gray-600 mt-1">
              Publication-to-control mapping admin and task coverage heatmap.
            </p>
          </div>
          <button
            onClick={loadCoverage}
            className="px-4 py-2 border border-purple-600 text-purple-700 rounded-lg hover:bg-purple-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search publications"
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All families</option>
              {families.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={privateOnly}
                onChange={(e) => setPrivateOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Private-ready only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={federalOnly}
                onChange={(e) => setFederalOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Federal-focus only
            </label>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : payload ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard label="Publications" value={payload.summary.publication_count} />
              <MetricCard label="Mapped Controls" value={payload.summary.total_mapped_controls} />
              <MetricCard label="Completed" value={payload.summary.total_completed_controls} />
              <MetricCard label="In Progress" value={payload.summary.total_in_progress_controls} />
              <MetricCard label="Overall Completion" value={`${payload.summary.overall_completion_percent}%`} />
            </div>

            <div className="bg-white rounded-lg shadow-md p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Coverage Heatmap</h2>
              {payload.heatmap.families.length === 0 || payload.heatmap.types.length === 0 ? (
                <p className="text-sm text-gray-500">No heatmap data available for current filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left">Publication Family</th>
                        {payload.heatmap.types.map((type) => (
                          <th key={type} className="px-2 py-2 text-center min-w-[120px]">
                            {type}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payload.heatmap.families.map((family) => (
                        <tr key={family} className="border-t border-gray-200">
                          <td className="px-2 py-2 font-medium text-gray-700 bg-gray-50">{family}</td>
                          {payload.heatmap.types.map((type) => {
                            const cell = heatmapCellLookup.get(`${family}|||${type}`);
                            if (!cell) {
                              return (
                                <td key={`${family}-${type}`} className="px-2 py-2 text-center text-gray-400">
                                  —
                                </td>
                              );
                            }
                            return (
                              <td key={`${family}-${type}`} className="px-2 py-2 text-center">
                                <div className={`rounded-md px-2 py-1 ${getCellColor(cell.completion_percent)}`}>
                                  <div className="font-semibold">{cell.completion_percent}%</div>
                                  <div>{cell.publication_count} pubs</div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-md p-5">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Top Coverage Gaps</h2>
                {payload.top_gaps.length === 0 ? (
                  <p className="text-sm text-gray-500">No mapped controls found for this filter set.</p>
                ) : (
                  <div className="space-y-2">
                    {payload.top_gaps.map((publication) => (
                      <div
                        key={publication.id}
                        className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{publication.publication_code}</p>
                          <p className="text-xs text-gray-600 mt-1">
                            {publication.not_started_controls} not started • {publication.in_progress_controls} in progress
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{publication.completion_percent}%</p>
                          <Link
                            href={`/dashboard/frameworks/publications/${publication.id}`}
                            className="text-xs text-purple-700 hover:text-purple-900"
                          >
                            {canManage ? 'Open editor' : 'Open details'}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-md p-5">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Publication Workspace List</h2>
                <div className="max-h-[420px] overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Publication</th>
                        <th className="px-3 py-2 text-left">Completion</th>
                        <th className="px-3 py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.publications.map((publication) => (
                        <tr key={publication.id} className="border-t border-gray-200">
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{publication.publication_code}</p>
                            <p className="text-xs text-gray-600">{publication.title}</p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold">{publication.completion_percent}%</p>
                            <p className="text-xs text-gray-500">
                              {publication.completed_controls}/{publication.mapped_controls}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/dashboard/frameworks/publications/${publication.id}`}
                              className="text-xs px-3 py-1.5 rounded-md bg-purple-100 text-purple-800 hover:bg-purple-200"
                            >
                              {canManage ? 'Edit' : 'View'}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No mapping data available.</p>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
