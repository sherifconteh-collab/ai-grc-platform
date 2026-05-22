// @tier: platform
'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

interface LicenseData {
  edition: string;
  isCommunity: boolean;
  isPro: boolean;
  licenseFingerprint: string | null;
  persistedViaEnv: boolean;
  persistedViaDb: boolean;
}

interface UpdateCheckData {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  updateRequired: boolean;
  minVersionRequired: string | null;
  releaseUrl: string;
  releaseName: string | null;
  releaseExcerpt: string | null;
  publishedAt: string | null;
  checkedAt: string;
  source: string;
}

function TierBadge({ edition }: { edition: string }) {
  const e = edition.toLowerCase();
  if (e === 'govcloud') {
    return <span className="px-3 py-1 rounded-full text-sm font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">GovCloud</span>;
  }
  if (e === 'enterprise') {
    return <span className="px-3 py-1 rounded-full text-sm font-bold bg-purple-100 text-purple-800 border border-purple-200">Enterprise</span>;
  }
  if (e === 'pro') {
    return <span className="px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800 border border-blue-200">Pro</span>;
  }
  return <span className="px-3 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-600 border border-gray-200">Community</span>;
}

export default function LicensePage() {
  const [license, setLicense] = useState<LicenseData | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckData | null>(null);
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [loadingUpdate, setLoadingUpdate] = useState(true);
  const [licenseError, setLicenseError] = useState('');

  // Activate license
  const [activateKey, setActivateKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState('');
  const [activateSuccess, setActivateSuccess] = useState('');

  // Generate community key
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    platformAdminAPI.getLicense()
      .then((res) => setLicense(res.data?.data ?? null))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setLicenseError(msg || 'Failed to load license information');
      })
      .finally(() => setLoadingLicense(false));

    platformAdminAPI.checkLicenseUpdate()
      .then((res) => setUpdateCheck(res.data?.data ?? null))
      .catch(() => {})
      .finally(() => setLoadingUpdate(false));
  }, []);

  async function handleActivate() {
    if (!activateKey.trim()) return;
    setActivating(true);
    setActivateError('');
    setActivateSuccess('');
    try {
      const res = await platformAdminAPI.activateLicense(activateKey.trim());
      const data = res.data?.data;
      setActivateSuccess(
        `License activated. Server is now running in ${(data?.edition ?? '').toUpperCase()} edition.` +
        (data?.warning ? ` Warning: ${data.warning}` : '')
      );
      setActivateKey('');
      const refreshed = await platformAdminAPI.getLicense();
      setLicense(refreshed.data?.data ?? null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setActivateError(msg || 'Failed to activate license');
    } finally {
      setActivating(false);
    }
  }

  async function handleGenerateCommunity() {
    setGenerating(true);
    setGenerateError('');
    setGeneratedKey('');
    try {
      const res = await platformAdminAPI.generateCommunityLicense();
      setGeneratedKey(res.data?.data?.licenseKey ?? '');
      const refreshed = await platformAdminAPI.getLicense();
      setLicense(refreshed.data?.data ?? null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGenerateError(msg || 'Failed to generate community license');
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">License Administration</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage the server license for this self-hosted ControlWeave installation.
          </p>
        </div>

        {licenseError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{licenseError}</div>
        )}

        {/* Current license status */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Current License</h2>
          {loadingLicense ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : license ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <TierBadge edition={license.edition} />
                <span className="text-sm text-gray-500">
                  {license.persistedViaEnv ? 'Source: environment variable' : license.persistedViaDb ? 'Source: database' : 'No license key configured'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edition</div>
                  <div className="mt-1 text-sm font-medium text-gray-900 capitalize">{license.edition}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fingerprint</div>
                  <div className="mt-1 text-sm font-mono text-gray-700">{license.licenseFingerprint ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Storage</div>
                  <div className="mt-1 text-sm text-gray-700">
                    {license.persistedViaEnv && <span className="text-blue-700">Env var</span>}
                    {license.persistedViaDb && !license.persistedViaEnv && <span className="text-green-700">Database</span>}
                    {!license.persistedViaEnv && !license.persistedViaDb && <span className="text-gray-400">None</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No license information available.</div>
          )}
        </div>

        {/* Activate license */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Activate License Key</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste a signed license key issued by ControlWeave. Pro, Enterprise, and GovCloud keys upgrade your server immediately without a restart.
          </p>
          {activateError && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{activateError}</div>
          )}
          {activateSuccess && (
            <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{activateSuccess}</div>
          )}
          <textarea
            value={activateKey}
            onChange={(e) => setActivateKey(e.target.value)}
            rows={4}
            placeholder="Paste your license key here (JWT format)…"
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
          />
          <button
            onClick={handleActivate}
            disabled={activating || !activateKey.trim()}
            className="mt-3 px-5 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {activating ? 'Activating…' : 'Activate License'}
          </button>
        </div>

        {/* Generate community key */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Generate Community License</h2>
          <p className="text-sm text-gray-500 mb-4">
            Self-hosted community installations can generate a free perpetual community license. No purchase required — this records your installation as a licensed community deployment.
          </p>
          {generateError && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{generateError}</div>
          )}
          {generatedKey && (
            <div className="mb-4 space-y-2">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                Store this key securely. It cannot be recovered from the server — only the public key is persisted for restart validation.
              </div>
              <div className="relative">
                <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-4 break-all whitespace-pre-wrap">{generatedKey}</pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 px-2 py-1 text-xs border border-gray-200 bg-white rounded hover:bg-gray-50"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          <button
            onClick={handleGenerateCommunity}
            disabled={generating}
            className="px-5 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating…' : 'Generate Free License'}
          </button>
        </div>

        {/* Update check */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Platform Update Check</h2>
          {loadingUpdate ? (
            <div className="text-sm text-gray-500">Checking for updates…</div>
          ) : updateCheck ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Installed Version</div>
                  <div className="mt-1 text-sm font-mono font-medium text-gray-900">v{updateCheck.currentVersion}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Latest Release</div>
                  <div className="mt-1 text-sm font-mono font-medium text-gray-900">
                    {updateCheck.latestVersion ? `v${updateCheck.latestVersion}` : 'Unknown'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</div>
                  <div className="mt-1">
                    {updateCheck.updateRequired ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 font-semibold border border-red-200">Update Required</span>
                    ) : updateCheck.updateAvailable ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200">Update Available</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 font-semibold border border-green-200">Up to Date</span>
                    )}
                  </div>
                </div>
              </div>
              {updateCheck.releaseName && (
                <div className="text-sm text-gray-600">
                  Latest release: <span className="font-medium">{updateCheck.releaseName}</span>
                  {updateCheck.publishedAt && (
                    <span className="text-gray-400 ml-2">({new Date(updateCheck.publishedAt).toLocaleDateString()})</span>
                  )}
                </div>
              )}
              {updateCheck.releaseExcerpt && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded p-3 whitespace-pre-wrap">{updateCheck.releaseExcerpt}</div>
              )}
              <a
                href={updateCheck.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-amber-700 hover:underline"
              >
                View releases on GitHub
              </a>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Update check is unavailable. Verify network access to GitHub.</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
