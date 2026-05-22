// @tier: platform
'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

interface PlatformOverview {
  organizations_total: number;
  billing_status: Array<{ billing_status: string; count: number }>;
  total_ai_requests: number;
  total_external_decisions: number;
  region_distribution: Array<{ region: string; country_code: string; count: number }>;
  llm_key_adoption?: {
    orgs_with_any_llm_key: number;
    orgs_without_any_llm_key: number;
    providers: Record<string, number>;
  };
}

export default function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await platformAdminAPI.getOverview();
        setData(res.data?.data || null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load platform overview');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-sm text-gray-600 mt-1">Cross-organization platform health and AI usage.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {loading && <div className="text-sm text-gray-500">Loading platform metrics…</div>}

        {data && !loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Organizations" value={data.organizations_total} />
              <StatCard label="AI Requests" value={data.total_ai_requests} />
              <StatCard label="External Decisions" value={data.total_external_decisions} />
              <StatCard
                label="Billing States"
                value={Array.isArray(data.billing_status) ? data.billing_status.length : 0}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Orgs With AI Keys" value={data.llm_key_adoption?.orgs_with_any_llm_key || 0} />
              <StatCard label="Orgs Without AI Keys" value={data.llm_key_adoption?.orgs_without_any_llm_key || 0} />
              <StatCard
                label="Provider Connections"
                value={Object.values(data.llm_key_adoption?.providers || {}).reduce((sum, value) => sum + Number(value || 0), 0)}
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Billing Status Breakdown</h2>
              <div className="space-y-2">
                {(data.billing_status || []).map((row) => (
                  <div key={row.billing_status} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{row.billing_status || 'unknown'}</span>
                    <span className="font-semibold text-gray-900">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">AI Key Adoption By Provider</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(data.llm_key_adoption?.providers || {}).map(([provider, count]) => (
                  <div key={provider} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{provider}</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">{Number(count || 0).toLocaleString()}</div>
                    <div className="text-xs text-gray-600 mt-1">organizations enabled</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Regional Distribution</h2>
              <div className="space-y-2">
                {(data.region_distribution || []).length === 0 ? (
                  <p className="text-sm text-gray-500">No region data available yet</p>
                ) : (
                  (data.region_distribution || []).map((row, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">{row.region}</span>
                        {row.country_code && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {row.country_code}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-gray-900">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}
