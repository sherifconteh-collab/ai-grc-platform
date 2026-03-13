// @tier: community
'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { licenseAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
interface LicenseStatus {
  licensed: boolean;
  source?: string;
  licensee?: string;
  tier?: string;
  seats?: number;
  issuedAt?: number | null;
  expiresAt?: number | null;
  edition: string;
  isPro: boolean;
  isCommunity: boolean;
}

function formatDate(unix: number | null | undefined): string {
  if (!unix) return 'Never (perpetual)';
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    pro: 'bg-blue-100 text-blue-800',
    enterprise: 'bg-purple-100 text-purple-800',
    govcloud: 'bg-amber-100 text-amber-800',
    community: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${colors[tier] ?? colors.community}`}>
      {tier}
    </span>
  );
}

export default function LicensePage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Activate form
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState('');

  // Remove confirmation
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 4000);
  };

  const loadStatus = async () => {
    try {
      const res = await licenseAPI.getStatus();
      setStatus(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load license status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleActivate = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setActivateError('');
    if (!licenseKey.trim()) {
      setActivateError('Please enter a license key.');
      return;
    }
    setActivating(true);
    try {
      const res = await licenseAPI.activate(licenseKey.trim());
      showToast(res.data.message || 'License activated successfully!');
      setLicenseKey('');
      loadStatus();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to activate license key';
      setActivateError(msg);
      showToast(msg, 'error');
    } finally {
      setActivating(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await licenseAPI.remove();
      showToast(res.data.message || 'License removed.');
      setConfirmRemove(false);
      loadStatus();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to remove license', 'error');
    } finally {
      setRemoving(false);
    }
  };

  // Only admins should see this page
  if (user && user.role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          You do not have permission to manage licenses.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
              toastType === 'error' ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {toast}
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">License</h1>
          <p className="text-gray-600 mt-1">
            Activate a ControlWeave license key to unlock Pro or Enterprise features.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Current Status */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Current Status</h2>

            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div className="text-gray-500 font-medium">Edition</div>
              <div>
                <TierBadge tier={status?.edition ?? 'community'} />
              </div>

              <div className="text-gray-500 font-medium">Licensed</div>
              <div>
                {status?.licensed ? (
                  <span className="text-green-700 font-semibold">✓ Active</span>
                ) : (
                  <span className="text-gray-500">No license (Community Edition)</span>
                )}
              </div>

              {status?.licensed && (
                <>
                  <div className="text-gray-500 font-medium">Licensee</div>
                  <div className="text-gray-900">{status.licensee}</div>

                  <div className="text-gray-500 font-medium">Tier</div>
                  <div>
                    <TierBadge tier={status.tier ?? 'community'} />
                  </div>

                  <div className="text-gray-500 font-medium">Seats</div>
                  <div className="text-gray-900">
                    {status.seats === -1 ? 'Unlimited' : status.seats}
                  </div>

                  <div className="text-gray-500 font-medium">Issued</div>
                  <div className="text-gray-900">{formatDate(status.issuedAt)}</div>

                  <div className="text-gray-500 font-medium">Expires</div>
                  <div className="text-gray-900">{formatDate(status.expiresAt)}</div>

                  <div className="text-gray-500 font-medium">Source</div>
                  <div className="text-gray-600 capitalize">{status.source}</div>
                </>
              )}
            </div>

            {status?.licensed && (
              <div className="pt-4 border-t">
                {confirmRemove ? (
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-red-700">
                      Remove the active license and revert to Community Edition?
                    </p>
                    <button
                      onClick={handleRemove}
                      disabled={removing}
                      className="text-sm bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {removing ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      onClick={() => setConfirmRemove(false)}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemove(true)}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Remove license
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activate Form */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            {status?.licensed ? 'Replace License Key' : 'Activate License Key'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter the license key provided by ControlWeave. Contact{' '}
            <a
              href="mailto:contehconsulting@gmail.com"
              className="text-purple-600 hover:underline"
            >
              contehconsulting@gmail.com
            </a>{' '}
            to obtain a license.
          </p>

          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label htmlFor="licenseKey" className="block text-sm font-medium text-gray-700 mb-1">
                License Key
              </label>
              <textarea
                id="licenseKey"
                rows={3}
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="v1.eyJ….<hmac>"
                className="w-full px-4 py-2 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
              {activateError && (
                <p className="mt-1 text-sm text-red-600">{activateError}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={activating || !licenseKey.trim()}
                className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {activating ? 'Activating…' : 'Activate License'}
              </button>
              {licenseKey && (
                <button
                  type="button"
                  onClick={() => { setLicenseKey(''); setActivateError(''); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Info Box */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
          <p className="font-semibold mb-1">🔑 About License Keys</p>
          <ul className="list-disc list-inside space-y-1 text-purple-700">
            <li>License keys are cryptographically signed by ControlWeave.</li>
            <li>Activating a key immediately upgrades the running server edition.</li>
            <li>The key is stored securely in the database and applied automatically on restart.</li>
            <li>You can also set the <code className="bg-purple-100 px-1 rounded">LICENSE_KEY</code> environment variable for container-based deployments.</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
