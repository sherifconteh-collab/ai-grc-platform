// @tier: enterprise
'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { sbomAPI } from '@/lib/api';

type SbomAsset = {
  id: string;
  name: string;
  version?: string | null;
  category_code?: string | null;
  category_name?: string | null;
};

type SbomSummary = {
  id: string;
  sbom_format: string;
  spec_version?: string | null;
  file_name: string;
  uploaded_at: string;
  asset_id: string;
  asset_name: string;
  total_components: number;
  vulnerabilities_found: number;
  critical_vulnerabilities: number;
  high_vulnerabilities: number;
  license_issues: number;
  processed: boolean;
};

type SoftwareComponent = {
  id: string;
  name: string;
  version?: string | null;
  component_type?: string | null;
  known_vulnerabilities?: number | null;
  highest_severity?: string | null;
};

type ComponentVulnerability = {
  id: string;
  cve_id?: string | null;
  severity?: string | null;
  title?: string | null;
  finding_status?: string | null;
  component_name?: string | null;
};

type SbomDetail = {
  sbom: SbomSummary;
  components: SoftwareComponent[];
  componentVulnerabilities: ComponentVulnerability[];
};

function severityClass(value?: string | null) {
  switch ((value || '').toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function SbomPage() {
  const [assets, setAssets] = useState<SbomAsset[]>([]);
  const [sboms, setSboms] = useState<SbomSummary[]>([]);

  const [assetSearch, setAssetSearch] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [detail, setDetail] = useState<SbomDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId),
    [assets, selectedAssetId]
  );

  useEffect(() => {
    loadAssets();
    loadSboms();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAssets(assetSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [assetSearch]);

  async function loadAssets(search = '') {
    try {
      const response = await sbomAPI.getAssets({ search: search || undefined, limit: 200 });
      const list = response.data?.data?.assets;
      setAssets(Array.isArray(list) ? list : []);
    } catch (requestError) {
      console.error('Failed to load SBOM assets:', requestError);
    }
  }

  async function loadSboms() {
    try {
      setLoading(true);
      const response = await sbomAPI.getAll({ limit: 100, offset: 0 });
      const list = response.data?.data?.sboms;
      setSboms(Array.isArray(list) ? list : []);
    } catch (requestError: any) {
      console.error('Failed to load SBOM records:', requestError);
      setError(requestError.response?.data?.error || 'Failed to load SBOM records');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(sbomId: string) {
    try {
      setDetailLoading(true);
      const response = await sbomAPI.getById(sbomId);
      const payload = response.data?.data;
      if (payload?.sbom) {
        setDetail({
          sbom: payload.sbom,
          components: Array.isArray(payload.components) ? payload.components : [],
          componentVulnerabilities: Array.isArray(payload.componentVulnerabilities)
            ? payload.componentVulnerabilities
            : [],
        });
      }
    } catch (requestError) {
      console.error('Failed to load SBOM detail:', requestError);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setDetailLoading(false);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
  }

  async function onUpload(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!selectedAssetId) {
      setError('Select an asset before uploading SBOM.');
      return;
    }
    if (!selectedFile) {
      setError('Choose an SBOM file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('asset_id', selectedAssetId);
    formData.append('file', selectedFile);

    try {
      setUploading(true);
      const response = await sbomAPI.upload(formData);
      const payload = response.data?.data;
      setSuccessMessage(
        `SBOM processed for ${payload?.asset_name || selectedAsset?.name || 'asset'}: ${payload?.components_imported || 0} components, ${payload?.vulnerabilities_found || 0} findings.`
      );
      setSelectedFile(null);
      await loadSboms();
      if (payload?.sbom_id) {
        await openDetail(payload.sbom_id);
      }
    } catch (requestError: any) {
      console.error('SBOM upload failed:', requestError);
      setError(requestError.response?.data?.error || 'SBOM upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SBOM</h1>
          <p className="text-gray-600 mt-2">
            Import CycloneDX, SPDX, or SWID files to populate component inventory and vulnerability evidence.
          </p>
        </div>

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Link href="/dashboard/vulnerabilities"
            className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-xs">
            <span className="text-lg">🔍</span>
            <div><div className="font-medium text-red-800">Vulnerabilities</div><div className="text-red-600">Component CVEs &amp; SBOM findings</div></div>
          </Link>
          <Link href="/dashboard/assets"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span className="text-lg">🖥️</span>
            <div><div className="font-medium text-blue-800">Assets</div><div className="text-blue-600">Linked hardware &amp; software assets</div></div>
          </Link>
          <Link href="/dashboard/threat-intel"
            className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs">
            <span className="text-lg">🎯</span>
            <div><div className="font-medium text-orange-800">Threat Intelligence</div><div className="text-orange-600">NVD &amp; CISA KEV feed matching</div></div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span className="text-lg">📈</span>
            <div><div className="font-medium text-purple-800">AI Insights</div><div className="text-purple-600">Gap analysis &amp; risk heatmap</div></div>
          </Link>
        </div>

        <form onSubmit={onUpload} className="bg-white rounded-lg shadow-md p-5 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Upload SBOM</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-700">Asset</label>
              <input
                type="text"
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="Search assets"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
              />
              <select
                value={selectedAssetId}
                onChange={(event) => setSelectedAssetId(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                    {asset.version ? ` (${asset.version})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">SBOM File</label>
              <input
                type="file"
                onChange={onFileChange}
                accept=".json,.xml,.yaml,.yml,.spdx,.txt"
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
              />
              <button
                type="submit"
                disabled={uploading}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition disabled:opacity-50"
              >
                {uploading ? 'Processing...' : 'Upload and Process'}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}
        </form>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Recent SBOM Uploads</h2>
            <button
              type="button"
              onClick={loadSboms}
              className="px-3 py-1.5 text-sm border border-purple-600 text-purple-700 rounded hover:bg-purple-50"
            >
              Refresh
            </button>
          </div>
          {loading ? (
            <div className="px-5 py-12 text-center text-gray-500">Loading SBOM records...</div>
          ) : sboms.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Uploaded</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Asset</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Format</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Components</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Findings</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">License Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sboms.map((sbom) => (
                    <tr
                      key={sbom.id}
                      onClick={() => openDetail(sbom.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {sbom.uploaded_at ? format(new Date(sbom.uploaded_at), 'MMM d, yyyy HH:mm') : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{sbom.asset_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {sbom.sbom_format}
                        {sbom.spec_version ? ` ${sbom.spec_version}` : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{sbom.total_components || 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="font-medium">{sbom.vulnerabilities_found || 0}</span>
                        <span className="text-xs text-gray-500">
                          {' '}
                          ({sbom.critical_vulnerabilities || 0} critical, {sbom.high_vulnerabilities || 0} high)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{sbom.license_issues || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-gray-500">No SBOM uploads yet.</div>
          )}
        </div>

        {(detailLoading || detail) && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close SBOM detail"
              onClick={closeDetail}
            />
            <aside className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">SBOM Detail</p>
                  <h2 className="text-lg font-bold text-gray-900">
                    {detail?.sbom.file_name || 'Loading'}
                  </h2>
                </div>
                <button type="button" onClick={closeDetail} className="text-sm text-gray-600 hover:text-gray-900">
                  Close
                </button>
              </div>
              <div className="p-5 space-y-5">
                {detailLoading || !detail ? (
                  <div className="py-10 text-center text-gray-500">Loading detail...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MetricCard label="Components" value={detail.sbom.total_components || 0} />
                      <MetricCard label="Findings" value={detail.sbom.vulnerabilities_found || 0} />
                      <MetricCard label="Critical" value={detail.sbom.critical_vulnerabilities || 0} />
                      <MetricCard label="License Issues" value={detail.sbom.license_issues || 0} />
                    </div>

                    <section>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Components</h3>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {detail.components.length ? (
                          detail.components.map((component) => (
                            <div key={component.id} className="border rounded-md px-3 py-2 bg-gray-50">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900">
                                  {component.name}
                                  {component.version ? ` (${component.version})` : ''}
                                </p>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${severityClass(component.highest_severity)}`}>
                                  {(component.highest_severity || 'none').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Type: {component.component_type || '-'} | Known vulnerabilities: {component.known_vulnerabilities || 0}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No components parsed.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Component Vulnerabilities</h3>
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {detail.componentVulnerabilities.length ? (
                          detail.componentVulnerabilities.map((vulnerability) => (
                            <div key={vulnerability.id} className="border rounded-md px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900">
                                  {vulnerability.cve_id || vulnerability.title || 'Unspecified vulnerability'}
                                </p>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${severityClass(vulnerability.severity)}`}>
                                  {(vulnerability.severity || 'unknown').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Component: {vulnerability.component_name || '-'} | Status: {vulnerability.finding_status || '-'}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No vulnerabilities found for this SBOM.</p>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 border rounded-lg px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
