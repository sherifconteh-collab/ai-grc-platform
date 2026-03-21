// @tier: enterprise
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { dataGovernanceAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RetentionPolicy {
  id: string;
  policy_name: string;
  data_category: string;
  retention_period_days: number;
  auto_delete_enabled: boolean;
  legal_basis: string | null;
  created_at: string;
}

interface LegalHold {
  id: string;
  hold_name: string;
  hold_reason: string;
  data_scope: string;
  status: string;
  created_at: string;
  released_at: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  released: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

function Badge({ text, colorMap }: { text: string; colorMap: Record<string, string> }) {
  const cls = colorMap[text] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>
      {text}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DataGovernancePage() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'policies' | 'holds'>('policies');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [policiesRes, holdsRes] = await Promise.all([
        dataGovernanceAPI.getPolicies().catch(() => ({ data: { data: [] } })),
        dataGovernanceAPI.getLegalHolds().catch(() => ({ data: { data: [] } })),
      ]);
      setPolicies(policiesRes.data?.data || []);
      setHolds(holdsRes.data?.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data governance info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔒 Data Governance</h1>
          <p className="text-gray-600 mt-1">
            Manage data retention policies, legal holds, and data sovereignty compliance.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            {([
              { key: 'policies' as const, label: 'Retention Policies' },
              { key: 'holds' as const, label: 'Legal Holds' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`py-2 px-1 border-b-2 text-sm font-medium ${
                  activeTab === key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">Loading data governance...</span>
          </div>
        )}

        {/* Retention Policies Tab */}
        {!loading && activeTab === 'policies' && (
          <div className="space-y-3">
            {policies.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No retention policies configured.</p>
                <p className="text-gray-400 text-sm mt-1">Define data retention policies to comply with regulatory requirements.</p>
              </div>
            ) : (
              policies.map((policy) => (
                <div key={policy.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{policy.policy_name}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Category: {policy.data_category} · Retention: {policy.retention_period_days} days
                        {policy.legal_basis && ` · Basis: ${policy.legal_basis}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${policy.auto_delete_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {policy.auto_delete_enabled ? 'Auto-delete ON' : 'Auto-delete OFF'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Legal Holds Tab */}
        {!loading && activeTab === 'holds' && (
          <div className="space-y-3">
            {holds.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No legal holds in place.</p>
              </div>
            ) : (
              holds.map((hold) => (
                <div key={hold.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{hold.hold_name}</h3>
                        <Badge text={hold.status} colorMap={STATUS_COLORS} />
                      </div>
                      <p className="text-sm text-gray-600">{hold.hold_reason}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Scope: {hold.data_scope} · Created: {new Date(hold.created_at).toLocaleDateString()}
                        {hold.released_at && ` · Released: ${new Date(hold.released_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
