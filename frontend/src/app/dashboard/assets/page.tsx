// @tier: pro
'use client';

import { Suspense, useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { assetsAPI, Asset, AssetCategory, Environment } from '@/lib/assetsApi';
import { vulnerabilitiesAPI } from '@/lib/api';

interface CreateAssetFormState {
  category_id: string;
  name: string;
  environment_id: string;
  status: string;
  criticality: string;
  ip_address: string;
  hostname: string;
  model: string;
  manufacturer: string;
  location: string;
  notes: string;
}

const DEFAULT_CREATE_FORM: CreateAssetFormState = {
  category_id: '',
  name: '',
  environment_id: '',
  status: 'active',
  criticality: '',
  ip_address: '',
  hostname: '',
  model: '',
  manufacturer: '',
  location: '',
  notes: '',
};

function AssetsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState<CreateAssetFormState>(DEFAULT_CREATE_FORM);

  // In-page asset details panel
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [selectedDependencies, setSelectedDependencies] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [assetsRes, categoriesRes, environmentsRes, statsRes] = await Promise.all([
        assetsAPI.getAll({
          category: selectedCategory || undefined,
          status: selectedStatus || undefined,
          environment_id: selectedEnvironment || undefined,
          search: debouncedSearchQuery || undefined,
        }),
        assetsAPI.getCategories(),
        assetsAPI.getEnvironments(),
        assetsAPI.getStats(),
      ]);

      setAssets(assetsRes.data.data.assets || []);
      setCategories(categoriesRes.data.data.categories || []);
      setEnvironments(environmentsRes.data.data.environments || []);
      setStats(statsRes.data.data);
    } catch (err: any) {
      console.error('Load assets error:', err);

      if (!err.response?.data?.upgradeRequired) {
        setError(err.response?.data?.error || 'Failed to load assets');
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, selectedCategory, selectedEnvironment, selectedStatus]);

  const closeAssetPanel = useCallback((syncUrl = true) => {
    setSelectedAssetId(null);
    setSelectedAsset(null);
    setSelectedDependencies([]);
    setDetailLoading(false);
    setDetailError('');

    if (syncUrl) {
      router.replace('/dashboard/assets', { scroll: false });
    }
  }, [router]);

  const openAssetPanel = useCallback(async (assetId: string, syncUrl = true) => {
    if (syncUrl) {
      router.replace(`/dashboard/assets?assetId=${encodeURIComponent(assetId)}`, { scroll: false });
    }

    setSelectedAssetId(assetId);
    setDetailLoading(true);
    setDetailError('');

    try {
      const response = await assetsAPI.getById(assetId);
      setSelectedAsset(response.data.data.asset || null);
      setSelectedDependencies(response.data.data.dependencies || []);
    } catch (err: any) {
      console.error('Load asset detail error:', err);
      setDetailError(err.response?.data?.error || 'Failed to load asset details');
      setSelectedAsset(null);
      setSelectedDependencies([]);
    } finally {
      setDetailLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const assetIdFromQuery = searchParams.get('assetId');

    if (assetIdFromQuery && assetIdFromQuery !== selectedAssetId) {
      openAssetPanel(assetIdFromQuery, false);
      return;
    }

    if (!assetIdFromQuery && selectedAssetId) {
      closeAssetPanel(false);
    }
  }, [closeAssetPanel, openAssetPanel, searchParams, selectedAssetId]);

  useEffect(() => {
    if (!selectedAssetId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeAssetPanel();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeAssetPanel, selectedAssetId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'deprecated': return 'bg-orange-100 text-orange-800';
      case 'decommissioned': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getCriticalityColor = (criticality?: string) => {
    switch (criticality) {
      case 'critical': return 'text-red-600 font-bold';
      case 'high': return 'text-orange-600 font-semibold';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-500';
    }
  };

  const getCategoryIcon = (code: string) => {
    switch (code) {
      case 'hardware': return '🖥️';
      case 'software': return '💿';
      case 'cloud': return '☁️';
      case 'network': return '🌐';
      case 'database': return '🗄️';
      case 'ai_agent': return '🤖';
      case 'service_account': return '🔑';
      default: return '📦';
    }
  };

  const openCreateModal = () => {
    setCreateError('');
    setCreateForm(DEFAULT_CREATE_FORM);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (creatingAsset) return;
    setShowCreateModal(false);
    setCreateError('');
  };

  const updateCreateForm = <K extends keyof CreateAssetFormState>(key: K, value: CreateAssetFormState[K]) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createForm.category_id || !createForm.name.trim()) {
      setCreateError('Category and asset name are required.');
      return;
    }

    setCreatingAsset(true);
    setCreateError('');

    try {
      const payload: Partial<Asset> = {
        category_id: createForm.category_id,
        name: createForm.name.trim(),
        environment_id: createForm.environment_id || undefined,
        status: createForm.status || 'active',
        criticality: createForm.criticality || undefined,
        ip_address: createForm.ip_address.trim() || undefined,
        hostname: createForm.hostname.trim() || undefined,
        model: createForm.model.trim() || undefined,
        manufacturer: createForm.manufacturer.trim() || undefined,
        location: createForm.location.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
      };

      await assetsAPI.create(payload);
      setShowCreateModal(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      await loadData();
    } catch (err: any) {
      console.error('Create asset error:', err);
      setCreateError(err.response?.data?.error || 'Failed to create asset');
    } finally {
      setCreatingAsset(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Assets</h1>
          <p className="text-gray-600">Configuration Management Database (CMDB)</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Asset
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Assets</div>
            <div className="text-3xl font-bold text-gray-900">{stats.summary.total_assets}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Active</div>
            <div className="text-3xl font-bold text-green-600">{stats.summary.active_assets}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Categories</div>
            <div className="text-3xl font-bold text-blue-600">{stats.summary.categories_used}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Environments</div>
            <div className="text-3xl font-bold text-purple-600">{stats.summary.environments_used}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.code}>
                  {getCategoryIcon(cat.code)} {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="deprecated">Deprecated</option>
              <option value="decommissioned">Decommissioned</option>
            </select>
          </div>

          {/* Environment Filter */}
          <div>
            <select
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Environments</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name} ({env.asset_count || 0})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Assets List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asset
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Environment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Criticality
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vulnerabilities
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP / Hostname
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No assets found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openAssetPanel(asset.id)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-2xl mr-3">{getCategoryIcon(asset.category_code || '')}</div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{asset.name}</div>
                          {asset.model && (
                            <div className="text-xs text-gray-500">{asset.model}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{asset.category_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{asset.environment_name || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(asset.status)}`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getCriticalityColor(asset.criticality)}`}>
                        {asset.criticality || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <VulnBadges asset={asset} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.owner_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{asset.ip_address || asset.hostname || '-'}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        Showing {assets.length} of {stats?.summary.total_assets || 0} assets
      </div>

      {/* In-page detail panel */}
      {selectedAssetId && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close asset details"
            className="absolute inset-0 bg-black/30"
            onClick={() => closeAssetPanel()}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Asset Details</p>
                <h2 className="text-lg font-bold text-gray-900">
                  {selectedAsset?.name || 'Loading...'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => closeAssetPanel()}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
              ) : detailError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {detailError}
                </div>
              ) : selectedAsset ? (
                <>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedAsset.status)}`}>
                        {selectedAsset.status}
                      </span>
                      <span className="text-sm text-gray-700">
                        {selectedAsset.category_name || selectedAsset.category_code || '-'}
                      </span>
                      <span className={`text-sm ${getCriticalityColor(selectedAsset.criticality)}`}>
                        {selectedAsset.criticality ? `${selectedAsset.criticality} criticality` : 'No criticality set'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AssetDetailField label="Environment" value={selectedAsset.environment_name} />
                    <AssetDetailField label="Owner" value={selectedAsset.owner_name} />
                    <AssetDetailField label="Model" value={selectedAsset.model} />
                    <AssetDetailField label="Manufacturer" value={selectedAsset.manufacturer} />
                    <AssetDetailField label="IP Address" value={selectedAsset.ip_address} />
                    <AssetDetailField label="Hostname" value={selectedAsset.hostname} />
                    <AssetDetailField label="FQDN" value={selectedAsset.fqdn} />
                    <AssetDetailField label="Location" value={selectedAsset.location} />
                    <AssetDetailField label="Security Classification" value={selectedAsset.security_classification} />
                    <AssetDetailField label="Cloud Provider" value={selectedAsset.cloud_provider} />
                    <AssetDetailField label="Cloud Region" value={selectedAsset.cloud_region} />
                    <AssetDetailField label="Version" value={selectedAsset.version} />
                  </div>

                  {/* Vulnerability Summary for this asset */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Open Vulnerabilities</h3>
                    <AssetVulnSummary assetId={selectedAsset.id} />
                  </div>

                  {selectedDependencies.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Dependencies</h3>
                      <div className="space-y-2">
                        {selectedDependencies.map((dependency, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{dependency.asset_name}</p>
                              <p className="text-xs text-gray-500">{dependency.asset_category}</p>
                            </div>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              {dependency.dependency_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAsset.notes && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                        {selectedAsset.notes}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-gray-600 text-sm">Asset not found.</div>
              )}
            </div>
          </aside>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close create asset dialog"
            className="absolute inset-0 bg-black/30"
            onClick={closeCreateModal}
          />
          <div className="absolute left-1/2 top-10 w-[min(720px,95vw)] -translate-x-1/2 rounded-xl bg-white shadow-2xl">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Add Asset</h2>
              <p className="text-sm text-gray-600 mt-1">Capture a new CMDB asset for this organization.</p>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4 px-6 py-5">
              {createError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Category *</span>
                  <select
                    value={createForm.category_id}
                    onChange={(e) => updateCreateForm('category_id', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    required
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Asset Name *</span>
                  <input
                    value={createForm.name}
                    onChange={(e) => updateCreateForm('name', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    placeholder="e.g. PROD-APP-SERVER-01"
                    required
                  />
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Environment</span>
                  <select
                    value={createForm.environment_id}
                    onChange={(e) => updateCreateForm('environment_id', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    <option value="">No environment</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Status</span>
                  <select
                    value={createForm.status}
                    onChange={(e) => updateCreateForm('status', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="deprecated">Deprecated</option>
                    <option value="decommissioned">Decommissioned</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Criticality</span>
                  <select
                    value={createForm.criticality}
                    onChange={(e) => updateCreateForm('criticality', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    <option value="">Select criticality</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Location</span>
                  <input
                    value={createForm.location}
                    onChange={(e) => updateCreateForm('location', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    placeholder="Datacenter / Cloud region"
                  />
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">IP Address</span>
                  <input
                    value={createForm.ip_address}
                    onChange={(e) => updateCreateForm('ip_address', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    placeholder="10.0.0.10"
                  />
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Hostname</span>
                  <input
                    value={createForm.hostname}
                    onChange={(e) => updateCreateForm('hostname', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    placeholder="app-server-01"
                  />
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Manufacturer</span>
                  <input
                    value={createForm.manufacturer}
                    onChange={(e) => updateCreateForm('manufacturer', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    placeholder="Dell / AWS / Microsoft"
                  />
                </label>

                <label className="text-sm">
                  <span className="block font-medium text-gray-700 mb-1">Model / Version</span>
                  <input
                    value={createForm.model}
                    onChange={(e) => updateCreateForm('model', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    placeholder="R650 / v2.3"
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="block font-medium text-gray-700 mb-1">Notes</span>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => updateCreateForm('notes', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  rows={3}
                  placeholder="Optional implementation or ownership notes..."
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  disabled={creatingAsset}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAsset}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {creatingAsset ? 'Saving...' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}

function AssetsPageFallback() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<AssetsPageFallback />}>
      <AssetsPageContent />
    </Suspense>
  );
}

interface VulnFinding {
  id: string;
  vulnerability_id: string;
  title: string;
  severity: string;
  source: string;
  standard?: string | null;
  cvss_score?: number | null;
  control_work_items_total?: number;
  control_work_items_open?: number;
}

/**
 * Color-coded vulnerability severity badges for an asset row.
 * Shows red/orange/yellow/blue dot-badges with open finding counts.
 * A green checkmark is shown when the asset has no open vulnerabilities.
 */
function VulnBadges({ asset }: { asset: Asset }) {
  const critical: number = asset.vuln_critical || 0;
  const high: number = asset.vuln_high || 0;
  const medium: number = asset.vuln_medium || 0;
  const low: number = asset.vuln_low || 0;
  const total: number = asset.vuln_total_open || 0;

  if (total === 0) {
    return <span className="inline-flex items-center text-green-600 text-xs font-medium gap-1">✅ Clean</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {critical > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-600 text-white" title="Critical open findings">
          🔴 {critical}
        </span>
      )}
      {high > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-orange-500 text-white" title="High open findings">
          🟠 {high}
        </span>
      )}
      {medium > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-400 text-gray-900" title="Medium open findings">
          🟡 {medium}
        </span>
      )}
      {low > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-400 text-white" title="Low open findings">
          🔵 {low}
        </span>
      )}
    </div>
  );
}

/**
 * Loads open vulnerability findings for a specific asset and renders a compact
 * summary grouped by severity, with links to the affected controls.
 */
function AssetVulnSummary({ assetId }: { assetId: string }) {
  const [findings, setFindings] = useState<VulnFinding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = { assetId, status: 'open', limit: 50 };
    vulnerabilitiesAPI.getAll(params as Parameters<typeof vulnerabilitiesAPI.getAll>[0])
      .then((res: any) => setFindings((res.data?.data?.findings || []) as VulnFinding[]))
      .catch(() => setFindings([]))
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return <div className="text-xs text-gray-400 animate-pulse">Loading…</div>;

  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
        <span className="text-green-600 text-lg">✅</span>
        <p className="text-sm text-green-700 font-medium">No open vulnerabilities found for this asset.</p>
      </div>
    );
  }

  // Group by severity
  const bySeverity: Record<string, VulnFinding[]> = {};
  for (const f of findings) {
    const sev = (f.severity || 'info').toLowerCase();
    if (!bySeverity[sev]) bySeverity[sev] = [];
    bySeverity[sev].push(f);
  }

  const severityConfig: Record<string, { label: string; icon: string; cls: string }> = {
    critical: { label: 'Critical', icon: '🔴', cls: 'bg-red-50 border-red-300 text-red-800' },
    high:     { label: 'High',     icon: '🟠', cls: 'bg-orange-50 border-orange-300 text-orange-800' },
    medium:   { label: 'Medium',   icon: '🟡', cls: 'bg-yellow-50 border-yellow-300 text-yellow-800' },
    low:      { label: 'Low',      icon: '🔵', cls: 'bg-blue-50 border-blue-300 text-blue-800' },
    info:     { label: 'Info',     icon: '⚪', cls: 'bg-gray-50 border-gray-300 text-gray-700' },
  };

  return (
    <div className="space-y-3">
      {['critical', 'high', 'medium', 'low', 'info']
        .filter((sev) => bySeverity[sev]?.length)
        .map((sev) => {
          const config = severityConfig[sev] || severityConfig.info;
          return (
            <div key={sev} className={`border rounded-lg p-3 ${config.cls}`}>
              <p className="text-xs font-semibold mb-2">
                {config.icon} {config.label} — {bySeverity[sev].length} finding{bySeverity[sev].length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1">
                {bySeverity[sev].slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{f.vulnerability_id} — {f.title}</p>
                      <p className="text-xs opacity-70">{f.source}{f.standard ? ` / ${f.standard}` : ''}{f.cvss_score ? ` • CVSS ${f.cvss_score}` : ''}</p>
                      {/* Applicable controls */}
                      {f.control_work_items_total != null && f.control_work_items_total > 0 && (
                        <p className="text-xs mt-0.5 opacity-80">
                          🔗 {f.control_work_items_open} open / {f.control_work_items_total} control impact item{f.control_work_items_total !== 1 ? 's' : ''}
                          {' — '}
                          <Link
                            href={`/dashboard/vulnerabilities?assetId=${encodeURIComponent(assetId)}&findingId=${encodeURIComponent(f.id)}`}
                            className="underline hover:opacity-80"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View controls →
                          </Link>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {bySeverity[sev].length > 5 && (
                  <p className="text-xs opacity-60">+{bySeverity[sev].length - 5} more</p>
                )}
              </div>
            </div>
          );
        })}
      <Link
        href={`/dashboard/vulnerabilities?assetId=${encodeURIComponent(assetId)}`}
        className="block text-center text-xs text-blue-600 hover:underline mt-1"
        onClick={(e) => e.stopPropagation()}
      >
        View all {findings.length} findings in Vulnerability Management →
      </Link>
    </div>
  );
}

function AssetDetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="bg-white border rounded-lg p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-1 break-words">{value || '-'}</div>
    </div>
  );
}
