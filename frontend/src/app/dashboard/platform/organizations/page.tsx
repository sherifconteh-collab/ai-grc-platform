'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

interface OrganizationRow {
  id: string;
  name: string;
  tier: string;
  billing_status: string;
  trial_status: string;
  region: string | null;
  country_code: string | null;
  created_at: string;
  has_any_llm_key: boolean;
  enabled_llm_providers: string[];
}

const BILLING_BADGE: Record<string, string> = {
  community: 'bg-gray-100 text-gray-700',
  trial: 'bg-blue-100 text-blue-700',
  active_paid: 'bg-green-100 text-green-700',
  past_due: 'bg-yellow-100 text-yellow-800',
  canceling: 'bg-orange-100 text-orange-700',
  canceled: 'bg-red-100 text-red-700',
  comped: 'bg-purple-100 text-purple-700',
  license: 'bg-emerald-100 text-emerald-700',
};

export default function PlatformOrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [hasLlmKeyFilter, setHasLlmKeyFilter] = useState<string>('');
  const [selectedLlmProvider, setSelectedLlmProvider] = useState<string>('');
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);

  const loadOrganizations = async (paramsOverride?: { region?: string; has_llm_key?: string; llm_provider?: string }) => {
    try {
      setLoading(true);
      setError('');
      const params: any = { page: 1, limit: 100 };
      if (paramsOverride?.region) {
        params.region = paramsOverride.region;
      }
      if (paramsOverride?.has_llm_key) {
        params.has_llm_key = paramsOverride.has_llm_key === 'true';
      }
      if (paramsOverride?.llm_provider) {
        params.llm_provider = paramsOverride.llm_provider;
      }
      const res = await platformAdminAPI.getOrganizations(params);
      const orgs = res.data?.data || [];
      setOrganizations(orgs);
      
      // Extract unique regions for filter dropdown
      if (!paramsOverride?.region && !paramsOverride?.has_llm_key && !paramsOverride?.llm_provider) {
        const regions = Array.from(new Set(
          orgs
            .map((o: OrganizationRow) => o.region)
            .filter((r: string | null): r is string => r !== null)
        )).sort() as string[];
        setAvailableRegions(regions);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const applyFilters = (next?: { region?: string; has_llm_key?: string; llm_provider?: string }) => {
    loadOrganizations({
      region: next?.region !== undefined ? next.region : (selectedRegion || undefined),
      has_llm_key: next?.has_llm_key !== undefined ? next.has_llm_key : (hasLlmKeyFilter || undefined),
      llm_provider: next?.llm_provider !== undefined ? next.llm_provider : (selectedLlmProvider || undefined)
    });
  };

  const clearFilters = () => {
    setSelectedRegion('');
    setHasLlmKeyFilter('');
    setSelectedLlmProvider('');
    loadOrganizations();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Organizations</h1>
          <p className="text-sm text-gray-600 mt-1">Platform-wide organization list for owners.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="region-filter" className="text-sm font-medium text-gray-700">
              Region
            </label>
            <select
              id="region-filter"
              value={selectedRegion}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedRegion(next);
                applyFilters({ region: next || undefined });
              }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Regions</option>
              {availableRegions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="llm-enabled-filter" className="text-sm font-medium text-gray-700">
              AI Keys
            </label>
            <select
              id="llm-enabled-filter"
              value={hasLlmKeyFilter}
              onChange={(e) => {
                const next = e.target.value;
                setHasLlmKeyFilter(next);
                applyFilters({ has_llm_key: next || undefined });
              }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Orgs</option>
              <option value="true">Has AI Key</option>
              <option value="false">No AI Key</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="llm-provider-filter" className="text-sm font-medium text-gray-700">
              Provider
            </label>
            <select
              id="llm-provider-filter"
              value={selectedLlmProvider}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedLlmProvider(next);
                applyFilters({ llm_provider: next || undefined });
              }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Providers</option>
              <option value="claude">Claude</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="grok">Grok</option>
              <option value="groq">Groq</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          {(selectedRegion || hasLlmKeyFilter || selectedLlmProvider) && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Clear Filters
            </button>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {loading && <div className="text-sm text-gray-500">Loading organizations…</div>}

        {!loading && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Region</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Billing</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">AI Keys</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Trial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{org.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {org.region ? (
                        <div className="flex items-center gap-2">
                          <span>{org.region}</span>
                          {org.country_code && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {org.country_code}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{org.tier}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BILLING_BADGE[org.billing_status] || 'bg-gray-100 text-gray-700'}`}>
                        {org.billing_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {org.has_any_llm_key ? (
                        <div className="flex flex-wrap gap-1">
                          {org.enabled_llm_providers.map((provider) => (
                            <span key={provider} className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {provider}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not configured</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{org.trial_status || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href={`/dashboard/platform/organizations/${org.id}`}
                        className="text-amber-600 hover:text-amber-700 font-medium"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {organizations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      No organizations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
